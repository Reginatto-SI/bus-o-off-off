# Matriz de eventos/status do webhook Asaas no SmartBus BR

Auditoria objetiva do código atual do fluxo Asaas, sem alteração de implementação.

## Escopo inspecionado

- `supabase/functions/asaas-webhook/index.ts`
- `supabase/functions/verify-payment-status/index.ts`
- `supabase/functions/_shared/payment-finalization.ts`
- `supabase/functions/_shared/payment-observability.ts`
- `supabase/functions/_shared/payment-context-resolver.ts`

## Resumo executivo

- O webhook valida escopo por `externalReference`, resolve `payment_environment` pela venda e valida token apenas do ambiente resolvido.
- A deduplicação formal ocorre por `asaas_event_id` antes do processamento operacional do evento suportado.
- Eventos confirmatórios explícitos do webhook: `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED`.
- Status confirmatórios aceitos como fallback pelo webhook e pelo verify: `CONFIRMED`, `RECEIVED`, `RECEIVED_IN_CASH`.
- A finalização real de venda/tickets é centralizada em `finalizeConfirmedPayment` para venda principal.
- O fluxo de taxa de plataforma (`externalReference = platform_fee_<uuid>`) tem tratamento separado e não chama `finalizeConfirmedPayment`.
- Eventos críticos de reversão podem cancelar venda, apagar tickets/locks/passengers antes de embarque, ou apenas registrar risco quando já houve embarque.

---

## 1. Eventos/status tratados hoje

### 1.1 Eventos Asaas explicitamente suportados pelo webhook

A lista abaixo vem do `ASAAS_SUPPORTED_EVENTS`. Eventos fora dela são ignorados com HTTP 200 e log de integração.

