-- =============================================
-- Multiempresa: completar company_id em trips, sales e event_boarding_locations
-- =============================================
-- Objetivo:
--   1) Adicionar company_id com FK para companies(id)
--   2) Backfill determinístico usando eventos/viagens como fonte de verdade
--   3) Tornar company_id obrigatório em trips e sales
--   4) Ajustar políticas RLS usando user_belongs_to_company

-- 1) Adicionar coluna company_id (nullable para backfill seguro)
ALTER TABLE public.trips
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.event_boarding_locations
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- 2) Backfill de company_id
-- Trips: fonte principal via event_id -> events.company_id
UPDATE public.trips t
SET company_id = e.company_id
FROM public.events e
WHERE t.event_id = e.id
  AND t.company_id IS NULL;

-- Trips: fallback para empresa padrão quando não houver vínculo possível
-- Nota: usado apenas para garantir consistência em registros legados sem relação válida.
UPDATE public.trips
SET company_id = 'a0000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;

-- Event Boarding Locations: sempre via event_id -> events.company_id
UPDATE public.event_boarding_locations ebl
SET company_id = e.company_id
FROM public.events e
WHERE ebl.event_id = e.id
  AND ebl.company_id IS NULL;

-- Sales: preferir via event_id -> events.company_id
UPDATE public.sales s
SET company_id = e.company_id
FROM public.events e
WHERE s.event_id = e.id
  AND s.company_id IS NULL;

-- Sales: fallback via trip_id -> trips.company_id (após backfill de trips)
UPDATE public.sales s
SET company_id = t.company_id
FROM public.trips t
WHERE s.trip_id = t.id
  AND s.company_id IS NULL;

-- Sales: fallback para empresa padrão quando não houver vínculo possível
-- Nota: usado apenas para garantir consistência em registros legados sem relação válida.
UPDATE public.sales
SET company_id = 'a0000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;

-- 3) Tornar company_id obrigatório após backfill
ALTER TABLE public.trips ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.sales ALTER COLUMN company_id SET NOT NULL;
-- event_boarding_locations também pode ser obrigatório pois event_id é NOT NULL
ALTER TABLE public.event_boarding_locations ALTER COLUMN company_id SET NOT NULL;

-- 4) Índices para performance
CREATE INDEX IF NOT EXISTS idx_trips_company_id ON public.trips(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_company_id ON public.sales(company_id);
CREATE INDEX IF NOT EXISTS idx_event_boarding_locations_company_id ON public.event_boarding_locations(company_id);

-- 5) Ajustar políticas RLS para garantir isolamento por empresa
-- Trips
DROP POLICY IF EXISTS "Public can view trips" ON public.trips;
DROP POLICY IF EXISTS "All authenticated can view trips" ON public.trips;
DROP POLICY IF EXISTS "Admins can manage trips" ON public.trips;

CREATE POLICY "Users can view trips of their company"
ON public.trips
FOR SELECT
TO authenticated
USING (
  user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Admins can manage trips of their company"
ON public.trips
FOR ALL
TO authenticated
USING (
  is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id)
)
WITH CHECK (
  is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id)
);

-- Sales
DROP POLICY IF EXISTS "Public can create sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated can create sales" ON public.sales;
DROP POLICY IF EXISTS "Admins can view all sales" ON public.sales;
DROP POLICY IF EXISTS "Admins can manage sales" ON public.sales;
DROP POLICY IF EXISTS "Users can view sales of their company" ON public.sales;
DROP POLICY IF EXISTS "Admins can manage sales of their company" ON public.sales;

CREATE POLICY "Users can view sales of their company"
ON public.sales
FOR SELECT
TO authenticated
USING (
  user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Users can create sales of their company"
ON public.sales
FOR INSERT
TO authenticated
WITH CHECK (
  user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Admins can update sales of their company"
ON public.sales
FOR UPDATE
TO authenticated
USING (
  is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id)
)
WITH CHECK (
  is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Admins can delete sales of their company"
ON public.sales
FOR DELETE
TO authenticated
USING (
  is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id)
);

-- Event Boarding Locations
DROP POLICY IF EXISTS "Public can view event_boarding_locations" ON public.event_boarding_locations;
DROP POLICY IF EXISTS "All authenticated can view event_boarding_locations" ON public.event_boarding_locations;
DROP POLICY IF EXISTS "Admins can manage event_boarding_locations" ON public.event_boarding_locations;

CREATE POLICY "Users can view event_boarding_locations of their company"
ON public.event_boarding_locations
FOR SELECT
TO authenticated
USING (
  user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Admins can manage event_boarding_locations of their company"
ON public.event_boarding_locations
FOR ALL
TO authenticated
USING (
  is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id)
)
WITH CHECK (
  is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id)
);
