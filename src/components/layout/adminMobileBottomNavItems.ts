import { BarChart3, Bus, Home, type LucideIcon } from 'lucide-react';

export type AdminMobileBottomNavActiveItem = 'inicio' | 'vendas' | 'embarque';

export interface AdminMobileBottomNavItem {
  key: AdminMobileBottomNavActiveItem;
  title: string;
  href: string;
  icon: LucideIcon;
}

export const adminMobileBottomNavItems: AdminMobileBottomNavItem[] = [
  { key: 'inicio', title: 'Início', href: '/admin/dashboard', icon: Home },
  { key: 'vendas', title: 'Vendas', href: '/admin/vendas', icon: BarChart3 },
  // Rota real de embarque declarada em App.tsx; evita depender do hub /validador.
  { key: 'embarque', title: 'Embarque', href: '/validador/embarque', icon: Bus },
];
