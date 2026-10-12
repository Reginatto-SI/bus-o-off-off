CREATE TABLE public.platform_fee_allocations (
 operation_id uuid NOT NULL REFERENCES public.platform_fee_operations(id),
 company_id uuid NOT NULL REFERENCES public.companies(id),
 kind text NOT NULL CHECK(kind IN ('marketplace','socio','representative')),
 beneficiary_id text NOT NULL, destination text NOT NULL,
 amount_cents integer NOT NULL CHECK(amount_cents>0),
 native_requested boolean NOT NULL DEFAULT false,
 state text NOT NULL CHECK(state IN ('retained','pending_reconciliation','settled')),
 evidence jsonb, PRIMARY KEY(operation_id,kind)
);
ALTER TABLE public.platform_fee_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_fee_allocations FROM anon,authenticated;
GRANT SELECT ON public.platform_fee_allocations TO authenticated;
GRANT ALL ON public.platform_fee_allocations TO service_role;
CREATE POLICY manual_fee_allocations_company_read ON public.platform_fee_allocations FOR SELECT TO authenticated
 USING(public.user_belongs_to_company(auth.uid(),company_id));
CREATE OR REPLACE FUNCTION public.record_manual_fee_allocations(p_operation_id uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_op public.platform_fee_operations%ROWTYPE; v_a jsonb; v_total integer:=0;
BEGIN
 SELECT * INTO v_op FROM public.platform_fee_operations WHERE id=p_operation_id;
 IF NOT FOUND OR v_op.state NOT IN ('confirmed','exempt') THEN RAISE EXCEPTION 'manual_fee_not_confirmed'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('manual_fee_ledger:'||p_operation_id,0));
 FOR v_a IN SELECT value FROM jsonb_array_elements(v_op.snapshot->'allocations') LOOP
  v_total:=v_total+(v_a->>'amount_cents')::integer;
  IF (v_a->>'amount_cents')::integer>0 THEN
   INSERT INTO public.platform_fee_allocations(operation_id,company_id,kind,beneficiary_id,destination,amount_cents,native_requested,state)
   VALUES(v_op.id,v_op.company_id,v_a->>'kind',v_a->>'beneficiary_id',v_a->>'destination',(v_a->>'amount_cents')::integer,
    coalesce((v_op.presentation->'native_destinations') ? (v_a->>'destination'),false),CASE WHEN v_a->>'kind'='marketplace' THEN 'retained' ELSE 'pending_reconciliation' END)
   ON CONFLICT(operation_id,kind) DO NOTHING;
  END IF;
 END LOOP;
 IF v_total<>v_op.amount_cents THEN RAISE EXCEPTION 'manual_fee_allocation_sum_mismatch'; END IF;
 -- Project the exact manual entitlement, without rewriting the existing/public RPC.
 INSERT INTO public.representative_commissions(company_id,representative_id,sale_id,payment_environment,base_amount,commission_percent,commission_amount,status,blocked_reason)
 SELECT a.company_id,a.beneficiary_id::uuid,v_op.sale_id,v_op.environment,coalesce(s.gross_amount,0),
 CASE WHEN s.gross_amount>0 THEN round((a.amount_cents::numeric/100)/s.gross_amount*100,2) ELSE 0 END,
 a.amount_cents::numeric/100,'bloqueada','manual_fee_pending_reconciliation'
 FROM public.platform_fee_allocations a JOIN public.sales s ON s.id=v_op.sale_id
 JOIN public.representatives r ON r.id=CASE WHEN a.kind='representative' THEN a.beneficiary_id::uuid ELSE NULL END
 WHERE a.operation_id=v_op.id AND a.kind='representative'
 ON CONFLICT(sale_id) DO NOTHING;
 UPDATE public.platform_fee_allocations a SET evidence=coalesce(evidence,'{}')||'{"commission_projection":"review_conflict"}'::jsonb
 WHERE a.operation_id=v_op.id AND a.kind='representative' AND EXISTS
 (SELECT 1 FROM public.representative_commissions c WHERE c.sale_id=v_op.sale_id AND c.commission_amount<>a.amount_cents::numeric/100);

 IF EXISTS(SELECT 1 FROM public.platform_fee_allocations a WHERE a.operation_id=v_op.id AND NOT EXISTS
  (SELECT 1 FROM jsonb_array_elements(v_op.snapshot->'allocations') j WHERE j->>'kind'=a.kind AND j->>'beneficiary_id'=a.beneficiary_id AND (j->>'amount_cents')::integer=a.amount_cents))
 THEN RAISE EXCEPTION 'manual_fee_allocation_immutable'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.record_manual_fee_allocations(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_manual_fee_allocations(uuid) TO service_role;
-- Protect managed sales from client-written financial states and unsafe cancellation.
CREATE OR REPLACE FUNCTION public.guard_managed_manual_sale() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_state text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('issue_sale_tickets:'||OLD.id,0));
 SELECT state INTO v_state FROM public.platform_fee_operations WHERE sale_id=OLD.id;
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF ROW(NEW.quantity,NEW.unit_price,NEW.gross_amount,NEW.benefit_total_discount,NEW.event_id,NEW.trip_id) IS DISTINCT FROM ROW(OLD.quantity,OLD.unit_price,OLD.gross_amount,OLD.benefit_total_discount,OLD.event_id,OLD.trip_id) THEN RAISE EXCEPTION 'manual_sale_snapshot_immutable'; END IF;
 IF current_setting('role',true) IN ('anon','authenticated') AND
  (NEW.status='pago' AND OLD.status IS DISTINCT FROM 'pago'
   OR ROW(NEW.platform_fee_status,NEW.platform_fee_amount,NEW.platform_fee_total,NEW.platform_fee_paid_at,NEW.payment_confirmed_at,NEW.expected_ticket_count)
   IS DISTINCT FROM ROW(OLD.platform_fee_status,OLD.platform_fee_amount,OLD.platform_fee_total,OLD.platform_fee_paid_at,OLD.payment_confirmed_at,OLD.expected_ticket_count))
 THEN RAISE EXCEPTION 'manual_financial_state_backend_only'; END IF;
 IF NEW.status='cancelado' AND OLD.status IN ('reservado','pendente_pagamento') AND v_state NOT IN ('prepared','terminal')
 THEN RAISE EXCEPTION 'manual_fee_cancellation_unsafe'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_managed_manual_sale BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.guard_managed_manual_sale();
