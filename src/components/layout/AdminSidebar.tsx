import { NavLink, useLocation } from 'react-router-dom';
import {
  Calendar,
  Bus,
  Users,
  MapPin,
  ShoppingCart,
  UserCheck,
  LogOut,
  Menu,
  X,
  Link as LinkIcon,
  Building2,
  ChevronDown,
  FileText,
  BarChart3,
  Percent,
  Settings,
  UserCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useEffect, useMemo, useState } from 'react';

type NavItem = {
  name: string;
  href?: string;
  icon: typeof Calendar;
  roles: Array<'gerente' | 'operador' | 'vendedor'>;
  comingSoon?: boolean;
};

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

const navigationGroups: NavGroup[] = [
  {
    id: 'eventos',
    label: 'Eventos',
    items: [
      {
        name: 'Eventos',
        href: '/admin/eventos',
        icon: Calendar,
        roles: ['gerente', 'operador', 'vendedor'],
      },
      {
        name: 'Vendas',
        href: '/admin/vendas',
        icon: ShoppingCart,
        roles: ['gerente', 'operador'],
      },
    ],
  },
  {
    id: 'cadastros',
    label: 'Cadastros Base',
    items: [
      {
        name: 'Frota (Veículos)',
        href: '/admin/frota',
        icon: Bus,
        roles: ['gerente', 'operador'],
      },
      {
        name: 'Motoristas',
        href: '/admin/motoristas',
        icon: Users,
        roles: ['gerente', 'operador'],
      },
      {
        name: 'Locais de Embarque',
        href: '/admin/locais',
        icon: MapPin,
        roles: ['gerente', 'operador'],
      },
      {
        name: 'Vendedores',
        href: '/admin/vendedores',
        icon: UserCheck,
        roles: ['gerente', 'operador'],
      },
    ],
  },
  {
    id: 'vendas-comissao',
    label: 'Vendas & Comissão',
    items: [
      {
        name: 'Minhas Vendas',
        href: '/admin/minhas-vendas',
        icon: LinkIcon,
        roles: ['vendedor'],
      },
    ],
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    items: [
      {
        name: 'Relatório de Vendas',
        icon: FileText,
        roles: ['gerente', 'operador'],
        comingSoon: true,
      },
      {
        name: 'Relatório por Evento',
        icon: BarChart3,
        roles: ['gerente', 'operador'],
        comingSoon: true,
      },
      {
        name: 'Comissão de Vendedores',
        icon: Percent,
        roles: ['gerente', 'operador'],
        comingSoon: true,
      },
    ],
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    items: [
      {
        name: 'Empresa',
        icon: Settings,
        roles: ['gerente', 'operador'],
        comingSoon: true,
      },
      {
        name: 'Minha Conta',
        icon: UserCircle,
        roles: ['gerente', 'operador', 'vendedor'],
        comingSoon: true,
      },
    ],
  },
];

function BrandHeader({
  compact = false
}: {
  compact?: boolean;
}) {
  return <div className={cn('flex items-center', compact ? 'gap-2' : 'gap-3')}>
      <div className={cn('flex items-center justify-center rounded-lg bg-[#1E293B] text-[#F97316]', compact ? 'h-8 w-8' : 'h-10 w-10')}>
        <Building2 className={cn(compact ? 'h-4 w-4' : 'h-5 w-5')} />
      </div>
      <span className={cn('font-semibold tracking-tight text-sidebar-foreground', compact ? 'text-sm' : 'text-base')}>
        Busão Off Off
      </span>
    </div>;
}

