# 1. Resumo executivo

O card **“Diagnóstico Asaas (developer)”** está hoje com problema real de confiabilidade visual e semântica por combinar, no mesmo painel, dados de três naturezas diferentes (snapshot local persistido, consulta remota em tempo real e estado transitório da última execução) sem hierarquia explícita de fonte de verdade. Além da ambiguidade, há **duplicidade literal no JSX**: blocos de “Conta Asaas”, “Comparativo de readiness” e “Conclusão operacional” são renderizados duas vezes. Isso explica os sintomas de repetição visual e sensação de inconsistência.

Em paralelo, a função de verificação (`check-asaas-integration`) tem boa cobertura de cenários e retorna payload estruturado, mas o frontend aplica fallback silencioso em alguns campos (`—`, `0`, “Pendente”) que podem ocultar a diferença entre **ausência de consulta**, **erro de consulta** e **dado realmente vazio**.

---

# 2. Escopo investigado

## Arquivos frontend (rota e card)
- `src/pages/admin/Company.tsx`
- `src/components/admin/AsaasDiagnosticPanel.tsx`
- `src/hooks/use-runtime-payment-environment.ts`
- `src/lib/asaasIntegrationStatus.ts`

## Edge functions e utilitários backend relacionados
- `supabase/functions/check-asaas-integration/index.ts`
- `supabase/functions/create-asaas-account/index.ts` (somente fluxo `mode=ensure_webhook` e persistência de Pix readiness em outros modos)
- `supabase/functions/get-runtime-payment-environment/index.ts`
- `supabase/functions/_shared/runtime-env.ts`

## Fluxos analisados
- Carregamento da tela `/admin/empresa` > aba Pagamentos
- Cálculo de ambiente operacional
- Cálculo de status local da integração (snapshot)
- Execução manual de diagnóstico Pix no card developer
- Execução manual de reparo de webhook
- Montagem de estado final exibido no card

---

# 3. Mapa do fluxo atual

## 3.1 Carregamento da tela
1. `CompanyPage` resolve ambiente em runtime via `useRuntimePaymentEnvironment`.
2. Em paralelo, carrega empresa com `select('*')` em `companies` (incluindo colunas Asaas por ambiente e campos de Pix persistido).
3. Com `company + runtimeEnvironment`, calcula `asaasSnapshot` por `getAsaasIntegrationSnapshot` e deriva `asaasStatus`.
4. Se usuário é developer, renderiza `AsaasDiagnosticPanel` com:
   - `asaasSnapshot` (estado local consolidado)
   - `lastAsaasCheck` (última verificação manual bem-sucedida em memória)
   - `persistedPixReady/persistedPixLastError` (colunas persistidas na empresa)

## 3.2 Execução de “Verificar Pix agora” (card developer)
1. `handleTestConnection` valida `editingId` e `runtimeEnvironment`.
2. Inicializa steps locais em `result` (estado transitório).
3. Invoca edge function `check-asaas-integration` com `company_id` + `target_environment`.
4. Se sucesso, salva payload completo em `result.checkResponse` e `result.rawResponse`.
5. UI passa a priorizar `result.checkResponse`, caindo para `lastAsaasCheck` se `result` inexistente.

## 3.3 Execução de “Reconfigurar webhook”
1. `handleRepairWebhook` invoca `create-asaas-account` com `mode=ensure_webhook`.
2. Retorno alimenta apenas `result.rawResponse`/steps (não atualiza `lastAsaasCheck`).
3. Não há nova consulta automática de diagnóstico após reparar webhook.

## 3.4 Consolidação da mensagem final no card
`finalMessage` é gerado por `getPixOperationalMessage(...)` no frontend com base em:
- sinal de erro de consulta (`hasQueryError`)
- disponibilidade de diagnóstico de gateway (`hasGatewayPixDiagnosis`)
- gateway pix ready
- conta aprovada (onboarding + status)
- divergência local x gateway
- pendência cadastral local

Essa mensagem é exibida (atualmente duplicada no JSX).

---

# 4. Origem de cada bloco do card

