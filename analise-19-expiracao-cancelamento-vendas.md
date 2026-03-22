# 1. Objetivo da análise

Investigar, sem aplicar correções, o comportamento real de expiração e cancelamento automático de vendas em aberto exibidas em `/admin/vendas`, com foco especial nas compras que aparecem como **“Aguardando Pagamento”** e simultaneamente como **“Expirado operacionalmente”**.

O objetivo foi validar no código e no schema:

- qual é a regra de negócio realmente implementada hoje;
- qual fluxo decide a expiração;
- quem persiste o cancelamento final;
- como os assentos/vagas são impactados;
- se existe ou não limbo operacional indevido;
- se o comportamento é coerente entre sandbox e produção.

---

# 2. Sintoma observado

Na listagem `/admin/vendas`, a tela pode exibir simultaneamente:

- badge principal: **Aguardando Pagamento** (`status = pendente_pagamento`);
- aviso auxiliar: **Expirado operacionalmente**;
- tooltip afirmando que a janela operacional de pagamento já venceu, mas que o status oficial ainda continua aguardando a rotina automática de limpeza/cancelamento.

## Leitura objetiva do sintoma

Esse estado híbrido **é possível pelo código atual** e não representa, por si só, um quarto status persistido no banco. O que existe hoje é:

- **status oficial persistido** em `sales.status`;
- **sinalização visual derivada no frontend** em `/admin/vendas`, calculada localmente por tempo decorrido desde `created_at`.

Ou seja: a UI da listagem pode mostrar “expirado operacionalmente” **sem que a venda tenha sido cancelada ainda no banco**.

---

# 3. Fluxo real identificado no código

## 3.1. Checkout público: criação da venda em aberto

No checkout público:

1. o frontend cria `seat_locks` com expiração de **15 minutos**;
2. cria a venda em `sales` com `status = 'pendente_pagamento'`;
3. persiste `payment_environment` na venda já no nascimento;
4. vincula os `seat_locks` à venda via `sale_id`;
5. grava passageiros em `sale_passengers` como staging;
6. tenta criar a cobrança Asaas.

Arquivos centrais:

- `src/pages/public/Checkout.tsx`
- `supabase/functions/create-asaas-payment/index.ts`

## 3.2. Fluxo administrativo: reserva manual

No admin, a venda manual não nasce como `pendente_pagamento`. Ela nasce como:

- `status = 'reservado'`
- `sale_origin = 'admin_manual'`
- `reservation_expires_at = now + 72 horas`

Além disso, no fluxo manual os assentos já são ocupados por `tickets`, não por `sale_passengers`/`seat_locks` como fonte primária de ocupação.

Arquivo central:

- `src/components/admin/NewSaleModal.tsx`

## 3.3. Confirmação de pagamento

Quando o pagamento é confirmado, o sistema usa rotina compartilhada de finalização:

- `asaas-webhook` chama `finalizeConfirmedPayment(...)`;
- `verify-payment-status` também chama `finalizeConfirmedPayment(...)`.

Essa rotina:

1. tenta atualizar `sales.status` para `pago`;
2. persiste `asaas_payment_status` e `payment_confirmed_at`;
3. cria `tickets` a partir de `sale_passengers` quando necessário;
4. apaga `sale_passengers`;
5. apaga `seat_locks` da venda.

Arquivos centrais:

- `supabase/functions/asaas-webhook/index.ts`
- `supabase/functions/verify-payment-status/index.ts`
- `supabase/functions/_shared/payment-finalization.ts`

## 3.4. Expiração/cancelamento automático

A rotina automática responsável por limpar/cancelar vendas vencidas é a edge function:

- `supabase/functions/cleanup-expired-locks/index.ts`

Ela trata **dois fluxos diferentes**:

### A) Checkout público (`pendente_pagamento`)

