-- Item identity survives staging cleanup; labels/CPF cannot identify repeated items.
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS sale_passenger_id uuid;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS expected_ticket_count integer
  CHECK (expected_ticket_count IS NULL OR expected_ticket_count > 0);
CREATE UNIQUE INDEX IF NOT EXISTS tickets_unique_sale_passenger_id
  ON public.tickets(sale_passenger_id);
DROP INDEX IF EXISTS public.tickets_unique_sale_trip_passenger_label;
-- Keep the previous protection for manual/legacy writers that have no item ID.
CREATE UNIQUE INDEX tickets_unique_sale_trip_passenger_label
  ON public.tickets(sale_id, trip_id, passenger_cpf, seat_label)
  WHERE sale_passenger_id IS NULL;

-- Identity protection is separate from the unchanged physical-occupancy trigger.
CREATE OR REPLACE FUNCTION public.assert_ticket_item_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('issue_sale_tickets:' || NEW.sale_id::text, 0));
  IF NEW.sale_passenger_id IS NULL THEN
    IF (TG_OP='UPDATE' AND OLD.sale_passenger_id IS NOT NULL)
      OR EXISTS (SELECT 1 FROM public.sales s WHERE s.id=NEW.sale_id AND s.expected_ticket_count IS NOT NULL)
      OR EXISTS (SELECT 1 FROM public.tickets t WHERE t.sale_id=NEW.sale_id AND t.sale_passenger_id IS NOT NULL)
    THEN RAISE EXCEPTION 'ticket_item_identity_required'; END IF;
  ELSE
    IF TG_OP='INSERT' AND EXISTS (SELECT 1 FROM public.tickets t
      WHERE t.sale_id=NEW.sale_id AND t.sale_passenger_id IS NULL)
    THEN RAISE EXCEPTION 'ticket_legacy_mapping_required'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.sale_passengers p JOIN public.sales s ON s.id=p.sale_id
      WHERE p.id=NEW.sale_passenger_id AND p.sale_id=NEW.sale_id
        AND p.company_id=NEW.company_id AND s.company_id=NEW.company_id AND s.status='pago'
        AND p.trip_id=NEW.trip_id AND p.seat_id IS NOT DISTINCT FROM NEW.seat_id
        AND p.seat_label=NEW.seat_label AND p.passenger_cpf=NEW.passenger_cpf
        AND p.passenger_name=NEW.passenger_name
    ) THEN RAISE EXCEPTION 'ticket_item_identity_mismatch'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.assert_ticket_item_identity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_assert_item_identity
  BEFORE INSERT OR UPDATE OF sale_passenger_id, sale_id, company_id, trip_id, seat_id, seat_label, passenger_cpf
  ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.assert_ticket_item_identity();

