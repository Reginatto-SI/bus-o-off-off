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
  BadgePercent,
  FileText,
  BarChart3,
  Settings,
  User,
  Image,
  Handshake,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSidebarCollapsed } from '@/hooks/use-sidebar-collapsed';
import busaoIcon from '@/assets/brand/busao-icon.svg';

type UserRole = 'gerente' | 'operador' | 'vendedor' | 'motorista' | 'developer';

type NavigationItem = {
  name: string;
  icon: typeof Calendar;
  href?: string;
  roles?: UserRole[];
  disabled?: boolean;
  statusLabel?: string;
};

type NavigationGroup = {
  id: string;
  label: string;
  items: NavigationItem[];
};

const navigationGroups: NavigationGroup[] = [{
  id: 'eventos',
  label: 'Eventos',
  items: [{
    name: 'Eventos',
    href: '/admin/eventos',
    icon: Calendar
  }, {
    name: 'Vendas',
    href: '/admin/vendas',
    icon: ShoppingCart
  }]
}, {
  id: 'cadastros',
  label: 'Cadastros Base',
  items: [{
    name: 'Frota (Veículos)',
    href: '/admin/frota',
    icon: Bus
  }, {
    name: 'Motoristas',
    href: '/admin/motoristas',
    icon: Users
  }, {
    name: 'Patrocinadores',
    href: '/admin/patrocinadores',
    icon: Image,
    roles: ['gerente']
  }, {
    name: 'Locais de Embarque',
    href: '/admin/locais',
    icon: MapPin
  }, {
    name: 'Vendedores',
    href: '/admin/vendedores',
    icon: UserCheck
  }]
}, {
  id: 'vendas-comissao',
  label: 'Vendas & Comissão',
  items: [{
    name: 'Minhas Vendas',
    href: '/vendedor/minhas-vendas',
    icon: BadgePercent,
    roles: ['vendedor']
  }]
}, {
  id: 'relatorios',
  label: 'Relatórios',
  items: [{
    name: 'Relatório de Vendas',
    icon: FileText,
    disabled: true,
    statusLabel: 'Em breve'
  }, {
    name: 'Relatório por Evento',
    icon: BarChart3,
    disabled: true,
    statusLabel: 'Em breve'
  }, {
    name: 'Comissão de Vendedores',
    icon: BadgePercent,
    disabled: true,
    statusLabel: 'Em breve'
  }]
}, {
  id: 'configuracoes',
  label: 'Configurações',
  items: [{
    name: 'Usuários',
    href: '/admin/usuarios',
    icon: Users,
    roles: ['gerente']
  }, {
    name: 'Empresa',
    href: '/admin/empresa',
    icon: Settings
  }, {
    name: 'Patrocinadores',
    href: '/admin/patrocinadores',
    icon: Image,
    roles: ['gerente']
  }, {
    name: 'Parceiros',
    href: '/admin/parceiros',
    icon: Handshake,
    roles: ['gerente']
  }, {
    name: 'Minha Conta',
    href: '/admin/minha-conta',
    icon: User
  }]
}];

function BrandHeader({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('flex items-center', compact ? 'gap-2' : 'gap-3')}>
      <div className={cn('flex items-center justify-center rounded-lg', compact ? 'h-8 w-8' : 'h-10 w-10')}>
        <img
          src={busaoIcon}
          alt="Ícone do sistema Busão Off Off"
          className="h-full w-full rounded-lg object-contain"
        />
      </div>
      <span className={cn('font-semibold tracking-tight text-sidebar-foreground', compact ? 'text-sm' : 'text-base')}>
        Busão Off Off
      </span>
    </div>
  );
}

