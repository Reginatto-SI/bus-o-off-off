# Auditoria Final — Webhook Asaas (Smartbus BR)

## 1. Resumo executivo

**Conclusão curta:** a arquitetura auditada **evoluiu materialmente** nas Etapas 1, 2 e 3 e hoje está **mais determinística, mais resiliente e mais rastreável** do que o desenho anterior, porém **não está 100% aderente ao esperado em todos os pontos**.

### Veredito objetivo
- **Etapa 1 — Blindagem do webhook:** **parcialmente correta, com boa implementação central**, mas ainda há respostas não-2xx em cenários relevantes do webhook (`400`, `401`, `404`, `500`) e isso reduz a robustez operacional esperada.
- **Etapa 2 — Origem do ambiente:** **majoritariamente correta**. O checkout define e persiste `payment_environment`, o create usa esse valor e trava mismatch após `asaas_payment_id`. Porém ainda existe **heurística por host no frontend** e **infra legada de fallback por host** no backend/shared, ainda que fora do caminho principal.
- **Etapa 3 — Observabilidade e deduplicação:** **majoritariamente correta**. Há tabela dedicada de deduplicação, tentativa de insert antes do processamento, retorno `200` em duplicata, incremento de contador e logs técnicos enriquecidos. A principal lacuna é de **consistência semântica de classificação** em alguns ramos e o fato de que a deduplicação depende de o Asaas enviar `event.id`.

### Pode confiar?
- **Pode confiar com ressalvas operacionais.**
- Para o fluxo principal de venda pública com `payment_environment` persistido corretamente e `event.id` presente no webhook, o comportamento está **coeso e significativamente mais seguro**.
- Ainda assim, **não considero prudente classificar a implementação como “blindada” sem ressalvas**, porque existem cenários reais em que o webhook responde erro ao provedor ou em que a origem do ambiente ainda nasce de uma heurística de hostname no frontend.

---

## 2. O que está correto (confirmado no código)

### 2.1 Webhook faz deduplicação por `event.id`
- O webhook extrai `requestPayload?.id ?? requestPayload?.eventId` como identificador do evento Asaas. Depois, tenta inserir esse identificador em `asaas_webhook_event_dedup` **antes** de processar o evento. Se ocorrer `23505`, chama `mark_asaas_webhook_event_duplicate(...)`, incrementa `duplicate_count` e retorna `200` com `duplicate: true`, sem reprocesar o fluxo. Isso atende o núcleo esperado da Etapa 3. 【F:supabase/functions/asaas-webhook/index.ts†L178-L183】【F:supabase/functions/asaas-webhook/index.ts†L116-L159】【F:supabase/functions/asaas-webhook/index.ts†L404-L451】
- A tabela dedicada existe, tem `asaas_event_id` como **chave primária**, campos de auditoria (`first_received_at`, `last_seen_at`, `duplicate_count`) e função dedicada para atualização da duplicidade. 【F:supabase/migrations/20261017090000_stage3_payment_observability_dedup.sql†L75-L94】【F:supabase/migrations/20261017090000_stage3_payment_observability_dedup.sql†L114-L136】

### 2.2 Eventos duplicados retornam `200` e não reprocessam
- O caminho de duplicata monta `ProcessingResult` com `status: "duplicate"`, `resultCategory: "duplicate"`, `httpStatus: 200` e encerra a execução imediatamente após registrar o log técnico. Não há continuação para `processPaymentConfirmed` ou `processPaymentFailed`. 【F:supabase/functions/asaas-webhook/index.ts†L416-L451】

### 2.3 Eventos fora de ordem deixaram de ser destrutivos para venda já paga
- Para eventos de falha (`PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_REFUNDED`), o webhook só cancela a venda se ela ainda estiver em `pendente_pagamento` ou `reservado`. Se a venda já tiver saído do estado cancelável, o update não encontra linha e o fluxo passa a responder `ignored` com `200`, apenas atualizando `asaas_payment_status`. Isso evita que um evento tardio cancele uma venda já paga/saudável. 【F:supabase/functions/asaas-webhook/index.ts†L929-L990】

