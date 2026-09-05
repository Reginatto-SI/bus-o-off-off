-- 1. companies.payment_gateway (aditivo, backfill explícito asaas)
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS payment_gateway text;
UPDATE public.companies SET payment_gateway = 'asaas' WHERE payment_gateway IS NULL;
ALTER TABLE public.companies ALTER COLUMN payment_gateway SET NOT NULL;
ALTER TABLE public.companies ADD CONSTRAINT companies_payment_gateway_check CHECK (payment_gateway IN ('asaas','pagbank'));
ALTER TABLE public.companies ADD CONSTRAINT companies_pagbank_sandbox_only_check CHECK (NOT (payment_gateway = 'pagbank' AND payment_environment = 'production'));

-- 2. payment_gateway_connections (privada, service role)
CREATE TABLE public.payment_gateway_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  gateway text NOT NULL CHECK (gateway IN ('asaas','pagbank')),
  environment text NOT NULL CHECK (environment IN ('sandbox','production')),
  status text NOT NULL DEFAULT 'awaiting_configuration' CHECK (status IN ('awaiting_configuration','connected','revoked','error')),
  credential_mode text CHECK (credential_mode IN ('connect_oauth','sandbox_manual_token')),
  external_account_id text,
  external_account_email text,
  access_token_enc text,
  refresh_token_enc text,
  webhook_token_enc text,
  token_expires_at timestamptz,
  scopes text[],
  credential_generation integer NOT NULL DEFAULT 0,
  pix_ready boolean NOT NULL DEFAULT false,
  last_validated_at timestamptz,
  last_error text,
  connected_at timestamptz,
  revoked_at timestamptz,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.payment_gateway_connections TO service_role;
ALTER TABLE public.payment_gateway_connections ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX payment_gateway_connections_current_idx ON public.payment_gateway_connections (company_id, gateway, environment) WHERE is_current;
CREATE TRIGGER update_payment_gateway_connections_updated_at BEFORE UPDATE ON public.payment_gateway_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. sales: gateway, conexão e conta congeladas
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS payment_gateway text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS payment_connection_id uuid REFERENCES public.payment_gateway_connections(id);
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS external_account_id text;
UPDATE public.sales SET payment_gateway = 'asaas' WHERE payment_gateway IS NULL;
ALTER TABLE public.sales ALTER COLUMN payment_gateway SET NOT NULL;
ALTER TABLE public.sales ADD CONSTRAINT sales_payment_gateway_check CHECK (payment_gateway IN ('asaas','pagbank'));
ALTER TABLE public.sales ADD CONSTRAINT sales_pagbank_sandbox_only_check CHECK (NOT (payment_gateway = 'pagbank' AND payment_environment = 'production'));
CREATE INDEX IF NOT EXISTS sales_payment_gateway_idx ON public.sales (payment_gateway, payment_environment);

CREATE OR REPLACE FUNCTION public.freeze_sale_payment_context()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company record;
  v_conn_id uuid;
  v_account text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT payment_gateway, payment_environment INTO v_company FROM public.companies WHERE id = NEW.company_id;
    IF v_company IS NULL THEN
      RAISE EXCEPTION 'sale_company_not_found' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.payment_gateway IS NULL THEN NEW.payment_gateway := v_company.payment_gateway; END IF;
    IF NEW.payment_environment IS NULL THEN NEW.payment_environment := v_company.payment_environment; END IF;
    IF NEW.payment_gateway IS NULL OR NEW.payment_environment IS NULL THEN
      RAISE EXCEPTION 'sale_payment_context_missing' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.payment_gateway = 'pagbank' THEN
      SELECT id, external_account_id INTO v_conn_id, v_account
      FROM public.payment_gateway_connections
      WHERE company_id = NEW.company_id AND gateway = 'pagbank' AND environment = NEW.payment_environment AND is_current
      LIMIT 1;
      IF NEW.payment_connection_id IS NULL THEN NEW.payment_connection_id := v_conn_id; END IF;
      IF NEW.external_account_id IS NULL THEN NEW.external_account_id := v_account; END IF;
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE: imutabilidade desde a criação
  IF NEW.payment_gateway IS DISTINCT FROM OLD.payment_gateway
     OR NEW.payment_environment IS DISTINCT FROM OLD.payment_environment
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR (OLD.payment_connection_id IS NOT NULL AND NEW.payment_connection_id IS DISTINCT FROM OLD.payment_connection_id)
     OR (OLD.external_account_id IS NOT NULL AND NEW.external_account_id IS DISTINCT FROM OLD.external_account_id) THEN
    RAISE EXCEPTION 'sale_payment_context_immutable' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_freeze_sale_payment_context ON public.sales;
