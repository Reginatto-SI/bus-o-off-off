import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sale, SaleStatus, Seller } from '@/types/database';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatsCard } from '@/components/admin/StatsCard';
import { FilterCard, FilterInput } from '@/components/admin/FilterCard';
import { ActionsDropdown, ActionItem } from '@/components/admin/ActionsDropdown';
import { ExportExcelModal, ExportColumn } from '@/components/admin/ExportExcelModal';
import { ExportPDFModal } from '@/components/admin/ExportPDFModal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  ShoppingCart,
  Loader2,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  DollarSign,
  CheckCircle,
  TrendingUp,
  Percent,
  Users,
  Calendar,
  Copy,
  BarChart3,
  List,
  Check,
  ChevronsUpDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatDateOnlyBR } from '@/lib/date';
import { cn, formatBoardingLocationLabel } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
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
  city: string | null;
}

interface EventSummaryRow {
  eventId: string;
  eventName: string;
  eventDisplayName: string;
  totalSales: number;
  paidSales: number;
  cancelledSales: number;
  grossRevenue: number;
  platformFee: number;
  sellersCommission: number;
}

interface SalesReportKpis {
  totalSales: number;
  grossRevenue: number;
  paidSales: number;
  cancelledSales: number;
  platformFee: number;
  sellersCommission: number;
}

interface SummaryPaginatedRow {
  event_id: string;
  event_name: string;
  event_date: string | null;
  total_sales: number;
  paid_sales: number;
  cancelled_sales: number;
  gross_revenue: number;
  platform_fee: number;
  sellers_commission: number;
  total_count: number;
}

function formatEventDisplayName(event?: { name?: string | null; date?: string | null } | null): string {
  const eventName = event?.name ?? '';
  const eventDate = event?.date ? formatDateOnlyBR(event.date) : '';
  return eventDate ? `${eventDate} - ${eventName}` : eventName;
}

const vehicleTypeLabels: Record<string, string> = {
  onibus: 'Ônibus',
  micro_onibus: 'Micro-ônibus',
  van: 'Van',
};

const statusLabels: Record<string, string> = {
  pendente: 'Pendente',
  pendente_taxa: 'Pendente de taxa',
  pendente_pagamento: 'Pendente pagamento',
  reservado: 'Reservado',
  pago: 'Pago',
  cancelado: 'Cancelado',
};

const initialFilters: ReportFilters = {
  search: '',
  status: 'all',
  eventId: 'all',
  sellerId: 'all',
  // Mantém o mesmo comportamento de /admin/vendas:
  // sem recorte temporal implícito para evitar divergência de contagem/KPI.
  dateFrom: '',
  dateTo: '',
};

const SALES_REPORT_TABS = {
  resumo: 'resumo',
  detalhado: 'detalhado',
} as const;

type SalesReportTab = (typeof SALES_REPORT_TABS)[keyof typeof SALES_REPORT_TABS];

