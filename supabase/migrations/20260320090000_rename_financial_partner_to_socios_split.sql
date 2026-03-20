-- Fase 4 — rename semântico controlado da entidade financeira de sócios/split.
-- Objetivo: remover a ambiguidade do nome legado `partners` no contexto financeiro,
-- preservando multiempresa, RLS, índices e o comportamento das validações da Fase 3.

ALTER TABLE public.partners RENAME TO socios_split;
ALTER TABLE public.companies RENAME COLUMN partner_split_percent TO socio_split_percent;
ALTER TABLE public.sales RENAME COLUMN partner_fee_amount TO socio_fee_amount;
ALTER TABLE public.socios_split RENAME COLUMN split_percent TO commission_percent;

ALTER INDEX IF EXISTS public.idx_partners_company_status RENAME TO idx_socios_split_company_status;
ALTER INDEX IF EXISTS public.partners_pkey RENAME TO socios_split_pkey;

ALTER TABLE public.socios_split RENAME CONSTRAINT partners_company_id_fkey TO socios_split_company_id_fkey;

DROP POLICY IF EXISTS "Gerentes can manage partners" ON public.socios_split;
DROP POLICY IF EXISTS "Gerentes and developers can manage partners" ON public.socios_split;
DROP POLICY IF EXISTS "Gerentes and developers can manage partners by company" ON public.socios_split;

CREATE POLICY "Gerentes and developers can manage socios_split by company"
  ON public.socios_split FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.company_id = socios_split.company_id
        AND ur.role IN ('gerente', 'developer')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.company_id = socios_split.company_id
        AND ur.role IN ('gerente', 'developer')
    )
  );

COMMENT ON TABLE public.socios_split IS
'Entidade financeira oficial usada pela tela /admin/socios e pelo split. Cada registro representa o sócio beneficiário financeiro da empresa.';

COMMENT ON COLUMN public.socios_split.company_id IS
'Empresa dona do vínculo do sócio financeiro. Campo obrigatório para o modelo multiempresa.';

COMMENT ON COLUMN public.socios_split.commission_percent IS
'Percentual legado do beneficiário financeiro no período Stripe. Mantido para histórico; a fonte oficial atual do split por empresa está em companies.socio_split_percent.';

COMMENT ON COLUMN public.companies.socio_split_percent IS
'Percentual da comissão da plataforma repassado ao sócio financeiro ativo via split.';

COMMENT ON COLUMN public.sales.socio_fee_amount IS
'Valor efetivamente repassado ao sócio financeiro no fechamento da venda.';
