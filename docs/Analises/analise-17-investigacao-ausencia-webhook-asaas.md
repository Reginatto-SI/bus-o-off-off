# Investigação profunda — ausência de webhook no fluxo Asaas

## Objetivo

Entender com evidência por que existem vendas confirmadas via `verify-payment-status` sem webhook persistido correlacionado no sistema, distinguindo entre problema de envio, entrega, autenticação, ambiente, correlação ou regra interna.

## Escopo da investigação

Esta análise cobre apenas diagnóstico. Nenhuma nova correção foi implementada nesta etapa.

## Fluxo completo do webhook

### 1. Endpoint HTTP

O webhook entra pela edge function `asaas-webhook`, publicada como endpoint HTTP do projeto Supabase.

O repositório já trata essa função como rota externa acionada pelo Asaas, não pelo frontend.

### 2. Handler

O handler principal está em:
- `supabase/functions/asaas-webhook/index.ts`

Passo a passo do início do fluxo:
1. cria client admin do Supabase;
2. tenta fazer `req.json()`;
3. extrai:
   - `event`
   - `id`/`eventId`
   - `payment.id`
   - `payment.externalReference`
4. grava log de console estruturado `stage: received`;
5. tenta derivar `actualSaleId` a partir de `externalReference`, removendo prefixo `platform_fee_` quando existir.

### 3. Decisão de ambiente

O webhook **não** decide ambiente por URL/host no caminho principal.

Ele tenta primeiro buscar `sales.payment_environment` da venda derivada do `externalReference`. Se não conseguir resolver `sandbox` ou `production`, rejeita o webhook com `400`.

Depois disso, usa o resolvedor central de contexto para carregar:
- ambiente;
- owner do pagamento;
- token esperado do webhook.

### 4. Validação de token

O token esperado vem de secrets separados por ambiente:
- `ASAAS_WEBHOOK_TOKEN`
- `ASAAS_WEBHOOK_TOKEN_SANDBOX`

A validação aceita o header recebido em:
- `asaas-access-token`
- ou `x-asaas-webhook-token`

Se o token do ambiente resolvido estiver ausente, responde `500`.
Se estiver presente e inválido, responde `401`.

### 5. Parsing e regras de aceite

Depois da validação de ambiente/token, o fluxo exige:
- `event`
- `payment`

Sem isso, responde `400`.

Os eventos aceitos no fluxo principal são:
- `PAYMENT_CONFIRMED`
- `PAYMENT_RECEIVED`
- `PAYMENT_OVERDUE`
- `PAYMENT_DELETED`
- `PAYMENT_REFUNDED`

Eventos fora dessa lista são persistidos como `ignored` e retornam `200`.

### 6. Deduplicação

Se existir `id`/`eventId`, o webhook tenta registrar o evento em `asaas_webhook_event_dedup`.

Se já existir:
- marca duplicata via RPC `mark_asaas_webhook_event_duplicate`
- persiste `incoming_webhook` como `duplicate`
- retorna `200`

### 7. Correlação com a venda

A correlação principal é feita por:
- `payment.externalReference`

O fluxo assume que:
- venda principal → `externalReference = sale.id`
- taxa de plataforma → `externalReference = platform_fee_<sale_id>`

Depois de validar ambiente/token:
- se `externalReference` estiver ausente, o webhook registra `ignored` e retorna `200`;
- se houver prefixo `platform_fee_`, cai no fluxo de taxa;
- caso contrário, tenta buscar `sales.id = externalReference`.

### 8. Persistência em `sale_integration_logs`

A persistência técnica do webhook é centralizada em `persistIntegrationLog(...)`, que grava sempre com:
- `provider = asaas`
- `direction = incoming_webhook`

Esse helper é chamado nos ramos principais auditados:
- ambiente não resolvido;
- secret ausente;
- token inválido;
- payload inválido;
- evento ignorado;
- duplicado;
- `externalReference` ausente;
- venda não localizada;
- processamento final de sucesso/falha.

## Pontos de falha possíveis por etapa

### Etapa A — Asaas não envia o webhook

**O que acontece:** nada chega ao endpoint; portanto não há `incoming_webhook`, nem `asaas_webhook_event_dedup`, nem qualquer log técnico correlacionado.

**Log de erro interno:** não.

**HTTP retornado:** nenhum, porque não houve chamada.

**Retry do Asaas:** não aplicável do ponto de vista do nosso sistema; depende do provedor ter tentado enviar.

### Etapa B — Webhook é enviado, mas não chega ao sistema

**O que acontece:** mesmo resultado prático da etapa A do ponto de vista interno.

**Log de erro interno:** não.

**HTTP retornado:** nenhum.

**Retry do Asaas:** pode existir no provedor, mas o sistema não vê.

### Etapa C — Webhook chega, mas falha antes de persistir

Pelo código atual, isso só parece plausível em casos muito específicos:
- falha catastrófica antes de `persistIntegrationLog(...)`;
- exceção antes de dados mínimos serem extraídos;
- ou falha na própria inserção dos logs.

Mesmo assim, o handler tenta persistir inclusive no `catch` final. Então, para payloads minimamente parseáveis, a tendência é deixar algum rastro.