export default function SalesReport() {
  const { canViewFinancials, activeCompanyId, activeCompany } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [summaryRows, setSummaryRows] = useState<EventSummaryRow[]>([]);
  const [seatLabelsMap, setSeatLabelsMap] = useState<Record<string, string[]>>({});
  const [boardingTimeMap, setBoardingTimeMap] = useState<Record<string, string | null>>({});
  const [events, setEvents] = useState<EventFilterOption[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ReportFilters>(initialFilters);
  const [activeTab, setActiveTab] = useState<SalesReportTab>(SALES_REPORT_TABS.resumo);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalResultsCount, setTotalResultsCount] = useState(0);
  const [stats, setStats] = useState<SalesReportKpis>({
    totalSales: 0,
    grossRevenue: 0,
    paidSales: 0,
    cancelledSales: 0,
    platformFee: 0,
    sellersCommission: 0,
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
    if (endOfDay) {
      date.setHours(23, 59, 59, 999);
    }
    return date.toISOString();
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

  const applySalesFilters = <T,>(query: T): T => {
    let nextQuery: any = query;

    if (activeCompanyId) {
      nextQuery = nextQuery.eq('company_id', activeCompanyId);
    }

    if (filters.search.trim()) {
      const searchTerm = filters.search.trim();
      nextQuery = nextQuery.or(`customer_name.ilike.%${searchTerm}%,customer_cpf.ilike.%${searchTerm}%`);
    }

    if (filters.status !== 'all') {
      nextQuery = nextQuery.eq('status', filters.status);
    }

    if (filters.eventId !== 'all') {
      nextQuery = nextQuery.eq('event_id', filters.eventId);
    }

    if (filters.sellerId !== 'all') {
      nextQuery = nextQuery.eq('seller_id', filters.sellerId);
    }

    if (filters.dateFrom) {
      nextQuery = nextQuery.gte('created_at', normalizeDateToIso(filters.dateFrom));
    }

    if (filters.dateTo) {
      nextQuery = nextQuery.lte('created_at', normalizeDateToIso(filters.dateTo, true));
    }

    return nextQuery;
  };

  const getSaleBoardingLabel = (sale: Sale) => {
    if (!sale.trip_id && !sale.boarding_location_id) return 'Sem embarque — serviço avulso';
    // Usa a combinação evento + viagem + local para buscar o horário correto daquele embarque vendido.
    const key = `${sale.event_id}::${sale.trip_id}::${sale.boarding_location_id}`;
    return formatBoardingLocationLabel(sale.boarding_location?.name, boardingTimeMap[key]);
  };

  const fetchDetailedPage = async () => {
    const rangeFrom = (currentPage - 1) * rowsPerPage;
    const rangeTo = rangeFrom + rowsPerPage - 1;

    let query = supabase
      .from('sales')
      .select(`
        *,
        event:events(*),
        trip:trips(*, vehicle:vehicles(*)),
        boarding_location:boarding_locations(*),
        seller:sellers(*)
      `, { count: 'exact' })
      .order('created_at', { ascending: false });

    query = applySalesFilters(query);
    query = query.range(rangeFrom, rangeTo);

    const { data, error, count } = await query;

    if (error) {
      toast.error('Erro ao carregar vendas');
      setSales([]);
      setSeatLabelsMap({});
      setBoardingTimeMap({});
      setTotalResultsCount(0);
      return;
    }

    const paginatedSales = (data ?? []) as Sale[];
    setSales(paginatedSales);
    setTotalResultsCount(count ?? 0);

    const saleIds = paginatedSales.map((sale) => sale.id);
    if (saleIds.length === 0) {
      setSeatLabelsMap({});
      setBoardingTimeMap({});
      return;
    }

    let ticketQuery = supabase
      .from('tickets')
      .select('sale_id, seat_label')
      .in('sale_id', saleIds);

    if (activeCompanyId) {
      ticketQuery = ticketQuery.eq('company_id', activeCompanyId);
    }

    const { data: ticketData, error: ticketError } = await ticketQuery;
    if (ticketError) {
      console.error('Erro ao carregar poltronas para o relatório de vendas:', ticketError);
      setSeatLabelsMap({});
      setBoardingTimeMap({});
      return;
    }

    const map: Record<string, string[]> = {};
    (ticketData ?? []).forEach((ticket: { sale_id: string; seat_label: string | null }) => {
      if (!ticket.seat_label) return;
      if (!map[ticket.sale_id]) map[ticket.sale_id] = [];
      map[ticket.sale_id].push(ticket.seat_label);
    });
    setSeatLabelsMap(map);

    const eventIds = Array.from(new Set(paginatedSales.map((sale) => sale.event_id)));
    const tripIds = Array.from(new Set(paginatedSales.map((sale) => sale.trip_id)));
    const boardingLocationIds = Array.from(new Set(paginatedSales.map((sale) => sale.boarding_location_id)));

    let boardingQuery = supabase
      .from('event_boarding_locations')
      .select('event_id, trip_id, boarding_location_id, departure_time')
      .in('event_id', eventIds)
      .in('trip_id', tripIds)
      .in('boarding_location_id', boardingLocationIds);

    if (activeCompanyId) {
      boardingQuery = boardingQuery.eq('company_id', activeCompanyId);
    }

    const { data: boardingData, error: boardingError } = await boardingQuery;
    if (boardingError) {
      console.error('Erro ao carregar horários de embarque para o relatório de vendas:', boardingError);
      setBoardingTimeMap({});
      return;
    }

    const nextBoardingMap: Record<string, string | null> = {};
    (boardingData ?? []).forEach((boarding: { event_id: string; trip_id: string | null; boarding_location_id: string; departure_time: string | null }) => {
      const key = `${boarding.event_id}::${boarding.trip_id}::${boarding.boarding_location_id}`;
      // Mantém a primeira ocorrência para evitar sobrescrita desnecessária.
      if (!(key in nextBoardingMap)) nextBoardingMap[key] = boarding.departure_time ?? null;
    });

    paginatedSales.forEach((sale) => {
      const key = `${sale.event_id}::${sale.trip_id}::${sale.boarding_location_id}`;
      if (!(key in nextBoardingMap)) nextBoardingMap[key] = null;
    });

    setBoardingTimeMap(nextBoardingMap);
  };

  const fetchSummaryPage = async () => {
    const offset = (currentPage - 1) * rowsPerPage;
    const { data, error } = await supabase.rpc('get_sales_report_summary_paginated', {
      ...buildReportRpcParams(),
      p_limit: rowsPerPage,
      p_offset: offset,
    });

    if (error) {
      toast.error('Erro ao carregar resumo por evento');
      setSummaryRows([]);
      setTotalResultsCount(0);
      return;
    }

    const rawRows = (data ?? []) as SummaryPaginatedRow[];
    const parsedRows = rawRows.map((row) => ({
      eventId: row.event_id,
      eventName: row.event_name,
      eventDisplayName: formatEventDisplayName({ name: row.event_name, date: row.event_date }),
      totalSales: Number(row.total_sales ?? 0),
      paidSales: Number(row.paid_sales ?? 0),
      cancelledSales: Number(row.cancelled_sales ?? 0),
      grossRevenue: Number(row.gross_revenue ?? 0),
      platformFee: Number(row.platform_fee ?? 0),
      sellersCommission: Number(row.sellers_commission ?? 0),
    }));

    setSummaryRows(parsedRows);
    setTotalResultsCount(Number(rawRows[0]?.total_count ?? 0));
  };

  const fetchKpis = async () => {
    const { data, error } = await supabase.rpc('get_sales_report_kpis', buildReportRpcParams());

    if (error) {
      toast.error('Erro ao calcular indicadores do relatório');
      return;
    }

    const payload = (data?.[0] ?? {}) as Record<string, number>;
    setStats({
      totalSales: Number(payload.total_sales ?? 0),
      grossRevenue: Number(payload.gross_revenue ?? 0),
      paidSales: Number(payload.paid_sales ?? 0),
      cancelledSales: Number(payload.cancelled_sales ?? 0),
      platformFee: Number(payload.platform_fee ?? 0),
      sellersCommission: Number(payload.sellers_commission ?? 0),
    });
  };

  const fetchSales = async () => {
    setLoading(true);

    if (activeTab === SALES_REPORT_TABS.resumo) {
      setSales([]);
      setSeatLabelsMap({});
      await fetchSummaryPage();
    } else {
      setSummaryRows([]);
      await fetchDetailedPage();
    }

    setLoading(false);
  };

  const fetchFiltersData = async () => {
    if (!activeCompanyId) {
      setEvents([]);
      setSellers([]);
      return;
    }

    const [eventsRes, sellersRes] = await Promise.all([
      supabase
        .from('events')
        .select('id, name, date, city')
        .eq('company_id', activeCompanyId)
        .order('date', { ascending: false }),
      supabase
        .from('sellers')
        .select('id, name, short_code')
        .eq('company_id', activeCompanyId)
        .eq('status', 'ativo')
        .order('name'),
    ]);

    if (eventsRes.data) setEvents(eventsRes.data as EventFilterOption[]);
    if (sellersRes.data) setSellers(sellersRes.data as Seller[]);
  };

  useEffect(() => {
    fetchFiltersData();
  }, [activeCompanyId]);

  useEffect(() => {
    fetchSales();
  }, [activeCompanyId, activeTab, currentPage, rowsPerPage, filters]);

  useEffect(() => {
    fetchKpis();
  }, [activeCompanyId, filters]);

  useEffect(() => {
    // Sempre volta para a primeira página ao trocar filtros, tamanho da página ou tipo de visualização.
    setCurrentPage(1);
  }, [filters, rowsPerPage, activeTab]);

  const formatSeatLabels = (saleId: string) => {
    const labels = seatLabelsMap[saleId];
    if (!labels || labels.length === 0) return '—';

    // Ordena e remove duplicidade para manter saída estável entre tabela e exportações.
    const normalizedLabels = Array.from(new Set(labels)).sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }),
    );
    return normalizedLabels.join(', ');
  };

  const formatEventFilterLabel = (event: EventFilterOption) => {
    // Evita parse UTC de date-only (YYYY-MM-DD) que causa -1 dia em fuso BR.
    const eventDate = event.date ? formatDateOnlyBR(event.date) : '';
    return eventDate ? `${eventDate} - ${event.name}` : event.name;
  };

  const hasActiveFilters = useMemo(() => {
    return (
      filters.search !== '' ||
      filters.status !== 'all' ||
      filters.eventId !== 'all' ||
      filters.sellerId !== 'all' ||
      filters.dateFrom !== '' ||
      filters.dateTo !== ''
    );
  }, [filters]);

  // Conversão de select -> combobox com busca para escalar volume de dados,
  // seguindo o padrão oficial já usado em /admin/relatorios/comissao-vendedores e /admin/vendas.
  // A filtragem principal do relatório continua server-side; aqui aprimoramos apenas a seleção de filtros.
  const eventFilterOptions = useMemo(() => [
    { value: 'all', label: 'Todos' },
    ...events.map((event) => ({
      value: event.id,
      label: formatEventFilterLabel(event),
    })),
  ], [events]);

  const sellerFilterOptions = useMemo(() => [
    { value: 'all', label: 'Todos' },
    ...sellers.map((seller) => ({
      value: seller.id,
      label: seller.short_code ? `${seller.name} (${seller.short_code})` : seller.name,
    })),
  ], [sellers]);

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

  // KPI financeiro oficial: ticket médio considera somente vendas pagas.
  const ticketMedio = stats.paidSales > 0 ? stats.grossRevenue / stats.paidSales : 0;
  const cancelPercent = stats.totalSales > 0 ? (stats.cancelledSales / stats.totalSales) * 100 : 0;

  useEffect(() => {
    if (!eventFilterOpen) setEventFilterSearch('');
  }, [eventFilterOpen]);

  useEffect(() => {
    if (!sellerFilterOpen) setSellerFilterSearch('');
  }, [sellerFilterOpen]);

  const detailedFlatData = useMemo(() => {
    return sales.map((s) => {
      const vehicle = (s.trip as any)?.vehicle;
      return {
        created_at: s.created_at,
        // Exportações seguem o mesmo padrão visual da tabela para evitar divergência.
        event_name: formatEventDisplayName(s.event),
        vehicle_info: vehicle
          ? `${vehicleTypeLabels[vehicle.type] ?? vehicle.type} • ${vehicle.plate}`
          : '-',
        boarding_location_name: getSaleBoardingLabel(s),
        customer_name: s.customer_name,
        customer_cpf: s.customer_cpf,
        seller_name: s.seller?.name ?? '-',
        quantity: s.quantity,
        seat_labels: formatSeatLabels(s.id),
        unit_price: s.unit_price,
        total_value: s.gross_amount ?? s.quantity * s.unit_price,
        status: s.status,
        sale_id: s.id,
        // Exportação alinhada ao contrato oficial atual: o identificador do pagamento vem apenas do Asaas.
        payment_id: s.asaas_payment_id ?? '',
      };
    });
  }, [sales, seatLabelsMap, boardingTimeMap]);

  const summaryFlatData = useMemo(() => {
    return summaryRows.map((row) => ({
      event_name: row.eventDisplayName,
      total_sales: row.totalSales,
      paid_sales: row.paidSales,
      cancelled_sales: row.cancelledSales,
      gross_revenue: row.grossRevenue,
      platform_fee: row.platformFee,
      sellers_commission: row.sellersCommission,
    }));
  }, [summaryRows]);

  const detailedExportColumns: ExportColumn[] = [
    { key: 'created_at', label: 'Data da Compra', format: (v) => v ? format(parseISO(v), 'dd/MM/yy HH:mm', { locale: ptBR }) : '' },
    { key: 'event_name', label: 'Evento' },
    { key: 'vehicle_info', label: 'Veículo' },
    { key: 'boarding_location_name', label: 'Local Embarque' },
    { key: 'customer_name', label: 'Cliente' },
    { key: 'customer_cpf', label: 'CPF' },
    { key: 'seller_name', label: 'Vendedor' },
    { key: 'quantity', label: 'Qtd' },
    { key: 'seat_labels', label: 'Poltrona' },
    { key: 'unit_price', label: 'Valor Unit.', format: (v) => formatCurrencyBRL(Number(v)) },
    { key: 'total_value', label: 'Valor Total', format: (v) => formatCurrencyBRL(Number(v)) },
    { key: 'status', label: 'Status', format: (v) => statusLabels[v] ?? v },
    { key: 'sale_id', label: 'ID Venda' },
    { key: 'payment_id', label: 'ID Pagamento' },
  ];

  const summaryExportColumns: ExportColumn[] = [
    { key: 'event_name', label: 'Evento' },
    { key: 'total_sales', label: 'Nº de Vendas' },
    { key: 'paid_sales', label: 'Pagas' },
    { key: 'cancelled_sales', label: 'Canceladas' },
    ...(canViewFinancials
      ? [
          { key: 'gross_revenue', label: 'Receita Bruta (Pagas)', format: (v: any) => formatCurrencyBRL(Number(v)) },
          { key: 'platform_fee', label: 'Custo da Plataforma', format: (v: any) => formatCurrencyBRL(Number(v)) },
          { key: 'sellers_commission', label: 'Comissão dos Vendedores', format: (v: any) => formatCurrencyBRL(Number(v)) },
        ]
      : []),
  ];

  // Exporta conforme a aba ativa para manter consistência com a visualização atual.
  const isSummaryView = activeTab === SALES_REPORT_TABS.resumo;
  const exportColumns = isSummaryView ? summaryExportColumns : detailedExportColumns;
  const exportData = isSummaryView ? summaryFlatData : detailedFlatData;
  const exportStorageSuffix = isSummaryView ? 'resumo' : 'detalhado';
  const exportFileNameSuffix = isSummaryView ? 'resumo-evento' : 'detalhado-venda';
  const exportRecordCount = totalResultsCount;
  const totalPages = Math.max(1, Math.ceil(totalResultsCount / rowsPerPage));
  const rangeStart = totalResultsCount === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
  const rangeEnd = totalResultsCount === 0 ? 0 : Math.min(currentPage * rowsPerPage, totalResultsCount);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleCopyLink = (saleId: string) => {
    const url = `${window.location.origin}/confirmacao/${saleId}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copiado!');
  };

  const getSaleActions = (sale: Sale): ActionItem[] => [
    { label: 'Copiar Link', icon: Copy, onClick: () => handleCopyLink(sale.id) },
  ];

  const renderPagination = () => (
    <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>Exibindo {rangeStart}–{rangeEnd} de {totalResultsCount} resultados</span>
        <div className="flex items-center gap-2">
          <span>Linhas por página</span>
          <Select
            value={String(rowsPerPage)}
            onValueChange={(value) => setRowsPerPage(Number(value))}
          >
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
          title="Relatório de Vendas"
          description="Visão executiva e analítica das vendas do período"
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => { setLoading(true); fetchSales(); }}>
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
            <StatsCard label="Receita Bruta (Pagas)" value={formatCurrencyBRL(stats.grossRevenue)} icon={DollarSign} variant="success" />
          )}
          <StatsCard label="Vendas Geradas" value={stats.totalSales} icon={ShoppingCart} />
          <StatsCard label="Vendas Pagas" value={stats.paidSales} icon={CheckCircle} variant="success" />
          <StatsCard label="Ticket Médio" value={formatCurrencyBRL(ticketMedio)} icon={TrendingUp} />
          {/* Exibimos quantidade para manter semântica igual à tela /admin/vendas. */}
          <StatsCard label="Cancelamentos" value={stats.cancelledSales} icon={Percent} variant={cancelPercent > 10 ? 'destructive' : 'warning'} />
        </div>

        {canViewFinancials && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <StatsCard label="Custo da Plataforma" value={formatCurrencyBRL(stats.platformFee)} icon={DollarSign} />
            <StatsCard label="Comissão dos Vendedores" value={formatCurrencyBRL(stats.sellersCommission)} icon={Users} />
          </div>
        )}

        <div className="mb-6">
          <FilterCard
            searchValue={filters.search}
            onSearchChange={(v) => setFilters((f) => ({ ...f, search: v }))}
            searchPlaceholder="Buscar por nome ou CPF..."
            searchLabel="Cliente"
            selects={[
              {
                id: 'status',
                label: 'Status',
                placeholder: 'Todos',
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
            icon={<ShoppingCart className="h-8 w-8 text-muted-foreground" />}
            title="Nenhuma venda encontrada"
            description={hasActiveFilters ? 'Tente ajustar os filtros ou o período' : 'As vendas aparecerão aqui quando forem realizadas'}
          />
        ) : (
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SalesReportTab)}>
            <TabsList className="mb-4">
              <TabsTrigger value={SALES_REPORT_TABS.resumo} className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Resumo por Evento
              </TabsTrigger>
              <TabsTrigger value={SALES_REPORT_TABS.detalhado} className="gap-2">
                <List className="h-4 w-4" />
                Detalhado por Venda
              </TabsTrigger>
            </TabsList>

            <TabsContent value={SALES_REPORT_TABS.resumo}>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Evento</TableHead>
                        <TableHead className="text-center">Nº de Vendas</TableHead>
                        <TableHead className="text-center">Pagas</TableHead>
                        <TableHead className="text-center">Canceladas</TableHead>
                        {canViewFinancials && <TableHead className="text-right">Receita Bruta (Pagas)</TableHead>}
                        {canViewFinancials && <TableHead className="text-right">Custo da Plataforma</TableHead>}
                        {canViewFinancials && <TableHead className="text-right">Comissão dos Vendedores</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaryRows.map((row) => (
                        <TableRow key={row.eventId}>
                          <TableCell className="font-medium">{row.eventDisplayName}</TableCell>
                          <TableCell className="text-center">{row.totalSales}</TableCell>
                          <TableCell className="text-center">{row.paidSales}</TableCell>
                          <TableCell className="text-center">{row.cancelledSales}</TableCell>
                          {canViewFinancials && (
                            <TableCell className="text-right font-medium">{formatCurrencyBRL(row.grossRevenue)}</TableCell>
                          )}
                          {canViewFinancials && (
                            <TableCell className="text-right">{formatCurrencyBRL(row.platformFee)}</TableCell>
                          )}
                          {canViewFinancials && (
                            <TableCell className="text-right">{formatCurrencyBRL(row.sellersCommission)}</TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {renderPagination()}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value={SALES_REPORT_TABS.detalhado}>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data da Compra</TableHead>
                        <TableHead>Evento</TableHead>
                        <TableHead>Veículo</TableHead>
                        <TableHead>Local Embarque</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Vendedor</TableHead>
                        <TableHead className="text-center">Qtd</TableHead>
                        <TableHead className="w-[140px]">Poltrona</TableHead>
                        {canViewFinancials && <TableHead className="text-right">Valor Total</TableHead>}
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[60px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sales.map((sale) => {
                        const vehicle = (sale.trip as any)?.vehicle;
                        return (
                          <TableRow key={sale.id}>
                            <TableCell className="text-sm whitespace-nowrap">
                              {format(new Date(sale.created_at), 'dd/MM/yy HH:mm', { locale: ptBR })}
                            </TableCell>
                            <TableCell>{formatEventDisplayName(sale.event) || '-'}</TableCell>
                            <TableCell>
                              {!sale.trip_id && !sale.boarding_location_id
                                ? 'Venda de serviço avulsa'
                                : vehicle
                                ? `${vehicleTypeLabels[vehicle.type] ?? vehicle.type} • ${vehicle.plate}`
                                : '-'}
                            </TableCell>
                            <TableCell>{getSaleBoardingLabel(sale)}</TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{sale.customer_name}</p>
                                <p className="text-sm text-muted-foreground">{sale.customer_cpf}</p>
                              </div>
                            </TableCell>
                            <TableCell>{sale.seller?.name ?? '-'}</TableCell>
                            <TableCell className="text-center">{sale.quantity}</TableCell>
                            <TableCell>{formatSeatLabels(sale.id)}</TableCell>
                            {canViewFinancials && (
                              <TableCell className="text-right font-medium">
                                {formatCurrencyBRL((sale.quantity * sale.unit_price))}
                              </TableCell>
                            )}
                            <TableCell>
                              <StatusBadge status={sale.status} />
                            </TableCell>
                            <TableCell>
                              <ActionsDropdown actions={getSaleActions(sale)} />
                            </TableCell>
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
          storageKey={`sales-report-excel-${exportStorageSuffix}`}
          fileName={`relatorio-vendas-${exportFileNameSuffix}`}
          sheetName={isSummaryView ? 'Resumo por Evento' : 'Detalhado por Venda'}
        />
        <ExportPDFModal
          open={pdfModalOpen}
          onOpenChange={setPdfModalOpen}
          columns={exportColumns}
          data={exportData}
          storageKey={`sales-report-pdf-${exportStorageSuffix}`}
          fileName={`relatorio-vendas-${exportFileNameSuffix}`}
          title={isSummaryView ? 'Relatório de Vendas - Resumo por Evento' : 'Relatório de Vendas - Detalhado por Venda'}
          company={activeCompany}
          totalRecords={exportRecordCount}
        />
      </div>
    </AdminLayout>
  );
}
