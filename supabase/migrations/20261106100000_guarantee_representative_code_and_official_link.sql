-- Fase complementar: garantia do representative_code e do link oficial.
-- Objetivo: remover ambiguidade operacional entre representative_code e referral_code.

-- 1) Função de geração segura de código oficial do representante.
-- Formato oficial desta fase: REP + 7 chars alfanuméricos (maiúsculos).
CREATE OR REPLACE FUNCTION public.generate_representative_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_candidate text;
  v_exists boolean;
BEGIN
  LOOP
    v_candidate := 'REP' || substring(upper(replace(gen_random_uuid()::text, '-', '')) from 1 for 7);

    SELECT EXISTS (
      SELECT 1
      FROM public.representatives r
      WHERE r.representative_code = v_candidate
    ) INTO v_exists;

    EXIT WHEN NOT v_exists;
  END LOOP;

  RETURN v_candidate;
END;
$$;

COMMENT ON FUNCTION public.generate_representative_code() IS
  'Gera representative_code oficial (REP + 7 alfanuméricos), com checagem de unicidade.';

-- 2) Trigger para garantir nascimento automático do código e link oficial previsível.
CREATE OR REPLACE FUNCTION public.ensure_representative_code_and_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Regra principal: representative_code nasce no backend, nunca no frontend.
  IF NEW.representative_code IS NULL OR length(trim(NEW.representative_code)) = 0 THEN
    NEW.representative_code := public.generate_representative_code();
  ELSE
    NEW.representative_code := upper(trim(NEW.representative_code));
  END IF;

  -- Formato oficial e determinístico para reduzir ambiguidade com referral_code.
  IF NEW.representative_code !~ '^REP[A-Z0-9]{7}$' THEN
    RAISE EXCEPTION 'representative_code_invalid_format'
      USING DETAIL = 'Formato obrigatório: REP + 7 caracteres alfanuméricos (maiúsculos).';
  END IF;

  -- Link oficial de indicação:
  -- rota oficial do cadastro atual, sem criar fluxo paralelo.
  NEW.referral_link := '/cadastro?representative_code=' || NEW.representative_code;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.ensure_representative_code_and_link() IS
  'Garante representative_code automático/válido e padroniza referral_link oficial do representante.';

DROP TRIGGER IF EXISTS trg_ensure_representative_code_and_link ON public.representatives;
CREATE TRIGGER trg_ensure_representative_code_and_link
BEFORE INSERT OR UPDATE OF representative_code ON public.representatives
FOR EACH ROW
EXECUTE FUNCTION public.ensure_representative_code_and_link();

-- 3) Ajuste explícito da constraint para o novo formato oficial.
ALTER TABLE public.representatives
  DROP CONSTRAINT IF EXISTS representatives_code_format_chk;

ALTER TABLE public.representatives
  ADD CONSTRAINT representatives_code_format_chk
  CHECK (representative_code ~ '^REP[A-Z0-9]{7}$');

-- 4) Backfill conservador para registros legados sem formato oficial.
-- Mantém determinismo: gera código oficial novo e sincroniza referral_link.
WITH target_rows AS (
  SELECT id
  FROM public.representatives
  WHERE representative_code IS NULL
     OR representative_code !~ '^REP[A-Z0-9]{7}$'
)
UPDATE public.representatives r
SET representative_code = public.generate_representative_code(),
    referral_link = NULL
FROM target_rows t
WHERE r.id = t.id;

-- Passagem final para aplicar trigger e consolidar link oficial em todos os registros.
UPDATE public.representatives
SET representative_code = representative_code;
