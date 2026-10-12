CREATE TABLE public.manual_sale_requests (
 company_id uuid NOT NULL REFERENCES public.companies(id), request_key uuid NOT NULL,
 request_hash text NOT NULL, sale_id uuid NOT NULL UNIQUE REFERENCES public.sales(id),
 actor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(company_id,request_key)
);
ALTER TABLE public.manual_sale_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manual_sale_requests FROM anon,authenticated;
GRANT ALL ON public.manual_sale_requests TO service_role;
CREATE OR REPLACE FUNCTION public.register_manual_sale(p_request_key uuid,p_request_hash text,p_actor_id uuid,p_sale jsonb,p_passengers jsonb,p_operation jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_sale uuid; v_company uuid:=(p_sale->>'company_id')::uuid; v_request record; v_p jsonb; v_row public.sale_passengers%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('manual_register:'||v_company||':'||p_request_key,0));
 SELECT * INTO v_request FROM public.manual_sale_requests WHERE company_id=v_company AND request_key=p_request_key;
 IF FOUND THEN
  IF v_request.request_hash<>p_request_hash THEN RAISE EXCEPTION 'manual_request_payload_changed'; END IF;
  RETURN v_request.sale_id;
 END IF;
 IF jsonb_array_length(p_passengers)=0 OR NOT EXISTS(SELECT 1 FROM public.companies WHERE id=v_company AND manual_fee_flow_enabled)
 THEN RAISE EXCEPTION 'manual_flow_disabled_or_empty'; END IF;
 INSERT INTO public.sales(company_id,event_id,trip_id,boarding_location_id,customer_name,customer_cpf,customer_phone,quantity,unit_price,gross_amount,benefit_total_discount,seller_id,sale_origin,status,payment_gateway,payment_environment,platform_fee_status,platform_fee_amount,reservation_expires_at,expected_ticket_count)
 VALUES(v_company,(p_sale->>'event_id')::uuid,(p_sale->>'trip_id')::uuid,(p_sale->>'boarding_location_id')::uuid,p_sale->>'customer_name',p_sale->>'customer_cpf',p_sale->>'customer_phone',
 (p_sale->>'quantity')::integer,(p_sale->>'unit_price')::numeric,(p_sale->>'gross_amount')::numeric,(p_sale->>'benefit_total_discount')::numeric,(p_sale->>'seller_id')::uuid,
 'admin_manual','reservado',p_sale->>'payment_gateway',p_sale->>'payment_environment',CASE WHEN (p_operation->>'amount_cents')::integer=0 THEN 'not_applicable' ELSE 'pending' END,
 (p_operation->>'amount_cents')::numeric/100,(p_sale->>'reservation_expires_at')::timestamptz,jsonb_array_length(p_passengers)) RETURNING id INTO v_sale;
 FOR v_p IN SELECT value FROM jsonb_array_elements(p_passengers) LOOP
  v_row:=jsonb_populate_record(NULL::public.sale_passengers,v_p||jsonb_build_object('sale_id',v_sale,'company_id',v_company));
  INSERT INTO public.sale_passengers(id,sale_id,company_id,trip_id,seat_id,seat_label,passenger_name,passenger_cpf,passenger_phone,sort_order,ticket_type_id,ticket_type_name,ticket_type_price,benefit_program_id,benefit_program_name,benefit_type,benefit_value,original_price,discount_amount,final_price,benefit_applied,pricing_rule_version)
  VALUES(v_row.id,v_sale,v_company,v_row.trip_id,v_row.seat_id,v_row.seat_label,v_row.passenger_name,v_row.passenger_cpf,v_row.passenger_phone,v_row.sort_order,v_row.ticket_type_id,v_row.ticket_type_name,v_row.ticket_type_price,v_row.benefit_program_id,v_row.benefit_program_name,v_row.benefit_type,v_row.benefit_value,v_row.original_price,v_row.discount_amount,v_row.final_price,v_row.benefit_applied,v_row.pricing_rule_version);
 END LOOP;
 INSERT INTO public.platform_fee_operations(sale_id,company_id,gateway,environment,issuer_account_id,amount_cents,reference,idempotency_key,snapshot,state)
 VALUES(v_sale,v_company,p_operation->>'gateway',p_operation->>'environment',p_operation->>'issuer_account_id',(p_operation->>'amount_cents')::integer,
 'platform_fee_'||v_sale,'manual_fee_'||v_sale,(p_operation->'snapshot')||jsonb_build_object('items',p_passengers),CASE WHEN (p_operation->>'amount_cents')::integer=0 THEN 'exempt' ELSE 'prepared' END);
 INSERT INTO public.manual_sale_requests VALUES(v_company,p_request_key,p_request_hash,v_sale,p_actor_id,now());
 RETURN v_sale;
