# 1. Resumo executivo

## Veredito direto
**Classificação: não preparado** para cenários de **contestação bancária/chargeback pós-aprovação** de forma completa e segura.

## Nível de risco atual
**Alto (operacional + financeiro).**

## Por quê (resumo curto)
- O webhook Asaas trata explicitamente apenas um conjunto limitado de eventos (`PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_REFUNDED`). Não há tratamento explícito para eventos com semântica de disputa/chargeback (`chargeback`, `dispute`, `contest`).
- Mesmo para eventos tratados como falha/estorno, quando a venda já está `pago`, o fluxo **não cancela** a venda e **não libera assento**; ele apenas atualiza `asaas_payment_status` e retorna `ignored`.
- O fallback manual (`verify-payment-status`) para venda já `pago` **não consulta o Asaas novamente**; ele retorna cedo, então não funciona como proteção para reversão financeira pós-confirmação.

## Impacto operacional e financeiro
- Risco real de venda permanecer `pago` após perda financeira (estorno/disputa/chargeback).
- Risco de passageiro seguir elegível a embarque porque o embarque depende de `sales.status = 'pago'`.
- Risco de divergência entre fluxo financeiro do gateway e fluxo operacional interno (venda/embarque/relatórios).

---

# 2. Evidências encontradas

## 2.1 Webhook Asaas: eventos assinados x eventos processados

### Eventos configurados no cadastro/repair de webhook
No provisionamento do webhook, o sistema pede ao Asaas os eventos:
- `PAYMENT_CREATED`
- `PAYMENT_UPDATED`
- `PAYMENT_CONFIRMED`
- `PAYMENT_RECEIVED`
- `PAYMENT_OVERDUE`
- `PAYMENT_DELETED`
- `PAYMENT_RESTORED`
- `PAYMENT_REFUNDED`

> Evidência: `ASAAS_PAYMENT_WEBHOOK_EVENTS` em `create-asaas-account`.  
Arquivo: `supabase/functions/create-asaas-account/index.ts`.

### Eventos efetivamente suportados no handler
No `asaas-webhook`, os eventos **aceitos para processamento** são só:
- `PAYMENT_CONFIRMED`
- `PAYMENT_RECEIVED`
- `PAYMENT_OVERDUE`
- `PAYMENT_DELETED`
- `PAYMENT_REFUNDED`

Qualquer outro evento cai em `unsupported_event` com retorno `ignored` (200) e log técnico.

> Evidência: `supportedEvents` + branch de ignorar evento não suportado.  
Arquivo: `supabase/functions/asaas-webhook/index.ts`.

### Lacuna objetiva
- `PAYMENT_RESTORED` está na configuração do webhook, mas **não está** na lista de `supportedEvents` do handler.
- Não há referência explícita a `chargeback`, `dispute`, `contest` no código pesquisado.

---

## 2.2 Tratamento de “falha/estorno” no webhook

Quando o evento não é de confirmação, o webhook cai em `processPaymentFailed`.

### Regra atual de cancelamento
A venda só é cancelada (`status = 'cancelado'`) se estiver em:
- `pendente_pagamento` ou
- `reservado`

Se a venda já estiver `pago`, a função **não cancela**; apenas atualiza `asaas_payment_status`, registra `payment_failed_ignored` e retorna `ignored`.

### Efeito sobre assentos/passagens
No caminho de cancelamento efetivo (apenas `pendente_pagamento`/`reservado`), há:
- deleção de `tickets`
- deleção de `seat_locks`
- deleção de `sale_passengers`

No caminho `ignored` (venda já fora do estado cancelável), essa limpeza **não ocorre**.

> Evidência: `processPaymentFailed` com `.in('status', ['pendente_pagamento','reservado'])`, bloco `!cancelledSale` e limpezas condicionais.  
Arquivo: `supabase/functions/asaas-webhook/index.ts`.

---

## 2.3 Fallback manual (`verify-payment-status`)

### Comportamento crítico para venda já `pago`
Se a venda já está `pago`, a função não consulta o Asaas para novo estado financeiro; ela trata como já paga/saudável e retorna cedo.

