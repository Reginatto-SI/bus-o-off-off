# Relatório de Auditoria — Ambiente Asaas (Sandbox vs Produção)

## 1. Resumo executivo

- O fluxo atual **tem uma arquitetura parcialmente centralizada e melhor que heurística dispersa**, mas ainda depende de um gatilho inicial por host para decidir ambiente em `create-asaas-payment`.
- Depois da criação, o sistema tenta operar de forma determinística via `sales.payment_environment` (webhook, verify, platform fee e reconciliação leem da venda).
- **Confiabilidade atual: média**.
- **Risco geral: médio**.
- Ambiguidades críticas identificadas:
  1. `payment_environment` é `text` sem constraint de enum/check (`production|sandbox`) no banco;
  2. a decisão inicial por host depende de headers (`origin/referer/x-forwarded-host/host`) e qualquer host fora da allowlist cai em sandbox;
  3. existe fallback implícito no resolver para `sandbox` quando não há ambiente na venda e não há request.

---

## 2. Fonte atual da decisão de ambiente

### 2.1 Regra oficial de ambiente

A regra central está em `runtime-env.ts`:

- Hosts de produção: `smartbusbr.com.br`, `www.smartbusbr.com.br` → `production`.
- Qualquer outro host → `sandbox`.
- O host é extraído dos headers (prioridade: `origin`, `referer`, `x-forwarded-host`, `host`).

### 2.2 Onde essa regra é aplicada

- **Decisão inicial de venda**: `create-asaas-payment` chama `resolvePaymentContext({ mode: "create", request, sale, company })`, que usa host se a venda ainda não tiver ambiente válido.
- **Persistência**: após criar cobrança Asaas, grava `sales.payment_environment`.
- **Demais fluxos**:
  - `verify-payment-status`: lê ambiente da venda e resolve contexto com `mode: "verify"`;
  - `asaas-webhook`: busca `payment_environment` da venda antes de validar token e processar;
  - `create-platform-fee-checkout`: usa ambiente da venda (`mode: "platform_fee"`);
  - `reconcile-sale-payment`: apenas reconcilia com base na venda já persistida.

### 2.3 Observação importante

Existe endpoint de apoio (`get-runtime-payment-environment`) e hook frontend (`useRuntimePaymentEnvironment`) para mostrar ambiente operacional no header administrativo. Isso é **indicador visual/operacional**, não fonte decisória do backend para uma venda específica.

---

## 3. Mapa do fluxo ponta a ponta

1. **Checkout público inicia compra**
   - frontend cria registro em `sales` com status `pendente_pagamento`;
   - nesse insert, não define `payment_environment` explicitamente (o banco aplica default atual).

2. **Criação de pagamento Asaas**
   - frontend chama edge `create-asaas-payment` com `sale_id`;
   - função resolve ambiente via `resolvePaymentContext` (usa venda se houver ambiente válido; senão host);
   - seleciona base URL/credenciais por ambiente;
   - cria cobrança no Asaas;
   - grava `asaas_payment_id`, `asaas_payment_status`, `payment_method`, `payment_environment` na venda.

3. **Webhook Asaas**
   - recebe `externalReference` e extrai `sale_id`;
   - busca `payment_environment` da venda;
   - se ambiente não estiver resolvido, rejeita webhook (`400`);
   - valida token **somente** do ambiente resolvido;
   - processa confirmação/falha e atualiza venda.

4. **Verify / polling / confirmação**
   - frontend (`Confirmation` e `TicketLookup`) chama `verify-payment-status` periodicamente e manualmente;
   - verify lê `sale.payment_environment` e consulta Asaas no base URL daquele ambiente;
   - se confirmado, finaliza venda e gera tickets.

5. **Reconciliação manual**
   - `reconcile-sale-payment` não recalcula ambiente por host; opera no estado persistido da venda para corrigir inconsistências operacionais (ex.: pago sem ticket).

---

## 4. Evidências encontradas no código

### Backend / Edge Functions

- Decisão por host e mapeamento de secrets/base URL:
  - `supabase/functions/_shared/runtime-env.ts`
- Resolvedor central de contexto (fonte usada por create/verify/webhook/platform fee):
  - `supabase/functions/_shared/payment-context-resolver.ts`
- Persistência do ambiente na criação da cobrança:
  - `supabase/functions/create-asaas-payment/index.ts`
