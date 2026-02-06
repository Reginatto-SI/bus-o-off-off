-- Adicionar coluna status com valor padrão 'ativo'
ALTER TABLE boarding_locations 
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo';

-- Adicionar coluna notes para observações
ALTER TABLE boarding_locations 
  ADD COLUMN IF NOT EXISTS notes text;

-- Remover coluna time (horário pertence à viagem, não ao local)
ALTER TABLE boarding_locations 
  DROP COLUMN IF EXISTS time;

-- Comentários para documentação
COMMENT ON COLUMN boarding_locations.status IS 'Status do local: ativo ou inativo';
COMMENT ON COLUMN boarding_locations.notes IS 'Observações sobre o local de embarque';