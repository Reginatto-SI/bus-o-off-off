import {
  Calendar,
  Bus,
  Users,
  MapPin,
  Globe,
  Ticket,
  Database,
  ShoppingCart,
  UserCheck,
  BadgePercent,
  FileText,
  BarChart3,
  Settings,
  User,
  Image,
  Handshake,
  Briefcase,
  LayoutTemplate,
  Building2,
  Wrench,
  Activity,
  ClipboardList,
  UserRoundCheck,
  Gift,
  Sparkles,
  QrCode,
  LayoutDashboard,
} from 'lucide-react';
import { normalizePublicSlug } from '@/lib/publicSlug';

export type UserRole = 'gerente' | 'operador' | 'vendedor' | 'motorista' | 'developer';

export type NavigationItem = {
  id?: string;
  name: string;
  icon: typeof Calendar;
  href?: string;
  roles?: UserRole[];
  disabled?: boolean;
  statusLabel?: string;
  openInNewTab?: boolean;
};

export type NavigationGroup = {
  id: string;
  label: string;
  icon: typeof Calendar;
  items: NavigationItem[];
  standalone?: boolean;
};

export const navigationGroups: NavigationGroup[] = [{
  id: 'dashboard',
  label: 'Painel',
  icon: LayoutDashboard,
  // O Dashboard é tratado como entrada principal isolada na navegação.
  standalone: true,
  items: [{
    name: 'Painel',
    href: '/admin/dashboard',
    icon: LayoutDashboard,
  }],
}, {
  id: 'eventos',
  label: 'Eventos',
  // Ícone de ticket evita repetição de calendário e diferencia o agrupamento dos itens internos.
  icon: Ticket,
  items: [{
    name: 'Eventos',
    href: '/admin/eventos',
    icon: Calendar
  }, {
    name: 'Vendas',
    href: '/admin/vendas',
    icon: ShoppingCart
  }, {
    // Atalho operacional para venda avulsa em campo (ônibus/destino) sem navegar por telas de cadastro.
    name: 'Venda de Serviços',
    href: '/vendas/servicos',
    icon: Sparkles
  }, {
    // Gerentes acessam o validador com seu próprio usuário; o backend audita user_id/role sem exigir driver_id.
    name: 'Validador de Passagens',
    href: '/validador',
    icon: QrCode,
    roles: ['gerente', 'developer']
  }]
}, {
  id: 'cadastros',
  label: 'Cadastros',
  icon: Database,
  items: [{
    name: 'Frota (Veículos)',
    href: '/admin/frota',
    icon: Bus
  }, {
    name: 'Motoristas',
    href: '/admin/motoristas',
    icon: Users
  }, {
    name: 'Auxiliares de Embarque',
    href: '/admin/auxiliares-embarque',
    icon: UserRoundCheck
  }, {
    name: 'Locais de Embarque',
    href: '/admin/locais',
    icon: MapPin
  }, {
    name: 'Vendedores',
    href: '/admin/vendedores',
    icon: UserCheck
  }, {
    name: 'Patrocinadores',
    href: '/admin/patrocinadores',
    icon: Image,
    roles: ['gerente']
  }, {
    name: 'Parceiros',
    href: '/admin/parceiros',
    icon: Briefcase,
    roles: ['gerente']
  }, {
    name: 'Programas de Benefício',
    href: '/admin/programas-beneficio',
    icon: Gift,
    roles: ['gerente', 'developer']
  }, {
    // Módulo Passeios & Serviços (base inicial). Acesso restrito ao gerente, igual aos demais cadastros sensíveis.
    name: 'Serviços',
    href: '/admin/servicos',
    icon: Sparkles,
    roles: ['gerente']
  }, {
    name: 'Sócios',
    href: '/admin/socios',
    icon: Handshake,
    // Tela restrita: somente usuários developer podem visualizar o menu de Sócios.
    roles: ['developer']
  }, {
    name: 'Templates de Layout',
    href: '/admin/templates-layout',
    icon: LayoutTemplate,
    // Catálogo oficial também é exclusivo de developer.
    roles: ['developer']
  }]
}, {
  id: 'relatorios',
  label: 'Relatórios',
  icon: BarChart3,
  items: [{
    name: 'Relatório de Vendas',
    href: '/admin/relatorios/vendas',
    icon: FileText
  }, {
    name: 'Relatório por Evento',
    href: '/admin/relatorios/eventos',
    icon: Calendar,
  }, {
    name: 'Lista de Embarque',
    href: '/admin/relatorios/lista-embarque',
    icon: ClipboardList
  }, {
    name: 'Empresas e Ativação',
    href: '/admin/relatorios/empresas-ativacao',
    icon: Building2,
    roles: ['developer']
  }, {
    name: 'Comissão de Vendedores',
    href: '/admin/relatorios/comissao-vendedores',
    icon: BadgePercent
  }]
}, {
  id: 'administracao',
  label: 'Administração',
  icon: Settings,
  items: [{
    name: 'Usuários',
    href: '/admin/usuarios',
    icon: Users,
    roles: ['gerente']
  }, {
    name: 'Empresa',
    href: '/admin/empresa',
    icon: Building2
  }, {
    // Representante Comercial: disponível para todos os perfis autenticados do painel admin.
    // Qualquer empresa pode atuar como representante e indicar novas empresas.
    name: 'Representante Comercial',
    href: '/admin/representante',
    icon: BadgePercent,
  }
  // ============================================================
  // Item "Indicações" temporariamente OCULTO do menu.
  // Motivo: a funcionalidade de indicações ficará em standby por
  // enquanto e não deve aparecer no cliente do usuário. A rota
  // /admin/indicacoes e o restante do módulo permanecem no código
  // para reativação futura sem alterar o fluxo existente.
  // ============================================================
  ]

}, {
  id: 'sistema',
  label: 'Sistema',
  icon: Wrench,
  items: [{
    name: 'Diagnóstico de Vendas',
    href: '/admin/diagnostico-vendas',
    icon: Activity,
    roles: ['developer'] as UserRole[],
  }]
}, {
  id: 'conta',
  label: 'Conta',
  icon: User,
  items: [{
    name: 'Minha Conta',
    href: '/admin/minha-conta',
    icon: Settings
  }]
}] as NavigationGroup[];

