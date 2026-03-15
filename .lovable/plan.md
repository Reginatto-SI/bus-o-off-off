

# Plano: Ambiente duplo Asaas (sandbox / produção) + fix build error

## Build error (pré-requisito)

O arquivo `src/hooks/use-admin-notifications.ts` linha 68 tem um cast `as AdminNotification[]` que quebrou após a migração do enum `sale_status` (tipos gerados mudaram). Fix: cast via `unknown` primeiro.

## Diagnóstico da integração Asaas atual

| Arquivo | Usa `ASAAS_ENV` | Usa `ASAAS_API_KEY` | Usa `ASAAS_WEBHOOK_TOKEN` | Usa `ASAAS_WALLET_ID` |
|---|---|---|---|---|
| `create-asaas-payment` | ✅ | ✅ (+ company key) | — | ✅ |
| `create-asaas-account` | ✅ | ✅ | — | — |
| `create-platform-fee-checkout` | ✅ | ✅ | — | — |
| `verify-payment-status` | ✅ | ✅ (+ company key) | — | — |
| `asaas-webhook` | — | — | ✅ | — |

**Problema central:** existe UM único `ASAAS_API_KEY` e UM único `ASAAS_WEBHOOK_TOKEN`. Quando `ASAAS_ENV=sandbox`, a URL aponta para sandbox mas a API key pode ser de produção (ou vice-versa). Mistura perigosa.

## Estratégia

Manter `ASAAS_ENV` como toggle central (`sandbox` ou `production`). Criar secrets pareados por ambiente. Cada edge function resolve automaticamente a chave correta com base no ambiente.

### Secrets necessários

| Secret | Descrição |
|---|---|
| `ASAAS_ENV` | Já existe. `sandbox` ou `production` |
| `ASAAS_API_KEY` | Já existe. Chave da **plataforma em produção** |
| `ASAAS_API_KEY_SANDBOX` | **NOVO.** Chave da plataforma no sandbox |
| `ASAAS_WEBHOOK_TOKEN` | Já existe. Token webhook **produção** |
| `ASAAS_WEBHOOK_TOKEN_SANDBOX` | **NOVO.** Token webhook sandbox |
| `ASAAS_WALLET_ID` | Já existe. Wallet **produção** |
| `ASAAS_WALLET_ID_SANDBOX` | **NOVO.** Wallet sandbox |

### Resolução nas edge functions

Lógica simples em cada função:

```typescript
const isSandbox = Deno.env.get("ASAAS_ENV") !== "production";
const ASAAS_BASE_URL = isSandbox
  ? "https://sandbox.asaas.com/api/v3"
  : "https://api.asaas.com/v3";
const PLATFORM_API_KEY = Deno.env.get(isSandbox ? "ASAAS_API_KEY_SANDBOX" : "ASAAS_API_KEY");
const PLATFORM_WALLET_ID = Deno.env.get(isSandbox ? "ASAAS_WALLET_ID_SANDBOX" : "ASAAS_WALLET_ID");
```

## Alterações por arquivo

### 1. `create-asaas-payment/index.ts`
- Resolver `ASAAS_API_KEY` e `ASAAS_WALLET_ID` por ambiente
- Log indicando qual ambiente está ativo

### 2. `create-asaas-account/index.ts`
- Resolver `ASAAS_API_KEY` por ambiente

### 3. `create-platform-fee-checkout/index.ts`
- Unificar `getAsaasBaseUrl()` com padrão consistente
- Resolver `ASAAS_API_KEY` por ambiente

### 4. `verify-payment-status/index.ts`
- Resolver `ASAAS_API_KEY` por ambiente

### 5. `asaas-webhook/index.ts`
- Resolver `ASAAS_WEBHOOK_TOKEN` por ambiente

### 6. `src/hooks/use-admin-notifications.ts`
- Fix build error: cast `as unknown as AdminNotification[]`

## O que NÃO muda
- Company-level `asaas_api_key` (cada empresa tem sua própria, independente do ambiente)
- Fluxo público de checkout
- RLS / tabelas / frontend
- Config.toml

## Checklist de validação (pós-implementação)

1. Setar `ASAAS_ENV=sandbox` → criar cobrança → confirmar URL sandbox nos logs
2. Webhook sandbox → validar token sandbox
3. Setar `ASAAS_ENV=production` → confirmar URL produção
4. Buscar `asaas.com` no código frontend → zero resultados (chaves só no backend)

