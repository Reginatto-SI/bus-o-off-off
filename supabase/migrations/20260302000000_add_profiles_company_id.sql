-- =============================================
-- Ajuste rápido multiempresa (profiles)
-- =============================================
-- Objetivo: armazenar empresa ativa no profile sem alterar a fonte de verdade (user_roles).

-- 1) Adicionar company_id em profiles (nullable para backfill seguro)
ALTER TABLE public.profiles
ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

-- 2) Backfill de company_id seguindo as regras:
--    - 1 empresa: usar essa company_id
--    - >1 empresa: usar a primeira por ordem de id
--    - 0 empresa: usar empresa padrão já criada
WITH ranked_roles AS (
  SELECT
    user_id,
    company_id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY id) AS rn
  FROM public.user_roles
),
selected_role AS (
  SELECT user_id, company_id
  FROM ranked_roles
  WHERE rn = 1
)
UPDATE public.profiles p
SET company_id = sr.company_id
FROM selected_role sr
WHERE p.id = sr.user_id
  AND p.company_id IS NULL;

-- Preencher quem não tem vínculo com empresa usando a empresa padrão existente
UPDATE public.profiles
SET company_id = 'a0000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;

-- 3) Trigger de criação de profile: definir company_id automaticamente
--    Prioridade:
--      1. Empresa padrão (quando existir)
--      2. Empresa do user_roles (se já existir no momento do trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  -- Prioriza empresa padrão já criada
  SELECT id
    INTO v_company_id
  FROM public.companies
  WHERE id = 'a0000000-0000-0000-0000-000000000001'
  LIMIT 1;

  -- Se não existir empresa padrão, tenta usar vínculo já existente em user_roles
  IF v_company_id IS NULL THEN
    SELECT company_id
      INTO v_company_id
    FROM public.user_roles
    WHERE user_id = NEW.id
    ORDER BY id
    LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, name, email, company_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    v_company_id
  );
  RETURN NEW;
END;
$$;

-- 4) Bloquear alteração de company_id por usuários não-admin
CREATE OR REPLACE FUNCTION public.prevent_profile_company_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
     AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'company_id somente pode ser alterado por administradores';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_company_change ON public.profiles;
CREATE TRIGGER prevent_profile_company_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_company_change();

-- 5) Ajustar RLS de profiles: usuário só vê/atualiza o próprio profile
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Admins podem ajustar profiles (ex.: company_id) quando necessário
CREATE POLICY "Admins can update profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));
