-- =============================================
-- PARTE 1: Adicionar campos na tabela trips
-- =============================================

-- Adicionar tipo de viagem (ida/volta)
ALTER TABLE public.trips 
  ADD COLUMN IF NOT EXISTS trip_type text NOT NULL DEFAULT 'ida';

-- Adicionar ajudante (opcional)
ALTER TABLE public.trips 
  ADD COLUMN IF NOT EXISTS assistant_driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.trips.trip_type IS 'Tipo da viagem: ida ou volta';
COMMENT ON COLUMN public.trips.assistant_driver_id IS 'Ajudante/copiloto da viagem (opcional)';

-- =============================================
-- PARTE 2: Adicionar campos na tabela event_boarding_locations
-- =============================================

-- Adicionar horario de embarque por local
ALTER TABLE public.event_boarding_locations 
  ADD COLUMN IF NOT EXISTS departure_time time;

-- Adicionar vinculo com viagem especifica (opcional - local pode ser global do evento)
ALTER TABLE public.event_boarding_locations 
  ADD COLUMN IF NOT EXISTS trip_id uuid REFERENCES public.trips(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.event_boarding_locations.departure_time IS 'Horario de embarque neste local';
COMMENT ON COLUMN public.event_boarding_locations.trip_id IS 'Viagem especifica (null = disponivel para todas)';

-- =============================================
-- PARTE 3: Adicionar campos de configuracao de venda na tabela events
-- =============================================

-- Preco padrao da passagem
ALTER TABLE public.events 
  ADD COLUMN IF NOT EXISTS unit_price numeric NOT NULL DEFAULT 0.00;

-- Limite de passagens por compra
ALTER TABLE public.events 
  ADD COLUMN IF NOT EXISTS max_tickets_per_purchase integer NOT NULL DEFAULT 5;

-- Permitir venda online
ALTER TABLE public.events 
  ADD COLUMN IF NOT EXISTS allow_online_sale boolean NOT NULL DEFAULT true;

-- Permitir venda por vendedor
ALTER TABLE public.events 
  ADD COLUMN IF NOT EXISTS allow_seller_sale boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.events.unit_price IS 'Preco padrao da passagem';
COMMENT ON COLUMN public.events.max_tickets_per_purchase IS 'Limite de passagens por compra';
COMMENT ON COLUMN public.events.allow_online_sale IS 'Permitir venda pelo portal publico';
COMMENT ON COLUMN public.events.allow_seller_sale IS 'Permitir venda por vendedores';