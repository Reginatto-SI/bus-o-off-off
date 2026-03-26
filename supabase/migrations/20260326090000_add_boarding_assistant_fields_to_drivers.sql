-- Extensão mínima do cadastro operacional reaproveitando a tabela drivers.
-- Mantemos um único fluxo de vínculo em user_roles.driver_id e diferenciamos por operational_role.
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS operational_role text NOT NULL DEFAULT 'motorista',
  ADD COLUMN IF NOT EXISTS rg text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS number text,
  ADD COLUMN IF NOT EXISTS complement text,
  ADD COLUMN IF NOT EXISTS neighborhood text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text;

ALTER TABLE public.drivers
  DROP CONSTRAINT IF EXISTS drivers_operational_role_check;

ALTER TABLE public.drivers
  ADD CONSTRAINT drivers_operational_role_check
  CHECK (operational_role IN ('motorista', 'auxiliar_embarque'));

CREATE INDEX IF NOT EXISTS idx_drivers_company_operational_role
  ON public.drivers (company_id, operational_role);
