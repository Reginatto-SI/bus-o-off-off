# 1. Resumo executivo

Com base na inspeção estática do código e nos dados do caso informado (`sale_id = 6b333cae-6bfc-4042-99b3-c08819f1f544`), o cenário observado é **mais compatível com pendência comercial sem bloqueio operacional ativo** (não com assento preso no veículo), combinada com **classificação rígida no diagnóstico**.

Em termos práticos:

- `status = pendente_pagamento` + `asaas_payment_status = PENDING` é um estado legítimo enquanto o gateway não confirma pagamento.
- `ticket_count = 0`, `active_lock_count = 0`, `latest_lock_expires_at = null`, `reservation_expires_at = null` indica que **não há bloqueio operacional ativo neste momento**.
- A divergência “Checkout sem bloqueio temporário” hoje é disparada por regra estrutural da UI, sem diferenciar ausência de lock por fluxo saudável/expirado já limpo vs erro real.

Risco real atual do caso:

1. **Risco operacional de capacidade (assento preso): baixo/nulo no estado atual** (não há lock ativo nem ticket).
2. **Risco de “registro pendurado” em `pendente_pagamento`: real**, se a venda não for autoencerrada por cleanup.
3. **Risco de ruído no `/admin/diagnostico-vendas`: real**, por falso positivo/alerta excessivo no cenário de lock ausente sem impacto operacional.

---

# 2. Caso concreto analisado

## 2.1 Timeline (com base no material fornecido)

1. `payment_create_started`
2. `payment_create_completed`
3. Cobrança criada no Asaas com sucesso (`payment_id = pay_or75numjmzlgdb0d`, `externalReference = sale_id`, `invoiceUrl` retornada)
4. Asaas ficou em `PENDING`
5. `verify-payment-status` consultou e retornou pendente (`processing_status = ignored`, `warning_code = payment_pending`)

Esse comportamento é coerente com o código de `verify-payment-status`, que para `PENDING`/`AWAITING_RISK_ANALYSIS` **não finaliza venda** e retorna `processando` (`supabase/functions/verify-payment-status/index.ts:614-633`).

## 2.2 Estado da venda/cobrança/locks/tickets/reserva

Conforme dados anexados:

- venda: `pendente_pagamento`
- cobrança Asaas: `PENDING`
- `ticket_count = 0`
- `active_lock_count = 0`
- `latest_lock_expires_at = null`
- `reservation_expires_at = null`

Leitura objetiva:

- **Não há ticket emitido** (logo não há ocupação por ticket).
- **Não há seat lock ativo** (logo não há bloqueio temporário de assento no momento).
- **Não há reserva manual ativa** (`reservation_expires_at` não se aplica ao checkout público em `pendente_pagamento`).

## 2.3 Houve ou não bloqueio real do veículo?

No estado atual observado: **não**.

O caso representa “venda pendente financeira sem bloqueio operacional ativo atual”.

---

# 3. Fluxo atual mapeado

## 3.1 Fluxo público (checkout)

No `Checkout.tsx`:

1. cria `seat_locks` com TTL de **15 min** (`expires_at = now + 15min`) antes da venda (`src/pages/public/Checkout.tsx:1121-1133`)
2. cria `sales` como `pendente_pagamento` (`:1152-1177`)
3. atualiza `seat_locks.sale_id` para vincular à venda (`:1200-1205`)
4. cria `sale_passengers` (`:1207-1270`)
5. chama `create-asaas-payment` (`:1284-1292`)

Observação importante: o update de vínculo `seat_locks -> sale_id` não valida erro explicitamente no fluxo mostrado.

## 3.2 Fluxo financeiro

- `create-asaas-payment` cria cobrança, persiste `asaas_payment_id` e `asaas_payment_status` na venda (`supabase/functions/create-asaas-payment/index.ts:1100-1136`).
- `asaas-webhook` e `verify-payment-status` convergem para a mesma finalização compartilhada `finalizeConfirmedPayment(...)` (`asaas-webhook:851-863`, `_shared/payment-finalization.ts:303-310`).
- Se confirmado, venda vai para `pago`, tickets são garantidos e seat locks são limpos (`payment-finalization.ts:258-267`, `305-315`, `391-395`).
- Se status continuar `PENDING`, `verify` registra como ignored/pending e não muda estado (`verify-payment-status:614-633`).