- Webhook exige ambiente da venda e valida token por ambiente:
  - `supabase/functions/asaas-webhook/index.ts`
- Verify usa ambiente da venda para reconsulta Asaas:
  - `supabase/functions/verify-payment-status/index.ts`
- Platform fee checkout usa ambiente salvo na venda:
  - `supabase/functions/create-platform-fee-checkout/index.ts`
- Reconciliação administrativa usa estado da venda e rotina compartilhada:
  - `supabase/functions/reconcile-sale-payment/index.ts`

### Frontend

- Checkout cria venda e chama `create-asaas-payment`:
  - `src/pages/public/Checkout.tsx`
- Confirmação faz polling + chamadas de verify:
  - `src/pages/public/Confirmation.tsx`
- Busca de passagem (`TicketLookup`) também chama verify para atualizar status:
  - `src/pages/public/TicketLookup.tsx`
- Indicador de ambiente no header administrativo:
  - `src/hooks/use-runtime-payment-environment.ts`
  - `src/components/layout/AdminHeader.tsx`

### Banco / estrutura

- Coluna `sales.payment_environment` criada como `text NOT NULL DEFAULT 'sandbox'`.
- Colunas Asaas em `sales`, `companies`, `partners` existem e foram evoluídas para separar produção/sandbox.
- `sale_integration_logs` existe para rastrear requisições/webhooks, porém sem coluna explícita `payment_environment` própria.

---

## 5. Resposta objetiva às dúvidas principais

## A) Como o sistema sabe que está em Sandbox ou Produção?

**Confirmado por código**

- Regra oficial está em `resolveEnvironmentFromHost` (`runtime-env.ts`), baseada em host.
- Produção apenas para `smartbusbr.com.br` e `www.smartbusbr.com.br`.
- Todo host diferente disso cai em sandbox.

**Risco objetivo**

- Se host chegar inesperado (proxy/header/domínio alternativo), a decisão inicial cai em sandbox.

## B) Onde a decisão acontece pela primeira vez?

**Confirmado por código**

- O “primeiro martelo” da venda acontece no **backend**, em `create-asaas-payment`.
- A venda nasce no frontend antes disso, mas sem ambiente explicitamente definido no insert.
- O ambiente efetivo de pagamento é gravado na venda quando a cobrança Asaas é criada.

## C) A venda/passagem fica gravada com campo de ambiente?

**Confirmado por código**

- Sim: `sales.payment_environment` existe.
- É `NOT NULL` com default `sandbox`.
- `create-asaas-payment` atualiza explicitamente com ambiente resolvido.

**Fragilidade confirmada**

- Tipo é `text`, sem constraint para restringir valores válidos (`production`/`sandbox`).

## D) Como o webhook sabe em qual ambiente processar?

**Confirmado por código**

- Webhook usa a mesma URL da function para todos os eventos.
- Distingue ambiente pelo `sale_id` (via `externalReference`) e lookup de `sales.payment_environment`.
- Sem ambiente resolvido, rejeita o evento.
- Token validado somente contra secret do ambiente resolvido.

**Risco residual**

- Se `externalReference` não vincular corretamente a venda (ou venda sem ambiente válido), evento não processa.

## E) Como verify-payment-status sabe ambiente?

**Confirmado por código**

- Lê `payment_environment` da venda e resolve contexto por `mode: "verify"`.
- Não recalcula por host nesse caminho.

**Conclusão**

- Verify está alinhado com a ideia de fonte de verdade por venda.

## F) Mesma regra em todos os pontos?

**Parcialmente**

- Há centralização via `resolvePaymentContext` e `runtime-env`.
- Contudo, existem dois momentos conceitualmente distintos:
  1. decisão inicial (host) em create;
  2. decisão derivada da venda persistida (verify/webhook/platform fee/reconcile).

**Não foi identificado** uso de `request.url` ou `window.location` para decidir ambiente no backend de cobrança.

## G) Existe ambiguidade perigosa hoje?

**Sim, algumas relevantes:**

1. `payment_environment` sem constraint de domínio.
2. fallback de `resolvePaymentContext` para `sandbox` quando não há venda/request (modo `fallback`).
3. decisão inicial ainda depende de headers de host.
4. variável `allowLegacyVerifyFallback` está presente em verify, mas não participa de fluxo efetivo (sinal de dívida técnica/ambiguidade de intenção).

## H) O banco é fonte de verdade hoje?

