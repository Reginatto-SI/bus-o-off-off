# Análise técnica profunda — aba Webhook em `/admin/diagnostico-vendas`

## Objetivo

Investigar com evidência real de código e persistência por que a aba **Webhook** de uma venda concluída pode exibir **"Webhook recebido: Não detectado"** e **"Origem da confirmação: Verificação on-demand (`verify-payment-status`)"**, mesmo quando o pagamento já foi confirmado e a venda já foi finalizada.

## Sintomas observados

Venda analisada: `07ce8f4b-83be-4b27-8cd4-9acd9cd2aa38`.

Sinais confirmados na persistência:
- `sales.status = pago`
- `sales.asaas_payment_status = CONFIRMED`
- `sales.asaas_payment_id = pay_60j08zmxj7b4pq2t`
- `sales.payment_environment = sandbox`
- `sale_logs` mostram finalização por `verify-payment-status`
- `sale_integration_logs` mostram criação da cobrança e um `manual_sync` de `verify_payment_status`
- **não existe** `incoming_webhook` dessa venda em `sale_integration_logs`
- **não existe** registro correspondente em `asaas_webhook_event_dedup`

## Hipótese inicial

Havia quatro hipóteses plausíveis antes da validação:

1. a UI da aba Webhook estava lendo a fonte errada;
2. o webhook estava chegando, mas não estava sendo persistido;
3. o webhook estava chegando, porém sendo descartado antes de aparecer na consulta do modal;
4. o webhook simplesmente não chegou ao fluxo interno correlacionável da venda, e o `verify-payment-status` assumiu a confirmação.

## Causa raiz confirmada

### Conclusão principal

Para a venda investigada, a aba Webhook mostra **"Não detectado"** porque **não existe nenhum vestígio persistido de webhook correlacionável a essa venda** — nem em `sale_integration_logs` com `direction = incoming_webhook`, nem em `asaas_webhook_event_dedup`.

A UI está refletindo corretamente o que foi salvo.

### Causa raiz operacional confirmada

O caso real é uma combinação de dois fatores:

1. **o pagamento foi confirmado via fallback `verify-payment-status`, não via webhook persistido**;
2. **a observabilidade atual do diagnóstico depende exclusivamente de um log técnico correlacionado por `sale_id + company_id + payment_environment`**, então quando o webhook não deixa trilha correlacionada a venda aparece como **não detectada**, mesmo tendo concluído com sucesso por fallback.

### O que foi possível afirmar com segurança

- **Não há evidência persistida de que o `asaas-webhook` recebeu um evento válido/correlacionável dessa venda.**
- **Não há evidência de que a UI esteja escondendo um log existente dessa própria venda.**
- **Há evidência objetiva de que `verify-payment-status` confirmou o pagamento e finalizou a venda.**
- **Há uma lacuna de observabilidade**, porque o sistema sabe que a venda foi paga por fallback, mas não consegue afirmar no diagnóstico **se o webhook nunca chegou** ou **se chegou sem contexto suficiente para correlação**.

## Evidências encontradas

### 1) A aba Webhook lê `sale_integration_logs`, não `sales`

O modal detalhado busca `sale_logs` e `sale_integration_logs` separadamente. A trilha técnica é carregada com estes filtros:
- `sale_id = sale.id`
- `company_id = sale.company_id`
- `payment_environment = sale.payment_environment`

Portanto, a aba Webhook não depende de inferência visual do status da venda; ela depende de log técnico persistido e correlacionado à mesma venda/empresa/ambiente.

### 2) O critério de "Webhook recebido" é estrito

A UI só marca webhook como recebido quando encontra algum item em `detailIntegrationLogs` com:
- `direction === 'incoming_webhook'`
- `provider === 'asaas'`

Sem esse log técnico, ela mostra **"Não detectado"**.

### 3) O critério de "Origem da confirmação" favorece webhook, mas cai para on-demand

A UI decide assim:
- se houver `incoming_webhook` da Asaas → origem = `webhook`
- senão, se houver `sale_logs.action = payment_confirmed` com descrição contendo `verify-payment-status` → origem = `on_demand`
- senão → `none`

Logo, para a venda analisada, a combinação exibida na tela é exatamente o reflexo da persistência atual: sem `incoming_webhook`, mas com `payment_confirmed` vindo de `verify-payment-status`.

