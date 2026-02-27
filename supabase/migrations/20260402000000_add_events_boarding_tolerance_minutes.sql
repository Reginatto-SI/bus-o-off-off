-- Tolerância de embarque por evento (em minutos).
-- Mantemos nullable para permitir eventos sem tolerância explícita,
-- com default operacional de 10 minutos para novos registros.
ALTER TABLE public.events
ADD COLUMN boarding_tolerance_minutes integer DEFAULT 10;

ALTER TABLE public.events
ADD CONSTRAINT events_boarding_tolerance_minutes_positive_check
CHECK (boarding_tolerance_minutes IS NULL OR boarding_tolerance_minutes > 0);
