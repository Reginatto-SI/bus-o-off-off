-- Atualiza o DEFAULT de comissionamento para novas empresas.
-- Importante: não altera registros existentes, apenas novos INSERTs sem valor explícito.
ALTER TABLE public.companies
  ALTER COLUMN platform_fee_percent SET DEFAULT 3,
  ALTER COLUMN partner_split_percent SET DEFAULT 3;
