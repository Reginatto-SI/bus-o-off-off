import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { calculateFees, type EventFeeInput } from '@/lib/feeCalculator';
import { useAuth } from '@/contexts/AuthContext';
import { Seat, Event, Trip, Vehicle, Driver, TicketRecord, Seller } from '@/types/database';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { SeatMap } from '@/components/public/SeatMap';
import { PassengerTicketList } from '@/components/public/PassengerTicketList';
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Bus,
  Route,
  CalendarClock,
  Circle,
  CircleCheck,
  CheckCircle2,
  Users,
  CreditCard,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { formatDateOnlyBR } from '@/lib/date';
import type { TicketCardData } from '@/components/public/TicketCard';
import { formatCurrencyBRL, formatCurrencyInputFromDigits, parseCurrencyInputBRL } from '@/lib/currency';
import { CalculationSimulationCard } from '@/components/admin/CalculationSimulationCard';

// ── Types ──
type SaleTab = 'manual' | 'reserva' | 'bloqueio';

interface TripWithDetails extends Trip {
  vehicle?: Vehicle;
  driver?: Driver;
}

interface BoardingOption {
  id: string;
  boarding_location_id: string;
  name: string;
  address: string;
  departure_time: string | null;
  departure_date: string | null;
}

interface PassengerData {
  seatId: string;
  seatLabel: string;
  name: string;
  cpf: string;
  phone: string;
}

interface ConfirmationTicketData {
  ticket: TicketRecord;
  ticketCardData: TicketCardData;
}

interface NewSaleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  company?: any;
}

const vehicleTypeLabels: Record<string, string> = {
  onibus: 'Ônibus',
  micro_onibus: 'Micro-ônibus',
  van: 'Van',
};

function formatCpfMask(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return d.slice(0, 3) + '.' + d.slice(3);
  if (d.length <= 9) return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6);
  return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
}

function formatPhoneMask(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
  return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
}

function isValidCpf(value: string): boolean {
  const cpf = value.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;

  // Validação oficial do CPF por dígitos verificadores.
  const calcDigit = (base: string, factor: number) => {
    let total = 0;
    for (let i = 0; i < base.length; i += 1) total += Number(base[i]) * (factor - i);
    const result = (total * 10) % 11;
    return result === 10 ? 0 : result;
  };

  const first = calcDigit(cpf.slice(0, 9), 10);
  const second = calcDigit(cpf.slice(0, 10), 11);
  return first === Number(cpf[9]) && second === Number(cpf[10]);
}

function getTripTypeLabel(tripType?: string) {
  if (tripType === 'ida') return 'Ida';
  if (tripType === 'volta') return 'Volta';
  return 'Trajeto';
}