### 2.4 Limpeza de `seat_locks` não derruba pagamento confirmado
- A finalização compartilhada (`finalizeConfirmedPayment`) confirma a venda, gera tickets e só depois tenta limpar `seat_locks`. Se a limpeza falhar, a rotina **não falha o pagamento**: retorna `ok: true`, `state: "warning"`, `httpStatus: 200`. Isso implementa exatamente a blindagem pedida na Etapa 1 para cleanup acessório. 【F:supabase/functions/_shared/payment-finalization.ts†L213-L255】【F:supabase/functions/_shared/payment-finalization.ts†L304-L336】

### 2.5 Webhook e verify usam a mesma rotina central de finalização
- Tanto `asaas-webhook` quanto `verify-payment-status` chamam `finalizeConfirmedPayment(...)`. Isso reduz assimetria e alinha geração de tickets, tratamento de inconsistência e cleanup entre os dois fluxos. 【F:supabase/functions/asaas-webhook/index.ts†L749-L804】【F:supabase/functions/verify-payment-status/index.ts†L362-L401】【F:supabase/functions/_shared/payment-finalization.ts†L172-L371】

### 2.6 Checkout define explicitamente o ambiente e persiste na venda
- O frontend resolve o ambiente em `useRuntimePaymentEnvironment()` e o checkout grava `payment_environment` no `insert` da venda **antes** de chamar `create-asaas-payment`. Depois, envia o mesmo valor explicitamente no body da Edge Function. Isso confirma o núcleo da Etapa 2. 【F:src/hooks/use-runtime-payment-environment.ts†L19-L68】【F:src/pages/public/Checkout.tsx†L780-L792】【F:src/pages/public/Checkout.tsx†L868-L877】

### 2.7 `create-asaas-payment` usa o ambiente explícito e trava mismatch após vínculo Asaas
- `create-asaas-payment` valida `payment_environment` do request, exige esse valor quando a venda ainda não está “travada” e, se já houver `asaas_payment_id`, compara o ambiente pedido com o ambiente persistido, retornando `409 payment_environment_mismatch` quando divergem. 【F:supabase/functions/create-asaas-payment/index.ts†L111-L115】【F:supabase/functions/create-asaas-payment/index.ts†L159-L221】
- Depois de resolver o contexto, a função persiste `payment_environment` antes de falar com o Asaas e volta a gravá-lo junto com `asaas_payment_id`/`asaas_payment_status`, consolidando a venda como fonte de verdade. 【F:supabase/functions/create-asaas-payment/index.ts†L344-L379】【F:supabase/functions/create-asaas-payment/index.ts†L740-L761】

### 2.8 `verify-payment-status` e `asaas-webhook` usam o ambiente da venda, não recalculam host
- `verify-payment-status` lê `sale.payment_environment` e passa a venda ao `resolvePaymentContext({ mode: "verify", sale, company })`. 【F:supabase/functions/verify-payment-status/index.ts†L74-L79】【F:supabase/functions/verify-payment-status/index.ts†L207-L245】
- O webhook primeiro busca `payment_environment` no banco pela venda e só então resolve o contexto para validação do token e rastreabilidade. Não há recálculo por host no caminho principal do webhook. 【F:supabase/functions/asaas-webhook/index.ts†L96-L113】【F:supabase/functions/asaas-webhook/index.ts†L198-L245】

### 2.9 Observabilidade técnica foi ampliada de forma real
- `sale_integration_logs` agora suporta `asaas_event_id`, `result_category`, `incident_code`, `warning_code`, `duration_ms`, além de `payment_environment` e campos de decisão de ambiente. 【F:supabase/migrations/20261017090000_stage3_payment_observability_dedup.sql†L11-L17】【F:supabase/migrations/20261001120000_harden_payment_environment_and_logs.sql†L34-L82】
- `logSaleIntegrationEvent` persiste efetivamente esses campos, inclusive com `sale_id`/`company_id` opcionais, o que permite rastreamento mesmo sem correlação completa. 【F:supabase/functions/_shared/payment-observability.ts†L113-L158】
- `verify-payment-status` de fato persiste logs em praticamente todos os desfechos relevantes por meio de `persistVerifyLog(...)`. 【F:supabase/functions/verify-payment-status/index.ts†L101-L131】【F:supabase/functions/verify-payment-status/index.ts†L145-L205】【F:supabase/functions/verify-payment-status/index.ts†L227-L287】【F:supabase/functions/verify-payment-status/index.ts†L309-L345】【F:supabase/functions/verify-payment-status/index.ts†L384-L545】

