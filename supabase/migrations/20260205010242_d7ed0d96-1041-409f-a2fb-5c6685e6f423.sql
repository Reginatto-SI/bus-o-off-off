-- Evolução da entidade Empresa para identidade institucional completa
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS trade_name text,
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state char(2),
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#F97316',
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS website text;

COMMENT ON COLUMN companies.trade_name IS 'Nome fantasia para exibição em documentos';
COMMENT ON COLUMN companies.legal_name IS 'Razão social oficial';
COMMENT ON COLUMN companies.cnpj IS 'CNPJ formatado';
COMMENT ON COLUMN companies.city IS 'Cidade sede';
COMMENT ON COLUMN companies.state IS 'UF (2 caracteres)';
COMMENT ON COLUMN companies.logo_url IS 'URL da logo para PDFs';
COMMENT ON COLUMN companies.primary_color IS 'Cor primária hex para PDFs';
COMMENT ON COLUMN companies.whatsapp IS 'WhatsApp institucional';
COMMENT ON COLUMN companies.website IS 'Site da empresa';