

# Plan: Fix Asaas Payment Creation Error

## Root Cause Analysis

Two issues identified:

### Issue 1 — Split includes company's own wallet (likely Asaas rejection)
When the charge was created using the **platform's API key** (old code), including the company wallet in the split made sense — the company was a third party receiving split funds. Now that the charge is created using the **company's API key**, the company IS the charge owner. In Asaas, the charge creator receives the remainder automatically. Including the creator's own wallet in the split array likely causes an Asaas API error (you can't split funds to yourself).

**Fix**: Remove the company wallet from the split array. Only include platform + partner wallets. The company keeps `100% - (platform + partner)` automatically.

### Issue 2 — Frontend swallows error details
`supabase.functions.invoke` sets `data = null` and `error = FunctionsHttpError` on non-2xx responses. The checkout code tries to read `checkoutData?.error_code` (line 685) which is always `undefined` because `checkoutData` is `null`. So the `no_asaas_account` fallback never triggers, and every error shows the generic "Erro ao iniciar pagamento".

**Fix**: Parse the error response from `checkoutError` to extract `error_code` and `error` message.

## Files to Modify

### 1. `supabase/functions/create-asaas-payment/index.ts`
- Remove the company wallet entry from `splitArray` (lines 150-156)
- The split should only contain platform wallet + optional partner wallet
- Company receives remainder automatically as charge creator

### 2. `src/pages/public/Checkout.tsx` (lines 672-705)
- After `supabase.functions.invoke`, parse error response properly:
  ```typescript
  // Extract error body from FunctionsHttpError
  let errorBody = checkoutData;
  if (checkoutError && !errorBody) {
    try {
      errorBody = await checkoutError.context?.json?.();
    } catch {}
  }
  ```
- Use `errorBody?.error_code` instead of `checkoutData?.error_code`
- This ensures `no_asaas_account` fallback works correctly

## Security
- No sensitive data exposed
- Company still gets correct payment attribution (charge created with company API key)
- Split correctly routes platform fee + partner fee to external wallets