### 2.10 O domínio de `payment_environment` foi endurecido no banco
- A coluna existe em `sales` desde a migration original com `DEFAULT 'sandbox'`, e depois ganhou normalização + `CHECK (payment_environment IN ('sandbox', 'production'))`. Isso reduz lixo de dado e melhora determinismo. 【F:supabase/migrations/20260317000601_caa381c3-87bf-4b5a-879e-8348a25a6ee7.sql†L1-L1】【F:supabase/migrations/20261001120000_harden_payment_environment_and_logs.sql†L4-L32】

---

## 3. O que está parcialmente correto

### 3.1 A classificação de resultado existe, mas não é totalmente consistente
- O webhook usa `status` e `resultCategory` de maneira estruturada, e `sale_integration_logs` aceita uma taxonomia ampla. 【F:supabase/functions/asaas-webhook/index.ts†L25-L61】【F:supabase/migrations/20261017090000_stage3_payment_observability_dedup.sql†L19-L37】【F:supabase/migrations/20261017090000_stage3_payment_observability_dedup.sql†L39-L66】
- Porém, em alguns ramos há inconsistência semântica. Exemplo: no fluxo de taxa de plataforma, um evento de falha que marca `platform_fee_status = 'failed'` retorna `status: "success"` / `resultCategory: "success"`, embora operacionalmente seja uma falha tratada. 【F:supabase/functions/asaas-webhook/index.ts†L702-L746】
- Outro exemplo: `verify-payment-status` usa `resultCategory: "healthy"` ou `"payment_confirmed"`, enquanto o webhook para casos equivalentes usa mais frequentemente `"success"` ou `"partial_failure"`. Isso não quebra a auditoria, mas significa que a classificação **não está 100% homogênea entre funções**. 【F:supabase/functions/verify-payment-status/index.ts†L166-L180】【F:supabase/functions/verify-payment-status/index.ts†L475-L483】【F:supabase/functions/asaas-webhook/index.ts†L772-L829】

### 3.2 Há blindagem contra não-2xx evitáveis, mas não eliminação ampla de não-2xx
- O desenho realmente evita `non-2xx` em cenários como duplicata, evento ignorado, falha de cleanup de `seat_locks` e inconsistência pós-confirmação com tickets ausentes. 【F:supabase/functions/asaas-webhook/index.ts†L375-L401】【F:supabase/functions/asaas-webhook/index.ts†L416-L451】【F:supabase/functions/asaas-webhook/index.ts†L772-L800】【F:supabase/functions/asaas-webhook/index.ts†L997-L1013】
- Mas o webhook ainda responde `400` para ambiente não resolvido ou payload inválido, `401` para token inválido, `404` para venda não encontrada e `500` para erro inesperado/secret ausente. Ou seja: houve redução localizada, não blindagem total. 【F:supabase/functions/asaas-webhook/index.ts†L212-L239】【F:supabase/functions/asaas-webhook/index.ts†L269-L329】【F:supabase/functions/asaas-webhook/index.ts†L341-L363】【F:supabase/functions/asaas-webhook/index.ts†L521-L544】【F:supabase/functions/asaas-webhook/index.ts†L594-L620】

### 3.3 A origem do ambiente saiu do host no backend, mas continua baseada em hostname no frontend
- O que foi prometido como “definido no frontend” está correto: o checkout resolve o ambiente no browser e o envia explicitamente. 【F:src/hooks/use-runtime-payment-environment.ts†L19-L68】【F:src/pages/public/Checkout.tsx†L780-L792】【F:src/pages/public/Checkout.tsx†L868-L877】
- Porém essa resolução no frontend ainda depende de `window.location.origin`/hostname quando `VITE_PAYMENT_ENVIRONMENT` não está definido. Logo, a decisão inicial não é mais por host **encaminhado até a Edge Function**, mas **continua sendo uma heurística por domínio no cliente**. 【F:src/hooks/use-runtime-payment-environment.ts†L26-L41】【F:src/hooks/use-runtime-payment-environment.ts†L57-L63】

