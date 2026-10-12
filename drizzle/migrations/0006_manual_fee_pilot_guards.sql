-- Pilot flags are operational gates, not editable company preferences.
CREATE FUNCTION public.can_read_manual_fee_company(p_company_id uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid()
  AND (r.role::text='developer' OR (r.role::text='gerente' AND r.company_id=p_company_id)))
$$;
REVOKE ALL ON FUNCTION public.can_read_manual_fee_company(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_read_manual_fee_company(uuid) TO authenticated,service_role;
DROP POLICY manual_fee_company_read ON public.platform_fee_operations;
CREATE POLICY manual_fee_company_read ON public.platform_fee_operations FOR SELECT TO authenticated
 USING(public.can_read_manual_fee_company(company_id));
DROP POLICY manual_fee_allocations_company_read ON public.platform_fee_allocations;
CREATE POLICY manual_fee_allocations_company_read ON public.platform_fee_allocations FOR SELECT TO authenticated
 USING(public.can_read_manual_fee_company(company_id));

CREATE FUNCTION public.guard_manual_fee_pilot_flags() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF current_setting('role',true) IN ('anon','authenticated') AND
  ((TG_OP='INSERT' AND (NEW.manual_fee_flow_enabled OR NEW.manual_fee_pagbank_sandbox_enabled))
   OR (TG_OP='UPDATE' AND ROW(NEW.manual_fee_flow_enabled,NEW.manual_fee_pagbank_sandbox_enabled)
    IS DISTINCT FROM ROW(OLD.manual_fee_flow_enabled,OLD.manual_fee_pagbank_sandbox_enabled)))
 THEN RAISE EXCEPTION 'manual_fee_pilot_backend_only'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_manual_fee_pilot_flags BEFORE INSERT OR UPDATE ON public.companies
 FOR EACH ROW EXECUTE FUNCTION public.guard_manual_fee_pilot_flags();

-- A beneficiary/configuration change during preparation rolls the registration
-- back rather than producing a sale and economic snapshot with different owners.
CREATE FUNCTION public.assert_manual_fee_sale_snapshot() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_sale public.sales%ROWTYPE;
BEGIN
 SELECT * INTO v_sale FROM public.sales WHERE id=NEW.sale_id;
 IF v_sale.representative_id IS DISTINCT FROM (NEW.snapshot->>'representative_id')::uuid
  OR v_sale.payment_gateway IS DISTINCT FROM NEW.gateway
 THEN RAISE EXCEPTION 'manual_sale_decision_changed'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assert_manual_fee_sale_snapshot BEFORE INSERT ON public.platform_fee_operations
 FOR EACH ROW EXECUTE FUNCTION public.assert_manual_fee_sale_snapshot();

CREATE OR REPLACE FUNCTION public.guard_managed_manual_sale() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_state text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('issue_sale_tickets:'||OLD.id,0));
 SELECT state INTO v_state FROM public.platform_fee_operations WHERE sale_id=OLD.id;
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF ROW(NEW.company_id,NEW.payment_gateway,NEW.payment_environment,NEW.sale_origin,NEW.representative_id,NEW.expected_ticket_count,
  NEW.quantity,NEW.unit_price,NEW.gross_amount,NEW.benefit_total_discount,NEW.event_id,NEW.trip_id)
 IS DISTINCT FROM ROW(OLD.company_id,OLD.payment_gateway,OLD.payment_environment,OLD.sale_origin,OLD.representative_id,OLD.expected_ticket_count,
  OLD.quantity,OLD.unit_price,OLD.gross_amount,OLD.benefit_total_discount,OLD.event_id,OLD.trip_id)
 THEN RAISE EXCEPTION 'manual_sale_snapshot_immutable'; END IF;
 IF NEW.status='pago' AND v_state NOT IN ('confirmed','exempt')
 THEN RAISE EXCEPTION 'manual_fee_not_confirmed'; END IF;
 IF current_setting('role',true) IN ('anon','authenticated') AND
  ((NEW.status='pago' AND OLD.status IS DISTINCT FROM 'pago')
   OR ROW(NEW.platform_fee_status,NEW.platform_fee_amount,NEW.platform_fee_total,NEW.platform_fee_paid_at,NEW.payment_confirmed_at)
    IS DISTINCT FROM ROW(OLD.platform_fee_status,OLD.platform_fee_amount,OLD.platform_fee_total,OLD.platform_fee_paid_at,OLD.payment_confirmed_at))
 THEN RAISE EXCEPTION 'manual_financial_state_backend_only'; END IF;
 IF NEW.status='cancelado' AND OLD.status IN ('reservado','pendente_pagamento') AND v_state NOT IN ('prepared','terminal')
 THEN RAISE EXCEPTION 'manual_fee_cancellation_unsafe'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_managed_manual_ticket() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old_sale uuid;
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') THEN v_old_sale:=OLD.sale_id; END IF;
 IF current_setting('role',true) IN ('anon','authenticated') AND EXISTS
  (SELECT 1 FROM public.platform_fee_operations WHERE sale_id=v_old_sale OR (TG_OP<>'DELETE' AND sale_id=NEW.sale_id))
 THEN RAISE EXCEPTION 'manual_ticket_backend_only'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER guard_managed_manual_ticket ON public.tickets;
