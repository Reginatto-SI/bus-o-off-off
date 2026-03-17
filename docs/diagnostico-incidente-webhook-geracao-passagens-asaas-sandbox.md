# 1. Resumo executivo

- **Problema:** o fluxo crítico de confirmação de pagamento e geração de passagens apresenta pontos de falha que permitem estado inconsistente (`sales.status = pago` sem `tickets`), especialmente quando há divergência entre webhook e verificação manual.
- **Impacto no negócio:** cliente pode pagar e não receber passagem/QR automaticamente; suporte perde rastreabilidade operacional; risco de embarque negado por ausência de ticket.
- **Gravidade:** **Crítica (P1)** para fluxo público de venda.
- **Hipótese principal:** há **inconsistência de responsabilidade e tratamento de erro** entre `asaas-webhook` e `verify-payment-status` na etapa de geração de tickets, somada a dependências estritas de ambiente/token no webhook.
- **Nível de confiança:** **alto** para inconsistências de lógica (comprovadas em código), **médio** para incidência operacional em sandbox (depende de logs reais da instância).

---

# 2. Fluxo atual mapeado

## 2.1 Venda pública → criação de cobrança
1. Checkout público cria `seat_locks`.
2. Checkout cria `sales` com `status = pendente_pagamento`.
3. Checkout cria `sale_passengers` (staging da futura geração de `tickets`).
4. Checkout chama edge function `create-asaas-payment`.
5. `create-asaas-payment` resolve ambiente (host/request), cria cobrança Asaas, e atualiza venda com:
   - `asaas_payment_id`
   - `asaas_payment_status`
   - `payment_method`
   - `payment_environment`

