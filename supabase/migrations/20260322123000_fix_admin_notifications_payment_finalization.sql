-- Corrige o caminho acessório de notificações administrativas para não bloquear
-- updates críticos em `sales` (ex.: confirmação de pagamento Asaas).
--
-- Contexto do incidente real:
-- - `finalizeConfirmedPayment(...)` atualiza `sales.status = 'pago'`;
-- - o trigger `trg_notify_sale_status_updates` chama `create_admin_notification(...)`;
-- - a implementação anterior usava `ON CONFLICT (company_id, type, dedupe_key)`
--   contra um índice único parcial, causando erro SQL em runtime;
-- - o efeito colateral abortava a confirmação do pagamento antes da geração dos tickets.
--
-- Estratégia mínima e reversível desta migration:
-- 1) remover o `ON CONFLICT` incompatível e deduplicar via `NOT EXISTS`,
--    preservando o contrato atual de `dedupe_key` sem exigir redesign de índice;
-- 2) blindar o trigger de atualização de venda para que falha acessória de notificação
--    não derrube o fluxo principal de pagamento.

CREATE OR REPLACE FUNCTION public.create_admin_notification(
  p_company_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_severity TEXT DEFAULT 'info',
  p_action_link TEXT DEFAULT NULL,
  p_related_entity_type TEXT DEFAULT NULL,
  p_related_entity_id UUID DEFAULT NULL,
  p_dedupe_key TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_dedupe_key IS NULL THEN
    INSERT INTO public.admin_notifications (
      company_id,
      type,
      severity,
      title,
      message,
      action_link,
      related_entity_type,
      related_entity_id,
      dedupe_key
    ) VALUES (
      p_company_id,
      p_type,
      p_severity,
      p_title,
      p_message,
      p_action_link,
      p_related_entity_type,
      p_related_entity_id,
      NULL
    );

    RETURN;
  END IF;

  -- Comentário de manutenção:
  -- o índice único de `admin_notifications` é parcial (`WHERE dedupe_key IS NOT NULL`).
  -- `ON CONFLICT (company_id, type, dedupe_key)` não consegue inferir esse índice
  -- de forma segura em runtime, então deduplicamos explicitamente com `NOT EXISTS`.
  INSERT INTO public.admin_notifications (
    company_id,
    type,
    severity,
    title,
    message,
    action_link,
    related_entity_type,
    related_entity_id,
    dedupe_key
  )
  SELECT
    p_company_id,
    p_type,
    p_severity,
    p_title,
    p_message,
    p_action_link,
    p_related_entity_type,
    p_related_entity_id,
    p_dedupe_key
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.admin_notifications existing
    WHERE existing.company_id = p_company_id
      AND existing.type = p_type
      AND existing.dedupe_key = p_dedupe_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_admin_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_admin_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.notify_sale_status_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pago' AND OLD.status IS DISTINCT FROM 'pago' THEN
    BEGIN
      PERFORM public.create_admin_notification(
        NEW.company_id,
        'sale_confirmed',
        'Venda confirmada',
        format('Venda #%s confirmada para %s (%s passagem(ns)).', left(NEW.id::text, 8), NEW.customer_name, NEW.quantity),
        'success',
        '/admin/vendas',
        'sale',
        NEW.id,
        NEW.id::text
      );
    EXCEPTION WHEN OTHERS THEN
      -- Blindagem operacional: notificação administrativa é acessória.
      -- Se ela falhar, a transição principal da venda para `pago` deve continuar.
      RAISE WARNING 'notify_sale_status_updates sale_confirmed failed for sale %: %', NEW.id, SQLERRM;
    END;
  END IF;

  IF NEW.platform_fee_status = 'failed' AND OLD.platform_fee_status IS DISTINCT FROM 'failed' THEN
    BEGIN
      PERFORM public.create_admin_notification(
        NEW.company_id,
        'payment_failed',
        'Falha de pagamento',
        format('Falha na taxa/plataforma da venda #%s. Revisar cobrança.', left(NEW.id::text, 8)),
        'critical',
        '/admin/vendas',
        'sale',
        NEW.id,
        NEW.id::text || ':platform_fee_failed'
      );
    EXCEPTION WHEN OTHERS THEN
      -- Mesmo racional acima: não deixar uma falha acessória impedir
      -- a persistência do estado principal da venda.
      RAISE WARNING 'notify_sale_status_updates payment_failed failed for sale %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;
