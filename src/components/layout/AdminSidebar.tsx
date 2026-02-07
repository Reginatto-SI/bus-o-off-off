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
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import busaoIcon from '@/assets/brand/busao-icon.svg';

type UserRole = 'gerente' | 'operador' | 'vendedor' | 'motorista';

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
    href: '/admin/minhas-vendas',
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
    name: 'Minha Conta',
    href: '/admin/minha-conta',
    icon: User
  }]
}];

function BrandHeader({
  compact = false
}: {
  compact?: boolean;
}) {
  return <div className={cn('flex items-center', compact ? 'gap-2' : 'gap-3')}>
      {/* Ícone de branding global do sistema (não confundir com branding de empresa ativa). */}
      {/* Para trocar no futuro, substitua o asset em src/assets/brand/busao-icon.svg. */}
      <div className={cn('flex items-center justify-center rounded-lg', compact ? 'h-8 w-8' : 'h-10 w-10')}>
        <img
          src={busaoIcon}
          alt="Ícone do sistema Busão Off Off"
          className={cn('h-full w-full rounded-lg object-contain')}
        />
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
  } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const visibleGroups = navigationGroups.map(group => ({
    ...group,
    items: group.items.filter(item => !item.roles || (userRole && item.roles.includes(userRole)))
  })).filter(group => group.items.length > 0);
  // Mantém o menu lateral colapsado por padrão, deixando a expansão por ação do usuário.
  const defaultOpenGroups: string[] = [];
  const sidebarContent = <>
      <div className="flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-4">
        <BrandHeader />
        <Button variant="ghost" size="icon" className="lg:hidden text-sidebar-foreground" onClick={() => setMobileOpen(false)}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      <nav className="flex-1 bg-sidebar px-3 py-5">
        <Accordion type="multiple" defaultValue={defaultOpenGroups} className="space-y-2">
          {visibleGroups.map(group => <AccordionItem key={group.id} value={group.id} className="border-0">
              {/* Sidebar UX: cabeçalhos sem ícones reforçam hierarquia ERP/SaaS como seções, não ações */}
              <AccordionTrigger className="mt-3 rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8] hover:bg-[#1E293B] hover:text-white hover:no-underline">
                {group.label}
              </AccordionTrigger>
              <AccordionContent className="pb-1 pt-0">
                <div className="space-y-1">
                  {group.items.map(item => {
              const isActive = item.href ? location.pathname === item.href || location.pathname.startsWith(`${item.href}/`) : false;
              if (item.href && !item.disabled) {
                return <NavLink key={item.name} to={item.href} onClick={() => setMobileOpen(false)} className={cn('relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors', isActive ? 'bg-[#243B63] text-white before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:rounded-r before:bg-primary' : 'text-[#CBD5E1] hover:bg-[#1E293B] hover:text-white')}>
                          <item.icon className={cn("h-4 w-4", isActive && "text-primary")} />
                          <span className="flex-1">{item.name}</span>
                        </NavLink>;
              }
              return <button key={item.name} type="button" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[#64748B] opacity-60" disabled aria-disabled="true">
                        <item.icon className="h-4 w-4" />
                        <span className="flex-1 text-left">{item.name}</span>
                        {item.statusLabel ? <span className="rounded-full bg-[#1E293B] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                            {item.statusLabel}
                          </span> : null}
                      </button>;
            })}
                </div>
              </AccordionContent>
            </AccordionItem>)}
        </Accordion>
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
