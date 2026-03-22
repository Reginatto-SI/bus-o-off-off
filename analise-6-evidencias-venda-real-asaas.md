# Análise 6 — Evidências da venda real Asaas `30400fef-99fe-4418-8357-7085b000c823`

## Objetivo

Confirmar, com evidência concreta de banco e logs, em qual ponto o fluxo falhou para a venda `30400fef-99fe-4418-8357-7085b000c823`, sem corrigir nada ainda.

## Escopo e método

Esta análise foi feita com:
- leitura direta do código do fluxo `create-asaas-payment`, `verify-payment-status`, `cleanup-expired-locks` e `finalizeConfirmedPayment`;
- consulta ao banco via Supabase REST autenticado com usuário administrativo do projeto;
- coleta dos registros atuais em `sales`, `sale_passengers`, `tickets`, `sale_integration_logs` e `sale_logs`.

## Comandos usados para levantar evidências

### 1) Autenticação administrativa no Supabase
Foi usada autenticação por senha no endpoint Auth do projeto para obter token e consultar as tabelas com o contexto do usuário admin.

### 2) Consulta das tabelas da venda
Foram consultadas as tabelas:
- `sales`
- `sale_passengers`
- `tickets`
- `sale_integration_logs`
- `sale_logs`

com filtro por `sale_id = 30400fef-99fe-4418-8357-7085b000c823`.

## Estado atual da venda em `sales`

Registro atual encontrado:

- `id`: `30400fef-99fe-4418-8357-7085b000c823`
- `status`: `cancelado`
- `company_id`: `a0000000-0000-0000-0000-000000000001`
- `payment_environment`: `sandbox`
- `asaas_payment_id`: `pay_fmmatycwsg7n9830`
- `asaas_payment_status`: `PENDING`
- `payment_confirmed_at`: `null`
- `created_at`: `2026-03-22T11:43:03.990822+00:00`
- `updated_at`: `2026-03-22T12:00:00.952296+00:00`
- `cancelled_at`: `2026-03-22T12:00:00.412+00:00`
- `gross_amount`: `7.49`
- `payment_method`: `credit_card`
- `platform_fee_status`: `not_applicable`

### Leitura objetiva
1. A venda **não terminou paga** no banco.
2. Ela foi **cancelada automaticamente às 12:00:00 UTC**.
3. O `payment_confirmed_at` permaneceu `null`, então a finalização do pagamento **não conseguiu persistir a confirmação**.
4. O `payment_environment` da venda estava corretamente em `sandbox`.

## Situação de `sale_passengers`

### Estado atual
Consulta atual em `sale_passengers` retornou **zero registros** para a venda.

### Resposta objetiva
- Quantos existem agora? **0**
- Eles ainda existem? **Não**
- Campos principais atuais? **Nenhum, porque não há linhas remanescentes**

### Interpretação com evidência de código
O fato de hoje não existirem `sale_passengers` é compatível com a rotina `cleanup-expired-locks`, que ao cancelar vendas expiradas em `pendente_pagamento` também executa:

```ts
await supabaseAdmin.from("sale_passengers").delete().eq("sale_id", s.id);
```

Portanto, a ausência atual de `sale_passengers` é efeito esperado **após o auto cancelamento**, e não prova de que eles já estavam ausentes no momento da primeira tentativa de finalização.

## Situação de `tickets`

Consulta atual em `tickets` retornou **zero registros** para a venda.

### Resposta objetiva
- Quantos tickets existem? **0**
- Confirmação explícita: **não existe nenhum ticket gerado para essa venda**.

## Evidências em `sale_integration_logs`

## Resumo quantitativo
- Total de logs técnicos para a venda: **15**
- Logs de `incoming_webhook`: **0**
- Logs de `verify_payment_status` (`manual_sync`): **13**
- Logs de criação de cobrança (`outgoing_request/create_payment`): **2**

## Linha do tempo técnica

### 1) Criação da cobrança
#### `2026-03-22T11:43:06.561294+00:00`
- `direction`: `outgoing_request`
- `event_type`: `create_payment`
- `processing_status`: `requested`
- `result_category`: `started`
- mensagem: `Solicitação de criação de cobrança enviada ao Asaas`

