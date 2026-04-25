# 1. Resumo executivo

## Diagnóstico

- **Existem dois fluxos reais para a mesma ação de vínculo via API Key**:
  1. fluxo inline em `/admin/empresa`;
  2. fluxo via `AsaasOnboardingWizard` usado em `/admin/eventos` e também parcialmente em `/admin/empresa` para criação de conta.
- Esses fluxos **não são idênticos**. O fluxo inline de `/admin/empresa` não usa o wizard, não expõe seletor visual de ambiente, não compartilha o mesmo estado local do modal e envia o ambiente de modo diferente do fluxo de `/admin/eventos`.
- O backend de vínculo (`create-asaas-account`, modo `link_existing`) é único, mas o frontend que o aciona está **duplicado e divergente**, o que confirma a inconsistência estrutural de UX/fluxo.
- O suporte a **sandbox vs produção existe**, porém está **parcialmente implementado e operacionalmente frágil**:
  - há colunas separadas por ambiente no banco;
  - há base URL diferente por ambiente no backend;
  - há seletor de ambiente no wizard para developer;
  - porém `/admin/empresa` no fluxo inline fixa implicitamente o ambiente operacional atual e não permite a mesma escolha visual do wizard;
  - a decisão ainda depende de múltiplas fontes (build, edge, hostname fallback e override manual).
- O erro `Não foi possível obter o walletId da conta Asaas (HTTP 400)` sai do backend quando o `walletId` não vem de `/myAccount` **nem** do fallback em `/wallets`. Pelo código, isso pode acontecer por incompatibilidade entre ambiente/chave e endpoint, ou por contrato/resposta do Asaas que não retorna wallet no formato esperado. O código **não prova** que a chave seja inválida; ele prova apenas que o `walletId` não foi resolvido naquele ambiente/base URL.

## Respostas objetivas

### Existem dois fluxos diferentes?
Sim. Há um fluxo inline próprio em `/admin/empresa` para `link_existing` e um fluxo via `AsaasOnboardingWizard` usado em `/admin/eventos` e também em `/admin/empresa` apenas para `create`.

### Eles são idênticos ou divergentes?
Divergentes. Compartilham o mesmo endpoint backend, mas diferem em UI, captura de ambiente, ponto de entrada, validações auxiliares e tratamento de jornada.

### Qual é o fluxo “oficial”?
Hoje não existe uma fonte única de verdade no frontend. O componente mais próximo de fluxo oficial é o `AsaasOnboardingWizard`, porque ele já concentra `create` e `link` em um único componente reutilizável. Porém `/admin/empresa` ainda mantém um fluxo inline paralelo para `link_existing`.

### Existe duplicação indevida?
Sim. A duplicação mais evidente é o fluxo de vínculo por API Key em `/admin/empresa`, que repete comportamento já existente no wizard.

---

# 2. Mapeamento dos fluxos existentes

## Fluxo A — `/admin/empresa` → vínculo inline por API Key

### Onde ocorre
- Rota: `/admin/empresa`
- Arquivo principal: `src/pages/admin/Company.tsx`

### Como é acionado
- Na aba de pagamentos, quando a integração não está conectada, a tela exibe dois cards:
  - `Criar conta Asaas`
  - `Já tenho conta Asaas`
- Ao escolher `Já tenho conta Asaas`, a página abre um formulário inline dentro do próprio card, sem modal/wizard.

### Componente/estrutura usada
- Não usa componente dedicado para o vínculo por API Key.
- Usa o próprio `CompanyPage` com estados locais:
  - `asaasOnboardingMode`
  - `asaasApiKeyInput`
  - `asaasConnecting`

### Campos enviados
- `company_id`
- `mode: 'link_existing'`
- `api_key`
- `target_environment: runtimePaymentEnvironment`

### Endpoint chamado
- Edge Function: `create-asaas-account`

