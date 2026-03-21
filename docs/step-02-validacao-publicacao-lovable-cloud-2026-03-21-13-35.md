# Step 02 — Validação de publicação e consistência de ambiente no Lovable Cloud

## Objetivo
Validar a consistência entre o código atual e o ambiente efetivamente publicado/consumido pela aplicação no contexto do Lovable Cloud, confirmando se as funções críticas continuam acessíveis, se as funções novas já estão refletidas no runtime atual e se ainda existe bloqueio operacional para teste funcional.

## Contexto
O projeto roda em ambiente gerenciado e publicado consumido pela aplicação, com backend compatível com Supabase/edge functions, mas esta análise não assume fluxo manual de deploy como fonte de verdade. A verificação foi baseada no que o código local declara, no que o frontend realmente consome e no que o ambiente atualmente responde por HTTP com probes seguros e sem efeito colateral.

## Diagnóstico anterior considerado
Status anteriormente registrado no Step 01:

| Função | Existe no código | Status anterior |
|---|---|---|
| `check-asaas-integration` | sim | `missing_deploy` |
| `get-runtime-payment-environment` | sim | `missing_deploy` |
| `create-asaas-account` | sim | `auth_error` |
| `create-asaas-payment` | sim | `request_error` |
| `asaas-webhook` | sim | `auth_error` |
| `verify-payment-status` | sim | `request_error` |

## Estratégia de validação
1. Confirmar existência das funções no código local em `supabase/functions`.
2. Confirmar se o frontend continua referenciando as funções críticas.
3. Revisar o checklist automatizado existente para verificar se ele continua adequado ao contexto de ambiente publicado consumido pela aplicação.
4. Reexecutar o checklist com probes seguros (`OPTIONS` e `POST` vazio) contra a URL publicada configurada no `.env`.
5. Comparar o status atual com o diagnóstico anterior para identificar consistência, regressão ou desbloqueio.

## Funções críticas analisadas
Foco principal:
- `check-asaas-integration`
- `get-runtime-payment-environment`

Revalidação comparativa:
- `create-asaas-account`
- `create-asaas-payment`
- `asaas-webhook`
- `verify-payment-status`

## O que foi validado
- Existência das seis funções-alvo no código local.
- Persistência das referências do frontend para `check-asaas-integration`, `get-runtime-payment-environment`, `create-asaas-account`, `create-asaas-payment` e `verify-payment-status`.
- Adequação do checklist automatizado para uso como verificador de ambiente publicado, sem depender de listagem administrativa via CLI.
- Resposta HTTP atual do ambiente para cada função crítica, classificando o resultado em `missing_deploy`, `auth_error`, `request_error` ou `ok`.
- Consistência entre diagnóstico anterior e situação atual.

## Como a validação foi feita
- Leitura do código-fonte das edge functions e dos pontos de invocação no frontend.
- Pequeno ajuste textual no checklist automatizado para deixar explícito que ele valida o ambiente publicado consumido pela aplicação, incluindo cenários gerenciados pelo Lovable Cloud, sem alterar a lógica dos probes.
- Reexecução do checklist automatizado com geração de relatório dedicado desta etapa em `docs/step-02-validacao-publicacao-lovable-cloud-2026-03-21-13-25.md`.
- Consolidação manual dos resultados neste documento.

## Resultado por função
| Função | Existe no código | Status anterior | Status atual | Resultado | Observação |
|---|---|---|---|---|---|
| `check-asaas-integration` | sim | `missing_deploy` | `missing_deploy` | `OPTIONS` retornou `404 NOT_FOUND` | Continua ausente no ambiente publicado atual; o botão “Verificar integração” permanece bloqueado por publicação. |
| `get-runtime-payment-environment` | sim | `missing_deploy` | `missing_deploy` | `OPTIONS` retornou `404 NOT_FOUND` | Continua ausente no ambiente publicado atual; o frontend segue dependente de fallback por hostname quando não houver env explícito de build. |
| `create-asaas-account` | sim | `auth_error` | `auth_error` | `POST {}` retornou `401 Unauthorized` | Continua acessível e protegida por autenticação/autorização, sem evidência de regressão. |
| `create-asaas-payment` | sim | `request_error` | `request_error` | `POST {}` retornou `400 sale_id is required` | Continua publicada e respondendo conforme contrato mínimo esperado. |
| `asaas-webhook` | sim | `auth_error` | `auth_error` | `POST {}` retornou `401 Invalid token` | Continua publicada e protegida por token de webhook, sem evidência de regressão. |
| `verify-payment-status` | sim | `request_error` | `request_error` | `POST {}` retornou `400 sale_id is required` | Continua publicada e respondendo conforme contrato mínimo esperado. |

