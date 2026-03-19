# Fase 3 — Auditoria final para remoção do legado Asaas

## 1. Objetivo

Confirmar, de forma conservadora, se o sistema já deixou de depender operacionalmente dos campos legados Asaas em `public.companies` e se já existe base técnica suficiente para remover essas colunas do banco.

## 2. Contexto

As fases anteriores:

- limparam logicamente os valores legados em `companies`;
- moveram o contrato operacional para os campos por ambiente (`*_production` e `*_sandbox`);
- removeram leituras residuais relevantes das telas administrativas e do onboarding.

Esta fase não remove colunas. Ela só audita código, schema e os fluxos críticos antes de qualquer remoção física.

## 3. Ocorrências restantes do legado

### Ocorrências em `companies`

1. `supabase/functions/create-asaas-account/index.ts`
   - os campos legados ainda aparecem apenas no helper `buildLegacyAsaasCleanupUpdate`;
   - uso atual: escrever `NULL` / `FALSE` para manter o legado limpo durante onboarding, revalidate, link e disconnect.

2. `src/lib/asaasIntegrationStatus.test.ts`
   - o legado aparece apenas em um teste de compatibilidade transitória;
   - uso atual: garantir que eventual resíduo legado não altera o status operacional.

3. `src/types/database.ts`
   - os campos legados continuam presentes na tipagem de `Company`;
   - uso atual: reflexo do schema atual, não decisão operacional.

4. `src/integrations/supabase/types.ts`
   - os campos legados continuam presentes nas tipagens geradas do Supabase;
   - uso atual: reflexo do schema atual, não decisão operacional.

5. `supabase/migrations/*`
   - as migrations históricas de criação, migração e limpeza continuam referenciando o legado;
   - uso atual: histórico de schema / rollout.

6. `docs/*`
   - vários relatórios históricos continuam citando o legado;
   - uso atual: documentação histórica, sem efeito de runtime.

### Ocorrências fora de `companies`

1. `src/pages/admin/Partners.tsx`
   - ainda usa `partners.asaas_wallet_id`;
   - não bloqueia remoção das colunas legadas de `companies`, mas mostra que existe um legado Asaas separado em outra entidade.

2. mensagens como `missing_company_asaas_api_key`
   - aparecem em logs/erros de `create-asaas-payment` e `verify-payment-status`;
   - são códigos textuais de observabilidade, não leitura real do campo legado.

## 4. Classificação das ocorrências

| Local | Ocorrência | Classificação | Bloqueia remoção das colunas de `companies`? | Motivo |
|---|---|---|---|---|
| `supabase/functions/create-asaas-account/index.ts` | `buildLegacyAsaasCleanupUpdate` | compatibilidade temporária | **Não, mas exige ajuste coordenado** | hoje o código ainda tenta limpar as colunas legadas; se elas forem removidas, esse helper deve sair na mesma entrega da migration destrutiva |
| `src/lib/asaasIntegrationStatus.test.ts` | cenário com legado | residual não crítica | Não | cobertura de regressão, sem efeito em produção |
| `src/types/database.ts` | campos legados na interface `Company` | tipagem | **Sim, para a entrega de remoção física** | após derrubar colunas, as tipagens precisam ser regeneradas/ajustadas |
| `src/integrations/supabase/types.ts` | campos legados gerados | tipagem | **Sim, para a entrega de remoção física** | mesmo motivo das tipagens locais |
| `supabase/migrations/20260309191937_*.sql` | criação das colunas legadas | migration histórica | Não | não afeta runtime atual |
| `supabase/migrations/20260815090000_add_asaas_environment_configuration.sql` | cópia legado → produção | migration histórica | Não | histórico de rollout |
| `supabase/migrations/20260319090000_logical_cleanup_legacy_asaas_fields.sql` | limpeza lógica do legado | migration histórica | Não | histórico da Fase 1 |
| `docs/*` | relatórios e análises antigas | documentação | Não | sem efeito operacional |
| `src/pages/admin/Partners.tsx` | `partners.asaas_wallet_id` | residual não crítica fora do escopo | Não para `companies` | entidade diferente |
| códigos `missing_company_asaas_api_key` | strings de log/erro | residual não crítica | Não | não lê coluna legado |

