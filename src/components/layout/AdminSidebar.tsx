import { NavLink, useLocation, useNavigate } from 'react-router-dom';
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
  Briefcase,
  LayoutTemplate,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  LayoutDashboard,
  Building2,
  Wrench,
  Activity,
  ClipboardList,
  Share2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSidebarCollapsed } from '@/hooks/use-sidebar-collapsed';
import { normalizePublicSlug } from '@/lib/publicSlug';
import busaoIcon from '@/assets/brand/busao-icon.svg';
import collapsedSidebarOfficialIcon from '@/assets/brand/sidebar-collapsed-official.svg';
import logoAdmin from '@/assets/logo_admin.png';
import { toast } from 'sonner';

type UserRole = 'gerente' | 'operador' | 'vendedor' | 'motorista' | 'developer';

type NavigationItem = {
  id?: string;
  name: string;
  icon: typeof Calendar;
  href?: string;
  roles?: UserRole[];
  disabled?: boolean;
  statusLabel?: string;
  openInNewTab?: boolean;
};

type NavigationGroup = {
  id: string;
  label: string;
  icon: typeof Calendar;
  items: NavigationItem[];
  standalone?: boolean;
};

const navigationGroups: NavigationGroup[] = [{
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
    name: 'Indicações',
    href: '/admin/indicacoes',
    icon: Share2
  }]
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
}];

function BrandHeader({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('flex items-center', compact ? 'gap-2' : 'gap-3')}>
      <div className={cn('flex items-center justify-center rounded-lg', compact ? 'h-8 w-8' : 'h-10 w-10')}>
        <img
          src={busaoIcon}
          alt="Ícone do sistema Smartbus BR"
          className="h-full w-full rounded-lg object-contain"
        />
      </div>
      <span className={cn('font-semibold tracking-tight text-sidebar-foreground', compact ? 'text-sm' : 'text-base')}>
        Smartbus BR
      </span>
    </div>
  );
}

