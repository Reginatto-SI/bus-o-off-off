
-- Adicionar colunas Asaas na tabela companies (manter Stripe para histórico)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS asaas_account_id text,
  ADD COLUMN IF NOT EXISTS asaas_wallet_id text,
  ADD COLUMN IF NOT EXISTS asaas_api_key text,
  ADD COLUMN IF NOT EXISTS asaas_onboarding_complete boolean NOT NULL DEFAULT false;

-- Adicionar colunas Asaas na tabela sales (manter Stripe para histórico)
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS asaas_payment_id text,
  ADD COLUMN IF NOT EXISTS asaas_payment_status text,
  ADD COLUMN IF NOT EXISTS asaas_transfer_id text;

-- Adicionar coluna Asaas na tabela partners (manter Stripe para histórico)
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS asaas_wallet_id text;