## 5. Situação dos fluxos críticos

### `/admin/empresa`

- **Status:** ainda tem resíduo sem risco.
- A tela usa `getAsaasIntegrationSnapshot`, que hoje lê apenas campos por ambiente para decidir status operacional.
- Não foi encontrada leitura decisória do legado em `companies`, mas a tela ainda depende de tipagens que incluem colunas legadas porque o schema ainda não foi removido.

### `/admin/eventos`

- **Status:** já está 100% sem legado.
- A checagem de conexão Asaas faz `select` apenas de campos `*_production` e `*_sandbox`.

### Onboarding / revalidate / disconnect

- **Status:** ainda tem resíduo sem risco.
- As leituras já são 100% por ambiente.
- O único resíduo é a limpeza explícita do legado via `buildLegacyAsaasCleanupUpdate`, que existe justamente para manter as colunas antigas vazias enquanto ainda existem no schema.

### Checkout público

- **Status:** já está 100% sem legado.
- O checkout envia `payment_environment` explícito para `create-asaas-payment`, sem leitura dos campos legados.

### Create payment

- **Status:** já está 100% sem legado.
- `create-asaas-payment` seleciona apenas os campos por ambiente e persiste/consome `sales.payment_environment`.

### Verify payment status

- **Status:** já está 100% sem legado.
- `verify-payment-status` seleciona apenas `asaas_api_key_production` e `asaas_api_key_sandbox`, usando o contexto de pagamento por ambiente.

### Webhook

- **Status:** já está 100% sem legado.
- `asaas-webhook` resolve carteira de parceiro por ambiente e não usa os campos legados de `companies`.

### Diagnóstico administrativo

- **Status:** já está 100% sem legado.
- `SalesDiagnostic` foi saneado para buscar e exibir apenas os campos operacionais do ambiente da venda.

## 6. Query de auditoria SQL

> **Observação:** não houve acesso real ao banco nesta fase. A query abaixo deve ser executada manualmente no ambiente Supabase/Postgres antes da remoção física das colunas.

```sql
with company_audit as (
  select
    id,
    name,
    asaas_account_id,
    asaas_wallet_id,
    asaas_api_key,
    asaas_onboarding_complete,
    asaas_account_email,
    asaas_account_id_production,
    asaas_wallet_id_production,
    asaas_api_key_production,
    asaas_onboarding_complete_production,
    asaas_account_email_production,
    asaas_account_id_sandbox,
    asaas_wallet_id_sandbox,
    asaas_api_key_sandbox,
    asaas_onboarding_complete_sandbox,
    asaas_account_email_sandbox,
    (
      asaas_account_id is not null
      or asaas_wallet_id is not null
      or asaas_api_key is not null
      or asaas_account_email is not null
      or asaas_onboarding_complete is true
    ) as legacy_has_any,
    (
      asaas_account_id_production is not null
      or asaas_wallet_id_production is not null
      or asaas_api_key_production is not null
      or asaas_account_email_production is not null
      or asaas_onboarding_complete_production is true
    ) as production_has_any,
    (
      asaas_account_id_sandbox is not null
      or asaas_wallet_id_sandbox is not null
      or asaas_api_key_sandbox is not null
      or asaas_account_email_sandbox is not null
      or asaas_onboarding_complete_sandbox is true
    ) as sandbox_has_any
  from public.companies
)
select
  id,
  name,
  legacy_has_any,
  production_has_any,
  sandbox_has_any,
  case
    when not legacy_has_any and (production_has_any or sandbox_has_any)
      then 'pronta_para_remocao_do_legado'
    when legacy_has_any and not production_has_any and not sandbox_has_any
      then 'legado_preenchido_sem_ambiente'
    when legacy_has_any and (production_has_any or sandbox_has_any)
      then 'residuo_inconsistente'
    when not legacy_has_any and not production_has_any and not sandbox_has_any
      then 'sem_configuracao_asaas'
    else 'revisao_manual'
  end as audit_status
from company_audit
order by audit_status, name;
```

