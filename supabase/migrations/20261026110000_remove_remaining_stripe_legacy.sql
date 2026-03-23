-- Remoção final do legado Stripe restante.
-- Esta migration elimina colunas de sales, saneia logs antigos e ajusta constraints/comentários
-- para deixar o schema alinhado ao fluxo único oficial baseado em Asaas.

ALTER TABLE public.sales
  DROP COLUMN IF EXISTS stripe_checkout_session_id,
  DROP COLUMN IF EXISTS stripe_payment_intent_id,
  DROP COLUMN IF EXISTS stripe_transfer_id;

DELETE FROM public.sale_integration_logs
WHERE provider = 'stripe';

ALTER TABLE public.sale_integration_logs
  DROP CONSTRAINT IF EXISTS sale_integration_logs_provider_check;

ALTER TABLE public.sale_integration_logs
  ADD CONSTRAINT sale_integration_logs_provider_check
  CHECK (provider IN ('asaas', 'manual'));

COMMENT ON COLUMN public.sales.platform_fee_amount IS
'Valor da taxa da plataforma calculada para esta venda.';

COMMENT ON COLUMN public.sales.platform_fee_payment_id IS
'Identificador da cobrança da taxa na conta da plataforma.';

COMMENT ON COLUMN public.socios_split.commission_percent IS
'Percentual do beneficiário financeiro configurado por empresa.';
