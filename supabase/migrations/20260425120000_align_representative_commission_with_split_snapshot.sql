-- Alinha o ledger do representante ao snapshot financeiro da venda quando disponível.
-- Objetivo: manter comissão coerente com o split efetivo enviado ao Asaas
-- após a adoção do motor progressivo e distribuição oficial (PRD 07).

CREATE OR REPLACE FUNCTION public.upsert_representative_commission_for_sale(
  p_sale_id uuid,
  p_source text DEFAULT 'payment_finalization'
)
RETURNS TABLE(action text, status public.representative_commission_status)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_representative public.representatives%ROWTYPE;
  v_company public.companies%ROWTYPE;
  v_platform_fee_percent numeric(10,2);
  v_commission_percent numeric(5,2);
  v_base_amount numeric(10,2);
  v_commission_amount numeric(10,2);
  v_status public.representative_commission_status;
  v_block_reason text;
  v_wallet text;
BEGIN
  SELECT *
    INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'sale_not_found'::text, NULL::public.representative_commission_status;
    RETURN;
  END IF;

  IF v_sale.status <> 'pago' THEN
    RETURN QUERY SELECT 'sale_not_paid'::text, NULL::public.representative_commission_status;
    RETURN;
  END IF;

  IF v_sale.representative_id IS NULL THEN
    RETURN QUERY SELECT 'no_representative_snapshot'::text, NULL::public.representative_commission_status;
    RETURN;
  END IF;

  SELECT *
    INTO v_representative
  FROM public.representatives
  WHERE id = v_sale.representative_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'representative_not_found'::text, NULL::public.representative_commission_status;
    RETURN;
  END IF;

  SELECT *
    INTO v_company
  FROM public.companies
  WHERE id = v_sale.company_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'company_not_found'::text, NULL::public.representative_commission_status;
    RETURN;
  END IF;

  v_base_amount := COALESCE(
    v_sale.gross_amount,
    (COALESCE(v_sale.unit_price, 0) * COALESCE(v_sale.quantity, 0))::numeric
  )::numeric(10,2);

  -- Regra nova (PRD 07): quando snapshot de split existir,
  -- a comissão do representante precisa espelhar o split efetivo da venda.
  IF COALESCE(v_sale.split_snapshot_representative_percent, 0) > 0
     AND COALESCE(v_sale.split_snapshot_platform_fee_total, 0) > 0 THEN
    v_commission_percent := ROUND(COALESCE(v_sale.split_snapshot_representative_percent, 0)::numeric, 2);
    v_commission_amount := ROUND((COALESCE(v_sale.split_snapshot_platform_fee_total, 0) / 3.0)::numeric, 2);
  ELSE
    -- Fallback legado para vendas antigas sem snapshot financeiro completo.
    v_platform_fee_percent := ROUND(COALESCE(v_company.platform_fee_percent, 0)::numeric, 2);
    v_commission_percent := ROUND((v_platform_fee_percent / 3.0)::numeric, 2);
    v_commission_amount := ROUND((v_base_amount * (v_commission_percent / 100.0))::numeric, 2);
  END IF;

  IF COALESCE(v_sale.payment_environment, 'sandbox') = 'production' THEN
    v_wallet := NULLIF(trim(COALESCE(v_representative.asaas_wallet_id_production, '')), '');
  ELSE
    v_wallet := NULLIF(trim(COALESCE(v_representative.asaas_wallet_id_sandbox, '')), '');
  END IF;

  IF v_wallet IS NULL THEN
    v_status := 'bloqueada';
    v_block_reason := 'representative_wallet_missing';
  ELSE
    v_status := 'pendente';
    v_block_reason := NULL;
  END IF;

  INSERT INTO public.representative_commissions (
    company_id,
    representative_id,
    sale_id,
    payment_environment,
    base_amount,
    commission_percent,
    commission_amount,
    status,
    blocked_reason,
    created_at,
    updated_at
  ) VALUES (
    v_sale.company_id,
    v_sale.representative_id,
    v_sale.id,
    COALESCE(v_sale.payment_environment, 'sandbox'),
    v_base_amount,
    v_commission_percent,
    v_commission_amount,
    v_status,
    v_block_reason,
    now(),
    now()
  )
  ON CONFLICT (sale_id) DO NOTHING;

  IF FOUND THEN
    RETURN QUERY SELECT 'created'::text, v_status;
  ELSE
    RETURN QUERY SELECT 'already_exists'::text, NULL::public.representative_commission_status;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.upsert_representative_commission_for_sale(uuid, text) IS
  'Cria comissão idempotente por sale_id após venda paga. Prioriza split_snapshot da venda para manter coerência com o split efetivo; usa fallback legado em vendas antigas sem snapshot.';
