

## Analysis: Asaas Account Creation - "É necessário informar a cidade" Error

### Root Cause Identified

Two issues found:

**1. Build Error (blocking deployment):** Line 84 selects fields from `companies` but does NOT include `phone`. Line 271 references `company.phone`, causing a TypeScript error that prevents the function from deploying.

**2. The actual Asaas error:** The payload construction (lines 290+) already uses correct camelCase (`addressNumber`, `postalCode`, `province`). However, looking at the Asaas documentation example, the API infers city from the `postalCode`. The real problem is likely that **the function cannot deploy at all** due to the build error, meaning the old/broken version is running in production.

### Fix Plan

**File:** `supabase/functions/create-asaas-account/index.ts`

1. **Add `phone` to the select query** on line 84 so `company.phone` resolves correctly
2. **Add enhanced diagnostic logs** for the exact payload sent and response received from Asaas
3. No architectural changes needed - the camelCase mapping in the payload is already correct

### Technical Detail

```text
Line 84 (current):
  .select("id, name, legal_type, ... postal_code, city, state, asaas_api_key, ...")

Line 84 (fix):
  .select("id, name, legal_type, ... postal_code, city, state, phone, asaas_api_key, ...")
                                                          ^^^^^
                                                        MISSING
```

Once the build error is fixed, the function will redeploy with the correct payload that already uses proper camelCase field names.

