-- Adicionado Micro-ônibus como tipo suportado.
-- Valor interno: micro_onibus
ALTER TYPE public.vehicle_type ADD VALUE IF NOT EXISTS 'micro_onibus';
