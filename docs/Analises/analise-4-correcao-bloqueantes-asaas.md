# Análise 4 — Correção dos bloqueantes críticos Asaas

## 1. Resumo das correções aplicadas

Foram aplicadas correções mínimas e localizadas para os 3 bloqueantes críticos definidos na Análise 3:

1. **Persistência do `asaas_payment_id`** agora é tratada como etapa crítica após criação da cobrança.
2. **Pagamento confirmado sem ticket** agora executa **retry imediato de geração de tickets** e registra estado crítico rastreável se falhar novamente.
3. **Snapshot financeiro do split** foi **congelado na criação da cobrança** e passou a ser reutilizado por webhook/verify.

Nenhuma tela nova, fluxo paralelo de pagamento ou refatoração ampla foi criada.

---

## 2. Arquivos alterados

- `supabase/functions/create-asaas-payment/index.ts`
- `supabase/functions/_shared/payment-finalization.ts`
- `supabase/functions/asaas-webhook/index.ts`
- `supabase/functions/verify-payment-status/index.ts`
- `supabase/migrations/20260424120000_add_sales_split_snapshot_asaas.sql`

---

## 3. Como cada bloqueante foi tratado

### Bloqueante 1 — Garantir persistência do `asaas_payment_id`

**Problema:** cobrança criada no gateway e update local da venda podia falhar sem bloquear retorno de sucesso.

**Correção aplicada:**
- O update final em `sales` passou a validar erro explicitamente.
- Em falha de persistência:
  - registra evento operacional crítico;
  - registra log de integração com incidente;
  - registra trace técnico com `sale_id`, `company_id`, `asaas_payment_id`, `payment_environment`, erro;
  - retorna erro HTTP 500 com `error_code` explícito (`sale_update_after_gateway_payment_failed`).

**Resultado:** não há mais sucesso “silencioso” quando a cobrança existe no Asaas e a venda local não foi atualizada.

---

### Bloqueante 2 — Reduzir risco de venda paga sem ticket

**Problema:** finalização podia terminar em estado inconsistente (`pago` sem ticket) sem tentativa imediata de recuperação.

**Correção aplicada:**
- Em `finalizeConfirmedPayment`, quando detectar ausência de tickets após confirmação:
  - mantém log inconsistente já existente;
  - executa **retry imediato** de `createTicketsFromPassengersShared`;
  - se recuperar, registra ação de recuperação (`payment_finalize_recovered_after_ticket_retry`) e conclui com sucesso;
  - se continuar sem ticket, grava `sale_log` crítico com ação manual recomendada (`reconcile-sale-payment`).

**Resultado:** diminui dependência de reconciliação manual para falhas transitórias e aumenta rastreabilidade quando realmente não recupera.

---

### Bloqueante 3 — Congelar snapshot financeiro do split

**Problema:** webhook/verify podiam recalcular financeiro com percentuais atuais da empresa, divergindo do split enviado na criação da cobrança.

**Correção aplicada:**
- Nova migration adiciona colunas de snapshot em `sales`:
  - percentuais congelados (plataforma/sócio/representante)
  - valores congelados (`platform_fee_total`, `socio_fee_amount`, `platform_net_amount`)
  - metadados de origem e timestamp de captura.
- `create-asaas-payment` persiste snapshot financeiro junto com `asaas_payment_id`.
- `asaas-webhook` e `verify-payment-status` passaram a **reutilizar snapshot congelado** quando disponível.
- Recalculo por configuração atual permanece apenas para legado sem snapshot.

**Resultado:** reduz risco de divergência entre split enviado ao Asaas, venda e ledger em mudanças posteriores de configuração.

---

## 4. O que não foi alterado

- Não foram criadas telas, componentes ou novos fluxos de UX.
- Não foi alterada regra de comissão do representante (permanece 1/3 da taxa da plataforma).
- Não houve mudança na política de webhook prioritário + verify fallback.
- Não foi implementada arquitetura nova de filas/event bus.

---

## 5. Riscos remanescentes

1. Vendas legadas (anteriores ao snapshot) ainda podem depender de recálculo em confirmação.
2. Falhas estruturais em geração de ticket (ex.: dados incompletos de `sale_passengers`) continuam exigindo reconciliação/manual.
3. A correção aumenta robustez, mas não substitui monitoração ativa de incidentes críticos.

---

## 6. Testes executados

1. Revisão estática dos fluxos alterados (`create-asaas-payment`, `payment-finalization`, `asaas-webhook`, `verify-payment-status`).
2. Conferência da migration de snapshot e comentários de coluna.
3. Verificação local de diff e consistência dos pontos críticos alterados.

> Observação: não foram executados testes e2e automatizados nesta etapa.

---

## 7. Recomendações para próxima etapa

1. Criar monitoramento/alerta para `sale_update_after_gateway_payment_failed`.
2. Criar tarefa de backfill opcional para snapshot financeiro em vendas legadas relevantes.
3. Adicionar teste automatizado de regressão para:
   - cobrança criada + falha de update local;
   - finalização com retry de ticket;
   - confirmação reutilizando snapshot congelado.
