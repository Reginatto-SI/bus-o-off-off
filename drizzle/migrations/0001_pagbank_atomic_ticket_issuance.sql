-- Emissão única de passagens: unicidade por venda, trecho, passageiro e lugar
-- (vale também para itens sem poltrona física, onde seat_id é nulo).
CREATE UNIQUE INDEX IF NOT EXISTS tickets_unique_sale_trip_passenger_label
  ON public.tickets (sale_id, trip_id, passenger_cpf, seat_label);

-- Copia o staging para tickets sob trava transacional por venda.
-- Chamadas concorrentes (página, recuperação, webhook futuro, retry) são serializadas;
-- a segunda encontra os tickets já emitidos e não insere nada.
CREATE OR REPLACE FUNCTION public.issue_sale_tickets_from_staging(p_sale_id uuid, p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing integer;
  v_staged integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('issue_sale_tickets:' || p_sale_id::text, 0));

  SELECT count(*) INTO v_existing FROM public.tickets WHERE sale_id = p_sale_id;
  IF v_existing > 0 THEN
    RETURN 'skipped_existing';
  END IF;

  SELECT count(*) INTO v_staged FROM public.sale_passengers
   WHERE sale_id = p_sale_id AND company_id = p_company_id;
  IF v_staged = 0 THEN
    RETURN 'skipped_no_passengers';
  END IF;

  INSERT INTO public.tickets (
    sale_id, trip_id, seat_id, seat_label, passenger_name, passenger_cpf, passenger_phone, company_id,
    ticket_type_id, ticket_type_name, ticket_type_price,
    benefit_program_id, benefit_program_name, benefit_type, benefit_value,
    original_price, discount_amount, final_price, benefit_applied, pricing_rule_version
  )
  SELECT sale_id, trip_id, seat_id, seat_label, passenger_name, passenger_cpf, passenger_phone, p_company_id,
    ticket_type_id, ticket_type_name, ticket_type_price,
    benefit_program_id, benefit_program_name, benefit_type, benefit_value,
    original_price, coalesce(discount_amount, 0), final_price, coalesce(benefit_applied, false),
    coalesce(pricing_rule_version, 'beneficio_checkout_v1')
  FROM public.sale_passengers
  WHERE sale_id = p_sale_id AND company_id = p_company_id
  ORDER BY sort_order
  ON CONFLICT (sale_id, trip_id, passenger_cpf, seat_label) DO NOTHING;

  DELETE FROM public.sale_passengers WHERE sale_id = p_sale_id AND company_id = p_company_id;
  RETURN 'created';
END;
$$;

REVOKE ALL ON FUNCTION public.issue_sale_tickets_from_staging(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_sale_tickets_from_staging(uuid, uuid) TO service_role;