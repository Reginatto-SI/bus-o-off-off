import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { EventWithCompany } from '@/types/database';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Ticket } from 'lucide-react';
import { filterEventsByTerm } from '@/lib/eventSearch';
import { buildEventOperationalEndMap, filterOperationallyVisibleEvents } from '@/lib/eventOperationalWindow';
import { 
  EventCard, 
  EventsCarousel, 
  EventCardSkeletonGrid 
} from '@/components/public';

export default function PublicEvents() {
  const [events, setEvents] = useState<EventWithCompany[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const sellerRef = searchParams.get('ref');

  useEffect(() => {
    const fetchEvents = async () => {
      const { data } = await supabase
        .from('events')
        .select(`
          *,
          company:companies!events_company_id_fkey(
            id,
            name,
            logo_url,
            whatsapp
          )
        `)
        .eq('status', 'a_venda')
        // Segurança operacional: evento arquivado nunca aparece no portal público.
        .eq('is_archived', false)
        .order('date', { ascending: true });

      if (data) {
        const eventRows = data as EventWithCompany[];
        const eventIds = eventRows.map((event) => event.id);
        const { data: boardings } = await supabase
          .from('event_boarding_locations')
          .select('event_id, departure_date, departure_time')
          .in('event_id', eventIds)
          .not('departure_date', 'is', null);

        const operationalEndMap = buildEventOperationalEndMap(eventRows, (boardings ?? []) as any[]);
        setEvents(filterOperationallyVisibleEvents(eventRows, operationalEndMap) as EventWithCompany[]);
      }
      setLoading(false);
    };

    fetchEvents();
  }, []);

  // Busca instantânea client-side para experiência de vitrine rápida, sem recarregar página.
  const filteredEvents = useMemo(() => filterEventsByTerm(events, searchTerm), [events, searchTerm]);

  return (
    <PublicLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
        {/* Título e Microcopy */}
        <section className="text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            Passagens disponíveis
          </h1>
          <p className="text-muted-foreground">
            Compra segura com confirmação imediata após o pagamento
          </p>
        </section>

        {/* Carrossel de Destaques */}
        {!loading && filteredEvents.length > 0 && (
          <section>
            <EventsCarousel 
              events={filteredEvents.slice(0, 5)} 
              sellerRef={sellerRef} 
            />
          </section>
        )}

        {/* Todos os Eventos */}
        <section className="space-y-4">
          <h2 className="text-lg sm:text-xl font-semibold text-foreground">
            Todos os eventos
          </h2>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar evento, destino ou empresa"
              className="pl-9"
              aria-label="Buscar evento, destino ou empresa"
            />
          </div>

          {loading ? (
            <EventCardSkeletonGrid />
          ) : events.length === 0 ? (
            <EmptyState
              icon={<Ticket className="h-8 w-8 text-muted-foreground" />}
              title="Nenhuma passagem disponível"
              description="No momento não há passagens disponíveis. Volte em breve!"
            />
          ) : filteredEvents.length === 0 ? (
            <EmptyState
              icon={<Search className="h-8 w-8 text-muted-foreground" />}
              title="Nenhum evento encontrado com esse termo."
              description="Tente buscar por outro nome de evento, empresa ou destino."
              action={
                <Button variant="outline" onClick={() => setSearchTerm('')}>
                  Limpar busca
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  sellerRef={sellerRef}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </PublicLayout>
  );
}
