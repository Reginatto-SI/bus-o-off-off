-- Add driver details for CPF/validação, CNH complementos e status
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS cnh_category TEXT,
  ADD COLUMN IF NOT EXISTS cnh_expires_at DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ativo';

-- CPF deve ser único quando preenchido
CREATE UNIQUE INDEX IF NOT EXISTS drivers_cpf_unique ON public.drivers (cpf);
