# Análise 5 — Questionário técnico do webhook Asaas (Smartbus BR)

## Objetivo

Mapear, com base no código atual do repositório, como o Smartbus BR opera o fluxo de cobrança e webhook do Asaas em sandbox e produção, respondendo de forma auditável:

- quem cria a cobrança;
- em qual conta Asaas a cobrança é criada;
- em qual conta o webhook é esperado/configurado;
- para qual endpoint interno o webhook aponta;
- como o sistema identifica empresa, ambiente e venda;
- onde existem ambiguidades, riscos e lacunas documentais.

> Escopo desta análise: **diagnóstico do estado atual**, sem corrigir, sem refatorar e sem assumir comportamento sem evidência.

## Arquivos inspecionados

### Backend / Edge Functions
- `supabase/functions/create-asaas-payment/index.ts`
- `supabase/functions/asaas-webhook/index.ts`
- `supabase/functions/create-platform-fee-checkout/index.ts`
- `supabase/functions/verify-payment-status/index.ts`
- `supabase/functions/create-asaas-account/index.ts`
- `supabase/functions/get-runtime-payment-environment/index.ts`
- `supabase/functions/_shared/payment-context-resolver.ts`
- `supabase/functions/_shared/runtime-env.ts`
- `supabase/functions/_shared/payment-observability.ts`
- `supabase/functions/_shared/payment-finalization.ts`

### Frontend
- `src/pages/public/Checkout.tsx`
- `src/hooks/use-runtime-payment-environment.ts`

### Configuração / Banco
- `supabase/config.toml`
- `supabase/migrations/20260311020000_add_sale_integration_logs.sql`
- `supabase/migrations/20261017090000_stage3_payment_observability_dedup.sql`

### Busca específica por configuração de webhook
Foi feita busca textual por termos como `notificationUrl`, `/webhooks`, `webhook create/register/config/setup` no repositório. **Não apareceu código que cadastre/programaticamente webhook do Asaas**.

## Arquitetura atual mapeada

### 1) Origem do ambiente
1. O checkout público resolve `runtimePaymentEnvironment` no frontend.
   - prioridade: `VITE_PAYMENT_ENVIRONMENT`;
   - fallback: edge `get-runtime-payment-environment`;
   - último fallback: hostname do navegador.
2. Na criação da venda (`sales`), o frontend já persiste `payment_environment`.
3. Ao criar a cobrança Asaas, a edge `create-asaas-payment` exige ambiente explícito do request ou ambiente já travado na venda.
4. Depois da primeira cobrança criada, `sales.payment_environment` + `sales.asaas_payment_id` passam a ser o vínculo oficial consumido por create (quando reentrante), verify, webhook e platform fee.

### 2) Quem cria a cobrança principal
1. O endpoint principal é `create-asaas-payment`.
2. Ele busca a venda e a empresa (`sales` + `companies`).
3. Resolve o contexto por `resolvePaymentContext({ mode: "create", ... })`.
4. No fluxo principal (`ownerType === "company"`), usa **a API key da empresa no ambiente resolvido**.
5. Cria cliente e cobrança em `POST {baseUrl}/payments` com `access_token: companyApiKey`.
6. Persiste `asaas_payment_id`, `asaas_payment_status`, `payment_method` e `payment_environment` na venda.

### 3) Split financeiro
1. O fluxo principal assume explicitamente que **a empresa é dona da cobrança**.
2. A plataforma e o sócio entram como destinos de split (`split[]`).
3. A wallet da plataforma vem de secret de ambiente (`ASAAS_WALLET_ID` ou `ASAAS_WALLET_ID_SANDBOX`).
4. A wallet do sócio vem da linha ativa de `socios_split`, filtrada por `company_id` e pelo ambiente (`asaas_wallet_id_production` / `asaas_wallet_id_sandbox`).

### 4) Exceção: cobrança da taxa da plataforma
Existe um fluxo separado, `create-platform-fee-checkout`, para taxa de plataforma em venda manual/reserva convertida. Nesse caso:
- o contexto é resolvido com `mode: "platform_fee"`;
- o `ownerType` é `platform`;
- a API key usada é a da plataforma (`ASAAS_API_KEY` ou `ASAAS_API_KEY_SANDBOX`);
- a cobrança recebe `externalReference = platform_fee_<sale_id>`.

Isso é importante porque o webhook trata esse prefixo como um fluxo dedicado.

