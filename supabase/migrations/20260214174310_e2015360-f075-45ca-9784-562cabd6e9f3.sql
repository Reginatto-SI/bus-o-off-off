-- Allow public read access to companies that have active events
CREATE POLICY "Public can view companies with public events"
  ON public.companies FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.company_id = companies.id
      AND e.status = 'a_venda'
    )
  );