- detecta `seat_locks.expires_at < now()`;
- reúne `sale_id` dos locks expirados;
- só cancela vendas que **não possuem lock ativo remanescente**;
- atualiza `sales.status = 'cancelado'`;
- preenche `cancel_reason` e `cancelled_at`;
- zera `reservation_expires_at`;
- grava `sale_logs`;
- apaga `sale_passengers`;
- apaga os `seat_locks` expirados.

### B) Reserva manual administrativa (`reservado`)

- detecta `sales.reservation_expires_at < now()`;
- cancela a venda;
- grava `cancel_reason` e `cancelled_at`;
- limpa `reservation_expires_at`;
- grava `sale_logs`;
- apaga `tickets`, `seat_locks` e `sale_passengers` da venda.

## 3.5. Agendamento automático da limpeza

A edge function de cleanup não depende da tela admin. Ela é acionada por um job agendado em banco:

- migration `20261016090000_schedule_cleanup_expired_locks.sql`
- job `cleanup-expired-locks-every-1-minute`
- frequência: **1 vez por minuto**
- chamada HTTP interna para `/functions/v1/cleanup-expired-locks`

Conclusão do fluxo:

- **fonte da verdade do cancelamento automático do checkout público** = `cleanup-expired-locks` + `seat_locks.expires_at`
- **fonte da verdade do cancelamento automático da reserva manual** = `cleanup-expired-locks` + `sales.reservation_expires_at`

---

# 4. Arquivos/funções envolvidas

## Frontend administrativo

- `src/pages/admin/Sales.tsx`
  - `getPendingPaymentOperationalSignal(...)`
  - renderização do badge “Expirado operacionalmente”
  - `handleCancelSale(...)`
  - `handleChangeStatus(...)`

- `src/pages/admin/SalesDiagnostic.tsx`
  - `isManualReservationFlow(...)`
  - `buildOperationalTimeView(...)`
  - `computeLockStatus(...)`
  - `computePaymentStatus(...)`
  - `computeOperationalView(...)`

## Frontend público

- `src/pages/public/Checkout.tsx`
  - criação de `seat_locks`
  - criação de `sales` como `pendente_pagamento`
  - criação de `sale_passengers`
  - invocação de `create-asaas-payment`

- `src/pages/public/Confirmation.tsx`
  - polling da venda
  - chamadas periódicas a `verify-payment-status`
  - **não** executa cleanup/cancelamento por expiração

## Edge Functions / backend operacional

- `supabase/functions/create-asaas-payment/index.ts`
  - cria cobrança Asaas
  - persiste `asaas_payment_id`, `asaas_payment_status`, `payment_environment`

- `supabase/functions/asaas-webhook/index.ts`
  - confirma pagamento
  - cancela venda em caso de falha/cancelamento/expiração retornada pelo gateway

- `supabase/functions/verify-payment-status/index.ts`
  - fallback/manual sync de confirmação
  - **não** cancela automaticamente checkout expirado por timeout operacional local

- `supabase/functions/cleanup-expired-locks/index.ts`
  - rotina principal de cancelamento automático por expiração

- `supabase/functions/_shared/payment-finalization.ts`
  - finalização compartilhada de pagamento confirmado

- `supabase/functions/_shared/payment-observability.ts`
  - logs operacionais e de integração

## Migrations / schema

- `supabase/migrations/20260311010520_fc7a27bc-058e-418c-b4c9-289ec167e201.sql`
  - adiciona `pendente_pagamento`
  - cria `seat_locks`
  - cria `sale_passengers`

- `supabase/migrations/20260308131238_e77be19e-1cb7-4ef5-b54a-327f5514eb6c.sql`
  - adiciona `sale_origin`, `platform_fee_*`

- `supabase/migrations/20261026090000_add_manual_reservation_expiration.sql`
  - adiciona `reservation_expires_at`

- `supabase/migrations/20261016090000_schedule_cleanup_expired_locks.sql`
  - agenda cleanup automático

---

# 5. Campos de banco envolvidos

## Tabela `sales`

Campos relevantes encontrados:

