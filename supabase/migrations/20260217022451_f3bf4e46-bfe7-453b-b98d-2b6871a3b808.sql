
-- Tabela de taxas adicionais por evento
CREATE TABLE public.event_fees (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  name text NOT NULL,
  fee_type text NOT NULL DEFAULT 'fixed' CHECK (fee_type IN ('fixed', 'percent')),
  value numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.event_fees ENABLE ROW LEVEL SECURITY;

-- Admins da empresa: ALL
CREATE POLICY "Admins can manage event_fees of their company"
ON public.event_fees
FOR ALL
TO authenticated
USING (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id))
WITH CHECK (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id));

-- Usuarios da empresa: SELECT
CREATE POLICY "Users can view event_fees of their company"
ON public.event_fees
FOR SELECT
TO authenticated
USING (user_belongs_to_company(auth.uid(), company_id));

-- Publico: SELECT para eventos a_venda
CREATE POLICY "Public can view fees for public events"
ON public.event_fees
FOR SELECT
TO anon
USING (EXISTS (
  SELECT 1 FROM events e
  WHERE e.id = event_fees.event_id
    AND e.status = 'a_venda'
));

-- Authenticated users can also view public event fees (for checkout)
CREATE POLICY "Authenticated can view fees for public events"
ON public.event_fees
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM events e
  WHERE e.id = event_fees.event_id
    AND e.status = 'a_venda'
));

-- Trigger updated_at
CREATE TRIGGER update_event_fees_updated_at
BEFORE UPDATE ON public.event_fees
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