### 3.4 Existe infraestrutura legada de fallback por host no backend/shared
- `resolvePaymentContext` ainda mantém um ramo opcional `allowHostFallback` que usa `resolveEnvironmentFromHost(req)`. O comentário diz ser apenas fallback controlado/compatibilidade, e o caminho principal auditado não o utiliza. Ainda assim, a heurística permanece no código compartilhado. 【F:supabase/functions/_shared/payment-context-resolver.ts†L125-L172】【F:supabase/functions/_shared/runtime-env.ts†L10-L69】
- Além disso, a constraint de `sale_integration_logs_environment_decision_source_check` aceita apenas `sale` ou `host`, mas o código atual de `resolvePaymentContext` produz também `request`. Isso sugere desalinhamento entre modelo e implementação. Se algum fluxo tentar persistir `environment_decision_source: "request"`, a insert pode falhar e cair no log de erro de observabilidade. 【F:supabase/functions/_shared/payment-context-resolver.ts†L141-L157】【F:supabase/migrations/20261001120000_harden_payment_environment_and_logs.sql†L64-L79】【F:supabase/functions/_shared/payment-observability.ts†L136-L172】

### 3.5 A deduplicação é correta quando `event.id` existe, mas é bypassada quando ele não existe
- `registerWebhookEvent(...)` simplesmente retorna `{ isDuplicate: false }` quando `asaasEventId` está ausente. Isso é coerente tecnicamente, mas significa que a deduplicação **não protege payloads sem `id`/`eventId`**. 【F:supabase/functions/asaas-webhook/index.ts†L116-L128】
- Como o planejamento pedia deduplicação por `event.id`, a implementação está correta **condicionalmente à presença do identificador**, não de forma absoluta.

---

## 4. O que NÃO está implementado

### 4.1 Não existe eliminação completa de respostas erradas do webhook
- O planejamento da Etapa 1 falava em redução de respostas não-2xx evitáveis e comportamento mais resiliente. Isso foi parcialmente feito, mas o sistema **não implementa uma política de sempre responder 2xx em incidentes recuperáveis/operacionais**. Ainda há múltiplos cenários de erro duro. 【F:supabase/functions/asaas-webhook/index.ts†L212-L239】【F:supabase/functions/asaas-webhook/index.ts†L269-L329】【F:supabase/functions/asaas-webhook/index.ts†L521-L544】【F:supabase/functions/asaas-webhook/index.ts†L594-L620】

### 4.2 Não há uniformidade plena de classificação entre create / verify / webhook
- O create usa mapeamento próprio de `requested/success/warning/failed/rejected`, o webhook usa `duplicate`, `partial_failure`, `unauthorized` etc., e o verify usa categorias adicionais como `healthy` e `payment_confirmed`. O sistema tem observabilidade enriquecida, mas **não uma taxonomia totalmente uniforme** entre todas as funções auditadas. 【F:supabase/functions/create-asaas-payment/index.ts†L420-L459】【F:supabase/functions/verify-payment-status/index.ts†L101-L131】【F:supabase/functions/asaas-webhook/index.ts†L25-L61】

### 4.3 A decisão inicial do ambiente não é “puramente explícita” em todos os cenários de frontend
- Se `VITE_PAYMENT_ENVIRONMENT` não estiver setado, o valor nasce da leitura do hostname no browser. Isso não é decisão manual/configurada de negócio; continua sendo inferência de domínio. 【F:src/hooks/use-runtime-payment-environment.ts†L24-L41】【F:src/hooks/use-runtime-payment-environment.ts†L57-L63】

### 4.4 O banco não está alinhado com todos os `environment_decision_source` realmente usados pelo código
- O código pode produzir `request`, mas a constraint do banco aceita apenas `sale` ou `host`. Portanto, a persistência desse campo **não está plenamente implementada de forma compatível com o próprio contrato do código**. 【F:supabase/functions/_shared/payment-context-resolver.ts†L141-L157】【F:supabase/migrations/20261001120000_harden_payment_environment_and_logs.sql†L64-L79】

---

## 5. Inconsistências encontradas

### 5.1 Constraint do banco vs código para `environment_decision_source`
- **Código:** `resolvePaymentContext` pode devolver `environmentSource` igual a `sale`, `request` ou `host`. 【F:supabase/functions/_shared/payment-context-resolver.ts†L17-L23】【F:supabase/functions/_shared/payment-context-resolver.ts†L140-L162】
- **Banco:** `sale_integration_logs_environment_decision_source_check` aceita apenas `sale` ou `host`. 【F:supabase/migrations/20261001120000_harden_payment_environment_and_logs.sql†L64-L79】
- **Impacto:** logs do create podem tentar gravar `request` e falhar silenciosamente na persistência, ficando apenas no `console.error` do `integration_log_insert_failed`. Isso afeta observabilidade real justamente no caso em que a Etapa 2 queria evidenciar a origem explícita do ambiente. 【F:supabase/functions/create-asaas-payment/index.ts†L428-L459】【F:supabase/functions/_shared/payment-observability.ts†L136-L172】

