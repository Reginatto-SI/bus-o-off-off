

# Fix: Automatic Payment Verification Polling

## Root Cause

In `Confirmation.tsx` lines 220-228, the polling loop calls `verify-payment-status` exactly **once** at attempt 5 (15 seconds), guarded by `verifyCalledRef`. After that, it only reads `sales.status` from the database every 3 seconds — but nothing updates that status because the webhook may not fire in Sandbox and the single verify call happened too early.

The manual button works because it calls `verify-payment-status` on demand, which queries Asaas directly and updates the sale.

## Fix

Replace the single-shot verify at attempt 5 with **periodic calls** to `verify-payment-status` every ~30 seconds (every 10th polling cycle). Remove the `verifyCalledRef` guard. Keep the DB status check every 3s between verify calls.

## Changes

### `src/pages/public/Confirmation.tsx`
- Remove `verifyCalledRef`
- In the polling interval: call `verify-payment-status` every 10 attempts (~30s) instead of once at attempt 5
- Add comments explaining the change

No backend changes needed — `verify-payment-status` already works correctly (proven by the manual button).

