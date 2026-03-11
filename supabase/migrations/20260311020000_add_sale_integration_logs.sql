-- Trilha técnica para integrações de pagamento (webhooks/requisições/sincronizações manuais).
CREATE TABLE public.sale_integration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NULL REFERENCES public.sales(id) ON DELETE SET NULL,
  company_id uuid NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  provider text NOT NULL,
  direction text NOT NULL,
  event_type text NULL,
  payment_id text NULL,
  external_reference text NULL,
  http_status integer NULL,
  processing_status text NOT NULL,
  message text NOT NULL,
  payload_json jsonb NULL,
  response_json jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sale_integration_logs_provider_check CHECK (provider IN ('asaas', 'stripe', 'manual')),
  CONSTRAINT sale_integration_logs_direction_check CHECK (direction IN ('incoming_webhook', 'outgoing_request', 'manual_sync')),
  CONSTRAINT sale_integration_logs_processing_status_check CHECK (
    processing_status IN ('received', 'ignored', 'success', 'partial_failure', 'failed', 'unauthorized')
  )
);

CREATE INDEX sale_integration_logs_sale_id_created_at_idx
  ON public.sale_integration_logs (sale_id, created_at DESC);

CREATE INDEX sale_integration_logs_provider_event_created_at_idx
  ON public.sale_integration_logs (provider, event_type, created_at DESC);

ALTER TABLE public.sale_integration_logs ENABLE ROW LEVEL SECURITY;

-- Mantém o padrão multiempresa: equipe administrativa só lê logs da própria empresa.
CREATE POLICY "Admins can read integration logs from own company"
  ON public.sale_integration_logs
  FOR SELECT
  USING (
    public.is_admin(auth.uid())
    AND company_id IS NOT NULL
    AND public.user_belongs_to_company(auth.uid(), company_id)
  );
