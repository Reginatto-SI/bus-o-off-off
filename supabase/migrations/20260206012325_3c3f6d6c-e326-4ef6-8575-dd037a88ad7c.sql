-- 1. Adicionar role 'motorista' ao enum user_role
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'motorista';

-- 2. Adicionar coluna driver_id na tabela user_roles para vínculo com motoristas
ALTER TABLE public.user_roles 
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.user_roles.driver_id IS 'Vínculo com cadastro de motorista (quando role = motorista)';

-- 3. Adicionar coluna status na tabela profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo';

COMMENT ON COLUMN public.profiles.status IS 'Status do usuário: ativo ou inativo';

-- 4. Adicionar coluna notes na tabela profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.profiles.notes IS 'Observações internas sobre o usuário';

-- 5. RLS: Gerentes podem visualizar todos os perfis da empresa
CREATE POLICY "Gerentes can view company profiles"
  ON public.profiles FOR SELECT
  USING (
    public.has_role(auth.uid(), 'gerente'::user_role) AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = profiles.id
        AND ur.company_id IN (
          SELECT company_id FROM public.user_roles WHERE user_id = auth.uid()
        )
    )
  );

-- 6. RLS: Gerentes podem atualizar perfis da empresa
CREATE POLICY "Gerentes can update company profiles"
  ON public.profiles FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'gerente'::user_role) AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = profiles.id
        AND ur.company_id IN (
          SELECT company_id FROM public.user_roles WHERE user_id = auth.uid()
        )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'gerente'::user_role) AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = profiles.id
        AND ur.company_id IN (
          SELECT company_id FROM public.user_roles WHERE user_id = auth.uid()
        )
    )
  );