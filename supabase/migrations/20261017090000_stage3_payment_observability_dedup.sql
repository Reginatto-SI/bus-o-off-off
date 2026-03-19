-- Etapa 3: observabilidade, auditoria e deduplicação operacional do fluxo Asaas.
-- Objetivo: ampliar rastreabilidade com mudança mínima e segura, sem redesenhar a arquitetura.

-- 1) Blindagem dos logs técnicos para incidentes sem venda/empresa correlacionada.
ALTER TABLE public.sale_integration_logs
  ALTER COLUMN sale_id DROP NOT NULL,
  ALTER COLUMN company_id DROP NOT NULL,
  ALTER COLUMN event_type DROP NOT NULL,
  ALTER COLUMN message DROP NOT NULL;

-- 2) Ampliação da taxonomia operacional e campos de auditoria.
ALTER TABLE public.sale_integration_logs
  ADD COLUMN IF NOT EXISTS asaas_event_id text,
  ADD COLUMN IF NOT EXISTS result_category text,
  ADD COLUMN IF NOT EXISTS incident_code text,
  ADD COLUMN IF NOT EXISTS warning_code text,
  ADD COLUMN IF NOT EXISTS duration_ms integer;

ALTER TABLE public.sale_integration_logs
  DROP CONSTRAINT IF EXISTS sale_integration_logs_processing_status_check;

ALTER TABLE public.sale_integration_logs
  ADD CONSTRAINT sale_integration_logs_processing_status_check
  CHECK (
    processing_status IN (
      'received',
      'requested',
      'success',
      'ignored',
      'partial_failure',
      'failed',
      'unauthorized',
      'warning',
      'rejected',
      'duplicate'
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sale_integration_logs_result_category_check'
      AND conrelid = 'public.sale_integration_logs'::regclass
  ) THEN
    ALTER TABLE public.sale_integration_logs
      ADD CONSTRAINT sale_integration_logs_result_category_check
      CHECK (
        result_category IS NULL
        OR result_category IN (
          'started',
          'success',
          'ignored',
          'partial_failure',
          'rejected',
          'duplicate',
          'warning',
          'error',
          'healthy',
          'payment_confirmed',
          'inconsistent_paid_without_ticket'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sale_integration_logs_asaas_event_id
  ON public.sale_integration_logs (asaas_event_id)
  WHERE asaas_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sale_integration_logs_result_category_created_at
  ON public.sale_integration_logs (result_category, created_at DESC);

-- 3) Deduplicação mínima por event.id do Asaas, separada dos logs para manter trilha de duplicates.
CREATE TABLE IF NOT EXISTS public.asaas_webhook_event_dedup (
  asaas_event_id text PRIMARY KEY,
  event_type text NULL,
  payment_id text NULL,
  external_reference text NULL,
  sale_id uuid NULL REFERENCES public.sales(id) ON DELETE SET NULL,
  payment_environment text NULL,
  payload_json jsonb NULL,
  first_received_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  duplicate_count integer NOT NULL DEFAULT 0,
  last_sale_id uuid NULL REFERENCES public.sales(id) ON DELETE SET NULL,
  last_payment_environment text NULL,
  last_payload_json jsonb NULL,
  CONSTRAINT asaas_webhook_event_dedup_payment_environment_check
    CHECK (payment_environment IS NULL OR payment_environment IN ('sandbox', 'production')),
  CONSTRAINT asaas_webhook_event_dedup_last_payment_environment_check
    CHECK (last_payment_environment IS NULL OR last_payment_environment IN ('sandbox', 'production'))
);

COMMENT ON TABLE public.asaas_webhook_event_dedup IS
  'Deduplicação mínima e auditável de eventos Asaas por event.id para evitar reprocessamento do webhook.';

ALTER TABLE public.asaas_webhook_event_dedup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view Asaas webhook dedup" ON public.asaas_webhook_event_dedup;
CREATE POLICY "Company members can view Asaas webhook dedup"
  ON public.asaas_webhook_event_dedup
  FOR SELECT
  TO authenticated
  USING (
    sale_id IS NOT NULL
    AND public.user_belongs_to_company(
      auth.uid(),
      (SELECT s.company_id FROM public.sales s WHERE s.id = sale_id)
    )
  );

CREATE OR REPLACE FUNCTION public.mark_asaas_webhook_event_duplicate(
  p_asaas_event_id text,
  p_sale_id uuid DEFAULT NULL,
  p_payment_environment text DEFAULT NULL,
  p_payload_json jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.asaas_webhook_event_dedup
  SET duplicate_count = duplicate_count + 1,
      last_seen_at = now(),
      last_sale_id = COALESCE(p_sale_id, last_sale_id),
      last_payment_environment = COALESCE(p_payment_environment, last_payment_environment),
      last_payload_json = COALESCE(p_payload_json, last_payload_json)
  WHERE asaas_event_id = p_asaas_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_asaas_webhook_event_duplicate(text, uuid, text, jsonb) TO service_role;
