import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  BarChart3,
  Calendar,
  DollarSign,
  FileSpreadsheet,
  FileText,
  Loader2,
  Percent,
  RefreshCw,
  Ticket,
  Wallet,
  List,
} from 'lucide-react';

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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrencyBRL } from '@/lib/currency';
import { formatDateOnlyBR } from '@/lib/date';
import { SaleStatus } from '@/types/database';
import { toast } from 'sonner';

interface EventFilters {
  search: string;
  eventStatus: 'all' | 'em_venda' | 'encerrado' | 'arquivado';
  period: '7d' | '30d' | 'custom';
  eventId: string;
  vehicleId: string;
  dateFrom: string;
  dateTo: string;
}

interface EventOption {
  id: string;
  name: string;
  date: string;
  status: string;
  is_archived: boolean;
}

interface VehicleOption {
  id: string;
  model: string | null;
  brand: string | null;
  plate: string;
}

interface SaleReportRow {
  id: string;
  created_at: string;
  status: SaleStatus;
  quantity: number;
  unit_price: number;
  gross_amount: number | null;
  platform_fee_total: number | null;
  customer_name: string;
  event?: { id: string; name: string; date: string; status: string; is_archived: boolean } | null;
  trip?: { id: string; capacity: number; vehicle?: { id: string; model: string | null; brand: string | null; plate: string } | null } | null;
  seller?: { name: string | null } | null;
}

interface SummaryByEventRow {
  key: string;
  eventName: string;
  eventDate: string;
  vehicleName: string;
  capacity: number;
  soldTickets: number;
  occupancy: number;
  grossRevenue: number;
  platformFee: number;
}

const initialFilters: EventFilters = {
  search: '',
  eventStatus: 'all',
  period: '30d',
  eventId: 'all',
  vehicleId: 'all',
  dateFrom: '',
  dateTo: '',
};

const REPORT_TABS = {
  resumo: 'resumo',
  detalhado: 'detalhado',
  ocupacao: 'ocupacao',
} as const;

type ReportTab = (typeof REPORT_TABS)[keyof typeof REPORT_TABS];

const getVehicleLabel = (trip?: SaleReportRow['trip']) => {
  if (!trip?.vehicle) return 'Sem veículo';
  const label = [trip.vehicle.brand, trip.vehicle.model].filter(Boolean).join(' ') || trip.vehicle.plate;
  return `${label} • ${trip.vehicle.plate}`;
};

const getSaleAmount = (sale: Pick<SaleReportRow, 'gross_amount' | 'quantity' | 'unit_price'>) => {
  if (sale.gross_amount && sale.gross_amount > 0) return Number(sale.gross_amount);
  return Number(sale.quantity) * Number(sale.unit_price);
};

