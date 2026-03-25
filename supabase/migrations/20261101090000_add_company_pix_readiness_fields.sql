-- Readiness Pix por ambiente para integração Asaas em empresas.
-- Objetivo: impedir surpresa no checkout público quando conta não está apta para Pix.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS asaas_pix_ready_production boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS asaas_pix_last_checked_at_production timestamptz NULL,
  ADD COLUMN IF NOT EXISTS asaas_pix_last_error_production text NULL,
  ADD COLUMN IF NOT EXISTS asaas_pix_ready_sandbox boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS asaas_pix_last_checked_at_sandbox timestamptz NULL,
  ADD COLUMN IF NOT EXISTS asaas_pix_last_error_sandbox text NULL;

COMMENT ON COLUMN public.companies.asaas_pix_ready_production IS
'Readiness Pix da conta Asaas no ambiente de produção. true quando há chave Pix ativa confirmada.';
COMMENT ON COLUMN public.companies.asaas_pix_last_checked_at_production IS
'Data/hora UTC da última validação de readiness Pix no ambiente de produção.';
COMMENT ON COLUMN public.companies.asaas_pix_last_error_production IS
'Último erro operacional da validação/provisionamento de chave Pix no ambiente de produção.';

COMMENT ON COLUMN public.companies.asaas_pix_ready_sandbox IS
'Readiness Pix da conta Asaas no ambiente sandbox. true quando há chave Pix ativa confirmada.';
COMMENT ON COLUMN public.companies.asaas_pix_last_checked_at_sandbox IS
'Data/hora UTC da última validação de readiness Pix no ambiente sandbox.';
COMMENT ON COLUMN public.companies.asaas_pix_last_error_sandbox IS
'Último erro operacional da validação/provisionamento de chave Pix no ambiente sandbox.';

CREATE INDEX IF NOT EXISTS idx_companies_asaas_pix_ready_production
  ON public.companies (asaas_pix_ready_production);

CREATE INDEX IF NOT EXISTS idx_companies_asaas_pix_ready_sandbox
  ON public.companies (asaas_pix_ready_sandbox);