/* ── Collapsed nav item with tooltip ── */
function CollapsedNavItem({ item, isActive, onClick }: {
  item: NavigationItem;
  isActive: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <div className={cn(
      'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
      item.disabled
        ? 'text-[#64748B] opacity-60 cursor-default'
        : isActive
          ? 'bg-[#243B63] text-white'
          : 'text-[#CBD5E1] hover:bg-[#1E293B] hover:text-white'
    )}>
      <item.icon className={cn('h-4 w-4', isActive && 'text-primary')} />
    </div>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {item.href && !item.disabled ? (
          <NavLink to={item.href} onClick={onClick} className="flex justify-center">
            {inner}
          </NavLink>
        ) : (
          <button type="button" disabled={item.disabled} className="flex justify-center w-full">
            {inner}
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        {item.name}
        {item.statusLabel && <span className="ml-1 text-[#94A3B8]">({item.statusLabel})</span>}
      </TooltipContent>
    </Tooltip>
  );
}

export function AdminSidebar() {
  const { profile, userRole, signOut, isDeveloper, userCompanies, activeCompany, switchCompany } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { collapsed, toggleCollapsed } = useSidebarCollapsed();

  const visibleGroups = navigationGroups.map(group => ({
    ...group,
    items: group.items.filter(item => isDeveloper || !item.roles || (userRole && item.roles.includes(userRole)))
  })).filter(group => group.items.length > 0);

  const defaultOpenGroups: string[] = [];

  /* ── Expanded sidebar content (used for both mobile overlay and desktop expanded) ── */
  const expandedContent = (showToggle: boolean, onClose?: () => void) => (
    <>
      <div className="flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-4">
        <BrandHeader />
        <div className="flex items-center gap-1">
          {showToggle && (
            <Button variant="ghost" size="icon" className="hidden lg:flex text-sidebar-foreground hover:bg-[#1E293B]" onClick={toggleCollapsed}>
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="icon" className="lg:hidden text-sidebar-foreground" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      <nav className="flex-1 bg-sidebar px-3 py-5 overflow-y-auto">
        <Accordion type="multiple" defaultValue={defaultOpenGroups} className="space-y-2">
          {visibleGroups.map(group => (
            <AccordionItem key={group.id} value={group.id} className="border-0">
              <AccordionTrigger className="mt-3 rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8] hover:bg-[#1E293B] hover:text-white hover:no-underline">
                {group.label}
              </AccordionTrigger>
              <AccordionContent className="pb-1 pt-0">
                <div className="space-y-1">
                  {group.items.map(item => {
                    const isActive = item.href ? location.pathname === item.href || location.pathname.startsWith(`${item.href}/`) : false;
                    if (item.href && !item.disabled) {
                      return (
                        <NavLink
                          key={item.name}
                          to={item.href}
                          onClick={onClose}
                          className={cn(
                            'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                            isActive
                              ? 'bg-[#243B63] text-white before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:rounded-r before:bg-primary'
                              : 'text-[#CBD5E1] hover:bg-[#1E293B] hover:text-white'
                          )}
                        >
                          <item.icon className={cn('h-4 w-4', isActive && 'text-primary')} />
                          <span className="flex-1">{item.name}</span>
                        </NavLink>
                      );
                    }
                    return (
                      <button key={item.name} type="button" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[#64748B] opacity-60" disabled>
                        <item.icon className="h-4 w-4" />
                        <span className="flex-1 text-left">{item.name}</span>
                        {item.statusLabel && (
                          <span className="rounded-full bg-[#1E293B] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                            {item.statusLabel}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </nav>

      {/* Seletor de empresa exclusivo para developer */}
      {isDeveloper && userCompanies.length > 1 && (
        <div className="border-t border-sidebar-border bg-sidebar px-4 py-3">
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8] mb-1.5">
            Empresa ativa
          </label>
          <select
            value={activeCompany?.id ?? ''}
            onChange={(e) => switchCompany(e.target.value)}
            className="w-full rounded-md border border-sidebar-border bg-[#1E293B] px-2 py-1.5 text-xs text-sidebar-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {userCompanies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="border-t border-sidebar-border bg-sidebar p-4">
        <div className="mb-3">
          <p className="text-sm font-medium text-sidebar-foreground truncate">{profile?.name}</p>
          <p className="text-xs text-[#94A3B8] truncate">{profile?.email}</p>
          <span className="mt-2 inline-block rounded-full bg-[#1E293B] px-2 py-0.5 text-xs font-medium text-sidebar-foreground capitalize">
            {userRole}
          </span>
        </div>
        <Button variant="ghost" className="w-full justify-start text-[#94A3B8] hover:bg-[#1E293B] hover:text-sidebar-foreground" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2" />
          Sair
        </Button>
      </div>
    </>
  );

  /* ── Collapsed sidebar content (desktop only) ── */
  const collapsedContent = (
    <>
      {/* Header */}
      <div className="flex flex-col items-center gap-2 border-b border-sidebar-border bg-sidebar px-2 py-4">
        <div className="h-8 w-8 flex items-center justify-center rounded-lg">
          <img src={busaoIcon} alt="Busão" className="h-full w-full rounded-lg object-contain" />
        </div>
        <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-[#1E293B] h-7 w-7" onClick={toggleCollapsed}>
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
      </div>

      {/* Nav icons */}
      <nav className="flex-1 bg-sidebar py-4 overflow-y-auto">
        <div className="flex flex-col items-center gap-1">
          {visibleGroups.flatMap(group =>
            group.items.map(item => {
              const isActive = item.href ? location.pathname === item.href || location.pathname.startsWith(`${item.href}/`) : false;
              return <CollapsedNavItem key={item.name} item={item} isActive={isActive} />;
            })
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border bg-sidebar py-3 flex flex-col items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1E293B] text-xs font-semibold text-sidebar-foreground">
              {profile?.name?.charAt(0)?.toUpperCase() ?? '?'}
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            <p className="font-medium">{profile?.name}</p>
            <p className="text-[#94A3B8]">{profile?.email}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="text-[#94A3B8] hover:bg-[#1E293B] hover:text-sidebar-foreground h-8 w-8" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Sair</TooltipContent>
        </Tooltip>
      </div>
    </>
  );

  return (
    <TooltipProvider delayDuration={200}>
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-16 bg-card border-b flex items-center px-4">
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
          <Menu className="h-6 w-6" />
        </Button>
        <div className="ml-2">
          <BrandHeader compact />
        </div>
      </div>

      {/* Mobile sidebar (always expanded) */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-sidebar flex flex-col">
            {expandedContent(false, () => setMobileOpen(false))}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className={cn(
        'hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 bg-sidebar border-r border-[#1F2937] shadow-[2px_0_12px_rgba(15,23,42,0.25)] transition-all duration-300',
        collapsed ? 'lg:w-16' : 'lg:w-64'
      )}>
        {collapsed ? collapsedContent : expandedContent(true)}
      </div>
    </TooltipProvider>
  );
}
