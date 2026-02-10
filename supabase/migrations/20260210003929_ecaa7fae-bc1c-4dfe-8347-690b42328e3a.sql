
-- 1. Adicionar campo floors na tabela vehicles
ALTER TABLE public.vehicles
  ADD COLUMN floors integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.vehicles.floors IS 'Numero de pisos do veiculo (1 ou 2)';

-- 2. Criar tabela seats
CREATE TABLE public.seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  label text NOT NULL,
  floor integer NOT NULL DEFAULT 1,
  row_number integer NOT NULL,
  column_number integer NOT NULL,
  status text NOT NULL DEFAULT 'disponivel',
  company_id uuid NOT NULL REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vehicle_id, label)
);

ALTER TABLE public.seats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage seats"
  ON public.seats FOR ALL
  USING (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Public can view seats for public events"
  ON public.seats FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM trips t
    JOIN events e ON e.id = t.event_id
    WHERE t.vehicle_id = seats.vehicle_id
    AND e.status = 'a_venda'
  ));

-- 3. Criar tabela tickets
CREATE TABLE public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips(id),
  seat_id uuid REFERENCES public.seats(id),
  seat_label text NOT NULL,
  passenger_name text NOT NULL,
  passenger_cpf text NOT NULL,
  passenger_phone text,
  boarding_status text NOT NULL DEFAULT 'pendente',
  company_id uuid NOT NULL REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(trip_id, seat_id)
);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tickets"
  ON public.tickets FOR ALL
  USING (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Public can create tickets"
  ON public.tickets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sales s
      JOIN events e ON e.id = s.event_id
      WHERE s.id = tickets.sale_id
      AND e.status = 'a_venda'
    )
  );

CREATE POLICY "Public can view tickets"
  ON public.tickets FOR SELECT
  USING (true);

-- 4. Politica publica para criar sales (fluxo de compra publica)
CREATE POLICY "Public can create sales for public events"
  ON public.sales FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id
      AND e.status = 'a_venda'
      AND e.allow_online_sale = true
    )
  );

CREATE POLICY "Public can view sales by id"
  ON public.sales FOR SELECT
  USING (true);

-- 5. Atualizar funcao de capacidade disponivel para usar tickets
CREATE OR REPLACE FUNCTION public.get_trip_available_capacity(trip_uuid uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT t.capacity - COALESCE(
    (SELECT COUNT(*)::integer FROM public.tickets tk WHERE tk.trip_id = trip_uuid),
    0
  )
  FROM public.trips t
  WHERE t.id = trip_uuid
$$;

-- 6. Trigger para updated_at na tabela tickets
CREATE TRIGGER update_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
