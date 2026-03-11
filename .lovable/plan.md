

# Root Cause: `verify-payment-status` not updated for new flow

Two bugs in `supabase/functions/verify-payment-status/index.ts`:

## Bug 1 — Status filter only matches `reservado`
Line 129: `.eq("status", "reservado")` — the new checkout flow creates sales with `pendente_pagamento`, so the UPDATE silently matches zero rows. The sale stays stuck even though Asaas confirms the payment.

## Bug 2 — No ticket creation
Unlike the webhook, `verify-payment-status` never creates tickets from `sale_passengers`. Even if Bug 1 were fixed, the user would see "pago" but no tickets.

## Why the webhook didn't catch it
The screenshot shows webhooks with event `PAYMENT_CHECKOUT_VIEWED` — this is a "customer viewed the checkout" event, not a payment confirmation. The actual `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` webhook may not have fired yet at screenshot time, or Asaas webhook config may not include those events. Either way, the polling fallback (`verify-payment-status`) should handle it — and that's where both bugs live.

## Fix

### `supabase/functions/verify-payment-status/index.ts`
1. Change line 129 from `.eq("status", "reservado")` to `.in("status", ["pendente_pagamento", "reservado"])`
2. After updating to `pago`, call the same ticket creation logic: read `sale_passengers`, insert into `tickets`, delete staging data, release `seat_locks`
3. Update the early return for missing `asaas_payment_id` to return `pendente_pagamento` instead of `reservado`

No other files need changes — the webhook is already correct. This is purely a `verify-payment-status` oversight from the migration.

