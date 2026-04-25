# 1. O que foi ajustado

Foi feito ajuste pontual no `asaas-webhook` para priorizar **eventos explícitos oficiais do Asaas** antes de inferência genérica por `payment.status`.

Também foi ajustada a configuração de eventos no `create-asaas-account` para alinhar o cadastro/reparo de webhook com a lista oficial informada.

Objetivo preservado:
- blindagem operacional determinística
- sem reembolso automático
- sem rollback automático de split/taxa/comissão
- sem refatoração arquitetural

---

# 2. Classificação final dos eventos

## Confirmação
Eventos tratados como confirmação operacional:
- `PAYMENT_CONFIRMED`
- `PAYMENT_RECEIVED`

## Reversão crítica
Eventos tratados como reversão crítica (acionam fluxo de blindagem operacional):
- `PAYMENT_REFUNDED`
- `PAYMENT_PARTIALLY_REFUNDED`

Fallback conservador por status (quando não houver evento explícito mais forte):
- `payment.status = REFUNDED`
- `payment.status = REFUND_REQUESTED`
- `payment.status` contendo `CHARGEBACK` / `DISPUTE` / `CONTEST`

## Risco em andamento
Eventos explícitos de risco financeiro em andamento (sem transição destrutiva automática):
- `PAYMENT_CHARGEBACK_REQUESTED`
- `PAYMENT_CHARGEBACK_DISPUTE`
- `PAYMENT_AWAITING_CHARGEBACK_REVERSAL`

Comportamento: atualizar trilha/status e registrar risco operacional.

## Informativos / contextuais
Eventos oficiais suportados que não devem disparar blindagem destrutiva por padrão (ex.: administrativos/contextuais):
- `PAYMENT_UPDATED`
- `PAYMENT_RESTORED`
- `PAYMENT_CREATED`
- `PAYMENT_AUTHORIZED`
- `PAYMENT_APPROVED_BY_RISK_ANALYSIS`
- `PAYMENT_ANTICIPATED`
- `PAYMENT_AWAITING_RISK_ANALYSIS`
- `PAYMENT_REPROVED_BY_RISK_ANALYSIS`
- `PAYMENT_BANK_SLIP_VIEWED`
- `PAYMENT_BANK_SLIP_CANCELLED`
- `PAYMENT_CHECKOUT_VIEWED`
- `PAYMENT_DUNNING_REQUESTED`
- `PAYMENT_DUNNING_RECEIVED`
- `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`
- `PAYMENT_REFUND_DENIED`
- `PAYMENT_REFUND_IN_PROGRESS`
- `PAYMENT_RECEIVED_IN_CASH_UNDONE`
- `PAYMENT_SPLIT_CANCELLED`
- `PAYMENT_SPLIT_DIVERGENCE_BLOCK`
- `PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED`

Observação: `PAYMENT_OVERDUE` e `PAYMENT_DELETED` continuam no fluxo legado de falha **pré-pago** (cancelamento de `pendente_pagamento/reservado`), mas com guard conservador para não cancelar indevidamente venda já `pago`.

---

# 3. Regra operacional aplicada

## Antes do embarque
Quando houver reversão crítica real em venda já `pago`:
- cancelar operacionalmente (`status = cancelado`)
- remover `tickets`, `seat_locks`, `sale_passengers`
- impedir uso operacional posterior (embarque)

## Depois do embarque
Quando houver reversão crítica ou risco relevante após uso operacional:
- preservar histórico consumido
- não apagar trilha operacional
- registrar risco/incidente técnico-operacional

---

# 4. O que NÃO foi automatizado

Permanece explicitamente **não automatizado**:
- reembolso automático ao cliente
- rollback automático de split
- recálculo automático de taxa da plataforma
- devolução automática de comissão

A tratativa financeira continua manual pela empresa, conforme regra do projeto.

---

# 5. Riscos e observações

1. A priorização por evento explícito reduz ambiguidade e falso positivo de cancelamento.
2. Ainda existe dependência do payload real enviado pelo gateway (contrato externo) para cobertura total de todos os casos.
3. Eventos de “risco em andamento” foram deliberadamente não-destrutivos para evitar cancelamento indevido antes da reversão terminal.