CREATE TRIGGER trg_freeze_sale_payment_context BEFORE INSERT OR UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.freeze_sale_payment_context();

-- 4. payment_attempts
CREATE TABLE public.payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.payment_gateway_connections(id),
  gateway text NOT NULL CHECK (gateway IN ('asaas','pagbank')),
  environment text NOT NULL CHECK (environment IN ('sandbox','production')),
  operation text NOT NULL CHECK (operation IN ('create_pix')),
  idempotency_key text NOT NULL UNIQUE,
  payload_hash text,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','succeeded','failed','indeterminate')),
  external_order_id text,
  external_charge_id text,
  external_reference text,
  external_status_raw text,
  normalized_status text CHECK (normalized_status IS NULL OR normalized_status IN ('pending','paid','failed','canceled','unknown')),
  amount_cents integer,
  pix_qr_text text,
  pix_qr_image_url text,
  pix_expires_at timestamptz,
  error_code text,
  error_message_sanitized text,
  attempt_count integer NOT NULL DEFAULT 1,
  last_queried_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_attempts TO authenticated;
GRANT SELECT ON public.payment_attempts TO anon;
GRANT ALL ON public.payment_attempts TO service_role;
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company users can view payment attempts" ON public.payment_attempts FOR SELECT TO authenticated USING (public.user_belongs_to_company(auth.uid(), company_id));
CREATE POLICY "Public can view pix attempt of public sale" ON public.payment_attempts FOR SELECT TO anon USING (
  gateway = 'pagbank' AND EXISTS (SELECT 1 FROM public.sales s WHERE s.id = payment_attempts.sale_id AND s.payment_gateway = 'pagbank')
);
CREATE INDEX payment_attempts_sale_idx ON public.payment_attempts (sale_id, created_at DESC);
CREATE INDEX payment_attempts_external_order_idx ON public.payment_attempts (external_order_id);
CREATE TRIGGER update_payment_attempts_updated_at BEFORE UPDATE ON public.payment_attempts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. payment_webhook_events (dedup)
CREATE TABLE public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway text NOT NULL CHECK (gateway IN ('asaas','pagbank')),
  environment text NOT NULL CHECK (environment IN ('sandbox','production')),
  external_account_id text NOT NULL DEFAULT '',
  event_key text NOT NULL,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  raw_body_hash text,
  signature_valid boolean,
  raw_status text,
  processing_result text,
  duplicate_count integer NOT NULL DEFAULT 0,
  first_received_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway, environment, external_account_id, event_key)
);
GRANT ALL ON public.payment_webhook_events TO service_role;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

-- 6. pagbank_connect_states
CREATE TABLE public.pagbank_connect_states (
  state text PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('sandbox','production')),
  user_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.pagbank_connect_states TO service_role;
ALTER TABLE public.pagbank_connect_states ENABLE ROW LEVEL SECURITY;

-- 7. recebedores PagBank
ALTER TABLE public.socios_split ADD COLUMN IF NOT EXISTS pagbank_account_id_sandbox text;
ALTER TABLE public.socios_split ADD COLUMN IF NOT EXISTS pagbank_account_id_production text;
ALTER TABLE public.representatives ADD COLUMN IF NOT EXISTS pagbank_account_id_sandbox text;
ALTER TABLE public.representatives ADD COLUMN IF NOT EXISTS pagbank_account_id_production text;

-- 8. logs
ALTER TABLE public.sale_integration_logs DROP CONSTRAINT IF EXISTS sale_integration_logs_provider_check;
ALTER TABLE public.sale_integration_logs ADD CONSTRAINT sale_integration_logs_provider_check CHECK (provider IN ('asaas','manual','pagbank'));
ALTER TABLE public.sale_integration_logs DROP CONSTRAINT IF EXISTS sale_integration_logs_environment_decision_source_check;
ALTER TABLE public.sale_integration_logs ADD CONSTRAINT sale_integration_logs_environment_decision_source_check CHECK (environment_decision_source IS NULL OR environment_decision_source IN ('sale','request','host','company'));