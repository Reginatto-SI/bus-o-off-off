-- Permite configurar o layout lateral de assentos por veículo (ex.: 2x2, 2x1, 3x1)
ALTER TABLE public.vehicles
  ADD COLUMN seats_left_side integer NOT NULL DEFAULT 2,
  ADD COLUMN seats_right_side integer NOT NULL DEFAULT 2;

COMMENT ON COLUMN public.vehicles.seats_left_side IS 'Quantidade de assentos por fileira no lado esquerdo do corredor';
COMMENT ON COLUMN public.vehicles.seats_right_side IS 'Quantidade de assentos por fileira no lado direito do corredor';

ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_seats_left_side_check CHECK (seats_left_side BETWEEN 1 AND 4),
  ADD CONSTRAINT vehicles_seats_right_side_check CHECK (seats_right_side BETWEEN 1 AND 4);

-- Ajusta vans existentes para preset brasileiro mais comum (2x1)
UPDATE public.vehicles
SET seats_left_side = 2,
    seats_right_side = 1
WHERE type = 'van';
