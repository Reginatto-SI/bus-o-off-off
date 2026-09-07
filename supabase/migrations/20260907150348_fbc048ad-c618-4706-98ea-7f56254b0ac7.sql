ALTER TABLE public.payment_gateway_connections
  ADD COLUMN IF NOT EXISTS split_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS capabilities_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by_rotation boolean NOT NULL DEFAULT false;

ALTER TABLE public.payment_webhook_events
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_attempts integer NOT NULL DEFAULT 1;