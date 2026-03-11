

# Plan: Complete Payment Flow Overhaul

## Analysis of Current State vs Proposed Changes

| Feature | Current | Proposed | Status |
|---|---|---|---|
| Payment in new tab | Same tab redirect | New tab + waiting screen | **Not implemented** |
| Waiting screen | Confirmation page with polling (partial) | Dedicated waiting UI | **Partially exists** |
| Backend ticket generation | Tickets created in frontend before payment | Tickets created by webhook after payment | **Not implemented** |
| `pendente_pagamento` status | Uses `reservado` for everything | New status for public checkout | **Not implemented** |
| Temporary seat lock | Tickets block seats (permanent) | Temporary lock with expiry | **Not implemented** |
| Pix expiration | No expiry logic | 10-minute lock expiry | **Not implemented** |
| Credit card processing states | Not handled | Keep lock during analysis | **Not implemented** |

## Architecture

```text
CURRENT FLOW:
  Select seats → Create sale (reservado) → Create tickets (blocks seats) → Pay → Webhook updates to pago

NEW FLOW:
  Select seats → Create seat_locks → Create sale (pendente_pagamento, NO tickets) 
  → Open Asaas in new tab → Show waiting screen with polling
  → Webhook: confirm payment → Create tickets → Update sale to pago → Release locks
  → Frontend detects pago → Redirect to confirmation
```

## Changes Required

### Phase 1: Database Changes (Migration)

1. **Add `pendente_pagamento` to `sale_status` enum**
   ```sql
   ALTER TYPE sale_status ADD VALUE 'pendente_pagamento' BEFORE 'reservado';
   ```

2. **Create `seat_locks` table** for temporary blocking:
   - `id`, `trip_id`, `seat_id`, `sale_id` (nullable), `locked_at`, `expires_at`, `company_id`
   - Unique constraint on `(trip_id, seat_id)` — prevents double-lock
   - RLS: public INSERT/SELECT for events `a_venda`, service_role DELETE via webhook
   - No authenticated DELETE — locks expire or are released by backend

3. **Update `enforce_platform_fee_before_paid` trigger** to also allow transition from `pendente_pagamento` to `pago`

4. **Enable realtime on `sales`** for polling (already queryable, but realtime subscription is better)

### Phase 2: Edge Function Changes

#### `create-asaas-payment/index.ts`
- Accept `pendente_pagamento` status (currently requires `reservado`)
- Change validation: `sale.status !== "pendente_pagamento"` → reject

#### `asaas-webhook/index.ts`
- On `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`:
  - Update sale from `pendente_pagamento` → `pago` (change idempotency guard from `reservado` to `pendente_pagamento`)
  - **Create tickets from sale data** — need to store passenger data on the sale or a staging table
  - Delete corresponding `seat_locks`
  - Log the event
- On `PAYMENT_OVERDUE`/`PAYMENT_DELETED`/`PAYMENT_REFUNDED`:
  - Update sale from `pendente_pagamento` → `cancelado`
  - Delete `seat_locks` for the sale
  - No tickets to delete (they don't exist yet)

#### New: `cleanup-expired-locks` (cron or called by webhook)
- Delete `seat_locks` where `expires_at < now()`
- Cancel corresponding sales still in `pendente_pagamento`

### Phase 3: Passenger Data Storage

**Problem**: Currently tickets store passenger data. If we move ticket creation to webhook, the webhook needs passenger data.

**Solution**: Create `sale_passengers` table (staging):
- `id`, `sale_id`, `seat_id`, `seat_label`, `passenger_name`, `passenger_cpf`, `passenger_phone`, `sort_order`, `company_id`
- Frontend writes here during checkout (instead of tickets)
- Webhook reads this to create tickets
- RLS: public INSERT for events `a_venda`, service_role SELECT

### Phase 4: Frontend Changes

#### `Checkout.tsx`
1. **Seat occupation**: Query `seat_locks` + `tickets` to determine occupied seats (union of both)
2. **On submit**:
   - Create `seat_locks` for selected seats (expires_at = now + 15 min)
   - Create `sale_passengers` with passenger data
   - Create sale with status `pendente_pagamento` (not `reservado`)
   - Do NOT create tickets
   - Call `create-asaas-payment`
   - Open Asaas URL in **new tab** (`window.open(url, '_blank')`)
   - Navigate to `/confirmacao/${sale.id}` in current tab (waiting screen)
3. **On error**: Delete seat_locks + sale_passengers + sale

#### `Confirmation.tsx`
- Already has polling logic — enhance it:
  - When sale is `pendente_pagamento`, show "Aguardando pagamento" UI with spinner
  - Poll `sales.status` every 3s (already does this)
  - When status becomes `pago`, fetch tickets and show confirmation
  - Add manual "Verificar pagamento" button (already exists)

#### `types/database.ts`
- Add `pendente_pagamento` to `SaleStatus` type

#### `StatusBadge.tsx`
- Add config for `pendente_pagamento` status

### Phase 5: Admin Compatibility

- Admin sales page: `reservado` remains for manual admin reservations only
- `NewSaleModal`: continues using `reservado` status (admin flow unchanged)
- Seat map queries: update `fetchOccupiedSeats` everywhere to include `seat_locks` in occupied calculation
- Webhook: keep backward compat — also accept `reservado` → `pago` transition for admin manual sales paid via Asaas

## Files Modified

| File | Change |
|---|---|
| Migration SQL | New enum value, `seat_locks` table, `sale_passengers` table |
| `supabase/functions/create-asaas-payment/index.ts` | Accept `pendente_pagamento` |
| `supabase/functions/asaas-webhook/index.ts` | Create tickets from `sale_passengers`, delete locks, handle both statuses |
| `src/pages/public/Checkout.tsx` | New tab, seat_locks, sale_passengers, no tickets |
| `src/pages/public/Confirmation.tsx` | Enhanced waiting UI for `pendente_pagamento` |
| `src/types/database.ts` | Add `pendente_pagamento` |
| `src/components/ui/StatusBadge.tsx` | Add `pendente_pagamento` config |
| New: `supabase/functions/cleanup-expired-locks/index.ts` | Cron cleanup |

## Risk Mitigation

- **Backward compatibility**: Webhook accepts both `reservado` and `pendente_pagamento` → `pago` transitions
- **Race condition**: `seat_locks` unique constraint on `(trip_id, seat_id)` prevents double-booking at DB level
- **Orphaned locks**: Cron function cleans up expired locks every 5 minutes
- **Browser closed**: Webhook handles everything server-side — no frontend dependency

## Scope Note
This is a significant architectural change touching ~8 files with a new DB migration. Estimated implementation: 3 phases across multiple messages.

