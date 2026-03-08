

## Bug: CHECK constraint on `ticket_validations.action` blocks undo operations

### Root Cause

The `ticket_validations` table (created in `20260403000000_add_driver_qr_validation_flow.sql`) has a CHECK constraint on line 22:

```sql
action text NOT NULL CHECK (action IN ('checkin', 'checkout'))
```

This constraint only allows `checkin` and `checkout`. The new actions `reboard`, `undo_checkin`, `undo_checkout`, and `undo_reboard` are rejected, causing the 400 error the user sees.

### Fix

One SQL migration to drop the old constraint and add a new one with all valid actions:

```sql
ALTER TABLE public.ticket_validations
  DROP CONSTRAINT ticket_validations_action_check;

ALTER TABLE public.ticket_validations
  ADD CONSTRAINT ticket_validations_action_check
  CHECK (action IN ('checkin', 'checkout', 'reboard', 'undo_checkin', 'undo_checkout', 'undo_reboard'));
```

### Files

- **New migration SQL** — alter CHECK constraint on `ticket_validations.action`

No frontend changes needed. The code is already correct; only the DB constraint is blocking.