| Item exibido | Origem | Camada responsável | Local/Remoto | Persistido/Transitório | Dependências | Fallback atual |
|---|---|---|---|---|---|---|
| Ambiente | `runtimeEnvironment` | hook frontend `useRuntimePaymentEnvironment` | local (decisão app/edge) | transitório | build env, edge `get-runtime-payment-environment`, hostname fallback | `N/A`/`—` |
| Status integração | `asaasStatus` | `getAsaasIntegrationSnapshot` | local | transitório (derivado) | `company` + ambiente | `not_configured` |
| company_id | `editingId` | `CompanyPage` | local | transitório | empresa carregada | `—` |
| API key fingerprint | `details.api_key_fingerprint` | edge `check-asaas-integration` | remoto derivado + cálculo backend | transitório no card | consulta `myAccount` bem-sucedida | `—` |
| account id (gateway) | `details.gateway_account_id` ou `asaasSnapshot.current.accountId` | edge + snapshot local | misto | remoto transitório + local persistido | diagnóstico executado / company carregada | `—` |
| wallet id (gateway) | `details.gateway_wallet_id` ou `asaasSnapshot.current.walletId` | edge + snapshot local | misto | remoto transitório + local persistido | idem | `—` |
| total de chaves Pix | `details.pix_total_keys` | edge | remoto | transitório | chamadas `/pix/addressKeys` | `0` |
| chaves ACTIVE | `details.pix_active_keys` | edge | remoto | transitório | chamada `/pix/addressKeys?status=ACTIVE` | `0` |
| tipos/status de chave | `details.pix_key_types/statuses` | edge | remoto | transitório | parser lista Pix | `—` |
| última checagem | `details.checked_at` ou `pix_last_checked_at` | edge (consulta atual) e/ou banco (última persistida) | misto | transitório + persistido | sucesso parcial/total da consulta | `—` |
| último erro | `details.pix_last_error` ou `persistedPixLastError` | edge + banco | misto | transitório + persistido | diagnóstico ou histórico local | `—` |
| status/substatus da conta | `details.account_status/account_substatus` | edge | remoto | transitório | `/myAccount/status` | `—` |
| readiness local persistido | `details.local_pix_ready ?? persistedPixReady` | edge + company | local | persistido | colunas `asaas_pix_ready_*` | `false` |
| readiness gateway | `details.gateway_pix_ready` | edge | remoto | transitório | diagnóstico atual | “Não consolidado” em um bloco, “Pendente” em bloco duplicado |
| divergência detectada | `details.pix_readiness_divergent ?? false` | edge + comparação backend | remoto derivado | transitório | comparação local vs gateway no backend | `false` |
| conclusão operacional | `finalMessage` | frontend | derivada | transitório | combinação de flags locais/remotas | mensagens genéricas (incompleto/pendente) |
| resposta bruta JSON | `result.rawResponse` | frontend | depende da ação | transitório | clique no botão | não exibe sem `result` |
| botões de ação | handlers locais | frontend | local | transitório | `editingId` + `runtimeEnvironment` | desabilitados |

---

# 5. Consultas realizadas atualmente

## 5.1 Consultas automáticas ao abrir a página
1. `companies.select('*')` em `fetchCompany`.
2. `socios_split.select(...)` para card de split (indireto para contexto de pagamentos).
3. `get-runtime-payment-environment` (se `VITE_PAYMENT_ENVIRONMENT` não definido).

## 5.2 Consultas sob clique no card developer

### A) `check-asaas-integration` (botão “Verificar Pix agora”)
Ordem interna da edge function:
1. Validação de entrada e autorização admin + vínculo de empresa.
2. Leitura de colunas da `companies` **somente do ambiente solicitado**.
3. Pré-validação de credenciais locais mínimas (`api_key`, `wallet_id`).
4. `GET {asaasBaseUrl}/myAccount` (header `access_token`).
5. Se ok e IDs consistentes:
   - `GET /myAccount/status/`
   - `GET /wallets/`
   - `GET /pix/addressKeys?status=ACTIVE`
   - `GET /pix/addressKeys`
6. Consolida resposta estruturada (`status`, `integration_status`, `details`, `message`).

### B) `create-asaas-account` com `mode=ensure_webhook` (botão “Reconfigurar webhook”)
Ordem interna relevante:
1. Validação de empresa/ambiente/permissão.
2. Busca API key local da empresa para ambiente.
3. `GET /webhooks`.
4. Se webhook existe e divergente: `PUT /webhooks/{id}`; se não existe: `POST /webhooks`.
5. Persiste tentativa em log técnico (`sale_integration_logs`).

