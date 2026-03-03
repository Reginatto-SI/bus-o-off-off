
-- Nova tabela para preços por categoria de assento
CREATE TABLE public.event_category_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  category text NOT NULL DEFAULT 'convencional',
  price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, category)
);

-- RLS
ALTER TABLE public.event_category_prices ENABLE ROW LEVEL SECURITY;

-- Admins podem gerenciar preços por categoria da sua empresa
CREATE POLICY "Admins can manage event_category_prices"
ON public.event_category_prices
FOR ALL
USING (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id))
WITH CHECK (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id));

-- Público pode ver preços de eventos à venda
CREATE POLICY "Public can view category prices for public events"
ON public.event_category_prices
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM events e
  WHERE e.id = event_category_prices.event_id
    AND e.status = 'a_venda'::event_status
));

-- Trigger de updated_at
CREATE TRIGGER update_event_category_prices_updated_at
BEFORE UPDATE ON public.event_category_prices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Nova coluna no evento
ALTER TABLE public.events ADD COLUMN use_category_pricing boolean NOT NULL DEFAULT false;
