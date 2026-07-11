-- Toda empresa nasce como representante comercial.
-- Esta migration é incremental e preserva vínculos de origem em representative_company_links,
-- snapshots históricos em sales.representative_id e ledger em representative_commissions.

ALTER TABLE public.representatives
  ADD COLUMN IF NOT EXISTS company_id uuid NULL REFERENCES public.companies(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.representatives.company_id IS
  'Empresa dona deste perfil de representante comercial. Não representa a empresa indicada; a origem comercial continua em representative_company_links.';

CREATE UNIQUE INDEX IF NOT EXISTS representatives_company_id_unique_idx
  ON public.representatives (company_id)
  WHERE company_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ensure_company_representative(p_company_id uuid)
RETURNS public.representatives
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company public.companies%ROWTYPE;
  v_representative public.representatives%ROWTYPE;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id_required';
  END IF;

  SELECT *
    INTO v_company
  FROM public.companies
  WHERE id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'company_not_found'
      USING DETAIL = 'Empresa informada não existe.';
  END IF;

  SELECT *
    INTO v_representative
  FROM public.representatives
  WHERE company_id = p_company_id
  LIMIT 1;

  IF FOUND THEN
    RETURN v_representative;
  END IF;

  INSERT INTO public.representatives (
    company_id,
    user_id,
    name,
    email,
    phone,
    document_number,
    status
  ) VALUES (
    p_company_id,
    NULL,
    COALESCE(NULLIF(trim(v_company.trade_name), ''), NULLIF(trim(v_company.name), ''), 'Empresa'),
    NULLIF(trim(COALESCE(v_company.email, '')), ''),
    NULLIF(trim(COALESCE(v_company.phone, '')), ''),
    NULLIF(trim(COALESCE(v_company.document_number, v_company.document, v_company.cnpj, '')), ''),
    'ativo'
  )
  ON CONFLICT (company_id) WHERE company_id IS NOT NULL DO NOTHING
  RETURNING * INTO v_representative;

  IF NOT FOUND THEN
    SELECT *
      INTO v_representative
    FROM public.representatives
    WHERE company_id = p_company_id
    LIMIT 1;
  END IF;

  RETURN v_representative;
END;
$$;

COMMENT ON FUNCTION public.ensure_company_representative(uuid) IS
  'Garante, de forma idempotente, o perfil de representante próprio de uma empresa. Não altera representative_company_links nem histórico financeiro.';

REVOKE ALL ON FUNCTION public.ensure_company_representative(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_company_representative(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_company_representative(uuid) TO service_role;

-- Backfill idempotente: cria perfil próprio para todas as empresas existentes.
DO $$
DECLARE
  v_company_id uuid;
BEGIN
  FOR v_company_id IN SELECT id FROM public.companies LOOP
    PERFORM public.ensure_company_representative(v_company_id);
  END LOOP;
END $$;

-- RLS: substituir as políticas amplas do módulo de representantes por escopos de empresa/representante.
DROP POLICY IF EXISTS "Users can view own representative profile" ON public.representatives;
CREATE POLICY "Users can view own or company representative profile"
ON public.representatives
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_developer(auth.uid())
  OR (
    company_id IS NOT NULL
    AND public.user_belongs_to_company(auth.uid(), company_id)
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.company_id = representatives.company_id
        AND ur.role = 'gerente'
    )
  )
);

DROP POLICY IF EXISTS "Admins can manage representatives" ON public.representatives;
DROP POLICY IF EXISTS "Admins can manage company representatives" ON public.representatives;
CREATE POLICY "Developers can manage representatives"
ON public.representatives
FOR ALL
TO authenticated
USING (public.is_developer(auth.uid()))
WITH CHECK (public.is_developer(auth.uid()));

-- Updates de wallet passam pela RPC update_representative_wallet para evitar que RLS
-- permita alterar comissão, status, código, link ou vínculos do representante.
DROP POLICY IF EXISTS "External representatives can update own profile" ON public.representatives;

DROP POLICY IF EXISTS "Users can view representative links by company" ON public.representative_company_links;
CREATE POLICY "Users can view representative links by owner company"
ON public.representative_company_links
FOR SELECT
TO authenticated
USING (
  public.is_developer(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.representatives r
    WHERE r.id = representative_company_links.representative_id
      AND (
        r.user_id = auth.uid()
        OR (
          r.company_id IS NOT NULL
          AND public.user_belongs_to_company(auth.uid(), r.company_id)
          AND EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.company_id = r.company_id
              AND ur.role = 'gerente'
          )
        )
      )
  )
);

DROP POLICY IF EXISTS "Admins can manage representative links by company" ON public.representative_company_links;
CREATE POLICY "Developers can manage representative links"
ON public.representative_company_links
FOR ALL
TO authenticated
USING (public.is_developer(auth.uid()))
WITH CHECK (public.is_developer(auth.uid()));

