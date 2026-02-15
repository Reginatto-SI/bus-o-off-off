import { ReactNode, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';
import { Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useSidebarCollapsed } from '@/hooks/use-sidebar-collapsed';
import { cn } from '@/lib/utils';

interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { user, userRole, loading } = useAuth();
  const { collapsed } = useSidebarCollapsed();
  const toastShownRef = useRef(false);

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
        <main className="pt-16 lg:pt-0">
          {children}
        </main>
      </div>
    </div>
  );
}
