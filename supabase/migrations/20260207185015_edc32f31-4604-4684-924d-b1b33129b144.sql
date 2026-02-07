-- Adicionar campos city e state na tabela boarding_locations
ALTER TABLE public.boarding_locations 
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state character(2);

-- Comentários para documentação
COMMENT ON COLUMN public.boarding_locations.city IS 'Cidade do local de embarque';
COMMENT ON COLUMN public.boarding_locations.state IS 'UF do local de embarque (2 caracteres)';