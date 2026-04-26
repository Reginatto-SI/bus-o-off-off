import { useState, useEffect, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Loader2,
  RefreshCw,
  FileSpreadsheet,
  FileText,
  BadgePercent,
  DollarSign,
  ShoppingCart,
  Ticket,
  Users,
  Calendar,
  BarChart3,
  List,
  Check,
  ChevronsUpDown,
} from 'lucide-react';
import { toast } from 'sonner';

import { AdminLayout } from '@/components/layout/AdminLayout';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatsCard } from '@/components/admin/StatsCard';
import { FilterCard, FilterInput } from '@/components/admin/FilterCard';
import { ExportExcelModal, ExportColumn } from '@/components/admin/ExportExcelModal';
import { ExportPDFModal } from '@/components/admin/ExportPDFModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { SaleStatus, Seller } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatDateOnlyBR } from '@/lib/date';
import { cn } from '@/lib/utils';
import { formatCurrencyBRL } from '@/lib/currency';

interface ReportFilters {
  search: string;
  status: 'all' | SaleStatus;
  eventId: string;
  sellerId: string;
  dateFrom: string;
  dateTo: string;
}

interface EventFilterOption {
  id: string;
  name: string;
  date: string;
}

interface SummaryRow {
  seller_id: string | null;
  seller_name: string;
  commission_percent: number;
  eligible_sales: number;
  total_tickets: number;
  eligible_revenue: number;
  total_commission: number;
}

interface DetailedRow {
  id: string;
  created_at: string;
  status: SaleStatus;
  quantity: number;
  unit_price: number;
  gross_amount: number | null;
  seller_id: string | null;
  event?: { name?: string | null } | null;
  seller?: { name?: string | null; commission_percent?: number | null } | null;
}

interface KpisPayload {
  total_commission: number;
  eligible_revenue: number;
  eligible_sales: number;
  total_tickets: number;
  sellers_count: number;
}

const initialFilters: ReportFilters = {
  search: '',
  status: 'pago',
  eventId: 'all',
  sellerId: 'all',
  dateFrom: '',
  dateTo: '',
};

const REPORT_TABS = {
  resumo: 'resumo',
  detalhado: 'detalhado',
} as const;

type ReportTab = (typeof REPORT_TABS)[keyof typeof REPORT_TABS];

const statusLabels: Record<string, string> = {
  pendente: 'Pendente',
  pendente_taxa: 'Pendente de taxa',
  pendente_pagamento: 'Pendente pagamento',
  reservado: 'Reservado',
  pago: 'Pago',
  cancelado: 'Cancelado',
};

