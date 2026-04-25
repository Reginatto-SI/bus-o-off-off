# Objetivo

Realizar uma análise técnica profunda e objetiva do motivo pelo qual a tela `/admin/empresa`, aba **Pagamentos**, continua exibindo a integração Asaas como **pendente / não conectada** mesmo após vínculo por API Key bem-sucedido em **sandbox**, sem aplicar correção estrutural nesta etapa.

# Contexto observado

- O frontend da página `/admin/empresa` calcula o estado visual a partir de um snapshot local gerado por `getAsaasIntegrationSnapshot(company, runtimePaymentEnvironment)`.
- O diagnóstico de developer e o log informado mostram:
  - ambiente operacional `sandbox`;
  - `wallet_id` presente;
  - `account_status: APPROVED`;
  - `account_name` preenchido;
  - `onboardingComplete: true`;
  - `accountId: null`;
  - `integrationStatus: partially_configured`.
- A própria razão do snapshot já aponta a pendência: `conta operacional sem account_id salvo no ambiente operacional`.

# Fluxo atual mapeado

## 1. Fonte do ambiente operacional

1. `/admin/empresa` usa o hook `useRuntimePaymentEnvironment()`.
2. Esse hook resolve o ambiente em ordem:
   - `VITE_PAYMENT_ENVIRONMENT`;
   - edge function `get-runtime-payment-environment`;
   - fallback local por hostname.
3. O ambiente resolvido é a base tanto para o snapshot visual quanto para chamadas de diagnóstico/verificação. Não existe mistura intencional entre sandbox e produção.

## 2. Fonte de verdade do status visual

1. Em `Company.tsx`, após carregar a empresa, a tela cria:
   - `asaasSnapshot = getAsaasIntegrationSnapshot(company, runtimePaymentEnvironment)`
   - `asaasStatus = asaasSnapshot?.status ?? 'not_configured'`
2. O helper `getAsaasIntegrationSnapshot` lê **somente** os campos do ambiente operacional atual:
   - `asaas_api_key_*`
   - `asaas_wallet_id_*`
   - `asaas_account_id_*`
   - `asaas_account_email_*`
   - `asaas_onboarding_complete_*`
3. O cálculo é:
   - `connected` somente se houver `apiKey + walletId + onboardingComplete + accountId`;
   - `partially_configured` se houver conexão operacional (`apiKey + walletId + onboardingComplete`) mas faltar `accountId`;
   - `inconsistent` se `onboardingComplete = true` e faltar `apiKey` ou `walletId`;
   - `not_configured` se não houver configuração relevante.

## 3. Fluxo do botão/card “Já tenho conta Asaas”

1. Em `/admin/empresa`, clicar no card **“Já tenho conta Asaas”** apenas define `asaasOnboardingMode = 'link'`.
2. Em seguida, o botão “Abrir wizard de vínculo” abre o componente reutilizado `AsaasOnboardingWizard`.
3. O wizard recebe `initialMode="link"` e monta o payload:
   - `company_id`
   - `mode: 'link_existing'`
   - `api_key`
   - `target_environment: effectiveTargetEnvironment`
4. O submit chama `supabase.functions.invoke('create-asaas-account', ...)`.

## 4. Fluxo da edge function `create-asaas-account` no modo `link_existing`

1. A function resolve o ambiente via `target_environment` (ou host como fallback), depois seleciona somente as colunas daquele ambiente.
2. Ela chama `GET {asaasBaseUrl}/myAccount` com a API Key informada.
3. Em caso de sucesso, tenta extrair:
   - `walletId` via parser tolerante (`walletId`, `wallet_id`, `wallet.id`, `id`, etc.);
   - `accountId` **somente** por `accountData.id`.
4. Se `walletId` não for encontrado, grava vínculo parcial:
   - `apiKey`
   - `accountId = accountData.id || null`
   - `accountEmail`
   - `walletId = null`
   - `onboardingComplete = false`
5. Se `walletId` for encontrado, grava:
   - `apiKey`
   - `walletId`
   - `accountId = accountData.id || null`
   - `accountEmail`
   - `onboardingComplete = true`
6. A function **não promove sozinha** o status para `connected`; ela apenas persiste dados. O status final é recalculado no frontend após `fetchCompany()`.

## 5. Revalidação/diagnóstico

