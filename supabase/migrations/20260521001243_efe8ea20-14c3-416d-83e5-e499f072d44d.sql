-- Corrige ocupação física de poltronas por trecho.
-- Causa raiz: dados históricos podem guardar tickets/sale_passengers com seat_id de outro veículo/layout,
-- enquanto o mapa renderiza os assentos do veículo atualmente vinculado ao trip_id. Nesses casos,
-- a contagem batia, mas os IDs não batiam e o mapa não pintava as poltronas.

CREATE OR REPLACE FUNCTION public.resolve_trip_physical_seat_id(
  _trip_id uuid,
  _company_id uuid,
  _seat_id uuid,
  _seat_label text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH trip_ctx AS (
    SELECT tr.vehicle_id, tr.company_id
    FROM public.trips tr
    WHERE tr.id = _trip_id
      AND tr.company_id = _company_id
  ),
  input_label AS (
    SELECT COALESCE(NULLIF(_seat_label, ''), source_seat.label) AS label
    FROM (SELECT 1) seed
    LEFT JOIN public.seats source_seat
      ON source_seat.id = _seat_id
     AND source_seat.company_id = _company_id
  )
  SELECT target_seat.id
  FROM trip_ctx ctx
  JOIN input_label il ON il.label IS NOT NULL
  JOIN public.seats target_seat
    ON target_seat.vehicle_id = ctx.vehicle_id
   AND target_seat.company_id = ctx.company_id
   AND target_seat.label = il.label
   AND target_seat.label NOT LIKE '#_legacy#_%' ESCAPE '#'
   AND target_seat.label NOT LIKE '#_tmp#_%' ESCAPE '#'
  ORDER BY CASE WHEN target_seat.id = _seat_id THEN 0 ELSE 1 END
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_trip_seat_occupancy(_trip_id uuid)
RETURNS TABLE(seat_id uuid, is_blocked boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH trip_ctx AS (
    SELECT tr.id AS trip_id, tr.vehicle_id, tr.company_id
    FROM public.trips tr
    WHERE tr.id = _trip_id
  ),
  occupied_from_tickets AS (
    SELECT resolved.seat_id,
           COALESCE(s.status = 'bloqueado', false) AS is_blocked
    FROM public.tickets t
    JOIN trip_ctx ctx
      ON ctx.trip_id = t.trip_id
     AND ctx.company_id = t.company_id
    LEFT JOIN public.sales s
      ON s.id = t.sale_id
     AND s.company_id = t.company_id
    CROSS JOIN LATERAL (
      SELECT public.resolve_trip_physical_seat_id(t.trip_id, t.company_id, t.seat_id, t.seat_label) AS seat_id
    ) resolved
    WHERE resolved.seat_id IS NOT NULL
      AND COALESCE(s.status, 'reservado') <> 'cancelado'
  ),
  occupied_from_sale_passengers AS (
    SELECT resolved.seat_id,
           (s.status = 'bloqueado') AS is_blocked
    FROM public.sale_passengers sp
    JOIN public.sales s
      ON s.id = sp.sale_id
     AND s.company_id = sp.company_id
    JOIN trip_ctx ctx
      ON ctx.trip_id = sp.trip_id
     AND ctx.company_id = sp.company_id
    CROSS JOIN LATERAL (
      SELECT public.resolve_trip_physical_seat_id(sp.trip_id, sp.company_id, sp.seat_id, sp.seat_label) AS seat_id
    ) resolved
    WHERE resolved.seat_id IS NOT NULL
      AND s.status IN ('pendente_pagamento', 'reservado', 'pago', 'bloqueado')
      AND NOT EXISTS (
        SELECT 1
        FROM public.tickets t
        CROSS JOIN LATERAL (
          SELECT public.resolve_trip_physical_seat_id(t.trip_id, t.company_id, t.seat_id, t.seat_label) AS ticket_seat_id
        ) ticket_resolved
        WHERE t.sale_id = sp.sale_id
          AND t.trip_id = sp.trip_id
          AND t.company_id = sp.company_id
          AND ticket_resolved.ticket_seat_id = resolved.seat_id
      )
  ),
  occupied_from_active_locks AS (
    SELECT resolved.seat_id,
           false AS is_blocked
    FROM public.seat_locks sl
    JOIN trip_ctx ctx
      ON ctx.trip_id = sl.trip_id
     AND ctx.company_id = sl.company_id
    CROSS JOIN LATERAL (
      SELECT public.resolve_trip_physical_seat_id(sl.trip_id, sl.company_id, sl.seat_id, NULL) AS seat_id
    ) resolved
    WHERE resolved.seat_id IS NOT NULL
      AND sl.expires_at > now()
  )
  SELECT occ.seat_id, bool_or(occ.is_blocked) AS is_blocked
  FROM (
    SELECT * FROM occupied_from_tickets
    UNION ALL
    SELECT * FROM occupied_from_sale_passengers
    UNION ALL
    SELECT * FROM occupied_from_active_locks
  ) occ
  GROUP BY occ.seat_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_trip_seat_occupancy(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.assert_physical_seat_available_for_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_physical_seat_id uuid;
BEGIN
  IF NEW.seat_id IS NULL AND NULLIF(NEW.seat_label, '') IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tr.company_id INTO v_company_id
  FROM public.trips tr
  WHERE tr.id = NEW.trip_id;

  IF v_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_physical_seat_id := public.resolve_trip_physical_seat_id(NEW.trip_id, v_company_id, NEW.seat_id, NEW.seat_label);

  IF v_physical_seat_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Bloqueio transacional pela poltrona física do trecho, não pelo UUID histórico salvo.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.trip_id::text || ':' || v_physical_seat_id::text, 0));

  IF EXISTS (
    SELECT 1
    FROM public.tickets t
    LEFT JOIN public.sales s ON s.id = t.sale_id AND s.company_id = t.company_id
    CROSS JOIN LATERAL (
      SELECT public.resolve_trip_physical_seat_id(t.trip_id, t.company_id, t.seat_id, t.seat_label) AS seat_id
    ) resolved
    WHERE t.company_id = v_company_id
      AND t.trip_id = NEW.trip_id
      AND resolved.seat_id = v_physical_seat_id
      AND COALESCE(s.status, 'reservado') <> 'cancelado'
      AND t.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Assento já ocupado neste trecho.' USING errcode = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sale_passengers sp
    JOIN public.sales s ON s.id = sp.sale_id AND s.company_id = sp.company_id
    CROSS JOIN LATERAL (
      SELECT public.resolve_trip_physical_seat_id(sp.trip_id, sp.company_id, sp.seat_id, sp.seat_label) AS seat_id
    ) resolved
    WHERE sp.company_id = v_company_id
      AND sp.trip_id = NEW.trip_id
      AND resolved.seat_id = v_physical_seat_id
      AND s.status IN ('pendente_pagamento', 'reservado', 'pago', 'bloqueado')
      AND sp.sale_id IS DISTINCT FROM NEW.sale_id
  ) THEN
    RAISE EXCEPTION 'Assento reservado ou vendido neste trecho.' USING errcode = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.seat_locks sl
    CROSS JOIN LATERAL (
      SELECT public.resolve_trip_physical_seat_id(sl.trip_id, sl.company_id, sl.seat_id, NULL) AS seat_id
    ) resolved
    WHERE sl.company_id = v_company_id
      AND sl.trip_id = NEW.trip_id
      AND resolved.seat_id = v_physical_seat_id
      AND sl.expires_at > now()
      AND sl.sale_id IS DISTINCT FROM NEW.sale_id
  ) THEN
    RAISE EXCEPTION 'Assento reservado temporariamente neste trecho.' USING errcode = '23505';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_physical_seat_available_for_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_physical_seat_id uuid;