### 5) Como o webhook entra no sistema
1. O endpoint esperado pelo sistema é a edge `asaas-webhook`.
2. `supabase/config.toml` declara a função com `verify_jwt = false`, ou seja, ela é pensada para integração externa e **não depende de JWT do Supabase**.
3. A função lê o payload bruto via `req.json()`.
4. Extrai:
   - `eventType = requestPayload?.event`
   - `asaasEventId = requestPayload?.id ?? requestPayload?.eventId`
   - `payment = requestPayload?.payment`
   - `paymentId = payment?.id`
   - `externalReference = payment?.externalReference`

### 6) Como o webhook decide o ambiente
1. O webhook **não usa host como fonte primária**.
2. Ele extrai `externalReference`, remove o prefixo `platform_fee_` quando existir e tenta obter o `saleId` real.
3. Com o `saleId`, consulta `sales.payment_environment` via `getSaleEnvironment(...)`.
4. Se não conseguir resolver ambiente persistido da venda, rejeita o webhook com erro e registra log técnico.
5. Só depois disso chama `resolvePaymentContext({ mode: "webhook", sale: { payment_environment: saleEnv }, isPlatformFeeFlow })`.

### 7) Como o webhook valida autenticidade
1. O token esperado vem do secret por ambiente:
   - produção → `ASAAS_WEBHOOK_TOKEN`
   - sandbox → `ASAAS_WEBHOOK_TOKEN_SANDBOX`
2. O token recebido pode vir dos headers:
   - `asaas-access-token`
   - `x-asaas-webhook-token`
3. O resolver monta `webhookTokenCandidates` com **apenas o token do ambiente resolvido**.
4. Se o secret do ambiente não existir, o webhook falha.
5. Se o token recebido não bater, retorna `401`.

### 8) Eventos tratados
A função trata explicitamente apenas:
- `PAYMENT_CONFIRMED`
- `PAYMENT_RECEIVED`
- `PAYMENT_OVERDUE`
- `PAYMENT_DELETED`
- `PAYMENT_REFUNDED`

Qualquer outro evento é ignorado com `200` e log técnico.

### 9) Como o webhook encontra a venda
#### Fluxo principal
- usa `payment.externalReference` como identificador primário;
- espera que esse valor seja o `sale.id`;
- depois lê a venda em `sales` por `.eq("id", saleId)`.

#### Fluxo de taxa da plataforma
- espera `externalReference = platform_fee_<sale_id>`;
- remove o prefixo e trata o restante como `saleId` real.

### 10) Como a venda é finalizada
#### Eventos de confirmação
- `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` chamam `processPaymentConfirmed(...)`;
- essa rotina delega para `finalizeConfirmedPayment(...)`;
- a finalização centralizada:
  - marca venda como `pago` quando aplicável;
  - grava `payment_confirmed_at`;
  - cria tickets a partir de `sale_passengers`;
  - remove `seat_locks`;
  - mantém idempotência.

#### Eventos de falha
- `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_REFUNDED` chamam `processPaymentFailed(...)`;
- a venda é cancelada apenas se ainda estiver em `pendente_pagamento` ou `reservado`.

### 11) Observabilidade e deduplicação
1. Logs técnicos persistidos em `sale_integration_logs`.
2. Logs operacionais persistidos em `sale_logs`.
3. Deduplicação formal por `event.id` na tabela `asaas_webhook_event_dedup`.
4. O webhook tenta registrar o `asaas_event_id` antes do processamento principal; se duplicado, responde `200` e não reprocesa.

### 12) Configuração programática do webhook do Asaas
**Não encontrei no código atual nenhum ponto que cadastre ou atualize o webhook do Asaas via API.**

Logo, pelo estado do repositório:
- o sistema **espera receber** webhook em `asaas-webhook`;
- porém a **origem/configuração do webhook dentro do painel/conta Asaas não é gerenciada por código aqui**;
- isso é uma lacuna importante de auditabilidade, porque o repositório não mostra quem aponta a conta Asaas para esse endpoint.

## Questionário técnico respondido com evidências

## Bloco A — Origem da cobrança

### 1. A cobrança é criada em nome de qual conta Asaas?
**Resposta:** no fluxo principal de venda pública, a cobrança é criada **na conta Asaas da empresa**, não na conta da plataforma.

**Evidências:**
- `resolvePaymentContext(... mode: "create" ...)` define `ownerType = "company"` quando não é fluxo de `platform_fee`.
- `create-asaas-payment` usa `companyApiKey` como `access_token` tanto para `/customers` quanto para `/payments`.
- Há comentário explícito no código: “Em todos os ambientes do fluxo principal, a empresa é dona da cobrança. Plataforma e sócio entram no split.”

