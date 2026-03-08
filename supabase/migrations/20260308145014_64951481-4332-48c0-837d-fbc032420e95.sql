
-- Tabela de parceiros comerciais da empresa (separada de partners/sócios e sponsors/patrocinadores)
CREATE TABLE public.commercial_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'ativo',
  display_order integer NOT NULL DEFAULT 1,
  partner_tier text NOT NULL DEFAULT 'basico',
  logo_url text,
  website_url text,
  instagram_url text,
  whatsapp_phone text,
  contact_phone text,
  contact_email text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.commercial_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage commercial_partners"
  ON public.commercial_partners FOR ALL TO authenticated
  USING (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Public can view active commercial_partners"
  ON public.commercial_partners FOR SELECT TO anon, authenticated
  USING (status = 'ativo' AND EXISTS (
    SELECT 1 FROM companies c WHERE c.id = commercial_partners.company_id AND c.is_active = true
  ));

-- Trigger updated_at
CREATE TRIGGER update_commercial_partners_updated_at
  BEFORE UPDATE ON public.commercial_partners
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
