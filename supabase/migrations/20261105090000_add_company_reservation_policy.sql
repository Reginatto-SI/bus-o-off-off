-- Fase 1 (reservas): política oficial por empresa para validade de reservas manuais.
-- Mantemos armazenamento técnico em minutos totais para simplificar cálculo e limpeza,
-- enquanto a UX no admin continua em horas + minutos.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS allow_manual_reservations boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS manual_reservation_ttl_minutes integer NOT NULL DEFAULT 4320;

COMMENT ON COLUMN public.companies.allow_manual_reservations IS
  'Permite criação de reservas manuais administrativas para a empresa.';

COMMENT ON COLUMN public.companies.manual_reservation_ttl_minutes IS
  'Validade padrão (em minutos) aplicada às reservas manuais administrativas.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'companies_manual_reservation_ttl_minutes_check'
      AND conrelid = 'public.companies'::regclass
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_manual_reservation_ttl_minutes_check
      CHECK (manual_reservation_ttl_minutes > 0);
  END IF;
END;
$$;