export default function SellersCommissionReport() {
  const { activeCompanyId, activeCompany, canViewFinancials } = useAuth();

  const [filters, setFilters] = useState<ReportFilters>(initialFilters);
  const [events, setEvents] = useState<EventFilterOption[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);

  const [activeTab, setActiveTab] = useState<ReportTab>(REPORT_TABS.resumo);
  const [loading, setLoading] = useState(true);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalResultsCount, setTotalResultsCount] = useState(0);

  const [summaryRows, setSummaryRows] = useState<SummaryRow[]>([]);
  const [detailedRows, setDetailedRows] = useState<DetailedRow[]>([]);
  const [kpis, setKpis] = useState<KpisPayload>({
    total_commission: 0,
    eligible_revenue: 0,
    eligible_sales: 0,
    total_tickets: 0,
    sellers_count: 0,
  });

  const [excelModalOpen, setExcelModalOpen] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [eventFilterOpen, setEventFilterOpen] = useState(false);
  const [sellerFilterOpen, setSellerFilterOpen] = useState(false);
  const [eventFilterSearch, setEventFilterSearch] = useState('');
  const [sellerFilterSearch, setSellerFilterSearch] = useState('');

  const normalizeDateToIso = (dateInput: string, endOfDay = false) => {
    if (!dateInput) return null;
    const date = new Date(dateInput);
    if (endOfDay) date.setHours(23, 59, 59, 999);
    return date.toISOString();
  };

  const formatEventFilterLabel = (event: EventFilterOption) => {
    const eventDate = event.date ? formatDateOnlyBR(event.date) : '';
    return eventDate ? `${eventDate} - ${event.name}` : event.name;
  };

  // Escalabilidade: evento/vendedor viraram combobox com busca para evitar scroll manual em listas grandes.
  // A lógica do relatório (RPC/queries/filtros enviados) permanece exatamente a mesma; só trocamos a experiência de seleção.
  const eventFilterOptions = useMemo(
    () => [{ value: 'all', label: 'Todos' }, ...events.map((e) => ({ value: e.id, label: formatEventFilterLabel(e) }))],
    [events],
  );

  const sellerFilterOptions = useMemo(
    () => [
      { value: 'all', label: 'Todos' },
      ...sellers.map((seller) => ({
        value: seller.id,
        label: seller.short_code ? `${seller.name} (${seller.short_code})` : seller.name,
      })),
    ],
    [sellers],
  );

  const filteredEventFilterOptions = useMemo(() => {
    const term = eventFilterSearch.trim().toLowerCase();
    if (!term) return eventFilterOptions;
    return eventFilterOptions.filter((option) => option.label.toLowerCase().includes(term));
  }, [eventFilterOptions, eventFilterSearch]);

  const filteredSellerFilterOptions = useMemo(() => {
    const term = sellerFilterSearch.trim().toLowerCase();
    if (!term) return sellerFilterOptions;
    return sellerFilterOptions.filter((option) => option.label.toLowerCase().includes(term));
  }, [sellerFilterOptions, sellerFilterSearch]);

  const selectedEventFilterLabel = eventFilterOptions.find((option) => option.value === filters.eventId)?.label ?? 'Todos';
  const selectedSellerFilterLabel = sellerFilterOptions.find((option) => option.value === filters.sellerId)?.label ?? 'Todos';

  // Comissão de vendedores é 100% gerencial e independente de Stripe.
  // A base é gross_amount quando válida; fallback para quantidade * unit_price.
  const getSaleBaseAmount = (sale: Pick<DetailedRow, 'gross_amount' | 'quantity' | 'unit_price'>) => {
    if (sale.gross_amount && sale.gross_amount > 0) return Number(sale.gross_amount);
    return Number(sale.quantity) * Number(sale.unit_price);
  };

  // Regra v1: só venda paga gera comissão.
  const getSaleCommissionAmount = (sale: DetailedRow) => {
    if (sale.status !== 'pago') return 0;
    const base = getSaleBaseAmount(sale);
    const commissionPercent = Number(sale.seller?.commission_percent ?? 0);
    return Number((base * commissionPercent / 100).toFixed(2));
  };

  const buildReportRpcParams = () => ({
    p_company_id: activeCompanyId,
    p_search: filters.search.trim() || null,
    p_status: filters.status === 'all' ? null : filters.status,
    p_event_id: filters.eventId === 'all' ? null : filters.eventId,
    p_seller_id: filters.sellerId === 'all' ? null : filters.sellerId,
    p_date_from: normalizeDateToIso(filters.dateFrom),
    p_date_to: normalizeDateToIso(filters.dateTo, true),
  });

  const fetchFiltersData = async () => {
    if (!activeCompanyId) {
      setEvents([]);
      setSellers([]);
      return;
    }

    const [eventsRes, sellersRes] = await Promise.all([
      supabase
        .from('events')
        .select('id, name, date')
        .eq('company_id', activeCompanyId)
        .order('date', { ascending: false }),
      supabase
        .from('sellers')
        .select('id, name, commission_percent, status, company_id, short_code, phone, email, cpf, pix_key, notes, created_at, updated_at')
        .eq('company_id', activeCompanyId)
        .eq('status', 'ativo')
        .order('name'),
    ]);

    if (eventsRes.error) {
      toast.error('Erro ao carregar eventos do filtro');
    } else {
      setEvents((eventsRes.data ?? []) as EventFilterOption[]);
    }

    if (sellersRes.error) {
      toast.error('Erro ao carregar vendedores do filtro');
    } else {
      setSellers((sellersRes.data ?? []) as Seller[]);
    }
  };

  const fetchSummaryPage = async () => {
    const offset = (currentPage - 1) * rowsPerPage;
    const { data, error } = await (supabase as any).rpc('get_sellers_commission_summary_paginated', {
      ...buildReportRpcParams(),
      p_limit: rowsPerPage,
      p_offset: offset,
    });

    if (error) {
      toast.error('Erro ao carregar resumo de comissão por vendedor');
      setSummaryRows([]);
      setTotalResultsCount(0);
      return;
    }

    const rows = (data ?? []) as Array<SummaryRow & { total_count: number }>;
    setSummaryRows(rows.map(({ total_count, ...row }) => row));
    setTotalResultsCount(Number(rows[0]?.total_count ?? 0));
  };

  const fetchDetailedPage = async () => {
    const rangeFrom = (currentPage - 1) * rowsPerPage;
    const rangeTo = rangeFrom + rowsPerPage - 1;

    let query = supabase
      .from('sales')
      .select(`
        id,
        created_at,
        status,
        quantity,
        unit_price,
        gross_amount,
        seller_id,
        event:events(name),
        seller:sellers(name, commission_percent)
      `, { count: 'exact' })
      .order('created_at', { ascending: false });

    if (activeCompanyId) query = query.eq('company_id', activeCompanyId);
    if (filters.status !== 'all') query = query.eq('status', filters.status);
    if (filters.eventId !== 'all') query = query.eq('event_id', filters.eventId);
    if (filters.sellerId !== 'all') query = query.eq('seller_id', filters.sellerId);
    if (filters.dateFrom) query = query.gte('created_at', normalizeDateToIso(filters.dateFrom));
    if (filters.dateTo) query = query.lte('created_at', normalizeDateToIso(filters.dateTo, true));
    if (filters.search.trim()) query = query.ilike('id', `%${filters.search.trim()}%`);

    query = query.range(rangeFrom, rangeTo);

    const { data, error, count } = await query;

    if (error) {
      toast.error('Erro ao carregar detalhamento de comissão');
      setDetailedRows([]);
      setTotalResultsCount(0);
      return;
    }

    setDetailedRows((data ?? []) as DetailedRow[]);
    setTotalResultsCount(count ?? 0);
  };

  const fetchKpis = async () => {
    const { data, error } = await (supabase as any).rpc('get_sellers_commission_kpis', buildReportRpcParams());

    if (error) {
      toast.error('Erro ao calcular indicadores de comissão');
      return;
    }

    const payload = (data?.[0] ?? {}) as Partial<KpisPayload>;
    setKpis({
      total_commission: Number(payload.total_commission ?? 0),
      eligible_revenue: Number(payload.eligible_revenue ?? 0),
      eligible_sales: Number(payload.eligible_sales ?? 0),
      total_tickets: Number(payload.total_tickets ?? 0),
      sellers_count: Number(payload.sellers_count ?? 0),
    });
  };

  const fetchReportData = async () => {
    setLoading(true);
    if (activeTab === REPORT_TABS.resumo) {
      setDetailedRows([]);
      await fetchSummaryPage();
    } else {
      setSummaryRows([]);
      await fetchDetailedPage();
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchFiltersData();
  }, [activeCompanyId]);

  useEffect(() => {
    fetchReportData();
  }, [activeCompanyId, activeTab, currentPage, rowsPerPage, filters]);

  useEffect(() => {
    fetchKpis();
  }, [activeCompanyId, filters]);

  useEffect(() => {
    if (!eventFilterOpen) setEventFilterSearch('');
  }, [eventFilterOpen]);

  useEffect(() => {
    if (!sellerFilterOpen) setSellerFilterSearch('');
  }, [sellerFilterOpen]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters, rowsPerPage, activeTab]);

  const totalPages = Math.max(1, Math.ceil(totalResultsCount / rowsPerPage));
  const rangeStart = totalResultsCount === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
  const rangeEnd = totalResultsCount === 0 ? 0 : Math.min(currentPage * rowsPerPage, totalResultsCount);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const hasActiveFilters = useMemo(() => {
    return (
      filters.search !== '' ||
      filters.status !== 'pago' ||
      filters.eventId !== 'all' ||
      filters.sellerId !== 'all' ||
      filters.dateFrom !== '' ||
      filters.dateTo !== ''
    );
  }, [filters]);

  const detailedFlatData = useMemo(() => {
    return detailedRows.map((sale) => {
      const base = getSaleBaseAmount(sale);
      const commissionPercent = Number(sale.seller?.commission_percent ?? 0);
      return {
        created_at: sale.created_at,
        event_name: sale.event?.name ?? '-',
        sale_id: sale.id,
        seller_name: sale.seller?.name ?? 'Sem vendedor',
        quantity: sale.quantity,
        base_amount: base,
        commission_percent: commissionPercent,
        commission_amount: getSaleCommissionAmount(sale),
        status: sale.status,
      };
    });
  }, [detailedRows]);

  const summaryFlatData = useMemo(() => {
    return summaryRows.map((row) => ({
      seller_name: row.seller_name,
      eligible_sales: row.eligible_sales,
      total_tickets: row.total_tickets,
      eligible_revenue: row.eligible_revenue,
      commission_percent: row.commission_percent,
      total_commission: row.total_commission,
    }));
  }, [summaryRows]);

  const summaryExportColumns: ExportColumn[] = [
    { key: 'seller_name', label: 'Vendedor' },
    { key: 'eligible_sales', label: 'Vendas elegíveis' },
    { key: 'total_tickets', label: 'Passagens' },
    ...(canViewFinancials
      ? [
          { key: 'eligible_revenue', label: 'Receita elegível', format: (v: any) => formatCurrencyBRL(Number(v)) },
          { key: 'commission_percent', label: 'Comissão %', format: (v: any) => `${Number(v).toFixed(2)}%` },
          { key: 'total_commission', label: 'Comissão total', format: (v: any) => formatCurrencyBRL(Number(v)) },
        ]
      : []),
  ];

  const detailedExportColumns: ExportColumn[] = [
    { key: 'created_at', label: 'Data da compra', format: (v) => v ? format(parseISO(v), 'dd/MM/yy HH:mm', { locale: ptBR }) : '' },
    { key: 'event_name', label: 'Evento' },
    { key: 'sale_id', label: 'ID da venda' },
    { key: 'seller_name', label: 'Vendedor' },
    { key: 'quantity', label: 'Quantidade' },
    ...(canViewFinancials
      ? [
          { key: 'base_amount', label: 'Base da venda', format: (v: any) => formatCurrencyBRL(Number(v)) },
          { key: 'commission_percent', label: 'Comissão %', format: (v: any) => `${Number(v).toFixed(2)}%` },
          { key: 'commission_amount', label: 'Comissão (R$)', format: (v: any) => formatCurrencyBRL(Number(v)) },
        ]
      : []),
    { key: 'status', label: 'Status', format: (v) => statusLabels[v] ?? v },
  ];

  const isSummaryView = activeTab === REPORT_TABS.resumo;
  const exportColumns = isSummaryView ? summaryExportColumns : detailedExportColumns;
  const exportData = isSummaryView ? summaryFlatData : detailedFlatData;
  const exportStorageSuffix = isSummaryView ? 'resumo' : 'detalhado';
  const exportFileNameSuffix = isSummaryView ? 'resumo-vendedor' : 'detalhado-venda';

  const periodLabel = useMemo(() => {
    if (!filters.dateFrom && !filters.dateTo) return 'Todos os períodos';
    const from = filters.dateFrom ? format(new Date(filters.dateFrom), 'dd/MM/yyyy', { locale: ptBR }) : 'Início';
    const to = filters.dateTo ? format(new Date(filters.dateTo), 'dd/MM/yyyy', { locale: ptBR }) : 'Hoje';
    return `${from} até ${to}`;
  }, [filters.dateFrom, filters.dateTo]);

  const appliedFiltersForPdf = useMemo(() => {
    const activeEventLabel = eventFilterOptions.find((option) => option.value === filters.eventId)?.label ?? 'Todos';
    const activeSellerLabel = sellerFilterOptions.find((option) => option.value === filters.sellerId)?.label ?? 'Todos';
    const statusLabel = filters.status === 'all' ? 'Todos' : (statusLabels[filters.status] ?? filters.status);

    return [
      { label: 'Aba', value: isSummaryView ? 'Resumo por Vendedor' : 'Detalhado por Venda' },
      { label: 'Evento', value: activeEventLabel },
      { label: 'Vendedor', value: activeSellerLabel },
      { label: 'Status', value: statusLabel },
    ];
  }, [eventFilterOptions, filters.eventId, filters.sellerId, filters.status, isSummaryView, sellerFilterOptions]);

  const averageCommissionPerSale = useMemo(() => {
    if (!kpis.eligible_sales) return 0;
    return Number((kpis.total_commission / kpis.eligible_sales).toFixed(2));
  }, [kpis.eligible_sales, kpis.total_commission]);

  // PDF sincronizado com KPIs da interface: os mesmos indicadores/filtros da tela são enviados ao export.
  // Comissão é gerencial (não usa Stripe) e o bloco de resumo deve permanecer alinhado às regras atuais da UI.
  const summaryItemsForPdf = useMemo(() => [
    { label: 'Comissão Total', value: formatCurrencyBRL(kpis.total_commission), emphasis: 'highlight' as const },
    { label: 'Receita Elegível', value: formatCurrencyBRL(kpis.eligible_revenue) },
    { label: 'Vendas Elegíveis', value: String(kpis.eligible_sales) },
    { label: 'Passagens', value: String(kpis.total_tickets) },
    { label: 'Nº de Vendedores', value: String(kpis.sellers_count) },
    { label: 'Comissão Média por Venda', value: formatCurrencyBRL(averageCommissionPerSale) },
  ], [averageCommissionPerSale, kpis]);

  const renderPagination = () => (
    <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>Exibindo {rangeStart}–{rangeEnd} de {totalResultsCount} resultados</span>
        <div className="flex items-center gap-2">
          <span>Linhas por página</span>
          <Select value={String(rowsPerPage)} onValueChange={(value) => setRowsPerPage(Number(value))}>
            <SelectTrigger className="h-8 w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          disabled={currentPage === 1 || loading}
        >
          Anterior
        </Button>
        <span className="text-sm text-muted-foreground">Página {currentPage} de {totalPages}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
          disabled={currentPage >= totalPages || loading}
        >
          Próxima
        </Button>
      </div>
    </div>
  );

  return (
    <AdminLayout>
      <div className="page-container">
        <PageHeader
          title="Comissão de Vendedores"
          description="Relatório gerencial para apuração e envio aos vendedores."
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => { setLoading(true); fetchReportData(); }}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPdfModalOpen(true)}>
                <FileText className="h-4 w-4 mr-2" />
                PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => setExcelModalOpen(true)}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel
              </Button>
            </>
          }
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          {canViewFinancials && (
            <StatsCard label="Comissão Total" value={formatCurrencyBRL(kpis.total_commission)} icon={BadgePercent} variant="success" />
          )}
          {canViewFinancials && (
            <StatsCard label="Receita Elegível" value={formatCurrencyBRL(kpis.eligible_revenue)} icon={DollarSign} variant="success" />
          )}
          <StatsCard label="Vendas Elegíveis" value={kpis.eligible_sales} icon={ShoppingCart} />
          <StatsCard label="Passagens" value={kpis.total_tickets} icon={Ticket} />
          <StatsCard label="Nº de Vendedores" value={kpis.sellers_count} icon={Users} />
        </div>

        <div className="mb-6">
          <FilterCard
            searchValue={filters.search}
            onSearchChange={(v) => setFilters((f) => ({ ...f, search: v }))}
            searchPlaceholder="Buscar por ID da venda..."
            searchLabel="Venda"
            selects={[
              {
                id: 'status',
                label: 'Status',
                placeholder: 'Pago',
                value: filters.status,
                onChange: (v) => setFilters((f) => ({ ...f, status: v as any })),
                options: [
                  { value: 'all', label: 'Todos' },
                  { value: 'pendente', label: 'Pendente' },
                  { value: 'pendente_taxa', label: 'Pendente de taxa' },
                  { value: 'pendente_pagamento', label: 'Pendente pagamento' },
                  { value: 'reservado', label: 'Reservado' },
                  { value: 'pago', label: 'Pago' },
                  { value: 'cancelado', label: 'Cancelado' },
                ],
              },
            ]}
            mainFilters={(
              <>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">Evento</label>
                  <Popover open={eventFilterOpen} onOpenChange={setEventFilterOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={eventFilterOpen}
                        className={cn('w-full justify-between font-normal', filters.eventId === 'all' && 'text-muted-foreground')}
                      >
                        <span className="truncate">{selectedEventFilterLabel}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Buscar evento..."
                          value={eventFilterSearch}
                          onValueChange={setEventFilterSearch}
                        />
                        <CommandList>
                          <CommandEmpty>Nenhum evento encontrado.</CommandEmpty>
                          <CommandGroup>
                            {filteredEventFilterOptions.map((option) => (
                              <CommandItem
                                key={option.value}
                                value={option.label}
                                onSelect={() => {
                                  setFilters((f) => ({ ...f, eventId: option.value }));
                                  setEventFilterOpen(false);
                                }}
                              >
                                <Check className={cn('mr-2 h-4 w-4', filters.eventId === option.value ? 'opacity-100' : 'opacity-0')} />
                                <span className="truncate">{option.label}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">Vendedor</label>
                  <Popover open={sellerFilterOpen} onOpenChange={setSellerFilterOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={sellerFilterOpen}
                        className={cn('w-full justify-between font-normal', filters.sellerId === 'all' && 'text-muted-foreground')}
                      >
                        <span className="truncate">{selectedSellerFilterLabel}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Buscar vendedor..."
                          value={sellerFilterSearch}
                          onValueChange={setSellerFilterSearch}
                        />
                        <CommandList>
                          <CommandEmpty>Nenhum vendedor encontrado.</CommandEmpty>
                          <CommandGroup>
                            {filteredSellerFilterOptions.map((option) => (
                              <CommandItem
                                key={option.value}
                                value={option.label}
                                onSelect={() => {
                                  setFilters((f) => ({ ...f, sellerId: option.value }));
                                  setSellerFilterOpen(false);
                                }}
                              >
                                <Check className={cn('mr-2 h-4 w-4', filters.sellerId === option.value ? 'opacity-100' : 'opacity-0')} />
                                <span className="truncate">{option.label}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </>
            )}
            advancedFilters={
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FilterInput
                  id="dateFrom"
                  label="Data Inicial"
                  placeholder=""
                  value={filters.dateFrom}
                  onChange={(v) => setFilters((f) => ({ ...f, dateFrom: v }))}
                  type="date"
                  icon={Calendar}
                />
                <FilterInput
                  id="dateTo"
                  label="Data Final"
                  placeholder=""
                  value={filters.dateTo}
                  onChange={(v) => setFilters((f) => ({ ...f, dateTo: v }))}
                  type="date"
                  icon={Calendar}
                />
              </div>
            }
            onClearFilters={() => setFilters(initialFilters)}
            hasActiveFilters={hasActiveFilters}
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : totalResultsCount === 0 ? (
          <EmptyState
            icon={<BadgePercent className="h-8 w-8 text-muted-foreground" />}
            title="Nenhum dado de comissão encontrado"
            description={hasActiveFilters ? 'Tente ajustar os filtros ou o período' : 'Os dados aparecerão quando houver vendas'}
          />
        ) : (
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ReportTab)}>
            <TabsList className="mb-4">
              <TabsTrigger value={REPORT_TABS.resumo} className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Resumo por Vendedor
              </TabsTrigger>
              <TabsTrigger value={REPORT_TABS.detalhado} className="gap-2">
                <List className="h-4 w-4" />
                Detalhado por Venda
              </TabsTrigger>
            </TabsList>

            <TabsContent value={REPORT_TABS.resumo}>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendedor</TableHead>
                        <TableHead className="text-center">Vendas elegíveis</TableHead>
                        <TableHead className="text-center">Passagens</TableHead>
                        {canViewFinancials && <TableHead className="text-right">Receita elegível</TableHead>}
                        {canViewFinancials && <TableHead className="text-right">Comissão %</TableHead>}
                        {canViewFinancials && <TableHead className="text-right">Comissão total</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaryRows.map((row) => (
                        <TableRow key={row.seller_id ?? 'sem-vendedor'}>
                          <TableCell className="font-medium">{row.seller_name}</TableCell>
                          <TableCell className="text-center">{row.eligible_sales}</TableCell>
                          <TableCell className="text-center">{row.total_tickets}</TableCell>
                          {canViewFinancials && <TableCell className="text-right">{formatCurrencyBRL(row.eligible_revenue)}</TableCell>}
                          {canViewFinancials && <TableCell className="text-right">{row.commission_percent.toFixed(2)}%</TableCell>}
                          {canViewFinancials && <TableCell className="text-right font-medium">{formatCurrencyBRL(row.total_commission)}</TableCell>}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {renderPagination()}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value={REPORT_TABS.detalhado}>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data da compra</TableHead>
                        <TableHead>Evento</TableHead>
                        <TableHead>ID da venda</TableHead>
                        <TableHead>Vendedor</TableHead>
                        <TableHead className="text-center">Quantidade</TableHead>
                        {canViewFinancials && <TableHead className="text-right">Base da venda</TableHead>}
                        {canViewFinancials && <TableHead className="text-right">Comissão %</TableHead>}
                        {canViewFinancials && <TableHead className="text-right">Comissão (R$)</TableHead>}
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailedRows.map((sale) => {
                        const baseAmount = getSaleBaseAmount(sale);
                        const commissionPercent = Number(sale.seller?.commission_percent ?? 0);
                        const commissionAmount = getSaleCommissionAmount(sale);

                        return (
                          <TableRow key={sale.id}>
                            <TableCell className="text-sm whitespace-nowrap">
                              {format(new Date(sale.created_at), 'dd/MM/yy HH:mm', { locale: ptBR })}
                            </TableCell>
                            <TableCell>{sale.event?.name ?? '-'}</TableCell>
                            <TableCell className="font-mono text-xs">{sale.id.slice(0, 8)}…</TableCell>
                            <TableCell>{sale.seller?.name ?? 'Sem vendedor'}</TableCell>
                            <TableCell className="text-center">{sale.quantity}</TableCell>
                            {canViewFinancials && <TableCell className="text-right">{formatCurrencyBRL(baseAmount)}</TableCell>}
                            {canViewFinancials && <TableCell className="text-right">{commissionPercent.toFixed(2)}%</TableCell>}
                            {canViewFinancials && <TableCell className="text-right">{formatCurrencyBRL(commissionAmount)}</TableCell>}
                            <TableCell><StatusBadge status={sale.status} /></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {renderPagination()}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        <ExportExcelModal
          open={excelModalOpen}
          onOpenChange={setExcelModalOpen}
          columns={exportColumns}
          data={exportData}
          storageKey={`sellers-commission-excel-${exportStorageSuffix}`}
          fileName={`relatorio-comissao-vendedores-${exportFileNameSuffix}`}
          sheetName={isSummaryView ? 'Resumo por Vendedor' : 'Detalhado por Venda'}
        />
        <ExportPDFModal
          open={pdfModalOpen}
          onOpenChange={setPdfModalOpen}
          columns={exportColumns}
          data={exportData}
          storageKey={`sellers-commission-pdf-${exportStorageSuffix}`}
          fileName={`relatorio-comissao-vendedores-${exportFileNameSuffix}`}
          title={isSummaryView ? 'Comissão de Vendedores - Resumo por Vendedor' : 'Comissão de Vendedores - Detalhado por Venda'}
          company={activeCompany}
          totalRecords={totalResultsCount}
          periodLabel={periodLabel}
          appliedFilters={appliedFiltersForPdf}
          summaryTitle="Resumo da Apuração"
          summaryItems={summaryItemsForPdf}
        />
      </div>
    </AdminLayout>
  );
}
