# Step 01 — Diagnóstico do ambiente atual de edge functions

## Objetivo
Identificar a divergência entre as edge functions existentes no código local, as rotas efetivamente acessíveis no ambiente Supabase configurado no projeto (`https://cdrcyjrvurrphnceromd.supabase.co`) e o uso real dessas funções pelo frontend e por integrações externas.

## Contexto
O projeto já teve histórico de divergência entre código local e ambiente publicado, incluindo `404 Requested function was not found` em funções críticas do Asaas. Nesta etapa, o foco foi validar apenas presença, contrato inicial e acessibilidade das funções críticas, sem disparar pagamentos, onboarding real ou webhooks válidos.

## Diagnóstico
### Escopo analisado
Funções mínimas solicitadas:
- `check-asaas-integration`
- `get-runtime-payment-environment`
- `create-asaas-account`
- `create-asaas-payment`
- `asaas-webhook`
- `verify-payment-status`

### Inventário local das edge functions
O diretório `supabase/functions` contém as seis funções críticas solicitadas, além de outras funções auxiliares e operacionais do projeto.

### Chamadas identificadas no frontend / fluxo operacional
- `check-asaas-integration`: chamada pela tela administrativa de empresa no botão de revalidação da integração Asaas.
- `get-runtime-payment-environment`: chamada pelo hook `useRuntimePaymentEnvironment`, que abastece o frontend com o ambiente operacional atual.
- `create-asaas-account`: chamada pela tela administrativa e pelo wizard de onboarding para vincular/desvincular conta Asaas.
- `create-asaas-payment`: chamada no checkout público para abrir a cobrança no Asaas.
- `verify-payment-status`: chamada em `TicketLookup` e `Confirmation` para reconciliação manual/automática do pagamento.
- `asaas-webhook`: não é chamada pelo frontend; é endpoint de integração externa acionado pelo Asaas.

### Validação real do ambiente
Foram executados probes seguros via `curl` usando apenas:
- `OPTIONS` para validar publicação da rota;
- `POST` com payload vazio para validar contrato mínimo sem acionar fluxo destrutivo.

Também foi tentada uma listagem remota com Supabase CLI, mas o ambiente local não possui `SUPABASE_ACCESS_TOKEN`, então não foi possível obter uma listagem administrativa oficial do projeto remoto. Por isso, o campo **Publicada** abaixo foi inferido por acessibilidade HTTP da rota, não por listagem via painel/CLI autenticado.

### Tabela por função
| Função | Existe no código | Publicada | Responde | Status | Observação |
|---|---|---|---|---|---|
| `check-asaas-integration` | sim | não | não | `missing_deploy` | `OPTIONS` retornou `404 NOT_FOUND`; o frontend já depende desta função na tela de empresa. |
| `get-runtime-payment-environment` | sim | não | não | `missing_deploy` | `OPTIONS` retornou `404 NOT_FOUND`; o frontend depende dela para resolver o ambiente operacional. |
| `create-asaas-account` | sim | sim | sim | `auth_error` | Rota acessível; `POST {}` retornou `401 Unauthorized`, consistente com necessidade de autenticação/autorização. |
| `create-asaas-payment` | sim | sim | sim | `request_error` | Rota acessível; `POST {}` retornou `400 sale_id is required`, confirmando contrato válido e função publicada. |
| `asaas-webhook` | sim | sim | sim | `auth_error` | Rota acessível; `POST {}` retornou `401 Invalid token`, consistente com proteção por token do webhook. |
| `verify-payment-status` | sim | sim | sim | `request_error` | Rota acessível; `POST {}` retornou `400 sale_id is required`, confirmando contrato válido e função publicada. |

### Leitura consolidada
1. Há evidência concreta de divergência de deploy: duas funções existentes no código e já consumidas pelo frontend (`check-asaas-integration` e `get-runtime-payment-environment`) **não estão publicadas** no ambiente validado.
2. As funções antigas/centrais do fluxo Asaas (`create-asaas-account`, `create-asaas-payment`, `asaas-webhook`, `verify-payment-status`) estão acessíveis no ambiente e responderam conforme o contrato mínimo esperado.
3. O arquivo `supabase/config.toml` possui configuração explícita para `create-asaas-account`, `create-asaas-payment`, `asaas-webhook` e `verify-payment-status`, mas não lista `check-asaas-integration` nem `get-runtime-payment-environment`. Isso não prova sozinho ausência de deploy, mas é um sinal compatível com o cenário encontrado de publicação incompleta.