function ExpandedBrandHeader() {
  return (
    <div className="flex h-12 w-full items-center">
      <img
        src={logoAdmin}
        alt="Smartbus BR Admin"
        className="h-full w-full object-contain object-left"
      />
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
          item.openInNewTab ? (
            <a href={item.href} target="_blank" rel="noreferrer" onClick={onClick} className="flex justify-center">
              {inner}
            </a>
          ) : (
            <NavLink to={item.href} onClick={onClick} className="flex justify-center">
              {inner}
            </NavLink>
          )
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
  const { profile, userRole, signOut, isDeveloper, activeCompany } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { collapsed, toggleCollapsed } = useSidebarCollapsed();

  const normalizedPublicSlug = normalizePublicSlug(activeCompany?.public_slug ?? '');
  const publicShowcaseUrl = normalizedPublicSlug ? `${window.location.origin}/${normalizedPublicSlug}` : null;

  // Comentário: item dinâmico usa somente o nick público da empresa ativa, sem expor identificadores internos.
  const groupsWithShowcaseLink = navigationGroups.map((group) => {
    if (group.id !== 'eventos') return group;

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

  const visibleGroups = groupsWithShowcaseLink.map(group => ({
    ...group,
    items: group.items.filter(item => isDeveloper || !item.roles || (userRole && item.roles.includes(userRole)))
  })).filter(group => group.items.length > 0);

  // Lista única para remover blocos/labels visuais sem alterar regras de permissão.
  const visibleItems = visibleGroups.flatMap(group => group.items);

  const handleItemClick = (item: NavigationItem, onClose?: () => void) => {
    if (item.id === 'public-showcase' && !publicShowcaseUrl) {
      toast.warning('Configure o link da sua vitrine em /admin/empresa antes de acessar.');
      navigate('/admin/empresa');
      onClose?.();
    }
  };

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    // Por padrão os grupos iniciam fechados; apenas o grupo da rota ativa nasce aberto para manter contexto.
    const activeGroup = visibleGroups.find(group =>
      group.items.some(item => item.href && (location.pathname === item.href || location.pathname.startsWith(`${item.href}/`)))
    );

    return activeGroup ? {
      [activeGroup.id]: true
    } : {};
  });

  const toggleGroup = (groupId: string) => {
    setOpenGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  const isDeveloperOnlyItem = (item: NavigationItem) => item.roles?.length === 1 && item.roles[0] === 'developer';

  /* ── Expanded sidebar content (used for both mobile overlay and desktop expanded) ── */
  const expandedContent = (showToggle: boolean, onClose?: () => void) => (
    <>
      <div className="flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-4">
        <ExpandedBrandHeader />
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

      <nav className="sidebar-scroll-hidden flex-1 bg-sidebar px-3 py-5 overflow-y-auto">
        {showToggle ? (
          <div className="space-y-4">
            {visibleGroups.map(group => (
              <div key={group.id} className="space-y-1">
                {!group.standalone && (
                  /* Cabeçalho funciona como accordion somente no menu expandido. */
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-1 text-left text-sm font-medium text-[#94A3B8] hover:bg-[#1E293B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    aria-expanded={Boolean(openGroups[group.id])}
                  >
                    {/* Ícone do grupo mantém hierarquia visual sem competir com o estado ativo dos itens. */}
                    <span className="flex items-center gap-2">
                      <group.icon className="h-4 w-4" />
                      <span>{group.label}</span>
                    </span>
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', openGroups[group.id] ? 'rotate-0' : '-rotate-90')} />
                  </button>
                )}

                {(group.standalone || openGroups[group.id]) && group.items.map((item, index) => {
                  const isActive = item.href ? location.pathname === item.href || location.pathname.startsWith(`${item.href}/`) : false;
                  const itemKey = `${group.id}-${item.href ?? item.name}-${index}`;
                  // Apenas subitens de grupos recebem recuo extra para reforçar hierarquia visual no menu expandido.
                  const submenuIndentClass = group.standalone ? 'px-3' : 'pr-3 pl-7';

                  if (item.href && !item.disabled) {
                    if (item.openInNewTab) {
                      return (
                        <a
                          key={itemKey}
                          href={item.href}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => handleItemClick(item, onClose)}
                          className={cn(
                            'relative flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium text-[#CBD5E1] transition-colors hover:bg-[#1E293B] hover:text-white',
                            submenuIndentClass,
                          )}
                        >
                          <item.icon className="h-4 w-4" />
                          <span className="flex flex-1 items-center gap-2">
                            <span>{item.name}</span>
                            {/* Identificador visual discreto para itens técnicos exclusivos do perfil developer. */}
                            {isDeveloper && isDeveloperOnlyItem(item) && (
                              <span className="rounded border border-violet-300 bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                                Dev
                              </span>
                            )}
                          </span>
                        </a>
                      );
                    }

                    return (
                      <NavLink
                        key={itemKey}
                        to={item.href}
                        onClick={() => handleItemClick(item, onClose)}
                        className={cn(
                          'relative flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-colors',
                          submenuIndentClass,
                          isActive
                            ? 'bg-[#243B63] text-white before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:rounded-r before:bg-primary'
                            : 'text-[#CBD5E1] hover:bg-[#1E293B] hover:text-white'
                        )}
                      >
                        <item.icon className={cn('h-4 w-4', isActive && 'text-primary')} />
                        <span className="flex flex-1 items-center gap-2">
                          <span>{item.name}</span>
                          {/* Identificador visual discreto para itens técnicos exclusivos do perfil developer. */}
                          {isDeveloper && isDeveloperOnlyItem(item) && (
                            <span className="rounded border border-violet-300 bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                              Dev
                            </span>
                          )}
                        </span>
                      </NavLink>
                    );
                  }

                  return (
                    <button
                      key={itemKey}
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg py-2.5 text-sm font-medium text-[#64748B] opacity-60',
                        submenuIndentClass,
                      )}
                      disabled
                    >
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
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {visibleItems.map((item, index) => {
            const isActive = item.href ? location.pathname === item.href || location.pathname.startsWith(`${item.href}/`) : false;
            const itemKey = `${item.href ?? item.name}-${index}`;

            if (item.href && !item.disabled) {
              if (item.openInNewTab) {
                return (
                  <a
                    key={itemKey}
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => handleItemClick(item, onClose)}
                    className="relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[#CBD5E1] transition-colors hover:bg-[#1E293B] hover:text-white"
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="flex flex-1 items-center gap-2">
                      <span>{item.name}</span>
                      {/* Identificador visual discreto para itens técnicos exclusivos do perfil developer. */}
                      {isDeveloper && isDeveloperOnlyItem(item) && (
                        <span className="rounded border border-violet-300 bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                          Dev
                        </span>
                      )}
                    </span>
                  </a>
                );
              }

              return (
                <NavLink
                  key={itemKey}
                  to={item.href}
                  onClick={() => handleItemClick(item, onClose)}
                  className={cn(
                    'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-[#243B63] text-white before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:rounded-r before:bg-primary'
                      : 'text-[#CBD5E1] hover:bg-[#1E293B] hover:text-white'
                  )}
                >
                  <item.icon className={cn('h-4 w-4', isActive && 'text-primary')} />
                  <span className="flex flex-1 items-center gap-2">
                    <span>{item.name}</span>
                    {/* Identificador visual discreto para itens técnicos exclusivos do perfil developer. */}
                    {isDeveloper && isDeveloperOnlyItem(item) && (
                      <span className="rounded border border-violet-300 bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                        Dev
                      </span>
                    )}
                  </span>
                </NavLink>
              );
            }

            return (
              <button key={itemKey} type="button" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[#64748B] opacity-60" disabled>
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
        )}
      </nav>

      {/* A troca de empresa permanece centralizada no header para evitar duplicidade de controles. */}

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
          {/* Atualização intencional: estado colapsado usa o novo ícone oficial da marca sem alterar o logo do menu expandido. */}
          <img src={collapsedSidebarOfficialIcon} alt="Smartbus BR" className="h-full w-full rounded-lg object-contain" />
        </div>
        <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-[#1E293B] h-7 w-7" onClick={toggleCollapsed}>
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
      </div>

      {/* Nav icons */}
      <nav className="sidebar-scroll-hidden flex-1 bg-sidebar py-4 overflow-y-auto">
        <div className="flex flex-col items-center gap-1">
          {visibleGroups.flatMap(group =>
            group.items.map((item, index) => {
              const isActive = item.href ? location.pathname === item.href || location.pathname.startsWith(`${item.href}/`) : false;
              // Chave estável/única evita artefatos visuais ao alternar expandido/colapsado com itens duplicados por nome.
              const collapsedItemKey = `${group.id}-${item.href ?? item.name}-${index}`;
              return <CollapsedNavItem key={collapsedItemKey} item={item} isActive={isActive} onClick={() => handleItemClick(item)} />;
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
