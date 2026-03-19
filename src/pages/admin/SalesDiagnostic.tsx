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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
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
import { Card, CardContent } from '@/components/ui/card';
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
  ChevronDown,
  Webhook,
  Code,
  FileJson,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatCurrencyBRL } from '@/lib/currency';
import { useAuth } from '@/contexts/AuthContext';
import { StatsCard } from '@/components/admin/StatsCard';

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
  company_id: string;
  company_name?: string;
  event_name?: string;
  event_date?: string;
  ticket_count?: number;
  active_lock_count?: number;
  latest_lock_expires_at?: string | null;
}

type OperationalCategory = 'saudavel' | 'atencao' | 'problema' | 'pago' | 'cancelado';

interface DiagnosticOperationalView {
  category: OperationalCategory;
  categoryLabel: string;
  categoryVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  categoryClassName?: string;
  priority: number;
  createdAgoLabel: string;
  expirationLabel: string | null;
  lockLabel: string;
  lockVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  hasGatewayDivergence: boolean;
}

interface SaleIntegrationLog {
  id: string;
  sale_id: string | null;
  company_id: string | null;
  provider: string;
  direction: string;
  event_type: string | null;
  payment_id: string | null;
  external_reference: string | null;
  http_status: number | null;
  processing_status: 'received' | 'ignored' | 'success' | 'partial_failure' | 'failed' | 'unauthorized' | 'warning' | 'rejected' | 'duplicate';
  message: string;
  payload_json: Record<string, unknown> | null;
  response_json: Record<string, unknown> | null;
  payment_environment: 'sandbox' | 'production' | null;
  environment_decision_source: 'sale' | 'request' | 'host' | null;
  environment_host_detected: string | null;
  created_at: string;
}

function formatPaymentEnvironmentLabel(value?: string | null): string {
  return value === 'production' ? 'Produção' : 'Sandbox';
}

function formatElapsedMinutesLabel(createdAt: string): string {
  const elapsedMs = Date.now() - new Date(createdAt).getTime();
  const elapsedMinutes = Math.max(Math.floor(elapsedMs / 60000), 0);
  if (elapsedMinutes < 1) return 'Criado há menos de 1 min';
  return `Criado há ${elapsedMinutes} min`;
}

