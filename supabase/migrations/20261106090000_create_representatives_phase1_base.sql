-- Fase 1 — Módulo de representantes
-- Estrutura mínima e conservadora para:
-- 1) cadastro oficial do representante
-- 2) vínculo oficial representante -> empresa no backend do cadastro
-- 3) snapshot do representante na venda
-- 4) ledger de comissão por venda paga (2% sobre gross_amount)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'representative_status'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.representative_status AS ENUM (
      'ativo',
      'inativo',
      'bloqueado',
      'pendente_validacao'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'representative_commission_status'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.representative_commission_status AS ENUM (
      'pendente',
      'disponivel',
      'bloqueada',
      'paga'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'representative_link_source'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.representative_link_source AS ENUM (
      'url_ref',
      'codigo_manual',
      'admin_ajuste'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.representatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text NULL,
  phone text NULL,
  document_number text NULL,
  status public.representative_status NOT NULL DEFAULT 'ativo',
  representative_code text NOT NULL,
  referral_link text NULL,
  asaas_wallet_id_production text NULL,
  asaas_wallet_id_sandbox text NULL,
  commission_percent numeric(5,2) NOT NULL DEFAULT 2.00,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT representatives_code_format_chk CHECK (representative_code ~ '^[A-Z0-9]{6,16}$'),
  CONSTRAINT representatives_commission_percent_chk CHECK (commission_percent >= 0 AND commission_percent <= 100)
);

COMMENT ON TABLE public.representatives IS
  'Cadastro oficial de representantes (Fase 1). Entidade própria e auditável.';
COMMENT ON COLUMN public.representatives.representative_code IS
  'Código público único do representante para vínculo no cadastro da empresa.';
COMMENT ON COLUMN public.representatives.commission_percent IS
  'Percentual padrão de comissão do representante. Fase 1: default 2%.';

CREATE UNIQUE INDEX IF NOT EXISTS representatives_representative_code_unique_idx
  ON public.representatives (representative_code);
CREATE UNIQUE INDEX IF NOT EXISTS representatives_user_id_unique_idx
  ON public.representatives (user_id)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.representative_company_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  representative_id uuid NOT NULL REFERENCES public.representatives(id) ON DELETE RESTRICT,
  link_source public.representative_link_source NOT NULL DEFAULT 'url_ref',
  source_code text NOT NULL,
  source_context jsonb NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  locked boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT representative_company_links_source_code_format_chk CHECK (source_code ~ '^[A-Z0-9]{6,16}$')
);

COMMENT ON TABLE public.representative_company_links IS
  'Fonte de verdade do vínculo representante -> empresa. Fase inicial: 1 empresa = 1 representante.';
COMMENT ON COLUMN public.representative_company_links.locked IS
  'Quando true, bloqueia mudança manual frágil sem fluxo administrativo explícito.';

CREATE UNIQUE INDEX IF NOT EXISTS representative_company_links_company_unique_idx
  ON public.representative_company_links (company_id);
CREATE INDEX IF NOT EXISTS representative_company_links_representative_idx
  ON public.representative_company_links (representative_id, linked_at DESC);

CREATE TABLE IF NOT EXISTS public.representative_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  representative_id uuid NOT NULL REFERENCES public.representatives(id) ON DELETE RESTRICT,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  payment_environment text NOT NULL CHECK (payment_environment IN ('sandbox', 'production')),
  base_amount numeric(10,2) NOT NULL CHECK (base_amount >= 0),
  commission_percent numeric(5,2) NOT NULL CHECK (commission_percent >= 0 AND commission_percent <= 100),
  commission_amount numeric(10,2) NOT NULL CHECK (commission_amount >= 0),
  status public.representative_commission_status NOT NULL,
  available_at timestamptz NULL,
  paid_at timestamptz NULL,
  blocked_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT representative_commissions_one_per_sale_unique UNIQUE (sale_id),
  CONSTRAINT representative_commissions_blocked_reason_chk CHECK (
    (status <> 'bloqueada') OR (blocked_reason IS NOT NULL AND length(trim(blocked_reason)) > 0)
  )
);