## 3.3 Fluxo operacional (expiração/cancelamento)

A Edge Function `cleanup-expired-locks` faz dois pipelines separados:

- checkout público (`pendente_pagamento`) via `seat_locks.expires_at`
- reserva manual (`reservado`) via `sales.reservation_expires_at`

Referência: `supabase/functions/cleanup-expired-locks/index.ts:73-79`.

Para checkout público:

1. busca locks expirados (`:109-113`)
2. identifica vendas candidatas sem lock ativo remanescente (`:158-188`)
3. cancela venda `pendente_pagamento` (`:232-242`)
4. remove `sale_passengers` e locks expirados (`:307-330`)

Há migration de agendamento para rodar **a cada 1 minuto** (`supabase/migrations/20261016090000_schedule_cleanup_expired_locks.sql:27-30`).

## 3.4 Geração de ticket

Só acontece na finalização de pagamento confirmado (`_shared/payment-finalization.ts:305-315`).

---

# 4. Regra atual da divergência “Checkout sem bloqueio temporário”

A regra atual no diagnóstico é:

- Para venda `pendente_pagamento`, se `lockStatus.isMissing` => categoria `divergencia`, prioridade crítica, label “Checkout sem bloqueio temporário” (`src/pages/admin/SalesDiagnostic.tsx:614-655`).

E `isMissing` é calculado como:

- `active_lock_count <= 0` e `!isExpired` (`SalesDiagnostic.tsx:409`).

Como `latest_lock_expires_at = null`, `isExpired = false`; com `active_lock_count = 0`, cai em `isMissing = true`.

Ponto-chave: essa regra **não usa** contexto adicional para reduzir falso positivo (ex.: ausência de lock sem impacto operacional imediato, sem ticket, gateway ainda pendente).

---

# 5. Causa raiz

Para este caso, a causa é **combinação** de fatores:

1. **Desalinhamento entre leitura operacional e leitura diagnóstica**:
   - Operação real: sem lock ativo e sem ticket (não há assento preso agora).
   - Diagnóstico: classifica automaticamente como divergência crítica por lock ausente.

2. **Lacuna possível de encerramento de venda pendente** (dependente de lock histórico estar rastreável):
   - o cleanup cancela checkout pendente partindo de `seat_locks` expirados com `sale_id` (`cleanup-expired-locks:161-163`, `190-195`).
   - se a venda ficar sem lock vinculável (ex.: lock inexistente, removido, ou sem `sale_id`), pode ficar “pendurada” em `pendente_pagamento`.

3. **Regra de divergência rígida demais para o caso informado**:
   - acusa criticidade mesmo sem impacto de capacidade no estado atual.

---

# 6. Comportamento desejado

Sem criar arquitetura nova, mantendo padrão existente:

1. **Checkout público não pago deve expirar automaticamente** por TTL operacional curto já existente (15 min via `seat_locks.expires_at`).
2. **Seat lock deve existir apenas durante janela de checkout**; após confirmação (`pago`) ou expiração/cancelamento, deve ser removido.
3. **Venda deve sair de `pendente_pagamento` para `cancelado`** quando expirar sem confirmação, de forma automática e auditável.
4. **Webhook continua fonte de verdade de confirmação**, com `verify-payment-status` como reconciliação/fallback já implementado.
5. **Diagnóstico deve refletir impacto operacional real**: diferenciar “sem lock e sem impacto” de “sem lock com inconsistência real”.

---

# 7. Proposta mínima e segura de correção (sem implementar)

## 7.1 Ajuste mínimo no diagnóstico

A regra “Checkout sem bloqueio temporário” deve continuar existindo, mas com contexto:

- manter crítico quando houver indício de inconsistência real (ex.: pagamento confirmado e venda não concluída, ou sinais de fluxo quebrado);
- reduzir severidade quando:
  - `sale_origin = online_checkout`
  - `status = pendente_pagamento`
  - `asaas_payment_status = PENDING/AWAITING_RISK_ANALYSIS`
  - `ticket_count = 0`
  - `active_lock_count = 0`
  - `reservation_expires_at = null`

