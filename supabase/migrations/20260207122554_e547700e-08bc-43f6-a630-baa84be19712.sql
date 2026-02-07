-- Parte 1.1: Alterar tabela trips - Horário Opcional para Volta
-- Tornar departure_time nullable para suportar "A definir"
ALTER TABLE public.trips 
  ALTER COLUMN departure_time DROP NOT NULL;

-- Adicionar campo para vínculo de par (ida/volta)
ALTER TABLE public.trips 
  ADD COLUMN IF NOT EXISTS paired_trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.trips.departure_time IS 'Horário base da viagem. NULL = A definir (comum na volta)';
COMMENT ON COLUMN public.trips.paired_trip_id IS 'ID da viagem par (ida vinculada a volta e vice-versa)';

-- Parte 1.2: Adicionar ordem nos embarques
ALTER TABLE public.event_boarding_locations 
  ADD COLUMN IF NOT EXISTS stop_order integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.event_boarding_locations.stop_order IS 'Ordem da parada na rota (1 = primeira)';