### 2. A API key usada para criar a cobrança pertence a quem?
**Resposta:** no fluxo principal, pertence **à empresa**, por ambiente (`asaas_api_key_production` ou `asaas_api_key_sandbox`).

**Resposta detalhada:**
- conta da empresa? **Sim, no fluxo principal.**
- conta da plataforma? **Não, no fluxo principal.**
- subconta? **O repositório não usa essa nomenclatura explicitamente.** O que existe é a API key persistida na empresa.
- outro modelo? **Sim, apenas no fluxo separado de taxa da plataforma**, que usa API key da plataforma.

### 3. O split é aplicado sobre uma cobrança criada por qual conta?
**Resposta:** sobre uma cobrança criada **na conta da empresa**. O split envia percentuais para a wallet da plataforma e, opcionalmente, para o sócio ativo.

### 4. Existe diferença entre sandbox e produção nessa lógica?
**Resposta:** estruturalmente, **não**. O desenho é espelhado.

**Diferença real entre os ambientes:**
- muda a base URL (`api.asaas.com/v3` vs `sandbox.asaas.com/api/v3`);
- mudam os campos/credenciais lidos da empresa (`*_production` vs `*_sandbox`);
- mudam os secrets de wallet/token da plataforma.

Não há bifurcação de regra de owner da cobrança entre sandbox e produção no fluxo principal.

## Bloco B — Webhook

### 5. O webhook hoje é configurado em qual conta Asaas?
**Resposta:** **não é possível provar pelo código em qual conta ele está configurado**, porque o repositório não contém rotina de cadastro/consulta de webhook do Asaas.

**O que o código permite concluir com segurança:**
- o sistema espera receber um webhook autenticado por token por ambiente;
- como o fluxo principal cria a cobrança na **conta da empresa**, o evento relevante do pagamento principal tende a nascer na conta que é dona da cobrança, isto é, **a conta da empresa**;
- já o fluxo `platform_fee` cria cobrança na conta da plataforma, então o webhook desse fluxo tende a nascer **na conta da plataforma**.

### 6. Essa configuração é centralizada ou varia por empresa?
**Resposta:** pelo código, **a validação do webhook é centralizada por ambiente**, porque o token esperado vem de secret global do runtime (`ASAAS_WEBHOOK_TOKEN` / `ASAAS_WEBHOOK_TOKEN_SANDBOX`), não de campo por empresa.

**Mas há uma ambiguidade importante:** o código não mostra o cadastro do webhook no Asaas. Então:
- a validação interna é centralizada por ambiente;
- a configuração externa no Asaas pode ter sido feita manualmente por conta, inclusive variando por empresa;
- o repositório não documenta nem audita isso.

### 7. O sistema espera receber webhook da conta da empresa, da plataforma ou de ambas?
**Resposta:** **de ambas, dependendo do fluxo**.

- **Fluxo principal de venda:** espera evento ligado à cobrança da empresa.
- **Fluxo de taxa da plataforma (`platform_fee_<sale_id>`):** espera evento ligado à cobrança da plataforma.

Ou seja, existe um endpoint único (`asaas-webhook`) recebendo dois papéis de owner, distinguidos pelo `externalReference` e pelo `ownerType` derivado do contexto.

### 8. Existe no código alguma suposição implícita sobre isso?
**Resposta:** sim.

**Suposições implícitas identificadas:**
1. o fluxo principal assume que a cobrança pertence à empresa;
2. o fluxo de taxa assume que a cobrança pertence à plataforma;
3. o webhook assume que o `externalReference` carregará contexto suficiente para descobrir qual fluxo é esse;
4. o webhook assume que o token do ambiente é suficiente para autenticar o emissor, sem distinguir empresa específica.

### 9. Existe documentação viva no projeto explicando essa decisão?
**Resposta:** existe documentação parcial sobre ambiente, logs e hardening; **não encontrei documentação viva e direta explicando, de ponta a ponta, em qual conta Asaas o webhook deve ser configurado para cada fluxo e por quê**.

**Ausência objetiva:** não há, no código inspecionado, um documento operacional curto e normativo dizendo algo como:
- “vendas principais: webhook na conta da empresa”;
- “taxa de plataforma: webhook na conta da plataforma”;
- “endpoint único recebe ambos com distinção por `externalReference`”.