### Características relevantes
- Não possui seletor visual de ambiente.
- Sempre usa `runtimePaymentEnvironment` resolvido pela aplicação naquele momento.
- A validação local antes do submit é mínima: apenas exige empresa salva e API Key não vazia.
- O sucesso fecha o bloco inline, limpa o campo e faz `fetchCompany()`.

## Fluxo B — `/admin/eventos` → vínculo via `AsaasOnboardingWizard`

### Onde ocorre
- Rota: `/admin/eventos`
- Arquivos principais:
  - `src/pages/admin/Events.tsx`
  - `src/components/admin/AsaasOnboardingWizard.tsx`

### Como é acionado
- Quando a tela detecta ausência de conexão Asaas, abre um gate de monetização.
- O botão `Conectar Pagamentos` abre o wizard reutilizável.
- Dentro do wizard, o usuário escolhe `Vincular conta existente`.

### Componente/estrutura usada
- Componente reutilizável `AsaasOnboardingWizard`.
- O fluxo de vínculo acontece dentro do modal `Dialog` do wizard.

### Campos enviados
- `company_id`
- `mode: 'link_existing'`
- `api_key`
- `target_environment: effectiveTargetEnvironment`

### Endpoint chamado
- Edge Function: `create-asaas-account`

### Características relevantes
- Possui seletor de ambiente visível para developer (`auto`, `sandbox`, `production`).
- Para não-developer, o componente força `production` explicitamente.
- O fluxo compartilha a mesma jornada visual de criação e vínculo.
- Após sucesso, executa `onSuccess`, revalida conexão e libera automaticamente a jornada bloqueada em eventos.

## Fluxo C — `/admin/empresa` → criação via wizard

### Onde ocorre
- A mesma rota `/admin/empresa` também usa o `AsaasOnboardingWizard`, mas apenas quando o usuário escolhe `Criar conta Asaas`.

### Conclusão do mapeamento
- A aplicação já tem um wizard reutilizável para onboarding Asaas.
- Mesmo assim, mantém um fluxo paralelo inline para `link_existing` em `/admin/empresa`.
- Portanto, o problema não é apenas “duas telas diferentes”; é um caso concreto de **um fluxo parcialmente centralizado e parcialmente duplicado**.

---

# 3. Comparação entre /admin/empresa e /admin/eventos

## 3.1 Estrutura visual

### `/admin/empresa`
- A jornada principal fica embutida na aba `Pagamentos` da página de empresa.
- O vínculo por API Key aparece inline, dentro do card da própria tela.
- Não há modal para o fluxo `link_existing`.
- A criação de conta usa wizard/modal, mas o vínculo não.

### `/admin/eventos`
- A jornada começa com um modal de bloqueio/gate de monetização.
- O clique abre um segundo modal: `AsaasOnboardingWizard`.
- O vínculo por API Key é feito dentro desse wizard.

## 3.2 Seletor de ambiente

### `/admin/empresa`
- No fluxo inline de API Key, **não existe seletor visual de ambiente**.
- O ambiente enviado é `runtimePaymentEnvironment`.
- Isso significa que a decisão vem de fora da tela e fica implícita para o usuário.

### `/admin/eventos`
- No wizard, developer pode escolher `auto`, `sandbox` ou `production`.
- Para não-developer, o componente exibe “Ambiente: Produção” e força `production` no payload.

## 3.3 Comportamento do botão “vincular”

### `/admin/empresa`
- Chama `handleConnectAsaasLink()`.
- Faz invoke direto da edge function.
- Depois do sucesso: toast, limpa campo, fecha modo inline e recarrega a empresa.

### `/admin/eventos`
- Chama `handleLinkExistingAccount()` dentro do wizard.
- Também faz invoke da mesma edge function.
- Depois do sucesso: toast, `onSuccess`, revalidação de conexão e destravamento automático do fluxo de eventos.

## 3.4 Validações

### `/admin/empresa`
- Valida apenas:
  - empresa salva (`editingId`)
  - API Key preenchida
- Não há validação visual de ambiente nem contexto explicativo sobre sandbox/produção.

