import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sale, SaleLog, SaleStatus } from '@/types/database';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/admin/PageHeader';
import { FilterCard } from '@/components/admin/FilterCard';
import { ActionsDropdown, ActionItem } from '@/components/admin/ActionsDropdown';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  Eye,
  Loader2,
  Search,
  Calendar,
  Building2,
  CreditCard,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Ticket,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatCurrencyBRL } from '@/lib/currency';
import { useAuth } from '@/contexts/AuthContext';

// ── Types ──
interface DiagnosticFilters {
  search: string;
  status: 'all' | SaleStatus;
  eventId: string;
  gateway: string;
  paymentStatus: string;
  dateFrom: string;
  dateTo: string;
}

const initialFilters: DiagnosticFilters = {
  search: '',
  status: 'all',
  eventId: 'all',
  gateway: 'all',
  paymentStatus: 'all',
  dateFrom: '',
  dateTo: '',
};

interface DiagnosticSale extends Sale {
  company_name?: string;
  event_name?: string;
  event_date?: string;
  ticket_count?: number;
}

// ── Flow stage computation ──
function computeGateway(sale: DiagnosticSale): string {
  if (sale.asaas_payment_id) return 'Asaas';
  if (sale.stripe_checkout_session_id || sale.stripe_payment_intent_id) return 'Stripe';
  if ((sale as any).sale_origin === 'admin_manual' || (sale as any).sale_origin === 'seller_manual') return 'Manual';
  return 'Manual';
}

function computePaymentStatus(sale: DiagnosticSale): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  if (sale.status === 'cancelado') return { label: 'Cancelado', variant: 'destructive' };
  if (sale.status === 'pago') return { label: 'Pago', variant: 'default' };

  const asaasStatus = sale.asaas_payment_status;
  if (asaasStatus === 'RECEIVED' || asaasStatus === 'CONFIRMED') return { label: 'Pago', variant: 'default' };
  if (asaasStatus === 'OVERDUE') return { label: 'Expirado', variant: 'destructive' };
  if (asaasStatus === 'REFUNDED' || asaasStatus === 'REFUND_REQUESTED') return { label: 'Estornado', variant: 'destructive' };
  if (asaasStatus === 'PENDING') return { label: 'Aguardando pagamento', variant: 'secondary' };

  if (sale.status === 'reservado') return { label: 'Aguardando pagamento', variant: 'secondary' };
  return { label: 'Desconhecido', variant: 'outline' };
}

function computeFlowStage(sale: DiagnosticSale): { label: string; icon: typeof CheckCircle; color: string } {
  const gateway = computeGateway(sale);

  if (sale.status === 'cancelado') {
    return { label: 'Cancelado', icon: XCircle, color: 'text-destructive' };
  }

  if (gateway === 'Manual') {
    if (sale.status === 'pago' && (sale.ticket_count ?? 0) > 0) {
      return { label: 'Passagem gerada', icon: Ticket, color: 'text-emerald-600' };
    }
    if (sale.status === 'pago') {
      return { label: 'Venda manual paga', icon: CheckCircle, color: 'text-emerald-600' };
    }
    return { label: 'Venda manual criada', icon: Clock, color: 'text-amber-600' };
  }

  // Online flow
  if (sale.status === 'pago' && (sale.ticket_count ?? 0) > 0) {
    return { label: 'Passagem gerada', icon: Ticket, color: 'text-emerald-600' };
  }
  if (sale.status === 'pago') {
    return { label: 'Pagamento confirmado', icon: CheckCircle, color: 'text-emerald-600' };
  }
  if (sale.asaas_payment_id || sale.stripe_checkout_session_id) {
    const asaasStatus = sale.asaas_payment_status;
    if (asaasStatus === 'OVERDUE') return { label: 'Cobrança expirada', icon: AlertTriangle, color: 'text-destructive' };
    return { label: 'Cobrança enviada ao gateway', icon: CreditCard, color: 'text-blue-600' };
  }

  return { label: 'Venda criada', icon: Clock, color: 'text-muted-foreground' };
}