1. O painel developer ainda usa `create-asaas-account` no modo `revalidate`.
2. O modo `revalidate` consulta o Asaas, tenta recuperar `walletId` e devolve resposta técnica (`success`, `wallet_id`, `account_status`, `account_name`).
3. Esse fluxo **não persiste** `account_id`, `wallet_id` nem corrige o cadastro; é apenas diagnóstico técnico.
4. Já o botão “Verificar integração” usa a edge function dedicada `check-asaas-integration`, que também **não persiste nada**; ela só compara o que está salvo com o gateway.

# Arquivos analisados

- `src/pages/admin/Company.tsx`
- `src/components/admin/AsaasOnboardingWizard.tsx`
- `src/components/admin/AsaasDiagnosticPanel.tsx`
- `src/lib/asaasIntegrationStatus.ts`
- `src/hooks/use-runtime-payment-environment.ts`
- `src/types/database.ts`
- `supabase/functions/create-asaas-account/index.ts`
- `supabase/functions/check-asaas-integration/index.ts`

# Critério atual de status da integração

## Fonte principal

O critério visual atual está **centralizado principalmente** em `src/lib/asaasIntegrationStatus.ts`, mas a comunicação do problema e o comportamento da tela ficam espalhados entre:

- `getAsaasIntegrationSnapshot` → cálculo do status;
- `Company.tsx` → badge, alertas e cards renderizados;
- `check-asaas-integration` → diagnóstico operacional e mensagens de validação;
- `create-asaas-account` → persistência de campos que alimentam esse cálculo.

## Regra objetiva usada hoje

Para o ambiente operacional atual, o sistema considera:

- **Conectado (`connected`)**
  - `apiKey` presente
  - `walletId` presente
  - `onboardingComplete = true`
  - `accountId` presente

- **Parcialmente configurado (`partially_configured`)**
  - conexão operacional existe (`apiKey + walletId + onboardingComplete`)
  - mas `accountId` está ausente

- **Inconsistente (`inconsistent`)**
  - `onboardingComplete = true`
  - porém falta `apiKey` ou `walletId`

- **Não configurado (`not_configured`)**
  - ausência de configuração relevante no ambiente atual

## Resposta objetiva à dúvida sobre obrigatoriedade de `account_id`

Hoje, **sim: `account_id` é obrigatório para a UI considerar “connected”**. Isso não é hipótese; é regra explícita do helper de status e também é reforçado pela edge `check-asaas-integration`, que devolve `pending` quando o gateway valida a conta mas o `account_id` local está ausente.

# Evidências encontradas

## Evidência 1 — o helper de status exige `accountId`

`getAsaasIntegrationSnapshot` define `connected` apenas quando `currentIsConnected && current.accountId`. Quando `currentIsConnected && !current.accountId`, ele define `partially_configured` e adiciona o motivo `conta operacional sem account_id salvo no ambiente operacional`.

## Evidência 2 — a UI só sai do bloco de conexão pendente quando o status é `connected`

Na aba Pagamentos, `Company.tsx` tem um `if` binário:

- se `asaasStatus === 'connected'`, mostra o bloco verde “Pagamentos ativos”;
- caso contrário, mostra o alerta de configuração incompleta/inconsistente e também mantém acessíveis os cards “Criar conta Asaas” e “Já tenho conta Asaas”.

Ou seja: `partially_configured` é tratado visualmente como **ainda não conectado**, sem estado intermediário próprio.

## Evidência 3 — o vínculo por API Key não tem parser robusto para `accountId`

No modo `link_existing`:

- `walletId` usa `extractWalletIdFromAsaasPayload`, com fallback em `/wallets` e `/accounts`;
- `accountId` usa apenas `accountData.id || null`.

Logo, se o payload real de `/myAccount` no sandbox não trouxer `id` no topo, o vínculo pode salvar:

- `apiKey = ok`
- `walletId = ok`
- `onboardingComplete = true`
- `accountId = null`

Esse exato cenário leva automaticamente a `partially_configured`.

## Evidência 4 — revalidação positiva não corrige persistência

O modo `revalidate` de `create-asaas-account` e a edge `check-asaas-integration` validam tecnicamente a conta, mas **não gravam** `account_id` faltante de volta em `companies`. Portanto, um diagnóstico positivo não altera o estado visual se a pendência persistida continuar igual.

# Divergência entre backend e frontend

