-- Corrige o isolamento multiempresa de user_roles e remove o legado que
-- atribuía empresa padrão no trigger de profile. user_roles permanece como
-- fonte oficial do vínculo empresa-usuário.

-- 1) Substituir policies amplas de user_roles por regras com escopo de company_id.
DROP POLICY IF EXISTS "Admins can view all user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Gerente and developer can manage user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Gerentes and developers can view company user_roles" ON public.user_roles;

CREATE POLICY "Users can view own user_roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Gerentes and developers can view company user_roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  public.user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Gerentes and developers can manage company user_roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  (
    public.has_role(auth.uid(), 'gerente'::user_role)
    OR public.has_role(auth.uid(), 'developer'::user_role)
  )
  AND public.user_belongs_to_company(auth.uid(), company_id)
)
WITH CHECK (
  (
    public.has_role(auth.uid(), 'gerente'::user_role)
    OR public.has_role(auth.uid(), 'developer'::user_role)
  )
  AND public.user_belongs_to_company(auth.uid(), company_id)
);

-- 2) Recriar o trigger de profile sem forçar empresa padrão.
-- O problema anterior era contaminar profiles.company_id com fallback global,
-- desviando o contexto multiempresa. O trigger agora cria só o profile mínimo.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, company_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NULL
  );
  RETURN NEW;
END;
$$;