### 5.2 `sales.payment_environment` ainda nasce com default `sandbox`
- A coluna `sales.payment_environment` foi criada como `NOT NULL DEFAULT 'sandbox'`. 【F:supabase/migrations/20260317000601_caa381c3-87bf-4b5a-879e-8348a25a6ee7.sql†L1-L1】
- O checkout já grava explicitamente o valor correto, mas qualquer criação de venda fora desse caminho pode nascer como `sandbox` sem que isso represente uma decisão real do fluxo. A própria `create-asaas-payment` tenta corrigir isso antes da cobrança, o que indica que o default do banco continua sendo um ponto de atenção. 【F:supabase/functions/create-asaas-payment/index.ts†L344-L379】

### 5.3 Inconsistência semântica no fluxo de taxa de plataforma
- Quando há evento de falha da taxa de plataforma, a venda é marcada com `platform_fee_status = 'failed'`, mas o `ProcessingResult` retorna `status: "success"` / `resultCategory: "success"`. Isso é uma inconsistência de classificação de resultado. 【F:supabase/functions/asaas-webhook/index.ts†L702-L746】

### 5.4 Webhook rejeita ambiente ausente com `400`, apesar do objetivo de maior resiliência
- A implementação escolheu ser estrita: sem ambiente persistido, rejeita o webhook. Isso aumenta determinismo, mas conflita parcialmente com a expectativa de “comportamento mais resiliente” caso existam vendas antigas, corrompidas ou fluxos periféricos sem `payment_environment` válido. 【F:supabase/functions/asaas-webhook/index.ts†L206-L239】

### 5.5 `verify-payment-status` registra logs, mas o bloco `catch` final não persiste log técnico
- Em quase todos os ramos o verify chama `persistVerifyLog`. Porém, no `catch` externo, ele só faz `logPaymentTrace` e retorna `500`, sem registrar uma linha em `sale_integration_logs`. Isso gera uma pequena lacuna de rastreabilidade justamente nos erros mais inesperados. 【F:supabase/functions/verify-payment-status/index.ts†L547-L554】

---

## 6. Riscos reais ainda existentes

### 6.1 Risco de ambiente nascer errado fora do checkout público principal
- Como a coluna ainda tem `DEFAULT 'sandbox'`, qualquer criação de venda fora do checkout que não persista explicitamente o ambiente pode produzir dado inicial incorreto. Se esse registro for consumido mais tarde por verify/webhook, o sistema pode operar no ambiente errado ou rejeitar o evento. 【F:supabase/migrations/20260317000601_caa381c3-87bf-4b5a-879e-8348a25a6ee7.sql†L1-L1】【F:supabase/functions/asaas-webhook/index.ts†L206-L239】

### 6.2 Risco operacional por heurística de hostname no frontend
- O ambiente do checkout é “explícito” no payload, mas nasce de hostname quando `VITE_PAYMENT_ENVIRONMENT` não está setado. Domínio alternativo, espelho, preview, proxy ou configuração de deploy equivocada podem fazer o ambiente nascer errado desde a origem. 【F:src/hooks/use-runtime-payment-environment.ts†L24-L41】【F:src/hooks/use-runtime-payment-environment.ts†L57-L63】

### 6.3 Risco de perda parcial de observabilidade no create
- Se `environment_decision_source = 'request'` for persistido e a constraint atual do banco rejeitar esse valor, o log técnico pode falhar. O sistema segue operando, mas a auditoria fica incompleta no fluxo de criação. 【F:supabase/migrations/20261001120000_harden_payment_environment_and_logs.sql†L64-L79】【F:supabase/functions/create-asaas-payment/index.ts†L428-L459】【F:supabase/functions/_shared/payment-observability.ts†L159-L172】

### 6.4 Risco de reentrega do webhook em cenários ainda tratados como erro duro
- Ambiente ausente, token inválido, venda não encontrada, secret ausente e exceção inesperada ainda produzem respostas não-2xx. Isso pode causar retries do Asaas e ruído operacional. 【F:supabase/functions/asaas-webhook/index.ts†L212-L239】【F:supabase/functions/asaas-webhook/index.ts†L269-L329】【F:supabase/functions/asaas-webhook/index.ts†L521-L544】【F:supabase/functions/asaas-webhook/index.ts†L594-L620】