| Evento | Confirmatório? | Ação principal na venda principal | Altera `sales.status`? | Chama `finalizeConfirmedPayment`? | Gera ticket? | Apenas log/status? | Ignorado com segurança? | Depende de `externalReference`? | Depende de `asaas_payment_id`? | Respeita `payment_environment`? |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `PAYMENT_CONFIRMED` | Sim | Confirma venda via `processPaymentConfirmed`; depois snapshot financeiro | Sim, para `pago` quando venda está `pendente_pagamento` ou `reservado` | Sim | Sim, via finalização | Não | Não | Sim | Não para vincular; usa `payment.id` para rastreio | Sim |
| `PAYMENT_RECEIVED` | Sim | Igual a `PAYMENT_CONFIRMED` | Sim | Sim | Sim | Não | Não | Sim | Não para vincular; usa `payment.id` para rastreio | Sim |
| `PAYMENT_AUTHORIZED` | Não | Atualiza `asaas_payment_status` sem transição operacional | Não | Não | Não | Sim | Sim | Sim | Não | Sim |
| `PAYMENT_APPROVED_BY_RISK_ANALYSIS` | Não | Atualiza `asaas_payment_status` sem transição operacional, salvo se status do pagamento vier confirmatório | Só se `payment.status` for confirmatório | Só se `payment.status` for confirmatório | Só se confirmar | Normalmente sim | Sim | Sim | Não | Sim |
| `PAYMENT_CREATED` | Não | Atualiza `asaas_payment_status` sem transição operacional | Não | Não | Não | Sim | Sim | Sim | Não | Sim |
| `PAYMENT_ANTICIPATED` | Não | Atualiza `asaas_payment_status` sem transição operacional | Não | Não | Não | Sim | Sim | Sim | Não | Sim |
| `PAYMENT_DELETED` | Não / falha pré-paga | Cancela venda se `pendente_pagamento`/`reservado`; se já paga, não cancela salvo status de reversão financeira | Sim, para `cancelado` em venda cancelável | Não | Não; remove tickets existentes no cancelamento | Não | Sim quando fora de estado cancelável | Sim | Não | Sim |
| `PAYMENT_REFUNDED` | Reversão crítica | Se venda paga antes do embarque: cancela e remove tickets/locks/passengers; se pós-embarque: registra risco; se pendente/reservada: cancela | Sim, conforme estado | Não | Não; pode apagar tickets | Não | Não | Sim | Não | Sim |
| `PAYMENT_PARTIALLY_REFUNDED` | Reversão crítica | Mesma lógica de reversão crítica | Sim, conforme estado | Não | Não; pode apagar tickets | Não | Não | Sim | Não | Sim |
| `PAYMENT_REFUND_DENIED` | Não | Atualiza `asaas_payment_status` sem transição operacional | Não | Não | Não | Sim | Sim | Sim | Não | Sim |
| `PAYMENT_REFUND_IN_PROGRESS` | Não | Atualiza `asaas_payment_status` sem transição operacional | Não | Não | Não | Sim | Sim | Sim | Não | Sim |
| `PAYMENT_CHARGEBACK_REQUESTED` | Risco em andamento | Atualiza `asaas_payment_status` e registra risco financeiro sem transição destrutiva | Não | Não | Não | Não; log de risco | Não | Sim | Não | Sim |
| `PAYMENT_CHARGEBACK_DISPUTE` | Risco em andamento | Igual ao item anterior | Não | Não | Não | Não; log de risco | Não | Sim | Não | Sim |
| `PAYMENT_AWAITING_CHARGEBACK_REVERSAL` | Risco em andamento | Igual ao item anterior | Não | Não | Não | Não; log de risco | Não | Sim | Não | Sim |
| `PAYMENT_DUNNING_REQUESTED` | Não | Atualiza `asaas_payment_status` sem transição operacional | Não | Não | Não | Sim | Sim | Sim | Não | Sim |
| `PAYMENT_DUNNING_RECEIVED` | Não | Atualiza `asaas_payment_status` sem transição operacional, salvo status confirmatório | Só se `payment.status` for confirmatório | Só se `payment.status` for confirmatório | Só se confirmar | Normalmente sim | Sim | Sim | Não | Sim |
| `PAYMENT_BANK_SLIP_VIEWED` | Não | Atualiza `asaas_payment_status` sem transição operacional | Não | Não | Não | Sim | Sim | Sim | Não | Sim |
| `PAYMENT_BANK_SLIP_CANCELLED` | Não | Atualiza `asaas_payment_status` sem transição operacional, salvo status de falha/reversão no payload | Só por status fallback | Só por status confirmatório fallback | Só por status confirmatório fallback | Normalmente sim | Sim | Sim | Não | Sim |
| `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` | Não | Atualiza `asaas_payment_status` sem transição operacional, salvo status de falha/reversão no payload | Só por status fallback | Só por status confirmatório fallback | Só por status confirmatório fallback | Normalmente sim | Sim | Sim | Não | Sim |
| `PAYMENT_SPLIT_CANCELLED` | Não | Atualiza `asaas_payment_status` sem transição operacional | Não | Não | Não | Sim | Sim | Sim | Não | Sim |
| `PAYMENT_SPLIT_DIVERGENCE_BLOCK` | Não | Atualiza `asaas_payment_status` sem transição operacional | Não | Não | Não | Sim | Sim | Sim | Não | Sim |
| `PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED` | Não | Atualiza `asaas_payment_status` sem transição operacional | Não | Não | Não | Sim | Sim | Sim | Não | Sim |
| `PAYMENT_AWAITING_RISK_ANALYSIS` | Não | Atualiza `asaas_payment_status` sem transição operacional | Não | Não | Não | Sim | Sim | Sim | Não | Sim |
| `PAYMENT_REPROVED_BY_RISK_ANALYSIS` | Não | Atualiza `asaas_payment_status` sem transição operacional, salvo status de falha/reversão no payload | Só por status fallback | Não, salvo status confirmatório improvável | Só se confirmar por fallback | Normalmente sim | Sim | Sim | Não | Sim |
| `PAYMENT_UPDATED` | Não | Atualiza `asaas_payment_status` sem transição operacional, salvo status confirmatório/reversão/falha no payload | Só por status fallback | Só por status confirmatório fallback | Só por status confirmatório fallback | Normalmente sim | Sim | Sim | Não | Sim |
| `PAYMENT_OVERDUE` | Não / falha pré-paga | Cancela venda `pendente_pagamento`/`reservado`; se já paga, registra status e ignora como não terminal | Sim, para `cancelado` em venda cancelável | Não | Não; remove tickets/locks/passengers se cancelar | Não | Sim quando fora de estado cancelável | Sim | Não | Sim |
| `PAYMENT_RESTORED` | Não | Atualiza `asaas_payment_status` sem transição operacional | Não | Não | Não | Sim | Sim | Sim | Não | Sim |
| `PAYMENT_RECEIVED_IN_CASH_UNDONE` | Não | Atualiza `asaas_payment_status` sem transição operacional, salvo status de reversão no payload | Só por status fallback | Não | Não | Normalmente sim | Sim | Sim | Não | Sim |
| `PAYMENT_CHECKOUT_VIEWED` | Não | Atualiza `asaas_payment_status` sem transição operacional | Não | Não | Não | Sim | Sim | Sim | Não | Sim |

