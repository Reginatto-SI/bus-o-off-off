-- Pack final de blindagem de ambiente Asaas (Sandbox vs Produção)
-- Objetivo: tornar o ambiente persistido confiável e auditável com mudança mínima.

-- 1) Diagnóstico/tratamento seguro antes do CHECK:
-- normaliza valores legados para minúsculo e corrige inválidos para sandbox.
UPDATE public.sales
SET payment_environment = lower(trim(payment_environment))
WHERE payment_environment IS NOT NULL
  AND payment_environment <> lower(trim(payment_environment));

UPDATE public.sales
SET payment_environment = 'sandbox'
WHERE payment_environment IS NULL
   OR payment_environment NOT IN ('sandbox', 'production');

-- 2) Blindagem de domínio de valores permitidos (mantendo tipo text para menor invasão).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_payment_environment_check'
      AND conrelid = 'public.sales'::regclass
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_payment_environment_check
      CHECK (payment_environment IN ('sandbox', 'production'));
  END IF;
END $$;

COMMENT ON CONSTRAINT sales_payment_environment_check ON public.sales IS
'Blindagem do ambiente: somente sandbox ou production. A venda persistida é a fonte de verdade do fluxo.';

-- 3) Rastreabilidade operacional mínima na trilha técnica de integração.
ALTER TABLE public.sale_integration_logs
  ADD COLUMN IF NOT EXISTS payment_environment text,
  ADD COLUMN IF NOT EXISTS environment_decision_source text,
  ADD COLUMN IF NOT EXISTS environment_host_detected text;

-- Backfill leve para facilitar suporte em registros antigos.
UPDATE public.sale_integration_logs sil
SET payment_environment = s.payment_environment
FROM public.sales s
WHERE sil.sale_id = s.id
  AND sil.payment_environment IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sale_integration_logs_payment_environment_check'
      AND conrelid = 'public.sale_integration_logs'::regclass
  ) THEN
    ALTER TABLE public.sale_integration_logs
      ADD CONSTRAINT sale_integration_logs_payment_environment_check
      CHECK (
        payment_environment IS NULL
        OR payment_environment IN ('sandbox', 'production')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sale_integration_logs_environment_decision_source_check'
      AND conrelid = 'public.sale_integration_logs'::regclass
  ) THEN
    ALTER TABLE public.sale_integration_logs
      ADD CONSTRAINT sale_integration_logs_environment_decision_source_check
      CHECK (
        environment_decision_source IS NULL
        OR environment_decision_source IN ('sale', 'host')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sale_integration_logs_payment_environment_created_at
  ON public.sale_integration_logs (payment_environment, created_at DESC);
