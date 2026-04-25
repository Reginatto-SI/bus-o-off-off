# 1. Objetivo

Executar a etapa final **parcial e conservadora** de limpeza do schema legado Stripe no Smartbus BR, removendo apenas estruturas que já não sustentam fluxo ativo, tela atual nem auditoria operacional mínima, sem afetar o fluxo oficial baseado em Asaas.

# 2. Contexto consolidado

O projeto já havia concluído:

- neutralização do runtime Stripe (functions retornando `410`);
- remoção de publicação ativa das functions Stripe no `supabase/config.toml`;
- reclassificação visual para legado/histórico nas telas auditadas;
- priorização de Asaas como gateway oficial atual.

Apesar disso, ainda restavam estruturas Stripe no schema/tipos. A revisão desta etapa concluiu que **nem todo vestígio estrutural é igualmente seguro de remover agora**.

# 3. Estruturas Stripe ainda encontradas no schema

## 3.1 `companies`

- `stripe_account_id`
- `stripe_onboarding_complete`

## 3.2 `sales`

- `stripe_checkout_session_id`
- `stripe_payment_intent_id`
- `stripe_transfer_id`

## 3.3 `socios_split` (origem histórica em `partners`)

- `stripe_account_id`
- `stripe_onboarding_complete`

## 3.4 Logs / constraints

- `sale_integration_logs_provider_check` ainda aceita `provider IN ('asaas', 'stripe', 'manual')`.
- Tipos/contratos ainda expunham colunas Stripe em `companies` e `socios_split`.
- Tipos/contratos ainda expõem colunas Stripe em `sales` para leitura histórica.

# 4. Classificação por item

## 4.1 Remover agora

### `companies.stripe_account_id`
- Sem leitura viva no código atual.
- Era apenas herança do onboarding Stripe já neutralizado.
- Não sustenta mais runtime, tela atual nem export oficial.

### `companies.stripe_onboarding_complete`
- Mesma situação do item acima.
- Após neutralização do runtime, não há comportamento atual que dependa desse flag.

### `socios_split.stripe_account_id`
- Era usado apenas pelo fluxo Stripe de split, já neutralizado.
- O fluxo oficial atual usa wallets Asaas.

### `socios_split.stripe_onboarding_complete`
- Mesmo raciocínio do item anterior.
- Sem leitura funcional restante após neutralização do runtime.

### Contrato compartilhado `FinancialSocioValidationProvider = "stripe"`
- Não havia mais chamadas ativas usando `provider: "stripe"`.
- A permanência era apenas resquício técnico sem utilidade operacional atual.

## 4.2 Manter temporariamente

### `sales.stripe_checkout_session_id`
- Ainda é lido por `ticket-lookup`, `Confirmation`, `SalesDiagnostic` e `SalesReport` como compatibilidade de histórico.
- Remoção imediata apagaria informação legada de vendas antigas e exigiria uma decisão explícita de retenção/migração.

### `sales.stripe_payment_intent_id`
- Ainda é lido em diagnóstico e exportações como fallback histórico.
- Há ambiguidade real sobre retenção mínima para auditoria retroativa.

### `sales.stripe_transfer_id`
- Continua como dado potencial de auditoria financeira de vendas antigas.
- Não há evidência suficiente nesta etapa para remover sem discutir retenção histórica.

### `sale_integration_logs_provider_check` com `stripe`
- Alterar agora é arriscado sem validar existência de linhas históricas com `provider = 'stripe'`.
- Se existirem registros antigos, restringir a constraint agora pode exigir migração de dados ou falhar na validação.

## 4.3 Ajustar código antes de remover

### Leituras históricas de `sales.stripe_*`
Arquivos que ainda dependem desses campos:
- `supabase/functions/ticket-lookup/index.ts`
- `src/pages/public/Confirmation.tsx`
- `src/pages/admin/SalesDiagnostic.tsx`
- `src/pages/admin/SalesReport.tsx`
- `src/integrations/supabase/types.ts`
- `src/types/database.ts`

## 4.4 Remover depois

### `sales.stripe_*` e provider histórico em logs
- Recomendação: somente após definição formal de retenção histórica.
- Se a equipe decidir que a auditoria retroativa não precisa mais desses identificadores, a remoção pode acontecer em etapa posterior específica.

# 5. Impacto em tipos e contratos

## Ajustados nesta etapa

- `src/integrations/supabase/types.ts`
  - remove exposição de `stripe_account_id` e `stripe_onboarding_complete` em `companies`;
  - remove exposição de `stripe_account_id` e `stripe_onboarding_complete` em `socios_split`.
