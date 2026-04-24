# Análise 5 — Blindagem operacional mínima pós correções Asaas

## 1. O que foi adicionado

1. **Centralização de logs críticos** em helper reutilizável (`logCriticalPaymentIssue`) para incidentes:
   - `sale_update_after_gateway_payment_failed`
   - `payment_confirmed_ticket_generation_failed`

2. **Proteção mínima de retry** no fluxo de finalização para garantir que o retry de ticket rode no máximo uma vez por execução.

3. **Log explícito de fallback sem snapshot** em webhook/verify com marcador:
   - `financial_snapshot_source=dynamic_recalculation`
   - motivo: `snapshot_not_found_on_sale`

4. **Validação leve pós-confirmação** no final de `finalizeConfirmedPayment` (checagem de consistência status/tickets com reforço de log sem alterar fluxo).

---

## 2. Onde foi aplicado

- `supabase/functions/_shared/payment-observability.ts`
  - novo helper `logCriticalPaymentIssue`.

- `supabase/functions/create-asaas-payment/index.ts`
  - uso de `logCriticalPaymentIssue` no caso de falha de persistência após criação da cobrança.

- `supabase/functions/_shared/payment-finalization.ts`
  - guarda local anti-retry múltiplo no mesmo ciclo;
  - uso de `logCriticalPaymentIssue` quando pagamento confirma sem ticket após retry;
  - validação leve pós-confirmação com reforço de log.

- `supabase/functions/asaas-webhook/index.ts`
  - log explícito quando não há snapshot congelado e ocorre recálculo dinâmico.

- `supabase/functions/verify-payment-status/index.ts`
  - log explícito quando não há snapshot congelado e ocorre recálculo dinâmico.

---

## 3. Quais riscos agora estão cobertos

1. **Risco de leitura inconsistente dos incidentes críticos**
   - agora há padrão único de erro crítico com `error_code` e contexto mínimo (`sale_id`, `company_id`, `payment_environment`).

2. **Risco de retry repetido no mesmo ciclo de finalização**
   - guarda local impede repetição de retry dentro da mesma execução.

3. **Risco de baixa visibilidade em vendas legadas sem snapshot**
   - fallback dinâmico passou a ser explicitamente rastreável nos logs.

4. **Risco de falha pós-confirmação sem reforço operacional**
   - validação leve adiciona trilha adicional de inconsistência sem mudar regra de negócio.

---

## 4. O que ainda NÃO está coberto

1. **Automação de alerta em tempo real** (somente estrutura pronta de log; sem monitor externo novo).
2. **Backfill retroativo completo** de snapshot para todo histórico legado.
3. **Orquestração assíncrona avançada** (fila/dead-letter/reprocessamento automático global).

---

## 5. Recomendação de próximos passos (sem implementar)

1. Criar alerta operacional para `logCriticalPaymentIssue` em incidentes críticos.
2. Planejar backfill seguro de snapshot para vendas legadas com maior risco financeiro.
3. Adicionar testes automatizados de regressão para:
   - erro crítico de persistência pós-cobrança,
   - retry único de ticket por execução,
   - fallback dinâmico sem snapshot com log obrigatório.
