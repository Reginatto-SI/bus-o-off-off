
-- ============================================================
-- Link Curto para Vendedores
-- Adiciona coluna short_code (6 chars alfanuméricos do UUID)
-- e função RPC pública para resolver short_code -> seller_id
-- sem expor a tabela sellers diretamente.
-- ============================================================

-- 1) Adicionar coluna
ALTER TABLE public.sellers ADD COLUMN short_code text UNIQUE;

-- 2) Gerar códigos para vendedores existentes (6 chars do UUID sem hífens)
UPDATE public.sellers SET short_code = UPPER(LEFT(REPLACE(id::text, '-', ''), 6))
WHERE short_code IS NULL;

-- 3) Tornar NOT NULL com default para novos registros
ALTER TABLE public.sellers ALTER COLUMN short_code SET NOT NULL;
ALTER TABLE public.sellers ALTER COLUMN short_code SET DEFAULT UPPER(LEFT(REPLACE(gen_random_uuid()::text, '-', ''), 6));

-- 4) Função RPC pública (SECURITY DEFINER) para resolver short_code -> seller_id
-- Usada pela rota /v/:code para redirecionar sem expor dados do vendedor.
CREATE OR REPLACE FUNCTION public.resolve_seller_short_code(code text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT id FROM public.sellers WHERE short_code = UPPER(code) AND status = 'ativo' LIMIT 1;
$$;