## Causa raiz (ou hipótese)
### Causa mais provável confirmada
**Deploy parcial/incompleto das edge functions no ambiente Supabase validado.**

Evidência objetiva:
- As duas funções novas/de suporte ao frontend existem localmente e têm chamadas ativas no código, mas a rota remota responde `Requested function was not found`.
- As funções mais antigas/operacionais já respondem no mesmo projeto remoto.

### Hipótese complementar
O processo operacional de publicação pode estar focando apenas funções já registradas/configuradas historicamente, deixando de fora funções adicionadas depois (`check-asaas-integration` e `get-runtime-payment-environment`).

## Arquivos analisados
- `supabase/functions/check-asaas-integration/index.ts`
- `supabase/functions/get-runtime-payment-environment/index.ts`
- `supabase/functions/create-asaas-account/index.ts`
- `supabase/functions/create-asaas-payment/index.ts`
- `supabase/functions/asaas-webhook/index.ts`
- `supabase/functions/verify-payment-status/index.ts`
- `supabase/config.toml`
- `src/pages/admin/Company.tsx`
- `src/hooks/use-runtime-payment-environment.ts`
- `src/pages/public/Checkout.tsx`
- `src/pages/public/TicketLookup.tsx`
- `src/pages/public/Confirmation.tsx`
- `scripts/check-edge-function-deploy.mjs`

## Arquivos alterados
- `docs/step-01-diagnostico-edge-functions-2026-03-21-00-00.md`
- `docs/step-01-diagnostico-edge-functions-2026-03-21-12-45.md`

## O que foi feito
- Listei as edge functions existentes no código local.
- Cruzei as funções críticas com referências reais do frontend.
- Executei probes HTTP seguros no ambiente Supabase configurado no `.env`.
- Tentei validar listagem remota com Supabase CLI.
- Consolidei o diagnóstico por função, distinguindo ausência de deploy, erro de autenticação e erro de contrato/request.

## O que NÃO foi feito
- Não alterei fluxo de pagamento.
- Não publiquei edge functions.
- Não rodei onboarding real no Asaas.
- Não criei cobrança real.
- Não enviei webhook válido.
- Não alterei banco, tabelas, RLS ou arquitetura.

## Validações realizadas
- `OPTIONS /functions/v1/check-asaas-integration` → `404 NOT_FOUND`
- `OPTIONS /functions/v1/get-runtime-payment-environment` → `404 NOT_FOUND`
- `POST /functions/v1/create-asaas-account` com `{}` → `401 Unauthorized`
- `POST /functions/v1/create-asaas-payment` com `{}` → `400 sale_id is required`
- `POST /functions/v1/asaas-webhook` com `{}` → `401 Invalid token`
- `POST /functions/v1/verify-payment-status` com `{}` → `400 sale_id is required`
- Tentativa de `supabase functions list --project-ref cdrcyjrvurrphnceromd` → bloqueada por ausência de token administrativo.

## Riscos
- O frontend administrativo continuará exibindo falha no botão de verificação da integração enquanto `check-asaas-integration` não for publicada.
- O frontend continuará dependendo de fallback por hostname enquanto `get-runtime-payment-environment` não existir no ambiente, o que reduz previsibilidade operacional.
- `auth_error` e `request_error` confirmam presença/publicação, mas não garantem saúde total da lógica interna nem configuração completa dos secrets.
- O webhook acessível não garante que os secrets esperados estejam corretos para todos os ambientes; apenas que a rota existe e rejeita token inválido como esperado.

## Próximos passos
1. Publicar no Supabase as funções `check-asaas-integration` e `get-runtime-payment-environment` no projeto `cdrcyjrvurrphnceromd`.
2. Reexecutar o checklist após o deploy para confirmar a transição de `missing_deploy` para `ok` ou `request_error/auth_error`, conforme o contrato esperado.
3. Revisar o processo de deploy para garantir que novas edge functions não fiquem fora da rotina operacional.
4. Em um Step 02, automatizar a checagem pós-deploy para bloquear validação manual quando houver função crítica ausente.

## Checklist final
- [x] arquivo Markdown criado com timestamp
- [x] diagnóstico por função feito
- [x] não houve refatoração desnecessária
- [x] divergências de deploy identificadas
- [x] riscos documentados