CREATE OR REPLACE FUNCTION public.issue_sale_tickets_from_staging(p_sale_id uuid, p_company_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_expected integer;
  v_staged integer;
  v_existing integer;
  v_item record;
  v_match uuid;
  v_matches integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('issue_sale_tickets:' || p_sale_id::text, 0));
  SELECT expected_ticket_count INTO v_expected FROM public.sales
    WHERE id=p_sale_id AND company_id=p_company_id AND status='pago' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ticket_sale_not_paid_or_wrong_company'; END IF;
  -- Freeze the staging rows used by this transaction.
  PERFORM id FROM public.sale_passengers WHERE sale_id=p_sale_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.sale_passengers WHERE sale_id=p_sale_id AND company_id<>p_company_id)
    OR EXISTS (SELECT 1 FROM public.tickets WHERE sale_id=p_sale_id AND company_id<>p_company_id)
  THEN RAISE EXCEPTION 'ticket_company_mismatch'; END IF;
  SELECT count(*) INTO v_staged FROM public.sale_passengers WHERE sale_id=p_sale_id;
  SELECT count(*) INTO v_existing FROM public.tickets WHERE sale_id=p_sale_id;
  IF v_staged=0 THEN
    IF v_expected IS NOT NULL AND v_existing<>v_expected THEN
      RAISE EXCEPTION 'ticket_manifest_missing_or_incomplete';
    END IF;
    -- Legacy completed sales have no recoverable manifest; do not invent items.
    RETURN CASE WHEN v_existing>0 THEN 'skipped_existing' ELSE 'skipped_no_passengers' END;
  END IF;
  IF v_expected IS NOT NULL AND v_expected<>v_staged THEN
    RAISE EXCEPTION 'ticket_expected_count_mismatch';
  END IF;

  -- Bind historical tickets only when the staging correspondence is unambiguous.
  FOR v_item IN SELECT * FROM public.tickets WHERE sale_id=p_sale_id AND sale_passenger_id IS NULL LOOP
    SELECT count(*), (array_agg(id))[1] INTO v_matches,v_match
      FROM public.sale_passengers p WHERE p.sale_id=p_sale_id
        AND p.trip_id=v_item.trip_id AND p.passenger_cpf=v_item.passenger_cpf
        AND p.seat_label=v_item.seat_label AND p.seat_id IS NOT DISTINCT FROM v_item.seat_id
        AND p.passenger_name=v_item.passenger_name
        AND p.final_price IS NOT DISTINCT FROM v_item.final_price
        AND p.passenger_phone IS NOT DISTINCT FROM v_item.passenger_phone
        AND p.ticket_type_id IS NOT DISTINCT FROM v_item.ticket_type_id
        AND p.ticket_type_name IS NOT DISTINCT FROM v_item.ticket_type_name
        AND p.ticket_type_price IS NOT DISTINCT FROM v_item.ticket_type_price
        AND p.benefit_program_id IS NOT DISTINCT FROM v_item.benefit_program_id
        AND p.benefit_program_name IS NOT DISTINCT FROM v_item.benefit_program_name
        AND p.benefit_type IS NOT DISTINCT FROM v_item.benefit_type
        AND p.benefit_value IS NOT DISTINCT FROM v_item.benefit_value
        AND p.original_price IS NOT DISTINCT FROM v_item.original_price
        AND coalesce(p.discount_amount,0)=coalesce(v_item.discount_amount,0)
        AND coalesce(p.benefit_applied,false)=coalesce(v_item.benefit_applied,false)
        AND coalesce(p.pricing_rule_version,'beneficio_checkout_v1')=coalesce(v_item.pricing_rule_version,'beneficio_checkout_v1');
    IF v_matches<>1 THEN RAISE EXCEPTION 'ticket_legacy_mapping_ambiguous'; END IF;
    UPDATE public.tickets SET sale_passenger_id=v_match WHERE id=v_item.id;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.tickets t WHERE t.sale_id=p_sale_id AND NOT EXISTS
    (SELECT 1 FROM public.sale_passengers p WHERE p.id=t.sale_passenger_id AND p.sale_id=t.sale_id
      AND p.company_id=t.company_id AND p.trip_id=t.trip_id AND p.passenger_cpf=t.passenger_cpf
      AND p.seat_label=t.seat_label AND p.seat_id IS NOT DISTINCT FROM t.seat_id
      AND p.passenger_name=t.passenger_name AND p.final_price IS NOT DISTINCT FROM t.final_price
        AND p.passenger_phone IS NOT DISTINCT FROM t.passenger_phone
        AND p.ticket_type_id IS NOT DISTINCT FROM t.ticket_type_id
        AND p.ticket_type_name IS NOT DISTINCT FROM t.ticket_type_name
        AND p.ticket_type_price IS NOT DISTINCT FROM t.ticket_type_price
        AND p.benefit_program_id IS NOT DISTINCT FROM t.benefit_program_id
        AND p.benefit_program_name IS NOT DISTINCT FROM t.benefit_program_name
        AND p.benefit_type IS NOT DISTINCT FROM t.benefit_type
        AND p.benefit_value IS NOT DISTINCT FROM t.benefit_value
        AND p.original_price IS NOT DISTINCT FROM t.original_price
        AND coalesce(p.discount_amount,0)=coalesce(t.discount_amount,0)
        AND coalesce(p.benefit_applied,false)=coalesce(t.benefit_applied,false)
        AND coalesce(p.pricing_rule_version,'beneficio_checkout_v1')=coalesce(t.pricing_rule_version,'beneficio_checkout_v1')))
  THEN RAISE EXCEPTION 'ticket_item_mismatch'; END IF;

  INSERT INTO public.tickets (
    sale_passenger_id, sale_id, trip_id, seat_id, seat_label, passenger_name, passenger_cpf, passenger_phone, company_id,
    ticket_type_id, ticket_type_name, ticket_type_price,
    benefit_program_id, benefit_program_name, benefit_type, benefit_value,
    original_price, discount_amount, final_price, benefit_applied, pricing_rule_version
  )
  SELECT id, sale_id, trip_id, seat_id, seat_label, passenger_name, passenger_cpf, passenger_phone, p_company_id,
    ticket_type_id, ticket_type_name, ticket_type_price,
    benefit_program_id, benefit_program_name, benefit_type, benefit_value,
    original_price, coalesce(discount_amount, 0), final_price, coalesce(benefit_applied, false),
    coalesce(pricing_rule_version, 'beneficio_checkout_v1')
  FROM public.sale_passengers p
  WHERE p.sale_id = p_sale_id AND p.company_id = p_company_id
    AND NOT EXISTS (SELECT 1 FROM public.tickets t WHERE t.sale_passenger_id=p.id)
  ORDER BY p.sort_order;


  IF EXISTS (SELECT 1 FROM public.sale_passengers p WHERE p.sale_id=p_sale_id AND NOT EXISTS
    (SELECT 1 FROM public.tickets t WHERE t.sale_passenger_id=p.id AND t.sale_id=p.sale_id AND t.company_id=p.company_id))
    OR (SELECT count(*) FROM public.tickets WHERE sale_id=p_sale_id)<>v_staged
  THEN RAISE EXCEPTION 'ticket_issuance_incomplete'; END IF;
  UPDATE public.sales SET expected_ticket_count=v_staged WHERE id=p_sale_id AND company_id=p_company_id;
  DELETE FROM public.sale_passengers WHERE sale_id=p_sale_id AND company_id=p_company_id;
  RETURN CASE WHEN v_existing=v_staged THEN 'skipped_existing' ELSE 'created' END;
END $$;
REVOKE ALL ON FUNCTION public.issue_sale_tickets_from_staging(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_sale_tickets_from_staging(uuid,uuid) TO service_role;

-- Paid staging is a durable recovery queue, independent of the Order age.
CREATE OR REPLACE FUNCTION public.pagbank_paid_sales_needing_tickets(p_limit integer DEFAULT 20)
RETURNS TABLE(sale_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT s.id FROM public.sales s WHERE s.payment_gateway='pagbank' AND s.status='pago'
    AND (EXISTS (SELECT 1 FROM public.sale_passengers p WHERE p.sale_id=s.id)
      OR (s.expected_ticket_count IS NOT NULL AND s.expected_ticket_count<>(SELECT count(*) FROM public.tickets t WHERE t.sale_id=s.id)))
  ORDER BY (SELECT max(a.last_queried_at) FROM public.payment_attempts a WHERE a.sale_id=s.id AND a.gateway='pagbank') NULLS FIRST,s.id LIMIT least(greatest(p_limit,1),200)
$$;
REVOKE ALL ON FUNCTION public.pagbank_paid_sales_needing_tickets(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pagbank_paid_sales_needing_tickets(integer) TO service_role;
