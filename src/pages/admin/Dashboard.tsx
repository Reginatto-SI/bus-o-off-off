import { useState, useMemo } from 'react';
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

/* ═══════════════════════════════════════════════════
   Constantes de cores para gráficos (semânticas)
   ═══════════════════════════════════════════════════ */
const STATUS_COLORS: Record<string, string> = {
  pago: 'hsl(var(--success))',
  reservado: 'hsl(var(--warning))',
  cancelado: 'hsl(var(--destructive))',
};
const STATUS_LABELS: Record<string, string> = {
  pago: 'Pago',
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
      const statuses = ['reservado', 'pago', 'cancelado'] as const;
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
                {/* Comentário: aumenta a largura mínima do filtro para evitar quebra entre ícone e rótulo em resoluções menores. */}
                <SelectTrigger className="w-[190px]">
                  {/* UX improvement: added calendar icon to the date filter
                      to improve visual recognition of the period selector. */}
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <Calendar className="h-4 w-4" />
                    <SelectValue />
                  </span>
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