CREATE OR REPLACE FUNCTION public.guard_managed_manual_ticket() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- session_user is the server role under PostgREST; caller JWT role survives SECURITY DEFINER.
 IF current_setting('role',true) IN ('anon','authenticated')
 AND EXISTS(SELECT 1 FROM public.platform_fee_operations WHERE sale_id=NEW.sale_id)
 THEN RAISE EXCEPTION 'manual_ticket_backend_only'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_managed_manual_ticket BEFORE INSERT ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.guard_managed_manual_ticket();
CREATE OR REPLACE FUNCTION public.claim_manual_fee_creation(p_id uuid) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_sale uuid; v_status text;
BEGIN
 SELECT sale_id INTO v_sale FROM public.platform_fee_operations WHERE id=p_id;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('issue_sale_tickets:'||v_sale,0));
 SELECT status INTO v_status FROM public.sales WHERE id=v_sale FOR UPDATE;
 IF v_status NOT IN ('reservado','pendente_pagamento') THEN RETURN false; END IF;
 UPDATE public.platform_fee_operations SET state='creating' WHERE id=p_id AND state='prepared';
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.claim_manual_fee_creation(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_manual_fee_creation(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.expire_unpaid_manual_sale(p_sale_id uuid) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_state text; v_status text; v_expiry timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('issue_sale_tickets:'||p_sale_id,0));
 SELECT status,reservation_expires_at INTO v_status,v_expiry FROM public.sales WHERE id=p_sale_id FOR UPDATE;
 SELECT state INTO v_state FROM public.platform_fee_operations WHERE sale_id=p_sale_id;
 IF NOT FOUND OR v_status<>'reservado' OR v_expiry IS NULL OR v_expiry>=now() OR v_state NOT IN ('prepared','terminal') THEN RETURN false; END IF;
 UPDATE public.sales SET status='cancelado',reservation_expires_at=NULL WHERE id=p_sale_id;
 -- Preserve staging, payment evidence and issued tickets for audit/recovery.
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.expire_unpaid_manual_sale(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_manual_sale(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_manual_sale(p_operation_id uuid) RETURNS text
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_op public.platform_fee_operations%ROWTYPE; v_sale public.sales%ROWTYPE; v_result text; v_item jsonb; v_expected public.sale_passengers%ROWTYPE; v_actual public.sale_passengers%ROWTYPE;
BEGIN
 SELECT * INTO v_op FROM public.platform_fee_operations WHERE id=p_operation_id;
 IF NOT FOUND OR v_op.state NOT IN ('confirmed','exempt') THEN RAISE EXCEPTION 'manual_fee_not_confirmed'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('issue_sale_tickets:'||v_op.sale_id,0));
 SELECT * INTO v_sale FROM public.sales WHERE id=v_op.sale_id AND company_id=v_op.company_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'manual_sale_missing'; END IF;
 IF v_sale.status='cancelado' THEN
  PERFORM public.record_manual_fee_allocations(v_op.id);
  RETURN 'late_payment_review';
 END IF;
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
 platform_net_amount=(SELECT coalesce(sum((a->>'amount_cents')::numeric),0)/100 FROM jsonb_array_elements(v_op.snapshot->'allocations') a WHERE a->>'kind'='marketplace'),
 split_snapshot_platform_fee_total=v_op.amount_cents::numeric/100,
 split_snapshot_socio_fee_amount=(SELECT coalesce(sum((a->>'amount_cents')::numeric),0)/100 FROM jsonb_array_elements(v_op.snapshot->'allocations') a WHERE a->>'kind'='socio'),
 split_snapshot_platform_net_amount=(SELECT coalesce(sum((a->>'amount_cents')::numeric),0)/100 FROM jsonb_array_elements(v_op.snapshot->'allocations') a WHERE a->>'kind'='marketplace'),
 split_snapshot_source='manual_fee_common',split_snapshot_captured_at=v_op.created_at,

 platform_fee_paid_at=CASE WHEN v_op.state='confirmed' THEN v_op.confirmed_at ELSE NULL END,
 payment_confirmed_at=coalesce(payment_confirmed_at,v_op.confirmed_at,now()),reservation_expires_at=NULL
 WHERE id=v_op.sale_id AND company_id=v_op.company_id;
 v_result:=public.issue_sale_tickets_from_staging(v_op.sale_id,v_op.company_id);
 IF NOT EXISTS(SELECT 1 FROM public.sales s WHERE s.id=v_op.sale_id AND s.expected_ticket_count IS NOT NULL
  AND s.expected_ticket_count=(SELECT count(*) FROM public.tickets t WHERE t.sale_id=s.id AND t.company_id=s.company_id))
 THEN RAISE EXCEPTION 'manual_ticket_integrity_failed'; END IF;
 PERFORM public.record_manual_fee_allocations(v_op.id);
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.finalize_manual_sale(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_manual_sale(uuid) TO service_role;
ALTER TABLE public.platform_fee_operations ADD COLUMN review_required boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.manual_fee_recovery_candidates(p_limit integer DEFAULT 20)
 RETURNS TABLE(sale_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT o.sale_id FROM public.platform_fee_operations o JOIN public.sales s ON s.id=o.sale_id
 WHERE NOT o.review_required AND (
  o.state IN ('creating','pending','indeterminate')
  OR (o.state IN ('prepared','terminal') AND s.status='reservado' AND s.reservation_expires_at<now())
  OR (o.state IN ('confirmed','exempt') AND (s.status IN ('reservado','pendente_pagamento','cancelado')
   OR (s.status='pago' AND s.expected_ticket_count<>(SELECT count(*) FROM public.tickets t WHERE t.sale_id=s.id)))))
 ORDER BY o.last_queried_at NULLS FIRST,o.created_at LIMIT least(greatest(p_limit,1),100)
$$;
REVOKE ALL ON FUNCTION public.manual_fee_recovery_candidates(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.manual_fee_recovery_candidates(integer) TO service_role;
