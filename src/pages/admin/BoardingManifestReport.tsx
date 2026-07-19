import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Bus, Calendar, ChevronDown, Eye, FileText, Loader2, Route, Search, SlidersHorizontal, Users, X } from 'lucide-react';

import { AdminLayout } from '@/components/layout/AdminLayout';
import { PageHeader } from '@/components/admin/PageHeader';
import { FilterCard } from '@/components/admin/FilterCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AdminMobileHeader } from '@/components/layout/AdminMobileHeader';
import { AdminMobileBottomNav } from '@/components/layout/AdminMobileBottomNav';
import { AdminMobileMoreMenu } from '@/components/layout/AdminMobileMoreMenu';
import { adminMobileBottomNavItems } from '@/components/layout/adminMobileBottomNavItems';
import { canViewAdminNavigationItem, findAdminNavigationItemByHref } from '@/components/layout/adminNavigation';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { fetchBoardingManifestRows, generateBoardingManifest, ManifestRow } from '@/lib/reports/generateBoardingManifest';
import { buildEventOperationalEndMap, filterOperationallyVisibleEvents } from '@/lib/eventOperationalWindow';
import { cn } from '@/lib/utils';

interface EventOption {
  id: string;
  name: string;
  date: string;
  status: 'rascunho' | 'a_venda' | 'encerrado';
  is_archived: boolean;
}

interface TripOption {
  id: string;
  trip_type: string;
  departure_time: string | null;
  vehicle?: { plate?: string | null; type?: string | null } | null;
}

interface BoardingOperationalWindowRow {
  event_id: string;
  departure_date: string | null;
  departure_time: string | null;
}

const formatTripLabel = (trip: TripOption) => {
  const timeLabel = trip.departure_time ? trip.departure_time.slice(0, 5) : '--:--';
  const vehicleLabel = trip.vehicle?.plate ? ` • ${trip.vehicle.plate}` : '';
  return `${trip.trip_type.toUpperCase()} • ${timeLabel}${vehicleLabel}`;
};

const formatManifestCpfMask = (cpf: string | null) => {
  if (!cpf) return 'CPF não informado';
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return 'CPF não informado';
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
};

