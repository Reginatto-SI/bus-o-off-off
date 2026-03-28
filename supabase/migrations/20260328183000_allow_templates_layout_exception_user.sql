-- Exceção pontual de acesso: libera gestão completa do catálogo global de templates
-- para um usuário específico sem alterar a role técnica dele no user_roles.

DROP POLICY IF EXISTS "Developer can manage template layouts" ON public.template_layouts;
CREATE POLICY "Developer can manage template layouts"
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

DROP POLICY IF EXISTS "Developer can manage template layout items" ON public.template_layout_items;
CREATE POLICY "Developer can manage template layout items"
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

DROP POLICY IF EXISTS "Developer can manage template layout versions" ON public.template_layout_versions;
CREATE POLICY "Developer can manage template layout versions"
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