## Bloco C — Roteamento e ambiente

### 10. Como o sistema sabe se o evento recebido é sandbox ou produção?
**Resposta:** pelo `payment_environment` persistido na **venda**.

O webhook:
1. lê `payment.externalReference`;
2. resolve o `saleId` real;
3. consulta `sales.payment_environment`;
4. só então escolhe o token/ambiente de processamento.

### 11. O ambiente é inferido pelo endpoint, pela credencial, pela empresa, ou por lógica espalhada?
**Resposta:** no webhook, a fonte oficial é a **venda**. No create inicial, o ambiente nasce no checkout e é persistido na venda. Portanto, o desenho atual converge para: **ambiente oficial = configuração/decisão persistida na venda**.

Ainda há uma origem secundária/fallback no frontend/edge por hostname para descobrir o ambiente inicial do checkout, mas o webhook em si não depende disso.

### 12. Existe risco de um webhook sandbox atualizar dados de produção, ou vice-versa?
**Resposta:** o risco principal não está no endpoint em si, e sim em **dado persistido incorreto** na venda.

Se `sales.payment_environment` estiver correto, o webhook usa o token correto do ambiente e processa coerentemente.

Se `sales.payment_environment` estiver errado:
- o webhook pode validar contra o token do ambiente errado;
- ou rejeitar o evento;
- ou, no pior caso operacional, tratar o evento com classificação de ambiente incorreta nos logs.

O código reduz bastante mistura entre ambientes, mas depende fortemente da integridade de `sales.payment_environment`.

### 13. Os logs registram explicitamente ambiente, company_id, sale_id, externalReference e asaas_payment_id?
**Resposta:** **sim, em boa parte do fluxo técnico**.

**`sale_integration_logs` suporta explicitamente:**
- `sale_id`
- `company_id`
- `payment_environment`
- `event_type`
- `payment_id`
- `external_reference`
- `asaas_event_id`
- `http_status`
- `processing_status`
- `result_category`
- `incident_code`
- `warning_code`
- `duration_ms`
- `payload_json`
- `response_json`

Além disso, `logPaymentTrace(...)` também escreve contexto estruturado no console com esses dados em vários pontos.

### 14. Existe isolamento suficiente entre logs e processamento por ambiente?
**Resposta:** **parcialmente sim**.

Pontos fortes:
- `sale_integration_logs` persiste `payment_environment`.
- o webhook decide o ambiente a partir da venda e persiste esse valor nos logs.
- a deduplicação também armazena `payment_environment`.

Limite atual:
- não existe, pelo que foi inspecionado, um endpoint separado por ambiente;
- o isolamento depende da venda e do token corretos;
- o mesmo endpoint recebe eventos de sandbox e produção.

Isso é auditável, mas exige disciplina forte em `payment_environment` e `externalReference`.

## Bloco D — Vínculo com a venda

### 15. Como o webhook encontra a venda correta?
**Resposta:** pelo `payment.externalReference` do payload Asaas.

### 16. Ele usa `externalReference`, `payment id`, `invoiceNumber` ou outro identificador?
**Resposta:** o identificador primário é **`externalReference`**.

**Detalhamento:**
- `payment.id` é capturado e logado, mas não é o lookup primário da venda.
- `invoiceNumber` não aparece como critério de correlação no webhook inspecionado.
- para taxa da plataforma, há convenção especial `platform_fee_<sale_id>`.

### 17. O frontend, o checkout e o webhook usam o mesmo identificador?
**Resposta:** **sim, para o fluxo principal**.

- o checkout cria a venda e recebe `sale.id`;
- `create-asaas-payment` envia `externalReference: sale.id` ao Asaas;
- o webhook espera receber `payment.externalReference = sale.id`.

### 18. Existe risco de o webhook chegar corretamente, mas não localizar a venda?
**Resposta:** **sim**.

Casos identificáveis pelo código:
- `externalReference` ausente;
- `externalReference` inválido / não UUID (exceto fluxo `platform_fee_`);
- venda deletada/inexistente;
- venda existente sem `payment_environment` persistido válido.

Nesses cenários, o webhook registra log técnico e ignora/rejeita conforme o ramo.

### 19. Existe algum caso em que a venda seja localizada, mas a passagem não seja liberada?
**Resposta:** **sim**.

