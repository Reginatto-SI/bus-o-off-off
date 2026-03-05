import { useEffect, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { ExternalLink, Eye, MessageCircle, Pencil, Settings, Ticket, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Company, EventWithCompany } from '@/types/database';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { EventCard, EventCardSkeletonGrid, EventsCarousel } from '@/components/public';
import { normalizePublicSlug } from '@/lib/publicSlug';
import { useAuth } from '@/contexts/AuthContext';
import { EditHeroModal } from '@/components/public/showcase/EditHeroModal';
import { EditIntroModal } from '@/components/public/showcase/EditIntroModal';

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

  // --- Fase 2: Modo edição inline (somente gerente da própria empresa) ---
  const { session, isGerente, activeCompanyId } = useAuth();
  const canEdit = !!session && isGerente && !!company && company.id === activeCompanyId;
  const [editMode, setEditMode] = useState(false);
  const [clientView, setClientView] = useState(false);
  const showEditUI = canEdit && editMode && !clientView;

  // Modais
  const [heroModalOpen, setHeroModalOpen] = useState(false);
  const [introModalOpen, setIntroModalOpen] = useState(false);

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
        backgroundImage: `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.35)), url(${coverUrl})`,
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

  // Callbacks dos modais — atualizam state local sem refetch
  const handleHeroSave = (data: { cover_image_url: string | null; background_style: string }) => {
    setCompany((prev) => prev ? { ...prev, cover_image_url: data.cover_image_url, background_style: data.background_style as PublicCompanyData['background_style'] } : prev);
  };

  const handleIntroSave = (introText: string | null) => {
    setCompany((prev) => prev ? { ...prev, intro_text: introText } : prev);
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
            {/* Fase 2: Barra de controle do gerente — visível apenas para gerente da própria empresa */}
            {canEdit && !clientView && (
              <div className="bg-muted/60 border-b">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-4 flex-wrap text-sm">
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-foreground">Modo edição</span>
                    <Switch checked={editMode} onCheckedChange={setEditMode} />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setClientView(true)}
                    className="gap-1.5"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Ver como cliente
                  </Button>
                  <Button variant="ghost" size="sm" asChild className="gap-1.5">
                    <Link to="/admin/patrocinadores">
                      Gerenciar patrocinadores
                    </Link>
                  </Button>
                </div>
              </div>
            )}

            {/* Fase 2: Botão flutuante para sair da visão de cliente */}
            {canEdit && clientView && (
              <button
                onClick={() => setClientView(false)}
                className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-foreground text-background px-4 py-2.5 text-sm font-medium shadow-lg hover:opacity-90 transition-opacity"
              >
                <X className="h-4 w-4" />
                Sair da visão de cliente
              </button>
            )}

            {/* Hero section: personalizada via background_style */}
            <section
              className={`relative ${
                company?.background_style === 'cover_overlay' && company?.cover_image_url
                  ? 'h-[280px] sm:h-[420px]'
                  : 'py-10 sm:py-14'
              } flex items-center justify-center`}
              style={loading ? {} : renderHeroStyle()}
            >
              {/* Fase 2: Ícone de edição do hero (capa + estilo) */}
              {showEditUI && (
                <button
                  onClick={() => setHeroModalOpen(true)}
                  className="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-md bg-background/80 backdrop-blur-sm border px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-background transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar aparência
                </button>
              )}
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-3 w-full">
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
              {!loading && (company?.intro_text || showEditUI) && (
                <section className="relative text-center max-w-2xl mx-auto">
                  {/* Fase 2: Ícone de edição do texto de apresentação */}
                  {showEditUI && (
                    <button
                      onClick={() => setIntroModalOpen(true)}
                      className="absolute -top-1 -right-1 z-10 flex items-center gap-1 rounded-md bg-background/80 backdrop-blur-sm border px-2 py-1 text-xs font-medium text-foreground shadow-sm hover:bg-background transition-colors"
                    >
                      <Pencil className="h-3 w-3" />
                      Editar
                    </button>
                  )}
                  {company?.intro_text ? (
                    <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
                      {company.intro_text}
                    </p>
                  ) : showEditUI ? (
                    <p className="text-muted-foreground/50 text-sm italic">
                      Nenhum texto de apresentação definido. Clique em "Editar" para adicionar.
                    </p>
                  ) : null}
                </section>
              )}

              {/* Patrocinadores: seção oculta se não houver ativos */}
              {!loading && (sponsors.length > 0 || showEditUI) && (
                <section className="space-y-3">
                  <div className="flex items-center justify-center gap-2">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider text-center">
                      Patrocinadores
                    </h2>
                    {/* Fase 2: Atalho para gerenciar patrocinadores no admin */}
                    {showEditUI && (
                      <Button variant="ghost" size="sm" asChild className="gap-1 h-6 text-xs">
                        <Link to="/admin/patrocinadores">
                          <Pencil className="h-3 w-3" />
                          Gerenciar
                        </Link>
                      </Button>
                    )}
                  </div>
                  {sponsors.length > 0 ? (
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
                  ) : showEditUI ? (
                    <p className="text-center text-muted-foreground/50 text-sm italic">
                      Nenhum patrocinador ativo. Use "Gerenciar" para adicionar.
                    </p>
                  ) : null}
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

      {/* Fase 2: Modais de edição — renderizados apenas quando gerente pode editar */}
      {canEdit && company && (
        <>
          <EditHeroModal
            open={heroModalOpen}
            onOpenChange={setHeroModalOpen}
            companyId={company.id}
            currentCoverUrl={company.cover_image_url}
            currentBackgroundStyle={company.background_style}
            onSave={handleHeroSave}
          />
          <EditIntroModal
            open={introModalOpen}
            onOpenChange={setIntroModalOpen}
            companyId={company.id}
            currentIntroText={company.intro_text}
            onSave={handleIntroSave}
          />
        </>
      )}
    </PublicLayout>
  );
}
