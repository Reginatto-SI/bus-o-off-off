# Fase 1 — Limpeza lógica do legado Asaas

## 1. Objetivo

Executar a limpeza lógica dos campos legados do Asaas em `public.companies`, sem remover colunas e sem alterar o contrato operacional atual baseado em ambiente (`production` e `sandbox`).

## 2. Contexto

O projeto mantém dois grupos de campos Asaas em `companies`:

- legado genérico (`asaas_*`);
- configuração atual por ambiente (`asaas_*_production` e `asaas_*_sandbox`).

A auditoria do código mostrou que checkout, verificação de pagamento, webhook e resolução de contexto financeiro já operam com os campos por ambiente. O risco restante estava na presença de valores históricos do legado e no onboarding que ainda espelhava os dados atuais de volta para o modelo antigo.

## 3. Diagnóstico pré-limpeza

### Fluxos críticos já operando por ambiente

- `supabase/functions/_shared/payment-context-resolver.ts` resolve API key, wallet e onboarding apenas pelos campos `*_production` e `*_sandbox`.
- `supabase/functions/create-asaas-payment/index.ts` busca apenas os campos por ambiente da empresa e depende de `sales.payment_environment`.
- `supabase/functions/verify-payment-status/index.ts` consulta apenas `asaas_api_key_production` e `asaas_api_key_sandbox`.
- `supabase/functions/asaas-webhook/index.ts` cruza repasse por wallet de parceiro em produção/sandbox, sem depender do legado.

### Pontos residuais encontrados

- `supabase/functions/create-asaas-account/index.ts` ainda repovoava `asaas_api_key`, `asaas_wallet_id`, `asaas_account_id`, `asaas_account_email` e `asaas_onboarding_complete` como espelho do ambiente ativo.
- `src/lib/asaasIntegrationStatus.ts` ainda considerava o legado na leitura de status da integração, o que podia gerar leitura ambígua mesmo após a migração para campos por ambiente.
- `src/pages/admin/SalesDiagnostic.tsx` preserva leitura do legado apenas para comparação visual/histórico, sem uso operacional.

### Conclusão do impacto

A limpeza lógica é segura para:

- create payment;
- verify;
- webhook;
- onboarding;
- disconnect;
- telas administrativas principais.

O único ajuste indispensável era impedir que o onboarding voltasse a preencher o legado e garantir que o helper de status não tratasse legado como sinal operacional.

## 4. SQL/migration aplicada

Migration criada:

- `supabase/migrations/20260319090000_logical_cleanup_legacy_asaas_fields.sql`

SQL aplicado:

```sql
UPDATE public.companies
SET
  asaas_account_id = NULL,
  asaas_wallet_id = NULL,
  asaas_api_key = NULL,
  asaas_onboarding_complete = FALSE,
  asaas_account_email = NULL
WHERE
  asaas_account_id IS NOT NULL
  OR asaas_wallet_id IS NOT NULL
  OR asaas_api_key IS NOT NULL
  OR asaas_onboarding_complete IS DISTINCT FROM FALSE
  OR asaas_account_email IS NOT NULL;
```

## 5. Campos limpos

Os seguintes campos legados foram zerados logicamente:

- `asaas_account_id`
- `asaas_wallet_id`
- `asaas_api_key`
- `asaas_onboarding_complete`
- `asaas_account_email`

## 6. O que foi ajustado no código

### `supabase/functions/create-asaas-account/index.ts`

- removido o espelhamento do ambiente atual para os campos legados;
- toda atualização de onboarding/disconnect agora mantém o legado limpo (`NULL`/`FALSE`);
- comentários adicionados reforçando que o legado não é mais fonte de verdade.

### `src/lib/asaasIntegrationStatus.ts`

- o helper passou a considerar apenas os campos por ambiente para status operacional;
- o bloco `legacy` continua existindo no retorno, mas fixado como vazio para compatibilidade de consumo;
- comentários adicionados explicando a decisão.

### `src/lib/asaasIntegrationStatus.test.ts`

- teste ajustado para validar que o legado preenchido não altera mais o status operacional.

## 7. O que foi preservado

- nenhuma coluna foi removida;
- `sales.payment_environment` foi preservado;
- histórico de vendas não foi alterado;
- campos `*_production` e `*_sandbox` não foram modificados pela migration;
- arquitetura e fluxos críticos não foram refatorados.

## 8. Riscos residuais

1. Tipagens ainda expõem os campos legados em `src/types/database.ts` e `src/integrations/supabase/types.ts`, porque as colunas continuam existindo.
2. `src/pages/admin/SalesDiagnostic.tsx` ainda exibe legado para comparação histórica; após a limpeza, a tendência é esses campos aparecerem vazios, o que é esperado.
3. Se existir integração externa fora deste repositório lendo diretamente `companies.asaas_*`, ela passará a receber vazio/nulo. Não foi encontrada evidência disso no código local.

## 9. Checklist de validação

- [x] Fluxo create payment continua lendo apenas campos por ambiente.
- [x] Fluxo verify continua lendo apenas campos por ambiente.
- [x] Webhook não depende dos campos legados de `companies`.
- [x] Onboarding e disconnect não repovoam mais o legado.
- [x] Legacy cleanup não remove colunas.
- [x] Legacy cleanup não altera `sales.payment_environment`.
- [x] Helper de status suporta legado vazio/nulo sem quebrar a UI.

## 10. Próximo passo recomendado

Na próxima fase, revisar tipagens, selects de diagnóstico e referências documentais para preparar a remoção estrutural das colunas legadas com segurança, somente após confirmar que nenhum consumidor externo depende delas.

## Veredito

**Legado limpo com sucesso, colunas mantidas para compatibilidade temporária**
