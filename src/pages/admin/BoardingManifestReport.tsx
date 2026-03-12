import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Bus, Calendar, FileText, Loader2, Route } from 'lucide-react';

import { AdminLayout } from '@/components/layout/AdminLayout';
import { PageHeader } from '@/components/admin/PageHeader';
import { FilterCard } from '@/components/admin/FilterCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { generateBoardingManifest } from '@/lib/reports/generateBoardingManifest';

interface EventOption {
  id: string;
  name: string;
  date: string;
}

interface TripOption {
  id: string;
  trip_type: string;
  departure_time: string | null;
  vehicle?: { plate?: string | null; type?: string | null } | null;
}

const formatTripLabel = (trip: TripOption) => {
  const timeLabel = trip.departure_time ? trip.departure_time.slice(0, 5) : '--:--';
  const vehicleLabel = trip.vehicle?.plate ? ` • ${trip.vehicle.plate}` : '';
  return `${trip.trip_type.toUpperCase()} • ${timeLabel}${vehicleLabel}`;
};

export default function BoardingManifestReport() {
  const { activeCompanyId, activeCompany } = useAuth();

  const [events, setEvents] = useState<EventOption[]>([]);
  const [trips, setTrips] = useState<TripOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEventId, setSelectedEventId] = useState('all');
  const [selectedTripId, setSelectedTripId] = useState('all');

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const normalizedSearch = searchTerm.trim().toLowerCase();

  // Comentário de suporte: reaproveitamos o padrão de FilterCard com busca para reduzir sensação de tela vazia
  // e manter a mesma hierarquia visual das demais páginas administrativas.
  const filteredEvents = useMemo(() => {
    if (!normalizedSearch) return events;
    return events.filter((event) => {
      const eventDate = new Date(`${event.date}T00:00:00`).toLocaleDateString('pt-BR');
      return `${eventDate} ${event.name}`.toLowerCase().includes(normalizedSearch);
    });
  }, [events, normalizedSearch]);

  const filteredTrips = useMemo(() => {
    if (!normalizedSearch) return trips;
    return trips.filter((trip) => formatTripLabel(trip).toLowerCase().includes(normalizedSearch));
  }, [trips, normalizedSearch]);

  const eventOptions = useMemo(
    () => [
      { value: 'all', label: 'Selecione' },
      ...filteredEvents.map((event) => ({
        value: event.id,
        label: `${new Date(`${event.date}T00:00:00`).toLocaleDateString('pt-BR')} • ${event.name}`,
      })),
    ],
    [filteredEvents],
  );

  const tripOptions = useMemo(
    () => [
      { value: 'all', label: 'Todas as viagens' },
      ...filteredTrips.map((trip) => ({ value: trip.id, label: formatTripLabel(trip) })),
    ],
    [filteredTrips],
  );

  // Carrega eventos da empresa logada respeitando isolamento multi-tenant.
  const fetchEvents = useCallback(async () => {
    if (!activeCompanyId) {
      setEvents([]);
      return;
    }

    const { data, error } = await supabase
      .from('events')
      .select('id, name, date')
      .eq('company_id', activeCompanyId)
      .order('date', { ascending: false });

    if (error) {
      toast.error('Erro ao carregar eventos.');
      setEvents([]);
      return;
    }

    setEvents((data ?? []) as EventOption[]);
  }, [activeCompanyId]);

  // Carrega viagens somente quando evento é selecionado para manter UX e performance.
  const fetchTrips = useCallback(async (eventId: string) => {
    if (!activeCompanyId || eventId === 'all') {
      setTrips([]);
      return;
    }

    const { data, error } = await supabase
      .from('trips')
      .select('id, trip_type, departure_time, vehicle:vehicles(plate, type)')
      .eq('company_id', activeCompanyId)
      .eq('event_id', eventId)
      .order('departure_time', { ascending: true });

    if (error) {
      toast.error('Erro ao carregar viagens.');
      setTrips([]);
      return;
    }

    setTrips((data ?? []) as unknown as TripOption[]);
  }, [activeCompanyId]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      await fetchEvents();
      setLoading(false);
    };

    run();
  }, [fetchEvents]);

  useEffect(() => {
    setSelectedTripId('all');
    fetchTrips(selectedEventId);
  }, [selectedEventId, fetchTrips]);

  const handleGeneratePdf = async () => {
    if (!activeCompanyId || !selectedEvent || !activeCompany) {
      toast.error('Selecione um evento válido para gerar o PDF.');
      return;
    }

    setGenerating(true);
    try {
      await generateBoardingManifest({
        eventId: selectedEvent.id,
        tripId: selectedTripId === 'all' ? null : selectedTripId,
        companyId: activeCompanyId,
        company: activeCompany,
      });

      toast.success('Lista de Embarque gerada com sucesso.');
    } catch (error: unknown) {
      console.error('Erro ao gerar lista de embarque:', error);
      const message = error instanceof Error ? error.message : null;
      toast.error(message || 'Não foi possível gerar a Lista de Embarque.');
    } finally {
      setGenerating(false);
    }
  };

  const hasActiveFilters = selectedEventId !== 'all' || selectedTripId !== 'all' || Boolean(searchTerm.trim());

  return (
    <AdminLayout>
      <div className="page-container">
        <PageHeader
          title="Lista de Embarque"
          description="Manifesto operacional para conferência manual dos passageiros por ponto de embarque."
          actions={
            <Button
              onClick={handleGeneratePdf}
              disabled={loading || generating || selectedEventId === 'all'}
              className="min-w-[150px]"
            >
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
              Gerar PDF
            </Button>
          }
        />

        <div className="mb-6">
          <FilterCard
            title="Seleção do Relatório"
            searchLabel="Busca"
            searchPlaceholder="Buscar por nome do evento, data ou viagem..."
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            onClearFilters={() => {
              setSearchTerm('');
              setSelectedEventId('all');
              setSelectedTripId('all');
            }}
            hasActiveFilters={hasActiveFilters}
            selects={[
              {
                id: 'event',
                label: 'Evento',
                placeholder: 'Selecione',
                value: selectedEventId,
                onChange: setSelectedEventId,
                options: eventOptions,
                icon: Calendar,
              },
              {
                id: 'trip',
                label: 'Viagem (opcional)',
                placeholder: 'Todas as viagens',
                value: selectedTripId,
                onChange: setSelectedTripId,
                options: tripOptions,
                icon: Route,
              },
            ]}
          />
        </div>

        {/* Bloco de orientação com estilo de apoio para reduzir sensação de tela solta no estado inicial. */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="space-y-2 text-sm">
              <p className="flex items-start gap-2 text-foreground font-medium">
                <Bus className="h-4 w-4 mt-0.5 text-muted-foreground" />
                Use este relatório em prancheta para marcar embarques manualmente.
              </p>
              <p className="text-muted-foreground pl-6">
                O PDF é agrupado por ponto de embarque, ordenado por ordem de parada, horário e poltrona.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Estado inicial guiado para manter acabamento visual e evitar área vazia sem contexto. */}
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<FileText className="h-8 w-8 text-muted-foreground" />}
              title="Relatório pronto para geração"
              description="Selecione o evento e, se necessário, uma viagem específica. Em seguida, clique em Gerar PDF para baixar a Lista de Embarque operacional."
              action={
                <Button onClick={handleGeneratePdf} disabled={loading || generating || selectedEventId === 'all'}>
                  {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                  Gerar PDF agora
                </Button>
              }
            />
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