### Resumos úteis complementares

```sql
-- Quantidade por status de auditoria
with company_audit as (
  select
    (
      asaas_account_id is not null
      or asaas_wallet_id is not null
      or asaas_api_key is not null
      or asaas_account_email is not null
      or asaas_onboarding_complete is true
    ) as legacy_has_any,
    (
      asaas_account_id_production is not null
      or asaas_wallet_id_production is not null
      or asaas_api_key_production is not null
      or asaas_account_email_production is not null
      or asaas_onboarding_complete_production is true
    ) as production_has_any,
    (
      asaas_account_id_sandbox is not null
      or asaas_wallet_id_sandbox is not null
      or asaas_api_key_sandbox is not null
      or asaas_account_email_sandbox is not null
      or asaas_onboarding_complete_sandbox is true
    ) as sandbox_has_any
  from public.companies
)
select
  case
    when not legacy_has_any and (production_has_any or sandbox_has_any)
      then 'pronta_para_remocao_do_legado'
    when legacy_has_any and not production_has_any and not sandbox_has_any
      then 'legado_preenchido_sem_ambiente'
    when legacy_has_any and (production_has_any or sandbox_has_any)
      then 'residuo_inconsistente'
    when not legacy_has_any and not production_has_any and not sandbox_has_any
      then 'sem_configuracao_asaas'
    else 'revisao_manual'
  end as audit_status,
  count(*) as total
from company_audit
group by 1
order by 1;
```

## 7. Riscos residuais

1. **Sem auditoria real dos dados**, não há prova suficiente para afirmar que não existe nenhum resíduo legado no banco de produção/homologação.
2. **Tipagens ainda expõem o legado**, então uma remoção física exige uma entrega coordenada com atualização de tipos gerados e eventuais ajustes de compilação.
3. **O helper de limpeza no onboarding** ainda referencia as colunas legadas para mantê-las vazias; isso não é dependência operacional, mas precisa ser removido junto com a migration destrutiva.
4. **Documentação histórica e migrations antigas** continuarão mencionando legado após a remoção física, o que é normal, mas pode gerar ruído para quem auditar apenas por busca textual.

## 8. Veredito final

**Opção B — Já é seguro parar de usar o legado no código, mas ainda não remover do banco.**

### Justificativa objetiva

- O runtime crítico já opera por ambiente: `/admin/eventos`, `/admin/empresa`, checkout público, create payment, verify, webhook e diagnóstico administrativo não dependem mais do legado para decidir comportamento.
- Ainda não houve prova de dados reais via SQL executada contra o banco.
- A remoção física ainda exige uma entrega coordenada para:
  1. remover o helper de limpeza legado do onboarding;
  2. atualizar/regenerar tipagens;
  3. executar a query de auditoria e confirmar que não há resíduo legado relevante.

## 9. Condições para remoção

Só considerar a migration destrutiva das colunas legadas após cumprir **todas** as condições abaixo:

1. Executar a query de auditoria SQL no banco real.
2. Confirmar que não há empresas em `legado_preenchido_sem_ambiente` ou `residuo_inconsistente`.
3. Remover `buildLegacyAsaasCleanupUpdate` e qualquer escrita para colunas legadas em `create-asaas-account`.
4. Regenerar `src/integrations/supabase/types.ts` e ajustar `src/types/database.ts`.
5. Validar build/testes depois da remoção física.

## 10. Próximo passo recomendado

Abrir uma fase final exclusivamente para a remoção física das colunas, contendo:

- migration `ALTER TABLE ... DROP COLUMN ...`;
- remoção do helper de limpeza legado;
- atualização de tipos gerados;
- revalidação do build e dos fluxos críticos;
- anexar ao PR a saída da query SQL executada no banco real.