- `id`
- `company_id`
- `event_id`
- `trip_id`
- `boarding_location_id`
- `seller_id`
- `status`
- `created_at`
- `updated_at`
- `gross_amount`
- `payment_method`
- `payment_environment`
- `sale_origin`
- `asaas_payment_id`
- `asaas_payment_status`
- `payment_confirmed_at`
- `cancel_reason`
- `cancelled_at`
- `cancelled_by`
- `platform_fee_status`
- `platform_fee_amount`
- `platform_fee_payment_id`
- `platform_fee_paid_at`
- `reservation_expires_at`
- `intermediation_responsibility_accepted`
- `intermediation_responsibility_accepted_at`

## Tabela `seat_locks`

Campos relevantes:

- `id`
- `trip_id`
- `seat_id`
- `sale_id`
- `company_id`
- `locked_at`
- `expires_at`
- `UNIQUE (trip_id, seat_id)`

## Tabela `sale_passengers`

Campos relevantes:

- `sale_id`
- `seat_id`
- `seat_label`
- `trip_id`
- `company_id`

## Tabela `tickets`

Campos relevantes:

- `sale_id`
- `trip_id`
- `seat_id`
- `seat_label`
- `boarding_status`
- `company_id`
- `UNIQUE (trip_id, seat_id)`

## Tabelas de auditoria

- `sale_logs`
- `sale_integration_logs`
- `asaas_webhook_event_dedup`

---

# 6. Regra atual encontrada

## 6.1. Regra do checkout público

### Quando nasce

A venda nasce como `pendente_pagamento` no checkout público.

### Quanto tempo pode permanecer aberta

O prazo operacional real é de **15 minutos**, derivado do TTL dos `seat_locks`.

Importante: a fonte real não é `created_at` no backend. O backend usa `seat_locks.expires_at` para decidir a expiração do checkout público.

### Evento que determina expiração operacional

O evento de expiração é:

- existência de `seat_locks.expires_at < now()` para a venda;
- desde que não reste lock ativo da mesma venda.

### Momento em que deveria virar `cancelado`

Ela deveria virar `cancelado` quando a edge function `cleanup-expired-locks` for executada **após** o vencimento do lock e verificar que não há lock ativo remanescente.

Ou seja, funcionalmente:

- prazo de negócio = 15 min;
- persistência do cancelamento = na próxima execução bem-sucedida do cleanup.

## 6.2. Regra da reserva manual admin

### Quando nasce

A venda manual nasce como `reservado`.

### Quanto tempo pode permanecer aberta

Hoje, a validade operacional explícita é de **72 horas**.

### Evento de expiração

`reservation_expires_at < now()`.

### Momento em que deveria virar `cancelado`

Na próxima execução bem-sucedida do `cleanup-expired-locks` após o vencimento.

## 6.3. Diferença prática entre os estados

### `pendente_pagamento`

- fluxo público do checkout;
- depende de `seat_locks`;
- janela curta de 15 min;
- pode ter cobrança Asaas em aberto.

### `reservado`

- fluxo manual/admin;
- depende de `reservation_expires_at` quando a reserva manual já foi adaptada para o novo modelo;
- pode coexistir com `platform_fee_status` pendente;
- assentos normalmente já ficam ocupados por `tickets`.

### “Expirado operacionalmente”

- **não é status persistido**;
- é sinal derivado de UI/diagnóstico;
- em `/admin/vendas`, no caso do checkout público, é inferido por `created_at + 15 min`, e não por `seat_locks.expires_at`.

### `cancelado`

- é o encerramento oficial persistido em `sales.status`;
- acompanhado de `cancel_reason` e `cancelled_at`.

### Reserva com taxa pendente

- é outro eixo de negócio;
- `platform_fee_status = pending/failed/paid/...` não substitui `sales.status`;
- serve especialmente ao fluxo administrativo e à promoção para `pago`.

---

# 7. Onde o fluxo quebra ou fica ambíguo

