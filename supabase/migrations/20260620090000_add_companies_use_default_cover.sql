-- Vitrine pública: fallback automático de capa padrão + opção explícita de remoção/restauração.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS use_default_cover boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.companies.use_default_cover IS
  'Quando true e cover_image_url for null, a vitrine usa a imagem padrão do sistema (/assets/vitrine/Img_padrao_vitrine.png).';

-- Backfill seguro para empresas existentes sem capa personalizada:
-- mantém comportamento atual para quem já tem cover_image_url e ativa fallback automático para quem não tem.
UPDATE public.companies
SET use_default_cover = true
WHERE cover_image_url IS NULL;
