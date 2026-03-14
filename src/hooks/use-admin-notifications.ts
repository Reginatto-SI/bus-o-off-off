import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type AdminNotificationSeverity = 'info' | 'success' | 'warning' | 'critical';
export type AdminNotificationType =
  | 'event_created'
  | 'sale_confirmed'
  | 'capacity_warning'
  | 'capacity_full'
  | 'event_starting_soon'
  | 'payment_failed';

export interface AdminNotification {
  id: string;
  company_id: string;
  type: AdminNotificationType;
  severity: AdminNotificationSeverity;
  title: string;
  message: string;
  action_link: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

interface UseAdminNotificationsParams {
  activeCompanyId: string | null;
  canAccessAdminNotifications: boolean;
}

const POLLING_MS = 60000;

export function useAdminNotifications({
  activeCompanyId,
  canAccessAdminNotifications,
}: UseAdminNotificationsParams) {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!activeCompanyId || !canAccessAdminNotifications) {
      setNotifications([]);
      return;
    }

    setLoading(true);

    // MVP: geração “just in time” do alerta de evento próximo.
    // Mantemos o critério no banco para preservar consistência entre clientes.
    await supabase.rpc('generate_event_starting_soon_notifications' as any, {
      p_company_id: activeCompanyId,
      p_window_hours: 6,
    });

    const { data, error } = await supabase
      .from('admin_notifications' as any)
      .select('id, company_id, type, severity, title, message, action_link, is_read, read_at, created_at')
      .eq('company_id', activeCompanyId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      console.error('[useAdminNotifications] erro ao buscar notificações', error);
      setLoading(false);
      return;
    }

    setNotifications((data || []) as AdminNotification[]);
    setLoading(false);
  }, [activeCompanyId, canAccessAdminNotifications]);

  useEffect(() => {
    fetchNotifications();

    if (!activeCompanyId || !canAccessAdminNotifications) return;

    // Polling simples e robusto para MVP (sem criar infraestrutura paralela).
    const interval = window.setInterval(fetchNotifications, POLLING_MS);
    return () => window.clearInterval(interval);
  }, [fetchNotifications, activeCompanyId, canAccessAdminNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read).length,
    [notifications]
  );

  const markAsRead = useCallback(
    async (id: string) => {
      if (!activeCompanyId) return;

      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('admin_notifications' as any)
        .update({ is_read: true, read_at: nowIso })
        .eq('id', id)
        .eq('company_id', activeCompanyId)
        .eq('is_read', false);

      if (error) {
        console.error('[useAdminNotifications] erro ao marcar como lida', error);
        return;
      }

      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === id ? { ...notification, is_read: true, read_at: nowIso } : notification
        )
      );
    },
    [activeCompanyId]
  );

  const markAllAsRead = useCallback(async () => {
    if (!activeCompanyId) return;

    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from('admin_notifications' as any)
      .update({ is_read: true, read_at: nowIso })
      .eq('company_id', activeCompanyId)
      .eq('is_read', false);

    if (error) {
      console.error('[useAdminNotifications] erro ao marcar todas como lidas', error);
      return;
    }

    setNotifications((prev) => prev.map((notification) => ({ ...notification, is_read: true, read_at: nowIso })));
  }, [activeCompanyId]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    refresh: fetchNotifications,
  };
}
