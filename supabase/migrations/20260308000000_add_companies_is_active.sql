-- =============================================
-- Empresas ativas/inativas: adicionar is_active e reforçar RLS
-- =============================================
-- Objetivo:
--   1) Adicionar companies.is_active (boolean, default true)
--   2) Backfill explícito para registros existentes
--   3) Centralizar validação de empresa ativa em user_belongs_to_company
--   4) Garantir bloqueio de INSERT/UPDATE quando empresa está inativa

-- 1) Adicionar coluna is_active
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.companies.is_active IS
  'Indica se a empresa está ativa; empresas inativas não devem operar dados.';

-- 2) Backfill explícito
UPDATE public.companies
SET is_active = true
WHERE is_active IS NULL;

-- 3) Atualizar função central de verificação de empresa
-- Observação: a função já é usada nas policies RLS, então este ajuste
-- garante que empresas inativas não sejam consideradas válidas.
CREATE OR REPLACE FUNCTION public.user_belongs_to_company(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.companies c ON c.id = ur.company_id
    WHERE ur.user_id = _user_id
      AND ur.company_id = _company_id
      AND c.is_active = true
  )
$$;

-- 4) Reforçar políticas de gerenciamento para bloquear INSERT/UPDATE
-- quando a empresa estiver inativa (WITH CHECK usando a função central).
ALTER POLICY "Admins can manage vehicles of their company"
ON public.vehicles
USING (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id))
WITH CHECK (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id));

ALTER POLICY "Admins can manage drivers of their company"
ON public.drivers
USING (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id))
WITH CHECK (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id));

ALTER POLICY "Admins can manage boarding_locations of their company"
ON public.boarding_locations
USING (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id))
WITH CHECK (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id));

ALTER POLICY "Admins can manage sellers of their company"
ON public.sellers
USING (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id))
WITH CHECK (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id));

ALTER POLICY "Admins can manage events of their company"
ON public.events
USING (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id))
WITH CHECK (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id));