### `/admin/eventos`
- Valida:
  - empresa carregada (`localCompanyData.companyId`)
  - API Key preenchida
- Além disso, o componente já controla explicitamente o ambiente alvo e possui contexto visual sobre uso seguro da chave.

## 3.5 Tratamento de erro

### Igualdade parcial
- Ambos usam `extractAsaasErrorMessage()`.
- Ambos anexam `HTTP {status}` quando o parser consegue extrair status.

### Diferença prática
- Em `/admin/empresa`, o erro aparece num fluxo inline sem contexto visual de ambiente.
- Em `/admin/eventos`, o erro aparece dentro do wizard que mostra o ambiente selecionado, reduzindo ambiguidade operacional.

## 3.6 Estado após sucesso

### `/admin/empresa`
- Recarrega a empresa e atualiza o card de integração.

### `/admin/eventos`
- Revalida conexão e libera automaticamente a ação que estava bloqueada (criar/publicar evento).

## Divergências exatas identificadas

1. **Mesmo caso de uso, duas UXs diferentes**.
2. **Somente um dos fluxos mostra/permite controlar ambiente**.
3. **Somente `/admin/eventos` usa o wizard reutilizável para vínculo**.
4. **`/admin/empresa` tem fluxo inline próprio para `link_existing`**.
5. **Pós-sucesso é diferente**, porque `/admin/eventos` encadeia continuidade da jornada bloqueada.
6. **Fonte do ambiente diverge**:
   - Company inline: `runtimePaymentEnvironment`
   - Wizard: `effectiveTargetEnvironment` (`production` para não-developer; override opcional para developer)

---

# 4. Análise de ambiente (sandbox vs produção)

## O que existe hoje

### Backend
- O backend possui base URL distinta por ambiente:
  - produção: `https://api.asaas.com/v3`
  - sandbox: `https://sandbox.asaas.com/api/v3`
- Também há secrets distintos por ambiente:
  - `ASAAS_API_KEY`
  - `ASAAS_API_KEY_SANDBOX`
- A empresa armazena credenciais distintas por ambiente:
  - `asaas_api_key_production`
  - `asaas_wallet_id_production`
  - `asaas_account_id_production`
  - `asaas_account_email_production`
  - `asaas_onboarding_complete_production`
  - equivalentes `_sandbox`

### Frontend
- Existe um hook de ambiente operacional: `useRuntimePaymentEnvironment()`.
- A ordem de decisão é:
  1. `VITE_PAYMENT_ENVIRONMENT`
  2. edge `get-runtime-payment-environment`
  3. fallback por hostname
- O wizard ainda permite override manual para developer.

## Como o ambiente é definido hoje

### Não existe uma única origem simples
O sistema usa múltiplas camadas:
- build env (`VITE_PAYMENT_ENVIRONMENT`)
- edge function (`get-runtime-payment-environment`)
- fallback por hostname no browser
- override por `target_environment` no request do wizard
- resolução por host no backend quando `target_environment` não é enviado

## Impacto disso
Isso significa que o ambiente **não está hardcoded**, mas também **não está centralizado de forma absoluta**. Há uma centralização parcial com escape hatches.

## O sistema suporta sandbox corretamente?
### Resposta curta
**Parcialmente implementado, mas com fragilidade operacional.**

### Justificativa
Suporta sandbox porque:
- há colunas separadas por ambiente;
- há base URL e secrets por ambiente;
- a edge function resolve `paymentEnv` e escolhe colunas/endpoint corretos;
- o wizard permite explicitamente sandbox para developer.

Mas é frágil porque:
- `/admin/empresa` não expõe o ambiente no fluxo inline de vínculo;
- usuários diferentes podem ter experiências diferentes para a mesma ação;
- o frontend permite override manual no wizard enquanto outras telas dependem do runtime;
- ainda existe heurística por host como fallback;
- o próprio arquivo `runtime-env.ts` declara que host é utilidade “legada/de suporte”, não caminho principal.

