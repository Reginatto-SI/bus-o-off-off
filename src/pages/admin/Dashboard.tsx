import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { subDays, format, startOfDay, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
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
  Circle,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
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
import { PageHeader } from '@/components/admin/PageHeader';
import { StatsCard } from '@/components/admin/StatsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrencyBRL } from '@/lib/currency';
import { normalizePublicSlug } from '@/lib/publicSlug';
import { toast } from 'sonner';

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
  pendente_pagamento: 'hsl(var(--warning))',
  reservado: 'hsl(var(--warning))',
  cancelado: 'hsl(var(--destructive))',
};
const STATUS_LABELS: Record<string, string> = {
  pago: 'Pago',
  pendente_pagamento: 'Pendente pagamento',
  reservado: 'Reservado',
  cancelado: 'Cancelado',
};

const CHART_LINE_COLOR = 'hsl(var(--primary))';

/* ═══════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════ */

function formatPercent(value: number | null) {
  if (value === null) return '—';
  return `${value.toFixed(1)}%`;
}

/* ═══════════════════════════════════════════════════
   Componente principal
   ═══════════════════════════════════════════════════ */

export default function Dashboard() {
  const { activeCompanyId, activeCompany, canViewFinancials } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>(30);
  const [onboardingPopupOpen, setOnboardingPopupOpen] = useState(false);
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
        p_status: 'pago' as any,
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
      (data ?? []).forEach((s: any) => {
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
      (data ?? []).forEach((s: any) => {
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
      <div className="p-4 md:p-6 space-y-6">
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
          </div>
        </section>

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