**Na prática, sim para ciclo pós-criação**

- webhook/verify/platform-fee/reconciliação se baseiam na venda.

**Mas incompleto estruturalmente**

- por não ter constraint estrita no campo e por depender da gravação correta em create.

## I) Há inconsistência entre frontend e backend?

**Possível como percepção operacional, não necessariamente como decisão da venda**

- Front usa endpoint/hook para exibir badge sandbox (com fallback por host local se endpoint falhar).
- Backend da venda decide no create e persiste na sale.
- Portanto, pode haver cenário de UI sugerir um ambiente e uma venda específica já estar persistida em outro (ex.: reuso de venda antiga, dados legados, operação cruzada).

## J) Há rastreabilidade suficiente para diagnóstico futuro?

**Boa, mas não completa**

- Existe rastreio em `sale_logs` e `sale_integration_logs` com `sale_id`, eventos e payload/response.
- A venda mantém `asaas_payment_id`, `asaas_payment_status`, `payment_environment`.

**Lacunas**

- `sale_integration_logs` não tem coluna dedicada para `payment_environment`.
- Não há vínculo explícito persistido da chave/secreto usado (apenas inferência por ambiente e logs estruturados).
- Sem constraint de ambiente, auditoria depende de disciplina de código e logs.

---

## 6. Ambiguidades, fragilidades e riscos

1. **Dependência inicial de host/header**
   - Qualquer host fora da allowlist = sandbox.
   - Operacionalmente sensível a domínio alternativo, proxy ou configuração incorreta.

2. **Modelo de dados permissivo para ambiente**
   - `payment_environment` em `text` sem check enum.
   - Risco de valor inválido em inserções administrativas/scripts.

3. **Fallback interno para sandbox no resolver**
   - Se chamada sem venda e sem request, contexto assume sandbox.
   - É um comportamento implícito que pode mascarar configuração ausente.

4. **Sinal de comportamento legado em verify**
   - Flag `ASAAS_VERIFY_ALLOW_LEGACY_FALLBACK` é lida mas não afeta execução atual.
   - Isso gera ambiguidade entre intenção e comportamento real.

5. **Rastreabilidade parcial do ambiente em logs de integração**
   - O ambiente aparece em logs estruturados de console, mas não como coluna dedicada em `sale_integration_logs`.

---

## 7. Lacunas de rastreabilidade

- Não há coluna explícita `payment_environment` em `sale_integration_logs`.
- Não há persistência explícita de qual secret específico foi usado (apenas possível inferir por ambiente + convenção de nomes).
- Não há evidência no banco de “host detectado” no momento da decisão inicial; fica apenas em logs runtime.

---

## 8. Conclusão técnica

- O fluxo atual é **razoavelmente consistente após a criação da cobrança**, porque usa `sales.payment_environment` como referência principal.
- A arquitetura **ainda não é totalmente robusta** por depender de host/header para decisão inicial e por não blindar o campo de ambiente com constraint de domínio.
- Maiores vulnerabilidades conceituais:
  1. entrada inicial baseada em host;
  2. modelo de dados permissivo (`text` sem check);
  3. rastreabilidade de ambiente distribuída entre logs e estado da venda, sem coluna dedicada em logs de integração.

---

## 9. Recomendações posteriores (sem implementar agora)

### Crítica
1. Blindar `sales.payment_environment` com constraint/check (ou enum) aceitando apenas `production|sandbox`.
2. Persistir também o `host_detected` (ou origem de decisão) no momento da criação para auditoria forense.

### Importante
3. Remover/encerrar caminhos e flags legadas ambíguas (ex.: fallback verify não utilizado).
4. Adicionar `payment_environment` em `sale_integration_logs` para consultas operacionais sem depender de parsing de payload.

### Desejável
5. Expor em telas administrativas (consulta de venda) o ambiente persistido da venda como dado oficial de suporte.
6. Criar checklist operacional para evitar uso de domínios não-oficiais em fluxos que devam nascer em produção.

---

## Notas de comprovação

- **Confirmado por código:** todos os pontos acima marcados como “confirmado”.
- **Provável:** não foram identificados caminhos paralelos relevantes fora dos arquivos auditados, mas não foi executado tráfego real contra ambiente Supabase/Asaas neste passo.
- **Não comprovado nesta auditoria estática:** configuração externa real de DNS/proxy, secrets vigentes e histórico real de registros já persistidos em produção.