## 5.3 Endpoints Asaas efetivamente usados neste fluxo do card
- `/myAccount`
- `/myAccount/status/`
- `/wallets/`
- `/pix/addressKeys?status=ACTIVE`
- `/pix/addressKeys`
- `/webhooks`
- `/webhooks/{id}`

## 5.4 Campos lidos e campos ignorados

### Lidos explicitamente
- `/myAccount`: `id`, `walletId` (ou `wallet.id`)
- `/myAccount/status/`: `status`, substatus (`commercial`, `bank`, `documentation`, `general`) com aliases
- `/wallets/`: `id`/`walletId`
- `/pix/addressKeys*`: `status`, `type`

### Ignorados (não usados na decisão do card)
- Demais campos de payload não mapeados nos parsers (`normalizeAsaasList`, `resolveAccountSubstatus`).
- Detalhes completos de webhook retornados pelo Asaas (no frontend mostra resumo da ação, bruto só em `rawResponse`).

---

# 6. Achados principais

## 6.1 Bug de renderização confirmado (alta confiança)
Há duplicação literal no JSX do card:
- bloco “Conta Asaas” repetido;
- bloco “Comparativo de readiness” repetido;
- bloco “Conclusão operacional” repetido.

Isso não é efeito de estado/rerender: é duplicação estrutural do componente.

## 6.2 Ambiguidade de fonte de verdade (alta confiança)
O card mistura simultaneamente:
1. snapshot local (`asaasSnapshot`),
2. persistência local de Pix (`persistedPix*`),
3. diagnóstico remoto atual (`details`),
4. fallback do último diagnóstico em memória (`lastAsaasCheck`).

A UI não rotula claramente cada valor com a origem, produzindo leitura potencialmente enganosa.

## 6.3 Fallback silencioso que mascara estado (média-alta confiança)
Exemplos:
- totais Pix exibem `0` mesmo sem diagnóstico remoto executado;
- campos críticos exibem `—` sem diferenciar “não consultado” de “consulta falhou”;
- no bloco duplicado de readiness, `gatewayPixReady ? 'Pronto' : 'Pendente'` transforma `undefined` em “Pendente”, diferente do bloco anterior que mostra “Não consolidado”.

## 6.4 Consolidação operacional parcialmente redundante (média confiança)
O backend já retorna `message` e `details.pix_ready`, mas frontend recalcula `finalMessage` com lógica própria. Isso é útil para composição local, mas amplia risco de divergência semântica entre backend e frontend.

## 6.5 Sequência de chamadas está consistente, sem evidência forte de race condition crítica
- `lastAsaasCheck` é limpo quando troca empresa/ambiente.
- handlers são acionados por clique, com `loading` local.
- não foi encontrado `useEffect` duplicado no card que dispare requisição concorrente automática.

Há possibilidade de sobrescrita do `result` se usuário clicar rapidamente em ações diferentes, mas isso é comportamento esperado de estado único de execução e não bug estrutural principal.

## 6.6 Isolamento de ambiente está bem protegido (alta confiança)
- frontend resolve ambiente por build > edge > fallback.
- requisição envia `target_environment` explícito.
- backend usa apenas colunas do ambiente solicitado e não mistura sandbox/produção na validação.

## 6.7 Endpoint/parser do diagnóstico principal não aparenta incorreto
O parser do backend cobre formatos array/data para listas e aliases para substatus. Não há evidência de endpoint errado no fluxo auditado do card developer.

---

# 7. Evidências técnicas

## 7.1 Duplicação visual literal no card
- Dois blocos “Conta Asaas” consecutivos.
- Dois blocos “Comparativo de readiness” consecutivos.
- Duas caixas “Conclusão operacional” consecutivas.

## 7.2 Mistura local/remoto no mesmo campo
- Account/Wallet exibem `details.gateway_*` com fallback para `asaasSnapshot.current.*`.
- `localPixReady` usa `details.local_pix_ready ?? persistedPixReady`.
- `currentCheck` prioriza `result.checkResponse` e fallback para `lastAsaasCheck`.

