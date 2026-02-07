-- Criar tabela de patrocinadores globais (não vinculados a eventos)
CREATE TABLE public.sponsors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo',
  carousel_order INTEGER NOT NULL DEFAULT 1 CHECK (carousel_order >= 0),
  banner_url TEXT,
  link_type TEXT NOT NULL DEFAULT 'site' CHECK (link_type IN ('site', 'whatsapp')),
  site_url TEXT,
  whatsapp_phone TEXT,
  whatsapp_message TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sponsors IS 'Patrocinadores globais do app (carrossel do topo).';
COMMENT ON COLUMN public.sponsors.carousel_order IS 'Define a ordem do carrossel (menor = mais à esquerda).';
COMMENT ON COLUMN public.sponsors.banner_url IS 'URL pública do banner (600x150 recomendado).';
COMMENT ON COLUMN public.sponsors.link_type IS 'Tipo de redirecionamento: site ou whatsapp.';

-- Habilitar RLS
ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;

-- Policies: admins gerenciam, público pode visualizar ativos (para consumo no app)
CREATE POLICY "Admins can view sponsors" ON public.sponsors
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage sponsors" ON public.sponsors
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Public can view active sponsors" ON public.sponsors
  FOR SELECT TO anon
  USING (status = 'ativo');

-- Trigger de updated_at
CREATE TRIGGER update_sponsors_updated_at
  BEFORE UPDATE ON public.sponsors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