### 4) O webhook, quando entra no fluxo interno, deveria sempre persistir trilha técnica

A função `asaas-webhook` chama `persistIntegrationLog(...)` em todos os principais ramos relevantes auditados:
- ambiente da venda não resolvido;
- secret ausente;
- token inválido;
- evento ignorado;
- duplicado;
- `externalReference` ausente;
- venda não localizada;
- sucesso/falha operacional final.

Essa persistência grava em `sale_integration_logs` com `direction = incoming_webhook`.

### 5) O webhook também deveria deixar rastreabilidade em deduplicação quando recebe `event.id`

Depois da validação de ambiente/token, a função registra o evento em `asaas_webhook_event_dedup`. A ausência desse registro reforça que não houve processamento correlacionável desse webhook para a venda investigada.

### 6) O fallback confirma a venda e gera rastros próprios, independentes do webhook

`verify-payment-status`:
- lê a venda por `sale_id`;
- resolve o contexto pelo `payment_environment` persistido na venda;
- consulta o Asaas por `asaas_payment_id`;
- quando o status está confirmado, chama a rotina compartilhada `finalizeConfirmedPayment(...)`;
- persiste `sale_logs` e `sale_integration_logs` com `direction = manual_sync`.

Ou seja: a venda pode terminar corretamente como paga **sem qualquer webhook persistido**.

### 7) Evidência prática da venda real

Consulta direta no banco via REST autenticado retornou, para a venda `07ce8f4b-83be-4b27-8cd4-9acd9cd2aa38`:

- em `sales`: venda paga, `CONFIRMED`, ambiente `sandbox`;
- em `sale_logs`: eventos `payment_finalize_started`, `payment_finalize_completed` e `payment_confirmed`, todos com `source=verify-payment-status`;
- em `sale_integration_logs`: apenas
  - `outgoing_request/create_payment` e
  - `manual_sync/verify_payment_status`;
- em `asaas_webhook_event_dedup`: **nenhum registro**;
- em `sale_integration_logs` com `direction = incoming_webhook` no intervalo temporal da venda: **nenhum registro**.

## Frontend auditado

### Componente que renderiza a aba Webhook

- Arquivo: `src/pages/admin/SalesDiagnostic.tsx`
- A aba é renderizada no `TabsContent value="webhook"`.

### Fonte real dos dados da aba

A aba não faz query própria; ela usa `detailIntegrationLogs`, carregado em `openDetail(...)` a partir de `sale_integration_logs`.

### Campos que definem a exibição

- **Webhook recebido**: presença de log `incoming_webhook` da Asaas.
- **Origem da confirmação**:
  - webhook, se houver `incoming_webhook`;
  - on-demand, se `sale_logs` indicarem `verify-payment-status`;
  - não identificada caso contrário.
- **Ambiente persistido da venda**: `detailSale.payment_environment`.
- **Ambiente no log técnico**: `webhookLog.payment_environment`, quando existir.

### Validação dos filtros da UI

Para o modal da venda analisada, os filtros estão corretos e coerentes com as diretrizes do projeto:
- filtra pela venda certa: `sale_id`
- filtra por `company_id`
- filtra por `payment_environment`
- não mistura sandbox e produção no detalhe

### Veredito do frontend

**Não há bug confirmado de leitura na aba Webhook para este caso.**

A UI está honesta: ela mostra **"Não detectado"** porque a consulta efetivamente não encontrou log técnico de webhook para essa venda.

## Backend / edge functions auditadas

### `create-asaas-payment`

Responsabilidades relevantes:
- exige/resolve `payment_environment` de forma explícita;
- trava o ambiente da venda;
- cria a cobrança no Asaas com `externalReference = sale.id`;
- persiste trilha técnica em `sale_integration_logs` com `direction = outgoing_request`.

Conclusão:
- a cobrança da venda analisada nasceu corretamente em `sandbox`;
- `externalReference` foi desenhado para permitir correlação do webhook pela própria venda.

### `asaas-webhook`

Responsabilidades relevantes:
- extrai `payment.externalReference`;
- deriva `saleId` a partir desse campo;
- resolve `sales.payment_environment` como fonte de verdade do ambiente;
- valida token do webhook do ambiente resolvido;
- deduplica por `event.id` em `asaas_webhook_event_dedup`;
- persiste `sale_integration_logs` com `direction = incoming_webhook`;
- quando confirmado, usa a mesma rotina compartilhada de finalização (`finalizeConfirmedPayment`).

