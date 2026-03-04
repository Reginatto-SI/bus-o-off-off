-- Hardening Fase 1: RLS sponsors — isolamento por tenant
-- Substitui policy pública permissiva por uma que exige empresa ativa com public_slug,
-- eliminando dependência do filtro client-side para isolamento cross-tenant.
DROP POLICY IF EXISTS "Public can view active sponsors" ON public.sponsors;

CREATE POLICY "Public can view active sponsors of public companies"
  ON public.sponsors FOR SELECT
  USING (
    status = 'ativo'
    AND EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = sponsors.company_id
        AND c.is_active = true
        AND c.public_slug IS NOT NULL
    )
  );