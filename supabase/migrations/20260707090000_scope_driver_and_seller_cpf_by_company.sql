-- Diagnóstico e saneamento mínimo antes de escopar a unicidade de CPF por empresa.
-- Mantém a pessoa única por função operacional sem impedir múltiplas funções (motorista + vendedor).

DO $$
DECLARE
  v_driver_duplicates integer := 0;
  v_seller_duplicates integer := 0;
  v_null_roles integer := 0;
  v_masked_driver_cpfs integer := 0;
  v_masked_seller_cpfs integer := 0;
  v_invalid_driver_cpfs integer := 0;
  v_invalid_seller_cpfs integer := 0;
BEGIN
  SELECT count(*) INTO v_null_roles
  FROM public.drivers
  WHERE operational_role IS NULL OR btrim(operational_role) = '';

  SELECT count(*) INTO v_masked_driver_cpfs
  FROM public.drivers
  WHERE cpf IS NOT NULL AND cpf <> regexp_replace(cpf, '\D', '', 'g');

  SELECT count(*) INTO v_masked_seller_cpfs
  FROM public.sellers
  WHERE cpf IS NOT NULL AND cpf <> regexp_replace(cpf, '\D', '', 'g');

  SELECT count(*) INTO v_invalid_driver_cpfs
  FROM public.drivers
  WHERE cpf IS NOT NULL
    AND regexp_replace(cpf, '\D', '', 'g') <> ''
    AND length(regexp_replace(cpf, '\D', '', 'g')) <> 11;

  SELECT count(*) INTO v_invalid_seller_cpfs
  FROM public.sellers
  WHERE cpf IS NOT NULL
    AND regexp_replace(cpf, '\D', '', 'g') <> ''
    AND length(regexp_replace(cpf, '\D', '', 'g')) <> 11;

  RAISE NOTICE 'Diagnóstico CPF/função: drivers operational_role nulo/vazio=%; drivers CPF com máscara=%; sellers CPF com máscara=%; drivers CPF inválido=%; sellers CPF inválido=%',
    v_null_roles, v_masked_driver_cpfs, v_masked_seller_cpfs, v_invalid_driver_cpfs, v_invalid_seller_cpfs;
END $$;

-- Saneamento seguro: valores vazios antigos passam a seguir o fluxo atual de motoristas.
UPDATE public.drivers
SET operational_role = 'motorista'
WHERE operational_role IS NULL OR btrim(operational_role) = '';

-- Saneamento seguro: remove máscara apenas quando o CPF normalizado tem 11 dígitos.
UPDATE public.drivers
SET cpf = regexp_replace(cpf, '\D', '', 'g')
WHERE cpf IS NOT NULL
  AND cpf <> regexp_replace(cpf, '\D', '', 'g')
  AND length(regexp_replace(cpf, '\D', '', 'g')) = 11;

UPDATE public.sellers
SET cpf = regexp_replace(cpf, '\D', '', 'g')
WHERE cpf IS NOT NULL
  AND cpf <> regexp_replace(cpf, '\D', '', 'g')
  AND length(regexp_replace(cpf, '\D', '', 'g')) = 11;

DROP INDEX IF EXISTS public.drivers_cpf_unique;

DO $$
DECLARE
  v_driver_duplicates integer := 0;
  v_seller_duplicates integer := 0;
BEGIN
  SELECT count(*) INTO v_driver_duplicates
  FROM (
    SELECT company_id, operational_role, regexp_replace(cpf, '\D', '', 'g') AS cpf_digits
    FROM public.drivers
    WHERE cpf IS NOT NULL AND regexp_replace(cpf, '\D', '', 'g') <> ''
    GROUP BY company_id, operational_role, regexp_replace(cpf, '\D', '', 'g')
    HAVING count(*) > 1
  ) duplicated_drivers;

  SELECT count(*) INTO v_seller_duplicates
  FROM (
    SELECT company_id, regexp_replace(cpf, '\D', '', 'g') AS cpf_digits
    FROM public.sellers
    WHERE cpf IS NOT NULL AND regexp_replace(cpf, '\D', '', 'g') <> ''
    GROUP BY company_id, regexp_replace(cpf, '\D', '', 'g')
    HAVING count(*) > 1
  ) duplicated_sellers;

  RAISE NOTICE 'Diagnóstico duplicidade CPF: drivers por empresa/função=%; sellers por empresa=%',
    v_driver_duplicates, v_seller_duplicates;

  IF v_driver_duplicates = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS drivers_company_operational_role_cpf_unique
      ON public.drivers (company_id, operational_role, (regexp_replace(cpf, '\D', '', 'g')))
      WHERE cpf IS NOT NULL AND regexp_replace(cpf, '\D', '', 'g') <> '';
    RAISE NOTICE 'Proteção ativa: índice drivers_company_operational_role_cpf_unique criado/verificado.';
  ELSE
    RAISE WARNING 'PROTEÇÃO NÃO ATIVA para drivers: índice drivers_company_operational_role_cpf_unique não foi criado. Saneie motoristas duplicados por company_id + operational_role + CPF normalizado e crie o índice manualmente.';
  END IF;

  IF v_seller_duplicates = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS sellers_company_cpf_unique
      ON public.sellers (company_id, (regexp_replace(cpf, '\D', '', 'g')))
      WHERE cpf IS NOT NULL AND regexp_replace(cpf, '\D', '', 'g') <> '';
    RAISE NOTICE 'Proteção ativa: índice sellers_company_cpf_unique criado/verificado.';
  ELSE
    RAISE WARNING 'PROTEÇÃO NÃO ATIVA para sellers: índice sellers_company_cpf_unique não foi criado. Saneie vendedores duplicados por company_id + CPF normalizado e crie o índice manualmente.';
  END IF;
END $$;
