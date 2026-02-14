
-- 1. Novos campos em companies para taxa variável
ALTER TABLE public.companies
  ADD COLUMN platform_fee_percent numeric NOT NULL DEFAULT 7.5,
  ADD COLUMN partner_split_percent numeric NOT NULL DEFAULT 50;

-- 2. Tabela de parceiros (sócio da plataforma, sem company_id)
CREATE TABLE public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  stripe_account_id text,
  stripe_onboarding_complete boolean NOT NULL DEFAULT false,
  split_percent numeric NOT NULL DEFAULT 50,
  status text NOT NULL DEFAULT 'ativo',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gerentes can manage partners"
  ON public.partners FOR ALL
  USING (public.has_role(auth.uid(), 'gerente'::user_role))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'::user_role));

-- Trigger de updated_at
CREATE TRIGGER set_partners_updated_at
  BEFORE UPDATE ON public.partners
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Novos campos financeiros em sales
ALTER TABLE public.sales
  ADD COLUMN gross_amount numeric,
  ADD COLUMN platform_fee_total numeric,
  ADD COLUMN partner_fee_amount numeric,
  ADD COLUMN platform_net_amount numeric,
  ADD COLUMN stripe_transfer_id text;
