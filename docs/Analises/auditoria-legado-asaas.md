# Auditoria Completa — Legado Asaas

## 1. Objetivo
Esta auditoria mapeia todos os pontos do projeto que ainda leem, escrevem, espelham ou exibem os campos legados do Asaas em `companies`, com foco em responder se o sistema já pode operar exclusivamente pelos campos por ambiente sem quebrar checkout, onboarding, revalidação, diagnóstico, monetização, telas administrativas e histórico.

A abordagem foi conservadora:
- busca textual por todos os campos legados e por ambiente;
- leitura dos fluxos operacionais críticos (checkout, create payment, verify, webhook, onboarding, disconnect, admin);
- classificação de risco por ocorrência;
- aplicação apenas da menor correção segura para tirar o legado do papel de fonte de verdade.

## 2. Contexto
Hoje coexistem dois modelos para credenciais/configuração Asaas na tabela `companies`:

### Modelo legado
- `asaas_account_id`
- `asaas_wallet_id`
- `asaas_api_key`
- `asaas_onboarding_complete`
- `asaas_account_email`

### Modelo por ambiente
#### Produção
- `asaas_api_key_production`
- `asaas_wallet_id_production`
- `asaas_account_id_production`
- `asaas_account_email_production`
- `asaas_onboarding_complete_production`

#### Sandbox
- `asaas_api_key_sandbox`
- `asaas_wallet_id_sandbox`
- `asaas_account_id_sandbox`
- `asaas_account_email_sandbox`
- `asaas_onboarding_complete_sandbox`

O risco estrutural é real quando o legado participa de decisão: um checkout pode nascer em um ambiente e ler credencial de outro, o admin pode mostrar conta “conectada” por um dado residual, e diagnósticos podem investigar a conta errada.

## 3. Inventário dos campos

### 3.1 Campos legados em `companies`
- `asaas_account_id`
- `asaas_wallet_id`
- `asaas_api_key`
- `asaas_onboarding_complete`
- `asaas_account_email`

### 3.2 Campos por ambiente em `companies`
**Produção**
- `asaas_api_key_production`
- `asaas_wallet_id_production`
- `asaas_account_id_production`
- `asaas_account_email_production`
- `asaas_onboarding_complete_production`

**Sandbox**
- `asaas_api_key_sandbox`
- `asaas_wallet_id_sandbox`
- `asaas_account_id_sandbox`
- `asaas_account_email_sandbox`
- `asaas_onboarding_complete_sandbox`

### 3.3 Estruturas correlatas
- `partners` também possui legado (`asaas_wallet_id`) e campos por ambiente (`asaas_wallet_id_production`, `asaas_wallet_id_sandbox`).
- `sales.payment_environment` já existe e é o lastro operacional do ambiente da venda.

## 4. Mapeamento de uso no código

