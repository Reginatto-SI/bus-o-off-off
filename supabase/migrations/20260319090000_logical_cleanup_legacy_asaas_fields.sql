-- Fase 1: limpeza lógica do legado Asaas em companies.
-- Mantemos as colunas para compatibilidade temporária, mas removemos qualquer valor
-- residual para que sandbox/production sejam o único contrato operacional.
UPDATE public.companies
SET
  asaas_account_id = NULL,
  asaas_wallet_id = NULL,
  asaas_api_key = NULL,
  asaas_onboarding_complete = FALSE,
  asaas_account_email = NULL
WHERE
  asaas_account_id IS NOT NULL
  OR asaas_wallet_id IS NOT NULL
  OR asaas_api_key IS NOT NULL
  OR asaas_onboarding_complete IS DISTINCT FROM FALSE
  OR asaas_account_email IS NOT NULL;