Pontos importantes para esta investigação:
- se o ambiente da venda não for resolvido, o webhook é rejeitado e **ainda assim** tenta persistir log técnico;
- se o token for inválido, **também** tenta persistir log técnico;
- se o evento for duplicado, **também** tenta persistir log técnico;
- se `externalReference` estiver ausente, **também** tenta persistir log técnico;
- se a venda não for localizada, **também** tenta persistir log técnico.

Conclusão:
- se houvesse um webhook correlacionável processado por este código para a venda, seria esperado pelo menos um rastro em `sale_integration_logs`, e possivelmente em `asaas_webhook_event_dedup`.

### `verify-payment-status`

Responsabilidades relevantes:
- consulta a venda por `sale_id`;
- usa `sales.payment_environment` e `sales.asaas_payment_id`;
- consulta o Asaas diretamente;
- se confirmado, chama `finalizeConfirmedPayment(...)`;
- grava `sale_integration_logs` com `direction = manual_sync`;
- grava `sale_logs` operacionais com `source=verify-payment-status`.

Conclusão:
- o fallback é totalmente capaz de fechar a venda sem qualquer webhook;
- foi exatamente o que aconteceu no caso investigado.

### Helper compartilhado de finalização

`finalizeConfirmedPayment(...)` centraliza:
- atualização de `sales.status` para `pago`;
- atualização de `sales.asaas_payment_status`;
- `payment_confirmed_at`;
- geração de tickets;
- limpeza de `seat_locks`;
- `sale_logs` operacionais.

Conclusão:
- webhook e verify convergem para a mesma rotina de finalização;
- a divergência do caso não está na finalização da venda, e sim na **origem da confirmação e na trilha de observabilidade**.

## Banco / persistência auditados

### Tabelas envolvidas

#### 1. `sales`
Campos relevantes observados/consumidos neste fluxo:
- `id`
- `company_id`
- `status`
- `asaas_payment_status`
- `asaas_payment_id`
- `payment_confirmed_at`
- `payment_environment`

#### 2. `sale_logs`
Tabela funcional/operacional da timeline.
Campos relevantes:
- `sale_id`
- `company_id`
- `action`
- `description`
- `created_at`

#### 3. `sale_integration_logs`
Tabela técnica de rastreabilidade.
Campos relevantes:
- `sale_id`
- `company_id`
- `provider`
- `direction`
- `event_type`
- `payment_id`
- `external_reference`
- `http_status`
- `processing_status`
- `result_category`
- `incident_code`
- `warning_code`
- `payment_environment`
- `environment_decision_source`
- `environment_host_detected`
- `message`
- `payload_json`
- `response_json`
- `created_at`

#### 4. `asaas_webhook_event_dedup`
Tabela de deduplicação/auditoria mínima do webhook.
Campos relevantes:
- `asaas_event_id`
- `event_type`
- `payment_id`
- `external_reference`
- `sale_id`
- `payment_environment`
- `payload_json`
- `first_received_at`
- `last_seen_at`
- `duplicate_count`

### Veredito de persistência

A persistência esperada **existe**. O diagnóstico não está assumindo uma tabela inexistente.

O que falta no caso concreto não é modelagem básica de log, mas **o registro do evento de webhook correlacionado a essa venda**.

## Sandbox vs produção

### O desenho implementado

O código tenta manter espelhamento entre ambientes:
- `create-asaas-payment` persiste `sales.payment_environment` no nascimento do fluxo;
- `verify-payment-status` e `asaas-webhook` leem esse mesmo campo como fonte de verdade;
- a tela de diagnóstico principal filtra `sales` por `payment_environment` do runtime;
- o modal detalhado também reaplica `payment_environment` em `sale_integration_logs`.

### Divergência real encontrada

**Não há divergência de implementação confirmada entre sandbox e produção dentro do código auditado para este caso.**

O que existe é um indício operacional explícito no frontend público de confirmação: o próprio código documenta que o polling com `verify-payment-status` existe para cobrir cenários em que o webhook “não dispara”, algo apontado como comum em sandbox.

Isso não prova, sozinho, falha externa do Asaas nesse caso específico. Mas reforça que o sistema já convive com a hipótese de ausência/atraso de webhook em sandbox.

## Observabilidade — avaliação objetiva