| Arquivo | Função/componente | Campo legado | Tipo de uso | Criticidade | Avaliação |
|---|---|---:|---|---|---|
| `src/lib/asaasIntegrationStatus.ts` | `readLegacyConfig`, `getAsaasIntegrationSnapshot` | todos | leitura diagnóstica/compatibilidade | média | **Aceitável com cuidado**: o status operacional usa o ambiente atual; legado aparece apenas para detectar inconsistência e explicar resíduos. |
| `src/lib/asaasIntegrationStatus.test.ts` | testes | todos | teste de compatibilidade | baixa | **Correto**: garante que resíduo legado não marque conexão válida. |
| `src/pages/admin/Company.tsx` | card de pagamentos | indireto via helper | leitura indireta | média | **Correto**: status e badge dependem do helper, que prioriza ambiente operacional. |
| `src/pages/admin/Events.tsx` | `checkAsaasConnection` | todos + ambiente | leitura | alta | **Correto porém redundante**: seleciona legado e ambiente, mas a decisão final usa o helper com ambiente atual. |
| `src/pages/admin/SalesDiagnostic.tsx` | modal de detalhe | `asaas_account_email`, `asaas_wallet_id`, `asaas_account_id` | leitura/exibição | média | **Inconsistente antes desta rodada**: exibia apenas o legado, mesmo quando a venda era sandbox/produção específica. Corrigido para priorizar o ambiente da venda e deixar legado só como espelho. |
| `supabase/functions/create-asaas-account/index.ts` | onboarding, link, revalidate, disconnect | todos | leitura + escrita + espelhamento | **alta** | **Arriscado antes desta rodada**: os campos legados eram atualizados diretamente junto com o ambiente, com risco de voltarem a parecer “fonte primária”. Corrigido para espelhar derivadamente a partir do ambiente. |
| `supabase/functions/_shared/payment-context-resolver.ts` | `readEnvironmentCompanyConfig` | nenhum legado | contrato operacional | **alta** | **Correto**: só lê campos por ambiente. |
| `supabase/functions/create-asaas-payment/index.ts` | criação de cobrança | nenhum legado | decisão operacional | **crítica** | **Correto**: exige `wallet + onboarding + apiKey` por ambiente, sem fallback legado. |
| `supabase/functions/verify-payment-status/index.ts` | verificação/manual sync | nenhum legado | decisão operacional | **crítica** | **Correto**: usa `sales.payment_environment` + API key do ambiente da venda. |
| `supabase/functions/asaas-webhook/index.ts` | webhook/finalização/split | nenhum legado em `companies` | decisão operacional | **crítica** | **Correto**: usa ambiente da venda e wallets por ambiente de parceiros. |
| `src/types/database.ts` | `Company` | todos | tipagem | baixa | **Histórico/compatibilidade**: necessário enquanto colunas existirem. |
| `src/integrations/supabase/types.ts` | schema tipado | todos | tipagem | baixa | **Histórico/compatibilidade**. |
| `supabase/migrations/20260309191937_...sql` | criação do legado | todos | histórico de schema | baixa | **Histórico**. |
| `supabase/migrations/20260625090000_...sql` | `asaas_account_email` legado | campo legado | histórico de schema | baixa | **Histórico**. |
| `supabase/migrations/20260815090000_...sql` | backfill produção a partir do legado | todos | migração transitória | média | **Correto no contexto da migração**, mas confirma que o legado foi origem inicial do modelo por ambiente. |

### 4.1 Ocorrências fora do escopo operacional principal
- `src/pages/admin/Partners.tsx` usa `partners.asaas_wallet_id` legado, não `companies`. Isso não bloqueia a remoção das colunas legadas de `companies`, mas mostra que ainda existe legado Asaas em outra entidade e merece trilha separada.
- Diversos documentos em `docs/` citam o legado; isso é histórico, não regra de negócio.

## 5. Contrato real atual do sistema
O contrato operacional real **já está centrado no ambiente**:

1. **Frontend** descobre o ambiente por `useRuntimePaymentEnvironment`.
2. **Checkout público** persiste `sales.payment_environment` no nascimento da venda.
3. **Create payment** resolve contexto via `resolvePaymentContext` e exige credenciais do ambiente correto.
4. **Verify payment status** consulta o Asaas com a API key do ambiente da venda.
5. **Webhook** processa a venda com base em `sales.payment_environment`; não recalcula ambiente pelo legado.
6. **Partners/split** usam wallet por ambiente.
7. **Status administrativo** em `/admin/empresa` e gate de `/admin/eventos` usam helper que prioriza ambiente atual.

### Regra real de “empresa conectada” hoje
Para o ambiente operacional corrente, a empresa só deve ser considerada conectada quando existir simultaneamente:
- `asaas_api_key_<environment>`
- `asaas_wallet_id_<environment>`
- `asaas_onboarding_complete_<environment> = true`

`account_id` e `account_email` ajudam em auditoria/exibição, mas não são o critério mínimo operacional do checkout.

## 6. Pontos de inconsistência encontrados

### 6.1 Diagnóstico administrativo usava o legado como vitrine principal
`src/pages/admin/SalesDiagnostic.tsx` carregava só `asaas_account_email`, `asaas_wallet_id` e `asaas_account_id`. Isso podia mostrar conta errada para uma venda sandbox/produção, especialmente em empresas com dois ambientes configurados.

### 6.2 Onboarding ainda gravava legado como se fosse escrita primária
`supabase/functions/create-asaas-account/index.ts` atualizava os campos legados diretamente nos fluxos de:
- `revalidate`
- `link_existing`
- `create`

