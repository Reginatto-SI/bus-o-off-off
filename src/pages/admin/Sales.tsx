import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sale, SaleStatus, SaleLog, TicketRecord, Seller } from '@/types/database';
import { calculateFees, type EventFeeInput } from '@/lib/feeCalculator';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Users,
  History,
  Calendar,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { NewSaleModal } from '@/components/admin/NewSaleModal';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TicketCard, type TicketCardData } from '@/components/public/TicketCard';

function formatCpfMask(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return d.slice(0, 3) + '.' + d.slice(3);
  if (d.length <= 9) return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6);
  return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
}

function formatSeatLabels(labels: string[]): { display: string; full: string } {
  if (!labels || labels.length === 0) return { display: '-', full: '-' };
  const sorted = [...labels].sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
  if (sorted.length <= 3) return { display: sorted.join(', '), full: sorted.join(', ') };
  return { display: `${sorted.slice(0, 3).join(', ')} +${sorted.length - 3}`, full: sorted.join(', ') };
}

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

type SalesSortField = 'created_at' | 'quantity' | 'seat_label' | 'gross_amount' | 'status' | 'event_name';
type SalesSortDirection = 'asc' | 'desc';

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

// ── Helper to build TicketCardData ──
function buildTicketCardData(
  ticket: TicketRecord,
  sale: Sale,
  company: any,
  boardingDepartureTime: string | null,
  boardingDepartureDate: string | null,
  fees?: { name: string; amount: number }[],
  totalPaid?: number,
): TicketCardData {
  const companyDisplayName = company?.trade_name || company?.name || '';
  return {
    ticketId: ticket.id,
    qrCodeToken: ticket.qr_code_token,
    passengerName: ticket.passenger_name,
    passengerCpf: ticket.passenger_cpf,
    seatLabel: ticket.seat_label,
    boardingStatus: ticket.boarding_status,
    eventName: sale.event?.name || '',
    eventDate: sale.event?.date || '',
    eventCity: sale.event?.city || '',
    boardingLocationName: sale.boarding_location?.name || '',
    boardingLocationAddress: sale.boarding_location?.address || '',
    boardingDepartureTime,
    boardingDepartureDate,
    saleStatus: sale.status as any,
    companyName: companyDisplayName,
    companyLogoUrl: company?.logo_url || null,
    companyCity: company?.city || null,
    companyState: company?.state || null,
    companyPrimaryColor: company?.primary_color || null,
    companyCnpj: company?.cnpj || null,
    companyPhone: company?.phone || null,
    companyWhatsapp: company?.whatsapp || null,
    companyAddress: company?.address || null,
    companySlogan: company?.slogan || null,
    fees,
    totalPaid,
  };
}

