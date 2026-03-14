-- ============================================================
-- MVP de alertas administrativos
-- - Sino do admin com notificações persistentes
-- - Gatilhos automáticos para evento/venda/capacidade
-- - RPC para gerar alertas de evento iniciando em breve
-- ============================================================

-- 1) Tabela base
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (
    type IN (
      'event_created',
      'sale_confirmed',
      'capacity_warning',
      'capacity_full',
      'event_starting_soon',
      'payment_failed'
    )
  ),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'success', 'warning', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_link TEXT,
  related_entity_type TEXT,
  related_entity_id UUID,
  dedupe_key TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_notifications IS
'MVP de notificações administrativas multiempresa para o header do admin.';

COMMENT ON COLUMN public.admin_notifications.dedupe_key IS
'Chave opcional para deduplicar alertas operacionais recorrentes (capacidade, evento próximo etc.).';

CREATE INDEX IF NOT EXISTS idx_admin_notifications_company_created_at
  ON public.admin_notifications(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_company_unread
  ON public.admin_notifications(company_id, is_read);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_notifications_dedupe
  ON public.admin_notifications(company_id, type, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- 2) Trigger de updated_at (padrão já usado no projeto)
DROP TRIGGER IF EXISTS admin_notifications_set_updated_at ON public.admin_notifications;
CREATE TRIGGER admin_notifications_set_updated_at
BEFORE UPDATE ON public.admin_notifications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 3) RLS
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view admin_notifications of their company" ON public.admin_notifications;
CREATE POLICY "Users can view admin_notifications of their company"
ON public.admin_notifications
FOR SELECT
TO authenticated
USING (public.user_belongs_to_company(auth.uid(), company_id));

DROP POLICY IF EXISTS "Admins can update admin_notifications of their company" ON public.admin_notifications;
CREATE POLICY "Admins can update admin_notifications of their company"
ON public.admin_notifications
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()) AND public.user_belongs_to_company(auth.uid(), company_id))
WITH CHECK (public.is_admin(auth.uid()) AND public.user_belongs_to_company(auth.uid(), company_id));

-- 4) Função utilitária de inserção com deduplicação opcional
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
    p_dedupe_key
  )
  ON CONFLICT (company_id, type, dedupe_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.create_admin_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_admin_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated, service_role;

-- 5) Trigger: evento criado
CREATE OR REPLACE FUNCTION public.notify_event_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.create_admin_notification(
    NEW.company_id,
    'event_created',
    'Novo evento criado',
    format('Evento "%s" foi criado para %s.', NEW.name, to_char(NEW.date, 'DD/MM/YYYY HH24:MI')),
    'info',
    '/admin/eventos',
    'event',
    NEW.id,
    NEW.id::text
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_event_created ON public.events;
CREATE TRIGGER trg_notify_event_created
AFTER INSERT ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.notify_event_created();

-- 6) Trigger: venda confirmada + falha de pagamento em base já confiável
CREATE OR REPLACE FUNCTION public.notify_sale_status_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pago' AND OLD.status IS DISTINCT FROM 'pago' THEN
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
  END IF;

  -- Base confiável no schema atual: transição oficial de platform_fee_status -> failed.
  -- Esse status é persistido por fluxos reais (admin + webhooks) e evita “adivinhação”.
  IF NEW.platform_fee_status = 'failed' AND OLD.platform_fee_status IS DISTINCT FROM 'failed' THEN
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
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_sale_status_updates ON public.sales;
CREATE TRIGGER trg_notify_sale_status_updates
AFTER UPDATE ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.notify_sale_status_updates();

-- 7) Trigger: capacidade alta/lotada (dedupe por viagem + faixa)
CREATE OR REPLACE FUNCTION public.notify_trip_capacity_thresholds()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity INTEGER;
  v_tickets INTEGER;
  v_occupancy NUMERIC;
  v_company_id UUID;
  v_event_id UUID;
BEGIN
  SELECT t.capacity, t.company_id, t.event_id
    INTO v_capacity, v_company_id, v_event_id
  FROM public.trips t
  WHERE t.id = NEW.trip_id;

  IF v_capacity IS NULL OR v_capacity <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::INTEGER
    INTO v_tickets
  FROM public.tickets tk
  WHERE tk.trip_id = NEW.trip_id;

  v_occupancy := (v_tickets::NUMERIC / v_capacity::NUMERIC);

  IF v_occupancy >= 1 THEN
    PERFORM public.create_admin_notification(
      v_company_id,
      'capacity_full',
      'Capacidade lotada',
      format('Viagem lotada: %s/%s lugares ocupados.', v_tickets, v_capacity),
      'critical',
      '/admin/eventos',
      'trip',
      NEW.trip_id,
      NEW.trip_id::text || ':capacity_full'
    );
  ELSIF v_occupancy >= 0.85 THEN
    PERFORM public.create_admin_notification(
      v_company_id,
      'capacity_warning',
      'Capacidade alta',
      format('Viagem com %s%% de ocupação (%s/%s lugares).', round(v_occupancy * 100), v_tickets, v_capacity),
      'warning',
      '/admin/eventos',
      'trip',
      NEW.trip_id,
      NEW.trip_id::text || ':capacity_warning'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_trip_capacity_thresholds ON public.tickets;
CREATE TRIGGER trg_notify_trip_capacity_thresholds
AFTER INSERT ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.notify_trip_capacity_thresholds();

-- 8) RPC: evento iniciando em breve (critério simples para MVP)
CREATE OR REPLACE FUNCTION public.generate_event_starting_soon_notifications(
  p_company_id UUID,
  p_window_hours INTEGER DEFAULT 6
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted_count INTEGER := 0;
  v_now TIMESTAMPTZ := now();
  v_row RECORD;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Segurança adicional em runtime para impedir geração em empresa sem acesso.
  IF NOT public.user_belongs_to_company(auth.uid(), p_company_id) THEN
    RAISE EXCEPTION 'Acesso negado para company_id %', p_company_id;
  END IF;

  FOR v_row IN
    SELECT e.id, e.name, e.date, e.company_id
    FROM public.events e
    WHERE e.company_id = p_company_id
      AND e.is_archived = false
      AND e.status <> 'encerrado'
      AND e.date >= v_now
      AND e.date <= (v_now + make_interval(hours => p_window_hours))
  LOOP
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
      v_row.company_id,
      'event_starting_soon',
      'warning',
      'Evento iniciando em breve',
      format('O evento "%s" começa às %s.', v_row.name, to_char(v_row.date, 'DD/MM/YYYY HH24:MI')),
      '/admin/eventos',
      'event',
      v_row.id,
      v_row.id::text || ':starting_soon'
    )
    ON CONFLICT (company_id, type, dedupe_key) DO NOTHING;

    IF FOUND THEN
      v_inserted_count := v_inserted_count + 1;
    END IF;
  END LOOP;

  RETURN v_inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_event_starting_soon_notifications(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_event_starting_soon_notifications(UUID, INTEGER) TO authenticated, service_role;
