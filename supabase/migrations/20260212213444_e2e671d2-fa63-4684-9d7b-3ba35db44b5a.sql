
-- 1. Add 'cancelado' to sale_status enum
ALTER TYPE sale_status ADD VALUE 'cancelado';

-- 2. Add cancellation columns to sales
ALTER TABLE public.sales ADD COLUMN cancel_reason text;
ALTER TABLE public.sales ADD COLUMN cancelled_at timestamptz;
ALTER TABLE public.sales ADD COLUMN cancelled_by uuid;

-- 3. Create sale_logs table
CREATE TABLE public.sale_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  action text NOT NULL,
  description text NOT NULL,
  old_value text,
  new_value text,
  performed_by uuid,
  company_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sale_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sale_logs"
  ON public.sale_logs FOR ALL
  USING (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id));
