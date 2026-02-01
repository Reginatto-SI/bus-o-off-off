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
  Building2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
const navigation = [{
  name: 'Eventos',
  href: '/admin/eventos',
  icon: Calendar,
  roles: ['gerente', 'operador', 'vendedor']
}, {
  name: 'Frota',
  href: '/admin/frota',
  icon: Bus,
  roles: ['gerente', 'operador']
}, {
  name: 'Motoristas',
  href: '/admin/motoristas',
  icon: Users,
  roles: ['gerente', 'operador']
}, {
  name: 'Locais de Embarque',
  href: '/admin/locais',
  icon: MapPin,
  roles: ['gerente', 'operador']
}, {
  name: 'Vendedores',
  href: '/admin/vendedores',
  icon: UserCheck,
  roles: ['gerente', 'operador']
}, {
  name: 'Vendas',
  href: '/admin/vendas',
  icon: ShoppingCart,
  roles: ['gerente', 'operador']
}, {
  name: 'Minhas Vendas',
  href: '/admin/minhas-vendas',
  icon: LinkIcon,
  roles: ['vendedor']
}];

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
  } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const filteredNavigation = navigation.filter(item => userRole && item.roles.includes(userRole));
  const sidebarContent = <>
      <div className="flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-4">
        <BrandHeader />
        <Button variant="ghost" size="icon" className="lg:hidden text-sidebar-foreground" onClick={() => setMobileOpen(false)}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      <nav className="flex-1 space-y-1 bg-sidebar px-3 py-5">
        {filteredNavigation.map(item => {
        const isActive = location.pathname === item.href;
        return <NavLink key={item.name} to={item.href} onClick={() => setMobileOpen(false)} className={cn('relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors', isActive ? 'bg-[#243B63] text-sidebar-foreground before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:rounded-r before:bg-[#F97316]' : 'text-[#94A3B8] hover:bg-[#1E293B] hover:text-sidebar-foreground')}>
              <item.icon className="h-5 w-5" />
              {item.name}
            </NavLink>;
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
