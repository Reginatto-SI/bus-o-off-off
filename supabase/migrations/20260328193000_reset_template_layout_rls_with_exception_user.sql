-- Hard reset de RLS do catálogo de templates para garantir CRUD completo de layouts
-- ao developer e ao usuário de exceção, sem abrir acesso global para outros perfis.

DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'template_layouts'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.template_layouts', policy_record.policyname);
  END LOOP;

  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'template_layout_items'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.template_layout_items', policy_record.policyname);
  END LOOP;

  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'template_layout_versions'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.template_layout_versions', policy_record.policyname);
  END LOOP;
END
$$;

CREATE POLICY "Template layouts manage by developer or exception user"
  ON public.template_layouts
  FOR ALL
  TO authenticated
  USING (
    public.is_developer(auth.uid())
    OR auth.uid() = 'f1ba5ea7-2d3d-4171-b651-c1917655e5b1'::uuid
  )
  WITH CHECK (
    public.is_developer(auth.uid())
    OR auth.uid() = 'f1ba5ea7-2d3d-4171-b651-c1917655e5b1'::uuid
  );

CREATE POLICY "Template layout items manage by developer or exception user"
  ON public.template_layout_items
  FOR ALL
  TO authenticated
  USING (
    public.is_developer(auth.uid())
    OR auth.uid() = 'f1ba5ea7-2d3d-4171-b651-c1917655e5b1'::uuid
  )
  WITH CHECK (
    public.is_developer(auth.uid())
    OR auth.uid() = 'f1ba5ea7-2d3d-4171-b651-c1917655e5b1'::uuid
  );

CREATE POLICY "Template layout versions manage by developer or exception user"
  ON public.template_layout_versions
  FOR ALL
  TO authenticated
  USING (
    public.is_developer(auth.uid())
    OR auth.uid() = 'f1ba5ea7-2d3d-4171-b651-c1917655e5b1'::uuid
  )
  WITH CHECK (
    public.is_developer(auth.uid())
    OR auth.uid() = 'f1ba5ea7-2d3d-4171-b651-c1917655e5b1'::uuid
  );

CREATE POLICY "Template layouts select authenticated"
  ON public.template_layouts
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Template layout items select authenticated"
  ON public.template_layout_items
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Template layout versions select authenticated"
  ON public.template_layout_versions
  FOR SELECT
  TO authenticated
  USING (true);
