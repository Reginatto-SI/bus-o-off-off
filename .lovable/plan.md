

# Plano: Modelo Híbrido ASAAS_ENV + Validação de Host + Fix Build Errors

## Problema atual

1. **`runtime-env.ts`** decide o ambiente **apenas por host/header HTTP** — headers podem ser manipulados por proxies, CDNs e previews, gerando cobranças no ambiente errado.
2. **Build errors** em `create-asaas-payment/index.ts` — a função `safeJson` retorna `Record<string, unknown> | null` e o código acessa propriedades como `.data.length`, `.errors[0].description`, `.id` sem cast adequado.

## Estratégia

### 1. Reescrever `runtime-env.ts` com modelo híbrido

- `ASAAS_ENV` (secret) = fonte primária de verdade
- Se `ASAAS_ENV = "production"` → valida que o host pertence à allowlist (`smartbusbr.com.br`, `www.smartbusbr.com.br`). Se host inválido → retorna `blocked: true` com motivo
- Se `ASAAS_ENV = "sandbox"` → qualquer host é aceito
- Se `ASAAS_ENV` ausente/inválido → throw Error explícito (nunca fallback)
- O retorno ganha campo `blocked: boolean` e `blockReason?: string`

### 2. Atualizar cada Edge Function para checar `blocked`

Todas as 5 funções (`create-asaas-payment`, `create-asaas-account`, `create-platform-fee-checkout`, `verify-payment-status`, `asaas-webhook`) adicionam guard logo após `resolvePaymentEnvironment`:

```typescript
const runtimeEnv = resolvePaymentEnvironment(req);
if (runtimeEnv.blocked) {
  return jsonResponse({ error: runtimeEnv.blockReason }, 403);
}
```

### 3. Fix build errors em `create-asaas-payment/index.ts`

Tipagem correta para `safeJson`:

```typescript
// deno-lint-ignore no-explicit-any
async function safeJson(res: Response): Promise<any> {
  try {
    const text = await res.text();
    if (!text || !text.trim()) return null;
    return JSON.parse(text);
  } catch { return null; }
}
```

Retornar `any` elimina todos os 7 erros de tipo sem alterar lógica. Os acessos a `.data.length`, `.errors[0].description`, `.id`, `.walletId` passam a funcionar naturalmente.

## Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `supabase/functions/_shared/runtime-env.ts` | Reescrita: ASAAS_ENV primário + host como guard + campo `blocked` |
| `supabase/functions/create-asaas-payment/index.ts` | Guard `blocked` + fix `safeJson` return type para `any` |
| `supabase/functions/create-asaas-account/index.ts` | Guard `blocked` após resolvePaymentEnvironment |
| `supabase/functions/create-platform-fee-checkout/index.ts` | Guard `blocked` |
| `supabase/functions/verify-payment-status/index.ts` | Guard `blocked` |
| `supabase/functions/asaas-webhook/index.ts` | Guard `blocked` |

## O que NÃO muda
- Frontend, checkout UX, fluxo de assentos, tabelas, RLS
- Secrets existentes (ASAAS_ENV já configurado)
- Lógica de split, customer, tickets, webhook processing

## Checklist pós-implementação
1. `ASAAS_ENV=sandbox` → criar cobrança → logs mostram `asaas_env: sandbox`, URL `sandbox.asaas.com`
2. `ASAAS_ENV=production` + request de preview → retorna 403 com motivo claro
3. `ASAAS_ENV=production` + request do domínio oficial → funciona normalmente
4. Build sem erros de tipo