DROP POLICY IF EXISTS "Users can view representative commissions by company" ON public.representative_commissions;
CREATE POLICY "Users can view own representative commissions"
ON public.representative_commissions
FOR SELECT
TO authenticated
USING (
  public.is_developer(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.representatives r
    WHERE r.id = representative_commissions.representative_id
      AND (
        r.user_id = auth.uid()
        OR (r.company_id IS NOT NULL
          AND public.user_belongs_to_company(auth.uid(), r.company_id)
          AND EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.company_id = r.company_id
              AND ur.role = 'gerente'
          ))
      )
  )
);

DROP POLICY IF EXISTS "Admins can manage representative commissions by company" ON public.representative_commissions;
CREATE POLICY "Developers can manage representative commissions"
ON public.representative_commissions
FOR ALL
TO authenticated
USING (public.is_developer(auth.uid()))
WITH CHECK (public.is_developer(auth.uid()));

CREATE OR REPLACE FUNCTION public.get_company_representative_dashboard(p_company_id uuid)
RETURNS TABLE(
  id uuid,
  company_id uuid,
  name text,
  email text,
  phone text,
  status public.representative_status,
  representative_code text,
  referral_link text,
  asaas_wallet_id_production text,
  asaas_wallet_id_sandbox text,
  commission_percent numeric,
  linked_companies_count bigint,
  active_linked_companies_count bigint,
  commission_total numeric,
  commission_paid numeric,
  commission_pending numeric,
  commission_blocked numeric,
  blocked_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rep public.representatives%ROWTYPE;
  v_role text;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id_required';
  END IF;

  IF NOT (public.is_developer(auth.uid()) OR public.user_belongs_to_company(auth.uid(), p_company_id)) THEN
    RAISE EXCEPTION 'representative_dashboard_forbidden';
  END IF;

  SELECT ur.role
    INTO v_role
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
    AND ur.company_id = p_company_id
  ORDER BY CASE ur.role WHEN 'developer' THEN 0 WHEN 'gerente' THEN 1 ELSE 2 END
  LIMIT 1;

  IF NOT (public.is_developer(auth.uid()) OR v_role = 'gerente') THEN
    RAISE EXCEPTION 'representative_dashboard_forbidden';
  END IF;

  v_rep := public.ensure_company_representative(p_company_id);

  RETURN QUERY
  SELECT
    v_rep.id,
    v_rep.company_id,
    v_rep.name,
    v_rep.email,
    v_rep.phone,
    v_rep.status,
    v_rep.representative_code,
    v_rep.referral_link,
    v_rep.asaas_wallet_id_production,
    v_rep.asaas_wallet_id_sandbox,
    v_rep.commission_percent,
    COALESCE((SELECT count(*) FROM public.representative_company_links rcl WHERE rcl.representative_id = v_rep.id), 0)::bigint,
    COALESCE((SELECT count(*) FROM public.representative_company_links rcl JOIN public.companies c ON c.id = rcl.company_id WHERE rcl.representative_id = v_rep.id AND c.is_active = true), 0)::bigint,
    COALESCE((SELECT sum(rc.commission_amount) FROM public.representative_commissions rc WHERE rc.representative_id = v_rep.id), 0)::numeric,
    COALESCE((SELECT sum(rc.commission_amount) FROM public.representative_commissions rc WHERE rc.representative_id = v_rep.id AND rc.status = 'paga'), 0)::numeric,
    COALESCE((SELECT sum(rc.commission_amount) FROM public.representative_commissions rc WHERE rc.representative_id = v_rep.id AND rc.status IN ('pendente', 'disponivel')), 0)::numeric,
    COALESCE((SELECT sum(rc.commission_amount) FROM public.representative_commissions rc WHERE rc.representative_id = v_rep.id AND rc.status = 'bloqueada'), 0)::numeric,
    COALESCE((SELECT count(*) FROM public.representative_commissions rc WHERE rc.representative_id = v_rep.id AND rc.status = 'bloqueada'), 0)::bigint;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_company_representative_links(p_company_id uuid)
RETURNS TABLE(
  id uuid,
  company_id uuid,
  company_name text,
  company_trade_name text,
  company_is_active boolean,
  linked_at timestamptz,
  source_code text,
  link_source public.representative_link_source,
  sales_count bigint,
  commission_total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rep public.representatives%ROWTYPE;
  v_role text;
BEGIN
  IF NOT (public.is_developer(auth.uid()) OR public.user_belongs_to_company(auth.uid(), p_company_id)) THEN
    RAISE EXCEPTION 'representative_links_forbidden';
  END IF;

  SELECT ur.role INTO v_role
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid() AND ur.company_id = p_company_id
  ORDER BY CASE ur.role WHEN 'developer' THEN 0 WHEN 'gerente' THEN 1 ELSE 2 END
  LIMIT 1;

  IF NOT (public.is_developer(auth.uid()) OR v_role = 'gerente') THEN
    RAISE EXCEPTION 'representative_links_forbidden';
  END IF;

  v_rep := public.ensure_company_representative(p_company_id);

  RETURN QUERY
  SELECT
    rcl.id,
    rcl.company_id,
    c.name,
    c.trade_name,
    c.is_active,
    rcl.linked_at,
    rcl.source_code,
    rcl.link_source,
    COALESCE(count(rc.id), 0)::bigint,
    COALESCE(sum(rc.commission_amount), 0)::numeric
  FROM public.representative_company_links rcl
  JOIN public.companies c ON c.id = rcl.company_id
  LEFT JOIN public.representative_commissions rc ON rc.representative_id = v_rep.id AND rc.company_id = rcl.company_id
  WHERE rcl.representative_id = v_rep.id
  GROUP BY rcl.id, rcl.company_id, c.name, c.trade_name, c.is_active, rcl.linked_at, rcl.source_code, rcl.link_source
  ORDER BY rcl.linked_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_company_representative_commissions(p_company_id uuid)
RETURNS TABLE(
  id uuid,
  company_id uuid,
  company_name text,
  company_trade_name text,
  sale_id uuid,
  payment_environment text,
  base_amount numeric,
  commission_percent numeric,
  commission_amount numeric,
  status public.representative_commission_status,
  available_at timestamptz,
  paid_at timestamptz,
  blocked_reason text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rep public.representatives%ROWTYPE;
  v_role text;
BEGIN
  IF NOT (public.is_developer(auth.uid()) OR public.user_belongs_to_company(auth.uid(), p_company_id)) THEN
    RAISE EXCEPTION 'representative_commissions_forbidden';
  END IF;

  SELECT ur.role INTO v_role
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid() AND ur.company_id = p_company_id
  ORDER BY CASE ur.role WHEN 'developer' THEN 0 WHEN 'gerente' THEN 1 ELSE 2 END
  LIMIT 1;

  IF NOT (public.is_developer(auth.uid()) OR v_role = 'gerente') THEN
    RAISE EXCEPTION 'representative_commissions_forbidden';
  END IF;

  v_rep := public.ensure_company_representative(p_company_id);

  RETURN QUERY
  SELECT
    rc.id,
    rc.company_id,
    c.name,
    c.trade_name,
    rc.sale_id,
    rc.payment_environment,
    rc.base_amount,
    rc.commission_percent,
    rc.commission_amount,
    rc.status,
    rc.available_at,
    rc.paid_at,
    rc.blocked_reason,
    rc.created_at
  FROM public.representative_commissions rc
  JOIN public.companies c ON c.id = rc.company_id
  WHERE rc.representative_id = v_rep.id
  ORDER BY rc.created_at DESC
  LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_representative_wallet(
  p_representative_id uuid,
  p_asaas_wallet_id_production text DEFAULT NULL,
  p_asaas_wallet_id_sandbox text DEFAULT NULL
)
RETURNS public.representatives
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rep public.representatives%ROWTYPE;
  v_is_developer boolean;
  v_is_company_manager boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'representative_wallet_unauthenticated';
  END IF;

  SELECT *
    INTO v_rep
  FROM public.representatives
  WHERE id = p_representative_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'representative_not_found';
  END IF;

  v_is_developer := public.is_developer(auth.uid());
  v_is_company_manager := (
    v_rep.company_id IS NOT NULL
    AND public.user_belongs_to_company(auth.uid(), v_rep.company_id)
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.company_id = v_rep.company_id
        AND ur.role = 'gerente'
    )
  );

  IF NOT (
    v_is_developer
    OR (v_rep.company_id IS NULL AND v_rep.user_id = auth.uid())
    OR v_is_company_manager
  ) THEN
    RAISE EXCEPTION 'representative_wallet_forbidden';
  END IF;

  UPDATE public.representatives
  SET
    asaas_wallet_id_production = CASE
      WHEN p_asaas_wallet_id_production IS NULL THEN asaas_wallet_id_production
      ELSE NULLIF(trim(p_asaas_wallet_id_production), '')
    END,
    asaas_wallet_id_sandbox = CASE
      WHEN p_asaas_wallet_id_sandbox IS NULL THEN asaas_wallet_id_sandbox
      ELSE NULLIF(trim(p_asaas_wallet_id_sandbox), '')
    END
  WHERE id = v_rep.id
  RETURNING * INTO v_rep;

  RETURN v_rep;
END;
$$;

COMMENT ON FUNCTION public.update_representative_wallet(uuid, text, text) IS
  'Atualiza somente wallets Asaas permitidas do representante. Não permite alterar comissão, status, código, link, user_id ou company_id.';

REVOKE ALL ON FUNCTION public.update_representative_wallet(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_representative_wallet(uuid, text, text) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_company_representative_dashboard(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_company_representative_links(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_company_representative_commissions(uuid) TO authenticated, service_role;
