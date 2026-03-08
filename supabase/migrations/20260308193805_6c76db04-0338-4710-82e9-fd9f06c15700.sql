CREATE POLICY "Drivers can view tickets of their company"
ON public.tickets
FOR SELECT
TO authenticated
USING (user_belongs_to_company(auth.uid(), company_id));