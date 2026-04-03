# Análise completa do erro “Sale environment unresolved” no webhook Asaas de produção

## 1. Resumo executivo

- **Causa mais provável:** o `asaas-webhook` está rejeitando com `400` eventos que chegam sem `payment.externalReference` (ou com referência não vinculável a uma venda SmartBus) **antes** da etapa de “evento suportado/ignorado”, porque a função tenta resolver `payment_environment` primeiro e exige `sale_id` válido para isso.
- **Impacto:** eventos externos à venda SmartBus (ex.: cobrança da conta Asaas que não nasceu no fluxo do sistema) entram em loop de retry no Asaas e penalizam/pausam a fila de webhook de produção.
- **Risco atual:** médio/alto operacional (fila pausada, atraso de eventos úteis). Risco funcional do checkout atual parece baixo, pois o fluxo de criação SmartBus define `externalReference` e persiste `payment_environment`.

## 2. Evidências encontradas

### 2.1 Arquivos/funções analisadas

- `supabase/functions/asaas-webhook/index.ts`
- `supabase/functions/create-asaas-payment/index.ts`
- `supabase/functions/verify-payment-status/index.ts`
- `supabase/functions/_shared/payment-context-resolver.ts`
- `supabase/functions/create-asaas-account/index.ts`
- `supabase/functions/create-platform-fee-checkout/index.ts`

### 2.2 Como o ambiente é resolvido hoje

1. **Resolvedor compartilhado (`resolvePaymentContext`)** prioriza:
   - `sale.payment_environment`
   - depois `requestedEnvironment`
   - host apenas se `allowHostFallback` for explicitamente permitido
   - caso contrário lança `payment_environment_unresolved`

   Evidência: `supabase/functions/_shared/payment-context-resolver.ts:215-251`.

2. **No webhook (`asaas-webhook`)**, a função **não** usa host para inferir ambiente. Ela tenta obter `saleEnv` via banco com base no `externalReference` (UUID da venda ou `platform_fee_<uuid>`).

   Evidência: `supabase/functions/asaas-webhook/index.ts:203-213`, `244-248`.

3. Se não conseguir `saleEnv`, retorna imediatamente:
   - HTTP `400`
   - `{ "error": "Sale environment unresolved", "external_reference": ... }`

   Evidência: `supabase/functions/asaas-webhook/index.ts:215-241`.

### 2.3 Como a venda é localizada hoje

- `create-asaas-payment` cria cobrança Asaas com `externalReference: sale.id`.
  - Evidência: `supabase/functions/create-asaas-payment/index.ts:996-1003`.
- Após criar cobrança, persiste `asaas_payment_id` e `payment_environment` em `sales`.
  - Evidência: `supabase/functions/create-asaas-payment/index.ts:1128-1135`.
- Taxa de plataforma usa `externalReference: platform_fee_<sale.id>`.
  - Evidência: `supabase/functions/create-platform-fee-checkout/index.ts` (corpo do `POST /payments`).
- No webhook, venda é buscada por `saleId = externalReference` após passar da validação de ambiente.
  - Evidência: `supabase/functions/asaas-webhook/index.ts:369`, `519+`.

### 2.4 Dependências investigadas (pergunta 2)

- `externalReference`: **sim, crítico no webhook** para derivar `sale_id` e ambiente (`asaas-webhook/index.ts:203-213`).
- `sales.payment_environment`: **sim, crítico** para liberar processamento (`asaas-webhook/index.ts:209-241`).
- `asaas_payment_id`: **não é usado para resolver ambiente no webhook** (é usado em verify/observabilidade e finalização).
- `company_id`: **não resolve ambiente no webhook**; entra depois de encontrar venda.
- host/url: **não no webhook atual** (sem `allowHostFallback`), alinhado à diretriz.
- fallback implícito: **não há fallback permissivo** quando ambiente não resolve; falha explícita `400`.

### 2.5 Filtro de eventos Asaas

- `create-asaas-account` configura webhook com eventos amplos, incluindo `PAYMENT_CREATED`, `PAYMENT_UPDATED`, `PAYMENT_RESTORED`.
  - Evidência: `supabase/functions/create-asaas-account/index.ts:194-203`.
- `asaas-webhook` processa como suportados apenas:
  - `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_REFUNDED`
  - outros seriam `ignored` **com 200**.
  - Evidência: `supabase/functions/asaas-webhook/index.ts:370-405`.
- Porém esse “ignored 200” ocorre **depois** da validação de ambiente. Se não houver `externalReference`/venda, ele falha antes com `400`.
  - Evidência: ordem em `asaas-webhook/index.ts:215-241` antes de `370-405`.

### 2.6 Convergência webhook x verify-payment-status

- Há convergência de finalização: ambos usam `finalizeConfirmedPayment`.
  - Evidência: `asaas-webhook/index.ts` (função `processPaymentConfirmed`) e `verify-payment-status/index.ts:411-420`.
- `verify-payment-status` também depende de `sale.payment_environment` resolvível; se inválido/ausente, retorna `409 payment_environment_unresolved`.
  - Evidência: `verify-payment-status/index.ts:262-294`.

