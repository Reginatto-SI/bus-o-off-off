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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  Check,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  CreditCard,
  AlertCircle,
} from 'lucide-react';

import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatDateOnlyBR } from '@/lib/date';
import { cn, formatBoardingLocationLabel } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { NewSaleModal } from '@/components/admin/NewSaleModal';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { type TicketCardData } from '@/components/public/TicketCard';
import { PassengerTicketList } from '@/components/public/PassengerTicketList';
import { formatCurrencyBRL } from '@/lib/currency';

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

function formatEventDisplayName(event?: { name?: string | null; date?: string | null } | null): string {
  const eventName = event?.name ?? '';
  const eventDate = event?.date ? formatDateOnlyBR(event.date) : '';
  return eventDate ? `${eventDate} - ${eventName}` : eventName;
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

type SalesSortField =
  | 'created_at'
  | 'event_name'
  | 'customer_name'
  | 'trip_id'
  | 'boarding_location_name'
  | 'quantity'
  | 'gross_amount'
  | 'seller_name'
  | 'status';
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
  commercialPartners?: { name: string; logo_url: string | null }[],
  eventSponsors?: { name: string; logo_url: string | null }[],
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
    boardingToleranceMinutes: sale.event?.boarding_tolerance_minutes ?? null,
    boardingLocationName: sale.boarding_location?.name || '',
    boardingLocationAddress: sale.boarding_location?.address || '',
    boardingDepartureTime,
    boardingDepartureDate,
    saleStatus: sale.status as any,
    companyName: companyDisplayName,
    companyLogoUrl: company?.logo_url || null,
    companyCity: company?.city || null,
    companyState: company?.state || null,
    companyPrimaryColor: company?.ticket_color || company?.primary_color || null,
    companyCnpj: company?.cnpj || null,
    companyPhone: company?.phone || null,
    companyWhatsapp: company?.whatsapp || null,
    companyAddress: company?.address || null,
    companySlogan: company?.slogan || null,
    vehicleType: (sale.trip as any)?.vehicle?.type || null,
    vehiclePlate: (sale.trip as any)?.vehicle?.plate || null,
    driverName: (sale.trip as any)?.driver?.name || null,
    fees,
    totalPaid,
    commercialPartners,
    eventSponsors,
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
  const [boardingTimeMap, setBoardingTimeMap] = useState<Record<string, string | null>>({});
  // Ordenação ativa (nullable): quando null, aplica o padrão da tela (Data da Compra desc).
  const [sortConfig, setSortConfig] = useState<{ field: SalesSortField; direction: SalesSortDirection } | null>(null);
  const [eventFilterOpen, setEventFilterOpen] = useState(false);
  const [sellerFilterOpen, setSellerFilterOpen] = useState(false);
  const [eventFilterSearch, setEventFilterSearch] = useState('');
  const [sellerFilterSearch, setSellerFilterSearch] = useState('');

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
  const [ticketGenPartners, setTicketGenPartners] = useState<{ name: string; logo_url: string | null }[]>([]);
  const [ticketGenSponsors, setTicketGenSponsors] = useState<{ name: string; logo_url: string | null }[]>([]);

  // ── Export columns ──
  const exportColumns: ExportColumn[] = [
    { key: 'created_at', label: 'Data da Compra', format: (v) => v ? format(parseISO(v), 'dd/MM/yy HH:mm', { locale: ptBR }) : '' },
    { key: 'event_name', label: 'Evento' },
    { key: 'customer_name', label: 'Cliente' },
    { key: 'customer_cpf', label: 'CPF' },
    { key: 'customer_phone', label: 'Telefone' },
    { key: 'vehicle_info', label: 'Veículo' },
    { key: 'boarding_location_name', label: 'Local Embarque' },
    { key: 'quantity', label: 'Quantidade' },
    { key: 'total_value', label: 'Valor Total', format: (v) => formatCurrencyBRL(Number(v)) },
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
        trip:trips(*, vehicle:vehicles(*), driver:drivers!trips_driver_id_fkey(name)),
        boarding_location:boarding_locations(*),
        seller:sellers(*)
      `, { count: 'exact' });

    // Quando não há coluna ativa, volta para a regra padrão da tela: compra mais recente primeiro.
    const effectiveSortField = sortConfig?.field ?? 'created_at';
    const effectiveSortDirection = sortConfig?.direction ?? 'desc';

    // A ordenação acontece no backend para manter consistência com filtros e paginação.
    if (effectiveSortField === 'event_name') {
      query = query.order('name', { ascending: effectiveSortDirection === 'asc', referencedTable: 'events' });
    } else if (effectiveSortField === 'seller_name') {
      query = query.order('name', { ascending: effectiveSortDirection === 'asc', referencedTable: 'sellers', nullsFirst: false });
    } else if (effectiveSortField === 'boarding_location_name') {
      query = query.order('name', { ascending: effectiveSortDirection === 'asc', referencedTable: 'boarding_locations' });
    } else if (effectiveSortField === 'gross_amount') {
      query = query.order('gross_amount', { ascending: effectiveSortDirection === 'asc', nullsFirst: false });
    } else {
      query = query.order(effectiveSortField, { ascending: effectiveSortDirection === 'asc' });
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
      setBoardingTimeMap({});
    } else {
      setSales((data ?? []) as unknown as Sale[]);
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

      const boardingKeys = Array.from(new Set((data ?? []).map((sale: any) => `${sale.event_id}::${sale.trip_id}::${sale.boarding_location_id}`)));
      const eventIds = Array.from(new Set((data ?? []).map((sale: any) => sale.event_id)));
      const tripIds = Array.from(new Set((data ?? []).map((sale: any) => sale.trip_id)));
      const boardingLocationIds = Array.from(new Set((data ?? []).map((sale: any) => sale.boarding_location_id)));

      let boardingQuery = supabase
        .from('event_boarding_locations')
        .select('event_id, trip_id, boarding_location_id, departure_time')
        .in('event_id', eventIds)
        .in('trip_id', tripIds)
        .in('boarding_location_id', boardingLocationIds);

      if (activeCompanyId) {
        boardingQuery = boardingQuery.eq('company_id', activeCompanyId);
      }

      const { data: boardingData } = await boardingQuery;
      const nextBoardingMap: Record<string, string | null> = {};
      (boardingData ?? []).forEach((boarding: any) => {
        const key = `${boarding.event_id}::${boarding.trip_id}::${boarding.boarding_location_id}`;
        // Evita sobrescrever chaves repetidas mantendo a primeira ocorrência válida.
        if (!(key in nextBoardingMap)) nextBoardingMap[key] = boarding.departure_time ?? null;
      });
      // Mantém fallback local para linhas sem correspondência de embarque.
      boardingKeys.forEach((key) => {
        if (!(key in nextBoardingMap)) nextBoardingMap[key] = null;
      });
      setBoardingTimeMap(nextBoardingMap);
    } else {
      setSeatLabelsMap({});
      setBoardingTimeMap({});
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

    if (eventsRes.data) setEvents(eventsRes.data as SalesEventFilterOption[]);
    if (sellersRes.data) setSellers(sellersRes.data as Seller[]);
  };

  useEffect(() => {
    fetchSales();
  }, [activeCompanyId, filters, currentPage, rowsPerPage, sortConfig]);

  useEffect(() => {
    fetchFiltersData();
  }, [activeCompanyId]);

  useEffect(() => {
    if (!eventFilterOpen) setEventFilterSearch('');
  }, [eventFilterOpen]);

  useEffect(() => {
    if (!sellerFilterOpen) setSellerFilterSearch('');
  }, [sellerFilterOpen]);

  useEffect(() => {
    // Sempre volta para a primeira página ao trocar filtros/tamanho da página.
    setCurrentPage(1);
  }, [filters, rowsPerPage]);

  const formatEventFilterLabel = (event: SalesEventFilterOption) => {
    // Evita parse UTC de date-only (YYYY-MM-DD) que causa -1 dia em fuso BR.
    const eventDate = event.date ? formatDateOnlyBR(event.date) : '';
    return eventDate ? `${eventDate} - ${event.name}` : event.name;
  };

  // Escalabilidade: Evento/Vendedor foram convertidos para Combobox com busca conforme padrão oficial da tela
  // /admin/relatorios/comissao-vendedores. A lógica de filtros segue server-side; apenas a experiência do select foi aprimorada.
  const eventFilterOptions = useMemo(
    () => [{ value: 'all', label: 'Todos' }, ...events.map((event) => ({ value: event.id, label: formatEventFilterLabel(event) }))],
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
    // Ciclo em 3 etapas: asc -> desc -> padrão (null).
    setSortConfig((currentSort) => {
      if (!currentSort || currentSort.field !== field) {
        return { field, direction: 'asc' };
      }
      if (currentSort.direction === 'asc') {
        return { field, direction: 'desc' };
      }
      return null;
    });
  };

  const renderSortHeader = (label: string, field: SalesSortField) => {
    const isActive = sortConfig?.field === field;
    const direction = isActive ? sortConfig?.direction : null;
    return (
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          '-ml-3 h-8 px-3 text-xs font-semibold text-primary-foreground hover:text-primary-foreground hover:bg-primary/80',
          isActive && 'bg-primary/80 text-primary-foreground'
        )}
        onClick={() => handleSortChange(field)}
      >
        <span>{label}</span>
        {isActive ? (
          direction === 'asc' ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />
        ) : (
          <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
        )}
      </Button>
    );
  };

  const getSaleBoardingLabel = (sale: Sale) => {
    // Sempre prioriza o horário do embarque vinculado à venda (evento + viagem + local).
    const key = `${sale.event_id}::${sale.trip_id}::${sale.boarding_location_id}`;
    return formatBoardingLocationLabel(sale.boarding_location?.name, boardingTimeMap[key]);
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
        // Mantém o mesmo padrão da tela/exportação: data do evento + nome.
        event_name: formatEventDisplayName(s.event),
        customer_name: s.customer_name,
        customer_cpf: s.customer_cpf,
        customer_phone: s.customer_phone,
        vehicle_info: vehicle
          ? `${vehicleTypeLabels[vehicle.type] ?? vehicle.type} • ${vehicle.plate}`
          : '-',
        boarding_location_name: getSaleBoardingLabel(s),
        quantity: s.quantity,
        total_value: s.gross_amount ?? s.quantity * s.unit_price,
        seller_name: s.seller?.name ?? '-',
        status: s.status,
      };
    });
  }, [sales, boardingTimeMap]);

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
  // IMPORTANTE: vendas administrativas com taxa pendente (platform_fee_status != 'paid')
  // não podem ser marcadas como 'pago'. O trigger no banco bloqueia isso,
  // mas o frontend também valida para dar feedback claro ao usuário.
  const handleChangeStatus = async (sale: Sale, newStatus: SaleStatus) => {
    if (!user || !activeCompanyId) return;

    // Bloqueio frontend: impede marcar como pago se taxa da plataforma está pendente
    if (newStatus === 'pago') {
      const feeStatus = (sale as any).platform_fee_status;
      if (feeStatus && feeStatus !== 'paid' && feeStatus !== 'not_applicable' && feeStatus !== 'waived') {
        toast.error('Não é possível marcar como pago: taxa da plataforma pendente. Pague a taxa primeiro.');
        return;
      }
    }

    const { error } = await supabase
      .from('sales')
      .update({ status: newStatus as any })
      .eq('id', sale.id);

    if (error) {
      // O trigger do banco pode bloquear a transição — traduzir mensagem para o usuário
      if (error.message?.includes('taxa da plataforma pendente')) {
        toast.error('Não é possível marcar como pago: taxa da plataforma pendente.');
      } else {
        toast.error('Erro ao alterar status');
      }
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

  // ── Pagar taxa da plataforma (abre Stripe Checkout na conta da plataforma) ──
  const [payingFee, setPayingFee] = useState(false);
  const handlePayPlatformFee = async (sale: Sale) => {
    setPayingFee(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-platform-fee-checkout', {
        body: { sale_id: sale.id },
      });
      if (error || !data?.url) {
        toast.error(data?.error || 'Erro ao criar checkout da taxa');
        return;
      }
      // Alerta ao admin quando Pix não está habilitado na conta Stripe
      if (data.pix_available === false) {
        toast.warning('Pix não está habilitado na sua conta Stripe. O checkout foi aberto apenas com cartão. Para habilitar Pix, acesse Settings → Payment Methods no Dashboard do Stripe.', { duration: 10000 });
      }
      // Abre o checkout da taxa em nova aba
      window.open(data.url, '_blank');
      toast.info('Checkout da taxa aberto em nova aba. Após o pagamento, atualize a listagem.');
    } catch (err: any) {
      toast.error('Erro ao iniciar pagamento da taxa');
    } finally {
      setPayingFee(false);
    }
  };

  // ── Copy link ──
  const handleCopyLink = (saleId: string) => {
    const url = `${window.location.origin}/confirmacao/${saleId}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copiado!');
  };

  // ── Ticket Generation ──
  // selectedTicketId removido — agora PassengerTicketList gerencia internamente

  const openTicketGen = async (sale: Sale) => {
    setTicketGenSale(sale);
    setTicketGenLoading(true);
    setTicketGenLoading(true);
    setTicketGenTickets([]);
    setTicketGenFees(undefined);
    setTicketGenTotalPaid(undefined);
    setTicketGenPartners([]);
    setTicketGenSponsors([]);

    const companyId = (sale.event as any)?.company_id || activeCompanyId;
    const [ticketsRes, boardingRes, feesRes, partnersRes, sponsorsRes] = await Promise.all([
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
      companyId
        ? supabase
            .from('commercial_partners')
            .select('name, logo_url')
            .eq('company_id', companyId)
            .eq('status', 'ativo')
            .eq('show_on_ticket', true)
            .order('display_order')
            .limit(6)
        : Promise.resolve({ data: [] }),
      supabase
        .from('event_sponsors')
        .select('display_order, sponsor:sponsors(name, banner_url, status)')
        .eq('event_id', sale.event_id)
        .eq('show_on_ticket', true)
        .order('display_order')
        .limit(6),
    ]);

    const fetchedTickets = (ticketsRes.data ?? []) as TicketRecord[];
    setTicketGenTickets(fetchedTickets);
    setTicketGenBoardingTime(boardingRes.data?.departure_time ?? null);
    setTicketGenBoardingDate((boardingRes.data as any)?.departure_date ?? null);
    setTicketGenPartners((partnersRes.data || []).map((p: any) => ({ name: p.name, logo_url: p.logo_url })));
    setTicketGenSponsors(
      ((sponsorsRes.data || []) as any[])
        .filter((es: any) => es.sponsor?.status === 'ativo')
        .map((es: any) => ({ name: es.sponsor.name, logo_url: es.sponsor.banner_url }))
    );

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
    const feeStatus = (sale as any).platform_fee_status;
    const feePending = feeStatus === 'pending' || feeStatus === 'failed';

    const actions: ActionItem[] = [
      { label: 'Ver Detalhes', icon: Eye, onClick: () => openDetail(sale) },
    ];

    if (!feePending) {
      actions.push({ label: 'Copiar Link', icon: Copy, onClick: () => handleCopyLink(sale.id) });
    }

    // Ticket generation action (hidden for BLOQUEIO, cancelled sales, and pending fees)
    if (sale.status !== 'cancelado' && sale.customer_name !== 'BLOQUEIO' && !feePending) {
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
      // Ação: Pagar taxa da plataforma (quando pendente)
      if (feePending) {
        actions.push({
          label: `Pagar Taxa (${formatCurrencyBRL((sale as any).platform_fee_amount ?? 0)})`,
          icon: CreditCard,
          onClick: () => handlePayPlatformFee(sale),
        });
      }

      if (sale.status === 'reservado' && !feePending) {
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
  // Constrói TicketCardData para TODOS os tickets da venda (agrupamento por passageiro no componente)
  const allTicketGenCards: TicketCardData[] = ticketGenSale && activeCompany
    ? ticketGenTickets.map((ticket) =>
        buildTicketCardData(
          ticket,
          ticketGenSale,
          activeCompany,
          ticketGenBoardingTime,
          ticketGenBoardingDate,
          ticketGenFees,
          ticketGenTotalPaid,
          ticketGenPartners.length > 0 ? ticketGenPartners : undefined,
          ticketGenSponsors.length > 0 ? ticketGenSponsors : undefined,
        )
      )
    : [];



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
            <StatsCard label="Total Arrecadado" value={formatCurrencyBRL(stats.totalValue)} icon={DollarSign} variant="success" />
          )}
          <StatsCard label="Pagas" value={stats.pagas} icon={CheckCircle} variant="success" />
          <StatsCard label="Reservadas" value={stats.reservadas} icon={Clock} variant="warning" />
          <StatsCard label="Canceladas" value={stats.canceladas} icon={XCircle} variant="destructive" />
        </div>

        {/* KPI financeiro resumido: mantemos apenas o custo da plataforma para reduzir ruído visual. */}
        {isGerente && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <StatsCard label="Custo da Plataforma" value={formatCurrencyBRL(stats.totalPlatformFee)} icon={DollarSign} />
            <StatsCard label="Comissão dos Vendedores" value={formatCurrencyBRL(stats.totalSellersCommission)} icon={Users} />
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
                    <TableHead className="whitespace-nowrap">{renderSortHeader('Data', 'created_at')}</TableHead>
                    <TableHead>{renderSortHeader('Evento', 'event_name')}</TableHead>
                    <TableHead>{renderSortHeader('Cliente', 'customer_name')}</TableHead>
                    <TableHead>{renderSortHeader('Embarque', 'boarding_location_name')}</TableHead>
                    <TableHead>{renderSortHeader('Passagem', 'quantity')}</TableHead>
                    {canViewFinancials && <TableHead className="whitespace-nowrap">{renderSortHeader('Valor', 'gross_amount')}</TableHead>}
                    <TableHead className="whitespace-nowrap">{renderSortHeader('Status', 'status')}</TableHead>
                    <TableHead className="w-[50px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((sale) => {
                    const vehicle = (sale.trip as any)?.vehicle;
                    const seatLabels = seatLabelsMap[sale.id];
                    const { display: seatsDisplay, full: seatsFull } = formatSeatLabels(seatLabels ?? []);
                    return (
                      <TableRow key={sale.id}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {format(new Date(sale.created_at), 'dd/MM/yy HH:mm', { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-sm">{formatEventDisplayName(sale.event) || '-'}</TableCell>
                        <TableCell>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-sm">{sale.customer_name}</p>
                              {sale.customer_name === 'BLOQUEIO' && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">Bloqueio</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{sale.customer_cpf}</p>
                            {sale.seller?.name && (
                              <p className="text-xs text-muted-foreground mt-0.5">Vend: {sale.seller.name}</p>
                            )}
                          </div>
                        </TableCell>
                        {/* Embarque: veículo + local agrupados */}
                        <TableCell>
                          <div className="space-y-0.5">
                            <p className="text-sm font-medium">
                              {vehicle
                                ? `${vehicleTypeLabels[vehicle.type] ?? vehicle.type} • ${vehicle.plate}`
                                : '-'}
                            </p>
                            <p className="text-xs text-muted-foreground">{getSaleBoardingLabel(sale)}</p>
                          </div>
                        </TableCell>
                        {/* Passagem: quantidade + poltronas agrupados */}
                        <TableCell>
                          <div className="space-y-0.5">
                            <p className="text-sm">{sale.quantity} {sale.quantity === 1 ? 'passagem' : 'passagens'}</p>
                            {seatLabels && seatLabels.length > 3 ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <p className="text-xs text-muted-foreground cursor-help">Poltr. {seatsDisplay}</p>
                                  </TooltipTrigger>
                                  <TooltipContent><p>{seatsFull}</p></TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <p className="text-xs text-muted-foreground">Poltr. {seatsDisplay}</p>
                            )}
                          </div>
                        </TableCell>
                        {canViewFinancials && (
                          <TableCell className="font-medium whitespace-nowrap text-sm">
                            {formatCurrencyBRL((sale.quantity * sale.unit_price))}
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <StatusBadge status={sale.status} />
                            {(sale as any).platform_fee_status === 'pending' && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground cursor-help">
                                    <AlertCircle className="h-3 w-3" />
                                    Taxa pendente
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Taxa da plataforma de {activeCompany?.platform_fee_percent ?? '—'}% sobre o valor da venda
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {(sale as any).platform_fee_status === 'failed' && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-0.5 text-[10px] text-destructive cursor-help">
                                    <AlertCircle className="h-3 w-3" />
                                    Taxa falhou
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Taxa da plataforma de {activeCompany?.platform_fee_percent ?? '—'}% sobre o valor da venda
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
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
          <DialogContent className="admin-modal flex h-[95vh] max-h-[95vh] w-[100vw] max-w-none flex-col gap-0 overflow-hidden p-0 sm:h-[90vh] sm:max-h-[90vh] sm:w-[95vw] sm:max-w-4xl">
            <DialogHeader className="admin-modal__header shrink-0 px-6 py-4">
              <DialogTitle>
                Gerar Passagem
              </DialogTitle>
            </DialogHeader>
            {/* Área com scroll interno para garantir visualização completa da passagem sem rolar o fundo da tela. */}
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
              {ticketGenLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : allTicketGenCards.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Nenhum passageiro encontrado.</p>
              ) : (
                <div className="mx-auto w-full max-w-[600px]">
                  {/* Agrupamento por passageiro com ida/volta sob demanda */}
                  <PassengerTicketList
                    tickets={allTicketGenCards}
                    allowReservedDownloads
                    context="admin"
                  />
                </div>
              )}
            </div>
            <DialogFooter className="admin-modal__footer shrink-0 px-6 py-4">
              <Button variant="outline" onClick={() => { setTicketGenSale(null); setTicketGenTickets([]); }}>
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
                              <InfoRow label="Valor Unitário" value={formatCurrencyBRL(Number(detailSale.unit_price))} />
                              <InfoRow label="Valor Total" value={formatCurrencyBRL((detailSale.quantity * detailSale.unit_price))} />
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

                        {/* Bloco de taxa da plataforma (vendas administrativas) */}
                        {(detailSale as any).platform_fee_status && (detailSale as any).platform_fee_status !== 'not_applicable' && (
                          <div className="mt-4 p-3 rounded-md border bg-muted/30 space-y-2">
                            <p className="text-sm font-semibold">Taxa da Plataforma</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                              <div>
                                <span className="text-muted-foreground">Valor: </span>
                                <span className="font-medium">{formatCurrencyBRL((detailSale as any).platform_fee_amount ?? 0)}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Status: </span>
                                <span className={`font-medium ${
                                  (detailSale as any).platform_fee_status === 'paid' ? 'text-emerald-600'
                                  : (detailSale as any).platform_fee_status === 'failed' ? 'text-destructive'
                                  : 'text-amber-600'
                                }`}>
                                  {(detailSale as any).platform_fee_status === 'pending' && 'Pendente'}
                                  {(detailSale as any).platform_fee_status === 'paid' && 'Pago'}
                                  {(detailSale as any).platform_fee_status === 'failed' && 'Falhou'}
                                  {(detailSale as any).platform_fee_status === 'waived' && 'Dispensada'}
                                </span>
                              </div>
                              {(detailSale as any).platform_fee_paid_at && (
                                <div>
                                  <span className="text-muted-foreground">Pago em: </span>
                                  <span className="font-medium">
                                    {format(new Date((detailSale as any).platform_fee_paid_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                  </span>
                                </div>
                              )}
                              <div>
                                <span className="text-muted-foreground">Origem: </span>
                                <span className="font-medium">
                                  {(detailSale as any).sale_origin === 'admin_manual' && 'Venda Manual'}
                                  {(detailSale as any).sale_origin === 'admin_reservation_conversion' && 'Conversão de Reserva'}
                                  {(detailSale as any).sale_origin === 'admin_block' && 'Bloqueio'}
                                </span>
                              </div>
                            </div>
                            {/* CTA para pagar taxa pendente */}
                            {((detailSale as any).platform_fee_status === 'pending' || (detailSale as any).platform_fee_status === 'failed') && isGerente && (
                              <Button
                                size="sm"
                                className="mt-2"
                                onClick={() => handlePayPlatformFee(detailSale)}
                                disabled={payingFee}
                              >
                                {payingFee ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
                                Pagar Taxa ({formatCurrencyBRL((detailSale as any).platform_fee_amount ?? 0)})
                              </Button>
                            )}
                          </div>
                        )}

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