- `src/types/database.ts`
  - remove campos Stripe de `Company`;
  - remove campos Stripe de `SocioSplit`.
- `src/lib/asaasIntegrationStatus.test.ts`
  - remove fixture dependente dos campos Stripe removidos.
- `supabase/functions/_shared/payment-context-resolver.ts`
  - remove provider `stripe` do contrato e a validação correspondente.

## Mantidos nesta etapa

- campos `sales.stripe_*` em tipos de banco/contratos;
- tipagem de `provider` em `sale_integration_logs` e `payment-observability`, por ambiguidade legítima de retenção histórica.

# 6. Impacto em código e telas

## Não houve quebra planejada nas telas

As telas/fluxos atuais continuam com leitura histórica de `sales.stripe_*`, então:

- `ticket-lookup` continua consultável;
- confirmação pública continua legível para legado;
- `SalesDiagnostic` continua coerente com a decisão de retenção parcial;
- `SalesReport` continua funcionando com priorização Asaas e fallback histórico.

## Ajuste estrutural de backend compartilhado

- `payment-context-resolver.ts` deixa de aceitar `provider: "stripe"`, alinhando o contrato compartilhado ao fluxo único atual com Asaas.

# 7. Estratégia escolhida

A estratégia desta etapa foi **remoção parcial segura**:

1. remover agora apenas colunas Stripe de `companies` e `socios_split`;
2. remover contratos/tipos diretamente acoplados a essas colunas;
3. preservar `sales.stripe_*` e logs/constraints com `stripe` por dúvida legítima de retenção histórica;
4. registrar explicitamente no relatório o motivo da retenção parcial, em vez de assumir remoção total sem evidência suficiente.

# 8. Migration(s) criadas

## `supabase/migrations/20261026100000_drop_company_and_socio_stripe_legacy_columns.sql`

Esta migration:

- remove `stripe_account_id` e `stripe_onboarding_complete` de `public.companies`;
- remove `stripe_account_id` e `stripe_onboarding_complete` de `public.socios_split`.

# 9. Arquivos alterados

1. `supabase/migrations/20261026100000_drop_company_and_socio_stripe_legacy_columns.sql`
2. `supabase/functions/_shared/payment-context-resolver.ts`
3. `src/integrations/supabase/types.ts`
4. `src/types/database.ts`
5. `src/lib/asaasIntegrationStatus.test.ts`
6. `analise-24-limpeza-schema-stripe-final.md`

# 10. Riscos evitados

- remoção cega de `sales.stripe_*` sem decisão formal de retenção histórica;
- quebra em `ticket-lookup`, confirmação pública, diagnóstico e exportações que ainda leem dados legados de venda;
- permanência de contrato compartilhado aceitando `provider: "stripe"` sem runtime real;
- perpetuação de colunas inúteis em `companies` e `socios_split`, já sem função real no sistema.

# 11. Checklist de validação

- [x] colunas Stripe desnecessárias em `companies` foram removidas nesta etapa.
- [x] colunas Stripe desnecessárias em `socios_split` foram removidas nesta etapa.
- [x] tipos TS deixaram de expor os campos Stripe removidos de `companies` e `socios_split`.
- [x] contrato compartilhado de validação financeira não aceita mais `provider: "stripe"`.
- [x] fluxo Asaas continua intacto.
- [x] ticket lookup/diagnóstico permanecem coerentes com a retenção parcial de `sales.stripe_*`.
- [x] não houve criação de lógica paralela.
- [ ] ainda existem vestígios estruturais Stripe em `sales` e possivelmente em logs/constraints, preservados intencionalmente por retenção histórica ainda não encerrada.
- [ ] validação remota de produção/sandbox continua pendente fora deste ambiente.

# 12. Conclusão final

A erradicação estrutural do Stripe foi concluída **parcialmente e de forma conservadora** nesta etapa.

## Removido com segurança agora
- colunas Stripe de `companies`;
- colunas Stripe de `socios_split`;
- contrato compartilhado de provider Stripe no resolvedor financeiro;
- tipos TS acoplados a essas estruturas.

## Preservado por decisão conservadora
- `sales.stripe_checkout_session_id`
- `sales.stripe_payment_intent_id`
- `sales.stripe_transfer_id`
- constraint/log tipado com `stripe` onde ainda pode existir histórico persistido

## Motivo da preservação parcial
Há dúvida real e técnica sobre retenção histórica mínima para auditoria de vendas antigas e logs. Seguindo a diretriz do projeto, esta entrega **não assumiu** que seria seguro apagar tudo sem uma decisão formal sobre retenção/migração desse histórico.
