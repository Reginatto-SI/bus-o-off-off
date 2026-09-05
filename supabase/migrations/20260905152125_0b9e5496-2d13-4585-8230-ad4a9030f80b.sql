-- 1. Default explícito para telas legadas que ainda inserem empresas sem gateway
ALTER TABLE public.companies ALTER COLUMN payment_gateway SET DEFAULT 'asaas';

-- 2. Vendas: default técnico + trigger sempre copia o gateway da empresa no INSERT
ALTER TABLE public.sales ALTER COLUMN payment_gateway SET DEFAULT 'asaas';

CREATE OR REPLACE FUNCTION public.freeze_sale_payment_context()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company record;
  v_conn_id uuid;
  v_account text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT payment_gateway, payment_environment INTO v_company FROM public.companies WHERE id = NEW.company_id;
    IF v_company IS NULL THEN
      RAISE EXCEPTION 'sale_company_not_found' USING ERRCODE = 'P0001';
    END IF;
    -- Gateway NUNCA vem do cliente: sempre o configurado na empresa no momento da criação.
    NEW.payment_gateway := v_company.payment_gateway;
    IF NEW.payment_environment IS NULL THEN NEW.payment_environment := v_company.payment_environment; END IF;
    IF NEW.payment_gateway IS NULL OR NEW.payment_environment IS NULL THEN
      RAISE EXCEPTION 'sale_payment_context_missing' USING ERRCODE = 'P0001';
    END IF;
    NEW.payment_connection_id := NULL;
    NEW.external_account_id := NULL;
    IF NEW.payment_gateway = 'pagbank' THEN
      SELECT id, external_account_id INTO v_conn_id, v_account
      FROM public.payment_gateway_connections
      WHERE company_id = NEW.company_id AND gateway = 'pagbank' AND environment = NEW.payment_environment AND is_current
      LIMIT 1;
      NEW.payment_connection_id := v_conn_id;
      NEW.external_account_id := v_account;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.payment_gateway IS DISTINCT FROM OLD.payment_gateway
     OR NEW.payment_environment IS DISTINCT FROM OLD.payment_environment
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.payment_connection_id IS DISTINCT FROM OLD.payment_connection_id
     OR NEW.external_account_id IS DISTINCT FROM OLD.external_account_id THEN
    RAISE EXCEPTION 'sale_payment_context_immutable' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

-- 3. payment_attempts: sem leitura anônima direta
DROP POLICY IF EXISTS "Public can view pix attempt of public sale" ON public.payment_attempts;
REVOKE ALL ON public.payment_attempts FROM anon;

-- 4. payment_gateway_connections: leitura pública restrita a flags de prontidão
GRANT SELECT (id, company_id, gateway, environment, status, pix_ready, is_current) ON public.payment_gateway_connections TO anon, authenticated;
DROP POLICY IF EXISTS "Public can view current connection readiness" ON public.payment_gateway_connections;
CREATE POLICY "Public can view current connection readiness"
ON public.payment_gateway_connections
FOR SELECT
TO anon, authenticated
USING (is_current = true AND gateway = 'pagbank');