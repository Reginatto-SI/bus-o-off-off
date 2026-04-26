-- Backend mínimo para validação futura de serviços por QR próprio.
-- Escopo: resolver QR de serviços + consumo unitário seguro com auditoria.

CREATE TABLE IF NOT EXISTS public.service_item_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  sale_service_item_id uuid NOT NULL REFERENCES public.sale_service_items(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  validated_by_user_id uuid NULL,
  quantity_consumed integer NOT NULL DEFAULT 1 CHECK (quantity_consumed > 0),
  quantity_used_before integer NULL CHECK (quantity_used_before IS NULL OR quantity_used_before >= 0),
  quantity_used_after integer NULL CHECK (quantity_used_after IS NULL OR quantity_used_after >= 0),
  quantity_remaining_before integer NULL CHECK (quantity_remaining_before IS NULL OR quantity_remaining_before >= 0),
  quantity_remaining_after integer NULL CHECK (quantity_remaining_after IS NULL OR quantity_remaining_after >= 0),
  result text NOT NULL CHECK (result IN ('success', 'blocked')),
  reason_code text NOT NULL,
  detail text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_item_validations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_service_item_validations_sale_item
  ON public.service_item_validations(sale_service_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_item_validations_sale
  ON public.service_item_validations(sale_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_item_validations_company
  ON public.service_item_validations(company_id, created_at DESC);

DROP POLICY IF EXISTS "Users can view service item validations" ON public.service_item_validations;
CREATE POLICY "Users can view service item validations"
ON public.service_item_validations
FOR SELECT
TO authenticated
USING (public.user_belongs_to_company(auth.uid(), company_id));

DROP POLICY IF EXISTS "Admins can manage service item validations" ON public.service_item_validations;
CREATE POLICY "Admins can manage service item validations"
ON public.service_item_validations
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()) AND public.user_belongs_to_company(auth.uid(), company_id))
WITH CHECK (public.is_admin(auth.uid()) AND public.user_belongs_to_company(auth.uid(), company_id));

-- Resolve QR de serviços no nível da venda (`sales.service_qr_code_token`) porque
-- o produto exige QR agrupado por comprovante/venda, não por item individual.
CREATE OR REPLACE FUNCTION public.resolve_service_qr(
  p_service_qr_code_token text
)
RETURNS TABLE (
  result text,
  reason_code text,
  message text,
  sale_id uuid,
  event_id uuid,
  customer_name text,
  payment_method text,
  status public.sale_status,
  payment_confirmed_at timestamptz,
  service_qr_code_token text,
  items jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_sale public.sales%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  SELECT s.*
  INTO v_sale
  FROM public.sales s
  WHERE s.service_qr_code_token = p_service_qr_code_token
  LIMIT 1;

  IF v_sale.id IS NULL THEN
    RETURN QUERY SELECT
      'blocked'::text,
      'service_qr_not_found'::text,
      'QR de serviço inválido ou não reconhecido.'::text,
      NULL::uuid,
      NULL::uuid,
      NULL::text,
      NULL::text,
      NULL::public.sale_status,
      NULL::timestamptz,
      NULL::text,
      '[]'::jsonb;
    RETURN;
  END IF;

  IF NOT public.user_belongs_to_company(v_user_id, v_sale.company_id) THEN
    RETURN QUERY SELECT
      'blocked'::text,
      'not_allowed_company'::text,
      'Você não tem permissão para validar esta venda.'::text,
      v_sale.id,
      v_sale.event_id,
      v_sale.customer_name,
      v_sale.payment_method,
      v_sale.status,
      v_sale.payment_confirmed_at,
      v_sale.service_qr_code_token,
      '[]'::jsonb;
    RETURN;
  END IF;

  IF v_sale.status = 'cancelado' THEN
    RETURN QUERY SELECT
      'blocked'::text,
      'sale_cancelled'::text,
      'Venda cancelada. Validação bloqueada.'::text,
      v_sale.id,
      v_sale.event_id,
      v_sale.customer_name,
      v_sale.payment_method,
      v_sale.status,
      v_sale.payment_confirmed_at,
      v_sale.service_qr_code_token,
      '[]'::jsonb;
    RETURN;
  END IF;

  IF v_sale.status = 'pendente_taxa' THEN
    RETURN QUERY SELECT
      'blocked'::text,
      'sale_pending_fee'::text,
      'Venda pendente de taxa. Validação indisponível.'::text,
      v_sale.id,
      v_sale.event_id,
      v_sale.customer_name,
      v_sale.payment_method,
      v_sale.status,
      v_sale.payment_confirmed_at,
      v_sale.service_qr_code_token,
      '[]'::jsonb;
    RETURN;
  END IF;

  IF v_sale.status <> 'pago' THEN
    RETURN QUERY SELECT
      'blocked'::text,
      'sale_not_paid'::text,
      'Venda pendente de confirmação. Validação indisponível.'::text,
      v_sale.id,
      v_sale.event_id,
      v_sale.customer_name,
      v_sale.payment_method,
      v_sale.status,
      v_sale.payment_confirmed_at,
      v_sale.service_qr_code_token,
      '[]'::jsonb;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    'success'::text,
    'service_qr_resolved'::text,
    'QR de serviço resolvido com sucesso.'::text,
    v_sale.id,
    v_sale.event_id,
    v_sale.customer_name,
    v_sale.payment_method,
    v_sale.status,
    v_sale.payment_confirmed_at,
    v_sale.service_qr_code_token,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'item_id', ssi.id,
            'service_id', ssi.service_id,
            'service_name', ssi.service_name,
            'unit_type', ssi.unit_type,
            'control_type', ssi.control_type,
            'quantity_total', ssi.quantity_total,
            'quantity_used', ssi.quantity_used,
            'quantity_remaining', ssi.quantity_remaining,
            'status', ssi.status,
            'unit_price', ssi.unit_price,
            'total_price', ssi.total_price,
            'is_consumable', (
              ssi.status = 'ativo'
              AND ssi.control_type = 'validacao_obrigatoria'
              AND ssi.quantity_remaining > 0
            ),
            'consume_block_reason', CASE
              WHEN ssi.status <> 'ativo' THEN 'item_inactive'
              WHEN ssi.control_type <> 'validacao_obrigatoria' THEN 'control_not_required'
              WHEN ssi.quantity_remaining <= 0 THEN 'no_balance'
              ELSE NULL
            END
          )
          ORDER BY ssi.created_at ASC
        )
        FROM public.sale_service_items ssi
        WHERE ssi.sale_id = v_sale.id
          AND ssi.company_id = v_sale.company_id
      ),
      '[]'::jsonb
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_service_qr(text) TO authenticated;

