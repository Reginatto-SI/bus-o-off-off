# Configuração, ambientes e segurança

## Resolução real do ambiente atual

A decisão do caminho principal **não é Preview versus publicado** e não é feita pelo domínio. A fonte inicial é `companies.payment_environment`, adicionada com default `production`; ela pode valer `production` ou `sandbox`. O código não identifica Preview/editor do Lovable como contexto financeiro.

| Contexto real | Ambiente operacional |
|---|---|
| Checkout público | `payment_environment` da empresa proprietária do evento |
| Painel administrativo | `payment_environment` da empresa ativa |
| Venda com cobrança já vinculada e operações posteriores | `sales.payment_environment` congelado |
| Regra de produto para hosts conhecidos | principais atuais `smartbus.com.br` e `www.smartbus.com.br`; secundários/legados `smartbusbr.com.br` e `www.smartbusbr.com.br` — todos são contexto de Produção |
| Implementação residual em `get-runtime-payment-environment` | reconhece apenas `smartbusbr.com.br` e `www.smartbusbr.com.br` como `production`; qualquer outro host, inclusive desconhecido, cai em `sandbox` |

A implementação residual está incompleta em relação à regra de produto: `smartbus.com.br`, domínio principal atual, e `www.smartbus.com.br` ainda não estão em sua allowlist e cairiam em sandbox se consultassem esse endpoint. `smartbusbr.com.br` e `www.smartbusbr.com.br` são secundários/legados, mas continuam sendo Produção. Preview, editor, localhost e hosts desconhecidos não possuem tratamento nominal. Essa heurística não governa o caminho principal; gateways devem consumir a decisão central por empresa/venda, nunca copiar a lista de domínios.

### Precedência comprovada

1. Frontend (`useRuntimePaymentEnvironment`): ambiente explícito da empresa relevante → ambiente da empresa ativa → `null`. A constante `DEFAULT_PAYMENT_ENVIRONMENT = production` existe, mas não é usada como fallback pelo hook.
2. Backend compartilhado (`resolvePaymentContext`): `sale.payment_environment` válido → `company.payment_environment` válido → ambiente explícito válido do request → erro `payment_environment_unresolved`.
3. Criação da cobrança: o checkout persiste o ambiente da empresa na venda e o envia; antes da primeira cobrança, `create-asaas-payment` revalida com empresa/request e persiste a decisão efetiva. Com `asaas_payment_id`, o ambiente da venda fica travado e divergência do request retorna `payment_environment_mismatch`.
4. Verify e recuperação de link resolvem primeiro pela venda e selecionam credencial/base URL do mesmo ambiente. Webhook correlaciona por `externalReference`/venda, lê `sales.payment_environment` e valida somente o token daquele ambiente.

A configuração da empresa escolhe o ambiente de uma venda nova; ela não sobrescreve o ambiente de venda que já possui cobrança. Ausência/invalidez deve falhar explicitamente, sem completar com o ambiente oposto.

### Hipóteses de operação

| Hipótese | Resultado | Evidência resumida |
|---|---|---|
| A — Lovable Preview/desenvolvimento → Sandbox | **Não confirmada** | não há detecção de Preview/editor no hook principal; decide a empresa |
| B — aplicação publicada/domínio oficial → Produção | **Não confirmada como regra geral** | publicação/hostname não decide o caminho principal; depende da empresa |
| C — automático pelo contexto, sem escolha por venda | **Parcialmente confirmada** | venda usa a empresa, não um seletor no checkout; developer pode escolher ambiente alvo no wizard de onboarding |
| D — venda mantém o ambiente utilizado | **Confirmada para ambiente** | `sales.payment_environment` é persistido e, após cobrança vinculada, tem precedência |
| E — credencial acompanha o ambiente resolvido | **Confirmada** | resolvedor seleciona API/base URL/token e colunas específicas do ambiente |
| F — Sandbox e Produção têm credenciais/IDs independentes | **Confirmada** | API key, account ID, account email, wallet, onboarding e Pix usam campos separados; tokens e base URLs Asaas também são separados |

O gateway ainda não é persistido genericamente em `sales`; portanto, a parte “venda registra gateway e ambiente” está apenas parcialmente atendida hoje. Registrar `gateway` será requisito para multigateway, não fato da implementação Asaas atual.

## Padrão atual

`/admin/empresa` reúne configuração. A tela principal calcula status, Pix, verificação e desconexão somente para `payment_environment` da empresa ativa, sem completar pelo outro ambiente. O `AsaasOnboardingWizard` é uma exceção operacional: developer pode escolher explicitamente Sandbox ou Produção para criar/vincular configuração; gerente/operador é forçado a Produção. `AsaasDiagnosticPanel` usa o ambiente operacional recebido da página. Sandbox e produção têm campos e secrets distintos.

## Credenciais e secrets (somente nomes/classes)

- Infra: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Por empresa/ambiente: API key e metadados Asaas persistidos em campos `companies.asaas_*_sandbox|production`.
- Plataforma por ambiente: secrets distintos para API key, wallet e token de webhook; a base URL Asaas também muda por ambiente. A URL receptora da Edge Function não é a fonte da decisão.
- Runtime/build: não determina o ambiente do caminho principal atual; apenas a heurística residual por host observa headers da requisição.

