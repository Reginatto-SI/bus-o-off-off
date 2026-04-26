-- =========================================================
-- Módulo de Passeios & Serviços — base inicial
-- Reutiliza a entidade `companies` como Agência. Sem nova entidade.
-- =========================================================

-- 1) Tabela base: cadastro de serviços por empresa
CREATE TABLE public.services (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  name text NOT NULL,
  description text NULL,
  unit_type text NOT NULL DEFAULT 'unitario'
    CHECK (unit_type IN ('pessoa', 'veiculo', 'unitario')),
  control_type text NOT NULL DEFAULT 'sem_validacao'
    CHECK (control_type IN ('validacao_obrigatoria', 'sem_validacao')),
  status text NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo', 'inativo')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_services_company_status ON public.services(company_id, status);

-- Trigger de updated_at — reutiliza função existente do projeto
CREATE TRIGGER trg_services_updated_at
BEFORE UPDATE ON public.services
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: padrão multiempresa do projeto
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage services of their company"
ON public.services
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()) AND public.user_belongs_to_company(auth.uid(), company_id))
WITH CHECK (public.is_admin(auth.uid()) AND public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can view services of their company"
ON public.services
FOR SELECT
TO authenticated
USING (public.user_belongs_to_company(auth.uid(), company_id));

-- =========================================================
-- 2) Tabela vínculo: serviço aplicado a um evento
-- =========================================================
CREATE TABLE public.event_services (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL,
  service_id uuid NOT NULL,
  -- Redundante para acelerar RLS (padrão do projeto, igual a event_fees/event_sponsors)
  company_id uuid NOT NULL,
  base_price numeric(10,2) NOT NULL DEFAULT 0,
  total_capacity integer NOT NULL DEFAULT 0,
  -- Preparado para futuro; nesta etapa permanece sempre 0
  sold_quantity integer NOT NULL DEFAULT 0,
  allow_checkout boolean NOT NULL DEFAULT false,
  allow_standalone_sale boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Cada serviço só pode ser vinculado uma vez ao mesmo evento
  CONSTRAINT event_services_event_service_unique UNIQUE (event_id, service_id),
  CONSTRAINT event_services_capacity_non_negative CHECK (total_capacity >= 0),
  CONSTRAINT event_services_sold_non_negative CHECK (sold_quantity >= 0),
  CONSTRAINT event_services_base_price_non_negative CHECK (base_price >= 0)
);

CREATE INDEX idx_event_services_event ON public.event_services(event_id);
CREATE INDEX idx_event_services_company ON public.event_services(company_id);

CREATE TRIGGER trg_event_services_updated_at
BEFORE UPDATE ON public.event_services
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.event_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage event_services of their company"
ON public.event_services
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()) AND public.user_belongs_to_company(auth.uid(), company_id))
WITH CHECK (public.is_admin(auth.uid()) AND public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can view event_services of their company"
ON public.event_services
FOR SELECT
TO authenticated
USING (public.user_belongs_to_company(auth.uid(), company_id));