## 7.1. A listagem `/admin/vendas` cria estado híbrido visual

A função `getPendingPaymentOperationalSignal(...)` em `src/pages/admin/Sales.tsx` considera uma venda expirada quando:

- `sale.status === 'pendente_pagamento'`
- e `differenceInMinutes(now, created_at) > 15`

Problema objetivo:

- esse cálculo é **somente visual**;
- ele **não consulta `seat_locks.expires_at`**;
- ele **não persiste cancelamento**;
- ele **não chama cleanup**.

Então a tela pode dizer “Expirado operacionalmente” mesmo que:

- o cleanup ainda não tenha rodado;
- exista alguma discrepância entre `created_at` e `seat_locks.expires_at`;
- a venda siga oficialmente `pendente_pagamento`.

## 7.2. A fonte real do timeout e a fonte visual não são a mesma

No backend do checkout público, a expiração oficial depende de:

- `seat_locks.expires_at`

Na listagem admin `/admin/vendas`, a indicação de expiração depende de:

- `sales.created_at`

Isso cria **lógica paralela de leitura operacional**, exatamente o tipo de ambiguidade que o projeto diz evitar.

## 7.3. Se o cleanup não rodar, a venda entra em limbo operacional prolongado

O sistema foi desenhado para que a venda permaneça `pendente_pagamento` até a rotina automática concluir a limpeza/cancelamento. Portanto, se o job agendado falhar, atrasar ou não executar, o sistema fica com:

- status oficial ainda aberto;
- janela operacional vencida;
- UI acusando expiração;
- cancelamento não persistido.

Esse é o limbo observado.

## 7.4. O frontend público não resolve esse limbo de expiração

A página de confirmação chama `verify-payment-status`, mas esse fluxo está orientado a:

- confirmar pagamentos;
- reconciliar pagamento pago sem webhook.

Ela **não é a fonte de cancelamento por timeout operacional** do checkout expirado.

## 7.5. Falta evidência no código de retry/auditoria do job agendado em si

Há a migration que agenda o cron, mas na base de código analisada não há trilha específica persistida para responder facilmente:

- o job disparou ou não;
- em qual minuto falhou;
- qual lote de vendas expiradas ele tentou limpar;
- por que uma venda específica não foi alcançada naquela janela.

Ou seja: existe observabilidade de venda/integração, mas a observabilidade do **agendamento do cleanup** em si é limitada.

---

# 8. Impactos operacionais encontrados

## 8.1. O assento pode ficar preso indevidamente se o cleanup não apagar a linha de `seat_locks`

Este é o ponto mais crítico encontrado.

Mesmo que o checkout público consulte apenas locks com `expires_at > now()` para exibição, a tabela `seat_locks` possui:

- `UNIQUE (trip_id, seat_id)`

Consequência prática:

- se existir um lock expirado **ainda não deletado**, uma nova tentativa de inserir lock para o mesmo assento pode falhar por unicidade;
- portanto, o assento pode continuar operacionalmente bloqueado para novas compras **até a exclusão física do lock expirado**.

Conclusão: um checkout vencido e não limpo **pode sim prender assento indevidamente**.

## 8.2. Na reserva manual vencida, o cleanup é o responsável por liberar os tickets

No fluxo manual, a ocupação do assento está materializada em `tickets`.

Se a reserva manual vencer e o cleanup não executar, então:

- a venda pode seguir `reservado`;
- os `tickets` continuam existindo;
- a unicidade de `tickets (trip_id, seat_id)` pode manter a poltrona ocupada.

Conclusão: também há risco de assento preso no fluxo manual quando o cleanup falha.

## 8.3. Indicadores operacionais podem ficar distorcidos

Enquanto a venda não vira `cancelado` oficialmente:

- continua aparecendo em consultas de vendas abertas;
- pode gerar falsa sensação de pendência ativa;
- pode inflar acompanhamento operacional de vendas que já deveriam estar encerradas.