## 7.3 Divergência semântica no readiness gateway
- Primeiro comparativo trata `undefined` como “Não consolidado”.
- Segundo comparativo trata `undefined` como “Pendente”.

## 7.4 Consolidação backend já estruturada
`check-asaas-integration` retorna:
- `status`, `integration_status`, `diagnostic_stage`, `message`;
- `details` com readiness local/gateway/divergência, fingerprint, ids gateway, status/substatus e tipagem de erro.

## 7.5 Persistência local de Pix readiness existe, mas não é atualizada por `check-asaas-integration`
- O endpoint de check é leitura/diagnóstico (não muta empresa).
- A persistência de `asaas_pix_ready_*` e `asaas_pix_last_error_*` ocorre em `create-asaas-account` via `syncCompanyPixReadiness` (fluxos revalidate/link/create).

Consequência: o card naturalmente compara “persistido anterior” vs “gateway agora”, podendo gerar divergência legítima — mas isso não está explicitado para usuário no nível de fonte/tempo.

---

# 8. Hipóteses descartadas

1. **“A duplicidade vem de render duplo do React StrictMode”** → descartada. Há duplicação literal no JSX.
2. **“O backend mistura produção e sandbox no check”** → descartada. O check seleciona colunas e base URL conforme `target_environment` explícito.
3. **“O card chama automaticamente múltiplas verificações concorrentes no load”** → descartada. A verificação principal é por clique.
4. **“Falha principal é endpoint Asaas errado”** → descartada no escopo atual; endpoints usados são coerentes com objetivo de diagnóstico.

---

# 9. Causa raiz provável

A causa raiz é **multicamadas**, com predominância frontend:

1. **Frontend (principal):** duplicação literal de blocos no componente `AsaasDiagnosticPanel`, causando percepção imediata de bug e baixa confiança.
2. **Frontend (secundário):** modelagem de exibição mistura fontes (persistido/local/remoto/transitório) sem contrato visual explícito de precedência e sem rótulo de origem.
3. **Contrato de diagnóstico (secundário):** coexistência de mensagem de conclusão no backend + recomputação no frontend sem estratégia clara de “mensagem oficial”.

Não há evidência, nesta investigação, de parser crítico quebrado ou endpoint incorreto como causa primária.

---

# 10. Riscos para o negócio e para operação

1. **Falsa segurança operacional:** mensagem de conclusão pode parecer afirmativa enquanto vários campos ficam `—`/`0` por falta de consulta consolidada.
2. **Falso negativo/positivo de readiness percebido:** fallback de `undefined` para “Pendente” em bloco duplicado pode induzir interpretação incorreta.
3. **Aumento de custo de suporte:** time técnico perde tempo distinguindo o que é dado persistido antigo vs diagnóstico atual.
4. **Risco de decisão errada em ambiente:** apesar de isolamento bom, ausência de rótulo temporal/fonte pode sugerir mistura sandbox/produção para operador.
5. **Confiança reduzida do card developer:** duplicidade visual compromete credibilidade mesmo quando backend responde corretamente.

---

# 11. Recomendação por etapas

## Etapa 1 — Correção funcional (prioridade máxima)
- Remover duplicações literais no JSX do card (Conta, readiness, conclusão).
- Unificar semântica de “gateway não consolidado” para não tratar `undefined` como “Pendente”.

## Etapa 2 — Consolidação de dados
- Definir e documentar no card a precedência de fonte por campo:
  1) check atual (`result.checkResponse`),
  2) último check em memória (`lastAsaasCheck`),
  3) persistido local (`company`).
- Rotular visualmente cada bloco/campo com fonte e timestamp.

## Etapa 3 — Reorganização UX (sem redesign amplo)
- Separar “Resumo operacional” de “Detalhes técnicos”.
- Manter JSON bruto recolhido (details/accordion), não no fluxo principal.
- Dar hierarquia explícita aos botões (ação principal de diagnóstico e ações auxiliares).

## Etapa 4 — Observabilidade
- Padronizar mensagens de fallback para distinguir: não consultado / erro de consulta / vazio real.
- Reduzir redundância textual na conclusão (evitar mensagem backend + frontend contraditórias).

---

# 12. Dúvidas que precisam de validação humana

