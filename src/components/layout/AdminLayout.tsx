import { ReactNode, useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
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

/** Converte cor hex para string HSL (apenas valores, sem "hsl()") */
function hexToHsl(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// Valores padrão do tema (do index.css)
const DEFAULT_PRIMARY_HSL = '25 95% 53%';
const DEFAULT_RING_HSL = '25 95% 53%';

interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { user, userRole, loading, activeCompany, signOut } = useAuth();
  const { collapsed } = useSidebarCollapsed();
  const toastShownRef = useRef(false);
  const [hasNoActiveLinkedCompany, setHasNoActiveLinkedCompany] = useState(false);

  // Aplica cores da empresa como CSS custom properties
  const applyCompanyColors = useCallback(() => {
    const root = document.documentElement;
    const primaryHex = activeCompany?.primary_color;
    const primaryHsl = primaryHex ? hexToHsl(primaryHex) : null;

    if (primaryHsl) {
      root.style.setProperty('--primary', primaryHsl);
      root.style.setProperty('--ring', primaryHsl);
    } else {
      root.style.setProperty('--primary', DEFAULT_PRIMARY_HSL);
      root.style.setProperty('--ring', DEFAULT_RING_HSL);
    }
  }, [activeCompany?.primary_color]);

  useEffect(() => {
    applyCompanyColors();
    return () => {
      // Restaurar padrões ao desmontar
      const root = document.documentElement;
      root.style.setProperty('--primary', DEFAULT_PRIMARY_HSL);
      root.style.setProperty('--ring', DEFAULT_RING_HSL);
    };
  }, [applyCompanyColors]);

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

  const supportContactUrl = useMemo(() => {
    return buildWhatsappWaMeLink({
      phone: '(31) 99207-4309',
      message: 'Minha empresa está inativa no SmartBus BR e preciso de suporte para reativação.',
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
        {/* No mobile preservamos espaço para a barra fixa do menu sem alterar o espaçamento do desktop. */}
        <main className="pt-14 lg:pt-0">
          {children}
        </main>
      </div>

      <AlertDialog open={shouldBlockInactiveCompany}>
        <AlertDialogContent onEscapeKeyDown={(event) => event.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Sua empresa está inativa no SmartBus BR.</AlertDialogTitle>
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
