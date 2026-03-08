
CREATE OR REPLACE FUNCTION public.validate_ticket_scan(p_qr_code_token text, p_action text, p_device_info text DEFAULT NULL::text, p_app_version text DEFAULT NULL::text)
 RETURNS TABLE(result text, reason_code text, checkout_enabled boolean, passenger_name text, seat_label text, event_name text, boarding_label text, passenger_cpf_masked text, boarding_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action, '')));
  v_user_company_id uuid;
  v_driver_id uuid;
  v_reason text := '';
  v_result text := 'blocked';
  v_checkout_enabled boolean := false;
  v_ticket_id uuid;
  v_sale_id uuid;
  v_event_id uuid;
  v_trip_id uuid;
  v_boarding_location_id uuid;
  v_company_id uuid;
  v_sale_status sale_status;
  v_current_boarding_status text;
  v_next_boarding_status text;
  v_passenger_name text;
  v_passenger_cpf text;
  v_seat_label text;
  v_event_name text;
  v_boarding_name text;
  v_boarding_date date;
  v_boarding_time time;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  SELECT ur.company_id
    INTO v_user_company_id
  FROM public.user_roles ur
  WHERE ur.user_id = v_user_id
  ORDER BY ur.id ASC
  LIMIT 1;

  IF v_action NOT IN ('checkin', 'checkout', 'reboard', 'undo_checkin', 'undo_checkout', 'undo_reboard') THEN
    RETURN QUERY SELECT
      'blocked'::text,
      'invalid_action'::text,
      false,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::text;
    RETURN;
  END IF;

  SELECT
    t.id,
    t.sale_id,
    s.event_id,
    t.trip_id,
    s.boarding_location_id,
    t.company_id,
    s.status,
    t.boarding_status,
    t.passenger_name,
    t.passenger_cpf,
    t.seat_label,
    e.name,
    e.enable_checkout_validation,
    bl.name,
    ebl.departure_date,
    ebl.departure_time
  INTO
    v_ticket_id,
    v_sale_id,
    v_event_id,
    v_trip_id,
    v_boarding_location_id,
    v_company_id,
    v_sale_status,
    v_current_boarding_status,
    v_passenger_name,
    v_passenger_cpf,
    v_seat_label,
    v_event_name,
    v_checkout_enabled,
    v_boarding_name,
    v_boarding_date,
    v_boarding_time
  FROM public.tickets t
  JOIN public.sales s ON s.id = t.sale_id
  JOIN public.events e ON e.id = s.event_id
  LEFT JOIN public.boarding_locations bl ON bl.id = s.boarding_location_id
  LEFT JOIN LATERAL (
    SELECT ebl.departure_date, ebl.departure_time
    FROM public.event_boarding_locations ebl
    WHERE ebl.event_id = s.event_id
      AND ebl.trip_id = t.trip_id
      AND ebl.boarding_location_id = s.boarding_location_id
    ORDER BY ebl.departure_date ASC NULLS LAST, ebl.departure_time ASC NULLS LAST
    LIMIT 1
  ) ebl ON true
  WHERE t.qr_code_token = p_qr_code_token
  LIMIT 1;

  IF v_ticket_id IS NULL THEN
    IF v_user_company_id IS NOT NULL THEN
      INSERT INTO public.ticket_validations (
        company_id, action, result, reason_code,
        validated_by_user_id, validated_at, device_info, app_version
      ) VALUES (
        v_user_company_id, v_action, 'blocked', 'invalid_qr',
        v_user_id, now(), p_device_info, p_app_version
      );
    END IF;

    RETURN QUERY SELECT
      'blocked'::text, 'invalid_qr'::text, false,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF NOT public.user_belongs_to_company(v_user_id, v_company_id) THEN
    v_reason := 'not_allowed_company';
  ELSE
    IF v_sale_status = 'cancelado' THEN
      v_reason := 'sale_cancelled';
    ELSIF v_sale_status <> 'pago' THEN
      v_reason := 'sale_not_paid';
    ELSIF v_action = 'checkin' THEN
      IF v_current_boarding_status IN ('checked_in', 'checked_out', 'reboarded') THEN
        v_reason := 'already_checked_in';
      ELSE
        v_result := 'success';
        v_reason := 'ok';
        v_next_boarding_status := 'checked_in';
      END IF;
    ELSIF v_action = 'checkout' THEN
      IF v_current_boarding_status = 'checked_out' THEN
        v_reason := 'already_checked_out';
      ELSIF v_current_boarding_status NOT IN ('checked_in', 'reboarded') THEN
        v_reason := 'checkout_without_checkin';
      ELSE
        v_result := 'success';
        v_reason := 'ok';
        v_next_boarding_status := 'checked_out';
      END IF;
    ELSIF v_action = 'reboard' THEN
      IF v_current_boarding_status = 'reboarded' THEN
        v_reason := 'already_reboarded';
      ELSIF v_current_boarding_status <> 'checked_out' THEN
        v_reason := 'reboard_without_checkout';
      ELSE
        v_result := 'success';
        v_reason := 'ok';
        v_next_boarding_status := 'reboarded';
      END IF;
    ELSIF v_action = 'undo_checkin' THEN
      IF v_current_boarding_status = 'checked_in' THEN
        v_result := 'success';
        v_reason := 'ok';
        v_next_boarding_status := 'pendente';
      ELSE
        v_reason := 'undo_not_applicable';
      END IF;
    ELSIF v_action = 'undo_checkout' THEN
      IF v_current_boarding_status = 'checked_out' THEN
        v_result := 'success';
        v_reason := 'ok';
        v_next_boarding_status := 'checked_in';
      ELSE
        v_reason := 'undo_not_applicable';
      END IF;
    ELSIF v_action = 'undo_reboard' THEN
      IF v_current_boarding_status = 'reboarded' THEN
        v_result := 'success';
        v_reason := 'ok';
        v_next_boarding_status := 'checked_out';
      ELSE
        v_reason := 'undo_not_applicable';
      END IF;
    END IF;
  END IF;

  IF v_result = 'success' THEN
    UPDATE public.tickets
    SET boarding_status = v_next_boarding_status,
        updated_at = now()
    WHERE id = v_ticket_id;

    v_current_boarding_status := v_next_boarding_status;
  END IF;

  SELECT ur.driver_id
    INTO v_driver_id
  FROM public.user_roles ur
  WHERE ur.user_id = v_user_id
    AND ur.company_id = v_company_id
  ORDER BY ur.id ASC
  LIMIT 1;

  INSERT INTO public.ticket_validations (
    company_id, ticket_id, sale_id, event_id, trip_id,
    boarding_location_id, action, result, reason_code,
    validated_by_user_id, validated_by_driver_id,
    validated_at, device_info, app_version
  ) VALUES (
    v_company_id, v_ticket_id, v_sale_id, v_event_id, v_trip_id,
    v_boarding_location_id, v_action, v_result, v_reason,
    v_user_id, v_driver_id, now(), p_device_info, p_app_version
  );

  RETURN QUERY SELECT
    v_result,
    v_reason,
    v_checkout_enabled,
    v_passenger_name,
    v_seat_label,
    v_event_name,
    trim(concat_ws(' • ', v_boarding_name, to_char(v_boarding_date, 'DD/MM/YYYY'), to_char(v_boarding_time, 'HH24:MI'))),
    CASE
      WHEN v_passenger_cpf IS NULL THEN NULL
      ELSE regexp_replace(
        lpad(regexp_replace(v_passenger_cpf, '\\D', '', 'g'), 11, '0'),
        '(\\d{3})(\\d{3})(\\d{3})(\\d{2})',
        '***.***.***-**'
      )
    END,
    v_current_boarding_status;
END;
$function$;
