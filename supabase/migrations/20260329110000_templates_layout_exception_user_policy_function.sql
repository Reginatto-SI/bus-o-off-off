-- Centraliza a exceção controlada do catálogo global de templates de layout.
-- Mantém a role original do usuário e restringe a liberação ao user_id autorizado.

CREATE OR REPLACE FUNCTION public.is_templates_layout_exception_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT _user_id = 'f1ba5ea7-2d3d-4171-b651-c1917655e5b1'::uuid;
$$;

COMMENT ON FUNCTION public.is_templates_layout_exception_user(uuid)
IS 'Exceção controlada para acesso total ao fluxo global /admin/templates-layout sem alterar user_roles.';

DROP POLICY IF EXISTS "Template layouts manage by developer or exception user" ON public.template_layouts;
CREATE POLICY "Template layouts manage by developer or exception user"
  ON public.template_layouts
  FOR ALL
  TO authenticated
  USING (
    public.is_developer(auth.uid())
    OR public.is_templates_layout_exception_user(auth.uid())
  )
  WITH CHECK (
    public.is_developer(auth.uid())
    OR public.is_templates_layout_exception_user(auth.uid())
  );

DROP POLICY IF EXISTS "Template layout items manage by developer or exception user" ON public.template_layout_items;
CREATE POLICY "Template layout items manage by developer or exception user"
  ON public.template_layout_items
  FOR ALL
  TO authenticated
  USING (
    public.is_developer(auth.uid())
    OR public.is_templates_layout_exception_user(auth.uid())
  )
  WITH CHECK (
    public.is_developer(auth.uid())
    OR public.is_templates_layout_exception_user(auth.uid())
  );

DROP POLICY IF EXISTS "Template layout versions manage by developer or exception user" ON public.template_layout_versions;
CREATE POLICY "Template layout versions manage by developer or exception user"
  ON public.template_layout_versions
  FOR ALL
  TO authenticated
  USING (
    public.is_developer(auth.uid())
    OR public.is_templates_layout_exception_user(auth.uid())
  )
  WITH CHECK (
    public.is_developer(auth.uid())
    OR public.is_templates_layout_exception_user(auth.uid())
  );
