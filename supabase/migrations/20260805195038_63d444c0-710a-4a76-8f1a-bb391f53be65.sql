ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS payment_environment text NOT NULL DEFAULT 'production';

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_payment_environment_check;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_payment_environment_check
  CHECK (payment_environment IN ('production', 'sandbox'));

UPDATE public.companies
SET payment_environment = 'sandbox'
WHERE COALESCE(asaas_api_key_production, '') = ''
  AND COALESCE(asaas_wallet_id_production, '') = ''
  AND (
    COALESCE(asaas_api_key_sandbox, '') <> ''
    OR COALESCE(asaas_wallet_id_sandbox, '') <> ''
  );