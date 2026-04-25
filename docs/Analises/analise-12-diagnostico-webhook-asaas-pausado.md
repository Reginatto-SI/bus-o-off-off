# Análise 12 — Diagnóstico do webhook Asaas pausado (produção)

## Escopo e limite desta análise

- Esta análise foi feita **sem alterar código**.
- Foi feita auditoria de contrato do webhook no repositório (edge function + migrações + docs técnicas já existentes).
- **Não houve acesso direto ao painel Asaas de produção nem ao banco de produção nesta execução**, então os “logs encontrados” abaixo são:
  1. logs/retornos previstos no código (fonte primária);
  2. evidências históricas já documentadas no próprio repositório (probes e auditorias anteriores).

---

## Resultado executivo

**Causa provável da fila pausada no Asaas (produção):**

1. O endpoint `asaas-webhook` possui ramos que retornam **não-2xx** por desenho de segurança/validação (`401`, `400`, `500`).
2. Em produção, os dois mais prováveis para “pausa de fila” são:
   - **`401 Invalid token`** (token enviado pelo Asaas não bate com o secret esperado do ambiente da venda);
   - **`400 Sale environment unresolved`** (evento chega com `externalReference` sem venda/ambiente resolvido no SmartBus).
3. Esses cenários podem ocorrer repetidamente e fazer o Asaas pausar a fila.

---

## 1) URL configurada no Asaas e função de destino

### O que foi validado no código

- A função existente no projeto é `supabase/functions/asaas-webhook/index.ts`.
- O `supabase/config.toml` declara `functions.asaas-webhook` com `verify_jwt = false` (correto para webhook externo), então a autenticação esperada é por token próprio do Asaas, não JWT Supabase.

### Conclusão

- O destino correto **deve** ser a edge function `asaas-webhook`.
- URL esperada operacionalmente: `https://<project-ref>.supabase.co/functions/v1/asaas-webhook`.
- Para confirmar 100% a URL atual do Asaas, é necessário checar o painel Asaas (fora do repositório).

---

## 2) Status HTTP retornado ao Asaas (mapeamento real do código)

### Retornos `2xx` (não pausam fila)

- `200` para eventos fora do escopo SmartBus (ex.: referência inválida/ausente).
- `200` para evento não suportado.
- `200` para evento duplicado (`asaas_event_id` já processado).
- `200` para `sale_not_found` em alguns ramos tratados.
- `200` para sucesso principal e para vários ramos de “ignorado/warning”.

### Retornos **não-2xx** (candidatos fortes a pausar fila)

- `400` quando `payment_environment` da venda não pode ser resolvido (`Sale environment unresolved`).
- `401` quando token do webhook é inválido (`Invalid token`).
- `500` quando o secret de token esperado não está configurado no ambiente da edge function.
- `400` para payload inválido sem `event/payment`.
- `500` para erro inesperado no `catch` final.

### Evidência histórica no próprio projeto

- Há diagnóstico registrado com probe retornando `401 Invalid token` para `asaas-webhook`, consistente com branch atual de autenticação.

---

## 3) Token/autenticação e ambiente produção/sandbox

## Como o webhook valida hoje

1. Extrai `sale_id` via `payment.externalReference` (incluindo caso `platform_fee_<sale_id>`).
2. Busca `sales.payment_environment` da venda.
3. Resolve o token esperado **somente** do ambiente resolvido (`production` ou `sandbox`) — modelo fail-closed.
4. Compara com header `asaas-access-token` (ou `x-asaas-webhook-token`).
5. Se divergir, retorna `401`.

### Risco prático de produção

- Se a fila do Asaas de **produção** estiver enviando token diferente do secret configurado em `ASAAS_WEBHOOK_TOKEN_PRODUCTION`, haverá rejeição contínua (`401`) e risco de pausa da fila.
- Se o evento chegar com referência que não resolve venda/ambiente, o fluxo retorna `400` antes do processamento.

---

## 4) Eventos de taxa manual `platform_fee_<sale_id>`

### Tratamento no webhook

- O webhook identifica prefixo `platform_fee_` e entra no fluxo dedicado `processPlatformFeeWebhook`.
- Para confirmação (`PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`) marca taxa como paga e responde `200`.
- Para falha da taxa, marca `platform_fee_status = failed` e também responde `200` (categoria warning).

### Conclusão

