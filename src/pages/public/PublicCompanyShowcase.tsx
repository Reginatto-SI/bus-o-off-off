import { useEffect, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { ExternalLink, MessageCircle, Ticket } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Company, EventWithCompany } from '@/types/database';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { EventCard, EventCardSkeletonGrid, EventsCarousel } from '@/components/public';
import { normalizePublicSlug } from '@/lib/publicSlug';

// Tipo mínimo para patrocinadores públicos (whitelist estrita de campos)
interface PublicSponsor {
  id: string;
  name: string;
  banner_url: string | null;
  link_type: string;
  site_url: string | null;
  whatsapp_phone: string | null;
  whatsapp_message: string | null;
}

// Tipo estrito para dados públicos da empresa (sem select('*'))
type PublicCompanyData = Pick<
  Company,
  'id' | 'name' | 'trade_name' | 'logo_url' | 'public_slug' | 'primary_color' | 'cover_image_url' | 'intro_text' | 'background_style'
>;

export default function PublicCompanyShowcase() {
  const { nick = '' } = useParams();
  const normalizedNick = normalizePublicSlug(nick);
  const [searchParams] = useSearchParams();
  const sellerRef = searchParams.get('ref');
  const [company, setCompany] = useState<PublicCompanyData | null>(null);
  const [events, setEvents] = useState<EventWithCompany[]>([]);
  const [sponsors, setSponsors] = useState<PublicSponsor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchShowcase = async () => {
      setLoading(true);

      // Query estrita: somente campos necessários para a vitrine (sem select('*'))
      const { data: companyData } = await supabase
        .from('companies')
        .select('id, name, trade_name, logo_url, public_slug, primary_color, cover_image_url, intro_text, background_style')
        .eq('public_slug', normalizedNick)
        .maybeSingle();

      if (!companyData) {
        setCompany(null);
        setEvents([]);
        setSponsors([]);
        setLoading(false);
        return;
      }

      setCompany(companyData as PublicCompanyData);

      // Buscar eventos e patrocinadores em paralelo para reduzir tempo de carregamento
      const [eventsRes, sponsorsRes] = await Promise.all([
        // Hardening Fase 1: whitelist estrita de colunas para reduzir superfície pública (sem select('*'))
        supabase
          .from('events')
          .select(`
            id, name, date, city, image_url, unit_price, status, is_archived, company_id,
            company:companies!events_company_id_fkey(
              id, name, logo_url, whatsapp
            )
          `)
          .eq('company_id', companyData.id)
          .eq('status', 'a_venda')
          .eq('is_archived', false)
          .order('date', { ascending: true }),
        // Patrocinadores: select estrito, apenas ativos da empresa, ordenação estável
        supabase
          .from('sponsors')
          .select('id, name, banner_url, link_type, site_url, whatsapp_phone, whatsapp_message')
          .eq('company_id', companyData.id)
          .eq('status', 'ativo')
          .order('carousel_order')
          .order('created_at'),
      ]);

      setEvents((eventsRes.data ?? []) as EventWithCompany[]);
      setSponsors((sponsorsRes.data ?? []) as PublicSponsor[]);
      setLoading(false);
    };

    void fetchShowcase();
  }, [normalizedNick]);

  const companyDisplayName = company?.trade_name || company?.name;

  if (nick !== normalizedNick && normalizedNick) {
    return <Navigate to={`/empresa/${normalizedNick}`} replace />;
  }

  // Hero: renderiza background baseado em background_style + cover_image_url + primary_color
  const renderHeroStyle = (): React.CSSProperties => {
    const primaryColor = company?.primary_color || '#F97316';
    const style = company?.background_style || 'solid';
    const coverUrl = company?.cover_image_url;

    if (style === 'cover_overlay' && coverUrl) {
      return {
        backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.5), rgba(0,0,0,0.6)), url(${coverUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      };
    }

    if (style === 'subtle_gradient') {
      return {
        background: `linear-gradient(135deg, ${primaryColor}22 0%, ${primaryColor}08 50%, transparent 100%)`,
      };
    }

    // solid (default)
    return {
      background: `${primaryColor}15`,
    };
  };

  // Gera URL de link do patrocinador (site ou whatsapp)
  const getSponsorLink = (sponsor: PublicSponsor): string | null => {
    if (sponsor.link_type === 'whatsapp' && sponsor.whatsapp_phone) {
      const phone = sponsor.whatsapp_phone.replace(/\D/g, '');
      const msg = sponsor.whatsapp_message ? `&text=${encodeURIComponent(sponsor.whatsapp_message)}` : '';
      return `https://wa.me/${phone}${msg}`;
    }
    if (sponsor.link_type === 'site' && sponsor.site_url) {
      return sponsor.site_url;
    }
    return null;
  };

  return (
    <PublicLayout>
      <div className="space-y-0">
        {!loading && !company ? (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
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
          </div>
        ) : (
          <>
            {/* Hero section: personalizada via background_style */}
            <section
              className="relative py-10 sm:py-14"
              style={loading ? {} : renderHeroStyle()}
            >
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-3">
                {company?.logo_url && (
                  <img
                    src={company.logo_url}
                    alt={`Logo ${companyDisplayName || ''}`}
                    className="mx-auto h-16 sm:h-20 w-auto object-contain"
                  />
                )}
                <h1 className={`text-2xl sm:text-3xl font-bold ${
                  company?.background_style === 'cover_overlay' && company?.cover_image_url
                    ? 'text-white'
                    : 'text-foreground'
                }`}>
                  {companyDisplayName ? `Vitrine da ${companyDisplayName}` : 'Vitrine da empresa'}
                </h1>
                <p className={`text-sm sm:text-base ${
                  company?.background_style === 'cover_overlay' && company?.cover_image_url
                    ? 'text-white/80'
                    : 'text-muted-foreground'
                }`}>
                  Eventos disponíveis para compra online
                </p>
              </div>
            </section>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
              {/* Texto de apresentação: renderiza somente se preenchido */}
              {!loading && company?.intro_text && (
                <section className="text-center max-w-2xl mx-auto">
                  <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
                    {company.intro_text}
                  </p>
                </section>
              )}

              {/* Patrocinadores: seção oculta se não houver ativos */}
              {!loading && sponsors.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider text-center">
                    Patrocinadores
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {sponsors.map((sponsor) => {
                      const link = getSponsorLink(sponsor);
                      const content = (
                        <div className="flex flex-col items-center gap-2 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50 h-full">
                          {sponsor.banner_url ? (
                            <img
                              src={sponsor.banner_url}
                              alt={sponsor.name}
                              className="h-12 w-full object-contain"
                            />
                          ) : (
                            <span className="text-xs font-medium text-muted-foreground text-center line-clamp-2">
                              {sponsor.name}
                            </span>
                          )}
                          {link && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              {sponsor.link_type === 'whatsapp' ? (
                                <MessageCircle className="h-3 w-3" />
                              ) : (
                                <ExternalLink className="h-3 w-3" />
                              )}
                              {sponsor.link_type === 'whatsapp' ? 'WhatsApp' : 'Site'}
                            </span>
                          )}
                        </div>
                      );

                      return link ? (
                        <a
                          key={sponsor.id}
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block"
                        >
                          {content}
                        </a>
                      ) : (
                        <div key={sponsor.id}>{content}</div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Carrossel de destaques (top 5 eventos) */}
              {!loading && events.length > 0 && (
                <section>
                  <EventsCarousel events={events.slice(0, 5)} sellerRef={sellerRef} />
                </section>
              )}

              {/* Grid de todos os eventos */}
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
            </div>
          </>
        )}
      </div>
    </PublicLayout>
  );
}