### Cobertura de status no verify
Quando consulta Asaas (vendas não pagas), há tratamento explícito para:
- confirmação (`CONFIRMED`, `RECEIVED`, `RECEIVED_IN_CASH`) => promove para `pago`
- `OVERDUE` => resposta “expirado”
- `PENDING`/`AWAITING_RISK_ANALYSIS` => “processando”
- demais status => “unchanged”

Não há branch explícito de reversão/cancelamento para disputa/chargeback em venda já paga.

> Evidência: early return para `sale.status === 'pago'`; árvore de status do Asaas no verify.  
Arquivo: `supabase/functions/verify-payment-status/index.ts`.

---

## 2.4 Logs e rastreabilidade

### Trilha técnica existe
- `sale_integration_logs` persiste webhook/manual sync com payload/response, códigos de incidente/warning, ambiente, etc.
- deduplicação por `asaas_event_id` em `asaas_webhook_event_dedup`.

### Multiempresa e ambiente
- Logs e diagnóstico filtram por `company_id` e `payment_environment`.
- Políticas RLS restringem leitura por empresa.

> Evidência: migrações `sale_integration_logs`, `asaas_webhook_event_dedup` e consultas da tela de diagnóstico técnico.  
Arquivos:  
- `supabase/migrations/20260311020000_add_sale_integration_logs.sql`  
- `supabase/migrations/20261017090000_stage3_payment_observability_dedup.sql`  
- `src/pages/admin/SalesDiagnostic.tsx`.

---

## 2.5 Status oficiais de venda e impacto em operação

- Enum de `sales` evoluiu para incluir `pendente_pagamento`, além de `reservado`, `pago`, `cancelado`.
- Embarque (QR/manifesto) depende de venda `pago` (bloqueia se `cancelado` ou diferente de `pago`).

> Evidência: migrações de enum + regra de validação de embarque.  
Arquivos:  
- `supabase/migrations/20260131001444_f8dbc20e-05dd-47eb-ad12-40b328fb2e48.sql`  
- `supabase/migrations/20260212213444_e2e671d2-fa63-4684-9d7b-3ba35db44b5a.sql`  
- `supabase/migrations/20260311010520_fc7a27bc-058e-418c-b4c9-289ec167e201.sql`  
- `supabase/migrations/20260403000000_add_driver_qr_validation_flow.sql`.

---

# 3. Fluxo atual identificado

## 3.1 Fluxo normal de pagamento confirmado
1. Checkout cria/usa cobrança Asaas e mantém `payment_environment` da venda.
2. Webhook recebe `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`.
3. `finalizeConfirmedPayment` atualiza venda para `pago` (quando elegível), gera tickets e registra logs.
4. Diagnóstico administrativo consegue mostrar trilha técnica e funcional.

## 3.2 Fluxo de falha antes da confirmação final
Se vier `PAYMENT_OVERDUE`, `PAYMENT_DELETED` ou `PAYMENT_REFUNDED` com venda ainda `pendente_pagamento`/`reservado`, o sistema cancela venda e limpa artefatos operacionais (tickets/locks/staging).

## 3.3 Ponto de quebra para contestação/chargeback pós-aprovação
Se a contestação ocorre **depois** da venda estar `pago`:
- webhook não faz transição automática para `cancelado`;
- assentos/tickets permanecem;
- embarque continua possível (pois `sale.status` segue `pago`);
- fallback `verify-payment-status` não revalida financeiramente venda já paga.

Resultado: o fluxo financeiro pode degradar sem refletir no fluxo operacional.

---

# 4. Lacunas e riscos

## 4.1 Recebimento de evento
- Não foi encontrada implementação explícita para eventos/estados de `chargeback`/`dispute`/`contest`.
- Eventos não suportados são ignorados com log técnico (não alteram venda).

## 4.2 Persistência e logs
- Há boa infraestrutura de log técnico (`sale_integration_logs` + dedup).
- **Lacuna funcional**: rastrear o incidente não significa aplicar reação operacional adequada.

## 4.3 Atualização da venda
- Falta transição específica para “pagamento contestado/revertido após pago”.
- Venda pode ficar `pago` mesmo com `asaas_payment_status` não confirmado (ou sequer atualizado em alguns cenários).