Embora checkout/verify/webhook não dependessem disso, a escrita direta aumentava a chance de o legado voltar a ser interpretado como “verdade oficial” em telas ou scripts futuros.

### 6.3 O helper de status ainda observa o legado
`src/lib/asaasIntegrationStatus.ts` ainda lê o legado para explicar resíduos e inconsistências. Isso **não decide conexão operacional**, mas mantém o legado vivo no diagnóstico. Esse uso ainda é útil nesta fase para auditoria e para denunciar empresas cujo ambiente atual está vazio, porém o legado ficou preenchido.

## 7. Classificação dos usos

### Categoria A — Pode remover já
- Leituras legadas em `src/pages/admin/SalesDiagnostic.tsx` como fonte principal de exibição.
- Escritas diretas do legado em `create-asaas-account` como se fossem atualização primária.

### Categoria B — Precisa transição curta
- `src/pages/admin/Events.tsx` ainda seleciona os campos legados junto com os campos por ambiente, apesar de decidir pelo helper. É seguro simplificar depois, mas não era o ponto de maior risco nesta rodada.
- `src/lib/asaasIntegrationStatus.ts` ainda lê o legado para detectar inconsistência e transição. Dá para reduzir depois que a base estiver saneada.

### Categoria C — Crítico / exige cuidado
- `supabase/functions/create-asaas-payment/index.ts`
- `supabase/functions/verify-payment-status/index.ts`
- `supabase/functions/asaas-webhook/index.ts`
- `supabase/functions/_shared/payment-context-resolver.ts`
- `src/pages/public/Checkout.tsx`

Esses fluxos **já estão corretos** e não devem ser refatorados sem necessidade, porque são o núcleo de cobrança/finalização.

### Categoria D — Apenas histórico / compatibilidade
- `src/types/database.ts`
- `src/integrations/supabase/types.ts`
- migrations SQL legadas
- documentos em `docs/`

## 8. Estratégia recomendada
### Estratégia escolhida
**Estratégia 1 com espelhamento controlado:** parar de usar imediatamente os campos legados como fonte de decisão no código, mas mantê-los no banco temporariamente como compatibilidade/auditoria.

### Justificativa
- O miolo operacional já vive por ambiente.
- O maior risco restante estava em onboarding/admin diagnóstico, não em checkout/webhook.
- Remover colunas agora seria precipitado porque ainda há leituras residuais, tipagens e espelhamento.
- Transformar o legado em espelho derivado reduz ambiguidade sem exigir refatoração ampla.

### Resultado prático da estratégia
1. **Fonte de verdade** = campos por ambiente + `sales.payment_environment`.
2. **Legado** = espelho derivado e material de auditoria, sem poder decisório.
3. **Próxima etapa** = eliminar leituras residuais, validar dados reais e só depois remover colunas do banco.

## 9. Correções aplicadas

### 9.1 `create-asaas-account` passou a espelhar o legado de forma derivada
Foi criada a função `buildCompanyConfigWithEnvironmentUpdate`, que:
- recebe o estado atual da empresa;
- aplica somente a atualização do ambiente corrente;
- recalcula o espelho legado com `buildLegacyAsaasMirrorUpdate`.

Com isso, nos fluxos de `revalidate`, `link_existing`, `create` e `disconnect`, os campos legados não são mais montados manualmente como se fossem dados primários; eles passam a ser consequência do estado por ambiente.

### 9.2 `SalesDiagnostic` passou a mostrar a conta Asaas do ambiente da venda
O detalhe da venda agora:
- busca também os campos `*_production` e `*_sandbox`;
- escolhe a conta exibida com base em `detailSale.payment_environment`;
- mostra o legado apenas em um bloco separado de “espelho legado”, explicitamente não operacional.

## 10. O que ainda não foi removido
- Colunas legadas continuam existindo em `companies`.
- Tipos `Company` e `Database` ainda incluem os campos legados.
- `src/lib/asaasIntegrationStatus.ts` ainda lê o legado para diagnosticar inconsistência de transição.
- `src/pages/admin/Events.tsx` ainda seleciona os campos legados, embora a decisão use o helper por ambiente.
- Migrations históricas obviamente permanecem no repositório.