export function NewSaleModal({ open, onOpenChange, onSuccess, company }: NewSaleModalProps) {
  const { activeCompanyId, user } = useAuth();

  // Tab state
  const [activeTab, setActiveTab] = useState<SaleTab>('manual');
  const [step, setStep] = useState(1);

  // Step 1: Context
  const [events, setEvents] = useState<Event[]>([]);
  const [trips, setTrips] = useState<TripWithDetails[]>([]);
  const [boardingOptions, setBoardingOptions] = useState<BoardingOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedTripId, setSelectedTripId] = useState('');
  const [selectedReturnTripId, setSelectedReturnTripId] = useState<string | null>(null);
  const [includeReturnTrip, setIncludeReturnTrip] = useState(false);
  const [selectedBoardingId, setSelectedBoardingId] = useState('');
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [loadingBoarding, setLoadingBoarding] = useState(false);
  const [tripSoldSeats, setTripSoldSeats] = useState<Record<string, number>>({});

  // Step 2: Seats
  const [seats, setSeats] = useState<Seat[]>([]);
  const [occupiedSeatIds, setOccupiedSeatIds] = useState<string[]>([]);
  // Bloqueios operacionais separados para render idêntico ao checkout público (âmbar/ban).
  const [blockedSeatIds, setBlockedSeatIds] = useState<string[]>([]);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [loadingSeats, setLoadingSeats] = useState(false);

  // Step 3: Passengers
  const [passengers, setPassengers] = useState<PassengerData[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [observation, setObservation] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [blockReason, setBlockReason] = useState('manutencao');
  const [saving, setSaving] = useState(false);

  // Seller
  const [sellersList, setSellersList] = useState<Seller[]>([]);
  const [selectedSellerId, setSelectedSellerId] = useState('');

  // Step 4: Confirmation
  const [confirmationData, setConfirmationData] = useState<ConfirmationTicketData[] | null>(null);
  // activeTicketIndex removido — agora PassengerTicketList gerencia internamente
  const [eventFees, setEventFees] = useState<EventFeeInput[]>([]);
  const [categoryPricesMap, setCategoryPricesMap] = useState<Map<string, number>>(new Map());

  // Derived
  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const selectedEventPolicy = selectedEvent?.transport_policy ?? 'trecho_independente';
  const groupedTransportPolicy = selectedEventPolicy === 'ida_obrigatoria_volta_opcional' || selectedEventPolicy === 'ida_volta_obrigatorio';
  const mandatoryReturnPolicy = selectedEventPolicy === 'ida_volta_obrigatorio';
  const selectedTrip = trips.find((t) => t.id === selectedTripId);
  const selectedVehicle = selectedTrip?.vehicle;
  const selectedTripSoldCount = selectedTripId ? (tripSoldSeats[selectedTripId] ?? 0) : 0;
  const selectedTripRemainingSeats = selectedVehicle ? Math.max(selectedVehicle.capacity - selectedTripSoldCount, 0) : 0;

  // ── Reset on open/close ──
  useEffect(() => {
    if (open) {
      setStep(1);
      setActiveTab('manual');
      setSelectedEventId('');
      setSelectedTripId('');
      setSelectedReturnTripId(null);
      setIncludeReturnTrip(false);
      setSelectedBoardingId('');
      setSelectedSeats([]);
      setPassengers([]);
      setPaymentMethod('pix');
      setObservation('');
      setBlockReason('manutencao');
      setUnitPrice('');
      setSelectedSellerId('');
      setConfirmationData(null);
      // activeTicketIndex reset removido
      fetchEvents();
      fetchSellers();
    }
  }, [open]);

  // ── Fetch events ──
  const fetchEvents = async () => {
    if (!activeCompanyId) return;
    setLoadingEvents(true);
    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('company_id', activeCompanyId)
      .neq('status', 'encerrado')
      .eq('is_archived', false)
      .order('date', { ascending: false });
    setEvents((data ?? []) as Event[]);
    setLoadingEvents(false);
  };

  // ── Fetch sellers ──
  const fetchSellers = async () => {
    if (!activeCompanyId) return;
    const { data } = await supabase
      .from('sellers')
      .select('id, name')
      .eq('company_id', activeCompanyId)
      .eq('status', 'ativo')
      .order('name');
    setSellersList((data ?? []) as Seller[]);
  };

  // ── Fetch trips when event changes ──
  useEffect(() => {
    if (!selectedEventId) {
      setTrips([]);
      setTripSoldSeats({});
      setSelectedTripId('');
      setSelectedReturnTripId(null);
      setIncludeReturnTrip(false);
      setEventFees([]);
      return;
    }
    const fetchTrips = async () => {
      setLoadingTrips(true);
      const [tripsRes, feesRes] = await Promise.all([
        supabase
          .from('trips')
          .select('*, vehicle:vehicles(*), driver:drivers!trips_driver_id_fkey(*)')
          .eq('event_id', selectedEventId)
          .eq('company_id', activeCompanyId!),
        supabase
          .from('event_fees')
          .select('name, fee_type, value, is_active')
          .eq('event_id', selectedEventId)
          .eq('is_active', true)
          .order('sort_order'),
      ]);
      const tripsData = (tripsRes.data ?? []) as TripWithDetails[];
      setTrips(tripsData);
      setEventFees((feesRes.data ?? []) as EventFeeInput[]);

      // Fetch category prices if event uses category pricing
      const evt = events.find((e) => e.id === selectedEventId) ?? (await supabase.from('events').select('use_category_pricing').eq('id', selectedEventId).single()).data;
      if ((evt as any)?.use_category_pricing) {
        const { data: catPrices } = await supabase
          .from('event_category_prices')
          .select('category, price')
          .eq('event_id', selectedEventId);
        const map = new Map<string, number>();
        (catPrices ?? []).forEach((cp: any) => map.set(cp.category, Number(cp.price)));
        setCategoryPricesMap(map);
      } else {
        setCategoryPricesMap(new Map());
      }

      const tripIds = tripsData.map((trip) => trip.id);
      if (tripIds.length > 0) {
        const { data: soldSeatsData } = await supabase
          .from('tickets')
          .select('trip_id')
          .in('trip_id', tripIds)
          .eq('company_id', activeCompanyId!);

        // Mapeia assentos vendidos por transporte para exibir vagas restantes no seletor.
        const soldCount = (soldSeatsData ?? []).reduce<Record<string, number>>((acc, row: any) => {
          const id = row.trip_id;
          acc[id] = (acc[id] ?? 0) + 1;
          return acc;
        }, {});
        setTripSoldSeats(soldCount);
      } else {
        setTripSoldSeats({});
      }
      setSelectedTripId('');
      setSelectedReturnTripId(null);
      setIncludeReturnTrip(false);
      setSelectedBoardingId('');
      setLoadingTrips(false);
    };
    fetchTrips();
  }, [selectedEventId]);


  useEffect(() => {
    if (!selectedTripId) {
      setSelectedReturnTripId(null);
      setIncludeReturnTrip(false);
      return;
    }

    if (!groupedTransportPolicy) {
      setSelectedReturnTripId(null);
      setIncludeReturnTrip(false);
      return;
    }

    const outboundTrip = trips.find((trip) => trip.id === selectedTripId);
    const pairedReturnTrip = outboundTrip?.paired_trip_id
      ? trips.find((trip) => trip.id === outboundTrip.paired_trip_id)
      : trips.find((trip) => trip.trip_type === 'volta');

    setSelectedReturnTripId(pairedReturnTrip?.id ?? null);
    setIncludeReturnTrip(mandatoryReturnPolicy ? true : Boolean(pairedReturnTrip));
  }, [selectedTripId, groupedTransportPolicy, mandatoryReturnPolicy, trips]);

  // ── Fetch boarding locations when event+trip change ──
  useEffect(() => {
    if (!selectedEventId || !selectedTripId) {
      setBoardingOptions([]);
      setSelectedBoardingId('');
      return;
    }
    const fetchBoarding = async () => {
      setLoadingBoarding(true);
      const { data } = await supabase
        .from('event_boarding_locations')
        .select('id, boarding_location_id, departure_time, departure_date, boarding_location:boarding_locations(name, address)')
        .eq('event_id', selectedEventId)
        .eq('trip_id', selectedTripId)
        .eq('company_id', activeCompanyId!)
        .order('stop_order');
      const options: BoardingOption[] = (data ?? []).map((row: any) => ({
        id: row.id,
        boarding_location_id: row.boarding_location_id,
        name: row.boarding_location?.name ?? '',
        address: row.boarding_location?.address ?? '',
        departure_time: row.departure_time,
        departure_date: row.departure_date,
      }));
      setBoardingOptions(options);
      setSelectedBoardingId('');
      setLoadingBoarding(false);
    };
    fetchBoarding();
  }, [selectedEventId, selectedTripId]);

  // ── Fetch seats + occupied when trip changes ──
  useEffect(() => {
    if (!selectedTripId || !selectedVehicle) {
      setSeats([]);
      setOccupiedSeatIds([]);
      setBlockedSeatIds([]);
      setSelectedSeats([]);
      return;
    }
    const fetchSeatsAndOccupied = async () => {
      setLoadingSeats(true);
      const [seatsRes, ticketsRes] = await Promise.all([
        supabase
          .from('seats')
          .select('*')
          .eq('vehicle_id', selectedVehicle.id)
          .eq('company_id', activeCompanyId!)
          // Ordenação idêntica ao checkout público para render simétrico.
          .order('floor')
          .order('row_number')
          .order('column_number'),
        supabase
          .from('tickets')
          .select('seat_id, sale_id')
          .eq('trip_id', selectedTripId),
      ]);

      // Filtro defensivo: oculta labels técnicos (_legacy_, _tmp_) como no checkout público.
      const validSeats = (seatsRes.data ?? []).filter(
        (s: any) => !s.label.startsWith('_legacy_') && !s.label.startsWith('_tmp_')
      );
      setSeats(validSeats as Seat[]);

      const ticketsData = ticketsRes.data ?? [];

      // Separar bloqueios operacionais de ocupação real (regra espelhada do checkout público).
      const saleIds = [...new Set(ticketsData.map((t: any) => t.sale_id).filter(Boolean))];
      let blockSaleIds = new Set<string>();

      if (saleIds.length > 0) {
        const { data: salesData } = await supabase
          .from('sales')
          .select('id, status')
          .in('id', saleIds);

        // Bloqueio operacional: status = 'bloqueado' e não cancelado
        blockSaleIds = new Set(
          (salesData ?? [])
            .filter((s: any) => s.status === 'bloqueado')
            .map((s: any) => s.id)
        );
      }

      const blocked: string[] = [];
      const occupied: string[] = [];
      ticketsData.forEach((t: any) => {
        if (!t.seat_id) return;
        if (blockSaleIds.has(t.sale_id)) blocked.push(t.seat_id);
        else occupied.push(t.seat_id);
      });

      setOccupiedSeatIds(occupied);
      setBlockedSeatIds(blocked);
      setSelectedSeats([]);
      setLoadingSeats(false);
    };
    fetchSeatsAndOccupied();
  }, [selectedTripId, selectedVehicle?.id]);

  // ── Initialize passengers when moving to step 3 ──
  const initPassengers = () => {
    const isBlock = activeTab === 'bloqueio';
    const newPassengers: PassengerData[] = selectedSeats.map((seatId) => {
      const seat = seats.find((s) => s.id === seatId);
      return {
        seatId,
        seatLabel: seat?.label ?? '',
        name: isBlock ? 'BLOQUEIO' : '',
        cpf: isBlock ? '00000000000' : '',
        phone: '',
      };
    });
    setPassengers(newPassengers);
    if (selectedEvent) {
      setUnitPrice(formatCurrencyBRL(selectedEvent.unit_price));
    }
  };

  // ── Passenger field update ──
  const updatePassenger = (index: number, field: keyof PassengerData, value: string) => {
    let formatted = value;
    if (field === 'cpf') formatted = formatCpfMask(value);
    else if (field === 'phone') formatted = formatPhoneMask(value);
    setPassengers((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: formatted } : p)));
  };

  // ── Validation ──
  const canGoStep2 = selectedEventId && selectedTripId && selectedBoardingId && (!mandatoryReturnPolicy || !!selectedReturnTripId);
  const canGoStep3 = selectedSeats.length > 0;

  const canConfirm = useMemo(() => {
    if (saving) return false;
    const isBlock = activeTab === 'bloqueio';
    for (const p of passengers) {
      if (!isBlock) {
        if (!p.name.trim()) return false;
        const cpfClean = p.cpf.replace(/\D/g, '');
        if (cpfClean.length !== 11) return false;
      }
    }
    if (activeTab === 'manual') {
      const price = parseCurrencyInputBRL(unitPrice);
      if (isNaN(price) || price < 0) return false;
    }
    return passengers.length > 0;
  }, [passengers, activeTab, unitPrice, saving]);

  const manualSaleFinancialSummary = useMemo(() => {
    if (activeTab !== 'manual') return null;

    const pricePerTicket = parseCurrencyInputBRL(unitPrice);
    if (isNaN(pricePerTicket) || pricePerTicket < 0) return null;

    const quantity = passengers.length;
    const feeBreakdown = calculateFees(pricePerTicket, eventFees);
    const subtotal = pricePerTicket * quantity;
    const totalServiceFee = feeBreakdown.totalFees * quantity;

    return {
      pricePerTicket,
      quantity,
      subtotal,
      totalServiceFee,
      totalSale: subtotal + totalServiceFee,
    };
  }, [activeTab, unitPrice, passengers.length, eventFees]);

  // ── Build TicketCardData for confirmation ──
  const buildTicketCardData = (ticket: TicketRecord): TicketCardData => {
    const selectedBoarding = boardingOptions.find((b) => b.id === selectedBoardingId);
    const companyDisplayName = company?.trade_name || company?.name || '';
    const isManualSale = activeTab === 'manual';
    const ticketUnitPrice = isManualSale ? parseCurrencyInputBRL(unitPrice) : (selectedEvent?.unit_price ?? 0);
    const feeBreakdown = calculateFees(ticketUnitPrice, eventFees);

    // Reutiliza exatamente o detalhamento de taxas do ticket padrão para manter consistência visual e de exportação.
    const ticketFees = feeBreakdown.fees.map((fee) => ({
      name: fee.name,
      amount: fee.amount,
    }));

    return {
      ticketId: ticket.id,
      qrCodeToken: ticket.qr_code_token,
      passengerName: ticket.passenger_name,
      passengerCpf: ticket.passenger_cpf,
      seatLabel: ticket.seat_label,
      boardingStatus: ticket.boarding_status,
      eventName: selectedEvent?.name || '',
      eventDate: selectedEvent?.date || '',
      eventCity: selectedEvent?.city || '',
      eventTransportPolicy: selectedEvent?.transport_policy ?? 'trecho_independente',
      boardingToleranceMinutes: selectedEvent?.boarding_tolerance_minutes ?? null,
      boardingLocationName: selectedBoarding?.name || '',
      boardingLocationAddress: selectedBoarding?.address || '',
      boardingDepartureTime: selectedBoarding?.departure_time || null,
      boardingDepartureDate: selectedBoarding?.departure_date || null,
      // A passagem de venda manual nasce como RESERVADA: só vira 'pago' após quitação da taxa da plataforma.
      saleStatus: 'reservado' as any,
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
      vehicleType: selectedTrip?.vehicle?.type || null,
      vehiclePlate: selectedTrip?.vehicle?.plate || null,
      driverName: selectedTrip?.driver?.name || null,
      fees: ticketFees,
      totalPaid: feeBreakdown.unitPriceWithFees,
      unitPrice: ticketUnitPrice,
    };
  };

  // ── Submit ──
  const handleConfirm = async () => {
    if (!activeCompanyId || !user) return;
    setSaving(true);

    try {
      // Revalidate seats
      const { data: currentTickets } = await supabase
        .from('tickets')
        .select('seat_id')
        .eq('trip_id', selectedTripId);
      const currentOccupied = new Set((currentTickets ?? []).map((t: any) => t.seat_id).filter(Boolean));
      const conflicting = selectedSeats.filter((id) => currentOccupied.has(id));
      if (conflicting.length > 0) {
        const labels = conflicting.map((id) => seats.find((s) => s.id === id)?.label).join(', ');
        toast.error(`Assentos já ocupados: ${labels}. Selecione outros.`);
        setOccupiedSeatIds(Array.from(currentOccupied) as string[]);
        setSelectedSeats((prev) => prev.filter((id) => !currentOccupied.has(id)));
        setStep(2);
        setSaving(false);
        return;
      }

      const isBlock = activeTab === 'bloqueio';
      const isManual = activeTab === 'manual';
      const basePrice = isManual ? parseCurrencyInputBRL(unitPrice) : (selectedEvent?.unit_price ?? 0);
      const usesCatPricing = Boolean((selectedEvent as any)?.use_category_pricing) && categoryPricesMap.size > 0;

      // Per-seat total when category pricing is active
      const getSeatCatPrice = (seatId: string): number => {
        if (!usesCatPricing) return basePrice;
        const seat = seats.find((s) => s.id === seatId);
        if (!seat) return basePrice;
        return categoryPricesMap.get(seat.category) ?? basePrice;
      };

      const quantity = passengers.length;
      const seatsTotal = usesCatPricing
        ? selectedSeats.reduce((sum, seatId) => sum + getSeatCatPrice(seatId), 0)
        : basePrice * quantity;
      const feeBreakdown = calculateFees(basePrice, eventFees);
      const grossTotal = isBlock ? 0 : seatsTotal + (feeBreakdown.totalFees * quantity);

      const selectedBoarding = boardingOptions.find((b) => b.id === selectedBoardingId);

      // ── Cálculo da taxa da plataforma para vendas manuais ──
      // Fonte de verdade: company.platform_fee_percent (definido na empresa).
      // Vendas online usam application_fee via Stripe Connect (platform_fee_status = 'not_applicable').
      // Vendas manuais precisam de cobrança separada da taxa (platform_fee_status = 'pending').
      // Bloqueios não representam venda real e ficam como 'not_applicable'.
      const platformFeePercent = company?.platform_fee_percent ?? 0;
      const hasPlatformFee = isManual && platformFeePercent > 0 && grossTotal > 0;
      const platformFeeAmount = hasPlatformFee
        ? Math.round(grossTotal * (platformFeePercent / 100) * 100) / 100
        : null;

      // Determinar sale_origin para rastreabilidade
      const saleOrigin = isBlock ? 'admin_block' : (isManual ? 'admin_manual' : 'admin_manual');

      // 1. Insert sale
      // Regra crítica: toda venda criada manualmente no admin nasce como 'reservado'.
      // A transição para 'pago' acontece somente após confirmação da taxa da plataforma.
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert({
          event_id: selectedEventId,
          trip_id: selectedTripId,
          boarding_location_id: selectedBoarding?.boarding_location_id ?? selectedBoardingId,
          customer_name: isBlock ? 'BLOQUEIO' : passengers[0]?.name.trim(),
          customer_cpf: isBlock ? '00000000000' : passengers[0]?.cpf.replace(/\D/g, ''),
          customer_phone: isBlock ? '' : (passengers[0]?.phone?.replace(/\D/g, '') ?? ''),
          quantity,
          unit_price: basePrice,
          // Mantemos 'reservado' tanto para venda manual quanto para reserva/bloqueio até a etapa final do fluxo.
          status: 'reservado',
          gross_amount: grossTotal,
          company_id: activeCompanyId,
          seller_id: selectedSellerId && selectedSellerId !== '__none__' ? selectedSellerId : null,
          // Campos de controle da taxa da plataforma (vendas manuais)
          sale_origin: saleOrigin,
          platform_fee_amount: platformFeeAmount,
          platform_fee_status: hasPlatformFee ? 'pending' : 'not_applicable',
        } as any)
        .select('id')
        .single();

      if (saleError) throw saleError;
      const saleId = saleData.id;

      // 2. Insert tickets
      const ticketRows = passengers.map((p) => ({
        sale_id: saleId,
        trip_id: selectedTripId,
        seat_id: p.seatId,
        seat_label: p.seatLabel,
        passenger_name: p.name.trim(),
        passenger_cpf: p.cpf.replace(/\D/g, ''),
        passenger_phone: p.phone?.replace(/\D/g, '') || null,
        boarding_status: 'pendente',
        company_id: activeCompanyId,
      }));
      const { error: ticketError } = await supabase.from('tickets').insert(ticketRows as any);
      if (ticketError) throw ticketError;

      if ((mandatoryReturnPolicy || includeReturnTrip) && selectedReturnTripId) {
        // Mantemos uma única venda para o financeiro e adicionamos tickets da volta por trip_id.
        const returnTicketRows = passengers.map((p, index) => ({
          sale_id: saleId,
          trip_id: selectedReturnTripId,
          seat_id: null,
          seat_label: `VOLTA-${index + 1}`,
          passenger_name: p.name.trim(),
          passenger_cpf: p.cpf.replace(/\D/g, ''),
          passenger_phone: p.phone?.replace(/\D/g, '') || null,
          boarding_status: 'pendente',
          company_id: activeCompanyId,
        }));

        const { error: returnTicketError } = await supabase.from('tickets').insert(returnTicketRows as any);
        if (returnTicketError) throw returnTicketError;
      }

      // 3. Insert sale_log
      let logAction = '';
      let logDescription = '';
      if (isManual) {
        // Mantemos a action legada por compatibilidade com histórico/auditoria.
        logAction = 'manual_paid_created';
        const methodLabels: Record<string, string> = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão', outro: 'Outro' };
        logDescription = `Venda manual criada como reservada (${methodLabels[paymentMethod] ?? paymentMethod})${observation ? `. Obs: ${observation}` : ''}`;
      } else if (activeTab === 'reserva') {
        logAction = 'reservation_created';
        logDescription = `Reserva criada${observation ? `. Obs: ${observation}` : ''}`;
      } else {
        logAction = 'seat_block_created';
        const reasonLabels: Record<string, string> = { manutencao: 'Manutenção', staff: 'Staff', cortesia: 'Cortesia', seguranca: 'Segurança', outro: 'Outro' };
        logDescription = `Poltrona bloqueada (${reasonLabels[blockReason] ?? blockReason})${observation ? `. Obs: ${observation}` : ''}`;
      }

      await supabase.from('sale_logs').insert({
        sale_id: saleId,
        action: logAction,
        description: logDescription,
        performed_by: user.id,
        company_id: activeCompanyId,
      } as any);

      const successMessages: Record<SaleTab, string> = {
        manual: hasPlatformFee
          ? `Venda manual criada! Taxa da plataforma (${formatCurrencyBRL(platformFeeAmount!)}) pendente de pagamento.`
          : 'Venda manual criada com sucesso!',
        reserva: 'Reserva criada. Você pode marcar como paga depois.',
        bloqueio: 'Poltrona(s) bloqueada(s) com sucesso!',
      };
      toast.success(successMessages[activeTab]);

      // For blocks, close immediately
      if (isBlock) {
        onSuccess();
        return;
      }

      // 4. Re-fetch tickets to get qr_code_token
      const { data: freshTickets } = await supabase
        .from('tickets')
        .select('*')
        .eq('sale_id', saleId)
        .order('seat_label');

      if (freshTickets && freshTickets.length > 0) {
        const confirmData: ConfirmationTicketData[] = (freshTickets as TicketRecord[]).map((t) => ({
          ticket: t,
          ticketCardData: buildTicketCardData(t),
        }));
        setConfirmationData(confirmData);
        // activeTicketIndex reset removido
        setStep(4);
      } else {
        onSuccess();
      }
    } catch (err: any) {
      console.error('Erro ao criar venda:', err);
      toast.error(err.message || 'Erro ao criar venda');
    } finally {
      setSaving(false);
    }
  };

  // ── Tab change resets step ──
  const handleTabChange = (tab: string) => {
    setActiveTab(tab as SaleTab);
    setStep(1);
    setSelectedSeats([]);
    setPassengers([]);
    setObservation('');
    setConfirmationData(null);
  };

  const availableCapacity = selectedVehicle ? selectedVehicle.capacity - occupiedSeatIds.length : 999;
  const stepMeta = [
    { value: 1, label: 'Evento', Icon: Bus },
    { value: 2, label: 'Assentos', Icon: Users },
    { value: 3, label: 'Pagamento', Icon: CreditCard },
  ];

  const handleClose = () => {
    if (confirmationData) {
      onSuccess();
    } else {
      onOpenChange(false);
    }
  };

  // ── Render ──
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="admin-modal flex h-[90vh] max-h-[90vh] w-[95vw] max-w-3xl flex-col gap-0 p-0">
        <DialogHeader className="admin-modal__header px-6 py-4">
          <DialogTitle>{step === 4 ? 'Comprovante de Reserva' : 'Nova Venda'}</DialogTitle>
        </DialogHeader>

        {step === 4 && confirmationData ? (
          // ── Step 4: Confirmation using the same virtual ticket component used across the app ──
          <>
            <ScrollArea className="flex-1 px-6 py-4">
              <div className="mx-auto w-full max-w-2xl">
                {/* Agrupamento por passageiro com ida/volta sob demanda */}
                <PassengerTicketList
                  tickets={confirmationData.map((item) => item.ticketCardData)}
                  allowReservedDownloads
                  // No fluxo de venda manual reservada, usamos modo de comprovante para descaracterizar
                  // a aparência de passe operacional (sem QR funcional e com alerta explícito).
                  reservedPresentation="receipt"
                  context="admin"
                />
              </div>
            </ScrollArea>
            <DialogFooter className="px-6 py-4 border-t">
              <Button onClick={handleClose}>Fechar</Button>
            </DialogFooter>
          </>
        ) : (
          // ── Steps 1-3: Wizard ──
          <Tabs value={activeTab} onValueChange={handleTabChange} className="flex h-full flex-col overflow-hidden">
            <TabsList className="admin-modal__tabs flex h-auto w-full flex-wrap justify-start gap-1 px-6 py-2">
              <TabsTrigger value="manual">Venda Manual</TabsTrigger>
              <TabsTrigger value="reserva">Reserva</TabsTrigger>
              <TabsTrigger value="bloqueio">Bloquear Poltrona</TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1 px-6 py-4">
              {/* Step indicators */}
              <div className="mb-5 rounded-xl border bg-muted/20 px-4 py-3">
                <div className="flex items-center gap-2">
                  {stepMeta.map((item, index) => {
                    const isCompleted = item.value < step;
                    const isActive = item.value === step;
                    return (
                      <div key={item.value} className="flex flex-1 items-center gap-2">
                        <div
                          className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2 ${
                            isActive
                              ? 'border-primary bg-primary/10 text-primary'
                              : isCompleted
                              ? 'border-primary/30 bg-primary/5 text-primary'
                              : 'border-border bg-background text-muted-foreground'
                          }`}
                        >
                          {isCompleted ? <CircleCheck className="h-4 w-4" /> : <item.Icon className="h-4 w-4" />}
                          <span className="text-sm font-medium">{item.label}</span>
                        </div>
                        {index < stepMeta.length - 1 && <div className="h-px w-4 bg-border" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* All tabs share the same wizard */}
              <TabsContent value={activeTab} className="mt-0" forceMount>
                {/* STEP 1 — Context */}
                {step === 1 && (
                  <div className="space-y-5">
                    {/* Event */}
                    <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
                      <Label>Evento *</Label>
                      {loadingEvents ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
                      ) : (
                        <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                          <SelectTrigger><SelectValue placeholder="Selecione o evento" /></SelectTrigger>
                          <SelectContent>
                            {events.map((e) => (
                              <SelectItem key={e.id} value={e.id}>
                                {formatDateOnlyBR(e.date)} — {e.name} ({e.city})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    {/* Trip/Vehicle */}
                    <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
                      <Label>Transporte *</Label>
                      {loadingTrips ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
                      ) : (
                        <Select value={selectedTripId} onValueChange={setSelectedTripId} disabled={!selectedEventId}>
                          <SelectTrigger><SelectValue placeholder="Selecione o transporte" /></SelectTrigger>
                          <SelectContent>
                            {(groupedTransportPolicy ? trips.filter((t) => t.trip_type === 'ida') : trips).map((t) => {
                              const v = t.vehicle;
                              const soldSeatsCount = tripSoldSeats[t.id] ?? 0;
                              const remainingSeats = v ? Math.max(v.capacity - soldSeatsCount, 0) : 0;
                              const eventDateLabel = selectedEvent?.date ? formatDateOnlyBR(selectedEvent.date, 'dd/MM') : '--/--';
                              return (
                                <SelectItem key={t.id} value={t.id}>
                                  {/* Mantém o trigger compacto e evita "estouro" visual ao selecionar o transporte. */}
                                  {v
                                    ? `${vehicleTypeLabels[v.type] ?? v.type} ${v.plate} — ${getTripTypeLabel(t.trip_type)} • ${eventDateLabel} ${t.departure_time?.slice(0, 5) || '--:--'} • ${remainingSeats} vagas`
                                    : t.id.slice(0, 8)}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      )}
                      {selectedEventId && selectedEventPolicy === 'trecho_independente' && (
                        <p className="text-xs text-muted-foreground">Vagas controladas por trecho.</p>
                      )}
                      {!!selectedTrip && (
                        <div className="space-y-2 rounded-lg border bg-background/80 p-3 text-xs text-muted-foreground">
                          {groupedTransportPolicy && (
                            <div className="flex items-center justify-between rounded-md border bg-muted/40 px-2 py-1">
                              <span>{mandatoryReturnPolicy ? 'Volta obrigatória' : 'Adicionar volta opcional'}</span>
                              <Checkbox
                                checked={mandatoryReturnPolicy ? true : includeReturnTrip}
                                disabled={mandatoryReturnPolicy || !selectedReturnTripId}
                                onCheckedChange={(checked) => setIncludeReturnTrip(Boolean(checked))}
                              />
                            </div>
                          )}
                          <div className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1 font-medium text-foreground">
                            <Route className="h-3.5 w-3.5" />
                            {getTripTypeLabel(selectedTrip.trip_type)}
                          </div>
                          <div className="flex items-center gap-2">
                            <CalendarClock className="h-3.5 w-3.5" />
                            Saída prevista: {selectedEvent?.date ? formatDateOnlyBR(selectedEvent.date, 'dd/MM') : '--/--'} às {selectedTrip.departure_time?.slice(0, 5) || '--:--'}
                          </div>
                          <div className="flex items-center gap-2 text-primary">
                            <Bus className="h-3.5 w-3.5" />
                            Capacidade: {selectedVehicle?.capacity ?? 0} • Vagas restantes: {selectedTripRemainingSeats}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Boarding location */}
                    <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
                      <Label>Local / Horário de Embarque *</Label>
                      {loadingBoarding ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
                      ) : (
                        <Select value={selectedBoardingId} onValueChange={setSelectedBoardingId} disabled={!selectedTripId}>
                          <SelectTrigger><SelectValue placeholder="Selecione o embarque" /></SelectTrigger>
                          <SelectContent>
                            {boardingOptions.map((b) => (
                              <SelectItem key={b.id} value={b.id}>
                                {b.name}
                                {b.departure_time ? ` — ${b.departure_time.slice(0, 5)}` : ''}
                                {b.departure_date ? ` (${formatDateOnlyBR(b.departure_date, 'dd/MM')})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {selectedBoardingId && (
                        <p className="text-xs font-medium text-primary">Confira o horário de embarque para evitar atraso.</p>
                      )}
                    </div>
                  </div>
                )}

                {/* STEP 2 — Seat map */}
                {step === 2 && (
                  <div>
                    {loadingSeats ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : seats.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <p>Nenhum assento cadastrado para este veículo.</p>
                      </div>
                    ) : (
                      <SeatMap
                        seats={seats}
                        occupiedSeatIds={occupiedSeatIds}
                        blockedSeatIds={blockedSeatIds}
                        maxSelection={availableCapacity}
                        selectedSeats={selectedSeats}
                        onSelectionChange={setSelectedSeats}
                        floors={selectedVehicle?.floors ?? 1}
                        seatsLeftSide={selectedVehicle?.seats_left_side ?? 2}
                        seatsRightSide={selectedVehicle?.seats_right_side ?? 2}
                        showSelectionQuantityLabel
                      />
                    )}
                  </div>
                )}

                {/* STEP 3 — Passenger data */}
                {step === 3 && (
                  <div className="space-y-6">
                    {/* Tab-specific fields */}
                    {activeTab === 'manual' && (
                      <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label>Forma de recebimento *</Label>
                            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pix">Pix</SelectItem>
                                <SelectItem value="dinheiro">Dinheiro</SelectItem>
                                <SelectItem value="cartao">Cartão</SelectItem>
                                <SelectItem value="outro">Outro</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Preço por passagem *</Label>
                            <Input
                              type="text"
                              inputMode="numeric"
                              value={unitPrice}
                              onChange={(e) => setUnitPrice(formatCurrencyInputFromDigits(e.target.value))}
                            />
                            {passengers.length > 0 && unitPrice && (() => {
                              const pricePerTicket = parseCurrencyInputBRL(unitPrice);
                              if (isNaN(pricePerTicket) || pricePerTicket < 0) return null;
                              const subtotal = pricePerTicket * passengers.length;
                              return (
                                <p className="text-xs font-medium text-muted-foreground">
                                  {formatCurrencyBRL(pricePerTicket)} × {passengers.length} passagem{passengers.length === 1 ? '' : 'ens'} = {formatCurrencyBRL(subtotal)}
                                </p>
                              );
                            })()}
                            {selectedEvent && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Preço do evento: {formatCurrencyBRL(selectedEvent.unit_price)}
                              </p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label>Vendedor (opcional)</Label>
                            <Select value={selectedSellerId || '__none__'} onValueChange={(v) => setSelectedSellerId(v === '__none__' ? '' : v)}>
                              <SelectTrigger><SelectValue placeholder="Sem vendedor" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Sem vendedor</SelectItem>
                                {sellersList.map((s) => (
                                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Observação</Label>
                          <Textarea
                            value={observation}
                            onChange={(e) => setObservation(e.target.value)}
                            placeholder="Ex: Recebido via Pix na hora do embarque"
                            rows={2}
                          />
                        </div>

                      </div>
                    )}

                    {activeTab === 'reserva' && (
                      <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Vendedor (opcional)</Label>
                            <Select value={selectedSellerId || '__none__'} onValueChange={(v) => setSelectedSellerId(v === '__none__' ? '' : v)}>
                              <SelectTrigger><SelectValue placeholder="Sem vendedor" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Sem vendedor</SelectItem>
                                {sellersList.map((s) => (
                                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Observação</Label>
                          <Textarea
                            value={observation}
                            onChange={(e) => setObservation(e.target.value)}
                            placeholder="Ex: Cliente vai pagar no dia do evento"
                            rows={2}
                          />
                        </div>
                      </div>
                    )}

                    {activeTab === 'bloqueio' && (
                      <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
                        <div className="space-y-2">
                          <Label>Motivo do bloqueio *</Label>
                          <Select value={blockReason} onValueChange={setBlockReason}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="manutencao">Manutenção</SelectItem>
                              <SelectItem value="staff">Staff</SelectItem>
                              <SelectItem value="cortesia">Cortesia</SelectItem>
                              <SelectItem value="seguranca">Segurança</SelectItem>
                              <SelectItem value="outro">Outro</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Observação</Label>
                          <Textarea
                            value={observation}
                            onChange={(e) => setObservation(e.target.value)}
                            placeholder="Detalhe o motivo do bloqueio"
                            rows={2}
                          />
                        </div>
                      </div>
                    )}

                    {/* Passenger forms */}
                    {activeTab !== 'bloqueio' && (
                      <div className="space-y-4">
                        <h3 className="text-sm font-medium">Dados dos passageiros ({passengers.length})</h3>
                        {passengers.map((p, i) => (
                          <div key={p.seatId} className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono">{p.seatLabel}</Badge>
                              <span className="text-sm font-medium text-foreground">Passageiro {i + 1}</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs">Nome *</Label>
                                <Input
                                  value={p.name}
                                  onChange={(e) => updatePassenger(i, 'name', e.target.value)}
                                  placeholder="Nome completo"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">CPF *</Label>
                                <Input
                                  value={p.cpf}
                                  onChange={(e) => updatePassenger(i, 'cpf', e.target.value)}
                                  placeholder="000.000.000-00"
                                  maxLength={14}
                                  className={
                                    p.cpf.length >= 14
                                      ? isValidCpf(p.cpf)
                                        ? 'border-emerald-500/70 focus-visible:ring-emerald-500/30'
                                        : 'border-destructive/70 focus-visible:ring-destructive/30'
                                      : undefined
                                  }
                                />
                                {p.cpf.length >= 14 && (
                                  <p className={`flex items-center gap-1 text-[11px] ${isValidCpf(p.cpf) ? 'text-emerald-600' : 'text-destructive'}`}>
                                    {isValidCpf(p.cpf) ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                                    {isValidCpf(p.cpf) ? 'CPF válido' : 'CPF inválido'}
                                  </p>
                                )}
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Telefone</Label>
                                <Input
                                  value={p.phone}
                                  onChange={(e) => updatePassenger(i, 'phone', e.target.value)}
                                  placeholder="(65) 99999-9999"
                                  maxLength={15}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {activeTab === 'bloqueio' && (
                      <div className="text-sm text-muted-foreground">
                        <p>{passengers.length} poltrona(s) serão bloqueadas com nome "BLOQUEIO".</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {passengers.map((p) => (
                            <Badge key={p.seatId} variant="secondary" className="font-mono">{p.seatLabel}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Simulação de cálculo compartilhada com /admin/eventos (sem card resumo extra). */}
                    {activeTab === 'manual' && passengers.length > 0 && unitPrice && (() => {
                      const price = parseCurrencyInputBRL(unitPrice);
                      return (
                        <CalculationSimulationCard
                          basePrice={price}
                          fees={eventFees}
                          quantity={passengers.length}
                          showSaleTotals
                          platformFeePercent={company?.platform_fee_percent}
                          passPlatformFeeToCustomer={false}
                        />
                      );
                    })()}
                  </div>
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        )}

        {/* Footer navigation (steps 1-3 only) */}
        {step < 4 && (
          <DialogFooter className="px-6 py-4 border-t flex-row justify-between">
            <div>
              {step > 1 && (
                <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              {step < 3 && (
                <Button
                  onClick={() => {
                    if (step === 2) initPassengers();
                    setStep((s) => s + 1);
                  }}
                  disabled={step === 1 ? !canGoStep2 : !canGoStep3}
                >
                  Próximo <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
              {step === 3 && (
                <Button onClick={handleConfirm} disabled={!canConfirm}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Confirmar
                </Button>
              )}
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