#### `2026-03-22T11:43:07.293692+00:00`
- `direction`: `outgoing_request`
- `event_type`: `create_payment`
- `processing_status`: `success`
- `result_category`: `success`
- `payment_id`: `pay_fmmatycwsg7n9830`
- mensagem: `Cobrança criada com sucesso no Asaas`

### 2) Primeiro verify — cobrança ainda pendente
#### `2026-03-22T11:43:39.93358+00:00`
- `direction`: `manual_sync`
- `event_type`: `verify_payment_status`
- `processing_status`: `ignored`
- `result_category`: `ignored`
- `warning_code`: `payment_pending`
- `http_status`: `200`
- mensagem: `Verify consultou cobrança ainda pendente`
- retorno: `paymentStatus = processando`

### 3) Verifies seguintes — pagamento confirmado, mas finalização falhando
A partir de `2026-03-22T11:44:14.487824+00:00`, os logs mudam de `payment_pending` para falha parcial de finalização:

Ocorrências observadas:
- `11:44:14.487824`
- `11:44:43.630894`
- `11:45:46.003752`
- `11:52:17.162551`
- `11:52:22.622372`
- `11:52:52.394789`
- `11:53:22.212687`
- `11:53:52.211559`
- `11:54:25.222484`
- `11:54:56.335751`
- `11:55:45.455724`
- `11:57:13.402824`

Em todas essas tentativas:
- `direction`: `manual_sync`
- `event_type`: `verify_payment_status`
- `processing_status`: `partial_failure`
- `result_category`: `partial_failure`
- `incident_code`: `ticket_generation_incomplete`
- `http_status`: `500`
- mensagem: `Pagamento confirmado, mas a passagem não foi gerada durante verify-payment-status`
- retorno: `paymentStatus = inconsistente_sem_passagem`

## Evidências em `sale_logs`

## Linha do tempo operacional

### Criação da cobrança
- `2026-03-22T11:43:06.224639+00:00`
  - `action`: `payment_create_started`
  - descrição: `[payment_ops] source=create-asaas-payment | result=started | env=sandbox`

- `2026-03-22T11:43:07.698607+00:00`
  - `action`: `payment_create_completed`
  - descrição: `[payment_ops] source=create-asaas-payment | result=success | env=sandbox | detail=payment_id=pay_fmmatycwsg7n9830`

### Finalização via verify — tentativa e falha repetidas
Para cada rodada de verify confirmado há um par:
- `payment_finalize_started`
- `payment_finalize_failed`

Exemplo da primeira falha:
- `2026-03-22T11:44:13.570972+00:00`
  - `action`: `payment_finalize_started`
  - descrição: `[payment_ops] source=verify-payment-status | result=started | env=sandbox`

- `2026-03-22T11:44:14.224795+00:00`
  - `action`: `payment_finalize_failed`
  - descrição: `[payment_ops] source=verify-payment-status | result=error | env=sandbox | error_code=sale_update_failed | detail=there is no unique or exclusion constraint matching the ON CONFLICT specification`

A mesma falha se repete nas demais tentativas até `11:57:13.202173+00:00`.

### Cancelamento automático
- `2026-03-22T12:00:01.013127+00:00`
  - `action`: `auto_cancelled`
  - descrição: `Venda cancelada automaticamente por expiração de reserva (15 minutos sem confirmação de pagamento).`

## Webhook da venda foi recebido?

**Resposta confirmada: não.**

### Evidência
A consulta em `sale_integration_logs` para essa venda retornou:
- total de `incoming_webhook`: **0**

Logo, para esta venda específica, **não há evidência de webhook Asaas recebido/persistido** no sistema.

## O `verify-payment-status` foi executado?

**Resposta confirmada: sim.**

### Evidência
Foram encontrados **13 logs** com:
- `direction = manual_sync`
- `event_type = verify_payment_status`

### O verify encontrou pagamento confirmado?
**Sim.**

A prova é indireta, mas forte e suficiente pelo código + logs:
1. o primeiro verify às `11:43:39` ainda retornou `payment_pending`;
2. as tentativas seguintes passaram a registrar `Pagamento confirmado, mas a passagem não foi gerada durante verify-payment-status`;
3. esse ramo do código só acontece quando o status do Asaas entra em:
   - `CONFIRMED`
   - `RECEIVED`
   - `RECEIVED_IN_CASH`