export default function EventReport() {
  const { activeCompanyId, activeCompany, canViewFinancials } = useAuth();

  const [filters, setFilters] = useState<EventFilters>(initialFilters);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [sales, setSales] = useState<SaleReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ReportTab>(REPORT_TABS.resumo);
  const [excelModalOpen, setExcelModalOpen] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);

  const hasActiveFilters = useMemo(() => (
    filters.search.trim() !== ''
    || filters.eventStatus !== 'all'
    || filters.period !== '30d'
    || filters.eventId !== 'all'
    || filters.vehicleId !== 'all'
    || filters.dateFrom !== ''
    || filters.dateTo !== ''
  ), [filters]);

  const refreshReportData = async () => {
    if (!activeCompanyId) {
      setSales([]);
      setEvents([]);
      setVehicles([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Mantém o padrão dos relatórios administrativos com carregamento único e filtros em memória.
    const [eventsRes, vehiclesRes, salesRes] = await Promise.all([
      supabase
        .from('events')
        .select('id, name, date, status, is_archived')
        .eq('company_id', activeCompanyId)
        .order('date', { ascending: false }),
      supabase
        .from('vehicles')
        .select('id, model, brand, plate')
        .eq('company_id', activeCompanyId)
        .order('plate'),
      supabase
        .from('sales')
        .select(`
          id,
          created_at,
          status,
          quantity,
          unit_price,
          gross_amount,
          platform_fee_total,
          customer_name,
          seat_number,
          event:events!inner(id, name, date, status, is_archived),
          trip:trips(id, capacity, vehicle:vehicles(id, name, prefix, plate)),
          seller:sellers(name)
        `)
        .eq('company_id', activeCompanyId)
        .order('created_at', { ascending: false }),
    ]);

    if (eventsRes.error) toast.error('Erro ao carregar eventos');
    if (vehiclesRes.error) toast.error('Erro ao carregar veículos');
    if (salesRes.error) toast.error('Erro ao carregar vendas do relatório');

    setEvents((eventsRes.data ?? []) as EventOption[]);
    setVehicles((vehiclesRes.data ?? []) as VehicleOption[]);
    setSales((salesRes.data ?? []) as SaleReportRow[]);
    setLoading(false);
  };

  useEffect(() => {
    refreshReportData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId]);

  const filteredSales = useMemo(() => {
    const now = new Date();
    const customFrom = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`) : null;
    const customTo = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59`) : null;

    return sales.filter((sale) => {
      const event = sale.event;
      const trip = sale.trip;
      if (!event || !trip) return false;

      if (filters.search.trim()) {
        const term = filters.search.trim().toLowerCase();
        const searchPool = `${sale.id} ${event.name} ${sale.customer_name}`.toLowerCase();
        if (!searchPool.includes(term)) return false;
      }

      if (filters.eventStatus === 'em_venda' && (event.status !== 'a_venda' || event.is_archived)) return false;
      if (filters.eventStatus === 'encerrado' && (event.status !== 'encerrado' || event.is_archived)) return false;
      if (filters.eventStatus === 'arquivado' && !event.is_archived) return false;

      if (filters.eventId !== 'all' && event.id !== filters.eventId) return false;
      if (filters.vehicleId !== 'all' && trip.vehicle?.id !== filters.vehicleId) return false;

      const createdAt = new Date(sale.created_at);
      if (filters.period === '7d') {
        const limit = new Date(now);
        limit.setDate(now.getDate() - 7);
        if (createdAt < limit) return false;
      }

      if (filters.period === '30d') {
        const limit = new Date(now);
        limit.setDate(now.getDate() - 30);
        if (createdAt < limit) return false;
      }

      if (filters.period === 'custom') {
        if (customFrom && createdAt < customFrom) return false;
        if (customTo && createdAt > customTo) return false;
      }

      return true;
    });
  }, [sales, filters]);

  const summaryRows = useMemo<SummaryByEventRow[]>(() => {
    const grouped = new Map<string, SummaryByEventRow>();

    filteredSales.forEach((sale) => {
      if (!sale.event || !sale.trip) return;

      const key = `${sale.event.id}::${sale.trip.id}`;
      const row = grouped.get(key) ?? {
        key,
        eventName: sale.event.name,
        eventDate: sale.event.date,
        vehicleName: getVehicleLabel(sale.trip),
        capacity: Number(sale.trip.capacity ?? 0),
        soldTickets: 0,
        occupancy: 0,
        grossRevenue: 0,
        platformFee: 0,
      };

      const isSold = sale.status !== 'cancelado';
      if (isSold) {
        row.soldTickets += Number(sale.quantity);
        row.grossRevenue += getSaleAmount(sale);
        row.platformFee += Number(sale.platform_fee_total ?? 0);
      }

      row.occupancy = row.capacity > 0 ? Number(((row.soldTickets / row.capacity) * 100).toFixed(2)) : 0;
      grouped.set(key, row);
    });

    return Array.from(grouped.values()).sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
  }, [filteredSales]);

  const kpis = useMemo(() => {
    const eventsCount = new Set(summaryRows.map((row) => row.eventName)).size;
    const soldTickets = summaryRows.reduce((acc, row) => acc + row.soldTickets, 0);
    const grossRevenue = summaryRows.reduce((acc, row) => acc + row.grossRevenue, 0);
    const platformFee = summaryRows.reduce((acc, row) => acc + row.platformFee, 0);
    const netRevenue = grossRevenue - platformFee;
    const avgOccupancy = summaryRows.length
      ? summaryRows.reduce((acc, row) => acc + row.occupancy, 0) / summaryRows.length
      : 0;

    return { eventsCount, soldTickets, grossRevenue, platformFee, netRevenue, avgOccupancy };
  }, [summaryRows]);

  const occupancyRows = useMemo(() => summaryRows.map((row) => ({
    ...row,
    availableTickets: Math.max(0, row.capacity - row.soldTickets),
  })), [summaryRows]);

  const exportColumns = useMemo<ExportColumn[]>(() => {
    if (activeTab === REPORT_TABS.resumo) {
      return [
        { key: 'evento', header: 'Evento' },
        { key: 'data', header: 'Data' },
        { key: 'veiculo', header: 'Veículo' },
        { key: 'capacidade', header: 'Capacidade' },
        { key: 'passagens_vendidas', header: 'Passagens vendidas' },
        { key: 'ocupacao', header: 'Ocupação (%)' },
        { key: 'receita', header: 'Receita' },
      ];
    }

    if (activeTab === REPORT_TABS.detalhado) {
      return [
        { key: 'data_compra', header: 'Data da compra' },
        { key: 'evento', header: 'Evento' },
        { key: 'id_venda', header: 'ID da venda' },
        { key: 'passageiro', header: 'Passageiro' },
        { key: 'poltrona', header: 'Poltrona' },
        { key: 'vendedor', header: 'Vendedor' },
        { key: 'valor', header: 'Valor' },
        { key: 'status', header: 'Status' },
      ];
    }

    return [
      { key: 'evento', header: 'Evento' },
      { key: 'veiculo', header: 'Veículo' },
      { key: 'capacidade', header: 'Capacidade' },
      { key: 'passagens_vendidas', header: 'Passagens vendidas' },
      { key: 'passagens_disponiveis', header: 'Passagens disponíveis' },
      { key: 'ocupacao', header: 'Ocupação (%)' },
    ];
  }, [activeTab]);

  const exportData = useMemo<Record<string, string | number>[]>(() => {
    if (activeTab === REPORT_TABS.resumo) {
      return summaryRows.map((row) => ({
        evento: row.eventName,
        data: formatDateOnlyBR(row.eventDate),
        veiculo: row.vehicleName,
        capacidade: row.capacity,
        passagens_vendidas: row.soldTickets,
        ocupacao: `${row.occupancy.toFixed(2)}%`,
        receita: formatCurrencyBRL(row.grossRevenue),
      }));
    }

    if (activeTab === REPORT_TABS.detalhado) {
      return filteredSales.map((sale) => ({
        data_compra: format(new Date(sale.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
        evento: sale.event?.name ?? '-',
        id_venda: sale.id,
        passageiro: sale.customer_name,
        poltrona: sale.seat_number ?? '-',
        vendedor: sale.seller?.name ?? 'Sem vendedor',
        valor: formatCurrencyBRL(getSaleAmount(sale)),
        status: sale.status,
      }));
    }

    return occupancyRows.map((row) => ({
      evento: row.eventName,
      veiculo: row.vehicleName,
      capacidade: row.capacity,
      passagens_vendidas: row.soldTickets,
      passagens_disponiveis: row.availableTickets,
      ocupacao: `${row.occupancy.toFixed(2)}%`,
    }));
  }, [activeTab, filteredSales, summaryRows, occupancyRows]);

  const periodLabel = filters.period === '7d'
    ? 'Últimos 7 dias'
    : filters.period === '30d'
      ? 'Últimos 30 dias'
      : `${filters.dateFrom || '-'} até ${filters.dateTo || '-'}`;

  return (
    <AdminLayout>
      <div className="page-container">
        <PageHeader
          title="Relatório por Evento"
          description="Análise gerencial de desempenho dos eventos: vendas, ocupação e receita."
          actions={(
            <>
              <Button variant="outline" size="sm" onClick={refreshReportData}>
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
          )}
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <StatsCard label="Eventos analisados" value={kpis.eventsCount} icon={Calendar} />
          <StatsCard label="Passagens vendidas" value={kpis.soldTickets} icon={Ticket} />
          <StatsCard label="Receita bruta" value={canViewFinancials ? formatCurrencyBRL(kpis.grossRevenue) : '—'} icon={DollarSign} variant="success" />
          <StatsCard label="Taxa da plataforma" value={canViewFinancials ? formatCurrencyBRL(kpis.platformFee) : '—'} icon={Percent} />
          <StatsCard label="Receita líquida" value={canViewFinancials ? formatCurrencyBRL(kpis.netRevenue) : '—'} icon={Wallet} variant="success" />
          <StatsCard label="Ocupação média" value={`${kpis.avgOccupancy.toFixed(2)}%`} icon={BarChart3} />
        </div>

        <div className="mb-6">
          <FilterCard
            searchValue={filters.search}
            onSearchChange={(value) => setFilters((prev) => ({ ...prev, search: value }))}
            searchPlaceholder="Buscar por evento, venda ou passageiro..."
            searchLabel="Busca"
            selects={[
              {
                id: 'status-evento',
                label: 'Status do evento',
                placeholder: 'Todos',
                value: filters.eventStatus,
                onChange: (value) => setFilters((prev) => ({ ...prev, eventStatus: value as EventFilters['eventStatus'] })),
                options: [
                  { value: 'all', label: 'Todos' },
                  { value: 'em_venda', label: 'Em venda' },
                  { value: 'encerrado', label: 'Encerrado' },
                  { value: 'arquivado', label: 'Arquivado' },
                ],
              },
              {
                id: 'periodo',
                label: 'Período',
                placeholder: 'Últimos 30 dias',
                value: filters.period,
                onChange: (value) => setFilters((prev) => ({ ...prev, period: value as EventFilters['period'] })),
                options: [
                  { value: '7d', label: 'Últimos 7 dias' },
                  { value: '30d', label: 'Últimos 30 dias' },
                  { value: 'custom', label: 'Período personalizado' },
                ],
              },
            ]}
            mainFilters={(
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">Evento</label>
                  <Select
                    value={filters.eventId}
                    onValueChange={(value) => setFilters((prev) => ({ ...prev, eventId: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {events.map((event) => (
                        <SelectItem key={event.id} value={event.id}>
                          {`${formatDateOnlyBR(event.date)} - ${event.name}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">Veículo</label>
                  <Select
                    value={filters.vehicleId}
                    onValueChange={(value) => setFilters((prev) => ({ ...prev, vehicleId: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {vehicles.map((vehicle) => (
                        <SelectItem key={vehicle.id} value={vehicle.id}>
                          {`${vehicle.name}${vehicle.prefix ? ` • ${vehicle.prefix}` : ''}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            advancedFilters={filters.period === 'custom' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FilterInput
                  id="data-inicial"
                  label="Data inicial"
                  placeholder=""
                  type="date"
                  value={filters.dateFrom}
                  onChange={(value) => setFilters((prev) => ({ ...prev, dateFrom: value }))}
                />
                <FilterInput
                  id="data-final"
                  label="Data final"
                  placeholder=""
                  type="date"
                  value={filters.dateTo}
                  onChange={(value) => setFilters((prev) => ({ ...prev, dateTo: value }))}
                />
              </div>
            ) : null}
            onClearFilters={() => setFilters(initialFilters)}
            hasActiveFilters={hasActiveFilters}
          />
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-16 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : filteredSales.length === 0 ? (
          <EmptyState
            title="Nenhum registro encontrado"
            description="Ajuste os filtros para visualizar os dados do relatório por evento."
          />
        ) : (
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ReportTab)} className="space-y-4">
            <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3">
              <TabsTrigger value={REPORT_TABS.resumo} className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Resumo por Evento
              </TabsTrigger>
              <TabsTrigger value={REPORT_TABS.detalhado} className="gap-2">
                <List className="h-4 w-4" />
                Detalhado por Venda
              </TabsTrigger>
              <TabsTrigger value={REPORT_TABS.ocupacao} className="gap-2">
                <Ticket className="h-4 w-4" />
                Ocupação do Evento
              </TabsTrigger>
            </TabsList>

            <TabsContent value={REPORT_TABS.resumo}>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Evento</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Veículo</TableHead>
                        <TableHead className="text-center">Capacidade</TableHead>
                        <TableHead className="text-center">Passagens vendidas</TableHead>
                        <TableHead className="text-center">Ocupação (%)</TableHead>
                        <TableHead className="text-right">Receita</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaryRows.map((row) => (
                        <TableRow key={row.key}>
                          <TableCell className="font-medium">{row.eventName}</TableCell>
                          <TableCell>{formatDateOnlyBR(row.eventDate)}</TableCell>
                          <TableCell>{row.vehicleName}</TableCell>
                          <TableCell className="text-center">{row.capacity}</TableCell>
                          <TableCell className="text-center">{row.soldTickets}</TableCell>
                          <TableCell className="text-center">{row.occupancy.toFixed(2)}%</TableCell>
                          <TableCell className="text-right">{formatCurrencyBRL(row.grossRevenue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
                        <TableHead>Passageiro</TableHead>
                        <TableHead>Poltrona</TableHead>
                        <TableHead>Vendedor</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSales.map((sale) => (
                        <TableRow key={sale.id}>
                          <TableCell>{format(new Date(sale.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</TableCell>
                          <TableCell>{sale.event?.name ?? '-'}</TableCell>
                          <TableCell className="font-mono text-xs">{sale.id.slice(0, 8)}…</TableCell>
                          <TableCell>{sale.customer_name}</TableCell>
                          <TableCell>{sale.seat_number ?? '-'}</TableCell>
                          <TableCell>{sale.seller?.name ?? 'Sem vendedor'}</TableCell>
                          <TableCell className="text-right">{formatCurrencyBRL(getSaleAmount(sale))}</TableCell>
                          <TableCell><StatusBadge status={sale.status} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value={REPORT_TABS.ocupacao}>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Evento</TableHead>
                        <TableHead>Veículo</TableHead>
                        <TableHead className="text-center">Capacidade</TableHead>
                        <TableHead className="text-center">Passagens vendidas</TableHead>
                        <TableHead className="text-center">Passagens disponíveis</TableHead>
                        <TableHead className="text-center">Ocupação (%)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {occupancyRows.map((row) => (
                        <TableRow key={`ocupacao-${row.key}`}>
                          <TableCell className="font-medium">{row.eventName}</TableCell>
                          <TableCell>{row.vehicleName}</TableCell>
                          <TableCell className="text-center">{row.capacity}</TableCell>
                          <TableCell className="text-center">{row.soldTickets}</TableCell>
                          <TableCell className="text-center">{row.availableTickets}</TableCell>
                          <TableCell className="text-center">{row.occupancy.toFixed(2)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
          storageKey={`event-report-excel-${activeTab}`}
          fileName={`relatorio-eventos-${activeTab}`}
          sheetName={activeTab === REPORT_TABS.resumo ? 'Resumo por Evento' : activeTab === REPORT_TABS.detalhado ? 'Detalhado por Venda' : 'Ocupacao do Evento'}
        />
        <ExportPDFModal
          open={pdfModalOpen}
          onOpenChange={setPdfModalOpen}
          columns={exportColumns}
          data={exportData}
          storageKey={`event-report-pdf-${activeTab}`}
          fileName={`relatorio-eventos-${activeTab}`}
          title={activeTab === REPORT_TABS.resumo ? 'Relatório por Evento - Resumo por Evento' : activeTab === REPORT_TABS.detalhado ? 'Relatório por Evento - Detalhado por Venda' : 'Relatório por Evento - Ocupação do Evento'}
          company={activeCompany}
          totalRecords={exportData.length}
          periodLabel={periodLabel}
        />
      </div>
    </AdminLayout>
  );
}
