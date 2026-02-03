-- Inserir vínculo do usuário existente com a empresa padrão
INSERT INTO user_roles (user_id, company_id, role)
SELECT 
  p.id as user_id,
  'a0000000-0000-0000-0000-000000000001' as company_id,
  'gerente' as role
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM user_roles ur WHERE ur.user_id = p.id
);

-- Atualizar trigger para criar vínculo automático para novos usuários
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id UUID := 'a0000000-0000-0000-0000-000000000001';
BEGIN
  -- Criar perfil
  INSERT INTO public.profiles (id, name, email, company_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    v_company_id
  );

  -- Criar vínculo inicial como gerente na empresa padrão
  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (NEW.id, v_company_id, 'gerente')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;