### 1.2 Status Asaas tratados por helper/fallback

| Status | Onde aparece | Confirmatório? | Ação |
|---|---|---:|---|
| `CONFIRMED` | Webhook e verify | Sim | Confirma venda; no verify também consulta `/payments/{asaas_payment_id}` |
| `RECEIVED` | Webhook e verify | Sim | Confirma venda |
| `RECEIVED_IN_CASH` | Webhook e verify | Sim por status | Confirma venda quando aparece como `payment.status`; não há evento explícito `PAYMENT_RECEIVED_IN_CASH` na lista suportada |
| `REFUNDED` | Webhook e verify | Reversão | Cancela/invalida venda conforme estado ou registra risco pós-embarque |
| `REFUND_REQUESTED` | Webhook e verify | Reversão por status | Tratado como reversão financeira por helper, mesmo sem evento explícito dedicado |
| Status contendo `CHARGEBACK` | Webhook e verify | Reversão por status | Tratado como reversão financeira quando usado pelo helper |
| Status contendo `DISPUTE` | Webhook e verify | Reversão por status | Tratado como reversão financeira quando usado pelo helper |
| Status contendo `CONTEST` | Webhook e verify | Reversão por status | Tratado como reversão financeira quando usado pelo helper |
| `OVERDUE` | Verify | Não | Retorna `paymentStatus: expirado`; não altera venda no verify comum |
| `PENDING` | Verify | Não | Retorna `paymentStatus: processando`; não altera venda |
| `AWAITING_RISK_ANALYSIS` | Verify | Não | Retorna `paymentStatus: processando`; não altera venda |
| Qualquer outro status | Webhook/verify | Não | Webhook atualiza `asaas_payment_status`; verify retorna status local sem transição |

---

## 2. Eventos confirmatórios

Fazem a venda principal virar `pago`:

1. `PAYMENT_CONFIRMED`.
2. `PAYMENT_RECEIVED`.
3. Qualquer evento suportado cujo `payment.status` venha como `CONFIRMED`, `RECEIVED` ou `RECEIVED_IN_CASH`, desde que o evento não seja explicitamente reversão crítica, risco em andamento ou falha pré-paga.
4. No fallback `verify-payment-status`, `payment.status` `CONFIRMED`, `RECEIVED` ou `RECEIVED_IN_CASH` após consulta ao Asaas.

A regra de confirmação não diferencia Pix, boleto e cartão no código analisado. O webhook registra `billingType` no console ao receber o evento, mas a decisão de confirmar depende de `eventType` e/ou `payment.status`, não de `billingType`.

Para venda principal, a confirmação chama `finalizeConfirmedPayment`, altera `sales.status` para `pago` quando a venda está em `pendente_pagamento` ou `reservado`, grava `asaas_payment_status`, `payment_confirmed_at`, gera tickets a partir de `sale_passengers`, processa comissão e remove `seat_locks`.

No fluxo de taxa da plataforma (`platform_fee_<uuid>`), `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED` marcam `platform_fee_status = paid`; se a venda estava `reservado`, também muda `sales.status` para `pago`. Esse fluxo não chama `finalizeConfirmedPayment` e não gera tickets.

---

## 3. Eventos não confirmatórios

Eventos suportados que não estão nos conjuntos confirmatório, reversão crítica, risco em andamento ou falha pré-paga caem em `status_update_without_operational_transition`:

- `PAYMENT_AUTHORIZED`
- `PAYMENT_APPROVED_BY_RISK_ANALYSIS`
- `PAYMENT_CREATED`
- `PAYMENT_ANTICIPATED`
- `PAYMENT_REFUND_DENIED`
- `PAYMENT_REFUND_IN_PROGRESS`
- `PAYMENT_DUNNING_REQUESTED`
- `PAYMENT_DUNNING_RECEIVED`
- `PAYMENT_BANK_SLIP_VIEWED`
- `PAYMENT_BANK_SLIP_CANCELLED`
- `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`
- `PAYMENT_SPLIT_CANCELLED`
- `PAYMENT_SPLIT_DIVERGENCE_BLOCK`
- `PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED`
- `PAYMENT_AWAITING_RISK_ANALYSIS`
- `PAYMENT_REPROVED_BY_RISK_ANALYSIS`
- `PAYMENT_UPDATED`
- `PAYMENT_RESTORED`
- `PAYMENT_RECEIVED_IN_CASH_UNDONE`
- `PAYMENT_CHECKOUT_VIEWED`