## Inconsistências encontradas
1. As duas funções novas e diretamente relevantes para UX/diagnóstico (`check-asaas-integration` e `get-runtime-payment-environment`) continuam presentes no código, continuam referenciadas pelo frontend e **continuam ausentes** no ambiente publicado atual.
2. O ambiente atual **não está totalmente coerente** com o código local porque a camada de frontend já depende de endpoints que ainda não respondem no runtime publicado.
3. O botão “Verificar integração” **não está desbloqueado do ponto de vista de publicação/ambiente**, porque a função dedicada de health-check ainda retorna `Requested function was not found` no ambiente atual.
4. O hook `useRuntimePaymentEnvironment` segue preparado para usar a edge function como fonte preferencial, mas na prática continuará caindo no fallback local enquanto `get-runtime-payment-environment` permanecer ausente no ambiente.

## Ajustes aplicados (se houver)
### Ajuste mínimo aplicado
Foi realizado apenas um ajuste textual/documental no checklist automatizado `scripts/check-edge-function-deploy.mjs` para explicitar que a checagem valida o ambiente publicado consumido pela aplicação, inclusive em cenários gerenciados pelo Lovable Cloud.

### O que o ajuste resolve
- Reduz a ambiguidade operacional da documentação do checklist.
- Evita interpretar o script como dependente de um fluxo manual de deploy via Supabase CLI.
- Mantém exatamente a mesma estratégia técnica de validação segura por HTTP.

### O que o ajuste não resolve
- Não publica funções.
- Não altera comportamento do ambiente remoto.
- Não desbloqueia o botão “Verificar integração”.
- Não substitui um teste funcional real após a publicação correta das funções ausentes.

## Arquivos analisados
- `scripts/check-edge-function-deploy.mjs`
- `supabase/functions/check-asaas-integration/index.ts`
- `supabase/functions/get-runtime-payment-environment/index.ts`
- `supabase/functions/create-asaas-account/index.ts`
- `supabase/functions/create-asaas-payment/index.ts`
- `supabase/functions/asaas-webhook/index.ts`
- `supabase/functions/verify-payment-status/index.ts`
- `src/pages/admin/Company.tsx`
- `src/components/admin/AsaasOnboardingWizard.tsx`
- `src/hooks/use-runtime-payment-environment.ts`
- `src/pages/public/Checkout.tsx`
- `src/pages/public/TicketLookup.tsx`
- `src/pages/public/Confirmation.tsx`
- `docs/step-01-diagnostico-edge-functions-2026-03-21-12-45.md`
- `docs/step-02-validacao-publicacao-lovable-cloud-2026-03-21-13-25.md`

## Arquivos alterados
- `scripts/check-edge-function-deploy.mjs`
- `docs/step-02-validacao-publicacao-lovable-cloud-2026-03-21-13-25.md`
- `docs/step-02-validacao-publicacao-lovable-cloud-2026-03-21-13-35.md`

## Riscos
- Enquanto `check-asaas-integration` não estiver acessível no ambiente publicado, a validação manual de integração continuará falhando independentemente do código local estar correto.
- Enquanto `get-runtime-payment-environment` não estiver acessível, o frontend continuará dependente de heurística/fallback para determinar ambiente em parte dos cenários.
- As funções classificadas como `auth_error` ou `request_error` estão publicadas, mas isso não garante que secrets, integrações externas e fluxos completos estejam saudáveis.
- Um novo teste funcional real antes de corrigir a ausência de publicação das duas funções novas tende a produzir ruído operacional e falsos negativos.

## Pendências
- Refletir/publicar `check-asaas-integration` no ambiente atual consumido pela aplicação.
- Refletir/publicar `get-runtime-payment-environment` no ambiente atual consumido pela aplicação.
- Reexecutar a checagem após a atualização do ambiente publicado.
- Somente depois disso, rodar teste funcional real do botão “Verificar integração” e do fluxo dependente do ambiente operacional.

## Próximos passos
1. Atualizar o ambiente publicado para incluir `check-asaas-integration` e `get-runtime-payment-environment`.
2. Reexecutar o checklist automatizado e confirmar mudança de status das duas funções ausentes.
3. Se ambas responderem, seguir para teste funcional real do botão “Verificar integração”.
4. Se continuarem ausentes após nova publicação, abrir Step 03 focado em rastreabilidade do pipeline/runtime do ambiente publicado no Lovable Cloud.

## Recomendação final
No estado atual, o próximo passo **não** é teste funcional real da verificação de integração. Ainda existe **bloqueio de ambiente/publicação**. O ambiente publicado atual **não está coerente** com o código local porque as duas funções novas continuam ausentes. O passo correto é primeiro corrigir/refletir a publicação dessas funções no runtime atual e só depois avançar para teste funcional.

## Checklist final
- [x] arquivo Markdown criado com step + timestamp
- [x] funções críticas comparadas entre código e ambiente
- [x] checklist automatizado reexecutado
- [x] inconsistências atuais documentadas
- [x] não houve refatoração desnecessária
- [x] qualquer ajuste feito foi mínimo e justificado
- [x] ficou claro se o próximo passo é teste funcional ou nova correção