// ── Component ──
export default function Sales() {
  const { isGerente, canViewFinancials, activeCompanyId, activeCompany, user } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [totalSalesCount, setTotalSalesCount] = useState(0);
  const [events, setEvents] = useState<SalesEventFilterOption[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<SalesFilters>(initialFilters);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [newSaleModalOpen, setNewSaleModalOpen] = useState(false);
  const [seatLabelsMap, setSeatLabelsMap] = useState<Record<string, string[]>>({});
  // Estado único de ordenação para manter o comportamento de apenas 1 coluna ativa por vez.
  const [sortField, setSortField] = useState<SalesSortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SalesSortDirection>('desc');

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

  // Ticket generation states
  const [ticketGenSale, setTicketGenSale] = useState<Sale | null>(null);
  const [ticketGenTickets, setTicketGenTickets] = useState<TicketRecord[]>([]);
  const [ticketGenBoardingTime, setTicketGenBoardingTime] = useState<string | null>(null);
  const [ticketGenBoardingDate, setTicketGenBoardingDate] = useState<string | null>(null);
  const [ticketGenLoading, setTicketGenLoading] = useState(false);
  const [ticketGenFees, setTicketGenFees] = useState<{ name: string; amount: number }[] | undefined>(undefined);
  const [ticketGenTotalPaid, setTicketGenTotalPaid] = useState<number | undefined>(undefined);

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
    setLoading(true);

    // Mantém os filtros aplicados no banco para evitar carga de volume total no cliente.
    let query = supabase
      .from('sales')
      .select(`
        *,
        event:events(*),
        trip:trips(*, vehicle:vehicles(*)),
        boarding_location:boarding_locations(*),
        seller:sellers(*)
      `, { count: 'exact' });

    // A ordenação sempre acontece no backend para respeitar paginação e filtros ativos.
    if (sortField === 'event_name') {
      query = query.order('name', { ascending: sortDirection === 'asc', referencedTable: 'events' });
    } else if (sortField === 'seat_label') {
      query = query.order('seat_label', { ascending: sortDirection === 'asc', referencedTable: 'tickets' });
    } else if (sortField === 'gross_amount') {
      query = query.order('gross_amount', { ascending: sortDirection === 'asc', nullsFirst: false });
    } else {
      query = query.order(sortField, { ascending: sortDirection === 'asc' });
    }

    if (activeCompanyId) {
      query = query.eq('company_id', activeCompanyId);
    }

    if (filters.search.trim()) {
      const searchTerm = filters.search.trim();
      query = query.or(`customer_name.ilike.%${searchTerm}%,customer_cpf.ilike.%${searchTerm}%`);
    }

    if (filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters.eventId !== 'all') {
      query = query.eq('event_id', filters.eventId);
    }

    if (filters.sellerId !== 'all') {
      query = query.eq('seller_id', filters.sellerId);
    }

    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      query = query.gte('created_at', fromDate.toISOString());
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      query = query.lte('created_at', toDate.toISOString());
    }

    const rangeFrom = (currentPage - 1) * rowsPerPage;
    const rangeTo = rangeFrom + rowsPerPage - 1;
    query = query.range(rangeFrom, rangeTo);

    const { data, error, count } = await query;

    if (error) {
      toast.error('Erro ao carregar vendas');
    } else {
      setSales((data ?? []) as Sale[]);
      setTotalSalesCount(count ?? 0);
    }

    // Busca apenas as poltronas das vendas da página atual para reduzir custo de consulta.
    const saleIds = (data ?? []).map((sale) => sale.id);
    if (saleIds.length > 0) {
      let ticketQuery = supabase
        .from('tickets')
        .select('sale_id, seat_label')
        .in('sale_id', saleIds);

      if (activeCompanyId) {
        ticketQuery = ticketQuery.eq('company_id', activeCompanyId);
      }

      const { data: ticketData } = await ticketQuery;
      const map: Record<string, string[]> = {};
      (ticketData ?? []).forEach((ticket: any) => {
        if (!map[ticket.sale_id]) map[ticket.sale_id] = [];
        map[ticket.sale_id].push(ticket.seat_label);
      });
      setSeatLabelsMap(map);
    } else {
      setSeatLabelsMap({});
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

    if (eventsRes.data) setEvents(eventsRes.data as SalesEventFilterOption[]);
    if (sellersRes.data) setSellers(sellersRes.data as Seller[]);
  };

  useEffect(() => {
    fetchSales();
  }, [activeCompanyId, filters, currentPage, rowsPerPage, sortField, sortDirection]);

  useEffect(() => {
    fetchFiltersData();
  }, [activeCompanyId]);

  useEffect(() => {
    // Sempre volta para a primeira página ao trocar filtros/tamanho da página.
    setCurrentPage(1);
  }, [filters, rowsPerPage]);

  const formatEventFilterLabel = (event: SalesEventFilterOption) => {
    const eventDate = event.date ? format(parseISO(event.date), 'dd/MM/yyyy') : '';
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

  const handleSortChange = (field: SalesSortField) => {
    setCurrentPage(1);
    setSortField((currentField) => {
      if (currentField === field) {
        setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
        return currentField;
      }

      setSortDirection('asc');
      return field;
    });
  };

  const renderSortHeader = (label: string, field: SalesSortField) => {
    const isActive = sortField === field;
    return (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 px-3 text-xs font-semibold"
        onClick={() => handleSortChange(field)}
      >
        <span>{label}</span>
        {isActive && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />)}
      </Button>
    );
  };

  // ── Stats ──
  const stats = useMemo(() => {
    const total = totalSalesCount;
    const totalValue = sales.reduce((sum, s) => sum + (s.gross_amount ?? s.quantity * s.unit_price), 0);
    const pagas = sales.filter((s) => s.status === 'pago').length;
    const reservadas = sales.filter((s) => s.status === 'reservado').length;
    const canceladas = sales.filter((s) => s.status === 'cancelado').length;
    const paidSales = sales.filter((s) => s.status === 'pago');
    const totalPlatformFee = paidSales.reduce((sum, s) => sum + (s.platform_fee_total ?? 0), 0);
    const totalSellersCommission = paidSales.reduce((sum, sale) => {
      const saleGross = sale.gross_amount ?? sale.quantity * sale.unit_price;
      const sellerCommissionPercent = sale.seller?.commission_percent ?? 0;
      return sum + (saleGross * sellerCommissionPercent) / 100;
    }, 0);
    return { total, totalValue, pagas, reservadas, canceladas, totalPlatformFee, totalSellersCommission };
  }, [sales, totalSalesCount]);

  // ── Flat data for export ──
  const flatData = useMemo(() => {
    return sales.map((s) => {
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
        total_value: s.gross_amount ?? s.quantity * s.unit_price,
        seller_name: s.seller?.name ?? '-',
        status: s.status,
      };
    });
  }, [sales]);

  const totalPages = Math.max(1, Math.ceil(totalSalesCount / rowsPerPage));
  const rangeStart = totalSalesCount === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
  const rangeEnd = totalSalesCount === 0 ? 0 : Math.min(currentPage * rowsPerPage, totalSalesCount);

  useEffect(() => {
    // Protege navegação quando o total diminui (ex.: mudança de filtro com menos páginas).
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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
    setEditPassengerCpf(formatCpfMask(ticket.passenger_cpf));
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
      openDetail(detailSale);
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

    if (tickets && tickets.length > 0) {
      await supabase.from('tickets').delete().eq('sale_id', cancelSale.id);
    }

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
      action: newStatus === 'pago' ? 'marked_as_paid' : 'status_alterado',
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

  // ── Ticket Generation ──
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const openTicketGen = async (sale: Sale) => {
    setTicketGenSale(sale);
    setSelectedTicketId(null);
    setTicketGenLoading(true);
    setTicketGenTickets([]);
    setTicketGenFees(undefined);
    setTicketGenTotalPaid(undefined);

    const [ticketsRes, boardingRes, feesRes] = await Promise.all([
      supabase.from('tickets').select('*').eq('sale_id', sale.id).order('seat_label'),
      supabase
        .from('event_boarding_locations')
        .select('departure_time, departure_date')
        .eq('event_id', sale.event_id)
        .eq('trip_id', sale.trip_id)
        .eq('boarding_location_id', sale.boarding_location_id)
        .maybeSingle(),
      supabase
        .from('event_fees')
        .select('*')
        .eq('event_id', sale.event_id)
        .eq('is_active', true),
    ]);

    const fetchedTickets = (ticketsRes.data ?? []) as TicketRecord[];
    setTicketGenTickets(fetchedTickets);
    setTicketGenBoardingTime(boardingRes.data?.departure_time ?? null);
    setTicketGenBoardingDate((boardingRes.data as any)?.departure_date ?? null);

    // Calculate fees
    const eventFees: EventFeeInput[] = (feesRes.data || []).map((f: any) => ({
      name: f.name,
      fee_type: f.fee_type as 'fixed' | 'percent',
      value: f.value,
      is_active: true,
    }));
    if (eventFees.length > 0) {
      const breakdown = calculateFees(sale.unit_price, eventFees);
      setTicketGenFees(breakdown.fees);
      setTicketGenTotalPaid(breakdown.unitPriceWithFees);
    }

    setTicketGenLoading(false);

    if (fetchedTickets.length === 1) {
      setSelectedTicketId(fetchedTickets[0].id);
    }
  };

  // ── Actions dropdown ──
  const getSaleActions = (sale: Sale): ActionItem[] => {
    const actions: ActionItem[] = [
      { label: 'Ver Detalhes', icon: Eye, onClick: () => openDetail(sale) },
      { label: 'Copiar Link', icon: Copy, onClick: () => handleCopyLink(sale.id) },
    ];

    // Ticket generation action (hidden for BLOQUEIO and cancelled sales)
    if (sale.status !== 'cancelado' && sale.customer_name !== 'BLOQUEIO') {
      actions.push({
        label: 'Gerar Passagem',
        icon: FileText,
        onClick: () => openTicketGen(sale),
      });
    }

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
  const selectedTicket = ticketGenTickets.find((ticket) => ticket.id === selectedTicketId) ?? null;
  const selectedTicketData = selectedTicket && ticketGenSale && activeCompany
    ? buildTicketCardData(
        selectedTicket,
        ticketGenSale,
        activeCompany,
        ticketGenBoardingTime,
        ticketGenBoardingDate,
        ticketGenFees,
        ticketGenTotalPaid,
      )
    : null;



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
              <Button onClick={() => setNewSaleModalOpen(true)}>
                + Nova venda
              </Button>
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

        {/* KPI financeiro resumido: mantemos apenas o custo da plataforma para reduzir ruído visual. */}
        {isGerente && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <StatsCard label="Custo da Plataforma" value={`R$ ${stats.totalPlatformFee.toFixed(2)}`} icon={DollarSign} />
            <StatsCard label="Comissão dos Vendedores" value={`R$ ${stats.totalSellersCommission.toFixed(2)}`} icon={Users} />
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
        ) : sales.length === 0 ? (
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
                    <TableHead>{renderSortHeader('Data da Compra', 'created_at')}</TableHead>
                    <TableHead>{renderSortHeader('Evento', 'event_name')}</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Veículo</TableHead>
                    <TableHead>Local Embarque</TableHead>
                     <TableHead>{renderSortHeader('Qtd', 'quantity')}</TableHead>
                     <TableHead>{renderSortHeader('Poltrona(s)', 'seat_label')}</TableHead>
                     {canViewFinancials && <TableHead>{renderSortHeader('Valor', 'gross_amount')}</TableHead>}
                     <TableHead>Vendedor</TableHead>
                    <TableHead>{renderSortHeader('Status', 'status')}</TableHead>
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
                        <TableCell>{sale.event?.name ?? '-'}</TableCell>
                        <TableCell>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium">{sale.customer_name}</p>
                              {sale.customer_name === 'BLOQUEIO' && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">Bloqueio</Badge>
                              )}
                            </div>
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
                        <TableCell>
                          {(() => {
                            const labels = seatLabelsMap[sale.id];
                            const { display, full } = formatSeatLabels(labels ?? []);
                            if (!labels || labels.length <= 3) return <span className="text-sm">{display}</span>;
                            return (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-sm cursor-help">{display}</span>
                                  </TooltipTrigger>
                                  <TooltipContent><p>{full}</p></TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            );
                          })()}
                        </TableCell>
                        {canViewFinancials && (
                          <TableCell className="font-medium">
                            R$ {(sale.quantity * sale.unit_price).toFixed(2)}
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

              <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span>Exibindo {rangeStart}–{rangeEnd} de {totalSalesCount} resultados</span>
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
            </CardContent>
          </Card>
        )}

        {/* New Sale Modal */}
        <NewSaleModal
          open={newSaleModalOpen}
          onOpenChange={setNewSaleModalOpen}
          onSuccess={() => { setNewSaleModalOpen(false); fetchSales(); }}
          company={activeCompany}
        />

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

        {/* ── Ticket Generation Dialog ── */}
        <Dialog
          open={!!ticketGenSale}
          onOpenChange={(open) => {
            if (!open) {
              setTicketGenSale(null);
              setTicketGenTickets([]);
              setSelectedTicketId(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                Gerar Passagem
              </DialogTitle>
            </DialogHeader>
            {ticketGenLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : ticketGenTickets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum passageiro encontrado.</p>
            ) : !selectedTicketId && ticketGenTickets.length > 1 ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">Qual passageiro?</p>
                {ticketGenTickets.map((ticket) => (
                  <Button
                    key={ticket.id}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => setSelectedTicketId(ticket.id)}
                  >
                    {ticket.passenger_name} · Poltrona {ticket.seat_label}
                  </Button>
                ))}
              </div>
            ) : selectedTicketData ? (
              <div className="space-y-3">
                {ticketGenTickets.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedTicketId(null)}>
                    ← Trocar passageiro
                  </Button>
                )}
                {/* Reuso intencional do mesmo componente público para manter padrão visual e ações de download. */}
                <TicketCard ticket={selectedTicketData} allowReservedDownloads />
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setTicketGenSale(null); setTicketGenTickets([]); setSelectedTicketId(null); }}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
                          <InfoRow
                            label="Poltrona(s)"
                            value={detailTickets.length > 0 ? detailTickets.map(t => t.seat_label).sort((a, b) => {
                              const na = parseInt(a, 10); const nb = parseInt(b, 10);
                              if (!isNaN(na) && !isNaN(nb)) return na - nb;
                              return a.localeCompare(b);
                            }).join(', ') : '-'}
                          />
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
                <Input value={editPassengerCpf} onChange={(e) => setEditPassengerCpf(formatCpfMask(e.target.value))} maxLength={14} />
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

// ── Helpers ──
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