### Conseguimos saber se o webhook chegou?

**Para esta venda específica: não com certeza absoluta fora da aplicação.**

O que conseguimos afirmar é: **não existe trilha persistida de webhook correlacionado no sistema**.

### Conseguimos saber se foi rejeitado?

**Para esta venda específica: não.**

Se tivesse sido rejeitado com contexto correlacionável (`sale_id`/`externalReference`/`payment_id`), esperaríamos ao menos um `incoming_webhook` em `sale_integration_logs`. Não existe.

### Conseguimos saber por que foi rejeitado?

**Não neste caso.**

A ausência total de log correlacionado impede distinguir entre:
- webhook não enviado/não entregue ao endpoint;
- webhook entregue com payload não correlacionável à venda;
- webhook recebido antes de haver contexto mínimo e registrado sem vínculo pesquisável por essa tela;
- incidente externo ao código auditado (configuração do Asaas, URL, token no painel, etc.).

### Conseguimos saber se a venda foi confirmada por webhook ou por fallback?

**Sim.** Para esta venda, foi confirmada por fallback `verify-payment-status`.

### Conseguimos saber isso por ambiente e por empresa?

**Sim, parcialmente.**

O sistema persiste `company_id` e `payment_environment` tanto na venda quanto nos logs técnicos, e a tela detalhada respeita esses filtros.

### A tela `/admin/diagnostico-vendas` representa fielmente a realidade?

**Sim, para o que ela realmente mede hoje.**

Ela representa fielmente:
- a presença de logs técnicos correlacionados;
- a origem funcional da confirmação conforme `sale_logs`;
- o ambiente persistido na venda.

Ela **não** consegue representar fielmente eventos de webhook que não deixaram rastro correlacionado.

## Resposta direta à pergunta principal

### Por que a aba Webhook da venda concluída mostra “Não detectado”, mesmo com pagamento confirmado?

Porque, nessa venda, **o pagamento foi concluído pelo fallback `verify-payment-status` e não existe nenhum log técnico de webhook correlacionado à venda em `sale_integration_logs`, nem deduplicação correspondente em `asaas_webhook_event_dedup`**.

A aba Webhook não está mentindo; ela está mostrando a ausência real de evidência persistida de webhook.

## Classificação do problema

### Tipo

Problema combinado de:
- **observabilidade/modelagem diagnóstica**;
- **ausência de evidência persistida do webhook para o caso real**;
- **não de leitura incorreta da UI para esta venda específica**.

### Não confirmado nesta investigação

Com o acesso disponível nesta tarefa, **não foi possível confirmar no painel externo do Asaas** se o webhook:
1. não foi enviado;
2. foi enviado para URL/token errados;
3. foi enviado e rejeitado antes de gerar correlação pesquisável.

Mas o sistema interno permite afirmar que **nenhum webhook correlacionado foi persistido para esta venda**.

## Proposta de correção mínima

### Objetivo da correção

Melhorar auditabilidade sem refatorar a arquitetura e sem criar fluxo paralelo.

### Menor correção segura recomendada

1. **Registrar um log técnico explícito quando `verify-payment-status` confirmar um pagamento sem existir nenhum `incoming_webhook` correlacionado para a venda**.
   - direção continua `manual_sync`;
   - `incident_code` sugerido: `webhook_not_observed_before_verify_confirmation`;
   - mensagem objetiva informando que a confirmação ocorreu por fallback sem evidência de webhook persistido.

2. **Ajustar a aba Webhook para diferenciar duas situações hoje colapsadas em “Não detectado”:**
   - `Nenhum webhook persistido`;
   - `Pagamento confirmado por fallback sem evidência de webhook`.

3. **Opcional mínimo e seguro, sem mudar regra de negócio:** ampliar a consulta do modal para procurar `sale_integration_logs` também por `external_reference = sale.id` e/ou `payment_id = sale.asaas_payment_id` quando não houver `incoming_webhook` por `sale_id`, apenas para diagnóstico. Isso só vale se o time quiser capturar ramos com correlação parcial sem mudar a origem da verdade.

### O que **não** recomendo nesta etapa

- não recomendo refatorar `webhook` + `verify`;
- não recomendo alterar a rotina compartilhada de finalização;
- não recomendo criar nova tabela;
- não recomendo remover o fallback;
- não recomendo mexer na arquitetura multiambiente.