## Existe risco de usar API Key sandbox em endpoint de produção?
### Pelo código, o risco foi reduzido, mas não eliminado operacionalmente
- A edge function usa `target_environment` quando enviado; caso contrário, cai no ambiente resolvido por host.
- O fluxo inline de `/admin/empresa` sempre envia `runtimePaymentEnvironment`.
- O wizard pode enviar `sandbox`/`production` explicitamente.

Se o ambiente operacional detectado estiver divergente do ambiente real da chave, a chamada irá para a base URL errada. Nesse cenário, a falha de `walletId` é compatível com o código.

## Headers mudam por ambiente?
- Não. O header observado é `access_token`, igual nos dois ambientes.
- O que muda é a base URL e o secret de plataforma usado no fluxo de criação/revalidação.

---

# 5. Fluxo técnico completo de vinculação

## Etapa 1 — input da API Key

### `/admin/empresa`
- O usuário digita a chave no input local `asaasApiKeyInput`.

### `/admin/eventos`
- O usuário digita a chave em `apiKeyInput` dentro do `AsaasOnboardingWizard`.

## Etapa 2 — envio do formulário

### `/admin/empresa`
- `handleConnectAsaasLink()` chama `supabase.functions.invoke('create-asaas-account', ...)`.
- Envia `company_id`, `mode: 'link_existing'`, `api_key` e `target_environment: runtimePaymentEnvironment`.

### `/admin/eventos`
- `handleLinkExistingAccount()` faz a mesma invoke.
- Envia `company_id`, `mode: 'link_existing'`, `api_key` e `target_environment: effectiveTargetEnvironment`.

## Etapa 3 — função server chamada
- A edge function `create-asaas-account` autentica usuário, exige admin, valida pertencimento à empresa e resolve ambiente efetivo com `resolveTargetEnvironment()`.
- Depois disso, escolhe as colunas corretas (`production` ou `sandbox`) e a base URL correspondente.

## Etapa 4 — chamada ao Asaas
No modo `link_existing`:
1. chama `GET {asaasBaseUrl}/myAccount` com `access_token: api_key`;
2. se a resposta não for OK, devolve 400 com mensagem genérica de chave inválida/conta não encontrada;
3. se a resposta for OK, tenta extrair `walletId` de:
   - `accountData.walletId`
   - `accountData.wallet?.id`
   - `accountData.id`
4. se ainda não encontrar, tenta `GET {asaasBaseUrl}/wallets` com a mesma chave.

## Etapa 5 — tentativa de obter walletId
- O `walletId` é considerado resolvido se vier do `/myAccount`, do `/wallets` ou de fallback já persistido no modo `revalidate`.
- No modo `link_existing`, não há fallback para valor antigo da empresa antes da primeira persistência; se `/myAccount` e `/wallets` não fornecerem wallet, a função retorna erro 400.

## Etapa 6 — persistência no banco
Se o vínculo funcionar, a função atualiza apenas os campos do ambiente escolhido:
- `asaas_wallet_id_<env>`
- `asaas_api_key_<env>`
- `asaas_account_id_<env>`
- `asaas_account_email_<env>`
- `asaas_onboarding_complete_<env> = true`

## Etapa 7 — retorno ao frontend
- Retorna `{ success: true, wallet_id, account_name }`.
- O frontend mostra toast de sucesso e atualiza o estado local conforme a tela.

## Dependências ocultas relevantes
- O usuário precisa ser admin (`is_admin`).
- O usuário precisa pertencer à empresa (`user_belongs_to_company`).
- A empresa precisa estar salva/identificada.
- O ambiente precisa estar coerente para o endpoint correto.
- O contrato de resposta do Asaas precisa fornecer wallet em um dos formatos assumidos.

---

# 6. Diagnóstico do erro do walletId

## Erro observado
`Não foi possível obter o walletId da conta Asaas (HTTP 400)`

## Ponto exato do código que gera esse erro
O erro é emitido quando:
1. `/myAccount` responde com sucesso;
2. o código não encontra `walletId` em `walletId`, `wallet.id` ou `id`;
3. o fallback em `/wallets` também não retorna um `id` compatível.