## 2.2 Confirmação automática via webhook
1. Asaas envia evento para `asaas-webhook`.
2. Webhook tenta identificar `sale_id` por `payment.externalReference`.
3. Webhook exige ambiente resolvido da venda (`sales.payment_environment`) para continuar.
4. Webhook valida token do ambiente resolvido.
5. Webhook processa eventos suportados (`PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, etc.).
6. Em pagamento confirmado:
   - atualiza `sales.status = pago`, `payment_confirmed_at`, `asaas_payment_status`
   - chama geração de tickets por `sale_passengers`
   - limpa `seat_locks`
   - grava `sale_logs` e `sale_integration_logs`

## 2.3 Verificação manual/polling
1. Página pública de confirmação (`/confirmacao/:id`) chama `verify-payment-status` via botão/manual e em polling periódico.
2. `verify-payment-status` busca venda, consulta Asaas (`/payments/{asaas_payment_id}`), e se confirmado:
   - atualiza `sales.status = pago`
   - tenta gerar tickets
   - limpa `seat_locks`
   - retorna `paymentStatus` ao frontend
3. Tela também consulta `sales` e `tickets` diretamente para renderização final.

## 2.4 Consulta pública de passagem
- `ticket-lookup` usa CPF para buscar `tickets` e relacionar com `sales/events` para retorno público sem login.

---

# 3. Achados técnicos

## 3.1 Webhook
- O webhook rejeita processamento quando não resolve ambiente da venda (`payment_environment`) com resposta 400.
- A validação de token é estrita por ambiente (sem fallback dual-token).
- Há caminho de **sucesso parcial**: venda vira `pago`, mas se geração de ticket falha, o retorno é `partial_failure` (500), podendo deixar inconsistência.
- Eventos não suportados são ignorados com 200 (`ignored`), o que evita retry para esses tipos.

## 3.2 Verificação manual/polling
- A função `verify-payment-status` replica lógica do webhook, mas com tratamento de erro menos rigoroso.
- Se a venda já está `pago`, a função **retorna cedo** e não tenta reconciliar ticket ausente.
- Após transição para `pago`, a geração de tickets é chamada sem validação forte do resultado; falhas de insert podem não impedir retorno `paymentStatus: pago`.
- Polling no frontend chama `verify-payment-status`, mas ignora erro da invocação no fluxo automático (`catch` vazio no polling periódico).

## 3.3 Geração da passagem
- Geração depende de `sale_passengers`; se vazio, o código trata como “fluxo legado/admin” e não cria tickets.
- Falha de criação de tickets no webhook é detectada (status `partial_failure`), mas no verify não é propagada de forma equivalente.
- Não há rotina única central de “finalização de pagamento + geração + validações”; há duplicidade entre webhook e verify.

## 3.4 Consistência de dados
- Modelo permite estado `sales.status = pago` com `tickets` ausentes (não há constraint transacional que obrigue presença de ticket por venda paga).
- `sale_passengers` é staging e é apagado após criação de tickets; em caso de erro parcial, a reconciliação depende de execução manual robusta (que hoje é limitada).

## 3.5 Ambiente sandbox vs produção
- Decisão inicial de ambiente acontece no create por host/request e depois é persistida em `sales.payment_environment`.
- Verify e webhook dependem desse campo persistido; se houver divergência na venda, a consulta/validação seguirá ambiente possivelmente incorreto.
- Token de webhook e base URL variam por ambiente; misconfiguração em sandbox bloqueia confirmação automática.

## 3.6 Logs e observabilidade
- Há avanço relevante com `sale_integration_logs` e `logPaymentTrace`.
- Porém ainda há pontos com log não estruturado (`console.log/error` puro) e perda de contexto de correlação entre etapas.
- O polling frontend engole erro em chamadas automáticas (`catch(() => {})`), reduzindo diagnósticos de campo.

## 3.7 RLS / multiempresa
- Fluxo crítico de edge functions usa service role (não depende de RLS para operação básica).
- Políticas multi-tenant existem para leitura administrativa de logs e dados operacionais.
- Não há evidência de bloqueio de RLS como causa primária no webhook/verify, mas há risco de leitura incompleta no diagnóstico administrativo se contexto de empresa estiver incorreto.

---

# 4. Causa raiz mais provável

## 4.1 Causa mais provável (principal)
**Divergência de comportamento entre webhook e verify na finalização de pagamento**:
- ambos marcam venda como paga;
- webhook trata falha de ticket como erro parcial explícito;
- verify pode retornar `pago` mesmo sem garantir ticket, e ainda não reconcilia quando venda já está paga.

Isso cria o sintoma crítico: “pagamento confirmado sem passagem gerada”, inclusive após tentativa manual.

## 4.2 Causas secundárias
1. **Dependência estrita de token/ambiente no webhook** em sandbox (qualquer desvio impede automação).
2. **Silenciamento de erro no polling frontend** em chamadas automáticas de verify.
3. **Ausência de reconciliação explícita** para vendas pagas sem ticket.

## 4.3 Fato vs hipótese
- **Fato (código):** verify retorna cedo se venda já está paga; webhook e verify têm rotinas duplicadas e não simétricas.
- **Fato (código):** webhook exige ambiente/token corretos por venda.
- **Hipótese operacional:** parte das falhas em sandbox vem de token/ambiente mal alinhado (validar em logs reais).

---

# 5. Evidências

## Arquivos/funções principais inspecionados
- `supabase/functions/create-asaas-payment/index.ts`
- `supabase/functions/asaas-webhook/index.ts`
- `supabase/functions/verify-payment-status/index.ts`
- `supabase/functions/_shared/payment-context-resolver.ts`
- `supabase/functions/_shared/runtime-env.ts`
- `src/pages/public/Checkout.tsx`
- `src/pages/public/Confirmation.tsx`
- `src/pages/public/TicketLookup.tsx`
- Migrations de `payment_environment`, `sale_integration_logs`, `sale_passengers`, `seat_locks`, políticas públicas e multiempresa.

## Comportamentos observados em código
- Venda pública usa `sale_passengers` como staging da geração de tickets.
- Webhook persiste log técnico por evento em `sale_integration_logs`.
- Verify consulta Asaas on-demand e tenta confirmar venda/tickets.
- Ticket lookup público depende de existência de `tickets` para localizar passagem.

## Logs analisáveis no projeto
- `sale_integration_logs`: trilha principal para requisições de criação de cobrança e webhooks.
- `sale_logs`: trilha de negócio (payment confirmed/failed etc.).
- Limitação: sem acesso aos dados do ambiente executando, não foi possível confirmar quantitativo real de casos pagos-sem-ticket.

---

# 6. Riscos atuais do sistema

1. **Falha silenciosa parcial:** venda paga sem ticket em cenários de erro não reconciliado.
2. **Inconsistência pagamento vs passagem:** confirmação financeira sem entregável operacional (QR).
3. **Ambiente cruzado:** cobrança/verificação/webhook desalinhados se `payment_environment` persistir valor errado ou incompleto.
4. **Risco de suporte:** atendimento sem trilha única e determinística para responder “onde o fluxo quebrou”.

---

# 7. Correção mínima recomendada

1. **Criar rotina única de finalização de pagamento** (shared) usada por webhook e verify:
   - validar pré-condições
   - atualizar venda
   - gerar tickets com retorno estruturado
   - limpar locks
   - registrar logs homogêneos
2. **No verify**, quando venda já estiver `pago`, validar se há ticket; se não houver, executar reconciliação de geração.
3. **No verify**, não retornar `pago` sem confirmar resultado da geração/reconciliação quando tickets forem obrigatórios.
4. **No frontend de confirmação**, remover `catch` vazio do polling periódico e registrar erro técnico mínimo.

> Escopo propositalmente cirúrgico: sem reescrever arquitetura, sem alterar fluxos adjacentes.

---

# 8. Melhorias de robustez recomendadas

- Logs estruturados padronizados com `sale_id`, `company_id`, `payment_environment`, `source` (webhook/verify).
- Idempotência explícita na finalização (já parcial) com estados de saída padronizados.
- Job/reconciliação administrativa: localizar periodicamente `sales.status='pago'` sem `tickets`.
- Alertas operacionais (ex.: `partial_failure`, `unauthorized`, `missing_company_asaas_api_key`).
- Painel de diagnóstico operacional com timeline por `sale_id` (request -> webhook -> ticket).

---

# 9. Checklist de validação após correção

1. Criar venda pública em sandbox.
2. Confirmar criação de cobrança e persistência de `asaas_payment_id` + `payment_environment`.
3. Simular pagamento confirmado no Asaas.
4. Validar recebimento de webhook com token correto.
5. Confirmar transição `sales.status` para `pago`.
6. Confirmar criação de `tickets` (incluindo QR/token).
7. Confirmar renderização na tela de confirmação pública.
8. Confirmar busca posterior em `ticket-lookup` por CPF.
9. Testar fallback manual (`verify-payment-status`) com venda pendente.
10. Testar idempotência (repetir webhook/verify e garantir sem duplicidade).
11. Testar erro controlado de geração e garantir log/alerta sem falso “pago saudável”.

---

# 10. Conclusão final

**Estado atual:** não é confiável o suficiente para considerar o fluxo “saudável” em termos SaaS de produção para sandbox/validação contínua.

**O que impede confiança:**
- finalização duplicada com comportamento não simétrico;
- possibilidade de venda paga sem ticket e sem reconciliação automática robusta;
- dependência crítica de ambiente/token no webhook sem mecanismo operacional claro de recuperação.

**Para restaurar confiança mínima:**
- unificar finalização de pagamento (webhook + verify),
- garantir reconciliação de ticket para venda já paga,
- elevar observabilidade nos pontos silenciosos.
