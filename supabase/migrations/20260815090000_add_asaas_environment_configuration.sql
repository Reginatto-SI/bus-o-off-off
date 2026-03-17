-- Step 3 (Asaas): saneamento de configuração por ambiente sem ativar novo comportamento financeiro.

-- 1) Companies: credenciais/identificadores explícitos por ambiente.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS asaas_api_key_production text,
  ADD COLUMN IF NOT EXISTS asaas_wallet_id_production text,
  ADD COLUMN IF NOT EXISTS asaas_account_id_production text,
  ADD COLUMN IF NOT EXISTS asaas_account_email_production text,
  ADD COLUMN IF NOT EXISTS asaas_onboarding_complete_production boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS asaas_api_key_sandbox text,
  ADD COLUMN IF NOT EXISTS asaas_wallet_id_sandbox text,
  ADD COLUMN IF NOT EXISTS asaas_account_id_sandbox text,
  ADD COLUMN IF NOT EXISTS asaas_account_email_sandbox text,
  ADD COLUMN IF NOT EXISTS asaas_onboarding_complete_sandbox boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.asaas_api_key_production IS
'API key Asaas da empresa para ambiente de produção. Campo preparado no Step 3.';
COMMENT ON COLUMN public.companies.asaas_wallet_id_production IS
'Wallet Asaas da empresa para ambiente de produção. Campo preparado no Step 3.';
COMMENT ON COLUMN public.companies.asaas_account_id_production IS
'Account ID Asaas da empresa para ambiente de produção. Campo preparado no Step 3.';
COMMENT ON COLUMN public.companies.asaas_account_email_production IS
'E-mail da conta Asaas da empresa em produção. Campo preparado no Step 3.';
COMMENT ON COLUMN public.companies.asaas_onboarding_complete_production IS
'Flag de onboarding Asaas concluído para produção. Campo preparado no Step 3.';

COMMENT ON COLUMN public.companies.asaas_api_key_sandbox IS
'API key Asaas da empresa para ambiente de sandbox. Campo preparado no Step 3.';
COMMENT ON COLUMN public.companies.asaas_wallet_id_sandbox IS
'Wallet Asaas da empresa para ambiente de sandbox. Campo preparado no Step 3.';
COMMENT ON COLUMN public.companies.asaas_account_id_sandbox IS
'Account ID Asaas da empresa para ambiente de sandbox. Campo preparado no Step 3.';
COMMENT ON COLUMN public.companies.asaas_account_email_sandbox IS
'E-mail da conta Asaas da empresa em sandbox. Campo preparado no Step 3.';
COMMENT ON COLUMN public.companies.asaas_onboarding_complete_sandbox IS
'Flag de onboarding Asaas concluído para sandbox. Campo preparado no Step 3.';

-- 2) Partners: wallets por ambiente para preparar split por ambiente.
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS asaas_wallet_id_production text,
  ADD COLUMN IF NOT EXISTS asaas_wallet_id_sandbox text;

COMMENT ON COLUMN public.partners.asaas_wallet_id_production IS
'Wallet Asaas do sócio para produção. Campo preparado no Step 3; regra atual ainda usa legado.';
COMMENT ON COLUMN public.partners.asaas_wallet_id_sandbox IS
'Wallet Asaas do sócio para sandbox. Campo preparado no Step 3; sandbox split ainda não ativado.';

-- 3) Backfill mínimo de produção a partir dos campos legados atuais.
UPDATE public.companies
SET
  asaas_api_key_production = COALESCE(asaas_api_key_production, asaas_api_key),
  asaas_wallet_id_production = COALESCE(asaas_wallet_id_production, asaas_wallet_id),
  asaas_account_id_production = COALESCE(asaas_account_id_production, asaas_account_id),
  asaas_account_email_production = COALESCE(asaas_account_email_production, asaas_account_email),
  asaas_onboarding_complete_production = COALESCE(asaas_onboarding_complete_production, false) OR COALESCE(asaas_onboarding_complete, false)
WHERE
  asaas_api_key IS NOT NULL
  OR asaas_wallet_id IS NOT NULL
  OR asaas_account_id IS NOT NULL
  OR asaas_account_email IS NOT NULL
  OR asaas_onboarding_complete = true;

UPDATE public.partners
SET asaas_wallet_id_production = COALESCE(asaas_wallet_id_production, asaas_wallet_id)
WHERE asaas_wallet_id IS NOT NULL;