COMMENT ON TABLE public.representative_commissions IS
  'Ledger de comissões de representantes por venda paga. Fonte auditável e idempotente por sale_id.';
COMMENT ON COLUMN public.representative_commissions.base_amount IS
  'Base da comissão. Fase 1: gross_amount da venda confirmada.';

CREATE INDEX IF NOT EXISTS representative_commissions_company_status_idx
  ON public.representative_commissions (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS representative_commissions_representative_status_idx
  ON public.representative_commissions (representative_id, status, created_at DESC);

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS representative_id uuid NULL REFERENCES public.representatives(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.sales.representative_id IS
  'Snapshot do representante associado à empresa no momento da venda para auditoria histórica.';

ALTER TABLE public.sale_integration_logs
  ADD COLUMN IF NOT EXISTS representative_id uuid NULL REFERENCES public.representatives(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.sale_integration_logs.representative_id IS
  'Metadado opcional para rastreabilidade de integrações de venda ligadas a representante.';

CREATE OR REPLACE FUNCTION public.set_sale_representative_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_representative_id uuid;
BEGIN
  -- Fase 1: o snapshot nasce no backend da venda para manter histórico auditável.
  -- Não sobrescrevemos valor explícito vindo de fluxo administrativo.
  IF NEW.representative_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT rcl.representative_id
    INTO v_representative_id
  FROM public.representative_company_links rcl
  WHERE rcl.company_id = NEW.company_id
  ORDER BY rcl.linked_at DESC
  LIMIT 1;

  NEW.representative_id := v_representative_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_sale_representative_snapshot ON public.sales;
CREATE TRIGGER trg_set_sale_representative_snapshot
BEFORE INSERT ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.set_sale_representative_snapshot();

CREATE OR REPLACE FUNCTION public.upsert_representative_commission_for_sale(
  p_sale_id uuid,
  p_source text DEFAULT 'payment_finalization'
)
RETURNS TABLE(action text, status public.representative_commission_status)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_representative public.representatives%ROWTYPE;
  v_commission_percent numeric(5,2);
  v_base_amount numeric(10,2);
  v_commission_amount numeric(10,2);
  v_status public.representative_commission_status;
  v_block_reason text;
  v_wallet text;
BEGIN
  SELECT *
    INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'sale_not_found'::text, NULL::public.representative_commission_status;
    RETURN;
  END IF;

  -- Regra de negócio Fase 1: comissão nasce somente com venda confirmada como paga.
  IF v_sale.status <> 'pago' THEN
    RETURN QUERY SELECT 'sale_not_paid'::text, NULL::public.representative_commission_status;
    RETURN;
  END IF;

  IF v_sale.representative_id IS NULL THEN
    RETURN QUERY SELECT 'no_representative_snapshot'::text, NULL::public.representative_commission_status;
    RETURN;
  END IF;

  SELECT *
    INTO v_representative
  FROM public.representatives
  WHERE id = v_sale.representative_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'representative_not_found'::text, NULL::public.representative_commission_status;
    RETURN;
  END IF;

  v_commission_percent := COALESCE(v_representative.commission_percent, 2.00);
  v_base_amount := COALESCE(v_sale.gross_amount, (COALESCE(v_sale.unit_price, 0) * COALESCE(v_sale.quantity, 0)))::numeric(10,2);
  v_commission_amount := ROUND((v_base_amount * (v_commission_percent / 100.0))::numeric, 2);

  IF COALESCE(v_sale.payment_environment, 'sandbox') = 'production' THEN
    v_wallet := NULLIF(trim(COALESCE(v_representative.asaas_wallet_id_production, '')), '');
  ELSE
    v_wallet := NULLIF(trim(COALESCE(v_representative.asaas_wallet_id_sandbox, '')), '');
  END IF;

  -- Regra Fase 1: wallet ausente não quebra checkout/pagamento.
  -- Persistimos a comissão como bloqueada para tratamento nas próximas fases.
  IF v_wallet IS NULL THEN
    v_status := 'bloqueada';
    v_block_reason := 'representative_wallet_missing';
  ELSE
    v_status := 'pendente';
    v_block_reason := NULL;
  END IF;

  INSERT INTO public.representative_commissions (
    company_id,
    representative_id,
    sale_id,
    payment_environment,
    base_amount,
    commission_percent,
    commission_amount,
    status,
    blocked_reason,
    created_at,
    updated_at
  ) VALUES (
    v_sale.company_id,
    v_sale.representative_id,
    v_sale.id,
    COALESCE(v_sale.payment_environment, 'sandbox'),
    v_base_amount,
    v_commission_percent,
    v_commission_amount,
    v_status,
    v_block_reason,
    now(),
    now()
  )
  ON CONFLICT (sale_id) DO NOTHING;

  IF FOUND THEN
    RETURN QUERY SELECT 'created'::text, v_status;
  ELSE
    RETURN QUERY SELECT 'already_exists'::text, NULL::public.representative_commission_status;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.upsert_representative_commission_for_sale(uuid, text) IS
  'Cria comissão idempotente por sale_id após venda paga. Fase 1: base gross_amount e 2% padrão, sem quebrar pagamento quando wallet ausente.';

GRANT EXECUTE ON FUNCTION public.upsert_representative_commission_for_sale(uuid, text) TO authenticated, service_role;

ALTER TABLE public.representatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.representative_company_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.representative_commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own representative profile" ON public.representatives;
CREATE POLICY "Users can view own representative profile"
ON public.representatives
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_admin(auth.uid())
);

DROP POLICY IF EXISTS "Admins can manage representatives" ON public.representatives;
CREATE POLICY "Admins can manage representatives"
ON public.representatives
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can view representative links by company" ON public.representative_company_links;
CREATE POLICY "Users can view representative links by company"
ON public.representative_company_links
FOR SELECT
TO authenticated
USING (
  public.user_belongs_to_company(auth.uid(), company_id)
  OR EXISTS (
    SELECT 1
    FROM public.representatives r
    WHERE r.id = representative_company_links.representative_id
      AND r.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can manage representative links by company" ON public.representative_company_links;
CREATE POLICY "Admins can manage representative links by company"
ON public.representative_company_links
FOR ALL
TO authenticated
USING (
  public.is_admin(auth.uid())
  AND public.user_belongs_to_company(auth.uid(), company_id)
)
WITH CHECK (
  public.is_admin(auth.uid())
  AND public.user_belongs_to_company(auth.uid(), company_id)
);

DROP POLICY IF EXISTS "Users can view representative commissions by company" ON public.representative_commissions;
CREATE POLICY "Users can view representative commissions by company"
ON public.representative_commissions
FOR SELECT
TO authenticated
USING (
  public.user_belongs_to_company(auth.uid(), company_id)
  OR EXISTS (
    SELECT 1
    FROM public.representatives r
    WHERE r.id = representative_commissions.representative_id
      AND r.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can manage representative commissions by company" ON public.representative_commissions;
CREATE POLICY "Admins can manage representative commissions by company"
ON public.representative_commissions
FOR ALL
TO authenticated
USING (
  public.is_admin(auth.uid())
  AND public.user_belongs_to_company(auth.uid(), company_id)
)
WITH CHECK (
  public.is_admin(auth.uid())
  AND public.user_belongs_to_company(auth.uid(), company_id)
);

DROP TRIGGER IF EXISTS representatives_set_updated_at ON public.representatives;
CREATE TRIGGER representatives_set_updated_at
BEFORE UPDATE ON public.representatives
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS representative_company_links_set_updated_at ON public.representative_company_links;
CREATE TRIGGER representative_company_links_set_updated_at
BEFORE UPDATE ON public.representative_company_links
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS representative_commissions_set_updated_at ON public.representative_commissions;
CREATE TRIGGER representative_commissions_set_updated_at
BEFORE UPDATE ON public.representative_commissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
