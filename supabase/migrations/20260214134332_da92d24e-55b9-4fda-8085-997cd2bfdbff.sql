
-- Parte 1.1: Colunas Stripe na tabela companies
ALTER TABLE public.companies ADD COLUMN stripe_account_id text;
ALTER TABLE public.companies ADD COLUMN stripe_onboarding_complete boolean NOT NULL DEFAULT false;

-- Parte 1.2: Colunas Stripe na tabela sales
ALTER TABLE public.sales ADD COLUMN stripe_checkout_session_id text;
ALTER TABLE public.sales ADD COLUMN stripe_payment_intent_id text;