BEGIN
  IF NEW.seat_id IS NULL OR NEW.expires_at <= now() THEN
    RETURN NEW;
  END IF;

  SELECT tr.company_id INTO v_company_id
  FROM public.trips tr
  WHERE tr.id = NEW.trip_id;

  IF v_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_physical_seat_id := public.resolve_trip_physical_seat_id(NEW.trip_id, v_company_id, NEW.seat_id, NULL);

  IF v_physical_seat_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Reserva simultânea usa a poltrona física resolvida no veículo do trecho.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.trip_id::text || ':' || v_physical_seat_id::text, 0));

  IF EXISTS (
    SELECT 1
    FROM public.tickets t
    LEFT JOIN public.sales s ON s.id = t.sale_id AND s.company_id = t.company_id
    CROSS JOIN LATERAL (
      SELECT public.resolve_trip_physical_seat_id(t.trip_id, t.company_id, t.seat_id, t.seat_label) AS seat_id
    ) resolved
    WHERE t.company_id = v_company_id
      AND t.trip_id = NEW.trip_id
      AND resolved.seat_id = v_physical_seat_id
      AND COALESCE(s.status, 'reservado') <> 'cancelado'
  ) THEN
    RAISE EXCEPTION 'Assento já ocupado neste trecho.' USING errcode = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sale_passengers sp
    JOIN public.sales s ON s.id = sp.sale_id AND s.company_id = sp.company_id
    CROSS JOIN LATERAL (
      SELECT public.resolve_trip_physical_seat_id(sp.trip_id, sp.company_id, sp.seat_id, sp.seat_label) AS seat_id
    ) resolved
    WHERE sp.company_id = v_company_id
      AND sp.trip_id = NEW.trip_id
      AND resolved.seat_id = v_physical_seat_id
      AND s.status IN ('pendente_pagamento', 'reservado', 'pago', 'bloqueado')
      AND sp.sale_id IS DISTINCT FROM NEW.sale_id
  ) THEN
    RAISE EXCEPTION 'Assento reservado ou vendido neste trecho.' USING errcode = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.seat_locks sl
    CROSS JOIN LATERAL (
      SELECT public.resolve_trip_physical_seat_id(sl.trip_id, sl.company_id, sl.seat_id, NULL) AS seat_id
    ) resolved
    WHERE sl.company_id = v_company_id
      AND sl.trip_id = NEW.trip_id
      AND resolved.seat_id = v_physical_seat_id
      AND sl.expires_at > now()
      AND sl.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Assento reservado temporariamente neste trecho.' USING errcode = '23505';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_physical_seat_available_for_sale_passenger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_sale_status public.sale_status;
  v_physical_seat_id uuid;
