# Fase 2 — Saneamento do código do legado Asaas

## 1. Objetivo

Remover do código as leituras residuais dos campos legados Asaas em `companies`, mantendo as colunas no schema por compatibilidade temporária, mas sem papel decisório na operação.

## 2. Contexto

Após a Fase 1, o banco passou a limpar logicamente `asaas_account_id`, `asaas_wallet_id`, `asaas_api_key`, `asaas_onboarding_complete` e `asaas_account_email`.

Nesta fase, o foco foi impedir que telas, helpers e onboarding continuassem consultando ou exibindo esses campos como se ainda fossem parte do contrato operacional.

## 3. Leituras residuais encontradas

### `src/pages/admin/Events.tsx`

- fazia `select` dos campos legados e dos campos por ambiente para verificar conexão Asaas;
- o helper de status já não precisava do legado, então a consulta estava maior do que o necessário.

### `src/pages/admin/SalesDiagnostic.tsx`

- buscava `asaas_account_email`, `asaas_wallet_id` e `asaas_account_id` legados no detalhe da empresa;
- exibia um bloco de “espelho legado” no modal de detalhe da venda;
- mantinha tipagem local contendo o legado mesmo sem necessidade operacional.

### `supabase/functions/create-asaas-account/index.ts`

- ainda fazia `select` dos campos legados junto com os campos por ambiente, embora onboarding, revalidate e disconnect já operassem pelo ambiente resolvido.

### `src/lib/asaasIntegrationStatus.test.ts`

- permaneceu apenas um cenário de compatibilidade transitória para garantir, por teste, que um resíduo legado não altera mais o status operacional.

## 4. O que foi removido ou simplificado

- removidos os campos legados do `select` em `src/pages/admin/Events.tsx`;
- removidos os campos legados do `select`, da tipagem local e da exibição de detalhe em `src/pages/admin/SalesDiagnostic.tsx`;
- removidos os campos legados do `select` em `supabase/functions/create-asaas-account/index.ts`;
- adicionados comentários curtos explicando que a fonte de verdade operacional é exclusivamente o modelo por ambiente;
- mantido somente um teste de compatibilidade transitória para evitar regressão futura.

## 5. O que permaneceu e por quê

1. As colunas legadas permanecem no banco porque a remoção estrutural ainda não faz parte desta fase.
2. Tipagens geradas (`src/types/database.ts` e `src/integrations/supabase/types.ts`) continuam listando as colunas, pois refletem o schema atual.
3. O teste de compatibilidade em `src/lib/asaasIntegrationStatus.test.ts` continua mencionando legado de forma explícita, mas sem influência na aplicação em produção.

## 6. Arquivos alterados

- `src/pages/admin/Events.tsx`
- `src/pages/admin/SalesDiagnostic.tsx`
- `supabase/functions/create-asaas-account/index.ts`
- `src/lib/asaasIntegrationStatus.test.ts`
- `docs/fase-2-saneamento-codigo-legado-asaas.md`

## 7. Riscos residuais

1. Documentação histórica do repositório ainda menciona o legado em alguns relatórios antigos, o que pode gerar ruído de leitura, mas não afeta execução.
2. As tipagens do banco ainda exibem as colunas legadas até a futura remoção definitiva no schema.
3. O legado de `partners.asaas_wallet_id` é um assunto separado e não foi alterado nesta fase, porque o escopo aqui é `companies`.

## 8. Checklist de validação

- [x] Status de conexão administrativa não consulta mais campos legados em `companies`.
- [x] Diagnóstico administrativo não exibe nem usa legado como critério operacional.
- [x] Onboarding/revalidate/disconnect não leem mais campos legados de `companies`.
- [x] Fluxos críticos preservados sem refatoração: create payment, verify, webhook e payment-context-resolver.
- [x] Comentários adicionados nos pontos alterados.

## 9. Próximo passo recomendado

Executar a fase final de descontinuação estrutural: revisar dependências externas, atualizar tipos gerados após migration futura e então remover definitivamente as colunas legadas de `companies`.

## Veredito

**Código saneado para operar sem dependência do legado**
