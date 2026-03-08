import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, LogOut, QrCode, Users, Calendar, MapPin, Clock, Settings } from 'lucide-react';
import { VersionIndicator } from '@/components/system/VersionIndicator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { parseDateOnlyAsLocal, formatDateOnlyBR } from '@/lib/date';
import { getPersistedTripId, setPersistedTripId, getPersistedPhase, setPersistedPhase } from '@/lib/driverTripStorage';
import type { OperationalPhase } from '@/lib/driverTripStorage';
import { PHASE_CONFIG, getApplicablePhases } from '@/lib/driverPhaseConfig';
import { useToast } from '@/hooks/use-toast';

interface TripInfo {
  tripId: string;
  eventId: string;
  eventName: string;
  eventDate: string;
  vehiclePlate: string;
  transportPolicy: string;
}

interface BoardingKpis {
  total: number;
  done: number;
  pending: number;
}

interface NextBoardingInfo {
  locationName: string;
  departureTime: string | null;
  totalPassengers: number;
  pendingPassengers: number;
}

export default function DriverHome() {
  const navigate = useNavigate();
  const { user, loading, userRole, signOut, profile, activeCompanyId } = useAuth();
  const { toast } = useToast();

  const canAccessDriverPortal =
    userRole === 'motorista' || userRole === 'operador' || userRole === 'gerente' || userRole === 'developer';

  const [allTrips, setAllTrips] = useState<TripInfo[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [activePhase, setActivePhase] = useState<OperationalPhase>('ida');
  const [kpis, setKpis] = useState<BoardingKpis>({ total: 0, done: 0, pending: 0 });
  const [nextBoarding, setNextBoarding] = useState<NextBoardingInfo | null>(null);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [loadingKpis, setLoadingKpis] = useState(false);

  const activeTrip = allTrips.find(t => t.tripId === selectedTripId) ?? null;
  const applicablePhases = activeTrip ? getApplicablePhases(activeTrip.transportPolicy) : ['ida'] as OperationalPhase[];
  const phaseConfig = PHASE_CONFIG[activePhase];

  /* ---------- Fetch all active trips ---------- */
  const fetchAllTrips = useCallback(async () => {
    if (!user || !activeCompanyId) return;
    setLoadingTrips(true);

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('driver_id, role')
      .eq('user_id', user.id)
      .eq('company_id', activeCompanyId)
      .single();

    const driverId = roleData?.driver_id;

    let trips: any[] | null = null;

    if (driverId) {
      const { data } = await supabase
        .from('trips')
        .select('id, event_id, events!inner(id, name, date, status, transport_policy), vehicles!inner(plate)')
        .eq('company_id', activeCompanyId)
        .eq('events.status', 'a_venda')
        .or(`driver_id.eq.${driverId},assistant_driver_id.eq.${driverId}`)
        .order('events(date)', { ascending: true });
      trips = data;
    }

    if (!trips || trips.length === 0) {
      const { data } = await supabase
        .from('trips')
        .select('id, event_id, events!inner(id, name, date, status, transport_policy), vehicles!inner(plate)')
        .eq('company_id', activeCompanyId)
        .eq('events.status', 'a_venda')
        .order('events(date)', { ascending: true });
      trips = data;
    }

    const tripIds = (trips ?? []).map((t: any) => t.id);

    // Boarding window filtering
    let filteredTripIds = new Set<string>(tripIds);
    if (tripIds.length > 0) {
      const { data: eblDates } = await supabase
        .from('event_boarding_locations')
        .select('trip_id, departure_date')
        .in('trip_id', tripIds)
        .not('departure_date', 'is', null);

      if (eblDates && eblDates.length > 0) {
        const minDateByTrip = new Map<string, string>();
        eblDates.forEach((row: any) => {
          const cur = minDateByTrip.get(row.trip_id);
          if (!cur || row.departure_date < cur) {
            minDateByTrip.set(row.trip_id, row.departure_date);
          }
        });

        const now = new Date();
        const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const windowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5);
        const toDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const startStr = toDateStr(windowStart);
        const endStr = toDateStr(windowEnd);

        const tripsWithDates = new Set(minDateByTrip.keys());
        filteredTripIds = new Set(
          tripIds.filter((id: string) => {
            if (!tripsWithDates.has(id)) return true;
            const minDate = minDateByTrip.get(id)!;
            return minDate >= startStr && minDate <= endStr;
          })
        );
      }
    }

    const mapped: TripInfo[] = (trips ?? [])
      .filter((trip: any) => filteredTripIds.has(trip.id))
      .map((trip: any) => ({
        tripId: trip.id,
        eventId: trip.events.id,
        eventName: trip.events.name,
        eventDate: trip.events.date,
        vehiclePlate: trip.vehicles.plate,
        transportPolicy: trip.events.transport_policy ?? 'ida_obrigatoria_volta_opcional',
      }));

    setAllTrips(mapped);

    const persisted = getPersistedTripId(user.id, activeCompanyId);
    const persistedStillValid = persisted && mapped.some(t => t.tripId === persisted);

    if (persistedStillValid) {
      setSelectedTripId(persisted);
    } else if (mapped.length > 0) {
      const firstId = mapped[0].tripId;
      setSelectedTripId(firstId);
      setPersistedTripId(user.id, activeCompanyId, firstId);
    } else {
      setSelectedTripId(null);
    }

    // Restore persisted phase
    const savedPhase = getPersistedPhase(user.id, activeCompanyId);
    setActivePhase(savedPhase);

    setLoadingTrips(false);
  }, [user, activeCompanyId]);

  /* ---------- Fetch KPIs for selected trip ---------- */
  const fetchKpis = useCallback(async (tripId: string) => {
    if (!user || !activeCompanyId) return;
    setLoadingKpis(true);

    const { data: tickets } = await supabase
      .from('tickets')
      .select('boarding_status, sale_id')
      .eq('trip_id', tripId)
      .eq('company_id', activeCompanyId);

    if (!tickets || tickets.length === 0) {
      setKpis({ total: 0, done: 0, pending: 0 });
      setNextBoarding(null);
      setLoadingKpis(false);
      return;
    }

    const saleIds = [...new Set(tickets.map(t => t.sale_id))];
    const { data: sales } = await supabase
      .from('sales')
      .select('id, boarding_location_id')
      .in('id', saleIds)
      .eq('status', 'pago');

    const paidSaleIds = new Set(sales?.map(s => s.id) ?? []);
    const paidTickets = tickets.filter(t => paidSaleIds.has(t.sale_id));

    // Compute KPIs based on active phase
    const done = paidTickets.filter(t => phaseConfig.doneStatuses.includes(t.boarding_status)).length;
    const pending = paidTickets.filter(t => phaseConfig.pendingStatuses.includes(t.boarding_status)).length;
    // Total for this phase = done + pending (only relevant tickets)
    const phaseTotal = done + pending;
    setKpis({ total: phaseTotal, done, pending });

    // Next boarding location (only relevant for ida phase)
    if (activePhase === 'ida') {
      const { data: eblData } = await supabase
        .from('event_boarding_locations')
        .select('id, departure_time, boarding_location_id, boarding_locations!inner(name)')
        .eq('trip_id', tripId)
        .eq('company_id', activeCompanyId)
        .order('departure_time', { ascending: true });

      if (eblData && eblData.length > 0 && sales) {
        const saleLocationMap = new Map<string, string>();
        sales.forEach((s: any) => saleLocationMap.set(s.id, s.boarding_location_id));

        const locationCounts = new Map<string, { total: number; pending: number }>();
        paidTickets.forEach(t => {
          const blId = saleLocationMap.get(t.sale_id);
          if (!blId) return;
          const c = locationCounts.get(blId) || { total: 0, pending: 0 };
          c.total++;
          if (t.boarding_status === 'pendente') c.pending++;
          locationCounts.set(blId, c);
        });

        const nextLoc = eblData.find((ebl: any) => {
          const counts = locationCounts.get(ebl.boarding_location_id);
          return counts && counts.pending > 0;
        }) as any;

        if (nextLoc) {
          const counts = locationCounts.get(nextLoc.boarding_location_id)!;
          setNextBoarding({
            locationName: nextLoc.boarding_locations?.name ?? '—',
            departureTime: nextLoc.departure_time,
            totalPassengers: counts.total,
            pendingPassengers: counts.pending,
          });
        } else {
          setNextBoarding(null);
        }
      } else {
        setNextBoarding(null);
      }
    } else {
      setNextBoarding(null);
    }

    setLoadingKpis(false);
  }, [user, activeCompanyId, activePhase, phaseConfig]);

  /* ---------- Effects ---------- */
  useEffect(() => {
    if (user && activeCompanyId && canAccessDriverPortal) {
      fetchAllTrips();
    }
  }, [user, activeCompanyId, canAccessDriverPortal, fetchAllTrips]);

  useEffect(() => {
    if (selectedTripId) {
      fetchKpis(selectedTripId);
    }
  }, [selectedTripId, fetchKpis]);

  /* ---------- Handlers ---------- */
  const handleTripChange = (tripId: string) => {
    setSelectedTripId(tripId);
    if (user && activeCompanyId) {
      setPersistedTripId(user.id, activeCompanyId, tripId);
    }
  };

  const handlePhaseChange = (phase: OperationalPhase) => {
    setActivePhase(phase);
    if (user && activeCompanyId) {
      setPersistedPhase(user.id, activeCompanyId, phase);
    }
    toast({ title: `Fase alterada para ${PHASE_CONFIG[phase].label}` });
  };

  /* ---------- Guards ---------- */
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
  if (!canAccessDriverPortal) return <Navigate to="/admin/eventos" replace />;

  const firstName = (profile?.name || user.user_metadata?.name || 'Motorista').split(' ')[0];
  const progressPercent = kpis.total > 0 ? Math.round((kpis.done / kpis.total) * 100) : 0;

  const formatEventDate = (dateStr: string) => {
    const d = parseDateOnlyAsLocal(dateStr);
    if (!d) return dateStr;
    return format(d, "dd 'de' MMMM", { locale: ptBR });
  };

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto w-full max-w-md space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Logo size="lg" />
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>

        {/* Greeting */}
        <p className="text-sm text-muted-foreground">Olá, {firstName}.</p>

        {/* Event Selector (only for 2+ trips) */}
        {!loadingTrips && allTrips.length > 1 && (
          <Select value={selectedTripId ?? ''} onValueChange={handleTripChange}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o evento" />
            </SelectTrigger>
            <SelectContent>
              {allTrips.map(t => (
                <SelectItem key={t.tripId} value={t.tripId}>
                  {formatDateOnlyBR(t.eventDate)} · {t.eventName} · {t.vehiclePlate}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Phase Selector */}
        {!loadingTrips && activeTrip && applicablePhases.length > 1 && (
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${applicablePhases.length}, 1fr)` }}>
            {applicablePhases.map(phase => {
              const cfg = PHASE_CONFIG[phase];
              const isActive = activePhase === phase;
              return (
                <button
                  key={phase}
                  type="button"
                  onClick={() => handlePhaseChange(phase)}
                  className={`rounded-lg border-2 px-3 py-3 text-center text-sm font-semibold transition-all ${
                    isActive
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-muted bg-muted/30 text-muted-foreground hover:border-primary/30'
                  }`}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Active Event Card */}
        {loadingTrips ? (
          <Card>
            <CardContent className="space-y-3 p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
              <div className="grid grid-cols-3 gap-3 pt-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
        ) : activeTrip ? (
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Evento ativo</span>
              </div>
              <div>
                <h2 className="text-lg font-semibold">{activeTrip.eventName}</h2>
                <p className="text-sm text-muted-foreground">
                  {formatEventDate(activeTrip.eventDate)} · {activeTrip.vehiclePlate}
                </p>
              </div>

              {/* KPIs */}
              {loadingKpis ? (
                <div className="grid grid-cols-3 gap-3">
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-muted/50 p-3 text-center">
                      <p className="text-2xl font-bold">{kpis.total}</p>
                      <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                    <div className="rounded-lg bg-green-500/10 p-3 text-center">
                      <p className="text-2xl font-bold text-green-600">{kpis.done}</p>
                      <p className="text-xs text-muted-foreground">{phaseConfig.doneLabel}</p>
                    </div>
                    <div className="rounded-lg bg-orange-500/10 p-3 text-center">
                      <p className="text-2xl font-bold text-orange-600">{kpis.pending}</p>
                      <p className="text-xs text-muted-foreground">{phaseConfig.pendingLabel}</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {kpis.total > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{phaseConfig.doneLabel}: {kpis.done} / {kpis.total}</span>
                        <span>{progressPercent}%</span>
                      </div>
                      <Progress value={progressPercent} className="h-2" />
                    </div>
                  )}

                  {/* Next boarding location (ida only) */}
                  {nextBoarding && (
                    <div className="rounded-lg border p-3 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Próximo embarque</p>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm font-medium truncate">{nextBoarding.locationName}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {nextBoarding.departureTime && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {nextBoarding.departureTime.slice(0, 5)}
                          </span>
                        )}
                        <span>{nextBoarding.totalPassengers} passageiros · {nextBoarding.pendingPassengers} pendentes</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-5 text-center">
              <p className="text-sm text-muted-foreground">Nenhum evento atribuído no momento.</p>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button className="h-14 w-full text-base" onClick={() => navigate('/motorista/validar')}>
            <QrCode className="mr-2 h-5 w-5" />
            Escanear passagens
          </Button>

          <Button
            variant="outline"
            className="h-14 w-full text-base"
            onClick={() => navigate('/motorista/embarque')}
            disabled={!activeTrip}
          >
            <Users className="mr-2 h-5 w-5" />
            Lista de passageiros
          </Button>
        </div>

        {/* Versão do sistema */}
        <div className="pt-2">
          <VersionIndicator />
        </div>
      </div>
    </div>
  );
}
