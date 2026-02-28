-- Ajuste estrutural PF/PJ no cadastro de companies
-- Motivo: o produto precisa suportar Empresa (CNPJ) e Pessoa Fisica (CPF) de forma explícita,
-- sem depender de CNPJ opcional. Isso reduz inconsistências em validação, vitrine pública,
-- pagamentos e relatórios.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS legal_type text,
  ADD COLUMN IF NOT EXISTS document_number text;

-- Backfill de dados legados:
-- 1) Empresas atuais com CNPJ/documento passam a ser tratadas como Empresa (PJ).
-- 2) document_number passa a centralizar o documento fiscal (CPF/CNPJ), mantendo
--    compatibilidade com colunas antigas durante a transição.
UPDATE public.companies
SET legal_type = 'PJ'
WHERE legal_type IS NULL;

UPDATE public.companies
SET document_number = COALESCE(NULLIF(cnpj, ''), NULLIF(document, ''))
WHERE document_number IS NULL;

ALTER TABLE public.companies
  ALTER COLUMN legal_type SET DEFAULT 'PJ';

UPDATE public.companies
SET legal_type = 'PJ'
WHERE legal_type NOT IN ('PF', 'PJ') OR legal_type IS NULL;

ALTER TABLE public.companies
  ALTER COLUMN legal_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'companies_legal_type_check'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_legal_type_check CHECK (legal_type IN ('PF', 'PJ'));
  END IF;
END $$;

COMMENT ON COLUMN public.companies.legal_type IS
'Define o tipo de cadastro fiscal: PF (Pessoa Fisica/CPF) ou PJ (Empresa/CNPJ). Usado para obrigatoriedade de campos na UI e consistência em vitrine, pagamentos e relatórios.';

COMMENT ON COLUMN public.companies.document_number IS
'Documento fiscal unificado (CPF para PF, CNPJ para PJ). Substitui a dependência exclusiva de CNPJ em novos fluxos.';