Existe uma divergência real, mas ela não é “frontend vs backend” no sentido simples de um estar errado e o outro certo. A divergência está entre **dois níveis de verdade**:

## Verdade técnica de gateway

- O Asaas aceitou a API Key.
- O ambiente foi resolvido como sandbox.
- A conta responde como aprovada.
- O `wallet_id` foi encontrado.

## Verdade funcional/persistida usada pela UI

- A UI considera conectada apenas a empresa cujo cadastro local do ambiente ativo contém também `account_id`.
- Como o snapshot local mostra `accountId = null`, o frontend permanece em `partially_configured`.

## Conclusão sobre a divergência

O backend de diagnóstico está dizendo: **“a conta existe e responde”**.  
O frontend está dizendo: **“o cadastro local desta integração ainda não está completo segundo a regra funcional atual”**.

Essas duas afirmações podem coexistir com o código atual — e é exatamente o que está acontecendo.

# Ambiente sandbox vs produção

## O código trata ambientes de forma espelhada?

Sim, na parte analisada, a lógica está espelhada:

- os helpers escolhem campos por ambiente;
- o snapshot lê apenas o ambiente atual;
- o vínculo persiste apenas no bloco do ambiente escolhido;
- a verificação manual e o diagnóstico também recebem `target_environment`.

## Foi encontrada lógica do tipo “produção conectada / sandbox não” por regra especial?

Não foi encontrada regra visual ou helper que rebaixe sandbox por ser sandbox.

## Ponto sensível real

No wizard, para usuários não-developer, `effectiveTargetEnvironment` é forçado para `production`. Para developer, sandbox/production pode ser selecionado. Isso afeta **qual bloco da empresa será gravado**, mas não cria um conceito de status diferente por ambiente. Portanto, o sintoma atual não decorre de uma “punição” do sandbox; decorre do fato de o bloco sandbox ativo ainda estar sem `account_id`.

# Persistência

## O que é gravado ao concluir o vínculo por API Key

No sucesso com `walletId`:

- `asaas_api_key_<env>`
- `asaas_wallet_id_<env>`
- `asaas_account_id_<env>` = `accountData.id || null`
- `asaas_account_email_<env>`
- `asaas_onboarding_complete_<env>` = `true`

## O que deveria estar gravado para a UI atual considerar conectado

- `api_key`
- `wallet_id`
- `account_id`
- `onboarding_complete = true`

## O que provavelmente não está sendo gravado

No cenário observado, o ausente é **`asaas_account_id_sandbox`**.

## O sistema espera um dado que o fluxo atual pode não produzir?

Sim, potencialmente.

O fluxo atual **espera** que `accountData.id` exista no retorno de `/myAccount`. Porém, diferente do `walletId`, não há parser tolerante nem fallback adicional para `accountId`. Se o Asaas devolver a identificação da conta em outro campo/shape nesse fluxo, o sistema não captura esse valor e a integração fica eternamente parcial mesmo com wallet e API Key válidas.

## O `account_id` poderia ser inferido por outra rota?

Pelo código existente, sim:

- o próprio `check-asaas-integration` consegue ler `accountData.id` no retorno de `/myAccount`;
- `link_existing` já chama `/accounts` como fallback para resolver wallet, mas não reaproveita esse caminho para consolidar `accountId`;
- `revalidate` também não persiste o `remoteAccountId`.

Então existe espaço técnico para inferência futura **sem inventar nova arquitetura**, mas isso ainda não acontece no fluxo atual.

# UX / comportamento da tela

## A tela está errando ao continuar mostrando “Criar conta Asaas” e “Já tenho conta Asaas”?

Sob a regra atual de código, **não é um bug de renderização isolado**; é consequência direta de `asaasStatus !== 'connected'`.

## Mas a UX comunica mal?

Sim. A UX atual colapsa dois estados distintos no mesmo bloco:

- **não conectado de verdade**
- **conectado tecnicamente, porém com pendência cadastral local**

Como ambos caem no mesmo ramo visual, o usuário vê novamente os cards de conexão e pode interpretar que precisa reconectar a conta, mesmo quando o problema real pode ser apenas ausência de `account_id` persistido.

## A tela diferencia “conectada mas incompleta” de “não conectada”?

Parcialmente:

- há badge “Configuração pendente”;
- há alerta com motivo textual;
- porém o CTA principal continua sendo de criar/vincular conta, o que empurra o usuário para reconexão.