export default function BoardingManifestReport() {
  const { activeCompanyId, activeCompany, userRole, isDeveloper, canAccessTemplatesLayout } = useAuth();

  const [events, setEvents] = useState<EventOption[]>([]);
  const [trips, setTrips] = useState<TripOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showOldEvents, setShowOldEvents] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState('all');
  const [selectedTripId, setSelectedTripId] = useState('all');
  const [operationallyFinishedIds, setOperationallyFinishedIds] = useState<Set<string>>(new Set());
  const [previewRows, setPreviewRows] = useState<ManifestRow[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [mobileMoreOptionsOpen, setMobileMoreOptionsOpen] = useState(false);
  const [mobileMoreMenuOpen, setMobileMoreMenuOpen] = useState(false);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );


  const selectedTrip = useMemo(
    () => trips.find((trip) => trip.id === selectedTripId) ?? null,
    [selectedTripId, trips],
  );

  const mobileBottomNavItems = useMemo(
    () => adminMobileBottomNavItems.filter((item) => {
      if (item.href === '/admin/dashboard') return true;
      // Comentário de preservação: a rota visual de Embarque continua direta, mas a permissão oficial é /validador.
      const navigationHref = item.href === '/validador/embarque' ? '/validador' : item.href;
      return canViewAdminNavigationItem({
        item: findAdminNavigationItemByHref(navigationHref),
        userRole,
        isDeveloper,
        canAccessTemplatesLayout,
      });
    }),
    [canAccessTemplatesLayout, isDeveloper, userRole],
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

  const previewSummary = useMemo(() => {
    if (!selectedEvent || previewRows.length === 0) {
      return null;
    }

    const grouped = new Map<string, { id: string; name: string; time: string; passengers: number }>();
    for (const row of previewRows) {
      if (!grouped.has(row.boarding_location_id)) {
        grouped.set(row.boarding_location_id, {
          id: row.boarding_location_id,
          name: row.boarding_location_name,
          time: row.departure_time ? row.departure_time.slice(0, 5) : '--:--',
          passengers: 0,
        });
      }

      const point = grouped.get(row.boarding_location_id);
      if (point) point.passengers += 1;
    }

    const boardingPoints = Array.from(grouped.values()).sort((a, b) => a.time.localeCompare(b.time));

    return {
      eventName: selectedEvent.name,
      eventDate: new Date(`${selectedEvent.date}T00:00:00`).toLocaleDateString('pt-BR'),
      totalPassengers: previewRows.length,
      selectedTripLabel: selectedTrip ? formatTripLabel(selectedTrip) : 'Todas as viagens',
      boardingPoints,
    };
  }, [previewRows, selectedEvent, selectedTrip]);

  const eventOptions = useMemo(
    () => [
      { value: 'all', label: 'Selecione' },
      ...filteredEvents.map((event) => ({
        value: event.id,
        label: `${new Date(`${event.date}T00:00:00`).toLocaleDateString('pt-BR')} • ${event.name}${showOldEvents && operationallyFinishedIds.has(event.id) ? ' • histórico operacional' : ''}`,
      })),
    ],
    [filteredEvents, operationallyFinishedIds, showOldEvents],
  );

  const tripOptions = useMemo(
    () => [
      { value: 'all', label: 'Todas as viagens' },
      ...filteredTrips.map((trip) => ({ value: trip.id, label: formatTripLabel(trip) })),
    ],
    [filteredTrips],
  );

  // Carrega eventos da empresa logada respeitando isolamento multi-tenant.
  // Comentário de suporte: por padrão mantemos foco operacional (à venda + janela recente),
  // e só exibimos histórico completo quando o operador habilita explicitamente.
  const fetchEvents = useCallback(async () => {
    if (!activeCompanyId) {
      setEvents([]);
      return;
    }

    const query = supabase
      .from('events')
      .select('id, name, date, status, is_archived')
      .eq('company_id', activeCompanyId)
      .order('date', { ascending: false });

    const { data, error } = await query;

    if (error) {
      toast.error('Erro ao carregar eventos.');
      setEvents([]);
      return;
    }

    const eventRows = (data ?? []) as EventOption[];
    const activeRows = eventRows.filter((event) => !event.is_archived);

    if (activeRows.length === 0) {
      setOperationallyFinishedIds(new Set());
      setEvents(showOldEvents ? eventRows : []);
      return;
    }

    const { data: boardings } = await supabase
      .from('event_boarding_locations')
      .select('event_id, departure_date, departure_time')
      .in('event_id', activeRows.map((event) => event.id))
      .eq('company_id', activeCompanyId)
      .not('departure_date', 'is', null);

    const operationalEndMap = buildEventOperationalEndMap(
      activeRows,
      (boardings ?? []) as BoardingOperationalWindowRow[],
    );
    const visibleActiveRows = filterOperationallyVisibleEvents(activeRows, operationalEndMap) as EventOption[];
    const visibleIds = new Set(visibleActiveRows.map((event) => event.id));
    setOperationallyFinishedIds(new Set(activeRows.filter((event) => !visibleIds.has(event.id)).map((event) => event.id)));

    setEvents(showOldEvents ? eventRows : visibleActiveRows);
  }, [activeCompanyId, showOldEvents]);

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

  useEffect(() => {
    const loadPreview = async () => {
      if (!activeCompanyId || selectedEventId === 'all') {
        setPreviewRows([]);
        return;
      }

      setLoadingPreview(true);
      try {
        const rows = await fetchBoardingManifestRows({
          companyId: activeCompanyId,
          eventId: selectedEventId,
          tripId: selectedTripId === 'all' ? null : selectedTripId,
        });
        setPreviewRows(rows);
      } catch (error) {
        console.error('Erro ao carregar preview da lista de embarque:', error);
        toast.error('Não foi possível carregar a pré-visualização da lista de embarque.');
        setPreviewRows([]);
      } finally {
        setLoadingPreview(false);
      }
    };

    // Comentário de suporte: o preview usa os mesmos filtros do PDF para transmitir confiança operacional.
    loadPreview();
  }, [activeCompanyId, selectedEventId, selectedTripId]);

  useEffect(() => {
    // Comentário de suporte: evita estado inválido quando o operador alterna entre eventos ativos/históricos.
    if (selectedEventId !== 'all' && !events.some((event) => event.id === selectedEventId)) {
      setSelectedEventId('all');
    }
  }, [events, selectedEventId]);

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

  const hasActiveFilters = selectedEventId !== 'all' || selectedTripId !== 'all' || Boolean(searchTerm.trim()) || showOldEvents;
  const canGeneratePdf = !loading && !generating && selectedEventId !== 'all';

  const clearFilters = () => {
    setSearchTerm('');
    setShowOldEvents(false);
    setSelectedEventId('all');
    setSelectedTripId('all');
  };

  return (
    <AdminLayout>

      <div className="min-h-screen bg-[#fbfaf8] pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:hidden">
        <AdminMobileHeader title="Lista de embarque" subtitle="SmartBus" showMenuButton={false} />

        <main className="mx-auto w-full max-w-md space-y-4 px-4 py-5">
          <section className="space-y-1">
            <p className="text-sm font-semibold text-slate-950">Manifesto operacional para conferência manual dos passageiros por ponto de embarque.</p>
            <p className="text-xs leading-relaxed text-slate-500">Selecione um evento para visualizar o resumo da lista e liberar a geração do PDF.</p>
          </section>

          <Card className="rounded-2xl border-slate-200/70 bg-white shadow-[0_5px_14px_rgba(15,23,42,0.045)]">
            <CardContent className="space-y-4 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-950">Seleção do relatório</h2>
                  {hasActiveFilters && <p className="mt-1 text-xs text-[hsl(var(--primary))]">Filtros ativos</p>}
                </div>
                {hasActiveFilters && (
                  <Button type="button" variant="ghost" size="sm" className="h-9 rounded-xl px-2 text-xs text-slate-500" onClick={clearFilters}>
                    <X className="mr-1 h-3.5 w-3.5" /> Limpar filtros
                  </Button>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="boarding-search-mobile" className="flex items-center gap-2 text-xs font-semibold text-slate-600"><Search className="h-4 w-4" />Busca</Label>
                <Input id="boarding-search-mobile" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar por nome, data ou viagem..." className="h-11 rounded-xl bg-slate-50" />
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><Calendar className="h-4 w-4" />Evento</Label>
                <Select value={selectedEventId} onValueChange={setSelectedEventId} disabled={loading}>
                  <SelectTrigger className="h-11 rounded-xl bg-slate-50"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {eventOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {loading && <p className="text-xs text-slate-500">Carregando eventos...</p>}
                {!loading && eventOptions.length === 1 && <p className="text-xs text-slate-500">Nenhum evento encontrado para a seleção atual.</p>}
              </div>

              <Collapsible open={mobileMoreOptionsOpen} onOpenChange={setMobileMoreOptionsOpen}>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="outline" className="h-10 w-full justify-between rounded-xl bg-white text-slate-700">
                    <span className="inline-flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" />Mais opções</span>
                    <ChevronDown className={cn('h-4 w-4 transition-transform', mobileMoreOptionsOpen && 'rotate-180')} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><Route className="h-4 w-4" />Viagem (opcional)</Label>
                    <Select value={selectedTripId} onValueChange={setSelectedTripId} disabled={selectedEventId === 'all'}>
                      <SelectTrigger className="h-11 rounded-xl bg-slate-50"><SelectValue placeholder="Todas as viagens" /></SelectTrigger>
                      <SelectContent>{tripOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                    </Select>
                    {selectedEventId !== 'all' && trips.length === 0 && <p className="text-xs text-slate-500">Nenhuma viagem cadastrada para este evento.</p>}
                  </div>
                  <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700">
                    <span>Mostrar eventos antigos</span>
                    <Switch checked={showOldEvents} onCheckedChange={setShowOldEvents} />
                  </label>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>

          {selectedEvent && (
            <Card className="rounded-2xl border-slate-200/70 bg-white shadow-[0_5px_14px_rgba(15,23,42,0.045)]">
              <CardContent className="space-y-3 p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Resumo selecionado</p>
                  <h2 className="mt-1 text-base font-bold text-slate-950">{selectedEvent.name}</h2>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div><dt className="font-semibold text-slate-500">Data</dt><dd className="mt-0.5 text-slate-900">{new Date(`${selectedEvent.date}T00:00:00`).toLocaleDateString('pt-BR')}</dd></div>
                  <div><dt className="font-semibold text-slate-500">Viagem</dt><dd className="mt-0.5 text-slate-900">{previewSummary?.selectedTripLabel ?? (selectedTrip ? formatTripLabel(selectedTrip) : 'Todas as viagens')}</dd></div>
                  <div><dt className="font-semibold text-slate-500">Passageiros</dt><dd className="mt-0.5 text-slate-900">{loadingPreview ? 'Carregando...' : previewRows.length}</dd></div>
                  <div><dt className="font-semibold text-slate-500">Pontos</dt><dd className="mt-0.5 text-slate-900">{loadingPreview ? 'Carregando...' : (previewSummary?.boardingPoints.length ?? 0)}</dd></div>
                </dl>
                <Button className="h-11 w-full rounded-xl" onClick={handleGeneratePdf} disabled={!canGeneratePdf}>
                  {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                  {generating ? 'Gerando PDF...' : 'Gerar PDF'}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card className="rounded-2xl border-slate-200/70 bg-white shadow-[0_5px_14px_rgba(15,23,42,0.045)]">
            <CardContent className="p-0">
              {selectedEventId === 'all' ? <EmptyState icon={<Eye className="h-8 w-8 text-muted-foreground" />} title="Selecione um evento" description="Selecione um evento para visualizar a lista de embarque." /> : loadingPreview ? <EmptyState icon={<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />} title="Carregando lista" description="Estamos montando a lista de embarque com os mesmos dados do PDF." /> : previewSummary ? <div className="divide-y divide-slate-100">{previewSummary.boardingPoints.map((point) => { const passengers = previewRows.filter((row) => row.boarding_location_id === point.id); return <section key={point.id} className="p-4"><div className="rounded-xl bg-slate-50 p-3"><p className="text-sm font-bold text-slate-950">{point.name}</p><p className="mt-1 text-xs text-slate-500">Horário {point.time} • {passengers.length} passageiro(s)</p></div><div className="mt-3 space-y-2">{passengers.map((passenger) => <article key={passenger.ticket_id ?? passenger.sale_id} className="rounded-xl border border-slate-200 p-3"><p className="text-sm font-semibold text-slate-950">{passenger.passenger_name}</p><p className="mt-1 text-xs text-slate-500">Poltrona {passenger.seat_label} • {formatManifestCpfMask(passenger.passenger_cpf)}</p></article>)}</div></section>; })}</div> : <EmptyState icon={<Bus className="h-8 w-8 text-muted-foreground" />} title="Nenhum passageiro encontrado" description="Nenhum passageiro pago foi encontrado para os filtros selecionados." />}
            </CardContent>
          </Card>
        </main>

        <AdminMobileBottomNav items={mobileBottomNavItems} onMoreClick={() => setMobileMoreMenuOpen(true)} />
        <AdminMobileMoreMenu open={mobileMoreMenuOpen} onOpenChange={setMobileMoreMenuOpen} />
      </div>
      <div className="page-container hidden lg:block">
        <PageHeader
          title="Lista de Embarque"
          description="Manifesto operacional para conferência manual dos passageiros por ponto de embarque."
          actions={
            <Button
              onClick={handleGeneratePdf}
              disabled={!canGeneratePdf}
              className="min-w-[150px]"
            >
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
              Gerar PDF
            </Button>
          }
        />

        {/* Ajuste de layout: fluxo visual linear (Filtros -> Preview) para reduzir carga cognitiva operacional. */}
        <div className="mb-6 space-y-6">
          <FilterCard
            className="xl:col-span-5"
            title="Seleção do Relatório"
            searchLabel="Busca"
            searchPlaceholder="Buscar por nome do evento, data ou viagem..."
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            onClearFilters={clearFilters}
            hasActiveFilters={hasActiveFilters}
            mainFilters={
              <div className="space-y-1.5 flex items-end">
                <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground cursor-pointer select-none">
                  <Switch checked={showOldEvents} onCheckedChange={setShowOldEvents} />
                  Mostrar eventos antigos
                </label>
              </div>
            }
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
          <Card>
            <CardContent className="p-0">
              {selectedEventId === 'all' ? (
                <EmptyState
                  icon={<Eye className="h-8 w-8 text-muted-foreground" />}
                  title="Confira os dados antes de gerar a lista de embarque"
                  description="Selecione um evento para visualizar a lista de embarque antes de gerar o PDF."
                />
              ) : loadingPreview ? (
                <EmptyState
                  icon={<Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />}
                  title="Carregando pré-visualização"
                  description="Estamos consolidando os passageiros por ponto de embarque."
                />
              ) : previewSummary ? (
                <div className="p-6 space-y-5">
                  <div className="space-y-2">
                    <h3 className="text-base font-semibold text-foreground">Confira os dados antes de gerar a lista de embarque</h3>
                    <p className="text-sm text-muted-foreground">
                      Evento: <span className="font-medium text-foreground">{previewSummary.eventName}</span>
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <p className="text-muted-foreground">Data: <span className="font-medium text-foreground">{previewSummary.eventDate}</span></p>
                      <p className="text-muted-foreground">Total de passageiros: <span className="font-medium text-foreground">{previewSummary.totalPassengers}</span></p>
                      <p className="text-muted-foreground">Pontos de embarque: <span className="font-medium text-foreground">{previewSummary.boardingPoints.length}</span></p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {previewSummary.boardingPoints.map((point) => (
                      <p key={point.id} className="text-sm text-muted-foreground">
                        • <span className="font-medium text-foreground">{point.name}</span> — {point.time} ({point.passengers} passageiros)
                      </p>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline">
                          <Users className="h-4 w-4 mr-2" />
                          Ver detalhes
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-3xl">
                        <DialogHeader>
                          <DialogTitle>Pré-visualização detalhada da Lista de Embarque</DialogTitle>
                        </DialogHeader>
                        <div className="max-h-[65vh] overflow-y-auto pr-2 space-y-4">
                          {previewSummary.boardingPoints.map((point) => {
                            const passengers = previewRows.filter((row) => row.boarding_location_id === point.id);
                            return (
                              <div key={point.id} className="rounded-md border p-3">
                                <p className="text-sm font-semibold text-foreground">{point.name}</p>
                                <p className="text-xs text-muted-foreground mb-2">
                                  Horário: {point.time} • Passageiros: {passengers.length}
                                </p>
                                <div className="space-y-1">
                                  {passengers.map((passenger) => (
                                    <p key={passenger.ticket_id ?? passenger.sale_id} className="text-sm text-muted-foreground">
                                      • {passenger.seat_label} — <span className="text-foreground">{passenger.passenger_name}</span>{' '}
                                      <span className="text-xs">({formatManifestCpfMask(passenger.passenger_cpf)})</span>
                                    </p>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button onClick={handleGeneratePdf} disabled={!canGeneratePdf}>
                      {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                      Gerar PDF
                    </Button>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={<Bus className="h-8 w-8 text-muted-foreground" />}
                  title="Confira os dados antes de gerar a lista de embarque"
                  description="Nenhum passageiro pago foi encontrado para os filtros selecionados."
                  action={
                    <Button onClick={handleGeneratePdf} disabled>
                      <FileText className="h-4 w-4 mr-2" />
                      Gerar PDF
                    </Button>
                  }
                />
              )}
            </CardContent>
          </Card>
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

      </div>
    </AdminLayout>
  );
}
