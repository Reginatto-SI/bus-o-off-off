ALTER TABLE public.payment_gateway_connections
  DROP CONSTRAINT IF EXISTS payment_gateway_connections_credential_mode_check;
ALTER TABLE public.payment_gateway_connections
  ADD CONSTRAINT payment_gateway_connections_credential_mode_check
  CHECK (credential_mode IN ('connect_oauth','connect_sms','sandbox_manual_token'));