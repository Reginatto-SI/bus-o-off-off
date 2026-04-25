# Fase 4 — Remoção definitiva do legado Asaas

## 1. Objetivo

Remover fisicamente do schema de `public.companies` as colunas legadas do Asaas e alinhar o código ao contrato final do projeto, baseado exclusivamente nos campos por ambiente.

## 2. Contexto

As fases anteriores:

- limparam logicamente os valores do legado;
- removeram leituras residuais relevantes do runtime;
- auditaram o estado final antes da remoção física.

Com esta fase, o modelo oficial passa a ser apenas:

- `*_production`
- `*_sandbox`

## 3. Migration aplicada

Migration criada:

- `supabase/migrations/20260319100000_drop_legacy_asaas_columns_from_companies.sql`

Conteúdo:

```sql
ALTER TABLE public.companies
  DROP COLUMN IF EXISTS asaas_account_id,
  DROP COLUMN IF EXISTS asaas_wallet_id,
  DROP COLUMN IF EXISTS asaas_api_key,
  DROP COLUMN IF EXISTS asaas_onboarding_complete,
  DROP COLUMN IF EXISTS asaas_account_email;
```

## 4. Colunas removidas

- `asaas_account_id`
- `asaas_wallet_id`
- `asaas_api_key`
- `asaas_onboarding_complete`
- `asaas_account_email`

## 5. Ajustes no código e tipagens

### `supabase/functions/create-asaas-account/index.ts`

- removido o helper transitório que limpava as colunas legadas;
- o update do onboarding/revalidate/disconnect agora persiste apenas os campos por ambiente;
- comentário atualizado para deixar explícito que o schema final não possui mais legado em `companies`.

### `src/types/database.ts`

- removidos os campos legados da interface `Company`;
- comentário atualizado para indicar que o contrato oficial é exclusivamente por ambiente.

### `src/integrations/supabase/types.ts`

- removidos os campos legados da tabela `companies` em `Row`, `Insert` e `Update`;
- preservados apenas os campos por ambiente.

### `src/lib/asaasIntegrationStatus.test.ts`

- removido o cenário de compatibilidade transitória baseado nas colunas legadas;
- o teste inicial agora valida diretamente o comportamento do ambiente vazio no schema final.

## 6. Arquivos alterados

- `supabase/migrations/20260319100000_drop_legacy_asaas_columns_from_companies.sql`
- `supabase/functions/create-asaas-account/index.ts`
- `src/types/database.ts`
- `src/integrations/supabase/types.ts`
- `src/lib/asaasIntegrationStatus.test.ts`
- `docs/fase-4-remocao-definitiva-legado-asaas.md`

## 7. Riscos residuais

1. Migrations históricas e documentos antigos continuam citando o legado, o que é esperado e não afeta o runtime.
2. Se existir ambiente externo ainda com tipos gerados antigos, ele precisará ser sincronizado após aplicar a migration.
3. O legado Asaas em `partners` não foi alterado, porque não faz parte da remoção em `companies`.

## 8. Checklist pós-remoção

- [x] Migration destrutiva criada apenas para as colunas legadas de `companies`.
- [x] Tipagens de `Company` atualizadas para o schema final.
- [x] Tipagens Supabase de `companies` atualizadas para o schema final.
- [x] Compatibilidade transitória do onboarding removida.
- [x] Fluxos críticos preservados sem refatoração ampla.
- [x] Nenhuma tabela adicional foi alterada.

## 9. Conclusão final

O projeto passa a usar apenas configuração Asaas por ambiente em `companies`, sem colunas legadas no schema final.

**Legado removido definitivamente com sucesso**
