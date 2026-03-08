
-- ============================================================
-- Cobrança da taxa da plataforma em vendas manuais
-- Adiciona campos de controle + trigger anti-bypass
-- ============================================================

-- 1. Novos campos na tabela sales
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS sale_origin text NOT NULL DEFAULT 'online_checkout',
  ADD COLUMN IF NOT EXISTS platform_fee_amount numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS platform_fee_status text NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS platform_fee_payment_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS platform_fee_paid_at timestamptz DEFAULT NULL;

-- Comentários de documentação
COMMENT ON COLUMN public.sales.sale_origin IS 'Origem da venda: online_checkout, admin_manual, admin_reservation_conversion, admin_block, api_integration';
COMMENT ON COLUMN public.sales.platform_fee_amount IS 'Valor da taxa da plataforma calculada para esta venda (independe de platform_fee_total que é usado no fluxo Stripe Connect)';
COMMENT ON COLUMN public.sales.platform_fee_status IS 'Status da cobrança da taxa: not_applicable, pending, paid, waived, failed';
COMMENT ON COLUMN public.sales.platform_fee_payment_id IS 'Stripe Checkout Session ID ou Payment Intent ID da cobrança da taxa na conta da plataforma';
COMMENT ON COLUMN public.sales.platform_fee_paid_at IS 'Data/hora em que a taxa da plataforma foi confirmada como paga';

-- 2. Trigger anti-bypass: impede status=pago quando platform_fee_status != paid (vendas admin)
CREATE OR REPLACE FUNCTION public.enforce_platform_fee_before_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Regra: vendas de origem administrativa com taxa pendente não podem virar 'pago'.
  -- Vendas online (Stripe Connect) usam platform_fee_status = 'not_applicable' e não são afetadas.
  -- Bloqueios (admin_block) também usam 'not_applicable'.
  IF NEW.status = 'pago'
     AND OLD.status IS DISTINCT FROM 'pago'
     AND NEW.platform_fee_status NOT IN ('paid', 'not_applicable', 'waived')
  THEN
    RAISE EXCEPTION 'Venda não pode ser marcada como paga: taxa da plataforma pendente (platform_fee_status = %)', NEW.platform_fee_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_platform_fee_before_paid ON public.sales;
CREATE TRIGGER trg_enforce_platform_fee_before_paid
  BEFORE UPDATE ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_platform_fee_before_paid();

-- 3. Atualizar vendas existentes: todas as vendas atuais são legado (online ou manuais anteriores).
-- Vendas já pagas ficam como not_applicable para não quebrar nada.
-- Vendas reservadas existentes também ficam not_applicable (compatibilidade legado).