Portanto, a tela **não diferencia com clareza suficiente** o estado parcial do estado “não conectado”.

# Diagnóstico da causa mais provável

## Causa técnica mais provável

A causa mais provável é a combinação de dois fatos:

1. **O vínculo por API Key depende de `accountData.id` para persistir `account_id`.**
2. **A UI só considera a integração conectada quando `account_id` está salvo no ambiente ativo.**

Então, se o Asaas respondeu com `walletId`, `status`, `name`, e até validou a conta, mas não entregou `id` no formato esperado por `link_existing`, o banco fica com:

- API Key salva;
- Wallet salva;
- onboarding marcado como concluído;
- `account_id = null`.

Isso produz exatamente o snapshot e o comportamento observados.

## Causa secundária de UX

Mesmo que a classificação `partially_configured` esteja tecnicamente correta segundo a regra atual, a UI comunica esse estado de forma ambígua porque reapresenta a jornada de conexão como se a conta ainda não estivesse vinculada.

# Conclusão: o sistema está errado no status, na persistência ou na UX?

## Resposta curta

O caso aponta **principalmente para persistência insuficiente do `account_id` no fluxo de vínculo por API Key**, com **efeito secundário de UX confusa**.

## Resposta detalhada

- **Status**: pela regra atual do código, `partially_configured` está correto.
- **Persistência**: é o principal suspeito, porque `account_id` é requisito funcional do sistema atual e aparentemente não está sendo salvo nesse cenário real.
- **UI/UX**: também está comunicando mal, porque trata `partially_configured` quase como “não conectado”, induzindo reconexão.
- **Critério funcional**: o critério atual exige `account_id`; isso está explícito e consistente entre helper + verificação manual. Não parece um acidente isolado do frontend.

# Resposta inequívoca à pergunta principal

**A empresa aparece como não conectada / pendente na UI porque o frontend considera a integração “connected” apenas quando o ambiente operacional atual possui `apiKey + walletId + onboardingComplete + accountId`. No caso observado, o vínculo por API Key foi tecnicamente bem-sucedido no sandbox, mas o `account_id` do ambiente permaneceu nulo no cadastro da empresa. Por isso o snapshot local é calculado como `partially_configured`, e a tela continua no ramo visual de configuração pendente.**

# Próxima correção mínima recomendada

## Onde mexer primeiro

A próxima correção mínima deve mexer **primeiro em persistência / extração do `account_id` no fluxo de vínculo por API Key**.

## Justificativa

- Esse é o ponto que explica simultaneamente:
  - sucesso técnico no diagnóstico;
  - `wallet_id` presente;
  - `onboardingComplete = true`;
  - UI ainda em `partially_configured`.
- Alterar apenas a renderização da UI sem resolver a ausência do `account_id` esconderia uma pendência real da regra atual.
- Relaxar o helper de status sem validar o contrato funcional do `account_id` pode criar inconsistência com a edge `check-asaas-integration`.

## Ordem mínima sugerida para a próxima etapa

1. Confirmar o payload real retornado por `/myAccount` no fluxo sandbox que gerou `accountId = null`.
2. Verificar se o `account_id` existe em outro caminho já acessado pelo fluxo atual.
3. Corrigir a persistência do `account_id` sem mudar a semântica de status.
4. Só depois reavaliar se a UX de `partially_configured` precisa de ajuste textual/visual.

# Riscos de corrigir de forma errada

- Marcar `connected` sem `account_id` pode quebrar a coerência com a verificação manual e com auditoria operacional.
- Alterar apenas a UI pode mascarar um dado local incompleto e dificultar suporte futuro.
- Adicionar lógica especial para sandbox vs produção violaria a diretriz do projeto de espelhamento entre ambientes.
- Persistir `account_id` por inferência inadequada sem validar o contrato real do payload pode associar a empresa à conta errada.

# Perguntas em aberto

1. O payload real de `/myAccount` no sandbox, para esta conta, traz algum identificador equivalente ao account ID fora de `accountData.id`?
2. O vínculo observado foi executado pelo wizard atual (`link_existing`) ou a empresa já vinha de tentativa anterior/legado antes da mudança para fluxo único?
3. Existe algum caso real em que o Asaas valide a conta, devolva wallet, mas deliberadamente não devolva identificador da conta no endpoint `/myAccount`?
