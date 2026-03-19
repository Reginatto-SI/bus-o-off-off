-- Fase 4: remoção definitiva do legado Asaas em companies.
-- O contrato operacional do projeto passa a ser exclusivamente por ambiente
-- (`*_production` e `*_sandbox`).
ALTER TABLE public.companies
  DROP COLUMN IF EXISTS asaas_account_id,
  DROP COLUMN IF EXISTS asaas_wallet_id,
  DROP COLUMN IF EXISTS asaas_api_key,
  DROP COLUMN IF EXISTS asaas_onboarding_complete,
  DROP COLUMN IF EXISTS asaas_account_email;
