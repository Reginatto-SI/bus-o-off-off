-- Numeração global oficial das passagens (ticket individual).
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS ticket_number text;

COMMENT ON COLUMN public.tickets.ticket_number IS 'Número oficial global da passagem no formato SB-000001. Vinculado ao ticket individual.';

CREATE SEQUENCE IF NOT EXISTS public.ticket_global_number_seq;

DO $$
DECLARE
  v_max_existing bigint;
BEGIN
  SELECT COALESCE(
    MAX((substring(ticket_number FROM '^SB-(\d+)$'))::bigint),
    0
  )
  INTO v_max_existing
  FROM public.tickets
  WHERE ticket_number ~ '^SB-[0-9]{6,}$';

  IF v_max_existing > 0 THEN
    PERFORM setval('public.ticket_global_number_seq', v_max_existing, true);
  ELSE
    PERFORM setval('public.ticket_global_number_seq', 1, false);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.assign_global_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Regra de negócio: o número oficial pertence ao ticket individual,
  -- não à venda agrupada. Geramos no INSERT para manter imutabilidade.
  IF NEW.ticket_number IS NULL OR btrim(NEW.ticket_number) = '' THEN
    NEW.ticket_number := 'SB-' || lpad(nextval('public.ticket_global_number_seq')::text, 6, '0');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_global_ticket_number ON public.tickets;
CREATE TRIGGER trg_assign_global_ticket_number
  BEFORE INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_global_ticket_number();

-- Backfill seguro para legados sem número. Mantém telas funcionando sem quebra.
UPDATE public.tickets
SET ticket_number = 'SB-' || lpad(nextval('public.ticket_global_number_seq')::text, 6, '0')
WHERE ticket_number IS NULL OR btrim(ticket_number) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_ticket_number
  ON public.tickets (ticket_number)
  WHERE ticket_number IS NOT NULL;
