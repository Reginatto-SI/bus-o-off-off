

# Plan: Fix Asaas Account Creation Flow and Build Errors

## Diagnosis

The user sees "Company not found (HTTP 404)" when trying to create an Asaas account. There are **two layers of problems**:

### Layer 1: Build errors blocking deployment (critical)
The edge functions have 17+ TypeScript errors preventing deployment. All stem from:
- `createClient` (without `<any>` generic) in `payment-finalization.ts` and `payment-observability.ts` causes all `.from()` operations to resolve to type `never`
- `ProcessingResult.environmentDecisionSource` type is `"sale" | "host" | null` but the `payment-context-resolver` returns `"request"` as a valid source
- Missing `resultCategory` in one error return path in `asaas-webhook`
- `getSaleEnvironment` returns `null` but is assigned to `PaymentEnvironment | undefined`

These errors mean the edge functions cannot deploy, so every call to `create-asaas-account` may be hitting a stale or broken version.

### Layer 2: "Automatic" environment resolution is unreliable
When the user selects "Automático pelo host atual" and sends `target_environment: null`, the edge function falls back to host resolution. In edge runtime, the host is always `edge-runtime.supabase.com`, which resolves to `sandbox`. This is technically correct but confusing — the option implies intelligence that doesn't exist.

## Changes

### 1. Fix `payment-finalization.ts` — add `<any>` to `createClient` type parameter
- Change `ReturnType<typeof createClient>` to `ReturnType<typeof createClient<any>>` in all function signatures
- This resolves all `never` type errors for `sales`, `tickets`, `sale_passengers`, `seat_locks`, `sale_logs`

### 2. Fix `payment-observability.ts` — add `<any>` to `createClient` type parameter
- Same fix for `logSaleOperationalEvent` and `logSaleIntegrationEvent`

### 3. Fix `asaas-webhook/index.ts` — type alignment
- Add `"request"` to `ProcessingResult.environmentDecisionSource` union type
- Change `saleEnv` variable type to allow `null` (use `| null` or initialize differently)
- Add missing `resultCategory` to the error return at line ~677

### 4. Improve "Automatic" environment option in wizard
- Replace "Automático pelo host atual" with clearer UX: default to `sandbox` instead of `automatic`
- Add helper text explaining that Sandbox is for testing and Production is for real payments
- Remove the misleading "automatic" option entirely since it always resolves to sandbox in the current infrastructure

### 5. No changes needed to `create-asaas-account/index.ts`
- The company lookup logic with `.maybeSingle()` and separated error handling is already correct
- The `resolveTargetEnvironment` function correctly handles `null` target_environment

## Files to modify

1. `supabase/functions/_shared/payment-finalization.ts` — fix generic types
2. `supabase/functions/_shared/payment-observability.ts` — fix generic types
3. `supabase/functions/asaas-webhook/index.ts` — fix type unions and missing field
4. `src/components/admin/AsaasOnboardingWizard.tsx` — remove misleading "Automatic" option, default to sandbox