## 4.4 Assento / embarque
- Não há rotina automática de cancelamento/liberação para reversão financeira pós-pago.
- Como embarque valida `sale.status`, passageiro pode embarcar normalmente se status continuar `pago`.

## 4.5 Financeiro
- Sistema não diferencia explicitamente “pagamento confirmado historicamente” vs “dinheiro líquido/seguro após janela de risco”.
- Risco de prejuízo silencioso: operação cumprida e valor perdido no financeiro.

## 4.6 Diagnóstico administrativo
- `/admin/diagnostico-vendas` ajuda a ver divergências (`sale.status = pago` com `asaas_payment_status` diferente de `CONFIRMED/RECEIVED`).
- Porém isso é diagnóstico, não remediação automática.
- Se o evento de contestação nem atualizar `asaas_payment_status`, o caso pode ficar ainda mais opaco.

## 4.7 Inconsistência e relatórios
- Relatórios financeiros e métricas usam fortemente `sales.status = 'pago'`.
- Sem mudança de status em reversões pós-pago, há risco de visão financeira/operacional divergente do caixa real.

## 4.8 Sandbox vs produção
- A lógica de roteamento por ambiente é explícita e compartilhada; há separação por secrets/token por ambiente.
- **Não foi encontrada** lógica específica adicional para chargeback em nenhum ambiente.
- Portanto, a lacuna de chargeback tende a existir de forma equivalente nos dois ambientes.

## 4.9 Multiempresa
- Há filtros e RLS por `company_id` no diagnóstico/logs.
- No processamento interno por service role, as mutações são por `sale.id`; isso é padrão atual, mas sem guarda adicional por `company_id` nas cláusulas de update/delete do webhook.
- Não encontrei evidência de bug ativo de vazamento cross-company neste fluxo; porém, o risco principal aqui é de **inconsistência por venda** (não de isolamento quebrado) quando há reversão pós-pago.

---

# 5. Diagnóstico final

## Classificação
**não preparado**

## Justificativa objetiva
- Não há tratamento explícito para chargeback/disputa como classe própria.
- Eventos de reversão tratados hoje não rebaixam/cancelam venda já `pago`.
- Fallback manual não cobre reversão pós-pago porque não consulta gateway nesse estado.
- Embarque e ocupação continuam ancorados em `sale.status='pago'`, gerando risco operacional/financeiro concreto.

---

# 6. Recomendações mínimas futuras (sem implementar agora)

> Abaixo, apenas ajustes mínimos e coerentes com a arquitetura atual (webhook como fonte de verdade, sem fluxo paralelo).

1. **Mapear explicitamente eventos Asaas de disputa/chargeback** (quando disponíveis no contrato real do webhook usado pelo projeto) no `asaas-webhook`, sem inferência implícita.
2. **Definir regra determinística para reversão pós-pago**: ao receber evento financeiro terminal de perda, atualizar `sales` de forma explícita (incluindo trilha em `sale_logs` e `sale_integration_logs`).
3. **Aplicar política operacional para tickets/assentos em reversão pré-viagem** (cancelar/liberar de forma idempotente e auditável).
4. **Ajustar fallback manual** para permitir revalidação financeira de venda `pago` quando acionado explicitamente para auditoria/reconciliação (sem quebrar fluxo principal).
5. **Fortalecer diagnóstico** com indicador dedicado de “risco financeiro pós-pago” para separar claramente de pendência operacional comum.
6. **Adicionar testes de regressão** cobrindo cenários: pagamento confirmado → contestação/chargeback posterior → efeito esperado em venda, ticket, lock, logs e diagnóstico.

---

## Observações de ambiguidade/falta de evidência

- Este diagnóstico é estritamente baseado no código encontrado no repositório. Não foi validado contrato externo atualizado do Asaas fora do código (por exigência de “não assumir dados sem evidência”).
- Se o gateway emitir eventos de disputa diferentes dos atualmente inscritos/tratados, hoje o comportamento esperado no sistema é **ignorar** (com log técnico) ou não refletir adequadamente no estado operacional.