## O que o código permite afirmar como fato

### Fato 1
Esse erro **não é o mesmo caminho** do caso “API Key inválida ou conta não encontrada”. Se `/myAccount` falhar, a função retorna outra mensagem.

### Fato 2
O erro também **não prova sozinho** que a API Key seja inválida. Ele prova apenas que o backend conseguiu passar da autenticação básica de `/myAccount` e mesmo assim não resolveu `walletId` com a lógica atual.

### Fato 3
O backend espera um desses formatos:
- `accountData.walletId`
- `accountData.wallet.id`
- `accountData.id`
- `walletData.id`
- `walletData.wallet.id`

Se o Asaas responder outro shape, o sistema acusa erro mesmo com chave válida.

## Causas possíveis classificadas

### 1. API Key válida, mas ambiente errado
**Alta aderência ao código.**
Se uma chave sandbox for enviada para produção, ou vice-versa, o endpoint pode responder de forma inesperada ou incompleta. Como o ambiente depende de múltiplas fontes e o fluxo inline não mostra ambiente, essa hipótese é plausível.

### 2. Endpoint incorreto para o tipo de conta/retorno esperado
**Alta aderência ao código.**
A função assume que `/myAccount` e `/wallets` devolverão wallet em formatos específicos. Se a conta vinculada não devolver isso nesse ambiente/tenant, o fluxo falha.

### 3. Contrato de resposta do Asaas incompatível com o parser atual
**Alta aderência ao código.**
O parser é estrito e tenta poucos caminhos. Se o payload real vier em outro formato, o erro 400 aparece mesmo com chave/autenticação válidas.

### 4. Uso de endpoint de subconta em conta independente
**Hipótese plausível, mas não comprovada só pelo código.**
O código não diferencia explicitamente tipos de conta no `link_existing`; ele trata toda conta como se `/myAccount` + `/wallets` bastassem.

### 5. Payload inválido
**Baixa aderência ao caso específico.**
No vínculo via API Key, o payload para o Asaas é só header `access_token`; não há body complexo que justifique 400 por payload local do app.

### 6. Headers incorretos
**Baixa aderência, porém não descartável sem tráfego real.**
O código sempre manda `access_token`, sem outro header específico por ambiente.

### 7. API Key inválida
**Baixa aderência ao erro exato.**
Se a chave fosse claramente inválida e `/myAccount` falhasse, a mensagem esperada seria a de chave inválida/conta não encontrada, não a de wallet ausente.

## Conclusão diagnóstica do erro
A causa mais provável, com base apenas no código, é uma destas duas classes:
1. **ambiente efetivo divergente do ambiente real da chave**, principalmente por inconsistência entre fluxo inline e wizard; ou
2. **parser de wallet insuficiente para o payload real retornado pelo Asaas**.

O código atual não oferece observabilidade suficiente no frontend para distinguir facilmente essas duas possibilidades.

---

# 7. Problemas estruturais encontrados

1. **Duplicação de fluxo para a mesma ação** (`link_existing`).
2. **Inconsistência de UX** entre `/admin/empresa` e `/admin/eventos`.
3. **Ambiente não totalmente transparente ao usuário** no fluxo inline.
4. **Fonte de verdade de ambiente distribuída demais** (build + edge + host + override manual).
5. **Backend com dependência implícita de formato de resposta do Asaas para wallet**.
6. **Mensagens de erro finais não deixam claro se a falha foi de ambiente, contrato ou credencial.**
7. **Fluxo oficial não está institucionalizado**: o wizard existe, mas não é a única jornada.

---

# 8. Riscos atuais do sistema

## Risco funcional
- Usuário vincula chave no ambiente errado sem perceber, especialmente em `/admin/empresa`.

## Risco de manutenção
- Qualquer ajuste futuro em validação/mensagens/segurança precisa ser replicado em dois fluxos frontend.

## Risco de suporte
- O mesmo erro operacional pode se manifestar com telas diferentes, dificultando diagnóstico e treinamento de suporte.

