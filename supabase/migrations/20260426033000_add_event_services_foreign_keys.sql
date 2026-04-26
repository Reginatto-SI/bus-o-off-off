-- Módulo Passeios & Serviços (correção mínima):
-- adiciona integridade referencial explícita ao vínculo event_services.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'event_services_event_id_fkey'
  ) THEN
    ALTER TABLE public.event_services
      ADD CONSTRAINT event_services_event_id_fkey
      FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'event_services_service_id_fkey'
  ) THEN
    ALTER TABLE public.event_services
      ADD CONSTRAINT event_services_service_id_fkey
      FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE RESTRICT;
  END IF;
END
$$;
