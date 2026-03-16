

# Plano: Simplificar ambiente Asaas — host-based, salvo na venda

## Resumo

Eliminar `ASAAS_ENV`, heurísticas e recálculo de ambiente. O ambiente é decidido **uma vez** pelo host no `create-asaas-payment`, salvo em `sales.payment_environment`, e reutilizado por todas as outras funções.

---

## 1. Migração de banco — adicionar coluna `payment_environment`

Adicionar à tabela `sales`:

```sql
ALTER TABLE public.sales ADD COLUMN payment_environment text NOT NULL DEFAULT 'sandbox';
```

Valor: `'sandbox'` ou `'production'`. Default `sandbox` é seguro para vendas existentes em desenvolvimento.

---

## 2. Reescrever `_shared/runtime-env.ts`

Simplificar para duas funções utilitárias puras (sem `ASAAS_ENV`, sem `resolvePaymentEnvironment`):

- **`resolveEnvironmentFromHost(req: Request): PaymentEnvironment`** — retorna `'production'` se host é `smartbusbr.com.br` ou `www.smartbusbr.com.br`, senão `'sandbox'`. Usada apenas em `create-asaas-payment`.
- **`getAsaasBaseUrl(env)`** — mantém como está.
- **`getAsaasApiKeySecretName(env)`** — retorna `ASAAS_API_KEY` ou `ASAAS_API_KEY_SANDBOX`.
- **`getAsaasWalletSecretName(env)`** — retorna `ASAAS_WALLET_ID` ou `ASAAS_WALLET_ID_SANDBOX`.
- **`getAsaasWebhookTokenSecretName(env)`** — retorna `ASAAS_WEBHOOK_TOKEN` ou `ASAAS_WEBHOOK_TOKEN_SANDBOX`.

Remover: `resolvePaymentEnvironment`, `EnvironmentResolution`, flags `blocked`/`downgraded`/`isProduction`.

---

## 3. Atualizar `create-asaas-payment/index.ts`

Este é o **único** ponto que detecta host:

1. Chamar `resolveEnvironmentFromHost(req)` → `paymentEnv`
2. Usar `paymentEnv` para selecionar chaves e URL
3. **Se `paymentEnv === 'sandbox'`**: usar `ASAAS_API_KEY_SANDBOX` (plataforma), sem split de plataforma
4. **Se `paymentEnv === 'production'`**: usar `company.asaas_api_key`, com split normal
5. Após criar cobrança, salvar `payment_environment` na venda:
   ```ts
   .update({ asaas_payment_id: ..., payment_environment: paymentEnv })
   ```
6. Logs claros: `host_detected`, `environment_selected`, `api_key_source`, `asaas_base_url`

---

## 4. Atualizar `verify-payment-status/index.ts`

- Remover `resolvePaymentEnvironment(req)`
- Ler `sale.payment_environment` do banco
- Usar esse valor para selecionar chave e URL:
  - `sandbox` → `ASAAS_API_KEY_SANDBOX` + `sandbox.asaas.com`
  - `production` → `company.asaas_api_key` (fallback plataforma) + `api.asaas.com`

---

## 5. Atualizar `asaas-webhook/index.ts`

- Remover `resolvePaymentEnvironment(req)`
- Buscar `sale.payment_environment` após localizar a venda
- Usar esse valor para selecionar `webhook_token` correto para validação
- Para `platform_fee_` webhooks: buscar a venda referenciada e usar seu `payment_environment`

---

## 6. Atualizar `create-platform-fee-checkout/index.ts`

- Remover `resolvePaymentEnvironment(req)`
- Ler `sale.payment_environment` do banco
- Usar esse valor para selecionar chave e URL

---

## 7. Atualizar `ticket-lookup/index.ts` (se usa Asaas)

Verificar e aplicar o mesmo padrão se necessário.

---

## 8. Limpeza

- Remover referências a `ASAAS_ENV` no código (o secret pode permanecer configurado, mas não será mais consultado)
- Remover `EnvironmentResolution`, `blocked`, `downgraded`, `isProduction` de `runtime-env.ts`

---

## Arquivos afetados

| Arquivo | Ação |
|---|---|
| `supabase/functions/_shared/runtime-env.ts` | Reescrever (simplificar) |
| `supabase/functions/create-asaas-payment/index.ts` | Atualizar (host → env → salvar) |
| `supabase/functions/verify-payment-status/index.ts` | Atualizar (ler env da venda) |
| `supabase/functions/asaas-webhook/index.ts` | Atualizar (ler env da venda) |
| `supabase/functions/create-platform-fee-checkout/index.ts` | Atualizar (ler env da venda) |
| Migração SQL | Adicionar `payment_environment` |

