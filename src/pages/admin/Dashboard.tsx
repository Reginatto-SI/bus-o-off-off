import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { subDays, format, startOfDay, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Bus,
  Calendar,
  Globe,
  Ticket,
  ShoppingCart,
  XCircle,
  TrendingUp,
  DollarSign,
  Percent,
  Award,
  Users,
  BarChart3,
  Building2,
  ClipboardList,
  FileText,
  Home,
  LayoutGrid,
  Circle,
  CheckCircle2,
  ArrowRight,
  ImageIcon,
  Sparkles,
  QrCode,
  Clock3,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from 'recharts';

import { AdminLayout } from '@/components/layout/AdminLayout';
import { AdminMobileBottomNav } from '@/components/layout/AdminMobileBottomNav';
import { adminMobileBottomNavItems, type AdminMobileBottomNavItem } from '@/components/layout/adminMobileBottomNavItems';
import { canViewAdminNavigationItem, findAdminNavigationItemByHref } from '@/components/layout/adminNavigation';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatsCard } from '@/components/admin/StatsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import { useAuth } from '@/contexts/AuthContext';
import { useIsBelowBreakpoint } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { formatCurrencyBRL } from '@/lib/currency';
import { normalizePublicSlug } from '@/lib/publicSlug';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/* ═══════════════════════════════════════════════════
   Tipos auxiliares
   ═══════════════════════════════════════════════════ */

type Period = 7 | 30 | 90;

interface OperationalKpis {
  eventsOnSale: number;
  upcomingEvents: number;
  paidSales: number;
  cancelledSales: number;
  occupancyPercent: number | null; // null = não calculável
}

interface FinancialKpis {
  grossRevenue: number;
  platformFee: number;
  sellersCommission: number;
}

interface DailySales {
  date: string; // YYYY-MM-DD
  label: string; // DD/MM
  count: number;
}

interface StatusDist {
  status: string;
  label: string;
  count: number;
}

interface RankItem {
  id: string | null;
  name: string;
  count: number;
}

interface MobileTodaySummary {
  paidSales: number;
  ticketsSold: number;
  grossRevenue: number;
  eventsWithSales: number;
  activeEvents: number;
}

interface MobileRecentSale {
  id: string;
  eventName: string;
  quantity: number;
  grossAmount: number;
  createdAt: string;
}

type SaleStatus = Database['public']['Enums']['sale_status'];
type EventSalesRankRow = {
  event_id: string;
  quantity: number | null;
  events: { name: string | null } | null;
};
type SellerSalesRankRow = {
  seller_id: string | null;
  quantity: number | null;
  sellers: { name: string | null } | null;
};

type MobileTodayOperationalSaleRow = {
  id: string;
  event_id: string | null;
  quantity: number | null;
};

type MobileTodayFinancialSaleRow = MobileTodayOperationalSaleRow & {
  gross_amount: number | null;
  unit_price: number | null;
};

type MobileRecentOperationalSaleRow = {
  id: string;
  created_at: string;
  quantity: number | null;
  events: { name: string | null } | null;
};

type MobileRecentFinancialSaleRow = MobileRecentOperationalSaleRow & {
  gross_amount: number | null;
  unit_price: number | null;
};

interface OnboardingChecklistStatus {
  hasVehicle: boolean;
  hasDriver: boolean;
  hasBoardingConfig: boolean;
  hasEvent: boolean;
  hasPublishedEvent: boolean;
  hasPaidSale: boolean;
}

type OnboardingPopupMode = 'welcome' | 'event_cta' | 'none';
type OnboardingStage =
  | 'initial'
  | 'vehicle_done'
  | 'driver_done'
  | 'boarding_done'
  | 'event_done'
  | 'published_done'
  | 'active';

/* ═══════════════════════════════════════════════════
   Constantes de cores para gráficos (semânticas)
   ═══════════════════════════════════════════════════ */
const STATUS_COLORS: Record<string, string> = {
  pago: 'hsl(var(--success))',
  pendente: 'hsl(var(--warning))',
  pendente_taxa: 'hsl(var(--warning))',
  pendente_pagamento: 'hsl(var(--warning))',
  reservado: 'hsl(var(--warning))',
  cancelado: 'hsl(var(--destructive))',
};
const STATUS_LABELS: Record<string, string> = {
  pago: 'Pago',
  pendente: 'Pendente',
  pendente_taxa: 'Pendente de taxa',
  pendente_pagamento: 'Pendente pagamento',
  reservado: 'Reservado',
  cancelado: 'Cancelado',
};

const CHART_LINE_COLOR = 'hsl(var(--primary))';
const SMARTBUS_TIPS_ADMIN_ROLES = ['developer', 'gerente', 'operador'] as const;
const LG_BREAKPOINT = 1024;
const MOBILE_TODAY_OPERATIONAL_SALE_SELECT = 'id, event_id, quantity';
const MOBILE_TODAY_FINANCIAL_SALE_SELECT = `${MOBILE_TODAY_OPERATIONAL_SALE_SELECT}, gross_amount, unit_price`;
const MOBILE_RECENT_OPERATIONAL_SALE_SELECT = 'id, created_at, quantity, events(name)';
const MOBILE_RECENT_FINANCIAL_SALE_SELECT = 'id, created_at, quantity, gross_amount, unit_price, events(name)';

type MobileHomeLinkItem = {
  title: string;
  description?: string;
  href: string;
  icon: typeof Calendar;
};

const mobileHomeCardCandidates: MobileHomeLinkItem[] = [
  {
    title: 'Vendas',
    description: 'Acompanhe seu desempenho',
    href: '/admin/vendas',
    icon: BarChart3,
  },
  {
    title: 'Eventos',
    description: 'Gerencie seus eventos',
    href: '/admin/eventos',
    icon: Calendar,
  },
  {
    // Comentário: visibilidade herdada do item Validador de Passagens do menu administrativo.
    title: 'Embarque',
    description: 'Controle validações',
    href: '/validador/embarque',
    icon: Bus,
  },
  {
    // Comentário: usa a rota real de lista de embarque para não duplicar o card de Vendas.
    title: 'Lista de embarque',
    description: 'Consulte passageiros',
    href: '/admin/relatorios/lista-embarque',
    icon: ClipboardList,
  },
  {
    title: 'Relatórios',
    description: 'Dados e indicadores',
    href: '/admin/relatorios/vendas',
    icon: FileText,
  },
  {
    // Comentário: fallback real autorizado pelo menu para manter a grade com 6 cards quando Embarque não puder aparecer.
    title: 'Empresa',
    description: 'Dados da operação',
    href: '/admin/empresa',
    icon: Building2,
  },
];

const mobileBottomNavCandidates: AdminMobileBottomNavItem[] = adminMobileBottomNavItems;

function openAdminMobileMenu() {
  window.dispatchEvent(new CustomEvent('smartbus:open-admin-mobile-menu'));
}


