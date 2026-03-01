import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { EventWithCompany } from '@/types/database';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { EmptyState } from '@/components/ui/EmptyState';
import { Ticket } from 'lucide-react';
import { 
  EventCard, 
  EventsCarousel, 
  EventCardSkeletonGrid 
} from '@/components/public';

export default function PublicEvents() {
  const [events, setEvents] = useState<EventWithCompany[]>([]);
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

      if (data) setEvents(data as EventWithCompany[]);
      setLoading(false);
    };

    fetchEvents();
  }, []);

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
        {!loading && events.length > 0 && (
          <section>
            <EventsCarousel 
              events={events.slice(0, 5)} 
              sellerRef={sellerRef} 
            />
          </section>
        )}

        {/* Todos os Eventos */}
        <section className="space-y-4">
          <h2 className="text-lg sm:text-xl font-semibold text-foreground">
            Todos os eventos
          </h2>

          {loading ? (
            <EventCardSkeletonGrid />
          ) : events.length === 0 ? (
            <EmptyState
              icon={<Ticket className="h-8 w-8 text-muted-foreground" />}
              title="Nenhuma passagem disponível"
              description="No momento não há passagens disponíveis. Volte em breve!"
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((event) => (
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