4. antes de gravar esse log, o verify chama `finalizeConfirmedPayment(...)`.

### O verify tentou chamar `finalizeConfirmedPayment(...)`?
**Sim.**

### Evidência
Cada tentativa confirmada gerou em `sale_logs`:
- `payment_finalize_started`
- seguida de `payment_finalize_failed`

Isso só acontece dentro da rotina de finalização compartilhada.

## Causa raiz confirmada

## O problema foi webhook, finalização ou geração de ticket?
**Problema principal confirmado: finalização do pagamento.**

Não foi um problema primário de webhook porque **não houve webhook registrado**.
Também **não foi uma falha primária de geração de ticket**, porque a execução falhou **antes de chegar à etapa de criação de tickets**.

## Ponto exato da falha
A falha confirmada ocorreu na etapa inicial de `finalizeConfirmedPayment(...)`, quando a função tentou atualizar a venda para `status = 'pago'`.

O erro persistido foi:

`there is no unique or exclusion constraint matching the ON CONFLICT specification`

Esse erro aparece em `sale_logs` como:
- `error_code = sale_update_failed`
- `detail = there is no unique or exclusion constraint matching the ON CONFLICT specification`

## Por que isso prova que não foi `sale_passengers` nem `tickets`?
Porque no código de `finalizeConfirmedPayment(...)` a ordem é:
1. atualizar `sales` para `pago`;
2. **se essa atualização falhar, a função retorna imediatamente**;
3. só depois disso ela chamaria `createTicketsFromPassengersShared(...)`.

Portanto:
- a função **não chegou** ao bloco de leitura de `sale_passengers`;
- a função **não chegou** ao insert de `tickets`;
- a função **não chegou** ao cleanup de `seat_locks` como parte da finalização bem-sucedida.

## Origem provável imediata do erro SQL
A atualização de `sales` dispara o trigger `trg_notify_sale_status_updates`, que chama `create_admin_notification(...)`.

Nessa função SQL existe:

```sql
ON CONFLICT (company_id, type, dedupe_key) DO NOTHING;
```

