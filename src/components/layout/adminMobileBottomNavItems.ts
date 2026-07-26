import { BarChart3, Home, QrCode } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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
  // O atalho administrativo abre o hub oficial do validador QR; a lista manual continua em /validador/embarque.
  { key: 'embarque', title: 'Embarque', href: '/validador', icon: QrCode },
];
