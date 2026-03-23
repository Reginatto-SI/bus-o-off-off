-- Remoção final das colunas Stripe ainda expostas em `sales`.
-- O fluxo oficial atual usa apenas Asaas; as leituras de frontend/backend já foram saneadas antes desta migration.
ALTER TABLE public.sales
  DROP COLUMN IF EXISTS stripe_checkout_session_id,
  DROP COLUMN IF EXISTS stripe_payment_intent_id,
  DROP COLUMN IF EXISTS stripe_transfer_id;
