import { NavLink, useLocation } from 'react-router-dom';
import { Calendar, Bus, Users, MapPin, ShoppingCart, UserCheck, LogOut, Menu, X, Link as LinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Logo } from '@/components/Logo';
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
      <div className="flex h-16 items-center justify-between px-4 border-b border-sidebar-border bg-sidebar-background bg-[sidebar-accent-foreground] bg-slate-700">
        <Logo size="md" />
        <Button variant="ghost" size="icon" className="lg:hidden text-sidebar-foreground" onClick={() => setMobileOpen(false)}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1 bg-sidebar-background bg-slate-700">
        {filteredNavigation.map(item => {
        const isActive = location.pathname === item.href;
        return <NavLink key={item.name} to={item.href} onClick={() => setMobileOpen(false)} className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors', isActive ? 'bg-sidebar-accent text-sidebar-primary' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground')}>
              <item.icon className="h-5 w-5" />
              {item.name}
            </NavLink>;
      })}
      </nav>

      <div className="p-4 border-t border-sidebar-border bg-sidebar-background bg-slate-700">
        <div className="mb-3 text-secondary-foreground">
          <p className="text-sm font-medium truncate text-secondary-foreground">
            {profile?.name}
          </p>
          <p className="text-xs truncate bg-primary-foreground text-secondary-foreground">
            {profile?.email}
          </p>
          <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium bg-sidebar-accent text-sidebar-primary rounded-full capitalize">
            {userRole}
          </span>
        </div>
        <Button variant="ghost" className="w-full justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent" onClick={signOut}>
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
          <Logo size="sm" />
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
      <div className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-sidebar">
        {sidebarContent}
      </div>
    </>;
}