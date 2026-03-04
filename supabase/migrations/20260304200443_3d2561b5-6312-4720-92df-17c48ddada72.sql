
-- =====================================================================
-- Fase 1 — Personalização da Vitrine Pública
-- 
-- 1a. Novos campos em companies: cover_image_url, intro_text, background_style
-- 1b. Adicionar company_id em sponsors com backfill (MVP single-company)
-- 1c. Atualizar RLS de sponsors para multi-tenant (gerente + público)
-- =====================================================================

-- 1a. Novos campos em companies para personalização da vitrine pública
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS intro_text text,
  ADD COLUMN IF NOT EXISTS background_style text NOT NULL DEFAULT 'solid';

-- Enum fechado via CHECK constraint (evita valores arbitrários)
ALTER TABLE public.companies
  ADD CONSTRAINT companies_background_style_check
  CHECK (background_style IN ('solid', 'subtle_gradient', 'cover_overlay'));

-- 1b. Adicionar company_id em sponsors para multi-tenant
ALTER TABLE public.sponsors
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- Backfill: preencher com a primeira empresa existente (MVP single-company).
-- Em produção com múltiplas empresas, ajustar manualmente antes de tornar NOT NULL.
UPDATE public.sponsors
  SET company_id = (SELECT id FROM public.companies ORDER BY created_at ASC LIMIT 1)
  WHERE company_id IS NULL;

-- Tornar NOT NULL após backfill (garante integridade futura)
ALTER TABLE public.sponsors
  ALTER COLUMN company_id SET NOT NULL;

-- Índice composto para queries públicas ordenadas por empresa + status + ordem
CREATE INDEX IF NOT EXISTS idx_sponsors_company_status_order
  ON public.sponsors (company_id, status, carousel_order, created_at);

-- 1c. Atualizar RLS de sponsors: substituir policies globais por multi-tenant
DROP POLICY IF EXISTS "Admins can manage sponsors" ON public.sponsors;
DROP POLICY IF EXISTS "Admins can view sponsors" ON public.sponsors;
DROP POLICY IF EXISTS "Public can view active sponsors" ON public.sponsors;

-- Gerente (ou developer) pode CRUD sponsors apenas da sua empresa
CREATE POLICY "Gerente can manage sponsors"
  ON public.sponsors FOR ALL TO authenticated
  USING (
    (has_role(auth.uid(), 'gerente') OR is_developer(auth.uid()))
    AND user_belongs_to_company(auth.uid(), company_id)
  )
  WITH CHECK (
    (has_role(auth.uid(), 'gerente') OR is_developer(auth.uid()))
    AND user_belongs_to_company(auth.uid(), company_id)
  );

-- Público pode ver apenas sponsors ativos (filtro por company_id fica na query client-side)
CREATE POLICY "Public can view active sponsors"
  ON public.sponsors FOR SELECT
  USING (status = 'ativo');
