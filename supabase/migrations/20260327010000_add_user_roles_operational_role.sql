-- Identificação operacional complementar para usuários com role técnica "motorista".
-- Não altera RBAC: permissões continuam baseadas em user_roles.role.
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS operational_role text;

COMMENT ON COLUMN public.user_roles.operational_role IS
'Identificação operacional visual/cadastral para role motorista (motorista|auxiliar_embarque). Não substitui role técnica.';

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_operational_role_check;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_operational_role_check
  CHECK (operational_role IS NULL OR operational_role IN ('motorista', 'auxiliar_embarque'));

-- Compatibilidade retroativa: registros antigos de role motorista
-- assumem identificação operacional "motorista".
UPDATE public.user_roles
SET operational_role = 'motorista'
WHERE role = 'motorista'
  AND operational_role IS NULL;