Se `finalizeConfirmedPayment(...)` reconhecer o pagamento mas não conseguir gerar tickets a partir de `sale_passengers`, o resultado fica inconsistente (`partial_failure` / `inconsistent`). O sistema evita derrubar tudo silenciosamente, mas a venda pode ter reconhecimento de pagamento sem tickets saudáveis até reconciliação.

## Bloco E — Modelo correto de arquitetura

### 20. Pelo desenho atual do projeto, qual deveria ser o modelo correto?
**Resposta baseada no desenho atual, não em preferência externa:**

- **venda principal:** cobrança criada na conta da empresa; webhook correspondente vindo da conta dona da cobrança; endpoint único interno `asaas-webhook`; identificação por `externalReference = sale.id`; ambiente vindo de `sales.payment_environment`.
- **taxa da plataforma:** cobrança criada na conta da plataforma; webhook correspondente vindo da conta da plataforma; mesmo endpoint interno; identificação por `externalReference = platform_fee_<sale_id>`.

### 21. Faz sentido o webhook existir na conta da empresa?
**Resposta:** **sim, para a cobrança principal**, porque o código cria a cobrança principal usando a API key da empresa. Em arquitetura orientada à conta dona da cobrança, o evento nasce nessa conta.

### 22. Em quais cenários faria sentido existir webhook na conta da plataforma?
**Resposta:** no fluxo **`platform_fee`**, porque a cobrança é criada com API key da plataforma e `ownerType = platform`.

### 23. Há conflito entre o modelo implementado e o modelo esperado?
**Resposta:** há **potencial de confusão**, mas não um conflito lógico inevitável.

O desenho implementado suporta dois owners diferentes no mesmo endpoint:
- empresa para venda principal;
- plataforma para taxa da plataforma.

O problema é que isso **não está explicitado de forma operacional no repositório**, então uma observação real no sandbox (“a cobrança apareceu na conta da empresa e o log de webhook também apareceu lá”) pode parecer bug arquitetural quando, para o fluxo principal, isso é compatível com o código.

### 24. O projeto está seguindo uma arquitetura simples e auditável ou está ficando ambíguo?
**Resposta:** **o núcleo está relativamente coerente, mas a camada operacional/documental está ambígua**.

Coerente:
- ambiente por venda;
- create/verify/webhook convergentes;
- correlação por `sale.id`;
- logs técnicos e deduplicação.

Ambíguo:
- ausência de cadastro/auditoria do webhook Asaas no código;
- endpoint único para dois owners distintos sem documentação normativa curta;
- token central por ambiente, não por empresa;
- necessidade de inferir arquitetura a partir de vários arquivos e comentários, em vez de uma especificação única.

## Validação de consistência entre sandbox e produção

### 1. Usam a mesma lógica?
**Sim.** O mesmo resolvedor (`payment-context-resolver.ts`) e as mesmas edge functions tratam ambos os ambientes.

### 2. Usam o mesmo fluxo estrutural?
**Sim.** O fluxo estrutural é espelhado:
- checkout persiste `payment_environment`;
- create resolve contexto por ambiente;
- webhook lê ambiente da venda;
- verify lê ambiente da venda;
- secrets, base URL e campos por ambiente variam, mas a estrutura é a mesma.

### 3. A diferença está apenas em credenciais/endpoints?
**Principalmente sim.** As diferenças objetivas são:
- `baseUrl`;
- secrets de API key / wallet / webhook token da plataforma;
- campos de configuração da empresa por ambiente.

### 4. Existe qualquer bifurcação perigosa no código?
**As bifurcações perigosas encontradas são mais operacionais do que estruturais:**
- fallback do frontend para descobrir ambiente inicial por hostname, caso build/edge falhem;
- fluxo separado de `platform_fee` usando owner da plataforma;
- dependência de `payment_environment` persistido corretamente na venda.

### 5. O fluxo de webhook está espelhado corretamente entre os ambientes?
**Sim, do ponto de vista de código.** O webhook escolhe o token do ambiente resolvido e trata sandbox/produção com a mesma lógica. Não há um ramo “sandbox especial” nem “produção especial” no processamento do webhook principal.

## Ambiguidades encontradas

1. **Não existe gestão programática do cadastro do webhook Asaas.**
   - O código não mostra onde o webhook é criado/atualizado no Asaas.
   - Sem isso, a auditoria do “em qual conta está configurado” fica incompleta.

2. **Um único endpoint recebe eventos de owners diferentes.**
   - venda principal → conta da empresa;
   - taxa da plataforma → conta da plataforma.
   - Isso é viável, mas aumenta a necessidade de documentação explícita.

