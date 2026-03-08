import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Bus, ChevronDown, ClipboardCheck, Copy, Download, ExternalLink, Eye, HeadsetIcon, MessageCircle, QrCode, MapPin, Pencil, Settings, ShieldCheck, Ticket, UserCheck, X } from 'lucide-react';
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon';
import { supabase } from '@/integrations/supabase/client';
import { Company, CommercialPartner, EventWithCompany } from '@/types/database';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { EventCard, EventCardSkeletonGrid, EventsCarousel } from '@/components/public';
import { normalizePublicSlug } from '@/lib/publicSlug';
import { normalizeWhatsappForWaMe } from '@/lib/whatsapp';
import { useAuth } from '@/contexts/AuthContext';
import { EditHeroModal } from '@/components/public/showcase/EditHeroModal';
import { EditIntroModal } from '@/components/public/showcase/EditIntroModal';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { downloadShowcaseQrPng, downloadShowcaseQrSvg } from '@/lib/showcaseShare';

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
  'id' | 'name' | 'trade_name' | 'logo_url' | 'public_slug' | 'primary_color' | 'cover_image_url' | 'use_default_cover' | 'intro_text' | 'background_style'
>;

export default function PublicCompanyShowcase() {
  const { nick = '' } = useParams();
  const normalizedNick = normalizePublicSlug(nick);
  const [searchParams] = useSearchParams();
  const sellerRef = searchParams.get('ref');
  const [company, setCompany] = useState<PublicCompanyData | null>(null);
  const [events, setEvents] = useState<EventWithCompany[]>([]);
  const [sponsors, setSponsors] = useState<PublicSponsor[]>([]);
  const [commercialPartners, setCommercialPartners] = useState<CommercialPartner[]>([]);
  const [loading, setLoading] = useState(true);

  // --- Fase 2: Modo edição inline (somente gerente da própria empresa) ---
  const { session, isGerente, activeCompanyId } = useAuth();
  const canEdit = !!session && isGerente && !!company && company.id === activeCompanyId;
  const [editMode, setEditMode] = useState(false);
  const [clientView, setClientView] = useState(false);
  const showEditUI = canEdit && editMode && !clientView;
  const showcaseQrRef = useRef<HTMLDivElement | null>(null);

  // Modais
  const [heroModalOpen, setHeroModalOpen] = useState(false);
  const [introModalOpen, setIntroModalOpen] = useState(false);

  useEffect(() => {
    const fetchShowcase = async () => {
      setLoading(true);

      // Query estrita: somente campos necessários para a vitrine (sem select('*'))
      const { data: companyData } = await supabase
        .from('companies')
        .select('id, name, trade_name, logo_url, public_slug, primary_color, cover_image_url, use_default_cover, intro_text, background_style')
        .eq('public_slug', normalizedNick)
        .maybeSingle();

      if (!companyData) {
        setCompany(null);
        setEvents([]);
        setSponsors([]);
        setCommercialPartners([]);
        setLoading(false);
        setLoading(false);
        return;
      }

      setCompany(companyData as PublicCompanyData);

      // Buscar eventos e patrocinadores em paralelo para reduzir tempo de carregamento
      const [eventsRes, sponsorsRes, partnersRes] = await Promise.all([
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
        supabase
          .from('sponsors')
          .select('id, name, banner_url, link_type, site_url, whatsapp_phone, whatsapp_message')
          .eq('company_id', companyData.id)
          .eq('status', 'ativo')
          .order('carousel_order')
          .order('created_at'),
        supabase
          .from('commercial_partners')
          .select('*')
          .eq('company_id', companyData.id)
          .eq('status', 'ativo')
          .eq('show_on_showcase', true)
          .order('display_order', { ascending: true })
          .order('created_at'),
      ]);

      setEvents((eventsRes.data ?? []) as EventWithCompany[]);
      setSponsors((sponsorsRes.data ?? []) as PublicSponsor[]);
      setCommercialPartners((partnersRes.data ?? []) as CommercialPartner[]);
      setLoading(false);
    };

    void fetchShowcase();
  }, [normalizedNick]);

  const companyDisplayName = company?.trade_name || company?.name;
  const showcaseSlug = normalizePublicSlug(company?.public_slug || normalizedNick);
  const showcaseShortLink = showcaseSlug ? `${window.location.origin}/${showcaseSlug}` : '';
  const canRenderShowcaseQr = showcaseSlug.length > 0;
  const getShowcaseQrFileBaseName = () => `qrcode-vitrine-${showcaseSlug || 'nick'}`;
  const DEFAULT_SHOWCASE_COVER_URL = '/assets/vitrine/Img_padrao_vitrine.png';
  // Prioridade do hero: capa personalizada > capa padrão do sistema > gradiente puro (quando removida manualmente)
  const resolvedCoverUrl = company?.cover_image_url || (company?.use_default_cover ? DEFAULT_SHOWCASE_COVER_URL : null);
  const hasCover = !!resolvedCoverUrl;

  if (nick !== normalizedNick && normalizedNick) {
    return <Navigate to={`/empresa/${normalizedNick}`} replace />;
  }

  // Hero: renderiza background baseado em cover_image_url + background_style + primary_color
  const renderHeroStyle = (): React.CSSProperties => {
    const style = company?.background_style || 'solid';
    const coverUrl = resolvedCoverUrl;

    // Gradiente premium padrão da vitrine pública (usado sempre que não houver capa).
    // Mantém a aparência clara/elegante e evita hero "vazio" ao remover imagem.
    const premiumGradient = 'linear-gradient(135deg, #FFF7ED 0%, #FFE9D6 50%, #F8F6F4 100%)';

    // Se há capa, SEMPRE exibir como background — style controla intensidade do overlay
    if (coverUrl) {
      const overlayOpacity = style === 'solid' ? 0.45 : style === 'subtle_gradient' ? 0.3 : 0.35;
      return {
        backgroundImage: `linear-gradient(rgba(0,0,0,${overlayOpacity}), rgba(0,0,0,${overlayOpacity})), url(${coverUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      };
    }

    // Sem capa: sempre aplicar gradiente premium como padrão da plataforma.
    return {
      background: premiumGradient,
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
  const handleHeroSave = (data: { cover_image_url: string | null; use_default_cover: boolean; background_style: string }) => {
    setCompany((prev) => prev ? {
      ...prev,
      cover_image_url: data.cover_image_url,
      use_default_cover: data.use_default_cover,
      background_style: data.background_style as PublicCompanyData['background_style'],
    } : prev);
  };

  const handleIntroSave = (introText: string | null) => {
    setCompany((prev) => prev ? { ...prev, intro_text: introText } : prev);
  };

  const handleCopyShowcaseLink = async () => {
    if (!showcaseShortLink) return;
    try {
      await navigator.clipboard.writeText(showcaseShortLink);
      toast.success('Link da vitrine copiado!');
    } catch {
      toast.error('Falha ao copiar link da vitrine');
    }
  };

  const handleDownloadShowcaseQrSvg = () => {
    if (!canRenderShowcaseQr) {
      toast.error('Nick da vitrine inválido para exportar o QR Code');
      return;
    }

    const result = downloadShowcaseQrSvg(showcaseQrRef.current, getShowcaseQrFileBaseName());
    if (result !== 'ok') {
      toast.error('Erro ao gerar SVG do QR Code');
      return;
    }

    toast.success('QR Code SVG baixado!');
  };

  const handleDownloadShowcaseQrPng = async () => {
    if (!canRenderShowcaseQr) {
      toast.error('Nick da vitrine inválido para exportar o QR Code');
      return;
    }

    const result = await downloadShowcaseQrPng(showcaseQrRef.current, getShowcaseQrFileBaseName());
    if (result === 'missing_svg') {
      toast.error('Erro ao gerar PNG do QR Code');
      return;
    }

    if (result === 'render_error') {
      toast.error('Erro ao renderizar PNG do QR Code');
      return;
    }

    if (result === 'export_error') {
      toast.error('Erro ao exportar PNG do QR Code');
      return;
    }

    if (result === 'process_error') {
      toast.error('Erro ao processar QR Code para download');
      return;
    }

    toast.success('QR Code PNG baixado!');
  };

  return (
    <PublicLayout hideMyTicketsButton={showEditUI}>
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
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-3 flex-wrap text-sm">
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
                  <div className="h-5 w-px bg-border hidden md:block" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => void handleCopyShowcaseLink()}
                      disabled={!showcaseShortLink}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copiar link da vitrine
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => void handleDownloadShowcaseQrPng()}
                      disabled={!canRenderShowcaseQr}
                    >
                      <Download className="h-3.5 w-3.5" />
                      QR PNG
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={handleDownloadShowcaseQrSvg}
                      disabled={!canRenderShowcaseQr}
                    >
                      <QrCode className="h-3.5 w-3.5" />
                      QR SVG
                    </Button>
                  </div>
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
                hasCover
                  ? 'h-[320px] sm:h-[480px]'
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
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-5 w-full">
                {company?.logo_url && (
                  <div className="inline-block bg-white rounded-xl p-2 shadow-md">
                    <img
                      src={company.logo_url}
                      alt={`Logo ${companyDisplayName || ''}`}
                      className="h-16 sm:h-20 w-auto object-contain"
                    />
                  </div>
                )}
                <h1 className={`text-2xl sm:text-3xl font-bold ${
                  hasCover ? 'text-white' : 'text-foreground'
                }`}>
                  {companyDisplayName ? `Excursões e eventos com a ${companyDisplayName}` : 'Excursões e eventos'}
                </h1>
                <p className={`text-sm sm:text-base max-w-lg mx-auto ${
                  hasCover ? 'text-white/80' : 'text-muted-foreground'
                }`}>
                  Confira os próximos eventos e garanta sua passagem com segurança.
                </p>
                {/* CTAs: scroll para eventos + WhatsApp (condicional) */}
                {!loading && (
                  <div className="flex flex-col sm:flex-row gap-3 justify-center items-center pt-1">
                    <Button
                      size="lg"
                      className={hasCover
                        ? 'bg-white/90 text-foreground hover:bg-white shadow-lg w-full sm:w-auto'
                        : 'w-full sm:w-auto'
                      }
                      onClick={() => document.getElementById('todos-eventos')?.scrollIntoView({ behavior: 'smooth' })}
                    >
                      <ChevronDown className="h-4 w-4" />
                      Ver eventos disponíveis
                    </Button>
                    {(() => {
                      const whatsapp = events[0]?.company?.whatsapp;
                      const normalized = normalizeWhatsappForWaMe(whatsapp);
                      if (!normalized) return null;
                      return (
                        <Button
                          size="lg"
                          className="bg-[#25D366] text-white hover:bg-[#1DA851] shadow-md hover:shadow-lg transition-all animate-subtle-pulse w-full sm:w-auto"
                          asChild
                        >
                          <a href={`https://wa.me/${normalized}`} target="_blank" rel="noopener noreferrer">
                            <WhatsAppIcon size={18} />
                            Falar no WhatsApp
                          </a>
                        </Button>
                      );
                    })()}
                  </div>
                )}
              </div>
            </section>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
              {/* Comentário: QR oculto no DOM para reaproveitar a mesma serialização/exportação usada no admin. */}
              {canEdit && canRenderShowcaseQr && (
                <div className="sr-only" aria-hidden>
                  <div ref={showcaseQrRef}>
                    <QRCodeSVG value={showcaseShortLink} size={220} level="H" includeMargin={false} />
                  </div>
                </div>
              )}

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

              {/* Carrossel de destaques (top 5 eventos) */}
              {!loading && events.length > 0 && (
                <section>
                  <EventsCarousel events={events.slice(0, 5)} sellerRef={sellerRef} />
                </section>
              )}

               {/* Grid de todos os eventos */}
               <section id="todos-eventos" className="space-y-4 scroll-mt-4">
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

               {/* Parceiros oficiais: seção visível se houver parceiros com show_on_showcase */}
               {!loading && (commercialPartners.length > 0 || showEditUI) && (
                 <section className="space-y-3">
                   <div className="flex items-center justify-center gap-2">
                     <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider text-center">
                       Parceiros oficiais
                     </h2>
                     {showEditUI && (
                       <Button variant="ghost" size="sm" asChild className="gap-1 h-6 text-xs">
                         <Link to="/admin/parceiros">
                           <Pencil className="h-3 w-3" />
                           Gerenciar
                         </Link>
                       </Button>
                     )}
                   </div>
                   {commercialPartners.length > 0 ? (
                     <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                       {commercialPartners.map((partner) => {
                         const link = partner.website_url;
                         const content = (
                           <div className="flex flex-col items-center gap-2 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50 h-full">
                             {partner.logo_url ? (
                               <img
                                 src={partner.logo_url}
                                 alt={partner.name}
                                 className="h-12 w-full object-contain"
                               />
                             ) : (
                               <span className="text-xs font-medium text-muted-foreground text-center line-clamp-2">
                                 {partner.name}
                               </span>
                             )}
                             {link && (
                               <span className="text-xs text-muted-foreground flex items-center gap-1">
                                 <ExternalLink className="h-3 w-3" />
                                 Site
                               </span>
                             )}
                           </div>
                         );

                         return link ? (
                           <a
                             key={partner.id}
                             href={link}
                             target="_blank"
                             rel="noopener noreferrer"
                             className="block"
                           >
                             {content}
                           </a>
                         ) : (
                           <div key={partner.id}>{content}</div>
                         );
                       })}
                     </div>
                   ) : showEditUI ? (
                     <p className="text-center text-muted-foreground/50 text-sm italic">
                       Nenhum parceiro ativo com exibição na vitrine. Use "Gerenciar" para configurar.
                     </p>
                   ) : null}
                 </section>
               )}

               {/* Seção de confiança — mini-site */}
               {!loading && company && (
                 <section className="space-y-4">
                   <h2 className="text-lg sm:text-xl font-semibold text-foreground text-center">
                     Por que viajar com a gente?
                   </h2>
                   <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                     {[
                       { icon: Bus, label: 'Ônibus confortável e revisado' },
                       { icon: UserCheck, label: 'Motoristas experientes' },
                       { icon: ClipboardCheck, label: 'Embarque organizado por lista' },
                       { icon: ShieldCheck, label: 'Compra segura pelo sistema' },
                       ...(events[0]?.company?.whatsapp
                         ? [{ icon: HeadsetIcon, label: 'Suporte rápido via WhatsApp' }]
                         : []),
                       { icon: MapPin, label: 'Informações claras do embarque' },
                     ].map(({ icon: Icon, label }) => (
                       <div
                         key={label}
                         className="flex flex-col items-center gap-2 rounded-lg border bg-card p-4 text-center"
                       >
                         <Icon className="h-5 w-5 text-primary" />
                         <span className="text-xs sm:text-sm text-muted-foreground leading-snug">
                           {label}
                         </span>
                       </div>
                     ))}
                   </div>
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
            useDefaultCover={company.use_default_cover}
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
