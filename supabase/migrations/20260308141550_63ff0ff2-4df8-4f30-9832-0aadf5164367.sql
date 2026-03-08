
-- Tabela de vínculo N:N entre eventos e patrocinadores
CREATE TABLE public.event_sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  sponsor_id uuid NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  show_on_event_page boolean NOT NULL DEFAULT true,
  show_on_showcase boolean NOT NULL DEFAULT false,
  show_on_ticket boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, sponsor_id)
);

-- RLS
ALTER TABLE public.event_sponsors ENABLE ROW LEVEL SECURITY;

-- Admins gerenciam vínculos da própria empresa
CREATE POLICY "Admins can manage event_sponsors"
ON public.event_sponsors
FOR ALL
USING (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id))
WITH CHECK (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id));

-- Público visualiza patrocinadores de eventos públicos
CREATE POLICY "Public can view event_sponsors for public events"
ON public.event_sponsors
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_sponsors.event_id AND e.status = 'a_venda'
  )
);