## 11. Condição para remoção definitiva das colunas
**Ainda não pode remover do banco.**

Pode remover depois de validar, no mínimo:
1. que nenhuma tela/admin restante lê as colunas legadas para exibição ou diagnóstico;
2. que nenhum script SQL/manual/RPC externo depende delas;
3. que existe backfill íntegro entre legado e ambiente em produção real;
4. que o helper `asaasIntegrationStatus` foi simplificado para não precisar mais do legado;
5. que houve rodada manual de teste em sandbox e produção controlada.

## 12. Checklist de validação
- [ ] `/admin/empresa` mostra conectado apenas quando o ambiente atual tem `api_key + wallet + onboarding`.
- [ ] `/admin/eventos` bloqueia publicação/criação quando o ambiente atual não está conectado.
- [ ] Checkout público cria venda com `payment_environment` explícito.
- [ ] `create-asaas-payment` falha sem API key do ambiente correto.
- [ ] `verify-payment-status` consulta o Asaas usando a API key do ambiente da venda.
- [ ] `disconnect` limpa somente o ambiente atual e recalcula o espelho legado.
- [ ] `SalesDiagnostic` mostra os dados Asaas corretos para uma venda sandbox.
- [ ] `SalesDiagnostic` mostra os dados Asaas corretos para uma venda production.
- [ ] Webhook continua finalizando vendas sem depender do legado.
- [ ] Não existe fallback do legado influenciando cobrança ou confirmação.

## 13. Riscos residuais
- Como o legado ainda existe em schema/tipos, futuros desenvolvedores podem reutilizá-lo sem perceber.
- O helper de status ainda lê o legado para diagnosticar inconsistência; isso é seguro hoje, mas prolonga a convivência.
- Não foi feita auditoria em integrações externas fora do repositório (BI, scripts ad hoc, automações manuais).
- `partners` ainda tem legado próprio e pode gerar confusão em auditorias globais do Asaas, embora não seja o foco de `companies`.

## 14. Próximo passo recomendado
1. Simplificar `src/pages/admin/Events.tsx` para consultar só o mínimo necessário ao helper/contrato atual.
2. Reduzir `src/lib/asaasIntegrationStatus.ts` para usar o legado apenas atrás de uma flag ou removê-lo depois da validação dos dados reais.
3. Executar uma query de auditoria no banco comparando legado vs `*_production`/`*_sandbox` por empresa.
4. Só então preparar migration de remoção das colunas legadas em `companies`.

## Respostas objetivas às 10 perguntas
1. **Quais fluxos ainda usam o legado?** Onboarding (`create-asaas-account`), diagnóstico admin (`SalesDiagnostic` antes da correção), helper de status (`asaasIntegrationStatus`), tipagens e migrations históricas.
2. **Quais usos são perigosos?** Escrita direta no onboarding e leitura principal no diagnóstico admin.
3. **O checkout já consegue viver 100% sem legado?** Sim.
4. **O onboarding já consegue viver 100% sem legado?** Operacionalmente sim, mas ainda mantinha espelho legado; nesta rodada ele deixou de tratar o legado como escrita primária.
5. **O status de integração já consegue viver 100% sem legado?** A decisão de conectado sim; o diagnóstico de inconsistência ainda observa o legado.
6. **O bloqueio de monetização já consegue viver 100% sem legado?** Sim, porque depende do status por ambiente/gate operacional.
7. **O disconnect/desvincular já consegue viver 100% sem legado?** Sim; o legado ficou como espelho recalculado.
8. **O webhook ou verificação de pagamento ainda dependem de algo legado?** Não.
9. **O legado ainda é fonte de verdade em algum ponto?** Após esta rodada, não deveria ser fonte de verdade operacional; permanece como espelho/diagnóstico/compatibilidade.
10. **Já é seguro remover os campos legados do banco ou ainda não?** Ainda não.

## Veredito final
**Opção B — Já é seguro parar de usar o legado no código, mas ainda não remover do banco.**

Justificativa: checkout, verify, webhook, monetização e status operacional já usam o modelo por ambiente; porém ainda existem leituras residuais, tipos e compatibilidade que precisam ser saneados e validados antes da remoção física das colunas.
