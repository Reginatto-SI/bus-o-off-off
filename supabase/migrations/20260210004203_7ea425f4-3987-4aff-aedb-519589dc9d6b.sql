
-- Allow public insert on seats for auto-generation during public checkout
CREATE POLICY "Public can create seats for public vehicles"
  ON public.seats FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trips t
      JOIN events e ON e.id = t.event_id
      WHERE t.vehicle_id = seats.vehicle_id
      AND e.status = 'a_venda'
    )
  );