1. A “conclusão operacional oficial” deve ser sempre a `message` do backend (`check-asaas-integration`) ou pode continuar sendo recomputada no frontend?
2. Após `ensure_webhook`, o produto espera disparar automaticamente novo check Pix para atualizar contexto do card, ou manter ação separada?
3. O card developer deve exibir apenas dados do check atual (sem fallback persistido) quando nunca houve execução manual nesta sessão?

---

# 13. Conclusão final

O problema principal do card **não está em um único ponto**: há um bug objetivo de renderização no frontend (duplicidade literal) e uma ambiguidade de consolidação/exibição de fontes (local persistido vs remoto em tempo real vs estado transitório). A integração de consulta (`check-asaas-integration`) está relativamente robusta e com endpoints coerentes; portanto, a intervenção inicial deve priorizar **limpeza funcional da UI + contrato explícito de fonte de dados** antes de qualquer redesign.

Em resumo:
- **Quebrado:** renderização duplicada e semântica inconsistente de fallback.
- **Ambíguo:** fonte de verdade por campo e precedência de conclusão.
- **Próximo passo recomendado:** correção funcional mínima no card, seguida de consolidação de contrato de dados e só então ajuste de UX.

---

## Respostas objetivas às 13 perguntas obrigatórias

1. **Quais chamadas compõem o diagnóstico completo?**
   - Front: `check-asaas-integration` (diagnóstico Pix) e `create-asaas-account` `mode=ensure_webhook` (reparo webhook), além de `get-runtime-payment-environment` no contexto da tela.
   - Backend check: `/myAccount`, `/myAccount/status/`, `/wallets/`, `/pix/addressKeys?status=ACTIVE`, `/pix/addressKeys`.

2. **Existe uma única fonte de verdade para o card?**
   - Não. O card combina snapshot local, persistência local, check remoto e estado transitório da execução.

3. **Quais campos são locais e quais vêm do gateway?**
   - Locais: `asaasSnapshot`, `persistedPixReady`, `persistedPixLastError`, `editingId`, ambiente resolvido.
   - Gateway: fingerprint, IDs gateway, status/substatus conta, contagem/tipos/status de chaves Pix, readiness gateway.

4. **A tela mistura persistido + consultado sem clareza?**
   - Sim.

5. **Existe duplicidade de renderização?**
   - Sim, literal no JSX.

6. **Existe duplicidade de lógica?**
   - Sim, parcial: conclusão operacional também é recomputada no frontend apesar de backend já retornar mensagem.

7. **Existe consulta incompleta?**
   - Não no núcleo do check; a consulta principal é ampla para o objetivo do card.

8. **Existe endpoint errado, parser errado ou mapeamento parcial?**
   - Endpoint errado: não evidenciado.
   - Parser errado: não evidenciado como causa raiz.
   - Mapeamento parcial: sim, por design (nem todo payload é usado), mas sem indício crítico.

9. **Existe fallback silencioso escondendo erro?**
   - Sim, em vários campos (`—`, `0`, “Pendente”) sem distinção de causa.

10. **A conclusão operacional atual é confiável?**
   - Parcialmente. A regra existe, mas a duplicidade visual e mistura de fontes reduzem confiança operacional percebida.

11. **O card está apto para developer ou transmite falsa segurança?**
   - Hoje transmite risco de falsa segurança/interpretação ambígua.

12. **Problema principal está onde?**
   - Predominantemente frontend (renderização + consolidação visual), com impacto de contrato entre frontend/backend.

13. **Recomendação final é?**
   - **Tudo isso em etapas:** corrigir renderização/funcional primeiro, consolidar dados, depois reorganizar UX e observabilidade.

---

## Checklist obrigatório

- [x] mapeei todos os componentes envolvidos
- [x] identifiquei todas as funções chamadas
- [x] identifiquei os endpoints do Asaas usados hoje
- [x] entendi a diferença entre dado local e dado remoto
- [x] validei a lógica de ambiente
- [x] investiguei duplicidade visual
- [x] investiguei duplicidade de lógica
- [x] investiguei fallback silencioso
- [x] investiguei inconsistência de readiness
- [x] registrei evidências concretas
- [x] não assumi hipóteses sem prova
- [x] não corrigi antes de entender
- [x] gerei o arquivo Markdown no padrão solicitado
