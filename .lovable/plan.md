

# Plan: Fix Build Error + verify-payment-status Company API Key

## Problem 1 — Build Error in VersionUpdateBanner
`refresh` has signature `(targetVersion?: string) => Promise<void>` but is passed directly as `onClick` which provides `MouseEvent`. Fix: wrap in arrow function.

**File:** `src/components/system/VersionUpdateBanner.tsx` line 38
- Change `onClick={refresh}` → `onClick={() => refresh()}`

## Problem 2 — verify-payment-status Uses Global API Key

The function queries `GET /payments/{id}` using `ASAAS_API_KEY` (platform/developer token). Since charges are now created under the company's Asaas account, this query must use the company's `asaas_api_key` to read the payment correctly.

**File:** `supabase/functions/verify-payment-status/index.ts`

Changes:
1. After fetching `sale`, fetch the company's `asaas_api_key` from `companies` table (already fetching `platform_fee_percent` etc. — add `asaas_api_key` to that select)
2. Use `company.asaas_api_key` for the `GET /payments/{id}` call instead of `PLATFORM_API_KEY`
3. Keep `PLATFORM_API_KEY` as fallback only if company key is missing (with a warning log), to avoid breaking existing sales that may have been created under the global token
4. Add comment explaining the reasoning

Specifically around lines 72-84, replace:
```typescript
const PLATFORM_API_KEY = Deno.env.get("ASAAS_API_KEY");
if (!PLATFORM_API_KEY) { ... }
// ...
const res = await fetch(`${ASAAS_BASE_URL}/payments/${sale.asaas_payment_id}`, {
  headers: { "access_token": PLATFORM_API_KEY },
});
```

With logic that:
1. Fetches `asaas_api_key` from `companies` where `id = sale.company_id` (this query already exists ~line 107, just move it earlier or add the field)
2. Uses `company.asaas_api_key ?? PLATFORM_API_KEY` as the access token
3. Logs a warning when falling back to global key

## Files Modified
1. `src/components/system/VersionUpdateBanner.tsx` — 1-line fix
2. `supabase/functions/verify-payment-status/index.ts` — use company API key for payment queries