BEGIN
  IF NEW.seat_id IS NULL AND NULLIF(NEW.seat_label, '') IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tr.company_id INTO v_company_id
  FROM public.trips tr
  WHERE tr.id = NEW.trip_id;

  IF v_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.status INTO v_sale_status
  FROM public.sales s
  WHERE s.id = NEW.sale_id
    AND s.company_id = v_company_id;

  IF COALESCE(v_sale_status::text, 'reservado') = 'cancelado' THEN
    RETURN NEW;
  END IF;

  v_physical_seat_id := public.resolve_trip_physical_seat_id(NEW.trip_id, v_company_id, NEW.seat_id, NEW.seat_label);

  IF v_physical_seat_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Protege também a etapa operacional anterior ao ticket definitivo.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.trip_id::text || ':' || v_physical_seat_id::text, 0));

  IF EXISTS (
    SELECT 1
    FROM public.tickets t
    LEFT JOIN public.sales s ON s.id = t.sale_id AND s.company_id = t.company_id
    CROSS JOIN LATERAL (
      SELECT public.resolve_trip_physical_seat_id(t.trip_id, t.company_id, t.seat_id, t.seat_label) AS seat_id
    ) resolved
    WHERE t.company_id = v_company_id
      AND t.trip_id = NEW.trip_id
      AND resolved.seat_id = v_physical_seat_id
      AND COALESCE(s.status, 'reservado') <> 'cancelado'
      AND t.sale_id IS DISTINCT FROM NEW.sale_id
  ) THEN
    RAISE EXCEPTION 'Assento já ocupado neste trecho.' USING errcode = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sale_passengers sp
    JOIN public.sales s ON s.id = sp.sale_id AND s.company_id = sp.company_id
    CROSS JOIN LATERAL (
      SELECT public.resolve_trip_physical_seat_id(sp.trip_id, sp.company_id, sp.seat_id, sp.seat_label) AS seat_id
    ) resolved
    WHERE sp.company_id = v_company_id
      AND sp.trip_id = NEW.trip_id
      AND resolved.seat_id = v_physical_seat_id
      AND s.status IN ('pendente_pagamento', 'reservado', 'pago', 'bloqueado')
      AND sp.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Assento já reservado neste trecho.' USING errcode = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.seat_locks sl
    CROSS JOIN LATERAL (
      SELECT public.resolve_trip_physical_seat_id(sl.trip_id, sl.company_id, sl.seat_id, NULL) AS seat_id
    ) resolved
    WHERE sl.company_id = v_company_id
      AND sl.trip_id = NEW.trip_id
      AND resolved.seat_id = v_physical_seat_id
      AND sl.expires_at > now()
      AND sl.sale_id IS DISTINCT FROM NEW.sale_id
  ) THEN
    RAISE EXCEPTION 'Assento reservado temporariamente neste trecho.' USING errcode = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assert_physical_seat_available_for_sale_passenger ON public.sale_passengers;
CREATE TRIGGER trg_assert_physical_seat_available_for_sale_passenger
BEFORE INSERT OR UPDATE OF trip_id, seat_id, seat_label, sale_id, company_id
ON public.sale_passengers
FOR EACH ROW
EXECUTE FUNCTION public.assert_physical_seat_available_for_sale_passenger();