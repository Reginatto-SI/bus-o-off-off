# Step 03 — Diagnóstico do pipeline / publicação do Lovable Cloud

## Objetivo
Investigar por que as funções `check-asaas-integration` e `get-runtime-payment-environment`, que existem no repositório e já são consumidas pelo frontend, ainda não aparecem no runtime publicado consumido pela aplicação no contexto do Lovable Cloud.

## Contexto
As etapas anteriores já confirmaram que o sintoma não está mais na lógica local dessas funções. O cenário atual é assimétrico: funções antigas (`create-asaas-account`, `create-asaas-payment`, `asaas-webhook`, `verify-payment-status`) continuam acessíveis no ambiente, enquanto duas funções mais novas retornam `404 NOT_FOUND` no mesmo projeto publicado.

## Evidências anteriores consideradas
- O frontend administrativo já invoca `check-asaas-integration` no botão “Verificar integração”.
- O hook `useRuntimePaymentEnvironment` já tenta usar `get-runtime-payment-environment` como fonte preferencial.
- O checklist automatizado continua reproduzindo `missing_deploy` para as duas funções novas e respostas coerentes para as funções antigas.
- O projeto é explicitamente um projeto Lovable e o repositório orienta que a publicação do ambiente passe pelo fluxo `Share -> Publish` no Lovable.

## Hipóteses analisadas
### Hipótese 1 — Convenção/registro incompleto
As funções novas existem no código, mas não entraram em algum mecanismo de registro/configuração usado pelo ambiente publicado.

### Hipótese 2 — Estrutura/nome incompatível
As funções ausentes poderiam ter diferença estrutural suficiente para o runtime ignorá-las.

### Hipótese 3 — Pipeline/publicação parcial
O ambiente publicado pode estar refletindo apenas artefatos/functions já historicamente presentes, sem incorporar as duas funções adicionadas depois.

### Hipótese 4 — Ambiente publicado desatualizado
O runtime consumido pela aplicação pode estar preso a uma publicação anterior ao surgimento dessas funções.

### Hipótese 5 — Dependência de ação explícita no Lovable
Pode existir uma etapa operacional de publicação no Lovable Cloud que não foi executada após a criação das novas funções.

### Hipótese 6 — Problema de detecção do runtime
O runtime poderia não detectar automaticamente funções novas mesmo com diretório e entrypoint corretos.

## Estratégia de investigação
1. Comparar estrutura, entrypoint, imports e convenções das funções ausentes com funções antigas que respondem no ambiente.
2. Revisar `supabase/config.toml` e outros arquivos de projeto que possam sinalizar como funções são tratadas operacionalmente.
3. Verificar histórico do Git para entender quando as funções ausentes foram adicionadas em relação às últimas mudanças de configuração.
4. Reaproveitar o checklist automatizado apenas para confirmar que o sintoma permanece no ambiente atual.
5. Buscar no repositório sinais de pipeline automatizado de publicação versus dependência de ação manual no Lovable.

## Comparativo entre funções publicadas e ausentes
| Item | Função publicada | Função ausente | Diferença relevante? |
|---|---|---|---|
| Estrutura de pasta | `supabase/functions/create-asaas-payment/index.ts` | `supabase/functions/get-runtime-payment-environment/index.ts` | Não. Ambas usam `index.ts` no mesmo padrão. |
| Entry point | `serve(async (req) => { ... })` | `serve(async (req) => { ... })` | Não. Mesmo padrão de entrypoint. |
| CORS base | Presente | Presente | Não. Mesmo cabeçalho-base de CORS. |
| Imports compartilhados | Usa `_shared/*` ou helpers locais | Usa `_shared/runtime-env.ts` ou helpers locais | Não há incompatibilidade estrutural evidente. |
| Convenção de nome | Há funções publicadas com hífen, ex.: `create-asaas-payment`, `asaas-webhook` | `check-asaas-integration`, `get-runtime-payment-environment` | Não. O runtime já aceita nomes com hífen. |
| Presença em `supabase/config.toml` | Sim, nas funções antigas analisadas | Não, nas duas funções ausentes | **Sim.** É a diferença configuracional mais objetiva encontrada. |
| Antiguidade no Git | Funções antigas já existiam antes das últimas mudanças de configuração | Funções ausentes foram criadas depois da última alteração em `supabase/config.toml` | **Sim.** Forte sinal de publicação parcial/defasada. |
| Evidência no ambiente | Respostas `401`/`400` coerentes | `404 NOT_FOUND` | **Sim.** Confirma diferença de reflexão/publicação, não de sintaxe local. |

## Achados
### 1. As funções ausentes têm estrutura válida e compatível
`check-asaas-integration` e `get-runtime-payment-environment` usam o mesmo padrão técnico observado nas funções acessíveis: arquivo `index.ts`, `serve(async (req) => ...)`, cabeçalhos CORS compatíveis e imports válidos. Não encontrei diferença estrutural forte que explique o runtime ignorá-las por formato. 

### 2. A diferença configuracional mais objetiva está em `supabase/config.toml`
As funções antigas acessíveis no ambiente (`create-asaas-account`, `create-asaas-payment`, `asaas-webhook`, `verify-payment-status`) possuem entrada explícita em `supabase/config.toml`, enquanto `check-asaas-integration` e `get-runtime-payment-environment` não aparecem no arquivo.

