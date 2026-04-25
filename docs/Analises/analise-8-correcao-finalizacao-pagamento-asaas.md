# Análise 8 — Correção da finalização de pagamento Asaas

## Objetivo

Registrar a correção mínima, segura e isolada aplicada para impedir que o caminho de notificação administrativa quebre a atualização da venda para `pago` durante a finalização do pagamento Asaas.

## Causa raiz confirmada

O caso real da venda `30400fef-99fe-4418-8357-7085b000c823` confirmou que:

- a cobrança Asaas foi criada corretamente;
- o `verify-payment-status` encontrou o pagamento confirmado;
- `finalizeConfirmedPayment(...)` foi chamado;
- a atualização de `sales.status = 'pago'` falhou com o erro:

`there is no unique or exclusion constraint matching the ON CONFLICT specification`

- a falha vinha do caminho do trigger `trg_notify_sale_status_updates`, que chamava `create_admin_notification(...)`;
- a implementação anterior usava `ON CONFLICT (company_id, type, dedupe_key)` contra um índice único parcial em `admin_notifications`.

## Arquivos alterados

- `supabase/migrations/20260322123000_fix_admin_notifications_payment_finalization.sql`
- `analise-8-correcao-finalizacao-pagamento-asaas.md`

## Solução aplicada

A correção foi concentrada em **uma nova migration**, sem refatorar o fluxo Asaas e sem alterar telas.

### 1) Ajuste da função SQL `create_admin_notification(...)`
Foi removido o `ON CONFLICT (company_id, type, dedupe_key) DO NOTHING` incompatível com o índice parcial existente.

No lugar, a deduplicação passou a ser feita com:
- `INSERT ... SELECT ... WHERE NOT EXISTS (...)`

Isso preserva o comportamento funcional de deduplicação por:
- `company_id`
- `type`
- `dedupe_key`

sem depender de inferência de índice parcial pelo `ON CONFLICT`.

### 2) Blindagem do trigger `notify_sale_status_updates()`
O trigger de atualização da venda passou a encapsular cada chamada de notificação em bloco `BEGIN ... EXCEPTION WHEN OTHERS ... END`.

Resultado:
- a notificação administrativa continua sendo tentada;
- se ela falhar por qualquer motivo, o trigger emite `RAISE WARNING`;
- a atualização principal da venda **não é abortada**.

## Por que essa foi a correção mínima escolhida

Esta foi a menor correção segura porque:

1. **ataca diretamente a causa confirmada**, sem mexer no fluxo de pagamento em si;
2. **não cria fluxo paralelo**;
3. **não muda o contrato do webhook, verify ou create payment**;
4. **preserva as notificações administrativas**, em vez de simplesmente desativá-las;
5. **reduz o risco sistêmico**, blindando o fluxo principal contra futuras falhas acessórias no trigger.

### Alternativas avaliadas

#### Ajustar apenas índice/constraint para combinar com `ON CONFLICT`
Não foi a opção escolhida porque exigiria alterar a estratégia de unicidade da tabela `admin_notifications` para casar com o `ON CONFLICT`, com risco maior de mexer desnecessariamente na modelagem de deduplicação já existente.

#### Ajustar apenas `payment-finalization.ts`
Não resolveria a origem estrutural do erro no banco. O problema era disparado no caminho SQL do trigger, não na lógica TypeScript em si.

#### Ignorar totalmente notificações administrativas
Seria um workaround mais agressivo e com perda funcional desnecessária.

## Riscos avaliados

### 1) Triggers existentes
Impacto controlado.

A migration altera apenas a função:
- `public.notify_sale_status_updates()`

Não remove trigger, não muda assinatura, não muda eventos monitorados.

### 2) Inserts/updates em `sales`
Impacto positivo esperado.

O objetivo explícito é impedir que uma falha acessória de notificação impeça `UPDATE` legítimo em `sales`, especialmente a transição para `pago`.

### 3) Deduplicação de notificações administrativas
A deduplicação continua existindo, agora via `NOT EXISTS`.

**Observação importante:** isso mantém o comportamento funcional esperado, mas continua dependendo da lógica da função em vez de depender exclusivamente do `ON CONFLICT`.

### 4) Outros pontos que usam `admin_notifications`
A função `create_admin_notification(...)` é utilitária e reaproveitada por outros triggers/rotinas.

Impacto esperado:
- eles continuam funcionando com a mesma assinatura;
- passam a usar deduplicação compatível com o índice parcial existente;
- deixam de depender do caminho que gerava o erro SQL observado.

## Como validar

## Teste manual esperado em sandbox
Criar uma nova venda sandbox e validar:

1. a cobrança é criada normalmente no Asaas;
2. o pagamento confirmado é reconhecido;
3. a venda muda para `pago`;
4. os tickets são gerados;
5. a venda não é cancelada pelo cleanup;
6. o admin/diagnóstico reflete o estado corretamente;
7. a notificação administrativa aparece, se o restante do fluxo de alertas estiver saudável;
8. se a notificação falhar, o pagamento ainda assim deve permanecer confirmado.

## Validação técnica complementar

Após aplicar a migration no ambiente:
- repetir o caso com uma nova venda sandbox;
- verificar em `sale_logs` a presença de:
  - `payment_finalize_started`
  - `payment_finalize_completed`
- verificar em `sale_integration_logs` que o `verify-payment-status` ou webhook não retornam mais `ticket_generation_incomplete` por causa desse erro SQL específico;
- verificar existência de `tickets` para a nova venda.

## Pendências remanescentes

1. **Revalidar o recebimento de webhook** no cenário sandbox, porque o caso real analisado não tinha `incoming_webhook` persistido.
2. **Executar teste ponta a ponta** com nova venda real de sandbox após deploy da migration.
3. **Revisar observabilidade de warnings do trigger** caso seja desejável persistir falhas de notificação administrativa em trilha mais estruturada no futuro.
4. **Confirmar se existem outras funções SQL** usando `ON CONFLICT` com padrões semelhantes em índices parciais, embora isso já saia do escopo desta correção mínima.

## Conclusão

A correção aplicada foi deliberadamente pequena e auditável:
- corrigiu a deduplicação incompatível em `create_admin_notification(...)`;
- blindou `notify_sale_status_updates()` para que a notificação não derrube o fluxo principal;
- preservou a arquitetura existente do pagamento Asaas.

