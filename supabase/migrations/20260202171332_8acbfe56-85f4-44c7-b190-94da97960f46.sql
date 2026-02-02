-- =============================================
-- ETAPA 1: Criar estrutura multiempresa
-- =============================================

-- 1. Criar tabela de empresas
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  document TEXT NULL, -- CNPJ ou CPF
  phone TEXT NULL,
  email TEXT NULL,
  address TEXT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Trigger para updated_at
CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 2. Adicionar company_id em user_roles (vínculo usuário-empresa)
ALTER TABLE public.user_roles 
ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- 3. Adicionar company_id nas tabelas principais
ALTER TABLE public.vehicles 
ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.drivers 
ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.boarding_locations 
ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.sellers 
ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.events 
ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- 4. Criar empresa padrão para migração dos dados existentes
INSERT INTO public.companies (id, name, document, notes)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Empresa Padrão (Teste)',
  NULL,
  'Empresa criada automaticamente para migração dos dados existentes'
);

-- 5. Migrar dados existentes para a empresa padrão
UPDATE public.vehicles SET company_id = 'a0000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.drivers SET company_id = 'a0000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.boarding_locations SET company_id = 'a0000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.sellers SET company_id = 'a0000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.events SET company_id = 'a0000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.user_roles SET company_id = 'a0000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;

-- 6. Tornar company_id obrigatório após migração
ALTER TABLE public.vehicles ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.drivers ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.boarding_locations ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.sellers ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.events ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.user_roles ALTER COLUMN company_id SET NOT NULL;

-- 7. Criar função auxiliar para buscar company_id do usuário ativo
CREATE OR REPLACE FUNCTION public.get_user_active_company(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- 8. Criar função para verificar se usuário pertence à empresa
CREATE OR REPLACE FUNCTION public.user_belongs_to_company(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND company_id = _company_id
  )
$$;

-- 9. Políticas RLS para companies
CREATE POLICY "Users can view their companies"
ON public.companies
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.company_id = companies.id
  )
);

CREATE POLICY "Gerentes can manage companies"
ON public.companies
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.company_id = companies.id
      AND user_roles.role = 'gerente'
  )
);

-- 10. Atualizar políticas RLS das tabelas para filtrar por empresa

-- VEHICLES: Remover políticas antigas e criar novas
DROP POLICY IF EXISTS "Admins can manage vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admins can view vehicles" ON public.vehicles;

CREATE POLICY "Users can view vehicles of their company"
ON public.vehicles
FOR SELECT
USING (
  user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Admins can manage vehicles of their company"
ON public.vehicles
FOR ALL
USING (
  is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id)
);

-- DRIVERS: Remover políticas antigas e criar novas
DROP POLICY IF EXISTS "Admins can manage drivers" ON public.drivers;
DROP POLICY IF EXISTS "Admins can view drivers" ON public.drivers;

CREATE POLICY "Users can view drivers of their company"
ON public.drivers
FOR SELECT
USING (
  user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Admins can manage drivers of their company"
ON public.drivers
FOR ALL
USING (
  is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id)
);

-- BOARDING_LOCATIONS: Remover políticas antigas e criar novas
DROP POLICY IF EXISTS "Admins can manage boarding_locations" ON public.boarding_locations;
DROP POLICY IF EXISTS "All authenticated can view boarding_locations" ON public.boarding_locations;
DROP POLICY IF EXISTS "Public can view boarding_locations" ON public.boarding_locations;

CREATE POLICY "Users can view boarding_locations of their company"
ON public.boarding_locations
FOR SELECT
USING (
  user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Admins can manage boarding_locations of their company"
ON public.boarding_locations
FOR ALL
USING (
  is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Public can view boarding_locations for public events"
ON public.boarding_locations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.event_boarding_locations ebl
    JOIN public.events e ON e.id = ebl.event_id
    WHERE ebl.boarding_location_id = boarding_locations.id
      AND e.status = 'a_venda'
  )
);

-- SELLERS: Remover políticas antigas e criar novas
DROP POLICY IF EXISTS "Admins can manage sellers" ON public.sellers;
DROP POLICY IF EXISTS "Admins can view all sellers" ON public.sellers;

CREATE POLICY "Users can view sellers of their company"
ON public.sellers
FOR SELECT
USING (
  user_belongs_to_company(auth.uid(), company_id)
  OR id = get_user_seller_id(auth.uid())
);

CREATE POLICY "Admins can manage sellers of their company"
ON public.sellers
FOR ALL
USING (
  is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id)
);

-- EVENTS: Remover políticas antigas e criar novas
DROP POLICY IF EXISTS "Admins can manage events" ON public.events;
DROP POLICY IF EXISTS "All authenticated can view events" ON public.events;
DROP POLICY IF EXISTS "Public can view available events" ON public.events;

CREATE POLICY "Users can view events of their company"
ON public.events
FOR SELECT
USING (
  user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Admins can manage events of their company"
ON public.events
FOR ALL
USING (
  is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Public can view available events"
ON public.events
FOR SELECT
USING (status = 'a_venda');

-- SALES: Atualizar para considerar empresa via evento
DROP POLICY IF EXISTS "Admins can manage sales" ON public.sales;
DROP POLICY IF EXISTS "Admins can view all sales" ON public.sales;

CREATE POLICY "Users can view sales of their company"
ON public.sales
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = sales.event_id
      AND user_belongs_to_company(auth.uid(), e.company_id)
  )
  OR seller_id = get_user_seller_id(auth.uid())
);

CREATE POLICY "Admins can manage sales of their company"
ON public.sales
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = sales.event_id
      AND is_admin(auth.uid())
      AND user_belongs_to_company(auth.uid(), e.company_id)
  )
);

-- Criar índices para performance
CREATE INDEX idx_vehicles_company_id ON public.vehicles(company_id);
CREATE INDEX idx_drivers_company_id ON public.drivers(company_id);
CREATE INDEX idx_boarding_locations_company_id ON public.boarding_locations(company_id);
CREATE INDEX idx_sellers_company_id ON public.sellers(company_id);
CREATE INDEX idx_events_company_id ON public.events(company_id);
CREATE INDEX idx_user_roles_company_id ON public.user_roles(company_id);