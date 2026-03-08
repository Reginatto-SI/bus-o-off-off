import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getPersistedTripId, getPersistedPhase } from '@/lib/driverTripStorage';
import { PHASE_CONFIG } from '@/lib/driverPhaseConfig';
import type { OperationalPhase } from '@/lib/driverTripStorage';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, CheckCircle2, Clock, Loader2, MapPin, RefreshCw, Search, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PassengerRow {
  ticketId: string;
  passengerName: string;
  seatLabel: string;
  boardingStatus: string;
  qrCodeToken: string;
  boardingLocationId: string;
  boardingLocationName: string;
}

interface LocationOption {
  id: string;
  name: string;
}

export default function DriverBoarding() {
  const navigate = useNavigate();
  const { user, userRole, loading, activeCompanyId } = useAuth();
  const { toast } = useToast();

  const canAccess =
    userRole === 'motorista' || userRole === 'operador' || userRole === 'gerente' || userRole === 'developer';

  const [passengers, setPassengers] = useState<PassengerRow[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [confirmPassenger, setConfirmPassenger] = useState<PassengerRow | null>(null);
  const [undoPassenger, setUndoPassenger] = useState<PassengerRow | null>(null);
  const [processing, setProcessing] = useState(false);
  const [_tripId, setTripId] = useState<string | null>(null);

  // Read phase from localStorage
  const activePhase: OperationalPhase = user && activeCompanyId
    ? getPersistedPhase(user.id, activeCompanyId)
    : 'ida';
  const phaseConfig = PHASE_CONFIG[activePhase];

  const fetchData = useCallback(async () => {
    if (!user || !activeCompanyId) return;
    setLoadingData(true);

    const persistedTripId = getPersistedTripId(user.id, activeCompanyId);
    
    let tripId: string | null = null;

    if (persistedTripId) {
      const { data } = await supabase
        .from('trips')
        .select('id, events!inner(status)')
        .eq('id', persistedTripId)
        .eq('company_id', activeCompanyId)
        .eq('events.status', 'a_venda')
        .limit(1);
      if (data && data.length > 0) tripId = data[0].id;
    }

    if (!tripId) {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('driver_id')
        .eq('user_id', user.id)
        .eq('company_id', activeCompanyId)
        .single();

      const driverId = roleData?.driver_id;
      let trips: any[] | null = null;

      if (driverId) {
        const { data } = await supabase
          .from('trips')
          .select('id, events!inner(status)')
          .eq('company_id', activeCompanyId)
          .eq('events.status', 'a_venda')
          .or(`driver_id.eq.${driverId},assistant_driver_id.eq.${driverId}`)
          .limit(1);
        trips = data;
      }

      if (!trips || trips.length === 0) {
        const { data } = await supabase
          .from('trips')
          .select('id, events!inner(status)')
          .eq('company_id', activeCompanyId)
          .eq('events.status', 'a_venda')
          .limit(1);
        trips = data;
      }

      tripId = trips?.[0]?.id ?? null;
    }

    if (!tripId) {
      setLoadingData(false);
      return;
    }

    setTripId(tripId);

    const { data: tickets } = await supabase
      .from('tickets')
      .select('id, passenger_name, seat_label, boarding_status, qr_code_token, sale_id')
      .eq('trip_id', tripId)
      .eq('company_id', activeCompanyId);

    if (!tickets || tickets.length === 0) {
      setPassengers([]);
      setLoadingData(false);
      return;
    }

    const saleIds = [...new Set(tickets.map(t => t.sale_id))];
    const { data: sales } = await supabase
      .from('sales')
      .select('id, boarding_location_id, status, boarding_locations!inner(id, name)')
      .in('id', saleIds)
      .eq('status', 'pago');

    if (!sales) {
      setPassengers([]);
      setLoadingData(false);
      return;
    }

    const salesMap = new Map(
      sales.map((s: any) => [
        s.id,
        { blId: s.boarding_location_id, blName: s.boarding_locations?.name ?? '—' },
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
  }, [user, activeCompanyId]);

  useEffect(() => {
    if (user && activeCompanyId && canAccess) {
      fetchData();
    }
  }, [user, activeCompanyId, canAccess, fetchData]);

  useEffect(() => {
    if (!user || !activeCompanyId || !canAccess) return;
    const interval = setInterval(() => {
      fetchData();
    }, 15000);
    return () => clearInterval(interval);
  }, [user, activeCompanyId, canAccess, fetchData]);

  const filteredPassengers = useMemo(() => {
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
          p.boardingLocationName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [passengers, selectedLocation, searchQuery]);

  const kpis = useMemo(() => {
    const list = filteredPassengers;
    const done = list.filter(p => phaseConfig.doneStatuses.includes(p.boardingStatus)).length;
    const pending = list.filter(p => phaseConfig.pendingStatuses.includes(p.boardingStatus)).length;
    return { total: done + pending, done, pending };
  }, [filteredPassengers, phaseConfig]);

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
    });

    if (error) {
      toast({ title: 'Erro', description: 'Não foi possível registrar a operação.', variant: 'destructive' });
      setProcessing(false);
      setConfirmPassenger(null);
      return;
    }

    const result = (Array.isArray(data) ? data[0] : data) as any;
    if (result?.result === 'success') {
      const newStatus = result.boarding_status;
      setPassengers(prev =>
        prev.map(p =>
          p.ticketId === passenger.ticketId ? { ...p, boardingStatus: newStatus } : p
        )
      );
      toast({ title: phaseConfig.successTitle, description: `${passenger.passengerName} — Assento ${passenger.seatLabel}` });
    } else {
      const reasonMap: Record<string, string> = {
        already_checked_in: 'Já embarcado',
        already_checked_out: 'Desembarque já registrado',
        already_reboarded: 'Já reembarcado',
        checkout_without_checkin: 'Desembarque sem embarque',
        reboard_without_checkout: 'Reembarque sem desembarque',
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
    });

    if (error) {
      toast({ title: 'Erro', description: 'Não foi possível desfazer a operação.', variant: 'destructive' });
      setProcessing(false);
      setUndoPassenger(null);
      return;
    }

    const result = (Array.isArray(data) ? data[0] : data) as any;
    if (result?.result === 'success') {
      const newStatus = result.boarding_status;
      setPassengers(prev =>
        prev.map(p =>
          p.ticketId === passenger.ticketId ? { ...p, boardingStatus: newStatus } : p
        )
      );
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
          <Button variant="ghost" size="sm" onClick={() => navigate('/motorista')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Voltar
          </Button>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-medium">
              {phaseConfig.label}
            </Badge>
            <span className="text-sm font-medium">Passageiros</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => fetchData()} aria-label="Atualizar">
            <RefreshCw className="h-4 w-4" />
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
                  <div>
                    <p className="text-2xl font-bold">{kpis.total}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">{kpis.done}</p>
                    <p className="text-xs text-muted-foreground">{phaseConfig.doneLabel}</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-orange-600">{kpis.pending}</p>
                    <p className="text-xs text-muted-foreground">{phaseConfig.pendingLabel}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

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
              {filteredPassengers.map(p => {
                const done = isDone(p);
                const actionable = isActionable(p);
                return (
                  <Card
                    key={p.ticketId}
                    className={`transition-colors ${done ? 'border-green-500/40 bg-green-500/5' : ''} ${actionable ? 'cursor-pointer' : ''}`}
                    onClick={() => {
                      if (actionable) setConfirmPassenger(p);
                    }}
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
                      ) : actionable ? (
                        <Badge variant="outline" className="shrink-0">
                          <Clock className="mr-1 h-3 w-3" />
                          {phaseConfig.pendingBadge}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          {p.boardingStatus === 'pendente' ? 'Pendente' :
                           p.boardingStatus === 'checked_in' ? 'Embarcado' :
                           p.boardingStatus === 'checked_out' ? 'Desembarcou' :
                           p.boardingStatus === 'reboarded' ? 'Reembarcou' : p.boardingStatus}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}

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
      </div>
    </div>
  );
}