function MobileDashboardHome({
  cards,
  bottomNavItems,
  companyName,
  canViewFinancials,
  canViewSalesRoute,
  todaySummary,
  recentSales,
  todaySummaryLoading,
  recentSalesLoading,
  todaySummaryError,
  recentSalesError,
}: {
  cards: MobileHomeLinkItem[];
  bottomNavItems: AdminMobileBottomNavItem[];
  companyName: string;
  canViewFinancials: boolean;
  canViewSalesRoute: boolean;
  todaySummary?: MobileTodaySummary;
  recentSales?: MobileRecentSale[];
  todaySummaryLoading: boolean;
  recentSalesLoading: boolean;
  todaySummaryError: boolean;
  recentSalesError: boolean;
}) {
  const summaryItems = [
    { title: 'Vendas pagas', value: String(todaySummary?.paidSales ?? 0), icon: CheckCircle2 },
    { title: 'Passagens vendidas', value: String(todaySummary?.ticketsSold ?? 0), icon: Ticket },
    canViewFinancials
      ? { title: 'Valor vendido', value: formatCurrencyBRL(todaySummary?.grossRevenue ?? 0), icon: DollarSign }
      : { title: 'Eventos ativos', value: String(todaySummary?.activeEvents ?? 0), icon: Calendar },
    { title: 'Eventos com vendas', value: String(todaySummary?.eventsWithSales ?? 0), icon: Calendar },
  ];

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-[#fbfaf8] pb-[calc(5.35rem+env(safe-area-inset-bottom))] lg:hidden">
      {/* Comentário: home mobile exclusiva; o dashboard desktop continua renderizado apenas em telas grandes. */}
      <section className="relative overflow-hidden rounded-b-[1.15rem] bg-[hsl(var(--primary))] px-6 pb-7 pt-[calc(1.15rem+env(safe-area-inset-top))] text-primary-foreground shadow-[0_10px_22px_rgba(249,115,22,0.18)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_36%),linear-gradient(135deg,rgba(255,255,255,0.1),transparent_46%)]" />
        <div className="relative mx-auto flex max-w-sm justify-center">
          <img src="/logo-branca2.png" alt="SmartBus" className="h-12 w-auto object-contain drop-shadow-sm" />
        </div>
      </section>

      <main className="mx-auto w-full max-w-md px-4 pt-5">
        <section className="mb-5 flex flex-col gap-3 min-[390px]:flex-row min-[390px]:items-center min-[390px]:justify-between">
          <div className="min-w-0 flex-1 space-y-1.5">
            <h1 className="whitespace-nowrap text-[1.65rem] font-bold leading-tight tracking-tight text-slate-950">Olá, gestor! <span aria-hidden="true">👋</span></h1>
            <p className="text-[0.95rem] leading-snug text-slate-600">Acompanhe tudo o que importa em tempo real.</p>
          </div>
          <div
            className="flex w-full items-center gap-2.5 rounded-2xl border border-slate-200/70 bg-white px-3 py-2.5 text-left text-slate-900 shadow-[0_6px_18px_rgba(15,23,42,0.06)] min-[390px]:w-[10.75rem] min-[390px]:shrink-0 min-[430px]:w-48"
            aria-label={`Empresa ativa: ${companyName}`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[hsl(var(--primary))]">
              <Building2 className="h-[1.05rem] w-[1.05rem]" strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.62rem] font-semibold uppercase tracking-wide text-slate-500">Empresa ativa</span>
              <span className="block truncate text-[0.82rem] font-semibold leading-tight text-slate-950">{companyName}</span>
            </span>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 min-[390px]:gap-3.5" aria-label="Acessos rápidos do gestor">
          {cards.map((item) => (
            <Link
              key={item.title}
              to={item.href}
              className="group flex min-h-[6.9rem] flex-col items-center justify-center rounded-[1.05rem] border border-slate-200/70 bg-white px-3 py-3.5 text-center shadow-[0_7px_18px_rgba(15,23,42,0.055)] transition active:scale-[0.98] min-[390px]:min-h-[7.25rem] min-[430px]:min-h-[7.5rem]"
            >
              <item.icon className="mb-2.5 h-9 w-9 text-[hsl(var(--primary))] transition group-active:scale-95" strokeWidth={1.9} />
              <span className="text-[0.98rem] font-semibold leading-tight text-slate-950 min-[390px]:text-[1.02rem]">{item.title}</span>
              <span className="mt-1.5 text-[0.78rem] leading-snug text-slate-500">{item.description}</span>
            </Link>
          ))}

          <button
            type="button"
            onClick={openAdminMobileMenu}
            className="group flex min-h-[6.9rem] flex-col items-center justify-center rounded-[1.05rem] border border-slate-200/70 bg-white px-3 py-3.5 text-center shadow-[0_7px_18px_rgba(15,23,42,0.055)] transition active:scale-[0.98] min-[390px]:min-h-[7.25rem] min-[430px]:min-h-[7.5rem]"
          >
            <LayoutGrid className="mb-2.5 h-9 w-9 text-[hsl(var(--primary))] transition group-active:scale-95" strokeWidth={1.9} />
            <span className="text-[1.02rem] font-semibold leading-tight text-slate-950">Mais</span>
            <span className="mt-1.5 text-[0.78rem] leading-snug text-slate-500">Outras funcionalidades</span>
          </button>
        </section>

        <section className="mt-6 space-y-3" aria-labelledby="mobile-today-summary-title">
          <h2 id="mobile-today-summary-title" className="text-base font-bold text-slate-950">Resumo de hoje</h2>
          {todaySummaryError ? (
            <p className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-sm text-slate-600 shadow-[0_5px_14px_rgba(15,23,42,0.045)]">Não foi possível carregar o resumo de hoje agora.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5 min-[390px]:gap-3">
                {summaryItems.map((item) => (
                  <div key={item.title} className="rounded-2xl border border-slate-200/70 bg-white p-3 shadow-[0_5px_14px_rgba(15,23,42,0.045)]">
                    {todaySummaryLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-6 w-6 rounded-lg" />
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-6 w-16" />
                      </div>
                    ) : (
                      <>
                        <span className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 text-[hsl(var(--primary))]">
                          <item.icon className="h-4 w-4" strokeWidth={2} />
                        </span>
                        <span className="block text-[0.7rem] font-semibold leading-tight text-slate-500">{item.title}</span>
                        <span className="mt-1 block truncate text-[1.12rem] font-bold leading-tight text-slate-950">{item.value}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
              {!todaySummaryLoading && (todaySummary?.paidSales ?? 0) === 0 && (
                <p className="text-sm text-slate-500">Nenhuma venda confirmada hoje.</p>
              )}
            </>
          )}
        </section>

        <section className="mt-6 space-y-3" aria-labelledby="mobile-recent-sales-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="mobile-recent-sales-title" className="text-base font-bold text-slate-950">Últimas vendas</h2>
            {canViewSalesRoute && (
              <Link to="/admin/vendas" className="text-sm font-semibold text-[hsl(var(--primary))] active:opacity-80">Ver todas</Link>
            )}
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_5px_14px_rgba(15,23,42,0.045)]">
            {recentSalesError ? (
              <p className="px-4 py-3 text-sm text-slate-600">Não foi possível carregar as últimas vendas agora.</p>
            ) : recentSalesLoading ? (
              <div className="divide-y divide-slate-100">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="space-y-2 px-4 py-3">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-44" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                ))}
              </div>
            ) : (recentSales?.length ?? 0) === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500">As vendas confirmadas aparecerão aqui.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentSales?.map((sale) => (
                  <div key={sale.id} className="px-4 py-3">
                    <p className="truncate text-sm font-semibold text-slate-950">{sale.eventName}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {sale.quantity} {sale.quantity === 1 ? 'passagem' : 'passagens'}
                      {canViewFinancials && <> · {formatCurrencyBRL(sale.grossAmount)}</>}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-slate-500"><Clock3 className="h-3 w-3" />{formatMobileSaleTime(sale.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <AdminMobileBottomNav activeItem="inicio" items={bottomNavItems} onMoreClick={openAdminMobileMenu} />
    </div>
  );
}

const smartbusTips = [
  {
    title: 'Venda passeios e experiências',
    description: 'Cadastre passeios de bugue, catamarã, mergulho, city tour, traslado, hospedagem e outros serviços turísticos.',
    image: '/marketing/smartbus-tips/passeios-servicos.svg',
    buttonLabel: 'Criar novo evento',
    href: '/admin/eventos?novo=1',
  },
  {
    title: 'Crie tipos de passagem',
    description: 'Venda categorias diferentes como adulto, infantil, idoso, meia entrada, pacote com hotel ou pacote sem hotel.',
    image: '/marketing/smartbus-tips/tipos-passagem.svg',
    buttonLabel: 'Ver eventos',
    href: '/admin/eventos',
  },
  {
    title: 'Use recursos inclusos',
    description: 'Aproveite embarques, veículos, assentos, passageiros, QR Code, check-in e vitrine pública sem custo adicional.',
    image: '/marketing/smartbus-tips/recursos-inclusos.svg',
    buttonLabel: 'Abrir vitrine pública',
    href: null,
  },
  {
    title: 'Cadastre patrocinadores',
    description: 'Divulgue marcas e empresas apoiadoras nos seus eventos, fortalecendo parcerias comerciais e aumentando o valor da experiência.',
    image: '/marketing/smartbus-tips/patrocinadores.svg',
    buttonLabel: 'Gerenciar patrocinadores',
    href: '/admin/patrocinadores',
  },
  {
    title: 'Cadastre parceiros',
    description: 'Organize parceiros comerciais e operacionais para ampliar sua rede de divulgação, apoio e relacionamento dentro do SmartBus.',
    image: '/marketing/smartbus-tips/parceiros.svg',
    buttonLabel: 'Gerenciar parceiros',
    href: '/admin/parceiros',
  },
  {
    title: 'Valide passagens com QR Code',
    description: 'Use o aplicativo de embarque para escanear QR Codes, confirmar passageiros e acompanhar quem já embarcou ou ainda está pendente.',
    image: '/marketing/smartbus-tips/qr-code-embarque.svg',
    buttonLabel: 'Abrir aplicativo',
    href: '/validador',
    openInNewTab: true,
  },
] as const;

/* ═══════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════ */

function formatPercent(value: number | null) {
  if (value === null) return '—';
  return `${value.toFixed(1)}%`;
}

function formatMobileSaleTime(dateInput: string) {
  return format(new Date(dateInput), 'HH:mm', { locale: ptBR });
}

function getMobileTodayRange(now = new Date()) {
  const dayKey = format(now, 'yyyy-MM-dd');
  const dayStart = startOfDay(now);

  return {
    dayKey,
    todayStartIso: dayStart.toISOString(),
    tomorrowStartIso: addDays(dayStart, 1).toISOString(),
  };
}

function SmartbusTipImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border bg-muted/40 text-muted-foreground">
        <ImageIcon className="h-10 w-10" aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={cn('h-32 w-full rounded-xl border bg-muted/20 object-cover', className)}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}

/* ═══════════════════════════════════════════════════
   Componente principal
   ═══════════════════════════════════════════════════ */

export default function Dashboard() {
  const { user, activeCompanyId, activeCompany, canViewFinancials, userRole, isDeveloper, canAccessTemplatesLayout } = useAuth();
  const isMobileDashboardHomeVisible = useIsBelowBreakpoint(LG_BREAKPOINT);
  const navigate = useNavigate();
  const location = useLocation();
  const [period, setPeriod] = useState<Period>(30);
  const [onboardingPopupOpen, setOnboardingPopupOpen] = useState(false);
  const [smartbusTipsOpen, setSmartbusTipsOpen] = useState(false);
  const [doNotShowSmartbusTips, setDoNotShowSmartbusTips] = useState(false);
  const [smartbusTipsCarouselApi, setSmartbusTipsCarouselApi] = useState<CarouselApi>();
  const [smartbusTipsCarouselIndex, setSmartbusTipsCarouselIndex] = useState(0);
  const [mobileTodayRange, setMobileTodayRange] = useState(() => getMobileTodayRange());
  const lastPopupModeRef = useRef<OnboardingPopupMode | null>(null);
  const onboardingWelcomeDismissKey = useMemo(
    () => `admin-dashboard:onboarding-popup-welcome-dismissed:${activeCompanyId ?? 'no-company'}`,
    [activeCompanyId]
  );
  const onboardingEventCtaDismissKey = useMemo(
    () => `admin-dashboard:onboarding-popup-event-cta-dismissed:${activeCompanyId ?? 'no-company'}`,
    [activeCompanyId]
  );

  // Comentário: reaproveita o mesmo padrão de nick público usado no restante do admin.
  const normalizedPublicSlug = useMemo(() => normalizePublicSlug(activeCompany?.public_slug ?? ''), [activeCompany?.public_slug]);
  const publicShowcaseUrl = useMemo(
    () => (normalizedPublicSlug ? `${window.location.origin}/${normalizedPublicSlug}` : null),
    [normalizedPublicSlug]
  );

  const handleOpenPublicShowcase = () => {
    if (!publicShowcaseUrl) {
      toast.warning('Configure o link da sua vitrine em /admin/empresa antes de acessar.');
      navigate('/admin/empresa');
      return;
    }

    window.open(publicShowcaseUrl, '_blank', 'noopener,noreferrer');
  };

  const dateFrom = useMemo(() => subDays(startOfDay(new Date()), period).toISOString(), [period]);
  const today = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const futureDate = useMemo(() => format(addDays(new Date(), period), 'yyyy-MM-dd'), [period]);

  // ─── Guard: sem empresa ativa não consulta ─────────────
  const enabled = Boolean(activeCompanyId);
  const canViewSmartbusTips =
    Boolean(activeCompanyId) &&
    SMARTBUS_TIPS_ADMIN_ROLES.includes(userRole as (typeof SMARTBUS_TIPS_ADMIN_ROLES)[number]);
  const canViewMobileRoute = useMemo(() => {
    // Comentário: cards e menu inferior reutilizam a regra real do menu administrativo por href, sem segunda matriz de permissões.
    return (href: string) => {
      if (href === '/admin/dashboard') return true;
      const navigationHref = href === '/validador/embarque' ? '/validador' : href;
      return canViewAdminNavigationItem({
        item: findAdminNavigationItemByHref(navigationHref),
        userRole,
        isDeveloper,
        canAccessTemplatesLayout,
      });
    };
  }, [canAccessTemplatesLayout, isDeveloper, userRole]);
  const canAccessDriverValidatorShortcut = canViewMobileRoute('/validador/embarque');
  const mobileHomeCards = useMemo(
    () => mobileHomeCardCandidates.filter((item) => canViewMobileRoute(item.href)).slice(0, 5),
    [canViewMobileRoute]
  );
  const mobileBottomNavItems = useMemo(
    () => mobileBottomNavCandidates.filter((item) => canViewMobileRoute(item.href)).slice(0, 3),
    [canViewMobileRoute]
  );
  const mobileCompanyName = activeCompany?.trade_name || activeCompany?.name || 'empresa atual';

  const smartbusTipsDismissKey = useMemo(
    () => (
      activeCompanyId
        ? `admin-dashboard:smartbus-tips-dismissed:${activeCompanyId}:${user?.id ?? 'no-user'}`
        : null
    ),
    [activeCompanyId, user?.id]
  );

  const handleSmartbusTipsOpenChange = (open: boolean) => {
    if (!open && doNotShowSmartbusTips && smartbusTipsDismissKey) {
      window.localStorage.setItem(smartbusTipsDismissKey, '1');
    }
    setSmartbusTipsOpen(open);
  };

  const handleOpenSmartbusTipsFromCard = () => {
    // Comentário: o card fixo sempre permite reabrir a comunicação, mesmo quando o popup automático foi dispensado.
    setDoNotShowSmartbusTips(false);
    setSmartbusTipsOpen(true);
  };

  const handleOpenPublicShowcaseFromSmartbusTips = () => {
    // Comentário: valida a vitrine antes de fechar o modal promocional para evitar transição brusca.
    if (!publicShowcaseUrl) {
      toast.warning('Configure o link da sua vitrine em /admin/empresa antes de acessar.');
      handleSmartbusTipsOpenChange(false);
      navigate('/admin/empresa');
      return;
    }

    handleSmartbusTipsOpenChange(false);
    window.open(publicShowcaseUrl, '_blank', 'noopener,noreferrer');
  };

  /* ─── Onboarding inicial ───────────────────────────────
     Comentário: esta leitura usa dados reais por empresa (company_id)
     nas tabelas events, vehicles, boarding_locations e sales.
     Não existe estado fake: o checklist sempre reflete o banco atual. */
  const { data: onboardingLightStatus, isLoading: onboardingLightLoading } = useQuery({
    // Otimização: leitura leve primeiro (sem joins pesados) para o card aparecer cedo.
    queryKey: ['dashboard-onboarding-light', activeCompanyId],
    enabled,
    queryFn: async (): Promise<OnboardingChecklistStatus> => {
      const [{ count: vehiclesCount }, { count: driversCount }, { count: eventsCount }, { count: paidSalesCount }] = await Promise.all([
        supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_id', activeCompanyId!),
        // Validação real do passo "Cadastrar motorista" usando a estrutura oficial do admin.
        supabase.from('drivers').select('id', { count: 'exact', head: true }).eq('company_id', activeCompanyId!),
        supabase.from('events').select('id', { count: 'exact', head: true }).eq('company_id', activeCompanyId!),
        supabase.from('sales').select('id', { count: 'exact', head: true }).eq('company_id', activeCompanyId!).eq('status', 'pago'),
      ]);

      return {
        hasVehicle: (vehiclesCount ?? 0) > 0,
        hasDriver: (driversCount ?? 0) > 0,
        hasBoardingConfig: false,
        hasEvent: (eventsCount ?? 0) > 0,
        hasPublishedEvent: false,
        hasPaidSale: (paidSalesCount ?? 0) > 0,
      };
    },
  });

  // Regra determinística: consultas de onboarding não dependem de pré-requisitos entre si.
  // Cada etapa é avaliada por existência de dados essenciais da própria empresa ativa.
  const shouldEnableOnboardingHeavy = Boolean(activeCompanyId);
  const { data: onboardingHeavyStatus, isLoading: onboardingHeavyLoading } = useQuery({
    // Regra simples e auditável: contagens diretas por company_id, sem dependências implícitas.
    queryKey: ['dashboard-onboarding-heavy', activeCompanyId],
    enabled: shouldEnableOnboardingHeavy,
    queryFn: async (): Promise<Pick<OnboardingChecklistStatus, 'hasBoardingConfig' | 'hasPublishedEvent'>> => {
      const [{ count: boardingCount }, { count: publishedEventsCount }] = await Promise.all([
        // "Configurar embarque": concluído quando existe ao menos 1 local ativo da empresa.
        supabase
          .from('boarding_locations')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', activeCompanyId!)
          .eq('status', 'ativo'),
        // "Publicar viagem": concluído quando existe ao menos 1 evento ativo em venda da empresa.
        supabase
          .from('events')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', activeCompanyId!)
          .eq('status', 'a_venda')
          .eq('is_archived', false),
      ]);

      return {
        hasBoardingConfig: (boardingCount ?? 0) > 0,
        hasPublishedEvent: (publishedEventsCount ?? 0) > 0,
      };
    },
  });

  const onboardingStatus = useMemo<OnboardingChecklistStatus>(() => ({
    hasVehicle: onboardingLightStatus?.hasVehicle ?? false,
    hasDriver: onboardingLightStatus?.hasDriver ?? false,
    hasBoardingConfig: onboardingHeavyStatus?.hasBoardingConfig ?? false,
    hasEvent: onboardingLightStatus?.hasEvent ?? false,
    hasPublishedEvent: onboardingHeavyStatus?.hasPublishedEvent ?? false,
    hasPaidSale: onboardingLightStatus?.hasPaidSale ?? false,
  }), [onboardingHeavyStatus, onboardingLightStatus]);
  const onboardingLoading = onboardingLightLoading;

  const onboardingItems = useMemo(
    () => [
      {
        key: 'vehicle',
        label: 'Cadastrar veículo',
        description: 'Cadastre pelo menos um veículo para começar a operar suas viagens.',
        done: onboardingStatus.hasVehicle,
        isLoading: onboardingLoading,
        href: '/admin/frota',
      },
      {
        key: 'driver',
        label: 'Cadastrar motorista',
        description: 'Cadastre motoristas para vincular às viagens e liberar a operação.',
        done: onboardingStatus.hasDriver,
        isLoading: onboardingLoading,
        href: '/admin/motoristas',
      },
      {
        key: 'boarding',
        label: 'Configurar embarque',
        description: 'Cadastre locais de embarque para definir onde os passageiros irão embarcar.',
        done: onboardingStatus.hasBoardingConfig,
        // Validação pesada carregada depois para não segurar a pintura inicial do card.
        isLoading: onboardingHeavyLoading,
        href: '/admin/locais',
      },
      {
        key: 'event',
        label: 'Criar primeiro evento',
        description: 'Crie seu primeiro evento para disponibilizar passagens para venda.',
        done: onboardingStatus.hasEvent,
        isLoading: onboardingLoading,
        href: '/admin/eventos?novo=1',
      },
      {
        key: 'publish',
        label: 'Publicar viagem',
        description: 'Publique a viagem para liberar a venda de passagens.',
        done: onboardingStatus.hasPublishedEvent,
        isLoading: onboardingHeavyLoading,
        href: '/admin/eventos',
      },
      {
        key: 'sale',
        label: 'Fazer primeira venda',
        description: 'Realize sua primeira venda para iniciar sua operação no sistema.',
        done: onboardingStatus.hasPaidSale,
        isLoading: onboardingLoading,
        // Mantido: /admin/vendas abre o modal de nova venda via `novaVenda=1` (fluxo já suportado pela tela de vendas).
        href: '/admin/vendas?novaVenda=1&aba=manual',
      },
    ],
    [onboardingLoading, onboardingStatus, onboardingHeavyLoading]
  );
  // Nova ordem operacional explícita: veículo → motorista → embarque → evento → publicação → venda.
  const nextOnboardingStep = useMemo(
    // Lógica previsível: primeiro passo ainda pendente; se estiver carregando, aguardamos antes de avançar.
    () => {
      for (const item of onboardingItems) {
        if (item.isLoading) return null;
        if (!item.done) return item;
      }
      return null;
    },
    [onboardingItems]
  );

  // Estágio contextual do onboarding derivado dos mesmos booleanos reais do checklist.
  // Importante: este estágio não cria regra nova; apenas melhora a comunicação da jornada atual.
  const onboardingStage = useMemo<OnboardingStage>(() => {
    if (onboardingStatus.hasPaidSale) return 'active';
    if (onboardingStatus.hasPublishedEvent) return 'published_done';
    if (onboardingStatus.hasEvent) return 'event_done';
    if (onboardingStatus.hasBoardingConfig) return 'boarding_done';
    if (onboardingStatus.hasDriver) return 'driver_done';
    if (onboardingStatus.hasVehicle) return 'vehicle_done';
    return 'initial';
  }, [onboardingStatus]);

  // Conteúdo contextual por estágio: orienta sem inventar dependências novas.
  const onboardingStageContent = useMemo(() => {
    const stageMap: Record<OnboardingStage, { title: string; description: string; ctaLabel?: string }> = {
      initial: {
        title: 'Comece configurando sua operação',
        description: 'Cadastre os dados básicos da empresa para preparar seu ambiente de vendas.',
        ctaLabel: 'Cadastrar veículo',
      },
      vehicle_done: {
        title: 'Ótimo, o primeiro veículo já foi cadastrado',
        description: 'Agora cadastre motoristas para poder organizar melhor sua operação.',
        ctaLabel: 'Cadastrar motorista',
      },
      driver_done: {
        title: 'Sua base operacional está quase pronta',
        description: 'Agora configure os locais de embarque para definir onde os passageiros poderão embarcar.',
        ctaLabel: 'Configurar embarque',
      },
      boarding_done: {
        title: 'Estrutura pronta para começar a vender',
        description: 'Agora crie seu primeiro evento para disponibilizar passagens no sistema.',
        ctaLabel: 'Criar evento',
      },
      event_done: {
        title: 'Seu primeiro evento já foi criado',
        description: 'Falta apenas publicar a viagem para liberar a venda de passagens.',
        ctaLabel: 'Publicar viagem',
      },
      published_done: {
        title: 'Tudo pronto para vender',
        description: 'Seu evento já está em venda. Agora realize a primeira venda para iniciar sua operação.',
        ctaLabel: 'Fazer primeira venda',
      },
      active: {
        title: 'Operação iniciada com sucesso',
        description: 'Sua empresa já realizou vendas. Agora acompanhe a operação e continue expandindo.',
        ctaLabel: 'Ver vendas',
      },
    };
    return stageMap[onboardingStage];
  }, [onboardingStage]);

  // Encerramento explícito do onboarding: todas as etapas concluídas = experiência finalizada.
  const onboardingCompletedCount = useMemo(
    () => onboardingItems.filter((item) => item.done).length,
    [onboardingItems]
  );
  const isOnboardingCompleted = onboardingCompletedCount >= onboardingItems.length;

  useEffect(() => {
    // Reavalia popup ao trocar empresa ativa.
    lastPopupModeRef.current = null;
    setOnboardingPopupOpen(false);
  }, [activeCompanyId]);

  useEffect(() => {
    // Regra de produto: onboarding concluído encerra card/popup e não deve reaparecer.
    if (isOnboardingCompleted) {
      setOnboardingPopupOpen(false);
      return;
    }

    // Popup contextual:
    // - estágio inicial: boas-vindas e orientação do passo a passo (sem pressionar criação de evento).
    // - estágio pronto para evento: CTA direto só quando "Criar primeiro evento" for o próximo passo lógico.
    if (onboardingLightLoading || onboardingStatus.hasEvent) {
      if (!onboardingLightLoading && onboardingStatus.hasEvent) {
        window.localStorage.removeItem(onboardingWelcomeDismissKey);
        window.localStorage.removeItem(onboardingEventCtaDismissKey);
      }
      return;
    }
    let popupMode: OnboardingPopupMode = 'welcome';
    const shouldShowEventCtaPopup =
      onboardingStatus.hasVehicle &&
      onboardingStatus.hasDriver &&
      onboardingStatus.hasBoardingConfig &&
      !onboardingStatus.hasEvent &&
      nextOnboardingStep?.key === 'event';
    if (shouldShowEventCtaPopup) {
      popupMode = 'event_cta';
    }

    if (lastPopupModeRef.current === popupMode) return;
    lastPopupModeRef.current = popupMode;

    if (popupMode === 'event_cta') {
      const dismissedEventCta = window.localStorage.getItem(onboardingEventCtaDismissKey) === '1';
      setOnboardingPopupOpen(!dismissedEventCta);
      return;
    }

    const dismissedWelcome = window.localStorage.getItem(onboardingWelcomeDismissKey) === '1';
    setOnboardingPopupOpen(!dismissedWelcome);
  }, [
    onboardingEventCtaDismissKey,
    isOnboardingCompleted,
    onboardingLightLoading,
    onboardingStatus,
    onboardingWelcomeDismissKey,
    nextOnboardingStep?.key,
  ]);

  const shouldShowOnboardingCard =
    enabled &&
    (onboardingLoading ||
      onboardingHeavyLoading ||
      onboardingCompletedCount < onboardingItems.length);

  useEffect(() => {
    // Comentário: o popup promocional automático só aparece quando o onboarding não está ativo,
    // evitando dois modais no carregamento. O card fixo continua abrindo manualmente.
    if (!canViewSmartbusTips || !smartbusTipsDismissKey || shouldShowOnboardingCard || onboardingPopupOpen) return;
    setDoNotShowSmartbusTips(false);
    setSmartbusTipsOpen(window.localStorage.getItem(smartbusTipsDismissKey) !== '1');
  }, [canViewSmartbusTips, onboardingPopupOpen, shouldShowOnboardingCard, smartbusTipsDismissKey]);

  useEffect(() => {
    if (!smartbusTipsCarouselApi) return;

    const updateSmartbusTipsCarouselIndex = () => {
      setSmartbusTipsCarouselIndex(smartbusTipsCarouselApi.selectedScrollSnap());
    };

    updateSmartbusTipsCarouselIndex();
    smartbusTipsCarouselApi.on('select', updateSmartbusTipsCarouselIndex);
    smartbusTipsCarouselApi.on('reInit', updateSmartbusTipsCarouselIndex);

    return () => {
      smartbusTipsCarouselApi.off('select', updateSmartbusTipsCarouselIndex);
      smartbusTipsCarouselApi.off('reInit', updateSmartbusTipsCarouselIndex);
    };
  }, [smartbusTipsCarouselApi]);

  useEffect(() => {
    if (!smartbusTipsOpen) return;

    // Comentário: ao reabrir o popup mobile, o carrossel volta ao primeiro conteúdo em vez de manter o último slide visto.
    setSmartbusTipsCarouselIndex(0);
    smartbusTipsCarouselApi?.scrollTo(0);
  }, [smartbusTipsCarouselApi, smartbusTipsOpen]);

  useEffect(() => {
    if (!isMobileDashboardHomeVisible) return;

    const syncMobileTodayRange = () => {
      const nextRange = getMobileTodayRange();
      // Atualiza apenas quando a chave do dia muda; assim o refetch ao foco usa o novo intervalo sem polling.
      setMobileTodayRange((currentRange) => (currentRange.dayKey === nextRange.dayKey ? currentRange : nextRange));
    };

    window.addEventListener('focus', syncMobileTodayRange);
    document.addEventListener('visibilitychange', syncMobileTodayRange);
    syncMobileTodayRange();

    return () => {
      window.removeEventListener('focus', syncMobileTodayRange);
      document.removeEventListener('visibilitychange', syncMobileTodayRange);
    };
  }, [isMobileDashboardHomeVisible]);

  // Mantém as consultas novas restritas à experiência mobile (<lg), evitando tráfego oculto no dashboard desktop.
  const mobileQueriesEnabled = enabled && isMobileDashboardHomeVisible;

  const { data: mobileTodaySummary, isLoading: mobileTodaySummaryLoading, isError: mobileTodaySummaryError } = useQuery({
    queryKey: ['dashboard-mobile-today-summary', activeCompanyId, mobileTodayRange.dayKey, canViewFinancials],
    enabled: mobileQueriesEnabled,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<MobileTodaySummary> => {
      const [{ data: todaySales, error: todaySalesError }, { count: activeEventsCount, error: activeEventsError }] = await Promise.all([
        supabase
          .from('sales')
          .select(canViewFinancials ? MOBILE_TODAY_FINANCIAL_SALE_SELECT : MOBILE_TODAY_OPERATIONAL_SALE_SELECT)
          .eq('company_id', activeCompanyId!)
          .eq('status', 'pago')
          .gte('created_at', mobileTodayRange.todayStartIso)
          .lt('created_at', mobileTodayRange.tomorrowStartIso),
        supabase
          .from('events')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', activeCompanyId!)
          .eq('status', 'a_venda')
          .eq('is_archived', false),
      ]);

      if (todaySalesError) throw todaySalesError;
      if (activeEventsError) throw activeEventsError;

      const paidSales = (todaySales ?? []) as Array<MobileTodayOperationalSaleRow | MobileTodayFinancialSaleRow>;
      const eventIds = new Set(paidSales.map((sale) => sale.event_id).filter(Boolean));
      const financialSales = canViewFinancials ? paidSales as MobileTodayFinancialSaleRow[] : [];
      return {
        paidSales: paidSales.length,
        // Mesma regra operacional já usada no dashboard e em /admin/vendas: quantity da venda.
        ticketsSold: paidSales.reduce((sum, sale) => sum + (Number(sale.quantity) || 0), 0),
        // Mesma base financeira exibida em vendas/relatórios: gross_amount com fallback quantity * unit_price.
        grossRevenue: financialSales.reduce((sum, sale) => sum + (Number(sale.gross_amount) || (Number(sale.quantity) || 0) * (Number(sale.unit_price) || 0)), 0),
        eventsWithSales: eventIds.size,
        activeEvents: activeEventsCount ?? 0,
      };
    },
  });

  const { data: mobileRecentSales, isLoading: mobileRecentSalesLoading, isError: mobileRecentSalesError } = useQuery({
    queryKey: ['dashboard-mobile-recent-sales', activeCompanyId, canViewFinancials],
    enabled: mobileQueriesEnabled,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<MobileRecentSale[]> => {
      const { data, error } = await supabase
        .from('sales')
        .select(canViewFinancials ? MOBILE_RECENT_FINANCIAL_SALE_SELECT : MOBILE_RECENT_OPERATIONAL_SALE_SELECT)
        .eq('company_id', activeCompanyId!)
        .eq('status', 'pago')
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) throw error;

      const recentRows = (data ?? []) as Array<MobileRecentOperationalSaleRow | MobileRecentFinancialSaleRow>;
      return recentRows.map((sale) => {
        const financialSale = canViewFinancials ? sale as MobileRecentFinancialSaleRow : null;
        return {
          id: sale.id,
          eventName: sale.events?.name ?? 'Evento',
          quantity: Number(sale.quantity) || 0,
          grossAmount: financialSale ? Number(financialSale.gross_amount) || (Number(financialSale.quantity) || 0) * (Number(financialSale.unit_price) || 0) : 0,
          createdAt: sale.created_at,
        };
      });
    },
  });

  /* ─── KPIs Operacionais ─────────────────────────────── */
  const { data: opKpis, isLoading: opLoading } = useQuery({
    queryKey: ['dashboard-op', activeCompanyId, period],
    enabled,
    queryFn: async (): Promise<OperationalKpis> => {
      // Eventos à venda (não arquivados)
      const { count: eventsOnSale } = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', activeCompanyId!)
        .eq('status', 'a_venda')
        .eq('is_archived', false);

      // Próximos eventos (N dias)
      const { count: upcomingEvents } = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', activeCompanyId!)
        .eq('status', 'a_venda')
        .eq('is_archived', false)
        .gte('date', today)
        .lte('date', futureDate);

      // Vendas pagas no período
      const { count: paidSales } = await supabase
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', activeCompanyId!)
        .eq('status', 'pago')
        .gte('created_at', dateFrom);

      // Vendas canceladas no período
      const { count: cancelledSales } = await supabase
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', activeCompanyId!)
        .eq('status', 'cancelado')
        .gte('created_at', dateFrom);

      // Ocupação média: sum(quantity vendas pagas) / sum(capacity trips vinculadas a eventos à venda não arquivados)
      let occupancyPercent: number | null = null;
      try {
        // Buscar trips com capacidade para eventos ativos
        const { data: trips } = await supabase
          .from('trips')
          .select('id, capacity, event_id')
          .eq('company_id', activeCompanyId!);

        // Filtrar somente trips de eventos à venda/não arquivados
        const { data: activeEvents } = await supabase
          .from('events')
          .select('id')
          .eq('company_id', activeCompanyId!)
          .eq('status', 'a_venda')
          .eq('is_archived', false);

        const activeEventIds = new Set((activeEvents ?? []).map(e => e.id));
        const relevantTrips = (trips ?? []).filter(t => activeEventIds.has(t.event_id));
        const totalCapacity = relevantTrips.reduce((sum, t) => sum + (t.capacity || 0), 0);

        if (totalCapacity > 0) {
          const tripIds = relevantTrips.map(t => t.id);
          // Buscar sum de quantity de vendas pagas para essas trips
          const { data: salesData } = await supabase
            .from('sales')
            .select('quantity')
            .eq('company_id', activeCompanyId!)
            .eq('status', 'pago')
            .in('trip_id', tripIds);

          const totalSold = (salesData ?? []).reduce((sum, s) => sum + (s.quantity || 0), 0);
          occupancyPercent = (totalSold / totalCapacity) * 100;
        }
      } catch {
        // Ignorar falha de ocupação — mostra "—"
      }

      return {
        eventsOnSale: eventsOnSale ?? 0,
        upcomingEvents: upcomingEvents ?? 0,
        paidSales: paidSales ?? 0,
        cancelledSales: cancelledSales ?? 0,
        occupancyPercent,
      };
    },
  });

  /* ─── KPIs Financeiros (SOMENTE se canViewFinancials) ── */
  const { data: finKpis, isLoading: finLoading } = useQuery({
    queryKey: ['dashboard-fin', activeCompanyId, period],
    // Segurança: query nunca executa para Operador
    enabled: enabled && canViewFinancials,
    queryFn: async (): Promise<FinancialKpis> => {
      // Usar RPC existente que já agrega KPIs financeiros
      const { data } = await supabase.rpc('get_sales_report_kpis', {
        p_company_id: activeCompanyId!,
        p_date_from: dateFrom,
        p_status: 'pago' satisfies SaleStatus,
      });

      const row = data?.[0];
      return {
        grossRevenue: Number(row?.gross_revenue ?? 0),
        platformFee: Number(row?.platform_fee ?? 0),
        sellersCommission: Number(row?.sellers_commission ?? 0),
      };
    },
  });

  /* ─── Gráfico: Vendas pagas por dia ───────────────────── */
  const { data: dailySales, isLoading: dailyLoading } = useQuery({
    queryKey: ['dashboard-daily', activeCompanyId, period],
    enabled,
    queryFn: async (): Promise<DailySales[]> => {
      const { data } = await supabase
        .from('sales')
        .select('created_at, quantity')
        .eq('company_id', activeCompanyId!)
        .eq('status', 'pago')
        .gte('created_at', dateFrom);

      // Agrupar por dia no front
      const map = new Map<string, number>();
      // Inicializar todos os dias do range
      for (let i = 0; i < period; i++) {
        const d = format(addDays(subDays(new Date(), period - 1), i), 'yyyy-MM-dd');
        map.set(d, 0);
      }
      (data ?? []).forEach(s => {
        const d = s.created_at?.slice(0, 10);
        if (d) map.set(d, (map.get(d) ?? 0) + (s.quantity || 1));
      });

      return Array.from(map.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({
          date,
          label: format(new Date(date + 'T12:00:00'), 'dd/MM', { locale: ptBR }),
          count,
        }));
    },
  });

  /* ─── Gráfico: Distribuição por status ────────────────── */
  const { data: statusDist, isLoading: statusLoading } = useQuery({
    queryKey: ['dashboard-status', activeCompanyId, period],
    enabled,
    queryFn: async (): Promise<StatusDist[]> => {
      // Incluímos pendente para separar pipeline operacional de venda já paga.
      const statuses = ['pendente_pagamento', 'reservado', 'pago', 'cancelado'] as const;
      const results: StatusDist[] = [];

      for (const status of statuses) {
        const { count } = await supabase
          .from('sales')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', activeCompanyId!)
          .eq('status', status)
          .gte('created_at', dateFrom);

        results.push({
          status,
          label: STATUS_LABELS[status],
          count: count ?? 0,
        });
      }
      return results;
    },
  });

  /* ─── Ranking: Top 5 eventos ──────────────────────────── */
  const { data: topEvents, isLoading: topEventsLoading } = useQuery({
    queryKey: ['dashboard-top-events', activeCompanyId, period],
    enabled,
    queryFn: async (): Promise<RankItem[]> => {
      const { data } = await supabase
        .from('sales')
        .select('event_id, quantity, events!inner(name, is_archived)')
        .eq('company_id', activeCompanyId!)
        .eq('status', 'pago')
        .eq('events.is_archived', false)
        .gte('created_at', dateFrom);

      const map = new Map<string, { name: string; count: number }>();
      ((data ?? []) as EventSalesRankRow[]).forEach((s) => {
        const id = s.event_id;
        const name = s.events?.name ?? 'Evento';
        const prev = map.get(id) ?? { name, count: 0 };
        map.set(id, { name, count: prev.count + (s.quantity || 1) });
      });

      return Array.from(map.entries())
        .map(([id, v]) => ({ id, name: v.name, count: v.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    },
  });

  /* ─── Ranking: Top 5 vendedores ───────────────────────── */
  const { data: topSellers, isLoading: topSellersLoading } = useQuery({
    queryKey: ['dashboard-top-sellers', activeCompanyId, period],
    enabled,
    queryFn: async (): Promise<RankItem[]> => {
      const { data } = await supabase
        .from('sales')
        .select('seller_id, quantity, sellers(name)')
        .eq('company_id', activeCompanyId!)
        .eq('status', 'pago')
        .gte('created_at', dateFrom);

      const map = new Map<string, { name: string; count: number }>();
      ((data ?? []) as SellerSalesRankRow[]).forEach((s) => {
        const id = s.seller_id ?? '__none__';
        const name = s.sellers?.name ?? 'Sem vendedor';
        const prev = map.get(id) ?? { name, count: 0 };
        map.set(id, { name, count: prev.count + (s.quantity || 1) });
      });

      return Array.from(map.entries())
        .map(([id, v]) => ({ id: id === '__none__' ? null : id, name: v.name, count: v.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    },
  });

  /* ═══════════════════════════════════════════════════
     Renderização
     ═══════════════════════════════════════════════════ */

  const totalStatusSales = (statusDist ?? []).reduce((s, d) => s + d.count, 0);

  return (
    <AdminLayout>
      <MobileDashboardHome
        cards={mobileHomeCards}
        bottomNavItems={mobileBottomNavItems}
        companyName={mobileCompanyName}
        canViewFinancials={canViewFinancials}
        canViewSalesRoute={canViewMobileRoute('/admin/vendas')}
        todaySummary={mobileTodaySummary}
        recentSales={mobileRecentSales}
        todaySummaryLoading={mobileTodaySummaryLoading}
        recentSalesLoading={mobileRecentSalesLoading}
        todaySummaryError={mobileTodaySummaryError}
        recentSalesError={mobileRecentSalesError}
      />
      <div className="hidden p-4 md:p-6 lg:block lg:space-y-6">
        {/* ── Header + Filtro ─────────────────────────── */}
        <PageHeader
          title="Painel"
          description="Visão geral da operação e vendas"
          actions={
            <div className="flex flex-wrap items-center justify-end gap-3">
              {/* UX improvement: added globe icon to the "Abrir vitrine pública" button
                  to make it clearer that this action opens the public storefront page. */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" className="gap-2" onClick={handleOpenPublicShowcase}>
                      <Globe className="h-4 w-4" />
                      Abrir vitrine pública
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Abrir a página pública da empresa com os eventos disponíveis para compra.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <Select value={String(period)} onValueChange={(v) => setPeriod(Number(v) as Period)}>
                {/* Comentário: estrutura interna explícita para alinhar o seletor de período ao padrão visual do header do dashboard. */}
                <SelectTrigger className="h-10 w-[190px] px-4 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Calendar className="h-4 w-4 shrink-0" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                  <SelectItem value="90">Últimos 90 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        />

        <Dialog open={onboardingPopupOpen} onOpenChange={setOnboardingPopupOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {nextOnboardingStep?.key === 'event'
                  ? 'Tudo pronto para criar seu primeiro evento?'
                  : 'Boas-vindas! Vamos iniciar sua operação com segurança?'}
              </DialogTitle>
              <DialogDescription>
                {nextOnboardingStep?.key === 'event'
                  ? 'Você já concluiu a base operacional. Agora vale criar seu primeiro evento para avançar para publicação e vendas.'
                  : 'Use o passo a passo do dashboard para configurar sua base operacional antes de publicar viagens e iniciar as vendas.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => {
                  // Supressão local simples: evita reaparição irritante após "Fazer depois",
                  // sem backend e sem criar preferências complexas.
                  if (nextOnboardingStep?.key === 'event') {
                    window.localStorage.setItem(onboardingEventCtaDismissKey, '1');
                  } else {
                    window.localStorage.setItem(onboardingWelcomeDismissKey, '1');
                  }
                  setOnboardingPopupOpen(false);
                }}
              >
                {nextOnboardingStep?.key === 'event' ? 'Fazer depois' : 'Explorar painel'}
              </Button>
              <Button
                onClick={() => {
                  setOnboardingPopupOpen(false);
                  if (nextOnboardingStep?.key === 'event') {
                    navigate('/admin/eventos?novo=1');
                    return;
                  }
                  if (nextOnboardingStep?.href) {
                    navigate(nextOnboardingStep.href);
                  }
                }}
              >
                {nextOnboardingStep?.key === 'event' ? 'Criar evento agora' : 'Ver passo a passo'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {canViewSmartbusTips && (
          <Dialog open={smartbusTipsOpen} onOpenChange={handleSmartbusTipsOpenChange}>
            <DialogContent className="max-lg:grid max-lg:h-[calc(100dvh-1rem)] max-lg:max-h-[calc(100dvh-1rem)] max-lg:w-[calc(100%-1rem)] max-lg:max-w-md max-lg:grid-rows-[auto_minmax(0,1fr)_auto] max-lg:gap-0 max-lg:overflow-hidden max-lg:rounded-2xl max-lg:p-0 max-lg:[&>button]:right-3 max-lg:[&>button]:top-[calc(0.75rem+env(safe-area-inset-top))] max-lg:[&>button]:flex max-lg:[&>button]:h-10 max-lg:[&>button]:w-10 max-lg:[&>button]:items-center max-lg:[&>button]:justify-center lg:max-h-[90vh] lg:max-w-5xl lg:overflow-y-auto">
              <DialogHeader className="hidden lg:flex">
                <DialogTitle>Explore mais possibilidades com o SmartBus</DialogTitle>
                <DialogDescription>
                  Além de passagens, você também pode vender passeios, serviços, pacotes e experiências.
                </DialogDescription>
              </DialogHeader>

              <DialogHeader className="border-b bg-background px-4 pb-3 pt-[calc(1rem+env(safe-area-inset-top))] pr-14 text-left lg:hidden">
                <DialogTitle className="text-base leading-tight">Explore o SmartBus</DialogTitle>
                <DialogDescription className="text-xs leading-snug">
                  Conheça outras formas de vender e organizar sua operação.
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 overflow-y-auto px-4 py-3 lg:overflow-visible lg:p-0">
                {/* Comentário: no mobile, o mesmo conteúdo vira carrossel para evitar uma coluna longa de cards desktop comprimidos. */}
                <Carousel setApi={setSmartbusTipsCarouselApi} opts={{ align: 'start' }} className="lg:hidden">
                  <CarouselContent className="-ml-3">
                    {smartbusTips.map((tip) => (
                      <CarouselItem key={tip.title} className="pl-3">
                        <Card className="overflow-hidden rounded-2xl border-border/70 shadow-[0_8px_22px_rgba(15,23,42,0.07)]">
                          <CardContent className="flex min-h-[19.5rem] flex-col gap-3 p-3.5">
                            <SmartbusTipImage src={tip.image} alt={tip.title} className="h-28 rounded-xl" />
                            <div className="space-y-1.5">
                              <h3 className="text-sm font-semibold leading-snug">{tip.title}</h3>
                              <p className="text-[0.82rem] leading-relaxed text-muted-foreground">{tip.description}</p>
                            </div>
                            <Button
                              className="mt-auto h-10 w-full"
                              variant={tip.href ? 'outline' : 'default'}
                              onClick={() => {
                                if (tip.href) {
                                  handleSmartbusTipsOpenChange(false);
                                  if ('openInNewTab' in tip && tip.openInNewTab) {
                                    window.open(tip.href, '_blank', 'noopener,noreferrer');
                                    return;
                                  }
                                  navigate(tip.href);
                                  return;
                                }
                                handleOpenPublicShowcaseFromSmartbusTips();
                              }}
                            >
                              {tip.buttonLabel}
                            </Button>
                          </CardContent>
                        </Card>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <div className="mt-3 flex flex-col items-center gap-1.5" aria-label="Conteúdos disponíveis">
                    <span className="text-[0.68rem] font-medium text-muted-foreground">
                      {smartbusTipsCarouselIndex + 1} de {smartbusTips.length}
                    </span>
                    <div className="flex max-w-full flex-wrap items-center justify-center gap-2">
                      {smartbusTips.map((tip, index) => (
                        <button
                          key={tip.title}
                          type="button"
                          className={cn(
                            'h-2 rounded-full transition-all',
                            smartbusTipsCarouselIndex === index ? 'w-6 bg-[hsl(var(--primary))]' : 'w-2 bg-muted-foreground/30'
                          )}
                          aria-label={`Ir para ${tip.title}`}
                          aria-current={smartbusTipsCarouselIndex === index ? 'true' : undefined}
                          onClick={() => smartbusTipsCarouselApi?.scrollTo(index)}
                        />
                      ))}
                    </div>
                  </div>
                </Carousel>

                <div className="hidden gap-4 lg:grid lg:grid-cols-3">
                  {smartbusTips.map((tip) => (
                    <Card key={tip.title} className="overflow-hidden">
                      <CardContent className="flex h-full flex-col gap-4 p-4">
                        <SmartbusTipImage src={tip.image} alt={tip.title} />
                        <div className="space-y-2">
                          <h3 className="text-sm font-semibold">{tip.title}</h3>
                          <p className="text-sm text-muted-foreground">{tip.description}</p>
                        </div>
                        <Button
                          className="mt-auto w-full"
                          variant={tip.href ? 'outline' : 'default'}
                          onClick={() => {
                            if (tip.href) {
                              handleSmartbusTipsOpenChange(false);
                              if ('openInNewTab' in tip && tip.openInNewTab) {
                                window.open(tip.href, '_blank', 'noopener,noreferrer');
                                return;
                              }
                              navigate(tip.href);
                              return;
                            }
                            handleOpenPublicShowcaseFromSmartbusTips();
                          }}
                        >
                          {tip.buttonLabel}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              <DialogFooter className="border-t bg-background px-4 pb-[calc(0.85rem+env(safe-area-inset-bottom))] pt-3 lg:hidden">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={doNotShowSmartbusTips}
                    onCheckedChange={(checked) => setDoNotShowSmartbusTips(checked === true)}
                  />
                  Não mostrar novamente
                </label>
              </DialogFooter>

              <DialogFooter className="hidden items-center justify-between gap-3 sm:justify-between lg:flex">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={doNotShowSmartbusTips}
                    onCheckedChange={(checked) => setDoNotShowSmartbusTips(checked === true)}
                  />
                  Não mostrar novamente
                </label>
                <Button variant="outline" onClick={() => handleSmartbusTipsOpenChange(false)}>
                  Fechar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {shouldShowOnboardingCard && (
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base font-semibold">🚀 Comece por aqui</CardTitle>
                <span className="text-sm text-muted-foreground">
                  {onboardingCompletedCount} de {onboardingItems.length} concluídos
                </span>
              </div>
              <p className={`text-sm ${onboardingStage === 'active' ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                {onboardingStageContent.title}
              </p>
              <p className="text-xs text-muted-foreground">{onboardingStageContent.description}</p>
              {!nextOnboardingStep && (onboardingLoading || onboardingHeavyLoading) ? (
                <p className="text-xs text-muted-foreground">Calculando próximo passo recomendado...</p>
              ) : nextOnboardingStep ? (
                <p className="text-xs text-muted-foreground">
                  Próximo passo recomendado: <span className="font-medium text-foreground">{nextOnboardingStep.label}</span>
                </p>
              ) : onboardingStage === 'active' ? (
                <p className="text-xs text-emerald-700">Nenhum passo obrigatório pendente.</p>
              ) : null}
              {!onboardingLoading && !onboardingHeavyLoading && (
                <Button
                  asChild
                  size="sm"
                  className="w-fit"
                  variant={onboardingStage === 'active' ? 'outline' : 'default'}
                >
                  <Link to={nextOnboardingStep?.href ?? '/admin/vendas'}>
                    {nextOnboardingStep ? onboardingStageContent.ctaLabel ?? nextOnboardingStep.label : 'Ver vendas'}
                  </Link>
                </Button>
              )}
              <Progress value={(onboardingCompletedCount / onboardingItems.length) * 100} className="h-2" />
            </CardHeader>
            <CardContent className="space-y-2">
              {onboardingItems.map((item) => (
                item.isLoading ? (
                  <div key={item.key} className="rounded-lg border px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Circle className="h-4 w-4 text-muted-foreground" />
                        <Skeleton className="h-4 w-40" />
                      </div>
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ) : (
                  <Button
                    key={item.key}
                    asChild
                    variant="ghost"
                    className="h-auto w-full justify-between rounded-lg border px-3 py-3"
                  >
                    <Link to={item.href}>
                      <span className="flex items-start gap-2 text-sm">
                        {item.done ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        ) : (
                          <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="flex flex-col items-start gap-0.5">
                          <span>{item.label}</span>
                          <span className="text-xs font-normal text-muted-foreground">{item.description}</span>
                        </span>
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        {item.done ? 'Ver' : 'Ir agora'}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </Link>
                  </Button>
                )
              ))}
            </CardContent>
          </Card>
        )}

        {/* Comentário: seção compacta para centralizar os atalhos operacionais mais usados no dia a dia. */}
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Ações rápidas</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="lg" className="gap-2">
              {/* Comentário: deep-link abre a tela de vendas e dispara o modal de Nova Venda já na aba manual. */}
              <Link to="/admin/vendas?novaVenda=1&aba=manual">
                <Ticket className="h-4 w-4" />
                Vender Passagem
              </Link>
            </Button>

            <Button asChild variant="outline" size="lg" className="gap-2">
              {/* Comentário: reaproveita o fluxo padrão já existente de criação de evento via querystring. */}
              <Link to="/admin/eventos?novo=1">
                <Calendar className="h-4 w-4" />
                + Novo Evento
              </Link>
            </Button>

            {canAccessDriverValidatorShortcut && (
              <Button asChild variant="outline" size="lg" className="gap-2">
                {/* Comentário: gerente acessa o validador sem cadastro duplicado de motorista; a auditoria fica no usuário autenticado. */}
                <Link to="/validador">
                  <QrCode className="h-4 w-4" />
                  Validador de Passagens
                </Link>
              </Button>
            )}
          </div>
        </section>

        {canViewSmartbusTips && (
          <Card className="border-primary/15 bg-orange-50/60">
            <CardContent className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold leading-tight">Você sabia?</h2>
                  <p className="text-xs text-muted-foreground">
                    Venda passeios, serviços, pacotes, experiências e tipos diferentes de passagem.
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="shrink-0" onClick={handleOpenSmartbusTipsFromCard}>
                Ver possibilidades
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── KPIs Operacionais ───────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {opLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))
          ) : (
            <>
              <StatsCard label="Eventos à venda" value={opKpis?.eventsOnSale ?? 0} icon={Calendar} />
              <StatsCard label={`Próximos ${period} dias`} value={opKpis?.upcomingEvents ?? 0} icon={Calendar} variant="success" />
              <StatsCard label={`Vendas pagas`} value={opKpis?.paidSales ?? 0} icon={ShoppingCart} variant="success" />
              <StatsCard label={`Canceladas`} value={opKpis?.cancelledSales ?? 0} icon={XCircle} variant="destructive" />
              <StatsCard label="Ocupação média" value={formatPercent(opKpis?.occupancyPercent ?? null)} icon={TrendingUp} />
            </>
          )}
        </div>

        {/* ── KPIs Financeiros (SOMENTE Gerente/Developer) ── */}
        {/* Segurança: bloco nunca renderiza para Operador; query nunca executa (enabled=false) */}
        {canViewFinancials && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {finLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))
            ) : (
              <>
                <StatsCard label="Receita Bruta" value={formatCurrencyBRL(finKpis?.grossRevenue ?? 0)} icon={DollarSign} variant="success" />
                <StatsCard label="Custo Plataforma" value={formatCurrencyBRL(finKpis?.platformFee ?? 0)} icon={Percent} variant="warning" />
                <StatsCard label="Comissão Vendedores" value={formatCurrencyBRL(finKpis?.sellersCommission ?? 0)} icon={Users} />
              </>
            )}
          </div>
        )}

        {/* ── Gráficos (2 colunas) ───────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Vendas por dia */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Vendas pagas por dia</CardTitle>
            </CardHeader>
            <CardContent>
              {dailyLoading ? (
                <Skeleton className="h-[220px] w-full rounded-lg" />
              ) : (dailySales?.length ?? 0) === 0 ? (
                <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
                  Nenhuma venda no período
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={dailySales}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                      interval={period <= 7 ? 0 : 'preserveStartEnd'}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="fill-muted-foreground" width={30} />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(value: number) => [value, 'Passagens']}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke={CHART_LINE_COLOR}
                      strokeWidth={2}
                      dot={period <= 7}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Distribuição por status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Distribuição por status</CardTitle>
            </CardHeader>
            <CardContent>
              {statusLoading ? (
                <Skeleton className="h-[220px] w-full rounded-lg" />
              ) : totalStatusSales === 0 ? (
                <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
                  Nenhuma venda no período
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="55%" height={220}>
                    <PieChart>
                      <Pie
                        data={statusDist}
                        dataKey="count"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                      >
                        {(statusDist ?? []).map((entry) => (
                          <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? 'hsl(var(--muted))'} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-col gap-2 text-sm">
                    {(statusDist ?? []).map((d) => (
                      <div key={d.status} className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: STATUS_COLORS[d.status] }}
                        />
                        <span className="text-muted-foreground">{d.label}</span>
                        <span className="font-semibold text-foreground">{d.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Rankings (2 colunas) ────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top 5 Eventos */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Award className="h-4 w-4 text-primary" />
                Top 5 Eventos
              </CardTitle>
              <Button variant="link" size="sm" asChild className="text-xs px-0">
                <Link to="/admin/relatorios/vendas">Ver detalhes</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {topEventsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full rounded" />
                  ))}
                </div>
              ) : (topEvents?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Nenhum evento com vendas no período</p>
              ) : (
                <div className="space-y-2">
                  {topEvents!.map((ev, i) => (
                    <div key={ev.id ?? i} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-muted-foreground w-5 text-right">{i + 1}.</span>
                      <span className="flex-1 text-sm truncate">{ev.name}</span>
                      <span className="text-sm font-semibold tabular-nums">{ev.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top 5 Vendedores */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Top 5 Vendedores
              </CardTitle>
              <Button variant="link" size="sm" asChild className="text-xs px-0">
                <Link to="/admin/relatorios/comissao-vendedores">Ver detalhes</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {topSellersLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full rounded" />
                  ))}
                </div>
              ) : (topSellers?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma venda no período</p>
              ) : (
                <div className="space-y-2">
                  {topSellers!.map((sel, i) => (
                    <div key={sel.id ?? `none-${i}`} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-muted-foreground w-5 text-right">{i + 1}.</span>
                      <span className={`flex-1 text-sm truncate ${!sel.id ? 'italic text-muted-foreground' : ''}`}>
                        {sel.name}
                      </span>
                      <span className="text-sm font-semibold tabular-nums">{sel.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
