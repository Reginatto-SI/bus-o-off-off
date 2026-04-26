-- Base mínima do MVP para itens de serviços vendidos + QR próprio por venda de serviços.
-- Mantém sales como entidade principal e evita depender de sale_logs como fonte operacional.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS service_qr_code_token text;

COMMENT ON COLUMN public.sales.service_qr_code_token IS
'QR próprio da venda de serviços (separado do QR de passagem/ticket). Nível: venda/comprovante.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_service_qr_code_token_unique
  ON public.sales(service_qr_code_token)
  WHERE service_qr_code_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sale_service_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  event_id uuid NULL REFERENCES public.events(id) ON DELETE SET NULL,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  event_service_id uuid NULL REFERENCES public.event_services(id) ON DELETE SET NULL,
  service_name text NOT NULL,
  unit_type text NOT NULL CHECK (unit_type IN ('pessoa', 'veiculo', 'unitario')),
  control_type text NOT NULL CHECK (control_type IN ('validacao_obrigatoria', 'sem_validacao')),
  quantity_total integer NOT NULL CHECK (quantity_total > 0),
  quantity_used integer NOT NULL DEFAULT 0 CHECK (quantity_used >= 0),
  quantity_remaining integer GENERATED ALWAYS AS (GREATEST(quantity_total - quantity_used, 0)) STORED,
  unit_price numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  total_price numeric(10,2) NOT NULL CHECK (total_price >= 0),
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'cancelado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sale_service_items_quantity_guard CHECK (quantity_used <= quantity_total)
);

CREATE INDEX IF NOT EXISTS idx_sale_service_items_sale_id
  ON public.sale_service_items(sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_service_items_company_id
  ON public.sale_service_items(company_id);

CREATE INDEX IF NOT EXISTS idx_sale_service_items_service_id
  ON public.sale_service_items(service_id);

CREATE INDEX IF NOT EXISTS idx_sale_service_items_event_service_id
  ON public.sale_service_items(event_service_id)
  WHERE event_service_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_sale_service_items_updated_at ON public.sale_service_items;

CREATE TRIGGER trg_sale_service_items_updated_at
BEFORE UPDATE ON public.sale_service_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.sale_service_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sale_service_items"
ON public.sale_service_items
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()) AND public.user_belongs_to_company(auth.uid(), company_id))
WITH CHECK (public.is_admin(auth.uid()) AND public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can view sale_service_items"
ON public.sale_service_items
FOR SELECT
TO authenticated
USING (public.user_belongs_to_company(auth.uid(), company_id));
