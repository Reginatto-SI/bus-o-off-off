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
  XCircle,
  TrendingUp,
  Percent,
  Users,
  Calendar,
  Copy,
  BarChart3,
  List,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';

// ── Types ──
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
  totalSales: number;
  paidSales: number;
  cancelledSales: number;
  grossRevenue: number;
  platformFee: number;
  sellersCommission: number;
}

const vehicleTypeLabels: Record<string, string> = {
  onibus: 'Ônibus',
  micro_onibus: 'Micro-ônibus',
  van: 'Van',
};

const statusLabels: Record<string, string> = {
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

// ── Component ──
export default function SalesReport() {
  const { canViewFinancials, activeCompanyId, activeCompany } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [events, setEvents] = useState<EventFilterOption[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ReportFilters>(initialFilters);
  const [activeTab, setActiveTab] = useState<SalesReportTab>(SALES_REPORT_TABS.resumo);

  // Export modals
  const [excelModalOpen, setExcelModalOpen] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);

  // ── Fetch ──
  const fetchSales = async () => {
    setLoading(true);
    let query = supabase
      .from('sales')
      .select(`
        *,
        event:events(*),
        trip:trips(*, vehicle:vehicles(*)),
        boarding_location:boarding_locations(*),
        seller:sellers(*)
      `)
      .order('created_at', { ascending: false });

    if (activeCompanyId) {
      query = query.eq('company_id', activeCompanyId);
    }

    const { data, error } = await query;

    if (error) {
      toast.error('Erro ao carregar vendas');
    } else {
      setSales((data ?? []) as Sale[]);
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
        .select('id, name')
        .eq('company_id', activeCompanyId)
        .eq('status', 'ativo')
        .order('name'),
    ]);

    if (eventsRes.data) setEvents(eventsRes.data as EventFilterOption[]);
    if (sellersRes.data) setSellers(sellersRes.data as Seller[]);
  };

  useEffect(() => {
    fetchSales();
    fetchFiltersData();
  }, [activeCompanyId]);

  const formatEventFilterLabel = (event: EventFilterOption) => {
    const eventDate = event.date ? format(parseISO(event.date), 'dd/MM/yyyy') : '';
    return eventDate ? `${eventDate} - ${event.name}` : event.name;
  };

  // ── Filtered ──
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      if (filters.search) {
        const s = filters.search.toLowerCase();
        const match =
          sale.customer_name.toLowerCase().includes(s) ||
          sale.customer_cpf.toLowerCase().includes(s);
        if (!match) return false;
      }
      if (filters.status !== 'all' && sale.status !== filters.status) return false;
      if (filters.eventId !== 'all' && sale.event_id !== filters.eventId) return false;
      if (filters.sellerId !== 'all' && sale.seller_id !== filters.sellerId) return false;
      if (filters.dateFrom) {
        const from = new Date(filters.dateFrom);
        if (new Date(sale.created_at) < from) return false;
      }
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(sale.created_at) > to) return false;
      }
      return true;
    });
  }, [sales, filters]);

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

  // ── KPIs ──
  const stats = useMemo(() => {
    const total = filteredSales.length;
    const grossRevenue = filteredSales.reduce((sum, s) => sum + (s.gross_amount ?? s.quantity * s.unit_price), 0);
    const pagas = filteredSales.filter((s) => s.status === 'pago').length;
    const canceladas = filteredSales.filter((s) => s.status === 'cancelado').length;
    const ticketMedio = total > 0 ? grossRevenue / total : 0;
    const cancelPercent = total > 0 ? (canceladas / total) * 100 : 0;

    const paidSales = filteredSales.filter((s) => s.status === 'pago');
    const platformFee = paidSales.reduce((sum, s) => sum + (s.platform_fee_total ?? 0), 0);
    const sellersCommission = paidSales.reduce((sum, sale) => {
      const saleGross = sale.gross_amount ?? sale.quantity * sale.unit_price;
      const sellerCommissionPercent = sale.seller?.commission_percent ?? 0;
      return sum + (saleGross * sellerCommissionPercent) / 100;
    }, 0);

    return { total, grossRevenue, pagas, canceladas, ticketMedio, cancelPercent, platformFee, sellersCommission };
  }, [filteredSales]);

  // ── Event summary ──
  const eventSummary = useMemo((): EventSummaryRow[] => {
    const map = new Map<string, EventSummaryRow>();

    filteredSales.forEach((sale) => {
      const eventId = sale.event_id;
      const eventName = sale.event?.name ?? 'Evento desconhecido';
      const existing = map.get(eventId) ?? {
        eventId,
        eventName,
        totalSales: 0,
        paidSales: 0,
        cancelledSales: 0,
        grossRevenue: 0,
        platformFee: 0,
        sellersCommission: 0,
      };

      existing.totalSales += 1;
      existing.grossRevenue += sale.gross_amount ?? sale.quantity * sale.unit_price;
      if (sale.status === 'pago') {
        existing.paidSales += 1;
        existing.platformFee += sale.platform_fee_total ?? 0;
        const sellerCommissionPercent = sale.seller?.commission_percent ?? 0;
        existing.sellersCommission += ((sale.gross_amount ?? sale.quantity * sale.unit_price) * sellerCommissionPercent) / 100;
      }
      if (sale.status === 'cancelado') existing.cancelledSales += 1;

      map.set(eventId, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.grossRevenue - a.grossRevenue);
  }, [filteredSales]);

  // ── Flat data for detailed export ──
  const detailedFlatData = useMemo(() => {
    return filteredSales.map((s) => {
      const vehicle = (s.trip as any)?.vehicle;
      return {
        created_at: s.created_at,
        event_name: s.event?.name ?? '',
        vehicle_info: vehicle
          ? `${vehicleTypeLabels[vehicle.type] ?? vehicle.type} • ${vehicle.plate}`
          : '-',
        boarding_location_name: s.boarding_location?.name ?? '',
        customer_name: s.customer_name,
        customer_cpf: s.customer_cpf,
        seller_name: s.seller?.name ?? '-',
        quantity: s.quantity,
        unit_price: s.unit_price,
        total_value: s.gross_amount ?? s.quantity * s.unit_price,
        status: s.status,
        sale_id: s.id,
        payment_id: s.stripe_payment_intent_id ?? '',
      };
    });
  }, [filteredSales]);

  // ── Summary flat data for PDF ──
  const summaryFlatData = useMemo(() => {
    return eventSummary.map((row) => ({
      event_name: row.eventName,
      total_sales: row.totalSales,
      paid_sales: row.paidSales,
      cancelled_sales: row.cancelledSales,
      gross_revenue: row.grossRevenue,
      platform_fee: row.platformFee,
      sellers_commission: row.sellersCommission,
    }));
  }, [eventSummary]);

  // ── Export columns ──
  const detailedExportColumns: ExportColumn[] = [
    { key: 'created_at', label: 'Data/Hora', format: (v) => v ? format(parseISO(v), 'dd/MM/yy HH:mm', { locale: ptBR }) : '' },
    { key: 'event_name', label: 'Evento' },
    { key: 'vehicle_info', label: 'Veículo' },
    { key: 'boarding_location_name', label: 'Local Embarque' },
    { key: 'customer_name', label: 'Cliente' },
    { key: 'customer_cpf', label: 'CPF' },
    { key: 'seller_name', label: 'Vendedor' },
    { key: 'quantity', label: 'Qtd' },
    { key: 'unit_price', label: 'Valor Unit.', format: (v) => `R$ ${Number(v).toFixed(2)}` },
    { key: 'total_value', label: 'Valor Total', format: (v) => `R$ ${Number(v).toFixed(2)}` },
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
          { key: 'gross_revenue', label: 'Receita Bruta', format: (v: any) => `R$ ${Number(v).toFixed(2)}` },
          { key: 'platform_fee', label: 'Custo da Plataforma', format: (v: any) => `R$ ${Number(v).toFixed(2)}` },
          { key: 'sellers_commission', label: 'Comissão dos Vendedores', format: (v: any) => `R$ ${Number(v).toFixed(2)}` },
        ]
      : []),
  ];


  // Exporta conforme a aba ativa para manter consistência com a visualização atual.
  const isSummaryView = activeTab === SALES_REPORT_TABS.resumo;
  const exportColumns = isSummaryView ? summaryExportColumns : detailedExportColumns;
  const exportData = isSummaryView ? summaryFlatData : detailedFlatData;
  const exportStorageSuffix = isSummaryView ? 'resumo' : 'detalhado';
  const exportFileNameSuffix = isSummaryView ? 'resumo-evento' : 'detalhado-venda';
  const exportRecordCount = exportData.length;

  // ── Copy link ──
  const handleCopyLink = (saleId: string) => {
    const url = `${window.location.origin}/confirmacao/${saleId}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copiado!');
  };

  const getSaleActions = (sale: Sale): ActionItem[] => [
    { label: 'Copiar Link', icon: Copy, onClick: () => handleCopyLink(sale.id) },
  ];

  // ── Render ──
  return (
    <AdminLayout>
      <div className="page-container">
        {/* Header */}
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

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          {canViewFinancials && (
            <StatsCard label="Receita Bruta" value={`R$ ${stats.grossRevenue.toFixed(2)}`} icon={DollarSign} variant="success" />
          )}
          <StatsCard label="Total de Vendas" value={stats.total} icon={ShoppingCart} />
          <StatsCard label="Vendas Pagas" value={stats.pagas} icon={CheckCircle} variant="success" />
          <StatsCard label="Ticket Médio" value={`R$ ${stats.ticketMedio.toFixed(2)}`} icon={TrendingUp} />
          {/* Exibimos quantidade para manter semântica igual à tela /admin/vendas. */}
          <StatsCard label="Cancelamentos" value={stats.canceladas} icon={Percent} variant={stats.cancelPercent > 10 ? 'destructive' : 'warning'} />
        </div>

        {canViewFinancials && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <StatsCard label="Custo da Plataforma" value={`R$ ${stats.platformFee.toFixed(2)}`} icon={DollarSign} />
            <StatsCard label="Comissão dos Vendedores" value={`R$ ${stats.sellersCommission.toFixed(2)}`} icon={Users} />
          </div>
        )}

        {/* Filters */}
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
                  { value: 'reservado', label: 'Reservado' },
                  { value: 'pago', label: 'Pago' },
                  { value: 'cancelado', label: 'Cancelado' },
                ],
              },
              {
                id: 'event',
                label: 'Evento',
                placeholder: 'Todos',
                value: filters.eventId,
                onChange: (v) => setFilters((f) => ({ ...f, eventId: v })),
                options: [
                  { value: 'all', label: 'Todos' },
                  ...events.map((e) => ({ value: e.id, label: formatEventFilterLabel(e) })),
                ],
              },
              {
                id: 'seller',
                label: 'Vendedor',
                placeholder: 'Todos',
                value: filters.sellerId,
                onChange: (v) => setFilters((f) => ({ ...f, sellerId: v })),
                options: [
                  { value: 'all', label: 'Todos' },
                  ...sellers.map((s) => ({ value: s.id, label: s.name })),
                ],
              },
            ]}
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

        {/* Content Tabs */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredSales.length === 0 ? (
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

            {/* Tab: Resumo por Evento */}
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
                        {canViewFinancials && <TableHead className="text-right">Receita Bruta</TableHead>}
                        {canViewFinancials && <TableHead className="text-right">Custo da Plataforma</TableHead>}
                        {canViewFinancials && <TableHead className="text-right">Comissão dos Vendedores</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {eventSummary.map((row) => (
                        <TableRow key={row.eventId}>
                          <TableCell className="font-medium">{row.eventName}</TableCell>
                          <TableCell className="text-center">{row.totalSales}</TableCell>
                          <TableCell className="text-center">{row.paidSales}</TableCell>
                          <TableCell className="text-center">{row.cancelledSales}</TableCell>
                          {canViewFinancials && (
                            <TableCell className="text-right font-medium">R$ {row.grossRevenue.toFixed(2)}</TableCell>
                          )}
                          {canViewFinancials && (
                            <TableCell className="text-right">R$ {row.platformFee.toFixed(2)}</TableCell>
                          )}
                          {canViewFinancials && (
                            <TableCell className="text-right">R$ {row.sellersCommission.toFixed(2)}</TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab: Detalhado por Venda */}
            <TabsContent value={SALES_REPORT_TABS.detalhado}>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data/Hora</TableHead>
                        <TableHead>Evento</TableHead>
                        <TableHead>Veículo</TableHead>
                        <TableHead>Local Embarque</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Vendedor</TableHead>
                        <TableHead className="text-center">Qtd</TableHead>
                        {canViewFinancials && <TableHead className="text-right">Valor Unit.</TableHead>}
                        {canViewFinancials && <TableHead className="text-right">Valor Total</TableHead>}
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[60px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSales.map((sale) => {
                        const vehicle = (sale.trip as any)?.vehicle;
                        return (
                          <TableRow key={sale.id}>
                            <TableCell className="text-sm whitespace-nowrap">
                              {format(new Date(sale.created_at), 'dd/MM/yy HH:mm', { locale: ptBR })}
                            </TableCell>
                            <TableCell>{sale.event?.name ?? '-'}</TableCell>
                            <TableCell>
                              {vehicle
                                ? `${vehicleTypeLabels[vehicle.type] ?? vehicle.type} • ${vehicle.plate}`
                                : '-'}
                            </TableCell>
                            <TableCell>{sale.boarding_location?.name ?? '-'}</TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{sale.customer_name}</p>
                                <p className="text-sm text-muted-foreground">{sale.customer_cpf}</p>
                              </div>
                            </TableCell>
                            <TableCell>{sale.seller?.name ?? '-'}</TableCell>
                            <TableCell className="text-center">{sale.quantity}</TableCell>
                            {canViewFinancials && (
                              <TableCell className="text-right">R$ {Number(sale.unit_price).toFixed(2)}</TableCell>
                            )}
                            {canViewFinancials && (
                              <TableCell className="text-right font-medium">
                                R$ {(sale.quantity * sale.unit_price).toFixed(2)}
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
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* Export Modals */}
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