### Etapa D — Ambiente não resolvido

**O que acontece:** retorna `400` com `Sale environment unresolved`.

**Log interno:** sim, via `incoming_webhook` com `processing_status = rejected`, desde que o payload tenha `externalReference` minimamente aproveitável.

**Retry do Asaas:** provável, porque a resposta é não-2xx.

### Etapa E — Token inválido

**O que acontece:** retorna `401 Invalid token`.

**Log interno:** sim, via `incoming_webhook` com `processing_status = unauthorized`.

**Retry do Asaas:** provável, porque a resposta é não-2xx.

### Etapa F — Payload inválido

**O que acontece:** retorna `400 Invalid payload`.

**Log interno:** sim, via `incoming_webhook` com `processing_status = rejected`.

**Retry do Asaas:** provável, porque a resposta é não-2xx.

### Etapa G — Evento suportado, mas sem `externalReference`

**O que acontece:** persiste `ignored`, responde `200` e não correlaciona venda.

**Log interno:** sim.

**Retry do Asaas:** improvável, porque a resposta é `200`.

### Etapa H — `externalReference` presente, mas venda não localizada

**O que acontece:** persiste `ignored` com `reason = sale_not_found`, responde `200`.

**Log interno:** sim.

**Retry do Asaas:** improvável, porque a resposta é `200`.

### Etapa I — Evento duplicado

**O que acontece:** persiste `duplicate`, atualiza deduplicação e responde `200`.

**Log interno:** sim.

**Retry do Asaas:** não deveria ser necessário após `200`, embora reentregas possam continuar por comportamento do provedor.

## Persistência de webhook — condições reais para salvar `incoming_webhook`

O sistema grava `incoming_webhook` em `sale_integration_logs` com:
- `sale_id`
- `company_id`
- `payment_environment`
- `event_type`
- `payment_id`
- `external_reference`
- `http_status`
- `processing_status`
- `result_category`
- `incident_code`
- `warning_code`

Importante:
- o `helper` aceita `sale_id` e `company_id` nulos;
- portanto, mesmo webhooks rejeitados/ignorados sem correlação completa ainda podem ser persistidos;
- isso reduz bastante a chance de “webhook chegou e sumiu sem rastro”, desde que a requisição tenha sido parseada e o insert do log não falhe.

## Correlação com a venda

### Campo primário usado

A correlação webhook → venda usa **`payment.externalReference`** como identificador primário.

### `payment_id` participa?

`payment_id` é persistido para auditoria, mas **não é usado como chave principal de resolução da venda** dentro do webhook.

### Risco de mismatch

Sim, existem riscos reais quando:
- o Asaas envia `externalReference` ausente;
- o valor não é UUID válido da venda;
- o valor aponta para venda antiga/inexistente;
- o payload vem da conta errada e referencia algo não reconhecido pelo sistema.

Mas, nesses cenários, o código atual tenderia a deixar **algum** `incoming_webhook` persistido como `ignored`/`rejected`, não silêncio absoluto.

## Validação de ambiente

### Como o sistema decide sandbox vs production

- `create-asaas-payment` trava `sales.payment_environment` como fonte oficial da venda.
- `asaas-webhook` lê esse campo da venda antes de validar token.
- `verify-payment-status` também usa esse mesmo campo.

### Risco de ambiente errado

O risco existe se `sales.payment_environment` estiver incorreto.

Nesse caso, o webhook pode:
- procurar o token do ambiente errado;
- rejeitar o evento por autenticação;
- ou responder `400/401` antes de completar o fluxo.

Mas, novamente, com payload minimamente parseável, isso tenderia a gerar `incoming_webhook` persistido.

## Evidências reais encontradas

### 1. O endpoint do webhook está vivo e recebe chamadas

Consultas reais em `sale_integration_logs` mostram múltiplos registros `incoming_webhook` da Asaas, incluindo:
- eventos `ignored`;
- eventos `duplicate`;
- eventos `failed`;
- eventos `unauthorized`.

Ou seja: o endpoint não está morto nem inacessível de forma geral.

### 2. Há forte assimetria entre taxa de plataforma e venda principal

Contagem real via REST autenticado:
- `incoming_webhook total`: **128**
- `incoming_webhook` com `external_reference like platform_fee_*`: **89**
- `incoming_webhook` com `external_reference not like platform_fee_*`: **0**
- `incoming_webhook` com `external_reference is null`: **39**

Essa é a evidência mais forte desta investigação.

Interpretação objetiva:
- o sistema **recebe webhooks do Asaas**;
- ele recebe principalmente webhooks da **taxa de plataforma**;
- não há evidência persistida de webhook de **venda principal**.

### 3. Existem webhooks autorizados e deduplicados para `platform_fee_*`

A tabela `asaas_webhook_event_dedup` contém eventos reais recentes apenas para `platform_fee_<sale_id>`, com `duplicate_count > 0`.

Isso demonstra que:
- a rota funciona;
- o parse funciona;
- a deduplicação funciona;
- pelo menos um conjunto de tokens/configuração está correto;
- o provedor está chamando o endpoint para esse fluxo.

