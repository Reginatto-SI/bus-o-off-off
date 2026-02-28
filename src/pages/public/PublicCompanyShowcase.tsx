import { useEffect, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Ticket } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Company, EventWithCompany } from '@/types/database';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { EventCard, EventCardSkeletonGrid, EventsCarousel } from '@/components/public';
import { normalizePublicSlug } from '@/lib/publicSlug';

export default function PublicCompanyShowcase() {
  const { nick = '' } = useParams();
  const normalizedNick = normalizePublicSlug(nick);
  const [searchParams] = useSearchParams();
  const sellerRef = searchParams.get('ref');
  const [company, setCompany] = useState<Pick<Company, 'id' | 'name' | 'trade_name' | 'logo_url' | 'public_slug'> | null>(null);
  const [events, setEvents] = useState<EventWithCompany[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchShowcase = async () => {
      setLoading(true);

      const { data: companyData } = await supabase
        .from('companies')
        .select('id, name, trade_name, logo_url, public_slug')
        .eq('public_slug', normalizedNick)
        .maybeSingle();

      if (!companyData) {
        setCompany(null);
        setEvents([]);
        setLoading(false);
        return;
      }

      setCompany(companyData as Pick<Company, 'id' | 'name' | 'trade_name' | 'logo_url' | 'public_slug'>);

      const { data: eventsData } = await supabase
        .from('events')
        .select(`
          *,
          company:companies!events_company_id_fkey(
            id,
            name,
            logo_url
          )
        `)
        .eq('company_id', companyData.id)
        .eq('status', 'a_venda')
        .eq('is_archived', false)
        .order('date', { ascending: true });

      setEvents((eventsData ?? []) as EventWithCompany[]);
      setLoading(false);
    };

    void fetchShowcase();
  }, [normalizedNick]);

  const companyDisplayName = company?.trade_name || company?.name;

  if (nick !== normalizedNick && normalizedNick) {
    return <Navigate to={`/empresa/${normalizedNick}`} replace />;
  }

  return (
    <PublicLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
        {!loading && !company ? (
          <EmptyState
            icon={<Ticket className="h-8 w-8 text-muted-foreground" />}
            title="Página não encontrada"
            description="Não encontramos uma vitrine pública para este link."
            action={
              <Button asChild>
                <Link to="/eventos">Ver vitrine geral</Link>
              </Button>
            }
          />
        ) : (
          <>
            <section className="text-center space-y-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                {companyDisplayName ? `Vitrine da ${companyDisplayName}` : 'Vitrine da empresa'}
              </h1>
              <p className="text-muted-foreground">
                Eventos da empresa disponíveis para compra online
              </p>
            </section>

            {!loading && events.length > 0 && (
              <section>
                <EventsCarousel events={events.slice(0, 5)} sellerRef={sellerRef} />
              </section>
            )}

            <section className="space-y-4">
              <h2 className="text-lg sm:text-xl font-semibold text-foreground">Todos os eventos</h2>

              {loading ? (
                <EventCardSkeletonGrid />
              ) : events.length === 0 ? (
                <EmptyState
                  icon={<Ticket className="h-8 w-8 text-muted-foreground" />}
                  title="Nenhuma passagem disponível"
                  description="No momento esta empresa não possui eventos em venda."
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {events.map((event) => (
                    <EventCard key={event.id} event={event} sellerRef={sellerRef} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </PublicLayout>
  );
}
