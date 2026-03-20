-- Fase 1 do saneamento estrutural dos sócios/split.
-- Apesar do nome legado `partners`, esta tabela representa o beneficiário financeiro
-- usado pela tela /admin/socios e pelo fluxo de split. O objetivo aqui é alinhar
-- schema, multiempresa e código sem executar rename amplo nesta fase.

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

COMMENT ON TABLE public.partners IS
'Entidade financeira legada usada pela tela /admin/socios e pelo split. Apesar do nome "partners", representa sócio/beneficiário financeiro.';

COMMENT ON COLUMN public.partners.company_id IS
'Empresa dona do vínculo do sócio financeiro. Campo obrigatório para o modelo multiempresa.';

COMMENT ON COLUMN public.partners.split_percent IS
'Campo legado da fase Stripe. A fonte oficial atual do percentual de split por empresa está em companies.partner_split_percent.';

DO $$
DECLARE
  v_companies_count integer;
BEGIN
  SELECT COUNT(*) INTO v_companies_count FROM public.companies;

  IF EXISTS (SELECT 1 FROM public.partners WHERE company_id IS NULL) THEN
    IF v_companies_count = 1 THEN
      UPDATE public.partners
      SET company_id = (SELECT id FROM public.companies LIMIT 1)
      WHERE company_id IS NULL;
    ELSIF EXISTS (SELECT 1 FROM public.partners) THEN
      RAISE EXCEPTION
        'partners.company_id requires manual backfill before this migration can continue in multi-company environments';
    END IF;
  END IF;
END $$;

ALTER TABLE public.partners
  ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_partners_company_status
  ON public.partners (company_id, status, created_at);

DROP POLICY IF EXISTS "Gerentes can manage partners" ON public.partners;
DROP POLICY IF EXISTS "Gerentes and developers can manage partners" ON public.partners;

CREATE POLICY "Gerentes and developers can manage partners by company"
  ON public.partners FOR ALL TO authenticated
  USING (
    (has_role(auth.uid(), 'gerente'::user_role) OR is_developer(auth.uid()))
    AND user_belongs_to_company(auth.uid(), company_id)
  )
  WITH CHECK (
    (has_role(auth.uid(), 'gerente'::user_role) OR is_developer(auth.uid()))
    AND user_belongs_to_company(auth.uid(), company_id)
  );