export function findAdminNavigationItemByHref(href: string) {
  return navigationGroups
    .flatMap((group) => group.items)
    .find((item) => item.href === href) ?? null;
}

export function canViewAdminNavigationItem({
  item,
  userRole,
  isDeveloper,
  canAccessTemplatesLayout,
}: {
  item: NavigationItem | null;
  userRole: UserRole | null;
  isDeveloper: boolean;
  canAccessTemplatesLayout: boolean;
}) {
  if (!item) return false;
  // Comentário: mesma exceção usada no menu para manter Templates acessível ao sócio autorizado sem abrir permissões gerais.
  if (item.href === '/admin/templates-layout') return canAccessTemplatesLayout;
  return isDeveloper || !item.roles || (userRole ? item.roles.includes(userRole) : false);
}

export function buildAdminPublicShowcaseUrl(publicSlug?: string | null) {
  const normalizedPublicSlug = normalizePublicSlug(publicSlug ?? '');
  if (!normalizedPublicSlug) return null;
  // Comentário: mantém a URL absoluta no navegador sem quebrar testes/builds executados fora do browser.
  if (typeof window === 'undefined') return null;
  return `${window.location.origin}/${normalizedPublicSlug}`;
}

export function getAdminNavigationGroupsWithDynamicItems(publicShowcaseUrl: string | null): NavigationGroup[] {
  return navigationGroups.map((group) => {
    if (group.id !== 'eventos') return group;

    const hasPublicShowcaseItem = group.items.some((item) => item.id === 'public-showcase' || item.name === 'Minha Vitrine Pública');
    if (hasPublicShowcaseItem) return group;

    return {
      ...group,
      items: [
        ...group.items,
        {
          id: 'public-showcase',
          name: 'Minha Vitrine Pública',
          href: publicShowcaseUrl ?? '/admin/empresa',
          icon: Globe,
          openInNewTab: Boolean(publicShowcaseUrl),
          statusLabel: publicShowcaseUrl ? undefined : 'Configurar nick',
        },
      ],
    };
  });
}