## 3. Hipóteses validadas e descartadas

### 3.1 Validadas

1. **O erro `Sale environment unresolved` nasce no próprio webhook** quando `saleEnv` não é obtido.
2. **A resolução de ambiente no webhook depende de referência de venda persistida** (`externalReference` => `sales.payment_environment`).
3. **Não há inferência por host/url no webhook atual**.
4. **Existe cenário legítimo de evento Asaas sem vínculo SmartBus** (ex.: cobrança externa na mesma conta) que hoje gera `400`.
5. **Fluxos SmartBus principais de criação de cobrança setam `externalReference`** (`sale.id` ou `platform_fee_<sale.id>`).

### 3.2 Não comprovadas / descartadas parcialmente

1. **“Checkout SmartBus está criando cobrança sem externalReference”**: não há evidência no `create-asaas-payment` e `create-platform-fee-checkout` analisados.
2. **“Mistura sandbox/produção por host fallback no webhook”**: não há evidência no código atual.

### 3.3 Ambiguidades que permanecem

1. Não é possível confirmar só por código se, em produção Asaas, o webhook está apontado para uma conta que também gera cobranças não SmartBus.
2. Não é possível confirmar só por código se existe outro produtor interno/externo criando cobranças nessa conta sem `externalReference` SmartBus.

## 4. Diagnóstico final

O `400 Sale environment unresolved` ocorreu porque o payload recebido tinha `payment.externalReference = null` e o webhook exige ambiente derivado de venda antes de qualquer outra triagem.

Na prática:

- `externalReference` nulo → não há `sale_id` válido
- sem `sale_id` → `getSaleEnvironment` não resolve `payment_environment`
- sem ambiente resolvido → retorno imediato `400`

Isso indica **com alta probabilidade** evento fora do fluxo SmartBus (ou sem vínculo de venda SmartBus), não necessariamente falha do checkout principal. O payload específico (`PAYMENT_CREATED`, `subscription`, descrição não relacionada ao domínio) reforça essa leitura, mas essa parte é inferência contextual; o que está comprovado no código é que ausência de vínculo causa rejeição 400.

## 5. Plano de correção mínima segura

### Etapa 1 — Blindagem de triagem no webhook (sem alterar arquitetura)

- Reordenar validação inicial no `asaas-webhook` para classificar eventos sem vínculo SmartBus como **ignorados com 200** (com log/incident code), ao invés de 400.
- Critério conservador: quando `externalReference` ausente ou não compatível com padrão de venda SmartBus (`uuid` ou `platform_fee_uuid`), responder `received=true, ignored=true`.

### Etapa 2 — Garantia de observabilidade/auditoria

- Manter gravação em `sale_integration_logs` com `sale_id=null`, `incident_code` específico (ex.: `webhook_event_outside_smartbus_scope`), incluindo `eventType`, `paymentId`, `externalReference`, `account.id` do payload.
- Preservar logs estruturados com etapa/contexto/ambiente (quando houver ambiente) e motivo de ignorar.

### Etapa 3 — Ajuste operacional no Asaas

- Revisar configuração do webhook da conta de produção para reduzir ruído:
  - validar escopo da conta (se usada por outras cobranças)
  - revisar lista de eventos assinados
- Mesmo com ajuste no Asaas, manter blindagem do handler para evitar novas pausas por eventos externos inevitáveis.

## 6. Riscos de regressão

1. **Checkout:** baixo risco se a mudança ficar restrita ao tratamento de eventos sem vínculo; criação de cobrança (`create-asaas-payment`) não precisa mudar.
2. **Webhook de vendas válidas:** baixo/médio se condição de “evento externo” for mal definida; por isso precisa usar critério estrito e auditável.
3. **Confirmação de pagamento (`verify-payment-status`):** baixo risco, pois fluxo já é por `sale_id` explícito e continua convergindo na mesma finalização compartilhada.
4. **Observabilidade:** risco de perder sinais se ignorar sem log; mitigado com `sale_integration_logs` + incident code dedicado.

## 7. Recomendação final

**Recomendação combinada (mais segura):**

1. **Ajuste no handler para ignorar com 200 eventos fora do escopo SmartBus** (principal para parar penalização da fila).
2. **Ajuste de configuração do webhook no Asaas** para reduzir entrada de eventos não SmartBus.
3. **Sem evidência atual para priorizar correção de criação sem externalReference** nos fluxos analisados (`create-asaas-payment` e `create-platform-fee-checkout` já enviam referência), mas vale monitorar com logs por incidente.

---

## Conclusão objetiva

O ponto exato de falha está na ordem da validação do `asaas-webhook`: a função exige resolução de ambiente por venda **antes** de tratar “evento não suportado/sem vínculo”. Para payloads externos (como o recebido em 2026-04-01), isso produz `400` e alimenta retries do Asaas. A menor correção segura é tratar esses casos como `ignored` com `200` e trilha de auditoria, sem mexer no fluxo principal de checkout/confirmação.
