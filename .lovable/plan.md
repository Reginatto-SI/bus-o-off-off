
# Complete Payment Flow Overhaul — IMPLEMENTED

## Changes Made

### Database
- Added `pendente_pagamento` to `sale_status` enum
- Created `seat_locks` table with unique constraint `(trip_id, seat_id)` for temporary seat blocking
- Created `sale_passengers` staging table for passenger data before payment confirmation
- Enabled realtime on `sales` table
- Enabled `pg_cron` and `pg_net` extensions
- Scheduled `cleanup-expired-locks` cron job every 5 minutes

### Edge Functions
- `create-asaas-payment`: Accepts both `reservado` and `pendente_pagamento` statuses
- `asaas-webhook`: Creates tickets from `sale_passengers` on payment confirmation, releases seat locks, handles both status transitions
- `cleanup-expired-locks` (NEW): Cancels expired pending sales and releases seat locks

### Frontend
- `Checkout.tsx`: Creates seat_locks → sale (pendente_pagamento) → sale_passengers → opens Asaas in new tab → navigates to confirmation
- `Confirmation.tsx`: Enhanced polling for `pendente_pagamento`, shows "Aguardando pagamento" UI, handles cancelled state
- `StatusBadge.tsx`: Added `pendente_pagamento` badge
- `types/database.ts`: Added `pendente_pagamento` to `SaleStatus`

## Architecture
```
NEW FLOW:
  Select seats → Create seat_locks (15min expiry) → Create sale (pendente_pagamento)
  → Create sale_passengers → Open Asaas in new tab → Show waiting screen
  → Webhook: confirm payment → Create tickets from sale_passengers → Update to pago → Release locks
  → Frontend detects pago → Show tickets
```
