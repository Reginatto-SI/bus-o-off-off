
-- 1. Add pendente_pagamento to sale_status enum
ALTER TYPE public.sale_status ADD VALUE IF NOT EXISTS 'pendente_pagamento' BEFORE 'reservado';

-- 2. Create seat_locks table for temporary seat blocking during checkout
CREATE TABLE public.seat_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  seat_id uuid NOT NULL REFERENCES public.seats(id) ON DELETE CASCADE,
  sale_id uuid REFERENCES public.sales(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  locked_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  UNIQUE (trip_id, seat_id)
);

-- RLS for seat_locks
ALTER TABLE public.seat_locks ENABLE ROW LEVEL SECURITY;

-- Public can view seat_locks for public events (to see occupied seats)
CREATE POLICY "Public can view seat_locks for public events"
ON public.seat_locks
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.trips t
    JOIN public.events e ON e.id = t.event_id
    WHERE t.id = seat_locks.trip_id
    AND e.status = 'a_venda'::event_status
  )
);

-- Public can insert seat_locks for public events
CREATE POLICY "Public can insert seat_locks for public events"
ON public.seat_locks
FOR INSERT
TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.trips t
    JOIN public.events e ON e.id = t.event_id
    WHERE t.id = seat_locks.trip_id
    AND e.status = 'a_venda'::event_status
    AND e.allow_online_sale = true
  )
);

-- Admins can manage seat_locks of their company
CREATE POLICY "Admins can manage seat_locks"
ON public.seat_locks
FOR ALL
TO authenticated
USING (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id))
WITH CHECK (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id));

-- 3. Create sale_passengers staging table
CREATE TABLE public.sale_passengers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  seat_id uuid REFERENCES public.seats(id) ON DELETE SET NULL,
  seat_label text NOT NULL,
  passenger_name text NOT NULL,
  passenger_cpf text NOT NULL,
  passenger_phone text,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS for sale_passengers
ALTER TABLE public.sale_passengers ENABLE ROW LEVEL SECURITY;

-- Public can insert sale_passengers for public events
CREATE POLICY "Public can insert sale_passengers"
ON public.sale_passengers
FOR INSERT
TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sales s
    JOIN public.events e ON e.id = s.event_id
    WHERE s.id = sale_passengers.sale_id
    AND e.status = 'a_venda'::event_status
  )
);

-- Public can view own sale_passengers (for confirmation screen)
CREATE POLICY "Public can view sale_passengers for public events"
ON public.sale_passengers
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.sales s
    JOIN public.events e ON e.id = s.event_id
    WHERE s.id = sale_passengers.sale_id
    AND e.status = 'a_venda'::event_status
  )
);

-- Admins can manage sale_passengers
CREATE POLICY "Admins can manage sale_passengers"
ON public.sale_passengers
FOR ALL
TO authenticated
USING (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id))
WITH CHECK (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id));

-- 4. Enable realtime on sales table
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