## Risco de consistência
- A plataforma pode parecer “conectada” ou “não conectada” dependendo do ambiente operacional resolvido, o que exige entendimento técnico do snapshot por ambiente.

## Risco de evolução
- Novos pontos do sistema podem reutilizar o wizard ou copiar o fluxo inline, ampliando a divergência.

---

# 9. Proposta de arquitetura recomendada

## 9.1 Wizard único de integração Asaas

### Recomendação
Adotar `AsaasOnboardingWizard` como **único fluxo de frontend** para:
- criar conta Asaas;
- vincular conta existente via API Key;
- eventualmente revalidar estado, se futuramente fizer sentido.

### Uso previsto
- `/admin/empresa`
- `/admin/eventos`
- qualquer outra tela que precise iniciar onboarding/vínculo

### Benefício
- elimina duplicação de UI;
- unifica mensagens;
- unifica decisão de ambiente;
- reduz divergência de manutenção.

## 9.2 Regra de ambiente

### Recomendação
- `production` como padrão operacional.
- `sandbox` apenas para developer/suporte interno.
- persistência sempre separada por ambiente.
- o frontend deve sempre exibir explicitamente o ambiente em qualquer vínculo por API Key, mesmo quando ele estiver bloqueado/forçado.

## 9.3 Fonte única de verdade

### Recomendação
Centralizar a resolução de ambiente em uma regra única auditável:
- frontend consulta uma única fonte já resolvida;
- backend recebe o ambiente explícito para operações administrativas;
- remover ambiguidades entre `auto`, host fallback e telas com comportamento diferente.

### Desenho sugerido
- hook frontend apenas lê o ambiente resolvido pela edge/configuração central;
- telas administrativas não deveriam decidir ambiente por conta própria fora desse contrato;
- wizard recebe `resolvedEnvironment` e `allowEnvironmentOverride` como props explícitas.

## 9.4 Hardening do vínculo por API Key

### Recomendação
Sem mudar o produto agora, o desenho futuro deveria prever:
- logging estruturado do shape real de `/myAccount` e `/wallets` (sem expor segredo);
- classificação explícita de erro:
  - credencial inválida;
  - ambiente incompatível;
  - wallet ausente no payload;
  - contrato de resposta inesperado.

---

# 10. Lista objetiva de ajustes futuros

1. Remover o fluxo inline de `link_existing` de `/admin/empresa`.
2. Reutilizar exclusivamente `AsaasOnboardingWizard` para vínculo e criação em todas as telas.
3. Exibir ambiente operacional de forma explícita também na jornada de vínculo em `/admin/empresa`.
4. Padronizar a regra de ambiente entre Company e Events.
5. Revisar o parser de `walletId` com base no payload real retornado pelo Asaas no ambiente que falha.
6. Melhorar mensagens para separar:
   - chave inválida;
   - ambiente incorreto;
   - wallet ausente;
   - resposta inesperada do Asaas.
7. Revisar se `auto` ainda é necessário no wizard administrativo ou se aumenta ambiguidade.
8. Garantir que toda tela administrativa use a mesma fonte resolvida de ambiente antes de qualquer vínculo.
9. Considerar endpoint diagnóstico específico também para o vínculo, caso seja necessário auditar sem persistir.
10. Documentar oficialmente que o fluxo único de integração Asaas deve ser o wizard reutilizável.

---

# 11. Dúvidas abertas

1. O payload real do Asaas em `/myAccount` e `/wallets` no caso que falha contém `walletId` em outro caminho não tratado pelo parser atual?
2. A API Key usada no teste pertence com certeza ao mesmo ambiente que a tela está tentando atingir?
3. O seletor `auto` no wizard ainda é desejado em produção administrativa ou apenas aumenta risco operacional?
4. Há necessidade real de permitir sandbox fora do contexto developer/suporte?
5. O backend deveria distinguir explicitamente conta própria vs subconta antes de assumir a estratégia de resolução de wallet?
