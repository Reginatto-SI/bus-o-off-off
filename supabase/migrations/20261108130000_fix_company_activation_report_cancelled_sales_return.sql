-- Reaplica a versão final da RPC após migrations futuras que recriam get_company_activation_report.
-- Corrige compatibilidade de tipos do RETURN QUERY com casts explícitos para text e mantém canceladas separadas.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS asaas_wallet_id_production text,
  ADD COLUMN IF NOT EXISTS asaas_account_id_production text,
  ADD COLUMN IF NOT EXISTS asaas_onboarding_complete_production boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS asaas_pix_ready_production boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS asaas_pix_last_checked_at_production timestamptz NULL,
  ADD COLUMN IF NOT EXISTS asaas_wallet_id_sandbox text,
  ADD COLUMN IF NOT EXISTS asaas_account_id_sandbox text,
  ADD COLUMN IF NOT EXISTS asaas_onboarding_complete_sandbox boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS asaas_pix_ready_sandbox boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS asaas_pix_last_checked_at_sandbox timestamptz NULL;

DROP FUNCTION IF EXISTS public.get_company_activation_report();

CREATE FUNCTION public.get_company_activation_report()
RETURNS TABLE (
  id uuid,
  name text,
  legal_name text,
  trade_name text,
  cnpj text,
  document text,
  document_number text,
  email text,
  phone text,
  whatsapp text,
  city text,
  state text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  asaas_account_id_production text,
  asaas_wallet_id_production text,
  asaas_onboarding_complete_production boolean,
  asaas_pix_ready_production boolean,
  asaas_pix_last_checked_at_production timestamptz,
  asaas_account_id_sandbox text,
  asaas_wallet_id_sandbox text,
  asaas_onboarding_complete_sandbox boolean,
  asaas_pix_ready_sandbox boolean,
  asaas_pix_last_checked_at_sandbox timestamptz,
  event_count bigint,
  sale_count bigint,
  paid_sale_count bigint,
  cancelled_sale_count bigint,
  vehicle_count bigint,
  driver_count bigint,
  last_activity_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_developer(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito ao perfil developer.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH event_stats AS (
    SELECT e.company_id, count(*)::bigint AS event_count, max(e.updated_at) AS last_event_at
    FROM public.events e
    GROUP BY e.company_id
  ), sale_stats AS (
    SELECT s.company_id,
           count(*)::bigint AS sale_count,
           count(*) FILTER (WHERE s.status = 'pago')::bigint AS paid_sale_count,
           count(*) FILTER (WHERE s.status = 'cancelado')::bigint AS cancelled_sale_count,
           max(s.updated_at) AS last_sale_at
    FROM public.sales s
    GROUP BY s.company_id
  ), vehicle_stats AS (
    SELECT v.company_id, count(*)::bigint AS vehicle_count, max(v.updated_at) AS last_vehicle_at
    FROM public.vehicles v
    GROUP BY v.company_id
  ), driver_stats AS (
    SELECT d.company_id, count(*)::bigint AS driver_count, max(d.updated_at) AS last_driver_at
    FROM public.drivers d
    GROUP BY d.company_id
  )
  SELECT
    c.id,
    c.name::text,
    c.legal_name::text,
    c.trade_name::text,
    c.cnpj::text,
    c.document::text,
    c.document_number::text,
    c.email::text,
    c.phone::text,
    c.whatsapp::text,
    c.city::text,
    c.state::text,
    c.is_active,
    c.created_at,
    c.updated_at,
    c.asaas_account_id_production::text,
    c.asaas_wallet_id_production::text,
    c.asaas_onboarding_complete_production,
    c.asaas_pix_ready_production,
    c.asaas_pix_last_checked_at_production,
    c.asaas_account_id_sandbox::text,
    c.asaas_wallet_id_sandbox::text,
    c.asaas_onboarding_complete_sandbox,
    c.asaas_pix_ready_sandbox,
    c.asaas_pix_last_checked_at_sandbox,
    COALESCE(es.event_count, 0),
    COALESCE(ss.sale_count, 0),
    COALESCE(ss.paid_sale_count, 0),
    COALESCE(ss.cancelled_sale_count, 0),
    COALESCE(vs.vehicle_count, 0),
    COALESCE(ds.driver_count, 0),
    GREATEST(
      c.updated_at,
      COALESCE(c.asaas_pix_last_checked_at_production, c.updated_at),
      COALESCE(c.asaas_pix_last_checked_at_sandbox, c.updated_at),
      COALESCE(es.last_event_at, c.updated_at),
      COALESCE(ss.last_sale_at, c.updated_at),
      COALESCE(vs.last_vehicle_at, c.updated_at),
      COALESCE(ds.last_driver_at, c.updated_at)
    ) AS last_activity_at
  FROM public.companies c
  LEFT JOIN event_stats es ON es.company_id = c.id
  LEFT JOIN sale_stats ss ON ss.company_id = c.id
  LEFT JOIN vehicle_stats vs ON vs.company_id = c.id
  LEFT JOIN driver_stats ds ON ds.company_id = c.id
  ORDER BY c.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_company_activation_report() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_company_activation_report() TO authenticated;