-- Consumo unitário com trava de concorrência no próprio UPDATE:
-- cada chamada consome exatamente +1 e nunca permite extrapolar quantity_total.
CREATE OR REPLACE FUNCTION public.consume_service_item(
  p_sale_service_item_id uuid,
  p_service_qr_code_token text DEFAULT NULL
)
RETURNS TABLE (
  result text,
  reason_code text,
  message text,
  sale_id uuid,
  sale_service_item_id uuid,
  service_id uuid,
  quantity_total integer,
  quantity_used integer,
  quantity_remaining integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_item public.sale_service_items%ROWTYPE;
  v_sale public.sales%ROWTYPE;
  v_rows_updated integer := 0;
  v_quantity_used_after integer;
  v_quantity_remaining_after integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  SELECT ssi.*
  INTO v_item
  FROM public.sale_service_items ssi
  WHERE ssi.id = p_sale_service_item_id
  LIMIT 1;

  IF v_item.id IS NULL THEN
    RETURN QUERY SELECT
      'blocked'::text,
      'service_item_not_found'::text,
      'Item de serviço não encontrado.'::text,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::integer,
      NULL::integer,
      NULL::integer;
    RETURN;
  END IF;

  SELECT s.*
  INTO v_sale
  FROM public.sales s
  WHERE s.id = v_item.sale_id
  LIMIT 1;

  IF v_sale.id IS NULL THEN
    RETURN QUERY SELECT
      'blocked'::text,
      'sale_not_found'::text,
      'Venda não encontrada para o item informado.'::text,
      NULL::uuid,
      v_item.id,
      v_item.service_id,
      v_item.quantity_total,
      v_item.quantity_used,
      v_item.quantity_remaining;
    RETURN;
  END IF;

  IF NOT public.user_belongs_to_company(v_user_id, v_item.company_id) THEN
    RETURN QUERY SELECT
      'blocked'::text,
      'not_allowed_company'::text,
      'Você não tem permissão para consumir este item.'::text,
      v_sale.id,
      v_item.id,
      v_item.service_id,
      v_item.quantity_total,
      v_item.quantity_used,
      v_item.quantity_remaining;
    RETURN;
  END IF;

  IF p_service_qr_code_token IS NOT NULL AND v_sale.service_qr_code_token <> p_service_qr_code_token THEN
    INSERT INTO public.service_item_validations (
      company_id,
      sale_id,
      sale_service_item_id,
      service_id,
      validated_by_user_id,
      quantity_used_before,
      quantity_used_after,
      quantity_remaining_before,
      quantity_remaining_after,
      result,
      reason_code,
      detail
    ) VALUES (
      v_item.company_id,
      v_sale.id,
      v_item.id,
      v_item.service_id,
      v_user_id,
      v_item.quantity_used,
      v_item.quantity_used,
      v_item.quantity_remaining,
      v_item.quantity_remaining,
      'blocked',
      'service_qr_mismatch',
      'Token informado não corresponde à venda do item.'
    );

    RETURN QUERY SELECT
      'blocked'::text,
      'service_qr_mismatch'::text,
      'QR de serviço não corresponde ao item informado.'::text,
      v_sale.id,
      v_item.id,
      v_item.service_id,
      v_item.quantity_total,
      v_item.quantity_used,
      v_item.quantity_remaining;
    RETURN;
  END IF;

  IF v_sale.status = 'cancelado' THEN
    INSERT INTO public.service_item_validations (
      company_id,
      sale_id,
      sale_service_item_id,
      service_id,
      validated_by_user_id,
      quantity_used_before,
      quantity_used_after,
      quantity_remaining_before,
      quantity_remaining_after,
      result,
      reason_code,
      detail
    ) VALUES (
      v_item.company_id,
      v_sale.id,
      v_item.id,
      v_item.service_id,
      v_user_id,
      v_item.quantity_used,
      v_item.quantity_used,
      v_item.quantity_remaining,
      v_item.quantity_remaining,
      'blocked',
      'sale_cancelled',
      'Venda cancelada.'
    );

    RETURN QUERY SELECT
      'blocked'::text,
      'sale_cancelled'::text,
      'Venda cancelada. Consumo bloqueado.'::text,
      v_sale.id,
      v_item.id,
      v_item.service_id,
      v_item.quantity_total,
      v_item.quantity_used,
      v_item.quantity_remaining;
    RETURN;
  END IF;

  IF v_sale.status = 'pendente_taxa' THEN
    INSERT INTO public.service_item_validations (
      company_id,
      sale_id,
      sale_service_item_id,
      service_id,
      validated_by_user_id,
      quantity_used_before,
      quantity_used_after,
      quantity_remaining_before,
      quantity_remaining_after,
      result,
      reason_code,
      detail
    ) VALUES (
      v_item.company_id,
      v_sale.id,
      v_item.id,
      v_item.service_id,
      v_user_id,
      v_item.quantity_used,
      v_item.quantity_used,
      v_item.quantity_remaining,
      v_item.quantity_remaining,
      'blocked',
      'sale_pending_fee',
      'Venda em pendente_taxa ainda não pode consumir serviço.'
    );

    RETURN QUERY SELECT
      'blocked'::text,
      'sale_pending_fee'::text,
      'Venda pendente de taxa. Consumo indisponível.'::text,
      v_sale.id,
      v_item.id,
      v_item.service_id,
      v_item.quantity_total,
      v_item.quantity_used,
      v_item.quantity_remaining;
    RETURN;
  END IF;

  IF v_sale.status <> 'pago' THEN
    INSERT INTO public.service_item_validations (
      company_id,
      sale_id,
      sale_service_item_id,
      service_id,
      validated_by_user_id,
      quantity_used_before,
      quantity_used_after,
      quantity_remaining_before,
      quantity_remaining_after,
      result,
      reason_code,
      detail
    ) VALUES (
      v_item.company_id,
      v_sale.id,
      v_item.id,
      v_item.service_id,
      v_user_id,
      v_item.quantity_used,
      v_item.quantity_used,
      v_item.quantity_remaining,
      v_item.quantity_remaining,
      'blocked',
      'sale_not_paid',
      format('Status atual da venda: %s', v_sale.status)
    );

    RETURN QUERY SELECT
      'blocked'::text,
      'sale_not_paid'::text,
      'Venda pendente de confirmação. Consumo indisponível.'::text,
      v_sale.id,
      v_item.id,
      v_item.service_id,
      v_item.quantity_total,
      v_item.quantity_used,
      v_item.quantity_remaining;
    RETURN;
  END IF;

  IF v_item.status <> 'ativo' THEN
    INSERT INTO public.service_item_validations (
      company_id,
      sale_id,
      sale_service_item_id,
      service_id,
      validated_by_user_id,
      quantity_used_before,
      quantity_used_after,
      quantity_remaining_before,
      quantity_remaining_after,
      result,
      reason_code,
      detail
    ) VALUES (
      v_item.company_id,
      v_sale.id,
      v_item.id,
      v_item.service_id,
      v_user_id,
      v_item.quantity_used,
      v_item.quantity_used,
      v_item.quantity_remaining,
      v_item.quantity_remaining,
      'blocked',
      'item_inactive',
      'Item não está ativo para consumo.'
    );

    RETURN QUERY SELECT
      'blocked'::text,
      'item_inactive'::text,
      'Item inativo para consumo.'::text,
      v_sale.id,
      v_item.id,
      v_item.service_id,
      v_item.quantity_total,
      v_item.quantity_used,
      v_item.quantity_remaining;
    RETURN;
  END IF;

  -- Regra de produto: itens sem validação operacional são informativos no QR e não consumíveis.
  IF v_item.control_type <> 'validacao_obrigatoria' THEN
    INSERT INTO public.service_item_validations (
      company_id,
      sale_id,
      sale_service_item_id,
      service_id,
      validated_by_user_id,
      quantity_used_before,
      quantity_used_after,
      quantity_remaining_before,
      quantity_remaining_after,
      result,
      reason_code,
      detail
    ) VALUES (
      v_item.company_id,
      v_sale.id,
      v_item.id,
      v_item.service_id,
      v_user_id,
      v_item.quantity_used,
      v_item.quantity_used,
      v_item.quantity_remaining,
      v_item.quantity_remaining,
      'blocked',
      'control_not_required',
      'Serviço configurado sem validação operacional.'
    );

    RETURN QUERY SELECT
      'blocked'::text,
      'control_not_required'::text,
      'Serviço sem validação obrigatória não pode ser consumido aqui.'::text,
      v_sale.id,
      v_item.id,
      v_item.service_id,
      v_item.quantity_total,
      v_item.quantity_used,
      v_item.quantity_remaining;
    RETURN;
  END IF;

  IF v_item.quantity_used >= v_item.quantity_total THEN
    INSERT INTO public.service_item_validations (
      company_id,
      sale_id,
      sale_service_item_id,
      service_id,
      validated_by_user_id,
      quantity_used_before,
      quantity_used_after,
      quantity_remaining_before,
      quantity_remaining_after,
      result,
      reason_code,
      detail
    ) VALUES (
      v_item.company_id,
      v_sale.id,
      v_item.id,
      v_item.service_id,
      v_user_id,
      v_item.quantity_used,
      v_item.quantity_used,
      v_item.quantity_remaining,
      v_item.quantity_remaining,
      'blocked',
      'no_balance',
      'Saldo esgotado para consumo.'
    );

    RETURN QUERY SELECT
      'blocked'::text,
      'no_balance'::text,
      'Saldo esgotado para este serviço.'::text,
      v_sale.id,
      v_item.id,
      v_item.service_id,
      v_item.quantity_total,
      v_item.quantity_used,
      v_item.quantity_remaining;
    RETURN;
  END IF;

  UPDATE public.sale_service_items ssi
  SET quantity_used = ssi.quantity_used + 1
  WHERE ssi.id = v_item.id
    AND ssi.status = 'ativo'
    AND ssi.control_type = 'validacao_obrigatoria'
    AND ssi.quantity_used < ssi.quantity_total
  RETURNING ssi.quantity_used, ssi.quantity_remaining
  INTO v_quantity_used_after, v_quantity_remaining_after;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    -- Corrida entre operadores: alguém já consumiu no mesmo instante.
    SELECT ssi.*
    INTO v_item
    FROM public.sale_service_items ssi
    WHERE ssi.id = p_sale_service_item_id
    LIMIT 1;

    INSERT INTO public.service_item_validations (
      company_id,
      sale_id,
      sale_service_item_id,
      service_id,
      validated_by_user_id,
      quantity_used_before,
      quantity_used_after,
      quantity_remaining_before,
      quantity_remaining_after,
      result,
      reason_code,
      detail
    ) VALUES (
      COALESCE(v_item.company_id, v_sale.company_id),
      v_sale.id,
      p_sale_service_item_id,
      v_item.service_id,
      v_user_id,
      v_item.quantity_used,
      v_item.quantity_used,
      v_item.quantity_remaining,
      v_item.quantity_remaining,
      'blocked',
      'concurrent_update_blocked',
      'Consumo não aplicado por concorrência; recarregar saldo.'
    );

    RETURN QUERY SELECT
      'blocked'::text,
      'concurrent_update_blocked'::text,
      'Consumo não aplicado por concorrência. Recarregue o item.'::text,
      v_sale.id,
      v_item.id,
      v_item.service_id,
      v_item.quantity_total,
      v_item.quantity_used,
      v_item.quantity_remaining;
    RETURN;
  END IF;

  INSERT INTO public.service_item_validations (
    company_id,
    sale_id,
    sale_service_item_id,
    service_id,
    validated_by_user_id,
    quantity_consumed,
    quantity_used_before,
    quantity_used_after,
    quantity_remaining_before,
    quantity_remaining_after,
    result,
    reason_code,
    detail
  ) VALUES (
    v_item.company_id,
    v_sale.id,
    v_item.id,
    v_item.service_id,
    v_user_id,
    1,
    v_item.quantity_used,
    v_quantity_used_after,
    v_item.quantity_remaining,
    v_quantity_remaining_after,
    'success',
    'service_item_consumed',
    'Consumo unitário realizado com sucesso.'
  );

  RETURN QUERY SELECT
    'success'::text,
    'service_item_consumed'::text,
    'Consumo unitário realizado com sucesso.'::text,
    v_sale.id,
    v_item.id,
    v_item.service_id,
    v_item.quantity_total,
    v_quantity_used_after,
    v_quantity_remaining_after;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_service_item(uuid, text) TO authenticated;
