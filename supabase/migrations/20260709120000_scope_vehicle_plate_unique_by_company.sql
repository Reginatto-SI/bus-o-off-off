-- Ajusta a unicidade de placa da Frota para o escopo correto multiempresa.
-- A mesma placa pode existir em empresas diferentes, mas não pode repetir dentro da mesma empresa.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.vehicles
    WHERE company_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Existem veículos sem empresa vinculada em public.vehicles. Saneie company_id antes de aplicar a unicidade de placa por empresa.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.vehicles
    GROUP BY company_id, upper(regexp_replace(plate, '[^A-Za-z0-9]', '', 'g'))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existem placas duplicadas dentro da mesma empresa em public.vehicles após normalização. Saneie os dados antes de aplicar a constraint de unicidade por empresa.';
  END IF;
END $$;

ALTER TABLE public.vehicles
  ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE public.vehicles
  DROP CONSTRAINT IF EXISTS vehicles_plate_key;

DROP INDEX IF EXISTS public.vehicles_plate_key;
DROP INDEX IF EXISTS public.vehicles_company_plate_normalized_key;

-- Normalização alinhada ao frontend: remove máscara/espaços e ignora maiúsculas/minúsculas.
CREATE UNIQUE INDEX vehicles_company_plate_normalized_key
ON public.vehicles (company_id, upper(regexp_replace(plate, '[^A-Za-z0-9]', '', 'g')));