### 3. O histórico do Git reforça a hipótese de publicação/configuração parcial
- `supabase/config.toml` teve sua última alteração em **2026-03-11 01:06:56 UTC**.
- `get-runtime-payment-environment` foi criada depois, em **2026-03-17 09:26:22 -0400**.
- `check-asaas-integration` foi criada ainda depois, em **2026-03-21 08:07:38 -0400**.

Ou seja: as duas funções ausentes nasceram **depois** da última atualização conhecida do arquivo de configuração que enumera explicitamente várias functions já refletidas no ambiente.

### 4. Não há pipeline automatizado de publicação visível dentro do repositório
Não há `.github/workflows` nem scripts locais de deploy/publicação do backend. O `README.md` do projeto orienta explicitamente que a publicação do projeto Lovable seja feita por `Share -> Publish`, o que indica dependência de uma ação operacional fora do código versionado para refletir mudanças no ambiente publicado.

### 5. O checklist confirma que o sintoma continua exatamente igual
A reexecução do checklist no Step 03 manteve o mesmo padrão: duas funções novas em `missing_deploy` e quatro funções antigas acessíveis. Isso reforça a hipótese de runtime publicado defasado/parcial, e não de falha intermitente.

## Arquivos analisados
- `README.md`
- `supabase/config.toml`
- `scripts/check-edge-function-deploy.mjs`
- `supabase/functions/check-asaas-integration/index.ts`
- `supabase/functions/get-runtime-payment-environment/index.ts`
- `supabase/functions/create-asaas-account/index.ts`
- `supabase/functions/create-asaas-payment/index.ts`
- `supabase/functions/asaas-webhook/index.ts`
- `supabase/functions/verify-payment-status/index.ts`
- `src/pages/admin/Company.tsx`
- `src/hooks/use-runtime-payment-environment.ts`
- `docs/step-02-validacao-publicacao-lovable-cloud-2026-03-21-13-35.md`
- `docs/step-03-diagnostico-pipeline-publicacao-lovable-cloud-2026-03-21-14-10-raw.md`
- `step-1-auditoria-cleanup-lovable.md`

## Arquivos alterados
- `docs/step-03-diagnostico-pipeline-publicacao-lovable-cloud-2026-03-21-14-10-raw.md`
- `docs/step-03-diagnostico-pipeline-publicacao-lovable-cloud-2026-03-21-14-15.md`

## O que foi descartado
### Hipótese 2 — Estrutura/nome incompatível
Descartada como causa principal. As funções ausentes seguem o mesmo padrão de pasta/entrypoint/imports das funções já acessíveis, e o ambiente já prova aceitar nomes com hífen em outras functions publicadas.

### Hipótese 6 — Problema de detecção por formato do runtime
Descartada como causa principal com a evidência disponível. Não há marcador de sintaxe, export, naming ou organização local que diferencie tecnicamente as duas funções ausentes a ponto de justificar detecção seletiva do runtime.

### Hipótese de bug local da lógica de negócio
Descartada. O ambiente responde `404 NOT_FOUND` antes de qualquer lógica da função rodar, então o problema não está no corpo da regra de negócio.

## Causa mais provável
A causa mais provável é uma combinação de **publicação parcial/desatualizada do ambiente Lovable Cloud** com **registro/configuração não acompanhando a criação das novas funções**.

Em termos práticos, os sinais mais fortes são:
1. as duas funções ausentes foram criadas **após** a última alteração conhecida de `supabase/config.toml`;
2. as funções antigas que continuam acessíveis são justamente as que já aparecem listadas/configuradas nesse arquivo;
3. o repositório não mostra pipeline automatizado de publicação do backend, enquanto o `README` aponta para ação explícita em `Share -> Publish` no Lovable;
4. o sintoma no ambiente é `404 NOT_FOUND`, compatível com runtime publicado que ainda não refletiu essas funções.

## Riscos
- Se a equipe partir direto para teste funcional, continuará vendo falha no botão “Verificar integração”, mas sem atacar a causa real do bloqueio.
- Atualizar apenas frontend ou apenas documentação não resolve a divergência do runtime publicado.
- Alterar configuração sem validar o comportamento esperado de autenticação das funções novas pode introduzir regressão de segurança; por isso, nesta etapa, a decisão correta foi **não** alterar `supabase/config.toml` automaticamente.
- Sem acesso ao painel/logs do Lovable Cloud, a hipótese mais forte é muito consistente, mas ainda não equivale a prova operacional absoluta do mecanismo interno de publicação.

## Próximos passos recomendados
1. No Lovable, abrir o projeto correto e executar/verificar explicitamente o fluxo `Share -> Publish` após a criação das funções novas.
2. No ambiente conectado ao Lovable, conferir se existe alguma área/listagem de Edge Functions onde `check-asaas-integration` e `get-runtime-payment-environment` ainda não aparecem.
3. Validar se o processo operacional do projeto exige refletir/registrar manualmente novas functions além do commit em repositório.
4. Só depois de confirmar/refletir a publicação, reexecutar o checklist para verificar se as duas funções mudam de `missing_deploy` para `auth_error`, `request_error` ou `ok`.
5. Se mesmo após publicação explícita continuarem ausentes, o próximo step deve focar em configuração operacional específica do backend integrado ao Lovable Cloud.

## Checklist final
- [x] arquivo Markdown criado com step + timestamp
- [x] funções ausentes e publicadas comparadas
- [x] hipótese mais provável identificada
- [x] hipóteses descartadas documentadas
- [x] não houve refatoração desnecessária
- [x] qualquer ajuste foi mínimo e justificado
- [x] ficou claro qual é o próximo passo correto