Mas a migração define o índice único correspondente como **índice parcial**:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_notifications_dedupe
  ON public.admin_notifications(company_id, type, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
```

Esse desenho é compatível com o erro observado em runtime:
- o update da venda para `pago` aciona trigger;
- o trigger tenta inserir notificação com `ON CONFLICT (company_id, type, dedupe_key)`;
- o PostgreSQL reclama que não existe constraint/índice único compatível para esse `ON CONFLICT`;
- a atualização da venda falha;
- a finalização aborta antes dos tickets.

## Sequência causal confirmada do incidente
1. A venda foi criada corretamente em `sandbox`.
2. A cobrança Asaas foi criada com sucesso (`pay_fmmatycwsg7n9830`).
3. Não houve webhook persistido para essa venda.
4. O sistema passou a depender do `verify-payment-status`.
5. O primeiro verify encontrou pagamento ainda pendente.
6. Os verifies seguintes já encontraram pagamento confirmado e tentaram finalizar.
7. A finalização falhou ao atualizar `sales` para `pago`.
8. Como a venda permaneceu sem confirmação persistida, a rotina `cleanup-expired-locks` a cancelou por expiração às `12:00:01`.
9. Nesse cancelamento automático, `sale_passengers` foi removido.
10. O resultado final ficou:
   - venda cancelada;
   - zero tickets;
   - zero sale_passengers atuais;
   - sem confirmação persistida no banco.

## Respostas objetivas ao questionário solicitado

### 1. Qual é o registro atual da venda em `sales`?
**Resposta:**
- `id`: `30400fef-99fe-4418-8357-7085b000c823`
- `status`: `cancelado`
- `company_id`: `a0000000-0000-0000-0000-000000000001`
- `payment_environment`: `sandbox`
- `asaas_payment_id`: `pay_fmmatycwsg7n9830`
- `asaas_payment_status`: `PENDING`
- `payment_confirmed_at`: `null`
- timestamps relevantes:
  - `created_at`: `2026-03-22T11:43:03.990822+00:00`
  - `updated_at`: `2026-03-22T12:00:00.952296+00:00`
  - `cancelled_at`: `2026-03-22T12:00:00.412+00:00`

### 2. Existem registros em `sale_passengers`?
**Resposta:** não atualmente. Quantidade atual: **0**.

### 3. Existem registros em `tickets`?
**Resposta:** não. Quantidade atual: **0**.

### 4. Existem logs em `sale_integration_logs`?
**Resposta:** sim, **15** no total.
- criação da cobrança: **sim**
- webhook recebido: **não**
- verify-payment-status: **sim, 13 vezes**
- finalização do pagamento: refletida indiretamente pelos `partial_failure` do verify
- erro de geração de tickets: o incidente registrado foi `ticket_generation_incomplete`, mas a causa técnica mais específica está em `sale_logs` como `sale_update_failed`

### 5. Existem logs em `sale_logs`?
**Resposta:** sim.
- criação iniciada e concluída;
- várias tentativas de `payment_finalize_started`;
- várias falhas `payment_finalize_failed` com erro SQL explícito;
- cancelamento automático por expiração.

### 6. O webhook foi realmente recebido e processado?
**Resposta:** **não há evidência de recebimento**.
- `incoming_webhook = 0`

### 7. O `verify-payment-status` foi executado?
**Resposta:** sim.
- quantidade: **13 execuções**
- primeiro retorno: pagamento pendente (`processando`)
- retornos seguintes: pagamento confirmado, porém com falha de finalização (`inconsistente_sem_passagem`)
- ele tentou `finalizeConfirmedPayment(...)`: **sim**

### 8. Se o pagamento foi confirmado mas a passagem não foi gerada, qual foi a falha exata?
**Resposta confirmada:** **outro motivo**.

Não foi comprovadamente:
- ausência inicial de `sale_passengers`;
- falha de insert em `tickets`;
- regra de idempotência;
- cleanup prematuro como causa primária.

Foi:
- **falha na atualização da venda para `pago` dentro de `finalizeConfirmedPayment(...)`, causada por erro SQL disparado no caminho do trigger/notificação administrativa**.

O cleanup automático veio **depois**, como consequência de a venda continuar pendente até expirar.

## Arquivo exato que precisará de ajuste depois da confirmação

### Ajuste mais direto no runtime
- `supabase/functions/_shared/payment-finalization.ts`
  - é onde a falha emerge operacionalmente, no bloco que atualiza `sales` para `pago`.

### Ajuste estrutural provável no banco
- `supabase/migrations/20260705090000_create_admin_notifications_mvp.sql`
  - define a função `create_admin_notification(...)` com `ON CONFLICT (company_id, type, dedupe_key) DO NOTHING`;
  - e define o índice único parcial que parece incompatível com esse `ON CONFLICT` no caminho acionado pelo trigger.

## Conclusão executiva

### Conclusão curta
A venda `30400fef-99fe-4418-8357-7085b000c823` **não falhou por ausência de webhook apenas**. O caso real mostra:

1. **não houve webhook persistido**;
2. o sistema tentou se recuperar via `verify-payment-status`;
3. o verify efetivamente encontrou o pagamento confirmado;
4. a finalização falhou ao tentar marcar a venda como paga, com erro SQL explícito ligado ao caminho de notificação administrativa;
5. como a confirmação não foi persistida, a venda expirou e foi cancelada automaticamente;
6. nesse cancelamento, os `sale_passengers` foram apagados;
7. nenhum ticket foi gerado.

### Causa raiz confirmada
**Falha de finalização do pagamento ao atualizar `sales`, causada por erro SQL `there is no unique or exclusion constraint matching the ON CONFLICT specification` no caminho acionado pelo trigger de notificação administrativa.**

### Classificação final do problema
- webhook: **ausente neste caso**
- verify: **funcionou como detector de pagamento confirmado**
- finalização: **falhou**
- geração de ticket: **nem chegou a executar como etapa principal, porque a falha ocorreu antes**

### Correção mínima recomendada depois da confirmação
Sem implementar agora, a correção mínima deve atacar primeiro o ponto confirmado:
1. corrigir o caminho SQL/trigger que quebra a atualização de `sales` para `pago`;
2. só depois revalidar se a finalização volta a atingir `createTicketsFromPassengersShared(...)` normalmente;
3. em paralelo, revisar por que o webhook não deixou rastro para essa venda específica.

