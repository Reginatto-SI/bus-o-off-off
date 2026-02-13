-- Ajuste de modelagem para permitir o mesmo local em Ida e Volta do mesmo evento.
-- Antes: UNIQUE(event_id, boarding_location_id) bloqueava cópia Ida -> Volta.
-- Agora: UNIQUE(event_id, trip_id, boarding_location_id), respeitando escopo da viagem.

ALTER TABLE public.event_boarding_locations
  DROP CONSTRAINT IF EXISTS event_boarding_locations_event_id_boarding_location_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_boarding_locations_event_trip_location_unique
  ON public.event_boarding_locations(event_id, trip_id, boarding_location_id);
