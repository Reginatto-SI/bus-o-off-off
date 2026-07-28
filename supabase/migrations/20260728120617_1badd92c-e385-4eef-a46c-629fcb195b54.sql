-- Sócio global da plataforma: remove dependência de empresa cliente
-- ROLLBACK: recriar FK/NOT NULL em company_id, dropar idx uq_socios_split_single_active,
-- dropar as 4 policies novas e recriar a policy "Gerentes and developers can manage socios_split by company".

ALTER TABLE public.socios_split DROP CONSTRAINT IF EXISTS socios_split_company_id_fkey;
ALTER TABLE public.socios_split ALTER COLUMN company_id DROP NOT NULL;

UPDATE public.socios_split SET company_id = NULL WHERE company_id IS NOT NULL;

DROP INDEX IF EXISTS public.idx_socios_split_company_status;
CREATE INDEX IF NOT EXISTS idx_socios_split_status ON public.socios_split (status, created_at);

-- No máximo um sócio global ativo
CREATE UNIQUE INDEX IF NOT EXISTS uq_socios_split_single_active
  ON public.socios_split ((true)) WHERE status = 'ativo';

DROP POLICY IF EXISTS "Gerentes and developers can manage socios_split by company" ON public.socios_split;

ALTER TABLE public.socios_split ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.socios_split TO authenticated;
GRANT ALL ON public.socios_split TO service_role;

CREATE POLICY "Developers can view global socio" ON public.socios_split
  FOR SELECT TO authenticated USING (public.is_developer(auth.uid()));

CREATE POLICY "Developers can insert global socio" ON public.socios_split
  FOR INSERT TO authenticated WITH CHECK (public.is_developer(auth.uid()));

CREATE POLICY "Developers can update global socio" ON public.socios_split
  FOR UPDATE TO authenticated USING (public.is_developer(auth.uid())) WITH CHECK (public.is_developer(auth.uid()));

CREATE POLICY "Developers can delete global socio" ON public.socios_split
  FOR DELETE TO authenticated USING (public.is_developer(auth.uid()));

COMMENT ON TABLE public.socios_split IS 'Configuracao GLOBAL do socio da plataforma SmartBus BR. company_id e legado (sem uso operacional). Maximo 1 registro ativo. Acesso restrito a developer.';
COMMENT ON COLUMN public.socios_split.company_id IS 'LEGADO - nao usar. Mantido apenas para rastreabilidade historica.';