Efeito padrão: atualizam apenas `sales.asaas_payment_status` e gravam log operacional/de integração. Não alteram `sales.status`, não chamam `finalizeConfirmedPayment` e não geram tickets.

Exceção: se o `payment.status` desses eventos vier confirmatório ou como reversão financeira, a decisão por status fallback pode confirmar/cancelar conforme os helpers.

---

## 4. Eventos críticos de reversão

### Estorno / reembolso

- Eventos explícitos: `PAYMENT_REFUNDED`, `PAYMENT_PARTIALLY_REFUNDED`.
- Status equivalentes por helper: `REFUNDED`, `REFUND_REQUESTED`.
- Venda `pendente_pagamento` ou `reservado`: muda para `cancelado`, grava `cancel_reason`, `cancelled_at`, `asaas_payment_status`, remove tickets, seat locks e passageiros.
- Venda `pago` antes do embarque: muda para `cancelado`, remove tickets, seat locks e passageiros. Não há rollback automático de split/reembolso; o texto de motivo indica ação manual.
- Venda `pago` após embarque: não apaga histórico; atualiza `asaas_payment_status` e registra incidente/risco `post_paid_reversal_after_boarding`.

### Chargeback / disputa

- Eventos de risco em andamento: `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_CHARGEBACK_DISPUTE`, `PAYMENT_AWAITING_CHARGEBACK_REVERSAL`.
- Ação: atualiza `asaas_payment_status` e registra risco financeiro sem cancelamento automático.
- Se houver embarque consumido, registra como risco pós-embarque; se não, registra como `financial_reversal_under_review`.
- Status contendo `CHARGEBACK`, `DISPUTE` ou `CONTEST` são considerados reversão financeira pelo helper e podem acionar cancelamento/risco conforme contexto.

### Cancelamento / remoção de cobrança

- Evento explícito terminal pré-pago: `PAYMENT_DELETED`.
- Venda `pendente_pagamento` ou `reservado`: cancela e limpa dados operacionais.
- Venda já `pago`: não é tratado como perda financeira terminal por si só; atualiza `asaas_payment_status` e ignora destrutivamente, salvo se o status do payload também indicar reversão financeira.

### Restauração de cobrança

- Evento: `PAYMENT_RESTORED`.
- Ação: apenas atualiza `asaas_payment_status` e registra log sem transição operacional.
- Não reabre venda automaticamente.

### Vencimento / expiração

- Evento: `PAYMENT_OVERDUE`.
- Webhook: cancela venda `pendente_pagamento`/`reservado`; se venda já paga, atualiza `asaas_payment_status` e ignora como não terminal de perda financeira.
- Verify: quando consulta status `OVERDUE`, retorna `paymentStatus: expirado` e registra log, sem alterar `sales.status`.

---

## 5. Eventos ignorados

São ignorados com HTTP 200:

1. Eventos claramente fora do escopo SmartBus: `externalReference` ausente/vazia ou fora do padrão `uuid` / `platform_fee_<uuid>`.
2. Eventos não listados em `ASAAS_SUPPORTED_EVENTS`.
3. Eventos duplicados por `asaas_event_id`.
4. Eventos sem venda encontrada para uma referência UUID válida.
5. Eventos de falha/reversão quando a venda já está `cancelado`.
6. Eventos de falha/reversão fora de estado cancelável.
7. Eventos operacionais sem transição: atualizam `asaas_payment_status` e retornam `ignored`.

Não são ignorados com 200 quando o problema é segurança/contexto:

- Ambiente da venda ausente/indeterminado: HTTP 400.
- Secret de webhook ausente: HTTP 500.
- Token inválido: HTTP 401.
- Payload inválido sem `event`/`payment`: HTTP 400.

---

## 6. Segurança e idempotência

### Validação de token

- O webhook resolve o ambiente a partir de `sales.payment_environment` antes de validar token.
- Valida apenas `asaas-access-token` ou `x-asaas-webhook-token` contra o secret do ambiente resolvido.
- Não há fallback dual-token entre sandbox e produção.
- Sem token configurado para o ambiente: retorna 500.
- Token inválido: retorna 401 e persiste log de integração.

### Deduplicação por `asaas_event_id`

