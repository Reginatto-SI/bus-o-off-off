-- Define padrão de comissionamento para novas empresas conforme regra de negócio.
-- Observação: altera apenas DEFAULT de colunas, sem modificar registros existentes.
ALTER TABLE public.companies
  ALTER COLUMN platform_fee_percent SET DEFAULT 3.5,
  ALTER COLUMN partner_split_percent SET DEFAULT 3.5;