export function AdminSidebar() {
  const {
    profile,
    userRole,
    signOut
  } = useAuthContext();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const filteredGroups = useMemo(() => {
    if (!userRole) {
      return [] as NavGroup[];
    }
    return navigationGroups
      .map(group => ({
        ...group,
        items: group.items.filter(item => item.roles.includes(userRole))
      }))
      .filter(group => group.items.length > 0);
  }, [userRole]);
  const activeGroupId = useMemo(() => {
    const activeGroup = filteredGroups.find(group => group.items.some(item => item.href && (location.pathname === item.href || location.pathname.startsWith(`${item.href}/`))));
    return activeGroup?.id;
  }, [filteredGroups, location.pathname]);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => Object.fromEntries(navigationGroups.map(group => [group.id, true])));
  const toggleGroup = (groupId: string) => {
    setOpenGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };
  const ensureActiveGroupOpen = (groupId?: string) => {
    if (!groupId) {
      return;
    }
    setOpenGroups(prev => (prev[groupId] ? prev : {
      ...prev,
      [groupId]: true
    }));
  };
  useEffect(() => {
    ensureActiveGroupOpen(activeGroupId);
  }, [activeGroupId]);
  const sidebarContent = <>
      <div className="flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-4">
        <BrandHeader />
        <Button variant="ghost" size="icon" className="lg:hidden text-sidebar-foreground" onClick={() => setMobileOpen(false)}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      <nav className="flex-1 space-y-4 bg-sidebar px-3 py-5">
        {filteredGroups.map(group => {
          const isOpen = openGroups[group.id];
          return <div key={group.id} className="space-y-2">
              <button type="button" onClick={() => toggleGroup(group.id)} className="flex w-full items-center justify-between px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70">
                <span>{group.label}</span>
                <ChevronDown className={cn('h-4 w-4 transition-transform text-sidebar-foreground/70', isOpen ? 'rotate-0' : '-rotate-90')} />
              </button>
              {isOpen && <div className="space-y-1">
                  {group.items.map(item => {
                    const isActive = !!item.href && (location.pathname === item.href || location.pathname.startsWith(`${item.href}/`));
                    const baseClasses = cn('relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors', isActive ? 'bg-[#243B63] text-sidebar-foreground before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:rounded-r before:bg-[#F97316]' : 'text-[#94A3B8] hover:bg-[#1E293B] hover:text-sidebar-foreground', item.comingSoon && 'cursor-not-allowed text-[#94A3B8]/60 hover:bg-transparent hover:text-[#94A3B8]/60');
                    if (item.href && !item.comingSoon) {
                      return <NavLink key={item.name} to={item.href} onClick={() => setMobileOpen(false)} className={baseClasses}>
                            <item.icon className="h-5 w-5" />
                            <span className="truncate">{item.name}</span>
                          </NavLink>;
                    }
                    return <div key={item.name} className={baseClasses} aria-disabled="true">
                          <item.icon className="h-5 w-5" />
                          <span className="truncate">{item.name}</span>
                          <span className="ml-auto rounded-full bg-[#1E293B] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                            Em breve
                          </span>
                        </div>;
                  })}
                </div>}
            </div>;
        })}
      </nav>

      <div className="border-t border-sidebar-border bg-sidebar p-4">
        <div className="mb-3">
          <p className="text-sm font-medium text-sidebar-foreground truncate">
            {profile?.name}
          </p>
          <p className="text-xs text-[#94A3B8] truncate">
            {profile?.email}
          </p>
          <span className="mt-2 inline-block rounded-full bg-[#1E293B] px-2 py-0.5 text-xs font-medium text-sidebar-foreground capitalize">
            {userRole}
          </span>
        </div>
        <Button variant="ghost" className="w-full justify-start text-[#94A3B8] hover:bg-[#1E293B] hover:text-sidebar-foreground" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2" />
          Sair
        </Button>
      </div>
    </>;
  return <>
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-16 bg-card border-b flex items-center px-4">
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
          <Menu className="h-6 w-6" />
        </Button>
        <div className="ml-2">
          <BrandHeader compact />
        </div>
      </div>

      {/* Mobile sidebar */}
      {mobileOpen && <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-sidebar flex flex-col">
            {sidebarContent}
          </div>
        </div>}

      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-sidebar border-r border-[#1F2937] shadow-[2px_0_12px_rgba(15,23,42,0.25)]">
        {sidebarContent}
      </div>
    </>;
}
