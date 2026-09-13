CREATE TABLE IF NOT EXISTS public.payment_platform_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway text NOT NULL DEFAULT 'pagbank',
  environment text NOT NULL,
  client_id text NOT NULL,
  account_id text,
  name text,
  site text,
  redirect_uri text,
  client_secret_enc text,
  status text NOT NULL DEFAULT 'active',
  is_current boolean NOT NULL DEFAULT true,
  abandoned_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway, environment, client_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_platform_applications_current_idx
  ON public.payment_platform_applications (gateway, environment)
  WHERE is_current;

GRANT ALL ON public.payment_platform_applications TO service_role;

ALTER TABLE public.payment_platform_applications ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.payment_platform_applications IS 'Aplicacoes Connect da plataforma SmartBus por gateway/ambiente. client_secret_enc e cifrado no backend; sem acesso via Data API.';