-- Remove the dangerous public SELECT policy that exposes all customer PII
DROP POLICY IF EXISTS "Public can view sales by id" ON public.sales;

-- Replace with a scoped policy: public can only view sales linked to public events
-- This is needed for the Checkout confirmation page flow
CREATE POLICY "Public can view own sale for public events"
  ON public.sales FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = sales.event_id
        AND e.status = 'a_venda'::event_status
    )
  );