function computeOperationalView(sale: DiagnosticSale): DiagnosticOperationalView {
  const createdAgoLabel = formatElapsedMinutesLabel(sale.created_at);
  const pendingStatuses: SaleStatus[] = ['pendente_pagamento', 'reservado'];
  const isPending = pendingStatuses.includes(sale.status);
  const lockExpiresAt = sale.latest_lock_expires_at ? new Date(sale.latest_lock_expires_at).getTime() : null;
  const hasActiveLock = (sale.active_lock_count ?? 0) > 0 && lockExpiresAt !== null && lockExpiresAt > Date.now();
  const hasExpiredLock = (sale.active_lock_count ?? 0) <= 0 && lockExpiresAt !== null && lockExpiresAt <= Date.now();
  const hasMissingLock = (sale.active_lock_count ?? 0) <= 0;
  const hasPartialLock = (sale.active_lock_count ?? 0) > 0 && (sale.active_lock_count ?? 0) < Math.max(sale.quantity, 1);

  const asaasPaid = sale.asaas_payment_status === 'RECEIVED' || sale.asaas_payment_status === 'CONFIRMED';
  const hasGatewayDivergence = (isPending && asaasPaid) || (sale.status === 'cancelado' && asaasPaid);

  let lockLabel = '⚠️ Lock ausente';
  let lockVariant: DiagnosticOperationalView['lockVariant'] = 'destructive';
  if (hasActiveLock) {
    lockLabel = '✔️ Lock ativo';
    lockVariant = 'default';
  } else if (hasExpiredLock) {
    lockLabel = '❌ Lock expirado';
    lockVariant = 'destructive';
  }

  if (sale.status === 'pago') {
    return {
      category: 'pago',
      categoryLabel: '🔵 Pago',
      categoryVariant: 'default',
      priority: 4,
      createdAgoLabel,
      expirationLabel: null,
      lockLabel,
      lockVariant,
      hasGatewayDivergence,
    };
  }

  if (sale.status === 'cancelado') {
    return {
      category: 'cancelado',
      categoryLabel: '⚫ Cancelado',
      categoryVariant: 'outline',
      categoryClassName: 'border-zinc-400 text-zinc-700',
      priority: 5,
      createdAgoLabel,
      expirationLabel: null,
      lockLabel,
      lockVariant,
      hasGatewayDivergence,
    };
  }

  if (!isPending) {
    return {
      category: 'atencao',
      categoryLabel: '🟡 Atenção',
      categoryVariant: 'secondary',
      priority: 3,
      createdAgoLabel,
      expirationLabel: null,
      lockLabel,
      lockVariant,
      hasGatewayDivergence,
    };
  }

  // Regra operacional Step 3:
  // - até 10min com lock ativo: saudável
  // - entre 10 e 15min, ou lock parcial: atenção
  // - >15min, lock ausente/expirado ou divergência gateway: problema
  const elapsedMinutes = Math.max(Math.floor((Date.now() - new Date(sale.created_at).getTime()) / 60000), 0);
  const remaining = 15 - elapsedMinutes;
  const expirationLabel = remaining >= 0 ? `Expira em ${remaining} min` : `Expirado há ${Math.abs(remaining)} min`;

  const isProblem = elapsedMinutes > 15 || hasMissingLock || hasExpiredLock || hasGatewayDivergence;
  if (isProblem) {
    return {
      category: 'problema',
      categoryLabel: '🔴 Problema',
      categoryVariant: 'destructive',
      priority: 1,
      createdAgoLabel,
      expirationLabel,
      lockLabel,
      lockVariant,
      hasGatewayDivergence,
    };
  }

  const isAttention = elapsedMinutes > 10 || hasPartialLock;
  if (isAttention) {
    return {
      category: 'atencao',
      categoryLabel: '🟡 Atenção',
      categoryVariant: 'secondary',
      priority: 2,
      createdAgoLabel,
      expirationLabel,
      lockLabel,
      lockVariant,
      hasGatewayDivergence,
    };
  }

  return {
    category: 'saudavel',
    categoryLabel: '🟢 Saudável',
    categoryVariant: 'default',
    priority: 3,
    createdAgoLabel,
    expirationLabel,
    lockLabel,
    lockVariant,
    hasGatewayDivergence,
  };
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

  // O checkout público cria venda em `pendente_pagamento` antes da confirmação efetiva.
  if (sale.status === 'reservado' || sale.status === 'pendente_pagamento') {
    return { label: 'Aguardando pagamento', variant: 'secondary' };
  }
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

function computeCompactFlowLabel(fullLabel: string): string {
  // Mantém a leitura rápida da tabela sem perder o contexto técnico do fluxo.
  const compactLabels: Record<string, string> = {
    'Cobrança enviada ao gateway': 'Cobrança enviada',
    'Pagamento confirmado': 'Pagamento confirmado',
    'Passagem gerada': 'Passagem gerada',
    'Venda manual paga': 'Venda manual paga',
    'Venda manual criada': 'Venda manual criada',
    'Cobrança expirada': 'Cobrança expirada',
    'Venda criada': 'Venda criada',
    'Cancelado': 'Cancelado',
  };

  return compactLabels[fullLabel] ?? fullLabel;
}

// ── Timeline builder ──
interface TimelineEntry {
  time: string;
  label: string;
  icon: typeof CheckCircle;
  color: string;
}

type PaymentConfirmationSource = 'webhook' | 'on_demand' | 'none';

function detectPaymentConfirmationSource(
  sale: DiagnosticSale,
  saleLogs: SaleLog[],
  integrationLogs: SaleIntegrationLog[]
): PaymentConfirmationSource {
  // Regra de diagnóstico: se houve webhook Asaas recebido para a venda, ele tem prioridade como origem.
  const hasWebhookLog = integrationLogs.some((log) => log.direction === 'incoming_webhook' && log.provider === 'asaas');
  if (hasWebhookLog) return 'webhook';

  // Sem webhook técnico, tentamos identificar confirmação por verificação on-demand via trilha funcional.
  const hasOnDemandConfirmation = saleLogs.some((log) => (
    log.action === 'payment_confirmed' &&
    log.description.toLowerCase().includes('verify-payment-status')
  ));

  if (hasOnDemandConfirmation || (sale.status === 'pago' && sale.asaas_payment_status === 'CONFIRMED')) {
    return 'on_demand';
  }

  return 'none';
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
  const [detailIntegrationLogs, setDetailIntegrationLogs] = useState<SaleIntegrationLog[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailCompany, setDetailCompany] = useState<{
    name: string;
    asaas_account_email: string | null;
    asaas_wallet_id: string | null;
    asaas_account_id: string | null;
  } | null>(null);

  const hasActiveFilters = useMemo(() => (
    filters.search !== '' ||
    filters.status !== 'all' ||
    filters.eventId !== 'all' ||
    filters.gateway !== 'all' ||
    filters.paymentStatus !== 'all' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== ''
  ), [filters]);

  const salesWithOperationalView = useMemo(() => {
    return sales
      .map((sale) => ({ sale, operational: computeOperationalView(sale) }))
      .sort((a, b) => {
        // Diagnóstico operacional: problemas ficam no topo para leitura imediata de suporte.
        if (a.operational.priority !== b.operational.priority) {
          return a.operational.priority - b.operational.priority;
        }
        return new Date(b.sale.created_at).getTime() - new Date(a.sale.created_at).getTime();
      });
  }, [sales]);

  const operationalSummary = useMemo(() => {
    return salesWithOperationalView.reduce((acc, entry) => {
      acc.total += 1;
      if (entry.operational.category === 'saudavel') acc.saudavel += 1;
      if (entry.operational.category === 'atencao') acc.atencao += 1;
      if (entry.operational.category === 'problema') acc.problema += 1;
      if (entry.operational.category === 'pago') acc.pago += 1;
      if (entry.operational.category === 'cancelado') acc.cancelado += 1;
      return acc;
    }, { total: 0, saudavel: 0, atencao: 0, problema: 0, pago: 0, cancelado: 0 });
  }, [salesWithOperationalView]);

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

    // Fetch ticket counts and current seat locks for these sales.
    // Comentário de manutenção: usamos seat_locks para diagnosticar lock ativo/ausente/expirado
    // sem alterar a regra de negócio do checkout/expiração definida nos steps anteriores.
    const saleIds = rawSales.map((s) => s.id);
    const ticketCounts: Record<string, number> = {};
    const activeLockCountBySale: Record<string, number> = {};
    const latestLockExpiryBySale: Record<string, string> = {};
    if (saleIds.length > 0) {
      const [ticketsRes, locksRes] = await Promise.all([
        supabase
          .from('tickets')
          .select('sale_id')
          .in('sale_id', saleIds),
        supabase
          .from('seat_locks')
          .select('sale_id, expires_at')
          .in('sale_id', saleIds),
      ]);

      const tickets = ticketsRes.data ?? [];
      const seatLocks = locksRes.data ?? [];

      (tickets ?? []).forEach((t: any) => {
        ticketCounts[t.sale_id] = (ticketCounts[t.sale_id] ?? 0) + 1;
      });

      seatLocks.forEach((lock: any) => {
        const saleId = lock.sale_id as string | null;
        if (!saleId) return;

        if (new Date(lock.expires_at).getTime() > Date.now()) {
          activeLockCountBySale[saleId] = (activeLockCountBySale[saleId] ?? 0) + 1;
        }

        const currentLatest = latestLockExpiryBySale[saleId];
        if (!currentLatest || new Date(lock.expires_at).getTime() > new Date(currentLatest).getTime()) {
          latestLockExpiryBySale[saleId] = lock.expires_at;
        }
      });
    }

    const mapped: DiagnosticSale[] = rawSales.map((s) => ({
      ...s,
      company_name: s.company?.name ?? '-',
      event_name: s.event?.name ?? '-',
      event_date: s.event?.date ?? null,
      ticket_count: ticketCounts[s.id] ?? 0,
      active_lock_count: activeLockCountBySale[s.id] ?? 0,
      latest_lock_expires_at: latestLockExpiryBySale[s.id] ?? null,
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
    setDetailIntegrationLogs([]);
    setDetailCompany(null);

    const [logsRes, integrationLogsRes, companyRes] = await Promise.all([
      supabase
        .from('sale_logs')
        .select('*')
        .eq('sale_id', sale.id)
        .order('created_at', { ascending: true }),
      // Usa trilha técnica persistida para diagnóstico confiável do webhook/payload.
      supabase
        .from('sale_integration_logs')
        .select('*')
        .eq('sale_id', sale.id)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('companies')
        .select('name, asaas_account_email, asaas_wallet_id, asaas_account_id')
        .eq('id', sale.company_id)
        .single(),
    ]);

    setDetailLogs((logsRes.data ?? []) as SaleLog[]);
    setDetailIntegrationLogs((integrationLogsRes.data ?? []) as SaleIntegrationLog[]);
    setDetailCompany(companyRes.data as any ?? null);
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
        { value: 'pendente_pagamento', label: 'Pendente pagamento' },
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
      <div className="page-container">
        <PageHeader
          title="Diagnóstico de Vendas"
          description="Ferramenta para análise de vendas, pagamentos e retorno das integrações do sistema."
        />

        <div className="mb-6">
          {/* Mantém o mesmo espaçamento e hierarquia visual das demais telas administrativas. */}
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
        </div>

        {!loading && sales.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <StatsCard label="Total" value={operationalSummary.total} icon={Activity} />
            <StatsCard label="Pendentes saudáveis" value={operationalSummary.saudavel} icon={CheckCircle} variant="success" />
            <StatsCard label="Pendentes atenção" value={operationalSummary.atencao} icon={AlertTriangle} variant="warning" />
            <StatsCard label="Pendentes problema" value={operationalSummary.problema} icon={XCircle} variant="destructive" />
            <StatsCard label="Pagas" value={operationalSummary.pago} icon={Ticket} variant="success" />
            <StatsCard label="Canceladas" value={operationalSummary.cancelado} icon={Clock} />
          </div>
        )}

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
          <Card>
            <CardContent className="p-0">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                  <TableHead className="w-[120px]">Data</TableHead>
                  <TableHead className="w-[150px]">Evento</TableHead>
                  <TableHead className="w-[140px]">Comprador</TableHead>
                  <TableHead className="w-[105px]">Valor</TableHead>
                  <TableHead className="w-[95px]">Gateway</TableHead>
                  <TableHead className="w-[105px]">Ambiente</TableHead>
                  <TableHead className="w-[140px]">Diagnóstico</TableHead>
                  <TableHead className="w-[170px]">Tempo</TableHead>
                  <TableHead className="w-[140px]">Lock</TableHead>
                  <TableHead className="w-[190px]">Status</TableHead>
                  <TableHead className="w-[170px]">Fluxo</TableHead>
                  <TableHead className="w-[76px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                {salesWithOperationalView.map(({ sale, operational }) => {
                  const gateway = computeGateway(sale);
                  const paymentStatus = computePaymentStatus(sale);
                  const flowStage = computeFlowStage(sale);
                  const FlowIcon = flowStage.icon;
                  const compactFlowLabel = computeCompactFlowLabel(flowStage.label);

                  const actions: ActionItem[] = [
                    {
                      label: 'Ver detalhes da venda',
                      icon: Eye,
                      onClick: () => openDetail(sale),
                    },
                  ];

                  return (
                    <TableRow key={sale.id} className={operational.category === 'problema' ? 'bg-destructive/5' : ''}>
                      <TableCell className="whitespace-nowrap py-5 text-sm">
                        {format(parseISO(sale.created_at), 'dd/MM/yy HH:mm', { locale: ptBR })}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate py-5 text-sm">
                        {sale.event_name}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate py-5 text-sm">
                        {sale.customer_name}
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-5 text-sm">
                        {formatCurrencyBRL(sale.gross_amount ?? sale.quantity * sale.unit_price)}
                      </TableCell>
                      <TableCell className="py-5">
                        <Badge variant="outline" className="text-xs">
                          {gateway}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-5">
                        {/* Suporte: mostra o ambiente persistido da venda (fonte de verdade do fluxo). */}
                        <Badge variant="outline" className="text-xs">
                          {(sale as any).payment_environment === 'production' ? '🌐 Produção' : '🧪 Sandbox'}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-5">
                        <Badge variant={operational.categoryVariant} className={`text-xs whitespace-nowrap ${operational.categoryClassName ?? ''}`}>
                          {operational.categoryLabel}
                        </Badge>
                        {operational.hasGatewayDivergence && (
                          <Badge variant="destructive" className="text-xs mt-1">Divergência gateway</Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-5">
                        <div className="space-y-1 text-xs">
                          <p>{operational.createdAgoLabel}</p>
                          {operational.expirationLabel && <p className="text-muted-foreground">{operational.expirationLabel}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="py-5">
                        <Badge variant={operational.lockVariant} className="text-xs whitespace-nowrap">
                          {operational.lockLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={sale.status} />
                          <Badge variant={paymentStatus.variant} className="text-xs whitespace-nowrap">
                            {paymentStatus.label}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="py-5">
                        <span className={`flex items-center gap-1.5 whitespace-nowrap text-sm ${flowStage.color}`}>
                          <FlowIcon className="h-3.5 w-3.5" />
                          {compactFlowLabel}
                        </span>
                      </TableCell>
                      <TableCell className="py-5">
                        <ActionsDropdown actions={actions} />
                      </TableCell>
                    </TableRow>
                  );
                })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Detail Modal */}
        <Dialog open={!!detailSale} onOpenChange={(open) => !open && setDetailSale(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Diagnóstico da Venda
              </DialogTitle>
            </DialogHeader>

            {detailSale && (
              <Tabs defaultValue="resumo" className="flex-1 overflow-hidden flex flex-col">
                <TabsList className="w-full justify-start flex-shrink-0">
                  <TabsTrigger value="resumo">Resumo</TabsTrigger>
                  <TabsTrigger value="fluxo">Fluxo da Venda</TabsTrigger>
                  <TabsTrigger value="gateway">Gateway</TabsTrigger>
                  <TabsTrigger value="webhook">Webhook</TabsTrigger>
                  <TabsTrigger value="payloads">Payloads</TabsTrigger>
                </TabsList>

                {/* Tab 1 — Resumo */}
                <TabsContent value="resumo" className="flex-1 overflow-auto">
                  <ScrollArea className="h-full pr-4">
                    <div className="space-y-4 pb-4">
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
                        <div>
                          <span className="text-muted-foreground">Gateway</span>
                          <p>{computeGateway(detailSale)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Status da venda</span>
                          <div className="mt-1"><StatusBadge status={detailSale.status} /></div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Status do pagamento</span>
                          <Badge variant={computePaymentStatus(detailSale).variant} className="text-xs mt-1">
                            {computePaymentStatus(detailSale).label}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Origem da venda</span>
                          <p>{(detailSale as any).sale_origin ?? '-'}</p>
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Tab 2 — Fluxo da Venda */}
                <TabsContent value="fluxo" className="flex-1 overflow-auto">
                  <ScrollArea className="h-full pr-4">
                    <div className="space-y-3 pb-4">
                      <h3 className="text-sm font-semibold text-foreground">Linha do tempo da transação</h3>
                      {detailLoading ? (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Carregando histórico...
                        </div>
                      ) : (() => {
                        const timeline = buildTimeline(detailSale, detailLogs);
                        return (
                          <div className="space-y-0">
                            {timeline.map((entry, i) => {
                              const EntryIcon = entry.icon;
                              return (
                                <div key={i} className="flex items-start gap-3 py-2">
                                  <div className="flex flex-col items-center">
                                    <EntryIcon className={`h-4 w-4 ${entry.color}`} />
                                    {i < timeline.length - 1 && (
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
                        );
                      })()}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Tab 3 — Gateway / Integração */}
                <TabsContent value="gateway" className="flex-1 overflow-auto">
                  <ScrollArea className="h-full pr-4">
                    <div className="space-y-4 pb-4">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        Dados da Integração
                      </h3>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">Gateway utilizado</span>
                          <p>{computeGateway(detailSale)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Empresa vinculada</span>
                          <p>{detailCompany?.name ?? detailSale.company_name ?? '-'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Conta Asaas (email)</span>
                          <p className="font-mono text-xs">{detailCompany?.asaas_account_email ?? 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Wallet Asaas</span>
                          <p className="font-mono text-xs">{detailCompany?.asaas_wallet_id ?? 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">ID Conta Asaas</span>
                          <p className="font-mono text-xs">{detailCompany?.asaas_account_id ?? 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">ID da cobrança no gateway</span>
                          <p className="font-mono text-xs break-all">
                            {detailSale.asaas_payment_id || detailSale.stripe_payment_intent_id || detailSale.stripe_checkout_session_id || '-'}
                          </p>
                        </div>
                        {detailSale.asaas_payment_status && (
                          <div>
                            <span className="text-muted-foreground">Status Asaas bruto</span>
                            <p className="font-mono text-xs">{detailSale.asaas_payment_status}</p>
                          </div>
                        )}
                        <div>
                          <span className="text-muted-foreground">Status taxa plataforma</span>
                          <p className="font-mono text-xs">{(detailSale as any).platform_fee_status ?? '-'}</p>
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
                      <div className="rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
                        <p>Logs técnicos de integração são persistidos em <code className="font-mono">sale_integration_logs</code> para rastreamento do webhook e payloads.</p>
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Tab 4 — Webhook */}
                <TabsContent value="webhook" className="flex-1 overflow-auto">
                  <ScrollArea className="h-full pr-4">
                    {(() => {
                      const webhookLog = detailIntegrationLogs.find((log) => log.direction === 'incoming_webhook' && log.provider === 'asaas');
                      const webhookReceived = !!webhookLog;
                      const confirmationSource = detectPaymentConfirmationSource(detailSale, detailLogs, detailIntegrationLogs);
                      const statusLabelMap: Record<SaleIntegrationLog['processing_status'], string> = {
                        received: 'Recebido',
                        ignored: 'Ignorado',
                        success: 'Sucesso',
                        partial_failure: 'Parcial',
                        failed: 'Falha',
                        unauthorized: 'Não autorizado',
                        duplicate: 'Duplicado',
                        rejected: 'Rejeitado',
                        warning: 'Aviso',
                      };

                      return (
                        <div className="space-y-4 pb-4">
                          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <Webhook className="h-4 w-4" />
                            Webhook do Pagamento
                          </h3>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <span className="text-muted-foreground">Webhook recebido</span>
                              <p className={webhookReceived ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                                {webhookReceived ? 'Sim' : 'Não detectado'}
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Origem da confirmação</span>
                              <p className="font-medium">
                                {confirmationSource === 'webhook' && 'Webhook'}
                                {confirmationSource === 'on_demand' && 'Verificação on-demand (verify-payment-status)'}
                                {confirmationSource === 'none' && 'Não identificada'}
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Ambiente persistido da venda</span>
                              <p className="font-medium">{formatPaymentEnvironmentLabel((detailSale as any).payment_environment)}</p>
                            </div>
                            {webhookLog && (
                              <>
                                <div>
                                  <span className="text-muted-foreground">Ambiente no log técnico</span>
                                  <p className="font-medium">{formatPaymentEnvironmentLabel(webhookLog.payment_environment)}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Origem da decisão</span>
                                  <p className="font-mono text-xs">{webhookLog.environment_decision_source ?? '-'}</p>
                                </div>
                                <div className="col-span-2">
                                  <span className="text-muted-foreground">Host detectado na decisão</span>
                                  <p className="font-mono text-xs break-all">{webhookLog.environment_host_detected ?? '-'}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Data do webhook</span>
                                  <p>{format(parseISO(webhookLog.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Tipo do evento</span>
                                  <p className="font-mono text-xs">{webhookLog.event_type ?? '-'}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Status bruto do Asaas</span>
                                  <p className="font-mono text-xs">{String((webhookLog.payload_json as any)?.payment?.status ?? '-')}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Status do processamento</span>
                                  <p className="font-medium">{statusLabelMap[webhookLog.processing_status] ?? webhookLog.processing_status}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Mensagem técnica</span>
                                  <p className="text-xs">{webhookLog.message}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">HTTP retornado</span>
                                  <p className="font-mono text-xs">{webhookLog.http_status ?? '-'}</p>
                                </div>
                              </>
                            )}
                          </div>
                          {!webhookReceived && (
                            <div className="rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
                              {confirmationSource === 'on_demand' ? (
                                <p>Nenhum log de webhook encontrado, mas o pagamento foi confirmado por verificação on-demand.</p>
                              ) : (
                                <p>Nenhum log técnico de webhook encontrado para esta venda.</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </ScrollArea>
                </TabsContent>

                {/* Tab 5 — Payloads Técnicos */}
                <TabsContent value="payloads" className="flex-1 overflow-auto">
                  <ScrollArea className="h-full pr-4">
                    <div className="space-y-4 pb-4">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <FileJson className="h-4 w-4" />
                        Payloads Técnicos
                      </h3>

                      {/* Raw sale data */}
                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors w-full">
                          <ChevronDown className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-180" />
                          Ver dados brutos da venda
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <pre className="mt-2 rounded-md border border-border bg-muted/50 p-3 text-xs font-mono overflow-auto max-h-64">
                            {JSON.stringify(
                              (() => {
                                const { ...safe } = detailSale as any;
                                // Remove sensitive/internal fields
                                delete safe.event;
                                delete safe.company;
                                return safe;
                              })(),
                              null,
                              2
                            )}
                          </pre>
                        </CollapsibleContent>
                      </Collapsible>

                      {/* Sale logs */}
                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors w-full">
                          <ChevronDown className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-180" />
                          Ver logs da venda ({detailLogs.length})
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          {detailLogs.length === 0 ? (
                            <p className="mt-2 text-xs text-muted-foreground">Nenhum log registrado para esta venda.</p>
                          ) : (
                            <pre className="mt-2 rounded-md border border-border bg-muted/50 p-3 text-xs font-mono overflow-auto max-h-64">
                              {JSON.stringify(detailLogs, null, 2)}
                            </pre>
                          )}
                        </CollapsibleContent>
                      </Collapsible>

                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors w-full">
                          <ChevronDown className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-180" />
                          Ver logs técnicos de integração ({detailIntegrationLogs.length})
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          {detailIntegrationLogs.length === 0 ? (
                            <p className="mt-2 text-xs text-muted-foreground">Nenhum log técnico encontrado para esta venda.</p>
                          ) : (
                            <pre className="mt-2 rounded-md border border-border bg-muted/50 p-3 text-xs font-mono overflow-auto max-h-64">
                              {JSON.stringify(detailIntegrationLogs, null, 2)}
                            </pre>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