### 6.5 Risco de dedup não atuar se o evento não vier com `id`
- Sem `id`/`eventId`, o webhook não usa a tabela de deduplicação e processa normalmente. Se o provedor reenviar esse payload sem identificador estável, o controle recai apenas sobre a idempotência indireta da rotina de finalização/cancelamento. 【F:supabase/functions/asaas-webhook/index.ts†L116-L128】【F:supabase/functions/_shared/payment-finalization.ts†L105-L170】

---

## 7. Divergências entre planejamento vs implementação

### Etapa 1 — Blindagem do webhook
**Planejado:** reduzir respostas não-2xx evitáveis, blindar eventos fora de ordem, impedir cleanup destrutivo, ser resiliente.  
**Implementado:**
- blindagem contra eventos fora de ordem: **sim**; 【F:supabase/functions/asaas-webhook/index.ts†L954-L990】
- cleanup de `seat_locks` não derruba confirmação: **sim**; 【F:supabase/functions/_shared/payment-finalization.ts†L304-L336】
- inconsistência de ticket após confirmação não gera não-2xx ao Asaas: **sim**; 【F:supabase/functions/asaas-webhook/index.ts†L772-L800】
- redução de não-2xx: **parcial**; ainda existem vários `400/401/404/500`. 【F:supabase/functions/asaas-webhook/index.ts†L212-L239】【F:supabase/functions/asaas-webhook/index.ts†L269-L329】【F:supabase/functions/asaas-webhook/index.ts†L521-L544】【F:supabase/functions/asaas-webhook/index.ts†L594-L620】

### Etapa 2 — Origem do ambiente
**Planejado:** ambiente definido no frontend, persistido na venda, create não decide mais por host, ambiente trava após `asaas_payment_id`, consistência entre create/verify/webhook.  
**Implementado:**
- frontend define e envia explicitamente: **sim**; 【F:src/pages/public/Checkout.tsx†L780-L792】【F:src/pages/public/Checkout.tsx†L868-L877】
- valor persistido desde a venda: **sim**; 【F:src/pages/public/Checkout.tsx†L780-L792】
- create deixa de usar host como decisão primária: **sim no caminho principal**; 【F:supabase/functions/create-asaas-payment/index.ts†L167-L257】
- ambiente trava após `asaas_payment_id`: **sim**; 【F:supabase/functions/create-asaas-payment/index.ts†L159-L221】
- convergência create/verify/webhook: **sim, em grande parte**; 【F:supabase/functions/create-asaas-payment/index.ts†L740-L761】【F:supabase/functions/verify-payment-status/index.ts†L213-L259】【F:supabase/functions/asaas-webhook/index.ts†L206-L245】
- divergência remanescente: o frontend ainda resolve por hostname quando não há variável explícita, e o backend shared ainda mantém fallback por host. 【F:src/hooks/use-runtime-payment-environment.ts†L24-L41】【F:supabase/functions/_shared/payment-context-resolver.ts†L158-L172】【F:supabase/functions/_shared/runtime-env.ts†L55-L69】

### Etapa 3 — Observabilidade e deduplicação
**Planejado:** logs mais completos, classificação de resultado, dedup por `event.id`, tabela dedicada, rastreabilidade sem `sale_id/company_id`.  
**Implementado:**
- logs técnicos ampliados: **sim**; 【F:supabase/migrations/20261017090000_stage3_payment_observability_dedup.sql†L11-L17】【F:supabase/functions/_shared/payment-observability.ts†L113-L158】
- classificação de resultado: **sim, porém heterogênea**; 【F:supabase/functions/asaas-webhook/index.ts†L25-L61】【F:supabase/functions/verify-payment-status/index.ts†L101-L131】
- dedup por `event.id`: **sim**; 【F:supabase/functions/asaas-webhook/index.ts†L404-L451】【F:supabase/migrations/20261017090000_stage3_payment_observability_dedup.sql†L75-L136】
- tabela dedicada: **sim**; 【F:supabase/migrations/20261017090000_stage3_payment_observability_dedup.sql†L75-L97】
- rastreabilidade sem `sale_id/company_id`: **sim em `sale_integration_logs`**, não necessariamente em `sale_logs`; 【F:supabase/migrations/20261017090000_stage3_payment_observability_dedup.sql†L4-L9】【F:supabase/functions/_shared/payment-observability.ts†L79-L92】【F:supabase/functions/_shared/payment-observability.ts†L136-L158】
- lacuna: constraint de `environment_decision_source` desalinhada com o valor `request`. 【F:supabase/migrations/20261001120000_harden_payment_environment_and_logs.sql†L64-L79】【F:supabase/functions/_shared/payment-context-resolver.ts†L141-L157】

