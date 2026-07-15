import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getPersistedTripId, getPersistedPhase } from '@/lib/driverTripStorage';
import { PHASE_CONFIG } from '@/lib/driverPhaseConfig';
import type { OperationalPhase } from '@/lib/driverTripStorage';
import { buildEventOperationalEndMap, isOperationallyVisible } from '@/lib/eventOperationalWindow';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { ArrowLeft, CheckCircle2, Clock, Loader2, MapPin, Phone, RefreshCw, Search, Users, MessageCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PassengerRow {
  ticketId: string;
  passengerName: string;
  passengerCpf: string | null;
  seatLabel: string;
  boardingStatus: string;
  qrCodeToken: string;
  boardingLocationId: string;
  boardingLocationName: string;
  passengerPhone: string | null;
  saleCustomerName: string | null;
  saleCustomerPhone: string | null;
  ticketNumber: string | null;
  ticketTypeName: string | null;
  finalPrice: number | null;
}

type StatusFilter = 'all' | 'done' | 'pending';

interface DriverTripRow {
  id: string;
  events: {
    id: string;
    date: string;
  };
}

interface DriverBoardingRow {
  event_id: string;
  departure_date: string | null;
  departure_time: string | null;
}

interface ValidationResult {
  result?: string;
  boarding_status?: string;
  reason_code?: string;
}

interface LocationOption {
  id: string;
  name: string;
}


function getDisplayStatus(status: string) {
  if (status === 'pendente') return 'Pendente';
  if (status === 'checked_in') return 'Embarcado';
  if (status === 'checked_out') return 'Desembarcou';
  if (status === 'reboarded') return 'Reembarcou';
  return status;
}

function getContactDigits(phone?: string | null) {
  return phone?.replace(/\D/g, '') ?? '';
}

function getBrazilWhatsappDigits(phone?: string | null) {
  const digits = getContactDigits(phone);
  if (!digits) return '';
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return '';
}

function formatCurrency(value: number | null) {
  return typeof value === 'number'
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
    : '—';
}

function getInitialStatusFilter(value: string | null): StatusFilter {
  return value === 'done' || value === 'pending' ? value : 'all';
}

export default function DriverBoarding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, userRole, loading, activeCompanyId } = useAuth();
  const { toast } = useToast();

  const canAccess =
    userRole === 'motorista' || userRole === 'operador' || userRole === 'gerente' || userRole === 'developer';

  const [passengers, setPassengers] = useState<PassengerRow[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => getInitialStatusFilter(searchParams.get('status')));
  const [loadingData, setLoadingData] = useState(true);
  const [selectedPassenger, setSelectedPassenger] = useState<PassengerRow | null>(null);
  const [confirmPassenger, setConfirmPassenger] = useState<PassengerRow | null>(null);
  const [undoPassenger, setUndoPassenger] = useState<PassengerRow | null>(null);
  const [processing, setProcessing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [_tripId, setTripId] = useState<string | null>(null);
  const [allowManualBoarding, setAllowManualBoarding] = useState(true);

  // Read phase from localStorage
  const activePhase: OperationalPhase = user && activeCompanyId
    ? getPersistedPhase(user.id, activeCompanyId)
    : 'ida';
  const phaseConfig = PHASE_CONFIG[activePhase];

  const fetchData = useCallback(async (silent = false) => {
    if (!user || !activeCompanyId) return;
    if (!silent) setLoadingData(true);
    if (silent) setRefreshing(true);

    const { data: companySettings } = await supabase
      .from('companies')
      .select('allow_manual_boarding')
      .eq('id', activeCompanyId)
      .maybeSingle();
    setAllowManualBoarding(companySettings?.allow_manual_boarding ?? true);

    const persistedTripId = getPersistedTripId(user.id, activeCompanyId);
    
    let tripId: string | null = null;

    if (persistedTripId) {
      const { data } = await supabase
        .from('trips')
        .select('id, events!inner(id, date, status)')
        .eq('id', persistedTripId)
        .eq('company_id', activeCompanyId)
        .eq('events.status', 'a_venda')
        .limit(1);
      if (data && data.length > 0) {
        const tripRows = data as unknown as DriverTripRow[];
        const eventRows = tripRows.map((row) => ({ id: row.events.id, date: row.events.date }));
        const { data: boardings } = await supabase
          .from('event_boarding_locations')
          .select('event_id, departure_date, departure_time')
          .in('event_id', eventRows.map((event) => event.id))
          .eq('company_id', activeCompanyId)
          .not('departure_date', 'is', null);

        const operationalEndMap = buildEventOperationalEndMap(eventRows, (boardings ?? []) as DriverBoardingRow[]);
        if (isOperationallyVisible(tripRows[0].events.id, operationalEndMap)) {
          tripId = tripRows[0].id;
        }
      }
    }

    if (!tripId) {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('driver_id')
        .eq('user_id', user.id)
        .eq('company_id', activeCompanyId)
        .single();

      const driverId = roleData?.driver_id;
      let trips: DriverTripRow[] | null = null;

      if (driverId) {
        const { data } = await supabase
          .from('trips')
          .select('id, events!inner(id, date, status)')
          .eq('company_id', activeCompanyId)
          .eq('events.status', 'a_venda')
          .or(`driver_id.eq.${driverId},assistant_driver_id.eq.${driverId}`)
          .order('events(date)', { ascending: true });
        trips = data as unknown as DriverTripRow[] | null;
      }

      if (!trips || trips.length === 0) {
        const { data } = await supabase
          .from('trips')
          .select('id, events!inner(id, date, status)')
          .eq('company_id', activeCompanyId)
          .eq('events.status', 'a_venda')
          .order('events(date)', { ascending: true });
        trips = data as unknown as DriverTripRow[] | null;
      }

      if (trips && trips.length > 0) {
        const eventRows = trips.map((row) => ({ id: row.events.id, date: row.events.date }));
        const { data: boardings } = await supabase
          .from('event_boarding_locations')
          .select('event_id, departure_date, departure_time')
          .in('event_id', eventRows.map((event) => event.id))
          .eq('company_id', activeCompanyId)
          .not('departure_date', 'is', null);

        const operationalEndMap = buildEventOperationalEndMap(eventRows, (boardings ?? []) as DriverBoardingRow[]);
        tripId = trips.find((row) => isOperationallyVisible(row.events.id, operationalEndMap))?.id ?? null;
      }
    }

    if (!tripId) {
      setLoadingData(false);
      setRefreshing(false);
      return;
    }

    setTripId(tripId);

    const { data: tickets } = await supabase
      .from('tickets')
      .select('id, passenger_name, passenger_phone, seat_label, boarding_status, qr_code_token, sale_id, ticket_number, ticket_type_name, final_price')
      .eq('trip_id', tripId)
      .eq('company_id', activeCompanyId);

    if (!tickets || tickets.length === 0) {
      setPassengers([]);
      setLoadingData(false);
      setRefreshing(false);
      return;
    }

    const saleIds = [...new Set(tickets.map(t => t.sale_id))];
    const { data: sales } = await supabase
      .from('sales')
      .select('id, boarding_location_id, status, customer_name, customer_phone, boarding_locations!inner(id, name)')
      .in('id', saleIds)
      .eq('status', 'pago');

    if (!sales) {
      setPassengers([]);
      setLoadingData(false);
      setRefreshing(false);
      return;
    }

    const salesMap = new Map(
      sales.map((s) => [
        s.id,
        { blId: s.boarding_location_id, blName: s.boarding_locations?.name ?? '—', customerName: s.customer_name ?? null, customerPhone: s.customer_phone ?? null },
      ])
    );

    const rows: PassengerRow[] = tickets
      .filter(t => salesMap.has(t.sale_id))
      .map(t => {
        const saleInfo = salesMap.get(t.sale_id)!;
        return {
          ticketId: t.id,
          passengerName: t.passenger_name,
          seatLabel: t.seat_label,
          boardingStatus: t.boarding_status,
          qrCodeToken: t.qr_code_token,
          boardingLocationId: saleInfo.blId,
          boardingLocationName: saleInfo.blName,
          passengerPhone: t.passenger_phone,
          saleCustomerName: saleInfo.customerName,
          saleCustomerPhone: saleInfo.customerPhone,
          ticketNumber: t.ticket_number,
          ticketTypeName: t.ticket_type_name,
          finalPrice: t.final_price,
        };
      })
      .sort((a, b) => {
        const numA = parseInt(a.seatLabel, 10);
        const numB = parseInt(b.seatLabel, 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.seatLabel.localeCompare(b.seatLabel);
      });

    setPassengers(rows);

    const uniqueLocs = new Map<string, string>();
    rows.forEach(r => uniqueLocs.set(r.boardingLocationId, r.boardingLocationName));
    setLocations(Array.from(uniqueLocs, ([id, name]) => ({ id, name })));

    setLoadingData(false);
    setRefreshing(false);
  }, [user, activeCompanyId]);

  useEffect(() => {
    if (user && activeCompanyId && canAccess) {
      fetchData();
    }
  }, [user, activeCompanyId, canAccess, fetchData]);

  useEffect(() => {
    // Permite que os cards da home abram esta lista existente já com o filtro ativo.
    setStatusFilter(getInitialStatusFilter(searchParams.get('status')));
  }, [searchParams]);

  useEffect(() => {
    if (!user || !activeCompanyId || !canAccess) return;
    const interval = setInterval(() => {
      fetchData(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [user, activeCompanyId, canAccess, fetchData]);

  const baseFilteredPassengers = useMemo(() => {
    let list = passengers;
    if (selectedLocation !== 'all') {
      list = list.filter(p => p.boardingLocationId === selectedLocation);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        p =>
          p.passengerName.toLowerCase().includes(q) ||
          p.seatLabel.toLowerCase().includes(q) ||
          p.boardingLocationName.toLowerCase().includes(q) ||
          (p.passengerPhone?.toLowerCase().includes(q) ?? false) ||
          getContactDigits(p.passengerPhone).includes(getContactDigits(q)) ||
          (p.saleCustomerPhone?.toLowerCase().includes(q) ?? false) ||
          getContactDigits(p.saleCustomerPhone).includes(getContactDigits(q)) ||
          (p.saleCustomerName?.toLowerCase().includes(q) ?? false) ||
          (p.ticketNumber?.toLowerCase().includes(q) ?? false)
      );
    }
    return list;
  }, [passengers, selectedLocation, searchQuery]);

  const filteredPassengers = useMemo(() => {
    if (statusFilter === 'done') {
      return baseFilteredPassengers.filter(p => phaseConfig.doneStatuses.includes(p.boardingStatus));
    }
    if (statusFilter === 'pending') {
      return baseFilteredPassengers.filter(p => phaseConfig.pendingStatuses.includes(p.boardingStatus));
    }
    return baseFilteredPassengers;
  }, [baseFilteredPassengers, statusFilter, phaseConfig]);

  const kpis = useMemo(() => {
    const list = baseFilteredPassengers;
    const done = list.filter(p => phaseConfig.doneStatuses.includes(p.boardingStatus)).length;
    const pending = list.filter(p => phaseConfig.pendingStatuses.includes(p.boardingStatus)).length;
    return { total: done + pending, done, pending };
  }, [baseFilteredPassengers, phaseConfig]);

  const locationSummaries = useMemo(() => {
    if (locations.length <= 1) return [];
    return locations.map(loc => {
      const locPassengers = passengers.filter(p => p.boardingLocationId === loc.id);
      const done = locPassengers.filter(p => phaseConfig.doneStatuses.includes(p.boardingStatus)).length;
      const pending = locPassengers.filter(p => phaseConfig.pendingStatuses.includes(p.boardingStatus)).length;
      return {
        id: loc.id,
        name: loc.name,
        total: done + pending,
        done,
        pending,
      };
    });
  }, [passengers, locations, phaseConfig]);

  const handleAction = async (passenger: PassengerRow) => {
    setProcessing(true);
    const { data, error } = await supabase.rpc('validate_ticket_scan', {
      p_qr_code_token: passenger.qrCodeToken,
      p_action: phaseConfig.action,
      p_device_info: navigator.userAgent,
      p_app_version: import.meta.env.VITE_APP_VERSION ?? 'web',
      p_source: 'manual_list',
    });

    if (error) {
      toast({ title: 'Erro', description: 'Não foi possível registrar a operação.', variant: 'destructive' });
      setProcessing(false);
      setConfirmPassenger(null);
      return;
    }

    const result = (Array.isArray(data) ? data[0] : data) as ValidationResult;
    if (result?.result === 'success') {
      const newStatus = result.boarding_status;
      setPassengers(prev =>
        prev.map(p =>
          p.ticketId === passenger.ticketId ? { ...p, boardingStatus: newStatus } : p
        )
      );
      setSelectedPassenger(null);
      toast({ title: phaseConfig.successTitle, description: `${passenger.passengerName} — Assento ${passenger.seatLabel}` });
    } else {
      const reasonMap: Record<string, string> = {
        already_checked_in: 'Já embarcado',
        already_checked_out: 'Desembarque já registrado',
        already_reboarded: 'Já reembarcado',
        checkout_without_checkin: 'Desembarque sem embarque',
        reboard_without_checkout: 'Reembarque sem desembarque',
        manual_boarding_disabled: 'Este embarque deve ser feito via QR Code',
      };
      const reason = reasonMap[result?.reason_code] ?? 'Operação bloqueada';
      toast({ title: reason, variant: 'destructive' });
    }

    setProcessing(false);
    setConfirmPassenger(null);
  };

  const handleUndo = async (passenger: PassengerRow) => {
    setProcessing(true);
    const { data, error } = await supabase.rpc('validate_ticket_scan', {
      p_qr_code_token: passenger.qrCodeToken,
      p_action: phaseConfig.undoAction,
      p_device_info: navigator.userAgent,
      p_app_version: import.meta.env.VITE_APP_VERSION ?? 'web',
      p_source: 'manual_list',
    });

    if (error) {
      toast({ title: 'Erro', description: 'Não foi possível desfazer a operação.', variant: 'destructive' });
      setProcessing(false);
      setUndoPassenger(null);
      return;
    }

    const result = (Array.isArray(data) ? data[0] : data) as ValidationResult;
    if (result?.result === 'success') {
      const newStatus = result.boarding_status;
      setPassengers(prev =>
        prev.map(p =>
          p.ticketId === passenger.ticketId ? { ...p, boardingStatus: newStatus } : p
        )
      );
      setSelectedPassenger(null);
      toast({ title: phaseConfig.undoSuccessTitle, description: `${passenger.passengerName} — Assento ${passenger.seatLabel}` });
    } else {
      const reason = result?.reason_code === 'undo_not_applicable'
        ? 'Operação não pode ser desfeita nesta fase'
        : 'Não foi possível desfazer';
      toast({ title: reason, variant: 'destructive' });
    }

    setProcessing(false);
    setUndoPassenger(null);
  };

  // Helper: is this passenger actionable in current phase?
  const isActionable = (p: PassengerRow) => phaseConfig.pendingStatuses.includes(p.boardingStatus);
  const isDone = (p: PassengerRow) => phaseConfig.doneStatuses.includes(p.boardingStatus);

  // Auth guards
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!userRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!canAccess) return <Navigate to="/admin/eventos" replace />;

  return (
    <div className="min-h-screen bg-background px-4 py-4">
      <div className="mx-auto w-full max-w-md space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate('/validador')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Voltar
          </Button>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-medium">
              {phaseConfig.label}
            </Badge>
            <span className="text-sm font-medium">Passageiros</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => fetchData(true)} aria-label="Atualizar" disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {loadingData ? (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-10" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : passengers.length === 0 ? (
          <Card>
            <CardContent className="p-5 text-center">
              <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhum passageiro encontrado para esta viagem.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* KPIs */}
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <button
                    type="button"
                    className={`rounded-lg p-2 transition-colors ${statusFilter === 'all' ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted'}`}
                    onClick={() => setStatusFilter('all')}
                  >
                    <p className="text-2xl font-bold">{kpis.total}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg p-2 transition-colors ${statusFilter === 'done' ? 'bg-green-500/10 ring-1 ring-green-500/40' : 'hover:bg-muted'}`}
                    onClick={() => setStatusFilter('done')}
                  >
                    <p className="text-2xl font-bold text-green-600">{kpis.done}</p>
                    <p className="text-xs text-muted-foreground">{phaseConfig.doneLabel}</p>
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg p-2 transition-colors ${statusFilter === 'pending' ? 'bg-orange-500/10 ring-1 ring-orange-500/40' : 'hover:bg-muted'}`}
                    onClick={() => setStatusFilter('pending')}
                  >
                    <p className="text-2xl font-bold text-orange-600">{kpis.pending}</p>
                    <p className="text-xs text-muted-foreground">{phaseConfig.pendingLabel}</p>
                  </button>
                </div>
              </CardContent>
            </Card>

            {!allowManualBoarding && (
              <Card className="border-amber-400/40 bg-amber-50">
                <CardContent className="p-3">
                  <p className="text-xs font-medium text-amber-800">Este embarque deve ser feito via QR Code</p>
                </CardContent>
              </Card>
            )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar passageiro..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Location filter */}
            {locations.length > 1 && (
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por local" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os locais</SelectItem>
                  {locations.map(loc => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Location summary cards */}
            {locationSummaries.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {locationSummaries.map(loc => (
                  <Card
                    key={loc.id}
                    className="cursor-pointer transition-colors hover:border-primary/50"
                    onClick={() => setSelectedLocation(loc.id === selectedLocation ? 'all' : loc.id)}
                  >
                    <CardContent className="p-3 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 text-primary shrink-0" />
                        <p className="text-xs font-medium truncate">{loc.name}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="text-green-600 font-medium">{loc.done}</span>
                        <span>/</span>
                        <span>{loc.total}</span>
                        {loc.pending > 0 && (
                          <span className="text-orange-600">· {loc.pending} pend.</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Passenger list */}
            <div className="space-y-2">
              {filteredPassengers.length === 0 ? (
                <Card>
                  <CardContent className="p-5 text-center">
                    <p className="text-sm text-muted-foreground">
                      {searchQuery.trim()
                        ? 'Nenhum passageiro encontrado para esta busca.'
                        : statusFilter === 'pending'
                          ? `Nenhum passageiro ${phaseConfig.pendingLabel.toLowerCase()}.`
                          : statusFilter === 'done'
                            ? `Nenhum passageiro ${phaseConfig.doneLabel.toLowerCase()}.`
                            : 'Nenhum passageiro encontrado.'}
                    </p>
                  </CardContent>
                </Card>
              ) : filteredPassengers.map(p => {
                const done = isDone(p);
                const actionable = isActionable(p);
                return (
                  <Card
                    key={p.ticketId}
                    className={`cursor-pointer transition-colors hover:border-primary/50 ${done ? 'border-green-500/40 bg-green-500/5' : ''}`}
                    onClick={() => setSelectedPassenger(p)}
                  >
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted font-bold text-sm">
                        {p.seatLabel}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.passengerName}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.boardingLocationName}</p>
                      </div>
                      {done ? (
                        <Badge variant="default" className="bg-green-600 shrink-0">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          {phaseConfig.doneBadge}
                        </Badge>
                      ) : actionable && allowManualBoarding ? (
                        <Badge variant="outline" className="shrink-0">
                          <Clock className="mr-1 h-3 w-3" />
                          {phaseConfig.pendingBadge}
                        </Badge>
                      ) : actionable && !allowManualBoarding ? (
                        <Badge variant="secondary" className="shrink-0 text-xs">Via QR Code</Badge>
                      ) : (
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          {getDisplayStatus(p.boardingStatus)}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {/* Passenger details */}
        <Dialog open={!!selectedPassenger} onOpenChange={(open) => !open && setSelectedPassenger(null)}>
          <DialogContent className="max-w-[calc(100vw-2rem)] rounded-lg sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{selectedPassenger?.passengerName}</DialogTitle>
              <DialogDescription>
                Assento {selectedPassenger?.seatLabel} · {selectedPassenger ? getDisplayStatus(selectedPassenger.boardingStatus) : ''}
              </DialogDescription>
            </DialogHeader>
            {selectedPassenger && (() => {
              const hasPassengerPhone = Boolean(selectedPassenger.passengerPhone?.trim());
              const hasBuyerPhone = Boolean(selectedPassenger.saleCustomerPhone?.trim());
              const phone = hasPassengerPhone ? selectedPassenger.passengerPhone : selectedPassenger.saleCustomerPhone;
              const phoneLabel = hasPassengerPhone ? 'Telefone do passageiro' : 'Telefone do comprador';
              const telDigits = getContactDigits(phone);
              const whatsappDigits = getBrazilWhatsappDigits(phone);
              const canCall = telDigits.length >= 10;
              const canWhatsapp = Boolean(whatsappDigits);
              const hasAnyPhone = hasPassengerPhone || hasBuyerPhone;
              const phoneFeedback = !hasAnyPhone
                ? 'Telefone não informado para este passageiro.'
                : !canCall && !canWhatsapp
                  ? 'Telefone informado não parece válido para WhatsApp ou ligação.'
                  : null;
              return (
                <div className="space-y-4">
                  <div className="grid gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">{hasAnyPhone ? phoneLabel : 'Telefone'}</p>
                      <p className="font-medium">{phone || 'Telefone não informado para este passageiro.'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Ponto/local de embarque</p>
                      <p className="font-medium">{selectedPassenger.boardingLocationName}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Status</p>
                        <p className="font-medium">{getDisplayStatus(selectedPassenger.boardingStatus)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Passagem</p>
                        <p className="font-medium">{selectedPassenger.ticketNumber || selectedPassenger.ticketId.slice(0, 8)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Tipo</p>
                        <p className="font-medium">{selectedPassenger.ticketTypeName || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Valor</p>
                        <p className="font-medium">{formatCurrency(selectedPassenger.finalPrice)}</p>
                      </div>
                    </div>
                    {selectedPassenger.saleCustomerName && selectedPassenger.saleCustomerName !== selectedPassenger.passengerName && (
                      <div>
                        <p className="text-xs text-muted-foreground">Comprador</p>
                        <p className="font-medium">{selectedPassenger.saleCustomerName}</p>
                      </div>
                    )}
                  </div>

                  {phoneFeedback && (
                    <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                      {phoneFeedback}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    {canWhatsapp ? (
                      <Button asChild variant="default">
                        <a href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noreferrer">
                          <MessageCircle className="mr-2 h-4 w-4" />
                          WhatsApp
                        </a>
                      </Button>
                    ) : (
                      <Button disabled variant="default">
                        <MessageCircle className="mr-2 h-4 w-4" />
                        WhatsApp
                      </Button>
                    )}
                    {canCall ? (
                      <Button asChild variant="outline">
                        <a href={`tel:${telDigits}`}>
                          <Phone className="mr-2 h-4 w-4" />
                          Ligar
                        </a>
                      </Button>
                    ) : (
                      <Button disabled variant="outline">
                        <Phone className="mr-2 h-4 w-4" />
                        Ligar
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      disabled={!isActionable(selectedPassenger) || !allowManualBoarding}
                      onClick={() => setConfirmPassenger(selectedPassenger)}
                    >
                      {phaseConfig.confirmAction}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!isDone(selectedPassenger)}
                      onClick={() => setUndoPassenger(selectedPassenger)}
                    >
                      Desfazer
                    </Button>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Confirm dialog */}
        <AlertDialog open={!!confirmPassenger} onOpenChange={() => setConfirmPassenger(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{phaseConfig.confirmTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {phaseConfig.confirmAction} de <strong>{confirmPassenger?.passengerName}</strong> (Assento{' '}
                {confirmPassenger?.seatLabel}) — Local: <strong>{confirmPassenger?.boardingLocationName}</strong>?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={processing}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={processing}
                onClick={() => confirmPassenger && handleAction(confirmPassenger)}
              >
                {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {phaseConfig.confirmAction}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Undo dialog */}
        <AlertDialog open={!!undoPassenger} onOpenChange={() => setUndoPassenger(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{phaseConfig.undoTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {phaseConfig.undoConfirmText} <strong>{undoPassenger?.passengerName}</strong> (Assento{' '}
                {undoPassenger?.seatLabel})?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={processing}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={processing}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => undoPassenger && handleUndo(undoPassenger)}
              >
                {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Desfazer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
