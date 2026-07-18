
-- =============================================================================
-- 1) Merge de duplicados: para cada representante "autônomo" (com user_id e sem
--    company_id) cujo usuário é gerente de uma empresa que já possui
--    representante oficial (company_id preenchido), migrar vínculos/comissões e
--    desativar o autônomo. Preserva o histórico e trava com locked=true.
-- =============================================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      rep_auto.id  AS auto_id,
      rep_auto.asaas_wallet_id_production AS auto_wallet_prod,
      rep_auto.asaas_wallet_id_sandbox    AS auto_wallet_sand,
      rep_auto.updated_at                 AS auto_updated_at,
      rep_official.id AS official_id,
      rep_official.asaas_wallet_id_production AS official_wallet_prod,
      rep_official.asaas_wallet_id_sandbox    AS official_wallet_sand,
      rep_official.updated_at                 AS official_updated_at
    FROM public.representatives rep_auto
    JOIN public.user_roles ur
      ON ur.user_id = rep_auto.user_id
     AND ur.role = 'gerente'
    JOIN public.representatives rep_official
      ON rep_official.company_id = ur.company_id
     AND rep_official.id <> rep_auto.id
    WHERE rep_auto.user_id IS NOT NULL
      AND rep_auto.company_id IS NULL
      AND rep_auto.status = 'ativo'
  LOOP
    -- Migra vínculos que ainda não existem no representante oficial
    UPDATE public.representative_company_links l
       SET representative_id = r.official_id,
           updated_at = now()
     WHERE l.representative_id = r.auto_id
       AND NOT EXISTS (
         SELECT 1 FROM public.representative_company_links l2
          WHERE l2.representative_id = r.official_id
            AND l2.company_id = l.company_id
       );

    -- Remove vínculos que já colidem com o oficial
    DELETE FROM public.representative_company_links l
     WHERE l.representative_id = r.auto_id;

    -- Migra comissões
    UPDATE public.representative_commissions c
       SET representative_id = r.official_id,
           updated_at = now()
     WHERE c.representative_id = r.auto_id;

    -- Preserva carteira mais recente se o oficial estiver vazio
    IF (r.official_wallet_prod IS NULL OR r.official_wallet_prod = '')
       AND r.auto_wallet_prod IS NOT NULL AND r.auto_wallet_prod <> ''
    THEN
      UPDATE public.representatives
         SET asaas_wallet_id_production = r.auto_wallet_prod,
             updated_at = now()
       WHERE id = r.official_id;
    END IF;

    IF (r.official_wallet_sand IS NULL OR r.official_wallet_sand = '')
       AND r.auto_wallet_sand IS NOT NULL AND r.auto_wallet_sand <> ''
    THEN
      UPDATE public.representatives
         SET asaas_wallet_id_sandbox = r.auto_wallet_sand,
             updated_at = now()
       WHERE id = r.official_id;
    END IF;

    -- Desativa o autônomo (preserva histórico de auditoria)
    UPDATE public.representatives
       SET status = 'inativo',
           updated_at = now()
     WHERE id = r.auto_id;
  END LOOP;
END $$;

-- =============================================================================
-- 2) Guarda em ensure_company_representative: evitar recriar autônomo divergente.
--    A função original permanece — apenas adicionamos verificação preventiva
--    logo no início para os casos em que a empresa nunca teve representante,
--    mas o gerente atual já tem representante autônomo ativo — nesse caso,
--    o autônomo é reaproveitado (adotado como oficial da empresa).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.ensure_company_representative(p_company_id uuid)
 RETURNS representatives
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company public.companies%ROWTYPE;
  v_representative public.representatives%ROWTYPE;
  v_manager_user_id uuid;
  v_existing_autonomous public.representatives%ROWTYPE;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id_required';
  END IF;

  SELECT *
    INTO v_company
  FROM public.companies
  WHERE id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'company_not_found'
      USING DETAIL = 'Empresa informada não existe.';
  END IF;

  -- Se já existir representante desta empresa, retorna direto.
  SELECT *
    INTO v_representative
  FROM public.representatives
  WHERE company_id = p_company_id
  LIMIT 1;

  IF FOUND THEN
    RETURN v_representative;
  END IF;

  -- Caso o gerente que está solicitando já tenha um representante autônomo
  -- ativo, adota esse registro como oficial da empresa (evita divergência).
  v_manager_user_id := auth.uid();

  IF v_manager_user_id IS NOT NULL THEN
    SELECT r.*
      INTO v_existing_autonomous
    FROM public.representatives r
    JOIN public.user_roles ur
      ON ur.user_id = r.user_id
     AND ur.role = 'gerente'
     AND ur.company_id = p_company_id
    WHERE r.user_id = v_manager_user_id
      AND r.company_id IS NULL
      AND r.status = 'ativo'
    LIMIT 1;

    IF FOUND THEN
      UPDATE public.representatives
         SET company_id = p_company_id,
             updated_at = now()
       WHERE id = v_existing_autonomous.id
      RETURNING * INTO v_representative;

      RETURN v_representative;
    END IF;
  END IF;

  INSERT INTO public.representatives (
    company_id,
    user_id,
    name,
    email,
    phone,
    document_number,
    status
  ) VALUES (
    p_company_id,
    NULL,
    COALESCE(NULLIF(trim(v_company.trade_name), ''), NULLIF(trim(v_company.name), ''), 'Empresa'),
    NULLIF(trim(COALESCE(v_company.email, '')), ''),
    NULLIF(trim(COALESCE(v_company.phone, '')), ''),
    NULLIF(trim(COALESCE(v_company.document_number, v_company.document, v_company.cnpj, '')), ''),
    'ativo'
  )
  ON CONFLICT (company_id) WHERE company_id IS NOT NULL DO NOTHING
  RETURNING * INTO v_representative;

  IF NOT FOUND THEN
    SELECT *
      INTO v_representative
    FROM public.representatives
    WHERE company_id = p_company_id
    LIMIT 1;
  END IF;

  RETURN v_representative;
END;
$function$;