Nesse caso, rotular como “pendência financeira sem lock ativo” (acompanhamento) em vez de divergência crítica.

## 7.2 Blindagem mínima do encerramento automático

Sem criar fluxo paralelo, fortalecer o cleanup oficial:

- além do pipeline baseado em lock expirado, adicionar varredura defensiva para `sales.status = pendente_pagamento` antigas sem lock ativo e sem ticket, com cancelamento seguro e logado (respeitando `company_id` e `payment_environment`).

Objetivo: impedir `pendente_pagamento` eterna quando o lock não estiver mais rastreável por `seat_locks`.

## 7.3 Hardening no checkout

No passo de vínculo `seat_locks.sale_id` (`Checkout.tsx:1200-1205`), tratar erro explicitamente e logar incidente operacional.

Objetivo: reduzir chance de lock órfão sem vínculo com venda, que dificulta cleanup/correlação.

---

# 8. Riscos avaliados

1. **Cancelar cedo demais**
   - risco: perder venda ainda pagável
   - mitigação: respeitar TTL vigente do checkout e status do gateway; não cancelar venda já confirmada.

2. **Liberar assento indevidamente**
   - risco: dupla alocação
   - mitigação: manter seat lock até confirmação/expiração conforme regra atual; remover apenas em finalização/cancelamento.

3. **Prender assento sem necessidade**
   - risco: bloquear capacidade
   - mitigação: cleanup agendado + remoção de locks expirados (já existe).

4. **Falso positivo no diagnóstico**
   - risco: ruído operacional
   - mitigação: ajustar severidade por contexto (não só presença/ausência de lock).

5. **Duplicar lógica webhook/verify/checkout**
   - risco: inconsistência
   - mitigação: preservar finalização compartilhada existente (`finalizeConfirmedPayment`) e concentrar ajustes no diagnóstico + cleanup.

---

# 9. Checklist de validação futura

1. Criar venda online em `pendente_pagamento` e não pagar:
   - confirmar lock ativo no início;
   - confirmar expiração após ~15 min;
   - confirmar cancelamento automático da venda.

2. Repetir em sandbox e produção com mesmo comportamento funcional.

3. Validar que venda pendente sem lock ativo e sem ticket:
   - não aparece como crítico indevido;
   - aparece em categoria de acompanhamento apropriada.

4. Validar que pagamento confirmado via webhook/verify:
   - move para `pago`;
   - gera tickets;
   - remove seat_locks.

5. Validar escopo multiempresa:
   - consultas/ações sempre com `company_id`;
   - sem cruzamento entre empresas/ambientes.

---

# Respostas objetivas às 7 perguntas

1. **Este caso deixou lugar preso?**
   - Pelos dados fornecidos (`ticket_count=0`, `active_lock_count=0`): **não deixou lugar preso no estado atual**.

2. **Deveria ser divergência?**
   - Como está hoje, a regra marca divergência. Tecnicamente, para este estado específico, isso parece **exagerado**.

3. **A divergência atual está correta?**
   - **Parcialmente**: útil para detectar ausência de lock, mas rígida demais ao classificar automaticamente como crítico sem contexto.

4. **Existe mecanismo automático de cancelamento?**
   - **Sim**: `cleanup-expired-locks` + agendamento por cron (migration).

5. **Se existe, está funcionando?**
   - O código está implementado. Para este caso específico, com os dados disponíveis nesta análise estática, **não há prova direta de execução efetiva** no ambiente alvo.

6. **Se não existir/for insuficiente, menor solução segura?**
   - Manter cleanup atual e adicionar varredura defensiva para `pendente_pagamento` sem lock/ticket acima de janela segura, sem criar arquitetura paralela.

7. **Qual combinação de ações o sistema precisa?**
   - **Combinação**:
     - cancelar venda pendente expirada;
     - remover seat_locks quando houver;
     - limpar resíduos (sale_passengers/tickets conforme fluxo);
     - ajustar diagnóstico para reduzir falso positivo.
