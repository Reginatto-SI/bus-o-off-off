-- Hotfix Smartbus BR: validação pública de seller_ref no checkout.
-- Causa raiz: o checkout público (anon) consultava `public.sellers` diretamente,
-- porém RLS permite SELECT apenas para autenticados da mesma empresa.
-- Resultado: `seller_id` acabava nulo mesmo com link /v/:code válido.

CREATE OR REPLACE FUNCTION public.resolve_event_seller_ref(p_seller_id uuid, p_company_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT s.id
  FROM public.sellers s
  WHERE s.id = p_seller_id
    AND s.company_id = p_company_id
    AND s.status = 'ativo'
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.resolve_event_seller_ref(uuid, uuid)
IS 'Resolve seller_id válido para checkout público, respeitando empresa do evento e status ativo.';

GRANT EXECUTE ON FUNCTION public.resolve_event_seller_ref(uuid, uuid) TO anon, authenticated;