### 4. Existem `401 Token de webhook inválido`, mas majoritariamente sem correlação útil

Os registros `unauthorized` encontrados recentemente aparecem com:
- `sale_id = null`
- `company_id = null`
- `external_reference = null` em vários casos

Isso é compatível com probes/testes/payloads sem contexto útil, mas **não explica por si só** o sumiço sistemático de webhooks das vendas principais.

### 5. Há confirmações via fallback sem contrapartida de webhook principal

Contagens reais também mostram:
- `manual_sync verify_payment_status`: **19**
- `sale_logs.action = payment_confirmed` contendo `verify-payment-status`: **6**

Isso confirma que o sistema efetivamente vem fechando vendas pelo fallback.

### 6. O onboarding da conta Asaas não mostra configuração de webhook no código auditado

A função `create-asaas-account` faz onboarding/vínculo de subconta e persiste:
- API key;
- wallet id;
- account id;
- onboarding flag.

Na leitura dirigida do arquivo e nas buscas textuais não encontrei etapa explícita de:
- registro de URL de webhook na subconta;
- configuração de token do webhook na conta da empresa.

Isso é um achado importante porque o fluxo principal usa **owner `company`** para cobrança da venda, enquanto o fluxo `platform_fee` usa **owner `platform`**.

## Hipótese mais provável

### Hipótese principal

**Cenário mais provável: os webhooks da venda principal não estão sendo enviados pela conta Asaas da empresa para este endpoint, ou não estão configurados corretamente nessa conta, enquanto o fluxo `platform_fee` da conta da plataforma está configurado e chega normalmente.**

### Por que esta hipótese é a mais forte?

Porque ela explica simultaneamente:
1. por que o endpoint recebe webhooks reais do Asaas;
2. por que a deduplicação funciona para `platform_fee_*`;
3. por que existem vendas fechadas por `verify-payment-status`;
4. por que não aparecem `incoming_webhook` de venda principal nem mesmo como `ignored`/`rejected`/`unauthorized` correlacionáveis.

Se o problema dominante fosse autenticação, ambiente incorreto ou correlação interna da venda principal, o esperado seria encontrar ao menos parte desses eventos persistidos como `incoming_webhook` com `external_reference = sale.id` ou outro traço correlacionável. O padrão observado não mostra isso.

## Cenários avaliados versus evidência

### 1. Webhook não está sendo enviado pelo Asaas

**Para venda principal:** plausível e forte.

**Para o sistema como um todo:** falso, porque há webhooks reais de `platform_fee`.

### 2. Webhook está sendo enviado, mas não chega no sistema

**Para venda principal:** plausível, mas menos específica que a hipótese de configuração por conta.

### 3. Webhook chega, mas falha antes de persistir

**Baixa probabilidade como causa dominante**, porque o código persiste log em quase todos os ramos relevantes e o endpoint já prova que consegue persistir webhooks de taxa de plataforma.

### 4. Webhook chega, mas não correlaciona com a venda

**Probabilidade média**, mas enfraquecida pela ausência total de rastros `incoming_webhook` não-platform com `external_reference` útil.

### 5. Webhook está indo para ambiente errado

**Probabilidade média/baixa como causa principal sistêmica.** Se fosse recorrente, esperaríamos muitos `401`/`400` correlacionáveis para vendas principais.

### 6. Webhook está sendo rejeitado por autenticação/token

**Possível em casos isolados**, mas a evidência atual não sustenta isso como explicação principal das vendas confirmadas por verify. Os `401` recentes não carregam contexto de venda principal.

### 7. Webhook está sendo ignorado por regra interna

**Baixa probabilidade como causa principal**, porque eventos ignorados ainda são persistidos como `incoming_webhook` quando chegam com payload parseável.

## Nível de confiança

**Médio/alto.**

É alto para afirmar que:
- o endpoint recebe webhooks reais;
- o sistema persiste webhooks de taxa de plataforma;
- a ausência está concentrada no fluxo da venda principal;
- o fallback `verify-payment-status` está cobrindo essa lacuna.

É médio para afirmar a causa externa exata, porque sem acesso ao painel/configuração do Asaas ainda não dá para diferenciar definitivamente entre:
- webhook da conta da empresa não configurado;
- webhook configurado em URL errada;
- webhook configurado com token errado;
- webhook desabilitado para determinadas contas/ambientes.

## Sugestões de correção futura (sem implementar agora)

1. Verificar no painel/configuração do Asaas de cada conta da empresa se a URL do webhook da venda principal aponta para o endpoint correto.
2. Confirmar se o token configurado na conta da empresa coincide com `ASAAS_WEBHOOK_TOKEN` / `ASAAS_WEBHOOK_TOKEN_SANDBOX` do ambiente correspondente.
3. Tornar observável no admin o número de vendas pagas por fallback sem webhook versus webhooks efetivamente recebidos por conta/empresa.
4. Se o produto depender de múltiplas contas Asaas por empresa, documentar e automatizar a configuração do webhook no onboarding, em vez de depender de configuração manual externa.
5. Opcionalmente, criar rastreabilidade específica para “conta/company sale webhook never observed” em relatórios operacionais.
