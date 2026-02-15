import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sale, SaleStatus, SaleLog, TicketRecord, Seller } from '@/types/database';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  ShoppingCart,
  Loader2,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  DollarSign,
  CheckCircle,
  Clock,
  XCircle,
  Eye,
  Pencil,
  Ban,
  Copy,
  ArrowUpDown,
  Users,
  History,
  Calendar,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';

// ── Types ──
interface SalesFilters {
  search: string;
  status: 'all' | SaleStatus;
  eventId: string;
  sellerId: string;
  dateFrom: string;
  dateTo: string;
}

interface SalesEventFilterOption {
  id: string;
  name: string;
  date: string;
  city: string | null;
}

const initialFilters: SalesFilters = {
  search: '',
  status: 'all',
  eventId: 'all',
  sellerId: 'all',
  dateFrom: '',
  dateTo: '',
};

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

// ── Component ──
export default function Sales() {
  const { isGerente, canViewFinancials, activeCompanyId, activeCompany, user } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [events, setEvents] = useState<SalesEventFilterOption[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<SalesFilters>(initialFilters);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);

  // Detail modal
  const [detailSale, setDetailSale] = useState<Sale | null>(null);
  const [detailTickets, setDetailTickets] = useState<TicketRecord[]>([]);
  const [detailLogs, setDetailLogs] = useState<SaleLog[]>([]);
  const [detailBoardingDepartureTime, setDetailBoardingDepartureTime] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Edit passenger modal
  const [editingTicket, setEditingTicket] = useState<TicketRecord | null>(null);
  const [editPassengerName, setEditPassengerName] = useState('');
  const [editPassengerCpf, setEditPassengerCpf] = useState('');
  const [savingPassenger, setSavingPassenger] = useState(false);

  // Cancel modal
  const [cancelSale, setCancelSale] = useState<Sale | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // ── Export columns ──
  const exportColumns: ExportColumn[] = [
    { key: 'created_at', label: 'Data', format: (v) => v ? format(parseISO(v), 'dd/MM/yy HH:mm', { locale: ptBR }) : '' },
    { key: 'event_name', label: 'Evento' },
    { key: 'customer_name', label: 'Cliente' },
    { key: 'customer_cpf', label: 'CPF' },
    { key: 'customer_phone', label: 'Telefone' },
    { key: 'vehicle_info', label: 'Veículo' },
    { key: 'boarding_location_name', label: 'Local Embarque' },
    { key: 'quantity', label: 'Quantidade' },
    { key: 'total_value', label: 'Valor Total', format: (v) => `R$ ${Number(v).toFixed(2)}` },
    { key: 'seller_name', label: 'Vendedor' },
    { key: 'status', label: 'Status', format: (v) => statusLabels[v] ?? v },
  ];

  // ── Fetch ──
  const fetchSales = async () => {
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
      // Correção: o filtro de Evento deve usar exclusivamente a entidade events da empresa ativa.
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

    if (eventsRes.data) setEvents(eventsRes.data as SalesEventFilterOption[]);
    if (sellersRes.data) setSellers(sellersRes.data as Seller[]);
  };

  useEffect(() => {
    fetchSales();
    fetchFiltersData();
  }, [activeCompanyId]);

  const formatEventFilterLabel = (event: SalesEventFilterOption) => {
    const eventDate = event.date ? format(parseISO(event.date), 'dd/MM/yyyy') : '';
    // Padronização solicitada no suporte: dropdown de Evento deve priorizar data no início.
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

  // ── Stats ──
  const stats = useMemo(() => {
    const total = filteredSales.length;
    const totalValue = filteredSales.reduce((sum, s) => sum + s.quantity * s.unit_price, 0);
    const pagas = filteredSales.filter((s) => s.status === 'pago').length;
    const reservadas = filteredSales.filter((s) => s.status === 'reservado').length;
    const canceladas = filteredSales.filter((s) => s.status === 'cancelado').length;
    // KPIs financeiros de comissão (somente vendas pagas com dados)
    const paidSales = filteredSales.filter((s) => s.status === 'pago');
    const totalPlatformFee = paidSales.reduce((sum, s) => sum + (s.platform_fee_total ?? 0), 0);
    const totalPartnerFee = paidSales.reduce((sum, s) => sum + (s.partner_fee_amount ?? 0), 0);
    const totalPlatformNet = paidSales.reduce((sum, s) => sum + (s.platform_net_amount ?? 0), 0);
    return { total, totalValue, pagas, reservadas, canceladas, totalPlatformFee, totalPartnerFee, totalPlatformNet };
  }, [filteredSales]);

  // ── Flat data for export ──
  const flatData = useMemo(() => {
    return filteredSales.map((s) => {
      const vehicle = (s.trip as any)?.vehicle;
      return {
        created_at: s.created_at,
        event_name: s.event?.name ?? '',
        customer_name: s.customer_name,
        customer_cpf: s.customer_cpf,
        customer_phone: s.customer_phone,
        vehicle_info: vehicle
          ? `${vehicleTypeLabels[vehicle.type] ?? vehicle.type} • ${vehicle.plate}`
          : '-',
        boarding_location_name: s.boarding_location?.name ?? '',
        quantity: s.quantity,
        total_value: s.quantity * s.unit_price,
        seller_name: s.seller?.name ?? '-',
        status: s.status,
      };
    });
  }, [filteredSales]);

  // ── Detail modal ──
  const openDetail = async (sale: Sale) => {
    setDetailSale(sale);
    setDetailLoading(true);
    const [ticketsRes, logsRes, boardingRes] = await Promise.all([
      supabase.from('tickets').select('*').eq('sale_id', sale.id).order('seat_label'),
      supabase.from('sale_logs').select('*').eq('sale_id', sale.id).order('created_at', { ascending: false }),
      supabase
        .from('event_boarding_locations')
        .select('departure_time')
        .eq('event_id', sale.event_id)
        .eq('trip_id', sale.trip_id)
        // Fonte de verdade: usa o local escolhido na venda (sales.boarding_location_id).
        .eq('boarding_location_id', sale.boarding_location_id)
        .maybeSingle(),
    ]);
    setDetailTickets((ticketsRes.data ?? []) as TicketRecord[]);
    setDetailLogs((logsRes.data ?? []) as SaleLog[]);
    setDetailBoardingDepartureTime(boardingRes.data?.departure_time ?? null);
    setDetailLoading(false);
  };

  // ── Edit passenger ──
  const openEditPassenger = (ticket: TicketRecord) => {
    setEditingTicket(ticket);
    setEditPassengerName(ticket.passenger_name);
    setEditPassengerCpf(ticket.passenger_cpf);
  };

  const handleSavePassenger = async () => {
    if (!editingTicket || !detailSale) return;
    if (!editPassengerName.trim()) {
      toast.error('Informe o nome do passageiro');
      return;
    }
    const cpfClean = editPassengerCpf.replace(/\D/g, '');
    if (cpfClean.length !== 11) {
      toast.error('CPF inválido (11 dígitos)');
      return;
    }

    setSavingPassenger(true);
    const oldName = editingTicket.passenger_name;
    const oldCpf = editingTicket.passenger_cpf;

    const { error } = await supabase
      .from('tickets')
      .update({ passenger_name: editPassengerName.trim(), passenger_cpf: cpfClean })
      .eq('id', editingTicket.id);

    if (error) {
      toast.error('Erro ao atualizar passageiro');
    } else {
      // Log
      if (activeCompanyId && user) {
        const changes: string[] = [];
        if (oldName !== editPassengerName.trim()) changes.push(`Nome: ${oldName} → ${editPassengerName.trim()}`);
        if (oldCpf !== cpfClean) changes.push(`CPF: ${oldCpf} → ${cpfClean}`);
        await supabase.from('sale_logs').insert({
          sale_id: detailSale.id,
          action: 'passageiro_editado',
          description: `Passageiro editado (Assento ${editingTicket.seat_label}): ${changes.join(', ')}`,
          old_value: `${oldName} / ${oldCpf}`,
          new_value: `${editPassengerName.trim()} / ${cpfClean}`,
          performed_by: user.id,
          company_id: activeCompanyId,
        });
      }
      toast.success('Passageiro atualizado');
      setEditingTicket(null);
      openDetail(detailSale); // refresh
    }
    setSavingPassenger(false);
  };

  // ── Cancel sale ──
  const handleCancelSale = async () => {
    if (!cancelSale || !user || !activeCompanyId) return;
    if (!cancelReason.trim()) {
      toast.error('Informe o motivo do cancelamento');
      return;
    }

    setCancelling(true);

    // Check boarding status
    const { data: tickets } = await supabase
      .from('tickets')
      .select('id, boarding_status')
      .eq('sale_id', cancelSale.id);

    const hasBoarded = tickets?.some((t) => t.boarding_status !== 'pendente');
    if (hasBoarded) {
      toast.error('Não é possível cancelar: há passageiros já embarcados');
      setCancelling(false);
      return;
    }

    // Update sale
    const { error: saleError } = await supabase
      .from('sales')
      .update({
        status: 'cancelado' as any,
        cancel_reason: cancelReason.trim(),
        cancelled_at: new Date().toISOString(),
        cancelled_by: user.id,
      })
      .eq('id', cancelSale.id);

    if (saleError) {
      toast.error('Erro ao cancelar venda');
      setCancelling(false);
      return;
    }

    // Delete tickets to free seats
    if (tickets && tickets.length > 0) {
      await supabase.from('tickets').delete().eq('sale_id', cancelSale.id);
    }

    // Log
    await supabase.from('sale_logs').insert({
      sale_id: cancelSale.id,
      action: 'cancelamento',
      description: `Venda cancelada. Motivo: ${cancelReason.trim()}`,
      old_value: cancelSale.status,
      new_value: 'cancelado',
      performed_by: user.id,
      company_id: activeCompanyId,
    });

    toast.success('Venda cancelada com sucesso');
    setCancelSale(null);
    setCancelReason('');
    setCancelling(false);
    fetchSales();
    if (detailSale?.id === cancelSale.id) setDetailSale(null);
  };

  // ── Change status (Gerente only) ──
  const handleChangeStatus = async (sale: Sale, newStatus: SaleStatus) => {
    if (!user || !activeCompanyId) return;
    const { error } = await supabase
      .from('sales')
      .update({ status: newStatus as any })
      .eq('id', sale.id);

    if (error) {
      toast.error('Erro ao alterar status');
      return;
    }

    await supabase.from('sale_logs').insert({
      sale_id: sale.id,
      action: 'status_alterado',
      description: `Status alterado: ${statusLabels[sale.status]} → ${statusLabels[newStatus]}`,
      old_value: sale.status,
      new_value: newStatus,
      performed_by: user.id,
      company_id: activeCompanyId,
    });

    toast.success(`Status alterado para ${statusLabels[newStatus]}`);
    fetchSales();
  };

  // ── Copy link ──
  const handleCopyLink = (saleId: string) => {
    const url = `${window.location.origin}/confirmacao/${saleId}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copiado!');
  };

  // ── Actions dropdown ──
  const getSaleActions = (sale: Sale): ActionItem[] => {
    const actions: ActionItem[] = [
      { label: 'Ver Detalhes', icon: Eye, onClick: () => openDetail(sale) },
      { label: 'Copiar Link', icon: Copy, onClick: () => handleCopyLink(sale.id) },
    ];

    if (sale.status !== 'cancelado') {
      actions.push({
        label: 'Cancelar Venda',
        icon: Ban,
        onClick: () => setCancelSale(sale),
        variant: 'destructive',
      });
    }

    if (isGerente) {
      if (sale.status === 'reservado') {
        actions.push({
          label: 'Marcar como Pago',
          icon: CheckCircle,
          onClick: () => handleChangeStatus(sale, 'pago'),
        });
      }
      if (sale.status === 'pago') {
        actions.push({
          label: 'Reverter para Reservado',
          icon: ArrowUpDown,
          onClick: () => handleChangeStatus(sale, 'reservado'),
        });
      }
    }

    return actions;
  };

  // ── Render ──
  return (
    <AdminLayout>
      <div className="page-container">
        {/* Header */}
        <PageHeader
          title="Vendas"
          description="Gerenciamento de vendas e suporte ao cliente"
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => setExportModalOpen(true)}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPdfModalOpen(true)}>
                <FileText className="h-4 w-4 mr-2" />
                PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setLoading(true); fetchSales(); }}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
            </>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          <StatsCard label="Total de Vendas" value={stats.total} icon={ShoppingCart} />
          {canViewFinancials && (
            <StatsCard label="Total Arrecadado" value={`R$ ${stats.totalValue.toFixed(2)}`} icon={DollarSign} variant="success" />
          )}
          <StatsCard label="Pagas" value={stats.pagas} icon={CheckCircle} variant="success" />
          <StatsCard label="Reservadas" value={stats.reservadas} icon={Clock} variant="warning" />
          <StatsCard label="Canceladas" value={stats.canceladas} icon={XCircle} variant="destructive" />
        </div>

        {/* KPIs de Comissão — somente Gerente */}
        {isGerente && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatsCard label="Comissão Total" value={`R$ ${stats.totalPlatformFee.toFixed(2)}`} icon={DollarSign} />
            <StatsCard label="Comissão Parceiro" value={`R$ ${stats.totalPartnerFee.toFixed(2)}`} icon={DollarSign} />
            <StatsCard label="Líquido Plataforma" value={`R$ ${stats.totalPlatformNet.toFixed(2)}`} icon={DollarSign} variant="success" />
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

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredSales.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart className="h-8 w-8 text-muted-foreground" />}
            title="Nenhuma venda encontrada"
            description={hasActiveFilters ? 'Tente ajustar os filtros' : 'As vendas aparecerão aqui quando forem realizadas'}
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Veículo</TableHead>
                    <TableHead>Local Embarque</TableHead>
                     <TableHead>Qtd</TableHead>
                     {canViewFinancials && <TableHead>Valor</TableHead>}
                     {isGerente && <TableHead title="Comissão = Valor Bruto × Taxa da Empresa. Parceiro recebe X% da comissão. Plataforma retém o restante.">Comissão</TableHead>}
                     {isGerente && <TableHead>Parceiro</TableHead>}
                     {isGerente && <TableHead>Líq. Plat.</TableHead>}
                     <TableHead>Vendedor</TableHead>
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
                          <div>
                            <p className="font-medium">{sale.customer_name}</p>
                            <p className="text-sm text-muted-foreground">{sale.customer_cpf}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {vehicle
                            ? `${vehicleTypeLabels[vehicle.type] ?? vehicle.type} • ${vehicle.plate}`
                            : '-'}
                        </TableCell>
                        <TableCell>{sale.boarding_location?.name ?? '-'}</TableCell>
                        <TableCell>{sale.quantity}</TableCell>
                        {canViewFinancials && (
                          <TableCell className="font-medium">
                            R$ {(sale.quantity * sale.unit_price).toFixed(2)}
                          </TableCell>
                        )}
                        {isGerente && (
                          <TableCell className="text-sm">
                            {sale.platform_fee_total != null ? `R$ ${sale.platform_fee_total.toFixed(2)}` : '—'}
                          </TableCell>
                        )}
                        {isGerente && (
                          <TableCell className="text-sm">
                            {sale.partner_fee_amount != null ? `R$ ${sale.partner_fee_amount.toFixed(2)}` : '—'}
                          </TableCell>
                        )}
                        {isGerente && (
                          <TableCell className="text-sm font-medium">
                            {sale.platform_net_amount != null ? `R$ ${sale.platform_net_amount.toFixed(2)}` : '—'}
                          </TableCell>
                        )}
                        <TableCell>{sale.seller?.name ?? '-'}</TableCell>
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
        )}

        {/* Export Modals */}
        <ExportExcelModal
          open={exportModalOpen}
          onOpenChange={setExportModalOpen}
          columns={exportColumns}
          data={flatData}
          storageKey="sales"
          fileName="vendas"
          sheetName="Vendas"
        />
        <ExportPDFModal
          open={pdfModalOpen}
          onOpenChange={setPdfModalOpen}
          columns={exportColumns}
          data={flatData}
          storageKey="sales"
          fileName="vendas"
          title="Relatório de Vendas"
          company={activeCompany}
        />

        {/* ── Detail Modal ── */}
        <Dialog open={!!detailSale} onOpenChange={(open) => {
          if (!open) {
            setDetailSale(null);
            setDetailBoardingDepartureTime(null);
          }
        }}>
          <DialogContent className="admin-modal flex h-[90vh] max-h-[90vh] w-[95vw] max-w-3xl flex-col gap-0 p-0">
            <DialogHeader className="admin-modal__header px-6 py-4">
              <DialogTitle>Detalhes da Venda</DialogTitle>
            </DialogHeader>
            {detailSale && (
              <Tabs defaultValue="dados" className="flex h-full flex-col overflow-hidden">
                <TabsList className="admin-modal__tabs flex h-auto w-full flex-wrap justify-start gap-1 px-6 py-2">
                  <TabsTrigger value="dados" className="inline-flex items-center gap-2 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground">
                    <Eye className="h-4 w-4" />
                    Dados da Venda
                  </TabsTrigger>
                  <TabsTrigger value="passageiros" className="inline-flex items-center gap-2 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground">
                    <Users className="h-4 w-4" />
                    Passageiros
                  </TabsTrigger>
                  <TabsTrigger value="historico" className="inline-flex items-center gap-2 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground">
                    <History className="h-4 w-4" />
                    Histórico
                  </TabsTrigger>
                </TabsList>

                <ScrollArea className="flex-1 px-6 py-4">
                  {detailLoading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : (
                    <>
                      {/* Tab: Dados */}
                      <TabsContent value="dados" className="mt-0 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <InfoRow label="Cliente" value={detailSale.customer_name} />
                          <InfoRow label="CPF" value={detailSale.customer_cpf} />
                          <InfoRow label="Telefone" value={detailSale.customer_phone} />
                          <InfoRow label="Evento" value={detailSale.event?.name ?? '-'} />
                          <InfoRow
                            label="Veículo"
                            value={
                              (detailSale.trip as any)?.vehicle
                                ? `${vehicleTypeLabels[(detailSale.trip as any).vehicle.type] ?? (detailSale.trip as any).vehicle.type} • ${(detailSale.trip as any).vehicle.plate}`
                                : '-'
                            }
                          />
                          <InfoRow label="Local Embarque" value={detailSale.boarding_location?.name ?? '-'} />
                          <InfoRow
                            label="Horário de Embarque"
                            value={detailBoardingDepartureTime ? detailBoardingDepartureTime.slice(0, 5) : 'Horário não informado'}
                          />
                          <InfoRow label="Quantidade" value={String(detailSale.quantity)} />
                          {canViewFinancials && (
                            <>
                              <InfoRow label="Valor Unitário" value={`R$ ${Number(detailSale.unit_price).toFixed(2)}`} />
                              <InfoRow label="Valor Total" value={`R$ ${(detailSale.quantity * detailSale.unit_price).toFixed(2)}`} />
                            </>
                          )}
                          <InfoRow label="Vendedor" value={detailSale.seller?.name ?? '-'} />
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Status</p>
                            <StatusBadge status={detailSale.status} />
                          </div>
                          <InfoRow
                            label="Data da Compra"
                            value={format(new Date(detailSale.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          />
                        </div>
                        {detailSale.cancel_reason && (
                          <div className="mt-4 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                            <p className="text-sm font-medium text-destructive">Motivo do cancelamento:</p>
                            <p className="text-sm text-foreground mt-1">{detailSale.cancel_reason}</p>
                          </div>
                        )}
                      </TabsContent>

                      {/* Tab: Passageiros */}
                      <TabsContent value="passageiros" className="mt-0">
                        {detailTickets.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-8 text-center">
                            Nenhum passageiro vinculado
                          </p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Assento</TableHead>
                                <TableHead>Nome</TableHead>
                                <TableHead>CPF</TableHead>
                                <TableHead>Embarque</TableHead>
                                <TableHead className="w-[60px]">Ação</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {detailTickets.map((ticket) => (
                                <TableRow key={ticket.id}>
                                  <TableCell className="font-medium">{ticket.seat_label}</TableCell>
                                  <TableCell>{ticket.passenger_name}</TableCell>
                                  <TableCell>{ticket.passenger_cpf}</TableCell>
                                  <TableCell>
                                    <span className={`text-xs font-medium ${ticket.boarding_status === 'pendente' ? 'text-muted-foreground' : 'text-success'}`}>
                                      {ticket.boarding_status}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    {detailSale.status !== 'cancelado' && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => openEditPassenger(ticket)}
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </TabsContent>

                      {/* Tab: Histórico */}
                      <TabsContent value="historico" className="mt-0">
                        {detailLogs.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-8 text-center">
                            Nenhum registro no histórico
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {detailLogs.map((log) => (
                              <div key={log.id} className="flex gap-3 p-3 rounded-md border">
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{log.description}</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </TabsContent>
                    </>
                  )}
                </ScrollArea>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Edit Passenger Modal ── */}
        <Dialog open={!!editingTicket} onOpenChange={(open) => { if (!open) setEditingTicket(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Passageiro — Assento {editingTicket?.seat_label}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Nome Completo</Label>
                <Input value={editPassengerName} onChange={(e) => setEditPassengerName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>CPF</Label>
                <Input value={editPassengerCpf} onChange={(e) => setEditPassengerCpf(e.target.value)} maxLength={14} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingTicket(null)}>Cancelar</Button>
              <Button onClick={handleSavePassenger} disabled={savingPassenger}>
                {savingPassenger ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Cancel AlertDialog ── */}
        <AlertDialog open={!!cancelSale} onOpenChange={(open) => { if (!open) { setCancelSale(null); setCancelReason(''); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar Venda</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação irá cancelar a venda de <strong>{cancelSale?.customer_name}</strong> e liberar os assentos. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2 py-2">
              <Label>Motivo do cancelamento *</Label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Informe o motivo..."
                rows={3}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCancelSale}
                disabled={cancelling || !cancelReason.trim()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {cancelling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Confirmar Cancelamento
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
}

// ── Helper ──
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