CREATE TRIGGER guard_managed_manual_ticket BEFORE INSERT OR UPDATE OR DELETE ON public.tickets
 FOR EACH ROW EXECUTE FUNCTION public.guard_managed_manual_ticket();

CREATE FUNCTION public.guard_managed_manual_staging() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old_sale uuid;
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') THEN v_old_sale:=OLD.sale_id; END IF;
 IF current_setting('role',true) IN ('anon','authenticated') AND EXISTS
  (SELECT 1 FROM public.platform_fee_operations WHERE sale_id=v_old_sale OR (TG_OP<>'DELETE' AND sale_id=NEW.sale_id))
 THEN RAISE EXCEPTION 'manual_staging_backend_only'; END IF;
 IF TG_OP='DELETE' AND EXISTS(SELECT 1 FROM public.platform_fee_operations WHERE sale_id=v_old_sale)
 AND NOT EXISTS(SELECT 1 FROM public.sales s JOIN public.platform_fee_operations o ON o.sale_id=s.id
  WHERE s.id=v_old_sale AND s.status='pago' AND o.state IN ('confirmed','exempt')
   AND s.expected_ticket_count=(SELECT count(*) FROM public.tickets t WHERE t.sale_id=s.id AND t.company_id=s.company_id))
 THEN RAISE EXCEPTION 'manual_staging_retention_required'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_managed_manual_staging BEFORE INSERT OR UPDATE OR DELETE ON public.sale_passengers
 FOR EACH ROW EXECUTE FUNCTION public.guard_managed_manual_staging();

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
 CASE WHEN s.gross_amount>0 THEN least(100,round((a.amount_cents::numeric/100)/s.gross_amount*100,2)) ELSE 0 END,
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

-- The legacy percent column is bounded to 100. The fee minimum can make the
-- entitlement exceed the passenger fare; the absolute allocation remains final.
CREATE FUNCTION public.guard_manual_commission_projection() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_op uuid; v_amount integer; v_ratio numeric;
BEGIN
 SELECT id INTO v_op FROM public.platform_fee_operations WHERE sale_id=NEW.sale_id;
 IF NOT FOUND THEN RETURN NEW; END IF;
 SELECT amount_cents INTO v_amount FROM public.platform_fee_allocations
  WHERE operation_id=v_op AND kind='representative' AND beneficiary_id=NEW.representative_id::text;
 IF NOT FOUND OR NEW.commission_amount IS DISTINCT FROM v_amount::numeric/100
 THEN RAISE EXCEPTION 'manual_commission_decision_changed'; END IF;
 v_ratio:=CASE WHEN NEW.base_amount>0 THEN round(NEW.commission_amount/NEW.base_amount*100,2) ELSE 0 END;
 NEW.status:='bloqueada'; NEW.blocked_reason:='manual_fee_pending_reconciliation';
 UPDATE public.platform_fee_allocations SET evidence=coalesce(evidence,'{}')||jsonb_build_object(
  'commission_basis','absolute_manual_fee_allocation','gross_ratio_percent',v_ratio,'percent_field_capped',v_ratio>100)
 WHERE operation_id=v_op AND kind='representative';
 RETURN NEW;
END $$;
CREATE TRIGGER guard_manual_commission_projection BEFORE INSERT ON public.representative_commissions
 FOR EACH ROW EXECUTE FUNCTION public.guard_manual_commission_projection();

CREATE OR REPLACE FUNCTION public.claim_manual_fee_creation(p_id uuid) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_sale uuid; v_status text; v_enabled boolean;
BEGIN
 SELECT sale_id INTO v_sale FROM public.platform_fee_operations WHERE id=p_id;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('issue_sale_tickets:'||v_sale,0));
 SELECT s.status,c.manual_fee_flow_enabled INTO v_status,v_enabled
  FROM public.sales s JOIN public.companies c ON c.id=s.company_id WHERE s.id=v_sale FOR UPDATE OF s FOR SHARE OF c;
 IF v_status NOT IN ('reservado','pendente_pagamento') OR NOT v_enabled THEN RETURN false; END IF;
 UPDATE public.platform_fee_operations SET state='creating' WHERE id=p_id AND state='prepared';
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.claim_manual_fee_creation(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_manual_fee_creation(uuid) TO service_role;