## Checklist técnico obrigatório

1. **O webhook do Asaas está chegando ao endpoint correto?**  
   Não foi possível confirmar externamente pelo repositório; internamente não há evidência persistida correlacionada para a venda.

2. **O token/assinatura está sendo validado corretamente?**  
   Sim, o código valida token por ambiente resolvido da venda. Não há evidência de falha de validação nesta venda porque não há log correlacionado do webhook.

3. **O payload recebido contém identificadores suficientes para localizar a venda?**  
   O contrato esperado exige `payment.externalReference = sale.id`; o create envia isso corretamente.

4. **A resolução da venda usa `externalReference`, `asaas_payment_id`, `company_id` e `payment_environment` corretamente?**  
   Parcialmente sim: o webhook usa `externalReference` + `payment_environment`; a UI usa `sale_id` + `company_id` + `payment_environment`; o verify usa `sale_id` + `asaas_payment_id` + `payment_environment`.

5. **O webhook está sendo persistido em algum log/tabela?**  
   Sim, por desenho em `sale_integration_logs` e `asaas_webhook_event_dedup`; para a venda investigada, porém, não houve persistência.

6. **O fallback `verify-payment-status` está deixando a venda paga sem trilha de webhook?**  
   Sim. Este caso real prova exatamente isso.

7. **A aba Webhook consulta a tabela/fonte correta?**  
   Sim.

8. **A aba Webhook pode estar escondendo logs existentes por filtro incorreto?**  
   Não há evidência disso para esta venda; a consulta por `sale_id/company_id/payment_environment` está coerente.

9. **Existe diferença real entre sandbox e produção nesse fluxo?**  
   Não foi encontrada divergência de implementação no código. Há apenas indício operacional de que sandbox usa fallback com frequência maior.

10. **A UI está mostrando “Não detectado” por ausência real ou por erro de leitura?**  
    Por ausência real de log correlacionado.

11. **Há alguma lacuna de observabilidade que precise ser corrigida mesmo que o pagamento funcione?**  
    Sim. Falta trilha explícita quando o fallback confirma pagamento sem evidência de webhook.

12. **A correção proposta mantém comportamento previsível, auditável e igual entre ambientes?**  
    Sim, porque só melhora a trilha diagnóstica e não muda a regra de confirmação nem cria novo fluxo.

## Arquivos envolvidos

- `src/pages/admin/SalesDiagnostic.tsx`
- `src/pages/public/Confirmation.tsx`
- `supabase/functions/create-asaas-payment/index.ts`
- `supabase/functions/asaas-webhook/index.ts`
- `supabase/functions/verify-payment-status/index.ts`
- `supabase/functions/_shared/payment-finalization.ts`
- `supabase/functions/_shared/payment-observability.ts`
- `supabase/migrations/20260701090000_create_sale_integration_logs.sql`
- `supabase/migrations/20261001120000_harden_payment_environment_and_logs.sql`
- `supabase/migrations/20261017090000_stage3_payment_observability_dedup.sql`
- `supabase/migrations/20260212213444_e2e671d2-fa63-4684-9d7b-3ba35db44b5a.sql`

## Arquivos alterados

- `analise-15-diagnostico-webhook-vendas.md`

## Checklist de validação

- [x] Confirmada a fonte exata da aba Webhook
- [x] Confirmados os filtros `sale_id`, `company_id` e `payment_environment` no detalhe
- [x] Auditados `create-asaas-payment`, `asaas-webhook` e `verify-payment-status`
- [x] Confirmada a rotina compartilhada de finalização
- [x] Confirmada a modelagem de `sale_logs`, `sale_integration_logs` e `asaas_webhook_event_dedup`
- [x] Validada a venda real via consultas autenticadas ao banco
- [x] Confirmado que a venda foi paga por `verify-payment-status`
- [x] Confirmado que não há webhook persistido correlacionado à venda

## Riscos residuais

1. Sem acesso ao painel/log externo do Asaas, ainda não dá para fechar 100% se o problema primário é entrega/configuração externa ou payload não correlacionável.
2. A tela atual continua dependente de logs já correlacionados por venda; se o webhook falhar antes dessa correlação, continuará parecendo “não detectado”.
3. O fallback mantém o negócio funcionando, mas pode mascarar falhas recorrentes de entrega/configuração do webhook se não houver indicador explícito de anomalia.
