-- Private administrative operations: public payment_attempts remains unchanged.
ALTER TABLE public.companies ADD COLUMN manual_fee_flow_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.companies ADD COLUMN manual_fee_pagbank_sandbox_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE public.platform_fee_operations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sale_id uuid NOT NULL UNIQUE REFERENCES public.sales(id),
 company_id uuid NOT NULL REFERENCES public.companies(id),
 gateway text NOT NULL CHECK(gateway IN ('asaas','pagbank')),
 environment text NOT NULL CHECK(environment IN ('sandbox','production')),
 issuer_account_id text NOT NULL,
 amount_cents integer NOT NULL CHECK(amount_cents>=0),
 reference text NOT NULL UNIQUE,
 idempotency_key text NOT NULL UNIQUE,
 snapshot jsonb NOT NULL,
 state text NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','creating','pending','confirmed','terminal','indeterminate','exempt')),
 external_id text,
 external_status text,
 presentation jsonb,
 confirmed_at timestamptz,
 last_queried_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(NOT(gateway='pagbank' AND environment='production')),
 CHECK((state='exempt')=(amount_cents=0)),
 UNIQUE(gateway,environment,issuer_account_id,external_id)
);
ALTER TABLE public.platform_fee_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_fee_operations FROM anon,authenticated;
GRANT SELECT ON public.platform_fee_operations TO authenticated;
GRANT ALL ON public.platform_fee_operations TO service_role;
CREATE POLICY manual_fee_company_read ON public.platform_fee_operations FOR SELECT TO authenticated
 USING(public.user_belongs_to_company(auth.uid(),company_id));
CREATE INDEX manual_fee_recovery_idx ON public.platform_fee_operations(state,last_queried_at);
CREATE OR REPLACE FUNCTION public.claim_manual_fee_creation(p_id uuid) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.platform_fee_operations SET state='creating' WHERE id=p_id AND state='prepared';
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.claim_manual_fee_creation(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_manual_fee_creation(uuid) TO service_role;
-- Context, amount, snapshot and linked external identity cannot change on retry.
CREATE OR REPLACE FUNCTION public.freeze_manual_fee_operation() RETURNS trigger
 LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF ROW(NEW.sale_id,NEW.company_id,NEW.gateway,NEW.environment,NEW.issuer_account_id,NEW.amount_cents,NEW.reference,NEW.idempotency_key,NEW.snapshot)
 IS DISTINCT FROM ROW(OLD.sale_id,OLD.company_id,OLD.gateway,OLD.environment,OLD.issuer_account_id,OLD.amount_cents,OLD.reference,OLD.idempotency_key,OLD.snapshot)
 OR (OLD.external_id IS NOT NULL AND NEW.external_id IS DISTINCT FROM OLD.external_id)
 OR (OLD.state IN ('confirmed','exempt') AND NEW.state IS DISTINCT FROM OLD.state)
 THEN RAISE EXCEPTION 'manual_fee_context_immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER freeze_manual_fee_operation BEFORE UPDATE ON public.platform_fee_operations FOR EACH ROW EXECUTE FUNCTION public.freeze_manual_fee_operation();
CREATE OR REPLACE FUNCTION public.validate_manual_fee_owner() RETURNS trigger
 LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.sales s WHERE s.id=NEW.sale_id AND s.company_id=NEW.company_id
   AND s.payment_environment=NEW.environment AND s.sale_origin IN ('admin_manual','admin_reservation_conversion','seller_manual'))
 THEN RAISE EXCEPTION 'manual_fee_sale_context_mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_manual_fee_owner BEFORE INSERT ON public.platform_fee_operations FOR EACH ROW EXECUTE FUNCTION public.validate_manual_fee_owner();
