import { ReactNode, useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';
import { Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useSidebarCollapsed } from '@/hooks/use-sidebar-collapsed';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { buildWhatsappWaMeLink } from '@/lib/whatsapp';

// Valores padrão fixos da identidade visual SmartBus (index.css).
const DEFAULT_PRIMARY_HSL = '25 95% 53%';
const DEFAULT_RING_HSL = '25 95% 53%';
const DEFAULT_PRIMARY_FOREGROUND_HSL = '0 0% 100%';

interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { user, userRole, loading, activeCompany, signOut } = useAuth();
  const { collapsed } = useSidebarCollapsed();
  const location = useLocation();
  const toastShownRef = useRef(false);
  const [hasNoActiveLinkedCompany, setHasNoActiveLinkedCompany] = useState(false);

  // A identidade visual por empresa foi desativada: cores legadas salvas no banco não devem mais alterar o tema global.
  const applyDefaultSmartBusColors = useCallback(() => {
    const root = document.documentElement;
    root.style.setProperty('--primary', DEFAULT_PRIMARY_HSL);
    root.style.setProperty('--ring', DEFAULT_RING_HSL);
    root.style.setProperty('--sidebar-primary', DEFAULT_PRIMARY_HSL);
    root.style.setProperty('--primary-foreground', DEFAULT_PRIMARY_FOREGROUND_HSL);
    root.style.setProperty('--sidebar-primary-foreground', DEFAULT_PRIMARY_FOREGROUND_HSL);
  }, []);

  useEffect(() => {
    applyDefaultSmartBusColors();
    return applyDefaultSmartBusColors;
  }, [applyDefaultSmartBusColors]);

  useEffect(() => {
    if (userRole === 'vendedor' && !toastShownRef.current) {
      toastShownRef.current = true;
      toast({
        title: 'Acesso não autorizado',
        description: 'Você não tem permissão para acessar o painel administrativo.',
        variant: 'destructive',
      });
    }
  }, [userRole]);

  const shouldBlockInactiveCompany = useMemo(() => {
    if (!user || !userRole) return false;
    if (userRole === 'developer') return false;

    // Bloqueio direto quando a empresa ativa foi resolvida e está inativa.
    if (activeCompany?.is_active === false) return true;

    // Fallback: quando não há empresa ativa resolvida, mas o usuário está vinculado
    // somente a empresas inativas, o bloqueio visual continua obrigatório.
    return !activeCompany && hasNoActiveLinkedCompany;
  }, [activeCompany, hasNoActiveLinkedCompany, user, userRole]);

  useEffect(() => {
    const checkInactiveLinkedCompany = async () => {
      if (!user || !userRole || userRole === 'developer') {
        setHasNoActiveLinkedCompany(false);
        return;
      }

      const { data, error } = await supabase
        .from('user_roles')
        .select('company:companies(is_active)')
        .eq('user_id', user.id);

      if (error) {
        console.error('[AdminLayout] erro ao verificar empresa inativa vinculada', error);
        setHasNoActiveLinkedCompany(false);
        return;
      }

      const companies = (data ?? []) as Array<{ company: { is_active: boolean } | null }>;
      const hasAnyCompany = companies.length > 0;
      const hasActiveCompany = companies.some((row) => row.company?.is_active === true);
      const shouldFallbackBlock = hasAnyCompany && !hasActiveCompany;
      setHasNoActiveLinkedCompany(shouldFallbackBlock);
    };

    void checkInactiveLinkedCompany();
  }, [user, userRole]);

  const isMobileDashboardHome = location.pathname === '/admin/dashboard';
  const usesCustomMobileAdminChrome = isMobileDashboardHome || ['/admin/vendas', '/admin/eventos', '/admin/relatorios/lista-embarque', '/admin/relatorios/vendas', '/vendas/servicos'].includes(location.pathname) || /^\/admin\/eventos\/[^/]+$/.test(location.pathname);

  const supportContactUrl = useMemo(() => {
    return buildWhatsappWaMeLink({
      phone: '(31) 99207-4309',
      message: 'Minha empresa está inativa no SmartBus e preciso de suporte para reativação.',
    }) ?? 'https://wa.me/5531992074309?text=Minha%20empresa%20est%C3%A1%20inativa%20no%20SmartBus%20BR%20e%20preciso%20de%20suporte%20para%20reativa%C3%A7%C3%A3o.';
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Aguardar role resolver antes de renderizar layout admin
  if (!userRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Bloquear vendedor
  if (userRole === 'vendedor') {
    return <Navigate to="/vendedor/minhas-vendas" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminSidebar />
      <div className={cn('transition-all duration-300', collapsed ? 'lg:pl-16' : 'lg:pl-64')}>
        <AdminHeader />
        {/* No mobile preservamos espaço para a barra fixa, exceto em telas com chrome mobile próprio. */}
        <main className={cn(usesCustomMobileAdminChrome ? 'pt-0' : 'pt-14', 'lg:pt-0')}>
          {children}
        </main>
      </div>

      <AlertDialog open={shouldBlockInactiveCompany}>
        <AlertDialogContent onEscapeKeyDown={(event) => event.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Sua empresa está inativa no SmartBus.</AlertDialogTitle>
            <AlertDialogDescription>
              Para voltar a utilizar os serviços, entre em contato com o suporte ou solicite a reativação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => window.open(supportContactUrl, '_blank', 'noopener,noreferrer')}
            >
              Entrar em contato
            </Button>
            <Button type="button" variant="destructive" onClick={() => signOut()}>
              Sair
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