## 8.4. A UI da listagem não está fiel ao status persistido quando mistura badge + aviso derivado

A badge principal continua fiel ao banco (`pendente_pagamento`), mas o complemento visual comunica uma interpretação operacional derivada. Na prática, o usuário lê isso como um “quase status”, criando ambiguidade.

---

# 9. Diferenças entre comportamento esperado vs comportamento atual

## Esperado funcionalmente

Pela regra funcional descrita para o projeto:

- venda aberta deveria permanecer pouco tempo em espera;
- ao vencer a janela operacional, deveria ser cancelada automaticamente;
- não deveria existir limbo prolongado;
- o estado exibido deveria ser previsível e auditável.

## Atual encontrado no código

### O que está correto

- há fonte de verdade formal para expiração do checkout (`seat_locks.expires_at`);
- há fonte de verdade formal para expiração da reserva manual (`reservation_expires_at`);
- há rotina automática dedicada (`cleanup-expired-locks`);
- há separação explícita entre sandbox e produção no fluxo de pagamento (`payment_environment`);
- há limpeza de assentos vinculada ao cancelamento.

### O que está inconsistente

- `/admin/vendas` usa heurística visual baseada em `created_at`, não a mesma fonte real do backend;
- o cancelamento depende de job assíncrono externo à tela e não é refletido imediatamente;
- se o cleanup falha, o sistema entra em limbo operacional prolongado;
- não há trilha forte e direta do job de cleanup por execução/lote na base analisada.

### Resposta direta à dúvida central

**Sim, a compra em aberto deveria ser cancelada automaticamente após vencer a janela operacional.**

**Mas o cancelamento oficial não acontece no instante em que a UI detecta o vencimento; ele só acontece quando a rotina `cleanup-expired-locks` executa com sucesso.**

Logo, ver “Aguardando Pagamento” + “Expirado operacionalmente” significa:

- a venda já passou do prazo visual/operacional;
- porém ainda não houve persistência do cancelamento no banco.

---

# 10. Riscos de negócio

## Risco 1 — Limbo operacional prolongado

Uma venda expirada pode continuar oficialmente aberta por tempo indefinido se o cleanup não rodar.

## Risco 2 — Assentos presos indevidamente

Locks expirados ou tickets de reserva vencida podem continuar impedindo nova ocupação do assento até a limpeza física.

## Risco 3 — Ambiguidade para suporte/admin

A interface comunica simultaneamente um status persistido e um estado derivado, o que dificulta interpretação operacional e suporte.

## Risco 4 — Auditoria incompleta do cleanup

Sem trilha forte de execução do job, fica difícil responder por que uma venda específica não foi cancelada em tempo.

## Risco 5 — Divergência de leitura entre telas

A tela diagnóstica usa a fonte correta do tempo operacional por fluxo (`seat_locks.expires_at` ou `reservation_expires_at`), enquanto a listagem `/admin/vendas` usa `created_at` para o aviso de expiração do checkout público. Isso cria leituras diferentes do mesmo caso.

---

# 11. Conclusão objetiva

## Respostas fechadas às perguntas principais

### 1. A compra em aberto deveria ser cancelada automaticamente?

**Sim.**

- checkout público: após expirar o lock de 15 minutos e o cleanup executar;
- reserva manual: após vencer `reservation_expires_at` e o cleanup executar.

### 2. Hoje ela está sendo cancelada corretamente?

**Parcialmente.** O código de cancelamento automático existe e está implementado, mas o sintoma observado mostra que pelo menos em alguns casos a persistência do cancelamento não está acontecendo no tempo esperado.

### 3. Se não está, em qual ponto exato o fluxo para?

A evidência mais forte aponta para o trecho **entre “expiração operacional já ocorreu” e “execução bem-sucedida do cleanup-expired-locks”**.

Em outras palavras, o fluxo para no ponto em que a venda já venceu operacionalmente, mas a rotina automática ainda não concluiu:

- atualização de `sales.status` para `cancelado`;
- limpeza de `seat_locks`;
- limpeza de `sale_passengers` ou `tickets`.

### 4. O problema é de backend, frontend, rotina de manutenção, persistência ou combinação deles?

**Combinação.**

- **Frontend `/admin/vendas`**: cria estado híbrido visual usando heurística paralela (`created_at`).
- **Rotina de manutenção**: é o ponto mais provável de atraso/falha quando a venda continua aberta depois de vencida.
- **Persistência**: o status real continua aberto enquanto o cleanup não conclui.

### 5. O assento/vaga fica preso indevidamente?

**Pode ficar, sim.**

Principalmente porque `seat_locks` e `tickets` têm restrições de unicidade e a liberação real depende da limpeza física dos registros.

### 6. O status exibido na UI está fiel ao status real persistido?

**Só parcialmente.**

- o badge principal reflete o banco;
- o aviso “Expirado operacionalmente” é derivado e não persistido.

### 7. Existe limbo operacional indevido?

**Sim, existe possibilidade concreta e o sintoma mostrado é exatamente compatível com esse limbo.**

### 8. O comportamento está consistente entre sandbox e produção?

**Na lógica de expiração/cancelamento, sim, aparentemente a implementação é a mesma.** Não foi encontrada ramificação específica por ambiente dentro do cleanup. Já o fluxo de pagamento usa `payment_environment`, mas a rotina de expiração é comum. Ainda assim, como o agendamento depende de infraestrutura Supabase/cron/HTTP interna, a análise de código sozinha não prova que a automação esteja operacionalmente saudável nos dois ambientes ao mesmo tempo.

### 9. Qual é a menor correção segura recomendada depois desta análise?

Sem implementar agora, a menor correção segura provavelmente será:

1. alinhar `/admin/vendas` com a **mesma fonte real** usada pelo backend para expiração do checkout público (`seat_locks.expires_at`), removendo heurística baseada em `created_at`; e/ou
2. reforçar a auditabilidade/saúde da execução do `cleanup-expired-locks`, porque é ali que o cancelamento oficial está ficando pendurado.

## Diagnóstico final consolidado

O sistema **tem** uma regra formal de cancelamento automático, mas a UX atual da listagem `/admin/vendas` expõe um estado híbrido porque:

- a tela calcula expiração por um critério visual paralelo;
- o cancelamento oficial depende de uma rotina assíncrona separada;
- quando essa rotina não conclui no tempo esperado, a venda fica em limbo operacional e pode até manter assento preso.

---

# 12. Próximos passos recomendados

## Passo 1 — Validar operacionalmente o cleanup agendado

Confirmar fora do código, mas dentro do fluxo oficial do projeto, se o job `cleanup-expired-locks-every-1-minute` está executando e retornando sucesso.

## Passo 2 — Unificar a fonte de verdade na UI

Na correção futura, revisar `/admin/vendas` para não inferir expiração do checkout por `created_at` quando o backend usa `seat_locks.expires_at`.

## Passo 3 — Fortalecer auditabilidade do cleanup

Adicionar trilha objetiva por execução/lote do cleanup, de forma que suporte consiga responder:

- quando rodou;
- quantas vendas candidatou;
- quantas cancelou;
- quais falharam;
- por quê.

## Passo 4 — Revisar explicitamente impacto de assento preso

Na etapa de correção, tratar como prioridade operacional a possibilidade de lock expirado ainda bloquear nova compra por unicidade, mesmo sem aparecer como ativo na UI pública.

## Passo 5 — Consolidar regra oficial por tipo de venda

Documentar no próprio fluxo técnico do projeto:

- checkout público → `pendente_pagamento` + `seat_locks.expires_at`
- admin manual → `reservado` + `reservation_expires_at`
- cancelamento automático → `cleanup-expired-locks`

Assim a regra fica previsível, auditável e sem leituras paralelas.