3. **Token de webhook é central por ambiente, não por empresa.**
   - isso sugere padronização operacional por ambiente;
   - mas o repositório não mostra como esse token foi disseminado nas contas Asaas reais das empresas, se for o caso.

4. **A correlação depende fortemente de `externalReference`.**
   - Isso é claro no código, porém qualquer desvio manual no Asaas ou fluxo externo quebra a vinculação.

5. **A arquitetura é inferível, mas não autoexplicativa.**
   - Há comentários úteis em vários arquivos.
   - Falta um documento canônico curto dizendo quem é owner da cobrança e quem emite webhook em cada fluxo.

## Riscos encontrados

### 1. Risco de depender da conta errada do Asaas
Se alguém configurar o webhook da venda principal apenas na conta da plataforma, mas a cobrança for criada com a API key da empresa, os eventos esperados podem não chegar como o sistema pressupõe.

### 2. Risco de ambiguidade operacional
Como existe fluxo principal (empresa) e fluxo `platform_fee` (plataforma) no mesmo endpoint, suporte e operação podem interpretar logs do Asaas de forma errada sem um mapa oficial.

### 3. Risco de ambiente incorreto por dado persistido errado
Se `sales.payment_environment` nascer incorreto, o webhook e o verify seguirão esse dado incorreto como fonte de verdade.

### 4. Risco de erro silencioso de configuração externa
Como o repositório não cria/valida o webhook remoto, pode haver divergência entre o que o código espera e o que foi configurado manualmente no Asaas, sem rastreabilidade local clara.

### 5. Risco de não localizar a venda apesar de webhook legítimo
Se `externalReference` vier ausente, divergente ou em formato diferente do esperado, o evento pode ser ignorado/rejeitado sem conseguir reconciliar a venda.

### 6. Risco de venda localizada sem liberação de passagem
Mesmo com a venda correta localizada e o pagamento reconhecido, falhas na geração de tickets podem deixar a venda inconsistente até ação de reconciliação.

### 7. Risco documental / de auditoria
Hoje é possível entender o desenho lendo o código, mas **não é simples comprovar operacionalmente quem deve configurar qual webhook em qual conta** sem complementar com configuração real do Asaas e documentação normativa.

## Conclusão executiva

### Conclusão curta
Pelo código atual:
- **a cobrança principal é criada na conta Asaas da empresa**;
- **o webhook da cobrança principal faz sentido na conta da empresa**;
- **existe um segundo fluxo em que a taxa da plataforma é criada na conta da plataforma**, e nesse caso o webhook faz sentido na conta da plataforma;
- o sistema usa **um único endpoint interno** (`asaas-webhook`) para ambos os casos, distinguindo por `externalReference` e pelo `payment_environment` persistido na venda.

### Resposta objetiva para a dúvida real
> “O webhook deveria estar na conta da empresa, na conta da plataforma, ou depende?”

**Depende do tipo de cobrança.**

- **Venda/passagem principal:** pelo código atual, **deveria fazer sentido estar na conta da empresa**, porque é ali que a cobrança é criada.
- **Taxa da plataforma (`platform_fee`)**: **faz sentido estar na conta da plataforma**, porque essa cobrança é criada pela plataforma.

Se a observação real em sandbox foi: “venda criada na conta da empresa e log de webhook apareceu lá”, isso **é compatível com o desenho atual do fluxo principal**, não é por si só evidência de bug.

### O que falta para ficar realmente auditável
1. Documentar formalmente, em um único documento, owner da cobrança e owner esperado do webhook por fluxo.
2. Registrar onde e como os webhooks remotos do Asaas são configurados (manual ou automático).
3. Se a operação usar contas múltiplas de empresa no Asaas, documentar como o token de webhook por ambiente é padronizado entre elas.

## Recomendação arquitetural mínima (sem implementar ainda)

1. **Documentar explicitamente os dois fluxos**:
   - fluxo principal (empresa dona da cobrança);
   - fluxo `platform_fee` (plataforma dona da cobrança).
2. **Tornar auditável a configuração remota do webhook**:
   - ou via automação de cadastro;
   - ou via checklist/documentação operacional obrigatória.
3. **Adicionar um artefato normativo curto** definindo:
   - owner da cobrança;
   - conta emissora do webhook;
   - endpoint esperado;
   - identificador usado (`externalReference`);
   - regra de ambiente (`sales.payment_environment`).