- O tratamento de `platform_fee_<sale_id>` existe e, por si só, tende a evitar pausa (respostas 200 na maior parte dos ramos do fluxo dedicado).
- O risco de pausa aqui fica mais ligado a falhas **antes** desse processamento (token/ambiente/payload), não ao branch funcional de taxa manual.

---

## 5) Logs e persistência em `sale_integration_logs`

### O que o código garante

- O webhook chama `persistIntegrationLog(...)` nos ramos principais de sucesso/erro/ignorado e também no `catch` final.
- `persistIntegrationLog(...)` grava em `sale_integration_logs` com:
  - `direction = incoming_webhook`;
  - `http_status`;
  - `processing_status`;
  - `result_category`;
  - `incident_code`/`warning_code`;
  - payload e response JSON.

### Limitação observável

- Se a escrita em `sale_integration_logs` falhar (constraint/indisponibilidade), a função de observabilidade só loga erro em console (`integration_log_insert_failed`), sem abortar necessariamente o webhook.

### Query operacional recomendada (produção)

```sql
select
  created_at,
  sale_id,
  company_id,
  event_type,
  payment_id,
  external_reference,
  http_status,
  processing_status,
  result_category,
  incident_code,
  warning_code,
  message
from public.sale_integration_logs
where provider = 'asaas'
  and direction = 'incoming_webhook'
  and created_at >= now() - interval '48 hours'
order by created_at desc;
```

Query para focar somente erros que podem pausar fila:

```sql
select
  http_status,
  processing_status,
  result_category,
  count(*) as total
from public.sale_integration_logs
where provider = 'asaas'
  and direction = 'incoming_webhook'
  and created_at >= now() - interval '48 hours'
  and http_status >= 400
group by 1,2,3
order by total desc;
```

---

## 6) Evidências consolidadas

1. **A função realmente responde 401 para token inválido** (`Invalid token`) e 400 para ambiente não resolvido.
2. **Existem registros históricos no repositório** de probes com `401 Invalid token` no endpoint `asaas-webhook`.
3. O fluxo de taxa manual `platform_fee_<sale_id>` está implementado e responde `200` nos caminhos esperados de negócio.
4. A trilha de auditoria em `sale_integration_logs` está prevista e acoplada ao webhook por função dedicada.

---

## 7) Causa provável (objetiva)

**Mais provável:** pausa da fila por repetição de respostas não-2xx em produção, principalmente:

- `401 Invalid token` (desalinhamento entre token do webhook configurado no Asaas e secret esperado na edge function do ambiente de produção);
- `400 Sale environment unresolved` (eventos com `externalReference` que não resolvem uma venda válida com `payment_environment` persistido).

---

## 8) Correção mínima recomendada (sem refatoração)

1. **Operação/configuração (prioridade 1):**
   - Confirmar no painel Asaas (produção) a URL do webhook para `.../functions/v1/asaas-webhook`.
   - Confirmar o token configurado no Asaas versus secret de produção da edge function.
2. **Validação rápida antes de reativar fila:**
   - Disparar evento de teste real do Asaas em produção e validar `http_status = 200` em `sale_integration_logs`.
3. **Se ainda houver pausa por 400/401:**
   - corrigir referência/token na origem (Asaas/checkout) primeiro;
   - só depois considerar ajuste de código para tornar ramos específicos idempotentes com 200 (quando não for falha de segurança).

---

## 9) É seguro reativar a fila no Asaas?

**Resposta curta:** **sim, condicionalmente**.

Reativar é seguro **se, antes**, forem confirmados estes 4 pontos:

1. URL correta para `asaas-webhook` em produção.
2. Token de produção alinhado entre Asaas e secret da edge function.
3. Últimos eventos de teste com `HTTP 200`.
4. `sale_integration_logs` registrando os eventos com `direction = incoming_webhook`.

Se qualquer um dos itens acima falhar, reativar sem ajuste tende a pausar novamente.

---

## Checklist operacional objetivo (para execução no ambiente de produção)

- [ ] Conferir URL do webhook no painel Asaas (produção).
- [ ] Conferir token do webhook no painel Asaas (produção).
- [ ] Conferir secret correspondente no projeto Supabase de produção.
- [ ] Enviar 1 evento real de teste e verificar retorno HTTP.
- [ ] Consultar `sale_integration_logs` nas últimas 48h e medir taxa de 4xx/5xx.
- [ ] Só então reativar fila pausada.

