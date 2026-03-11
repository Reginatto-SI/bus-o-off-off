

# Fix: "Não foi possível obter wallet da plataforma para aplicar o split"

## Root Cause
The secret `ASAAS_WALLET_ID` (platform's wallet) is **not configured**. The fallback (`/myAccount` API call) also fails silently, so the function returns a 500 error.

## Solution

### 1. Add `ASAAS_WALLET_ID` secret
Use the `add_secret` tool to request the platform's Asaas wallet ID from the user. This is the wallet where the platform receives its split commission.

### 2. Make the fallback more resilient in `create-asaas-payment/index.ts`
- Add error logging when the `/myAccount` fallback fails so we can debug in the future
- Log the actual Asaas API error responses for split-related failures

### 3. Verify partner query scoping
Currently the partner query (`partners` table) has **no company filter** — it just picks the first active partner globally. This is correct per the current architecture (platform-level partner, not per-company), but should be confirmed.

### 4. Validate the complete split flow
The split logic is already correct:
- Charge created with **company's API key** → company is the charge owner
- `splitArray` contains only **platform wallet** + **partner wallet** (if applicable)
- Company receives `100% - (platform + partner)` automatically

No code changes needed to the split logic itself — just the missing secret.

## Files
- `supabase/functions/create-asaas-payment/index.ts` — add better error logging for the `/myAccount` fallback
- Secret: `ASAAS_WALLET_ID` — must be added

