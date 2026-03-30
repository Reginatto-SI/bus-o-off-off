-- =====================================================================
-- Hero da vitrine pública: etiquetas centrais editáveis por empresa
-- Reutiliza a mesma tabela/configuração de aparência (companies), sem fluxo paralelo.
-- =====================================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS hero_badge_labels text[];

COMMENT ON COLUMN public.companies.hero_badge_labels IS
  'Etiquetas centrais da hero da vitrine pública (ordem: passagens, embarque, compra, atendimento).';