function computeReturnMessage(sale: DiagnosticSale): string {
  if (sale.status === 'cancelado') {
    return sale.cancel_reason ? `Cancelado: ${sale.cancel_reason}` : 'Venda cancelada';
  }

  const gateway = computeGateway(sale);
  if (gateway === 'Manual') return 'Venda manual — sem gateway';

  if (sale.asaas_payment_id) {
    const statusMap: Record<string, string> = {
      PENDING: 'Cobrança criada com sucesso',
      RECEIVED: 'Pagamento recebido',
      CONFIRMED: 'Pagamento confirmado',
      OVERDUE: 'Cobrança vencida',
      REFUNDED: 'Pagamento estornado',
      REFUND_REQUESTED: 'Estorno solicitado',
    };
    return statusMap[sale.asaas_payment_status ?? ''] ?? sale.asaas_payment_status ?? 'Sem retorno';
  }

  if (sale.stripe_payment_intent_id) return 'Stripe — pagamento processado';
  if (sale.stripe_checkout_session_id) return 'Stripe — checkout criado';

  return '-';
}

// ── Timeline builder ──
interface TimelineEntry {
  time: string;
  label: string;
  icon: typeof CheckCircle;
  color: string;
}

function buildTimeline(sale: DiagnosticSale, logs: SaleLog[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  // 1. Sale created
  entries.push({
    time: format(parseISO(sale.created_at), 'HH:mm:ss', { locale: ptBR }),
    label: 'Venda criada',
    icon: Clock,
    color: 'text-muted-foreground',
  });

  // 2. Gateway charge sent
  const gateway = computeGateway(sale);
  if (gateway !== 'Manual' && (sale.asaas_payment_id || sale.stripe_checkout_session_id)) {
    entries.push({
      time: format(parseISO(sale.created_at), 'HH:mm:ss', { locale: ptBR }),
      label: `Cobrança enviada ao ${gateway}`,
      icon: CreditCard,
      color: 'text-blue-600',
    });
  }

  // 3. Logs
  logs
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .forEach((log) => {
      entries.push({
        time: format(parseISO(log.created_at), 'HH:mm:ss', { locale: ptBR }),
        label: log.description,
        icon: log.action === 'cancel' ? XCircle : Activity,
        color: log.action === 'cancel' ? 'text-destructive' : 'text-muted-foreground',
      });
    });

  // 4. Payment confirmed
  if (sale.status === 'pago') {
    entries.push({
      time: format(parseISO(sale.updated_at), 'HH:mm:ss', { locale: ptBR }),
      label: 'Venda atualizada para pago',
      icon: CheckCircle,
      color: 'text-emerald-600',
    });
  }

  // 5. Tickets generated
  if ((sale.ticket_count ?? 0) > 0) {
    entries.push({
      time: format(parseISO(sale.updated_at), 'HH:mm:ss', { locale: ptBR }),
      label: `${sale.ticket_count} passagem(ns) gerada(s)`,
      icon: Ticket,
      color: 'text-emerald-600',
    });
  }

  // 6. Cancelled
  if (sale.status === 'cancelado' && sale.cancelled_at) {
    entries.push({
      time: format(parseISO(sale.cancelled_at), 'HH:mm:ss', { locale: ptBR }),
      label: sale.cancel_reason ? `Cancelado: ${sale.cancel_reason}` : 'Venda cancelada',
      icon: XCircle,
      color: 'text-destructive',
    });
  }

  return entries;
}

// ── Component ──
export default function SalesDiagnostic() {
  const { isDeveloper, activeCompanyId } = useAuth();
  const [sales, setSales] = useState<DiagnosticSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<DiagnosticFilters>(initialFilters);
  const [events, setEvents] = useState<{ id: string; name: string; date: string }[]>([]);

  // Detail modal
  const [detailSale, setDetailSale] = useState<DiagnosticSale | null>(null);
  const [detailLogs, setDetailLogs] = useState<SaleLog[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const hasActiveFilters = useMemo(() => (
    filters.search !== '' ||
    filters.status !== 'all' ||
    filters.eventId !== 'all' ||
    filters.gateway !== 'all' ||
    filters.paymentStatus !== 'all' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== ''
  ), [filters]);

  const fetchSales = async () => {
    setLoading(true);

    let query = supabase
      .from('sales')
      .select(`
        *,
        event:events(name, date),
        company:companies(name)
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    // Developer: cross-company. Others: filter by active company.
    if (!isDeveloper && activeCompanyId) {
      query = query.eq('company_id', activeCompanyId);
    }

    if (filters.search.trim()) {
      const s = filters.search.trim();
      // Search by name, CPF, sale ID, or event name
      query = query.or(`customer_name.ilike.%${s}%,customer_cpf.ilike.%${s}%,id.ilike.%${s}%`);
    }

    if (filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters.eventId !== 'all') {
      query = query.eq('event_id', filters.eventId);
    }

    if (filters.dateFrom) {
      query = query.gte('created_at', new Date(filters.dateFrom).toISOString());
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      query = query.lte('created_at', toDate.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      toast.error('Erro ao carregar vendas para diagnóstico');
      setLoading(false);
      return;
    }

    const rawSales = (data ?? []) as any[];

    // Fetch ticket counts for these sales
    const saleIds = rawSales.map((s) => s.id);
    let ticketCounts: Record<string, number> = {};
    if (saleIds.length > 0) {
      const { data: tickets } = await supabase
        .from('tickets')
        .select('sale_id')
        .in('sale_id', saleIds);

      (tickets ?? []).forEach((t: any) => {
        ticketCounts[t.sale_id] = (ticketCounts[t.sale_id] ?? 0) + 1;
      });
    }

    const mapped: DiagnosticSale[] = rawSales.map((s) => ({
      ...s,
      company_name: s.company?.name ?? '-',
      event_name: s.event?.name ?? '-',
      event_date: s.event?.date ?? null,
      ticket_count: ticketCounts[s.id] ?? 0,
    }));

    // Client-side filters for gateway and payment status
    let filtered = mapped;

    if (filters.gateway !== 'all') {
      filtered = filtered.filter((s) => {
        const g = computeGateway(s);
        return g.toLowerCase() === filters.gateway.toLowerCase();
      });
    }

    if (filters.paymentStatus !== 'all') {
      filtered = filtered.filter((s) => {
        const ps = computePaymentStatus(s);
        if (filters.paymentStatus === 'aguardando') return ps.label === 'Aguardando pagamento';
        if (filters.paymentStatus === 'pago') return ps.label === 'Pago';
        if (filters.paymentStatus === 'falhou') return ps.label === 'Expirado' || ps.label === 'Estornado';
        return true;
      });
    }

    setSales(filtered);
    setLoading(false);
  };

  const fetchEvents = async () => {
    let query = supabase
      .from('events')
      .select('id, name, date')
      .order('date', { ascending: false })
      .limit(50);

    if (!isDeveloper && activeCompanyId) {
      query = query.eq('company_id', activeCompanyId);
    }

    const { data } = await query;
    setEvents((data ?? []) as { id: string; name: string; date: string }[]);
  };

  const openDetail = async (sale: DiagnosticSale) => {
    setDetailSale(sale);
    setDetailLoading(true);
    setDetailLogs([]);

    const { data: logs } = await supabase
      .from('sale_logs')
      .select('*')
      .eq('sale_id', sale.id)
      .order('created_at', { ascending: true });

    setDetailLogs((logs ?? []) as SaleLog[]);
    setDetailLoading(false);
  };

  useEffect(() => { fetchSales(); }, [activeCompanyId, isDeveloper, filters]);
  useEffect(() => { fetchEvents(); }, [activeCompanyId, isDeveloper]);

  const filterSelects = [
    {
      id: 'status',
      label: 'Status da Venda',
      placeholder: 'Todos',
      value: filters.status,
      onChange: (v: string) => setFilters((f) => ({ ...f, status: v as any })),
      options: [
        { value: 'all', label: 'Todos' },
        { value: 'reservado', label: 'Reservado' },
        { value: 'pago', label: 'Pago' },
        { value: 'cancelado', label: 'Cancelado' },
      ],
    },
    {
      id: 'gateway',
      label: 'Gateway',
      placeholder: 'Todos',
      value: filters.gateway,
      onChange: (v: string) => setFilters((f) => ({ ...f, gateway: v })),
      icon: CreditCard,
      options: [
        { value: 'all', label: 'Todos' },
        { value: 'asaas', label: 'Asaas' },
        { value: 'stripe', label: 'Stripe' },
        { value: 'manual', label: 'Manual' },
      ],
    },
    {
      id: 'paymentStatus',
      label: 'Status Pagamento',
      placeholder: 'Todos',
      value: filters.paymentStatus,
      onChange: (v: string) => setFilters((f) => ({ ...f, paymentStatus: v })),
      options: [
        { value: 'all', label: 'Todos' },
        { value: 'aguardando', label: 'Aguardando' },
        { value: 'pago', label: 'Pago' },
        { value: 'falhou', label: 'Falhou/Expirado' },
      ],
    },
  ];

  const mainFilters = (
    <>
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Calendar className="h-4 w-4" />
          Evento
        </label>
        <Select value={filters.eventId} onValueChange={(v) => setFilters((f) => ({ ...f, eventId: v }))}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Todos os eventos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os eventos</SelectItem>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.date ? format(parseISO(e.date), 'dd/MM/yy', { locale: ptBR }) + ' - ' : ''}{e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Calendar className="h-4 w-4" />
          Data inicial
        </label>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Calendar className="h-4 w-4" />
          Data final
        </label>
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>
    </>
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <PageHeader
          title="Diagnóstico de Vendas"
          description="Ferramenta para análise de vendas, pagamentos e retorno das integrações do sistema."
        />

        <FilterCard
          searchValue={filters.search}
          onSearchChange={(v) => setFilters((f) => ({ ...f, search: v }))}
          searchPlaceholder="Nome, CPF, ID da venda ou evento..."
          searchIcon={Search}
          selects={filterSelects}
          mainFilters={mainFilters}
          onClearFilters={() => setFilters(initialFilters)}
          hasActiveFilters={hasActiveFilters}
        />

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : sales.length === 0 ? (
          <EmptyState
            icon={<Activity className="h-8 w-8 text-muted-foreground" />}
            title="Nenhuma venda encontrada"
            description="Ajuste os filtros para buscar vendas."
          />
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  {isDeveloper && <TableHead>Empresa</TableHead>}
                  <TableHead>Evento</TableHead>
                  <TableHead>Comprador</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Gateway</TableHead>
                  <TableHead>Status Venda</TableHead>
                  <TableHead>Status Pgto</TableHead>
                  <TableHead>Etapa do Fluxo</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((sale) => {
                  const gateway = computeGateway(sale);
                  const paymentStatus = computePaymentStatus(sale);
                  const flowStage = computeFlowStage(sale);
                  const FlowIcon = flowStage.icon;
                  const returnMsg = computeReturnMessage(sale);

                  const actions: ActionItem[] = [
                    {
                      label: 'Ver detalhes da venda',
                      icon: Eye,
                      onClick: () => openDetail(sale),
                    },
                  ];

                  return (
                    <TableRow key={sale.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {format(parseISO(sale.created_at), 'dd/MM/yy HH:mm', { locale: ptBR })}
                      </TableCell>
                      {isDeveloper && (
                        <TableCell className="text-sm max-w-[120px] truncate">
                          {sale.company_name}
                        </TableCell>
                      )}
                      <TableCell className="text-sm max-w-[140px] truncate">
                        {sale.event_name}
                      </TableCell>
                      <TableCell className="text-sm max-w-[140px] truncate">
                        {sale.customer_name}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatCurrencyBRL(sale.gross_amount ?? sale.quantity * sale.unit_price)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {gateway}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={sale.status} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={paymentStatus.variant} className="text-xs whitespace-nowrap">
                          {paymentStatus.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`flex items-center gap-1.5 text-xs whitespace-nowrap ${flowStage.color}`}>
                          <FlowIcon className="h-3.5 w-3.5" />
                          {flowStage.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                        {returnMsg}
                      </TableCell>
                      <TableCell>
                        <ActionsDropdown actions={actions} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Detail Modal */}
        <Dialog open={!!detailSale} onOpenChange={(open) => !open && setDetailSale(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Diagnóstico da Venda
              </DialogTitle>
            </DialogHeader>

            {detailSale && (
              <ScrollArea className="flex-1 pr-4">
                <div className="space-y-6 pb-4">
                  {/* Block 1 — Sale Data */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Dados da Venda
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">ID da venda</span>
                        <p className="font-mono text-xs break-all">{detailSale.id}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Empresa</span>
                        <p>{detailSale.company_name}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Evento</span>
                        <p>{detailSale.event_name}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Comprador</span>
                        <p>{detailSale.customer_name}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">CPF</span>
                        <p>{detailSale.customer_cpf}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Quantidade</span>
                        <p>{detailSale.quantity} passagem(ns)</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Valor total</span>
                        <p className="font-semibold">
                          {formatCurrencyBRL(detailSale.gross_amount ?? detailSale.quantity * detailSale.unit_price)}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Data da compra</span>
                        <p>{format(parseISO(detailSale.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}</p>
                      </div>
                    </div>
                  </div>

                  {/* Block 2 — Payment */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Pagamento
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Gateway</span>
                        <p>{computeGateway(detailSale)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Status do pagamento</span>
                        <Badge variant={computePaymentStatus(detailSale).variant} className="text-xs mt-1">
                          {computePaymentStatus(detailSale).label}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-muted-foreground">ID da cobrança</span>
                        <p className="font-mono text-xs break-all">
                          {detailSale.asaas_payment_id || detailSale.stripe_payment_intent_id || detailSale.stripe_checkout_session_id || '-'}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Origem</span>
                        <p>{(detailSale as any).sale_origin ?? '-'}</p>
                      </div>
                      {detailSale.platform_fee_total != null && (
                        <div>
                          <span className="text-muted-foreground">Taxa plataforma</span>
                          <p>{formatCurrencyBRL(detailSale.platform_fee_total)}</p>
                        </div>
                      )}
                      {detailSale.partner_fee_amount != null && (
                        <div>
                          <span className="text-muted-foreground">Comissão sócio</span>
                          <p>{formatCurrencyBRL(detailSale.partner_fee_amount)}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Block 3 — Integration */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Integração
                    </h3>
                    <div className="grid grid-cols-1 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Retorno resumido</span>
                        <p>{computeReturnMessage(detailSale)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Etapa atual</span>
                        <span className={`flex items-center gap-1.5 mt-1 ${computeFlowStage(detailSale).color}`}>
                          {(() => { const F = computeFlowStage(detailSale).icon; return <F className="h-4 w-4" />; })()}
                          {computeFlowStage(detailSale).label}
                        </span>
                      </div>
                      {detailSale.asaas_payment_status && (
                        <div>
                          <span className="text-muted-foreground">Status Asaas bruto</span>
                          <p className="font-mono text-xs">{detailSale.asaas_payment_status}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">
                      Linha do tempo
                    </h3>

                    {detailLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Carregando histórico...
                      </div>
                    ) : (
                      <div className="space-y-0">
                        {buildTimeline(detailSale, detailLogs).map((entry, i) => {
                          const EntryIcon = entry.icon;
                          return (
                            <div key={i} className="flex items-start gap-3 py-2">
                              <div className="flex flex-col items-center">
                                <EntryIcon className={`h-4 w-4 ${entry.color}`} />
                                {i < buildTimeline(detailSale, detailLogs).length - 1 && (
                                  <div className="w-px h-full min-h-[16px] bg-border mt-1" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm">{entry.label}</p>
                                <p className="text-xs text-muted-foreground">{entry.time}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
