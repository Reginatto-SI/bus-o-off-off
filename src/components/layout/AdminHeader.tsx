import { Bell, Building2, ChevronDown, LogOut, User, Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useState } from 'react';

interface Notification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
  action?: {
    label: string;
    href: string;
  };
}

// Mock notifications - será substituído por dados reais do banco
const mockNotifications: Notification[] = [
  {
    id: '1',
    title: 'Novo evento criado',
    message: 'O evento "Show de Rock" foi criado com sucesso.',
    read: false,
    createdAt: new Date(),
    action: { label: 'Ver evento', href: '/admin/eventos' },
  },
  {
    id: '2',
    title: 'Venda confirmada',
    message: '5 passagens vendidas para o evento "Festival de Verão".',
    read: false,
    createdAt: new Date(Date.now() - 3600000),
    action: { label: 'Ver vendas', href: '/admin/vendas' },
  },
  {
    id: '3',
    title: 'Capacidade baixa',
    message: 'O ônibus ABC-1234 está com 90% da capacidade ocupada.',
    read: true,
    createdAt: new Date(Date.now() - 86400000),
  },
];

export function AdminHeader() {
  const { profile, userRole, signOut, activeCompany, userCompanies, switchCompany } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const hasMultipleCompanies = userCompanies.length > 1;

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Agora';
    if (diffMins < 60) return `${diffMins}min atrás`;
    if (diffHours < 24) return `${diffHours}h atrás`;
    return `${diffDays}d atrás`;
  };

  return (
    <header className="hidden lg:flex h-16 items-center justify-between gap-4 border-b border-border bg-card px-6">
      {/* Company Selector / Indicator */}
      <div className="flex items-center gap-2">
        {hasMultipleCompanies ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 h-auto py-1.5 px-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-foreground">{activeCompany?.name || 'Selecionar empresa'}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Trocar empresa</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {userCompanies.map((company) => (
                <DropdownMenuItem
                  key={company.id}
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => switchCompany(company.id)}
                >
                  <span>{company.name}</span>
                  {company.id === activeCompany?.id && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : activeCompany ? (
          <div className="flex items-center gap-2 px-3 py-1.5">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-foreground">{activeCompany.name}</span>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-4">
      {/* Notifications */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5 text-muted-foreground" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h4 className="font-semibold text-foreground">Notificações</h4>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={markAllAsRead}
              >
                Marcar todas como lidas
              </Button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma notificação
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`border-b border-border px-4 py-3 last:border-0 ${
                    !notification.read ? 'bg-muted/50' : ''
                  }`}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {notification.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {notification.message}
                      </p>
                      {notification.action && (
                        <a
                          href={notification.action.href}
                          className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
                        >
                          {notification.action.label} →
                        </a>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatTimeAgo(notification.createdAt)}
                    </span>
                  </div>
                  {!notification.read && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* User Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="hidden text-left md:block">
              <p className="text-sm font-medium text-foreground truncate max-w-[120px]">
                {profile?.name}
              </p>
              <p className="text-xs text-muted-foreground capitalize">
                {userRole}
              </p>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div>
              <p className="font-medium">{profile?.name}</p>
              <p className="text-xs text-muted-foreground">{profile?.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive cursor-pointer"
            onClick={signOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </div>
    </header>
  );
}
