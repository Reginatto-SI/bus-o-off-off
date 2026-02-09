
-- Trips: acesso público para eventos à venda
CREATE POLICY "Public can view trips for public events"
  ON public.trips FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = trips.event_id
      AND e.status = 'a_venda'
    )
  );

-- Event boarding locations: acesso público para eventos à venda
CREATE POLICY "Public can view boarding locations for public events"
  ON public.event_boarding_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_boarding_locations.event_id
      AND e.status = 'a_venda'
    )
  );

-- Vehicles: acesso público quando vinculado a evento à venda
CREATE POLICY "Public can view vehicles for public events"
  ON public.vehicles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trips t
      JOIN events e ON e.id = t.event_id
      WHERE t.vehicle_id = vehicles.id
      AND e.status = 'a_venda'
    )
  );
