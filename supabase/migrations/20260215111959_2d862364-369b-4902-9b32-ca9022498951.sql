
DROP POLICY "Gerente can manage user_roles" ON public.user_roles;
CREATE POLICY "Gerente and developer can manage user_roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'gerente'::user_role)
    OR has_role(auth.uid(), 'developer'::user_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'gerente'::user_role)
    OR has_role(auth.uid(), 'developer'::user_role)
  );