- Se `requestPayload.id` ou `requestPayload.eventId` existir, o webhook insere em `asaas_webhook_event_dedup`.
- Violação única (`23505`) chama `mark_asaas_webhook_event_duplicate` e retorna HTTP 200 com `duplicate: true`.
- Se não houver `asaas_event_id`, o código não deduplica formalmente; segue processamento normal.

### Proteção contra evento duplicado

Além da tabela de dedup, a finalização é idempotente:

- `finalizeConfirmedPayment` só altera `sales.status` para `pago` se o status atual estiver em `pendente_pagamento` ou `reservado`.
- Geração de tickets é protegida por verificação de tickets existentes.
- Logs de venda são reduzidos para transição real ou criação de tickets.

### Venda não encontrada

- Para `externalReference` com UUID válido, mas sem venda, o webhook retorna HTTP 200 com `reason: sale_not_found`, porque retry do Asaas não criará contexto novo.
- Antes disso, se não conseguir resolver `payment_environment` da venda, retorna HTTP 400 como ambiente não determinado.

### Ambiente da venda ausente

- Webhook: rejeita antes da validação do token com HTTP 400 (`Sale environment unresolved`).
- Verify: rejeita com HTTP 409 e `error_code: payment_environment_unresolved` quando não consegue resolver contexto.

### `externalReference` inválido

- Ausente, vazio ou fora de UUID canônico / `platform_fee_<uuid>`: webhook trata como fora do escopo SmartBus, grava log e retorna HTTP 200.
- Referência `platform_fee_<uuid>` entra no fluxo dedicado de taxa da plataforma.
- Referência UUID simples entra no fluxo de venda principal.

### `company_id`, `externalReference`, `asaas_payment_id`, `payment_environment`

- `company_id`: usado nos updates/delete de venda, tickets, locks, passageiros e logs operacionais.
- `externalReference`: principal vínculo do webhook com a venda; obrigatório na prática para processar venda principal ou taxa.
- `asaas_payment_id`: não é requisito para o webhook confirmar, pois o webhook usa `payment.id` do payload. É requisito do verify comum para consultar `/payments/{id}`, com tentativa de recovery por `externalReference` se estiver ausente.
- `payment_environment`: obrigatório para webhook e verify; define token, base URL e credenciais por ambiente.

---

## 7. Lacunas encontradas

1. `PAYMENT_RECEIVED_IN_CASH` não aparece como evento suportado; apenas o status `RECEIVED_IN_CASH` é confirmatório. Se o Asaas enviar evento com esse nome exato, o webhook cairá em `unsupported_event` e retornará 200 sem confirmar, a menos que o nome real do evento seja outro suportado com status `RECEIVED_IN_CASH`.
2. `PAYMENT_CANCELLED` não aparece na lista suportada. Cancelamento é representado hoje por `PAYMENT_DELETED`, `PAYMENT_BANK_SLIP_CANCELLED` ou status de payload.
3. `PAYMENT_EXPIRED` não aparece na lista suportada. Expiração/vencimento está coberta por `PAYMENT_OVERDUE` e pelo status `OVERDUE` no verify.
4. `PAYMENT_REFUND_REQUESTED` não aparece como evento suportado; apenas o status `REFUND_REQUESTED` é tratado como reversão financeira.
5. Eventos de chargeback em andamento não cancelam automaticamente venda antes do desfecho; apenas registram risco e atualizam `asaas_payment_status`.
6. Eventos operacionais de boleto/cartão/split são tratados de forma genérica, sem regra específica por meio de pagamento.
7. Se o payload não trouxer `asaas_event_id`, não há deduplicação formal por evento; a idempotência restante depende de guards de status/tickets.
8. O verify confirma pelos mesmos status (`CONFIRMED`, `RECEIVED`, `RECEIVED_IN_CASH`), mas não é fonte prioritária; registra incidente quando confirma sem webhook observado.

---

## Evidências de código consultadas

- Conjuntos de eventos/status e helpers de normalização/confirmatórios/reversão em `asaas-webhook`.
- Validação de escopo por `externalReference`, resolução de ambiente, validação de token e deduplicação em `asaas-webhook`.
- Fluxos `processPaymentConfirmed`, `processPaymentFailed`, `processPaymentRiskInProgress` e taxa de plataforma em `asaas-webhook`.
- Status confirmatórios e fallback por `asaas_payment_id`/`externalReference` em `verify-payment-status`.
- Rotina central `finalizeConfirmedPayment` para status `pago`, tickets, comissão e limpeza de locks.
- Helpers de observabilidade e resolução de contexto para logs, ambiente, token e credenciais.
