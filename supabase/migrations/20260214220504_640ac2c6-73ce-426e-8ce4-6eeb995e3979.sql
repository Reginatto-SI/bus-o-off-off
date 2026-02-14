
-- Criar função is_developer (security definer)
CREATE OR REPLACE FUNCTION public.is_developer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'developer'
  )
$$;

-- Atualizar is_admin para incluir developer
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('gerente', 'operador', 'developer')
  )
$$;

-- Atualizar user_belongs_to_company com bypass para developer
CREATE OR REPLACE FUNCTION public.user_belongs_to_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.is_developer(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.companies c ON c.id = ur.company_id
      WHERE ur.user_id = _user_id
        AND ur.company_id = _company_id
        AND c.is_active = true
    )
$$;

-- Developer pode gerenciar todas as companies
CREATE POLICY "Developer can manage all companies"
  ON public.companies FOR ALL
  USING (public.is_developer(auth.uid()))
  WITH CHECK (public.is_developer(auth.uid()));

-- Developer pode gerenciar partners
DROP POLICY IF EXISTS "Gerentes can manage partners" ON public.partners;
CREATE POLICY "Gerentes and developers can manage partners"
  ON public.partners FOR ALL
  USING (
    has_role(auth.uid(), 'gerente'::user_role)
    OR has_role(auth.uid(), 'developer'::user_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'gerente'::user_role)
    OR has_role(auth.uid(), 'developer'::user_role)
  );

-- Developer pode ver e editar todos os profiles
CREATE POLICY "Developer can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_developer(auth.uid()));

CREATE POLICY "Developer can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_developer(auth.uid()))
  WITH CHECK (public.is_developer(auth.uid()));