---

## 8. Pontos críticos que exigem atenção

1. **Constraint incompatível com `environment_decision_source = 'request'`.**  
   Esta é a inconsistência técnica mais concreta entre banco e código na auditoria. Ela afeta diretamente a observabilidade prometida na Etapa 2/3. 【F:supabase/migrations/20261001120000_harden_payment_environment_and_logs.sql†L64-L79】【F:supabase/functions/_shared/payment-context-resolver.ts†L141-L157】

2. **Webhook ainda devolve não-2xx em cenários operacionais relevantes.**  
   A blindagem melhorou, mas a promessa de maior resiliência não pode ser considerada plena enquanto ambiente ausente, venda não encontrada e outros incidentes continuarem devolvendo erro ao provedor. 【F:supabase/functions/asaas-webhook/index.ts†L212-L239】【F:supabase/functions/asaas-webhook/index.ts†L521-L544】

3. **Origem do ambiente no frontend ainda depende de hostname quando `VITE_PAYMENT_ENVIRONMENT` não existe.**  
   Isso reduz dependência de header no backend, mas não elimina a heurística de domínio como fator decisivo de origem. 【F:src/hooks/use-runtime-payment-environment.ts†L24-L41】【F:src/hooks/use-runtime-payment-environment.ts†L57-L63】

4. **`DEFAULT 'sandbox'` na venda continua perigoso fora do caminho feliz.**  
   O checkout público já persiste explicitamente, mas o default ainda pode mascarar ambiente “nascido errado” em fluxos paralelos ou dados legados. 【F:supabase/migrations/20260317000601_caa381c3-87bf-4b5a-879e-8348a25a6ee7.sql†L1-L1】

5. **Classificação de resultado não é totalmente uniforme.**  
   Isso não impede operação, mas prejudica leitura analítica e alertas operacionais consistentes. 【F:supabase/functions/verify-payment-status/index.ts†L475-L483】【F:supabase/functions/asaas-webhook/index.ts†L702-L746】

---

## 9. Conclusão geral (pode ou não pode confiar)

### Conclusão final
**Pode confiar com cautela técnica, mas não como implementação “perfeitamente aderente” ao planejado.**

### Em termos práticos
- **Sim**, há evidência clara de que as Etapas 1, 2 e 3 **foram implementadas de verdade no código**, e não apenas documentadas.
- **Sim**, os principais pilares esperados existem: ambiente persistido na venda, create/verify/webhook convergindo nessa fonte de verdade, deduplicação por `event.id`, logs enriquecidos, rotina compartilhada de finalização e blindagem contra cleanup destrutivo. 【F:src/pages/public/Checkout.tsx†L780-L792】【F:supabase/functions/create-asaas-payment/index.ts†L159-L257】【F:supabase/functions/verify-payment-status/index.ts†L213-L259】【F:supabase/functions/asaas-webhook/index.ts†L404-L451】【F:supabase/functions/_shared/payment-finalization.ts†L172-L371】
- **Não**, isso não significa que tudo esteja “fechado”. Permanecem lacunas reais: constraint incompatível com `request`, webhook ainda com respostas não-2xx em incidentes relevantes, origem inicial ainda baseada em hostname no frontend e default `sandbox` no banco. 【F:supabase/migrations/20261001120000_harden_payment_environment_and_logs.sql†L64-L79】【F:supabase/functions/asaas-webhook/index.ts†L212-L239】【F:src/hooks/use-runtime-payment-environment.ts†L24-L41】【F:supabase/migrations/20260317000601_caa381c3-87bf-4b5a-879e-8348a25a6ee7.sql†L1-L1】

### Veredito de auditoria
- **Arquitetura atual:** **boa e madura o suficiente para operação controlada**.
- **Aderência ao planejamento:** **alta, mas não total**.
- **Nível de confiança recomendado:** **moderado para alto**, desde que o time reconheça explicitamente as ressalvas acima e não trate o desenho como “blindado sem exceções”.