END $$;
REVOKE ALL ON FUNCTION public.register_manual_sale(uuid,text,uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_manual_sale(uuid,text,uuid,jsonb,jsonb,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.finalize_manual_sale(p_operation_id uuid) RETURNS text
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_op public.platform_fee_operations%ROWTYPE; v_sale public.sales%ROWTYPE; v_result text; v_item jsonb; v_expected public.sale_passengers%ROWTYPE; v_actual public.sale_passengers%ROWTYPE;
BEGIN
 SELECT * INTO v_op FROM public.platform_fee_operations WHERE id=p_operation_id;
 IF NOT FOUND OR v_op.state NOT IN ('confirmed','exempt') THEN RAISE EXCEPTION 'manual_fee_not_confirmed'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('issue_sale_tickets:'||v_op.sale_id,0));
 SELECT * INTO v_sale FROM public.sales WHERE id=v_op.sale_id AND company_id=v_op.company_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'manual_sale_missing'; END IF;
 IF v_sale.status='cancelado' THEN RETURN 'late_payment_review'; END IF;
 IF v_sale.status NOT IN ('reservado','pendente_pagamento','pago') THEN RAISE EXCEPTION 'manual_sale_not_eligible'; END IF;
 IF EXISTS(SELECT 1 FROM public.sale_passengers WHERE sale_id=v_op.sale_id) THEN
  IF jsonb_typeof(v_op.snapshot->'items') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'manual_manifest_missing'; END IF;
  IF jsonb_array_length(v_op.snapshot->'items')<>(SELECT count(*) FROM public.sale_passengers WHERE sale_id=v_op.sale_id)
  THEN RAISE EXCEPTION 'manual_manifest_changed'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_op.snapshot->'items') LOOP
   v_expected:=jsonb_populate_record(NULL::public.sale_passengers,v_item||jsonb_build_object('sale_id',v_op.sale_id,'company_id',v_op.company_id));
   SELECT * INTO v_actual FROM public.sale_passengers WHERE id=v_expected.id AND sale_id=v_op.sale_id;
   IF NOT FOUND OR ROW(v_actual.id,v_actual.trip_id,v_actual.seat_id,v_actual.seat_label,v_actual.passenger_name,v_actual.passenger_cpf,v_actual.passenger_phone,v_actual.sort_order,v_actual.ticket_type_id,v_actual.ticket_type_name,v_actual.ticket_type_price,v_actual.benefit_program_id,v_actual.benefit_program_name,v_actual.benefit_type,v_actual.benefit_value,v_actual.original_price,v_actual.discount_amount,v_actual.final_price,v_actual.benefit_applied,v_actual.pricing_rule_version) IS DISTINCT FROM ROW(v_expected.id,v_expected.trip_id,v_expected.seat_id,v_expected.seat_label,v_expected.passenger_name,v_expected.passenger_cpf,v_expected.passenger_phone,v_expected.sort_order,v_expected.ticket_type_id,v_expected.ticket_type_name,v_expected.ticket_type_price,v_expected.benefit_program_id,v_expected.benefit_program_name,v_expected.benefit_type,v_expected.benefit_value,v_expected.original_price,v_expected.discount_amount,v_expected.final_price,v_expected.benefit_applied,v_expected.pricing_rule_version)
   THEN RAISE EXCEPTION 'manual_manifest_changed'; END IF;
  END LOOP;
 END IF;
 UPDATE public.sales SET status='pago',platform_fee_status=CASE WHEN v_op.state='exempt' THEN 'not_applicable' ELSE 'paid' END,
 platform_fee_amount=v_op.amount_cents::numeric/100,platform_fee_total=v_op.amount_cents::numeric/100,
 platform_fee_paid_at=CASE WHEN v_op.state='confirmed' THEN v_op.confirmed_at ELSE NULL END,
 payment_confirmed_at=coalesce(payment_confirmed_at,v_op.confirmed_at,now()),reservation_expires_at=NULL
 WHERE id=v_op.sale_id AND company_id=v_op.company_id;
 v_result:=public.issue_sale_tickets_from_staging(v_op.sale_id,v_op.company_id);
 IF NOT EXISTS(SELECT 1 FROM public.sales s WHERE s.id=v_op.sale_id AND s.expected_ticket_count IS NOT NULL
  AND s.expected_ticket_count=(SELECT count(*) FROM public.tickets t WHERE t.sale_id=s.id AND t.company_id=s.company_id))
 THEN RAISE EXCEPTION 'manual_ticket_integrity_failed'; END IF;
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.finalize_manual_sale(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_manual_sale(uuid) TO service_role;