Não revelar valores, copiar `.env`, logar headers ou devolver chaves ao cliente. Ao auditar, registrar apenas nome lógico, proprietário, ambiente, consumidor e mecanismo de rotação. Pesquisar `Deno.env.get`, `runtime-env.ts` e `payment-context-resolver.ts` porque parte dos nomes é construída dinamicamente.

## Checklist de configuração reutilizável

1. Identificar tenant autenticado e autorização do papel.
2. Selecionar provedor e ambiente de forma explícita.
3. Cadastrar credencial no backend/mecanismo seguro.
4. Obter e persistir IDs não secretos (conta/recebedor) por ambiente.
5. Validar a credencial contra endpoint oficial inofensivo.
6. Validar capacidades necessárias (métodos, recebedores/split, webhook).
7. Configurar e testar webhook/assinatura no ambiente correspondente.
8. Exibir status derivado do ambiente atual sem completar dados do outro ambiente.
9. Registrar quem/quando/ambiente alterou ou validou; sanitizar erros.
10. Bloquear venda quando pré-requisito obrigatório falhar; não fazer fallback para outra credencial.

Para split, não tratar a wallet do sócio global como pré-requisito bloqueante: consultar exclusivamente a wallet do ambiente da venda e aplicar o redirecionamento financeiro normativo quando ausente. Sandbox e produção não completam wallets entre si. O representante, por sua vez, pertence à empresa correspondente e sem vínculo comprovado e wallet no ambiente é tratado como ausente para a divisão.

## Multiempresa

- Toda configuração de gateway da empresa deve ter `company_id` ou vínculo inequívoco e RLS/checagem server-side. O sócio global é exceção financeira explícita: não pertence à empresa cliente e não deve ser filtrado por `company_id`.
- Edge Functions devem derivar/validar empresa pela venda e pelo usuário autorizado, nunca aceitar `company_id` do cliente como prova.
- Uma venda/cobrança deve usar apenas a credencial de sua empresa e ambiente congelados.
- Service role contorna RLS: cada query deve aplicar filtro explícito e validar correlação.
- Diagnóstico developer pode atravessar tenants apenas sob guard técnico; admin comum permanece no tenant.

## Modelo de ambiente para novo gateway

Existe uma única decisão SmartBus BR: empresa para nova venda e venda persistida para operações históricas. Adaptadores de gateway apenas traduzem essa decisão para endpoint/credencial do provedor. Proibir `if` por domínio, nova allowlist, inferência por API key ou URL do webhook. Documentar se o provedor usa hosts, chaves, contas, modos no mesmo endpoint ou nenhum sandbox e persistir a semântica real. Testar chave teste em produção, chave produção em teste, ID de outro ambiente e mudança de ambiente após criação; tudo deve falhar explicitamente, jamais cair no ambiente oposto.

## Riscos/lacunas atuais observados

- `get-runtime-payment-environment` e `resolveEnvironmentFromHost` mantêm uma allowlist residual incompleta: omitem os domínios principais atuais `smartbus.com.br` e `www.smartbus.com.br`, embora reconheçam os domínios secundários/legados. Impacto: um consumidor residual nesses hosts recebe `sandbox`; o checkout/hook principal não depende dessa heurística.
- `create-asaas-account` usa `target_environment` quando enviado, mas cai no host legado quando omitido. Os chamadores atuais enviam o alvo; preservar isso e não reutilizar o fallback.
- O wizard não altera `companies.payment_environment`: ele pode configurar o bloco oposto ao ambiente operacional da empresa. A tela principal continua exibindo/validando apenas o ambiente da empresa.
- Entre inserção da venda e primeira cobrança, uma alteração concorrente em `companies.payment_environment` pode fazer `create-asaas-payment` persistir a decisão atual da empresa; após `asaas_payment_id`, a venda passa a prevalecer. Risco estreito, mas real.
- Migrations históricas continham defaults/fallbacks sandbox; a migration final remove o default de `sales.payment_environment`. Revalidar schema aplicado, não copiar defaults históricos.

Recomendação futura, fora desta tarefa: em tarefa funcional própria, alinhar ou remover/neutralizar a heurística residual — incluindo os quatro hosts oficiais enquanto existir — e exigir ambiente explícito também no onboarding backend. Não corrigir durante uma integração sem tarefa própria.

## Testes obrigatórios para novos gateways

- Abrir Preview e aplicação publicada com a **mesma empresa** e confirmar o mesmo ambiente configurado; repetir com empresas production e sandbox.
- Criar venda em cada ambiente e conferir persistência; verificar que mudança posterior da empresa não muda consulta, verify, link, webhook, reconciliação ou diagnóstico da venda.
- Tentar credencial sandbox em production e production em sandbox; tentar IDs cruzados; exigir falha sem fallback.
- Consultar venda sandbox navegando em contexto production e vice-versa; a venda, não o contexto atual, deve governar.
- Exercitar webhook e verify nos dois ambientes, token correto/incorreto/ausente e venda sem ambiente.
- Remover a credencial do ambiente atual mantendo a oposta; exigir erro de configuração, nunca complementação.
- Confirmar que diagnóstico mostra ambiente da venda e que nenhum adapter consulta hostname para decidir.
