-- Guarda o e-mail retornado pela conta Asaas vinculada (API Key/subconta)
-- para exibição informativa no card de integração em /admin/empresa.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS asaas_account_email text;

COMMENT ON COLUMN public.companies.asaas_account_email IS
  'E-mail da conta Asaas efetivamente vinculada à integração da empresa';

