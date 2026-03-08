import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, LogOut, QrCode, Users, Calendar, MapPin, Clock } from 'lucide-react';
import { VersionIndicator } from '@/components/system/VersionIndicator';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ActiveTripInfo {
  tripId: string;
  eventId: string;
  eventName: string;
  eventDate: string;
  vehiclePlate: string;
}

interface BoardingKpis {
  total: number;
  boarded: number;
  remaining: number;
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

  const canAccessDriverPortal =
    userRole === 'motorista' || userRole === 'operador' || userRole === 'gerente' || userRole === 'developer';

  const [activeTrip, setActiveTrip] = useState<ActiveTripInfo | null>(null);
  const [kpis, setKpis] = useState<BoardingKpis>({ total: 0, boarded: 0, remaining: 0 });
  const [nextBoarding, setNextBoarding] = useState<NextBoardingInfo | null>(null);
  const [loadingTrip, setLoadingTrip] = useState(true);

  const fetchActiveTrip = useCallback(async () => {
    if (!user || !activeCompanyId) return;

    setLoadingTrip(true);

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('driver_id, role')
      .eq('user_id', user.id)
      .eq('company_id', activeCompanyId)
      .single();

    const driverId = roleData?.driver_id;

    let tripsQuery = supabase
      .from('trips')
      .select('id, event_id, vehicle_id, events!inner(id, name, date, status), vehicles!inner(plate)')
      .eq('company_id', activeCompanyId)
      .eq('events.status', 'a_venda')
      .order('events(date)', { ascending: true })
      .limit(1);

    if (driverId) {
      tripsQuery = tripsQuery.or(`driver_id.eq.${driverId},assistant_driver_id.eq.${driverId}`);
    }

    const { data: trips } = await tripsQuery;

    if (trips && trips.length > 0) {
      const trip = trips[0] as any;
      const info: ActiveTripInfo = {
        tripId: trip.id,
        eventId: trip.events.id,
        eventName: trip.events.name,
        eventDate: trip.events.date,
        vehiclePlate: trip.vehicles.plate,
      };
      setActiveTrip(info);

      // Fetch KPIs
      const { data: tickets } = await supabase
        .from('tickets')
        .select('boarding_status, sale_id')
        .eq('trip_id', trip.id)
        .eq('company_id', activeCompanyId);

      if (tickets) {
        const saleIds = [...new Set(tickets.map(t => t.sale_id))];
        if (saleIds.length > 0) {
          const { data: sales } = await supabase
            .from('sales')
            .select('id, boarding_location_id')
            .in('id', saleIds)
            .eq('status', 'pago');

          const paidSaleIds = new Set(sales?.map(s => s.id) ?? []);
          const paidTickets = tickets.filter(t => paidSaleIds.has(t.sale_id));
          const boarded = paidTickets.filter(t => t.boarding_status === 'checked_in').length;
          setKpis({
            total: paidTickets.length,
            boarded,
            remaining: paidTickets.length - boarded,
          });

          // Fetch next boarding location info
          const { data: eblData } = await supabase
            .from('event_boarding_locations')
            .select('id, departure_time, boarding_location_id, boarding_locations!inner(name)')
            .eq('trip_id', trip.id)
            .eq('company_id', activeCompanyId)
            .order('departure_time', { ascending: true });

          if (eblData && eblData.length > 0 && sales) {
            // Build a map: boarding_location_id -> { total, pending }
            const saleLocationMap = new Map<string, string>();
            sales.forEach((s: any) => saleLocationMap.set(s.id, s.boarding_location_id));

            const locationCounts = new Map<string, { total: number; pending: number }>();
            paidTickets.forEach(t => {
              const blId = saleLocationMap.get(t.sale_id);
              if (!blId) return;
              const c = locationCounts.get(blId) || { total: 0, pending: 0 };
              c.total++;
              if (t.boarding_status !== 'checked_in') c.pending++;
              locationCounts.set(blId, c);
            });

            // Find first location with pending passengers
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
          }
        }
      }
    } else {
      setActiveTrip(null);
    }

    setLoadingTrip(false);
  }, [user, activeCompanyId]);

  useEffect(() => {
    if (user && activeCompanyId && canAccessDriverPortal) {
      fetchActiveTrip();
    }
  }, [user, activeCompanyId, canAccessDriverPortal, fetchActiveTrip]);

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
  const progressPercent = kpis.total > 0 ? Math.round((kpis.boarded / kpis.total) * 100) : 0;

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

        {/* Active Event Card */}
        {loadingTrip ? (
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
                  {format(parseISO(activeTrip.eventDate), "dd 'de' MMMM", { locale: ptBR })} · {activeTrip.vehiclePlate}
                </p>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-bold">{kpis.total}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div className="rounded-lg bg-green-500/10 p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{kpis.boarded}</p>
                  <p className="text-xs text-muted-foreground">Embarcados</p>
                </div>
                <div className="rounded-lg bg-orange-500/10 p-3 text-center">
                  <p className="text-2xl font-bold text-orange-600">{kpis.remaining}</p>
                  <p className="text-xs text-muted-foreground">Pendentes</p>
                </div>
              </div>

              {/* Progress bar */}
              {kpis.total > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Embarque: {kpis.boarded} / {kpis.total}</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <Progress value={progressPercent} className="h-2" />
                </div>
              )}

              {/* Next boarding location */}
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
            Ver embarque
          </Button>
        </div>
      </div>
    </div>
  );
}
