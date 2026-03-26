import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Bus, CalendarDays, ChevronDown, ClipboardCheck, Copy, Download, ExternalLink, Eye, HeadsetIcon, MessageCircle, QrCode, MapPin, Pencil, Search, Settings, ShieldCheck, Ticket, UserCheck, X } from 'lucide-react';
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon';
import { supabase } from '@/integrations/supabase/client';
import { Company, CommercialPartner, EventWithCompany } from '@/types/database';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { EventCard, EventCardSkeletonGrid, EventsCarousel } from '@/components/public';
import { normalizePublicSlug } from '@/lib/publicSlug';
import { buildWhatsappWaMeLink, normalizeWhatsappForWaMe } from '@/lib/whatsapp';
import { useAuth } from '@/contexts/AuthContext';
import { EditHeroModal } from '@/components/public/showcase/EditHeroModal';
import { EditIntroModal } from '@/components/public/showcase/EditIntroModal';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { downloadShowcaseQrPng, downloadShowcaseQrSvg } from '@/lib/showcaseShare';
import { filterEventsByTerm } from '@/lib/eventSearch';
import { buildEventOperationalEndMap, filterOperationallyVisibleEvents } from '@/lib/eventOperationalWindow';

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
  'id' | 'name' | 'trade_name' | 'logo_url' | 'public_slug' | 'primary_color' | 'cover_image_url' | 'use_default_cover' | 'intro_text' | 'background_style' | 'whatsapp'
  | 'social_instagram' | 'social_facebook' | 'social_tiktok' | 'social_youtube' | 'social_telegram' | 'social_twitter' | 'social_website'
>;

export default function PublicCompanyShowcase() {
  const { nick = '' } = useParams();
  const normalizedNick = normalizePublicSlug(nick);
  const [searchParams] = useSearchParams();
  const sellerRef = searchParams.get('ref');
  const [company, setCompany] = useState<PublicCompanyData | null>(null);
  const [events, setEvents] = useState<EventWithCompany[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
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
        .select('id, name, trade_name, logo_url, public_slug, primary_color, cover_image_url, use_default_cover, intro_text, background_style, whatsapp, social_instagram, social_facebook, social_tiktok, social_youtube, social_telegram, social_twitter, social_website')
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

      const eventRows = (eventsRes.data ?? []) as EventWithCompany[];
      if (eventRows.length > 0) {
        const { data: boardings } = await supabase
          .from('event_boarding_locations')
          .select('event_id, departure_date, departure_time')
          .in('event_id', eventRows.map((event) => event.id))
          .eq('company_id', companyData.id)
          .not('departure_date', 'is', null);

        const operationalEndMap = buildEventOperationalEndMap(eventRows, (boardings ?? []) as any[]);
        setEvents(filterOperationallyVisibleEvents(eventRows, operationalEndMap) as EventWithCompany[]);
      } else {
        setEvents([]);
      }
      setSponsors((sponsorsRes.data ?? []) as PublicSponsor[]);
      setCommercialPartners((partnersRes.data ?? []) as CommercialPartner[]);
      setLoading(false);
    };

    void fetchShowcase();
  }, [normalizedNick]);

  const companyDisplayName = company?.trade_name || company?.name;
  const filteredEvents = useMemo(() => filterEventsByTerm(events, searchTerm), [events, searchTerm]);
  const featuredEvent = filteredEvents[0] ?? null;
  const showcaseSlug = normalizePublicSlug(company?.public_slug || normalizedNick);
  const showcaseShortLink = showcaseSlug ? `${window.location.origin}/${showcaseSlug}` : '';
  const canRenderShowcaseQr = showcaseSlug.length > 0;
  const getShowcaseQrFileBaseName = () => `qrcode-vitrine-${showcaseSlug || 'nick'}`;
  const DEFAULT_SHOWCASE_COVER_URL = '/assets/vitrine/Img_padrao_vitrine.png';
  // Prioridade do hero: capa personalizada > capa padrão do sistema > gradiente puro (quando removida manualmente)
  const resolvedCoverUrl = company?.cover_image_url || (company?.use_default_cover ? DEFAULT_SHOWCASE_COVER_URL : null);
  const hasCover = !!resolvedCoverUrl;
  // Comentário de suporte: a vitrine sempre usa o WhatsApp institucional da empresa atual,
  // sem fallback para o contato global da landing. Quando não houver cadastro, os CTAs somem com segurança.
  const companyWhatsappLink = buildWhatsappWaMeLink({
    phone: company?.whatsapp ?? null,
    message: `Olá! Vim pela vitrine da ${companyDisplayName || 'empresa'} e quero mais informações.`,
  });

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
    <PublicLayout hideMyTicketsButton={showEditUI} floatingWhatsappHref={companyWhatsappLink}>
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
                  Compre sua passagem para eventos, excursões e viagens organizadas com embarque claro, suporte da empresa e compra segura.
                </p>
                {/* Comentário de suporte: selos curtos reforçam confiança comercial sem inventar métricas ou alterar fluxo. */}
                {!loading && (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {[
                      { icon: Ticket, label: 'Passagens para eventos' },
                      { icon: MapPin, label: 'Embarque organizado' },
                      { icon: ShieldCheck, label: 'Compra segura' },
                      ...(companyWhatsappLink ? [{ icon: MessageCircle, label: 'Atendimento rápido' }] : []),
                    ].map(({ icon: Icon, label }) => (
                      <span
                        key={label}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
                          hasCover
                            ? 'border-white/20 bg-white/10 text-white backdrop-blur-sm'
                            : 'border-border bg-background/80 text-foreground'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </span>
                    ))}
                  </div>
                )}
                {/* CTAs: scroll para eventos + WhatsApp (condicional) */}
                {!loading && (
                  <div className="flex flex-col sm:flex-row gap-3 justify-center items-center pt-1">
                    <Button
                      size="lg"
                      className={hasCover
                        ? 'bg-white text-foreground hover:bg-white shadow-lg w-full sm:w-auto'
                        : 'w-full sm:w-auto'
                      }
                      onClick={() => document.getElementById('todos-eventos')?.scrollIntoView({ behavior: 'smooth' })}
                    >
                      <ChevronDown className="h-4 w-4" />
                      Ver viagens disponíveis
                    </Button>
                    {companyWhatsappLink && (() => {
                      const normalized = normalizeWhatsappForWaMe(company?.whatsapp);
                      if (!normalized) return null;
                      return (
                        <Button
                          size="lg"
                          className="hidden sm:inline-flex bg-[#25D366] text-white hover:bg-[#1DA851] shadow-md hover:shadow-lg transition-all animate-subtle-pulse w-full sm:w-auto"
                          asChild
                        >
                          <a href={companyWhatsappLink} target="_blank" rel="noopener noreferrer">
                            <WhatsAppIcon size={18} />
                            Falar no WhatsApp
                          </a>
                        </Button>
                      );
                    })()}
                  </div>
                )}
                {/* Redes sociais da empresa — exibidas somente se ao menos uma estiver preenchida */}
                {!loading && (() => {
                  const socials = [
                    { key: 'social_instagram', url: company?.social_instagram, label: 'Instagram', icon: (
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                    )},
                    { key: 'social_facebook', url: company?.social_facebook, label: 'Facebook', icon: (
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    )},
                    { key: 'social_tiktok', url: company?.social_tiktok, label: 'TikTok', icon: (
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>
                    )},
                    { key: 'social_youtube', url: company?.social_youtube, label: 'YouTube', icon: (
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                    )},
                    { key: 'social_telegram', url: company?.social_telegram, label: 'Telegram', icon: (
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                    )},
                    { key: 'social_twitter', url: company?.social_twitter, label: 'X / Twitter', icon: (
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932zM17.61 20.644h2.039L6.486 3.24H4.298z"/></svg>
                    )},
                    { key: 'social_website', url: company?.social_website, label: 'Site', icon: (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                    )},
                  ].filter(s => !!s.url);

                  if (socials.length === 0) return null;

                  return (
                    <div className="flex gap-3 justify-center items-center pt-2 flex-wrap">
                      {socials.map(s => (
                        <a
                          key={s.key}
                          href={s.url!}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={s.label}
                          className={`inline-flex items-center justify-center rounded-full p-2.5 transition-colors ${
                            hasCover
                              ? 'bg-white/20 text-white hover:bg-white/30'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                        >
                          {s.icon}
                        </a>
                      ))}
                    </div>
                  );
                })()}
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
              {!loading && filteredEvents.length > 0 && (
                <section className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                        Destaque principal
                      </span>
                      <h2 className="text-xl sm:text-2xl font-semibold text-foreground">
                        Escolha sua próxima viagem com mais clareza
                      </h2>
                      <p className="text-sm text-muted-foreground max-w-2xl">
                        Veja o evento em evidência e avance para a compra com data, local e valor bem visíveis.
                      </p>
                    </div>
                    {featuredEvent && (
                      <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground w-fit">
                        <CalendarDays className="h-3.5 w-3.5 text-primary" />
                        {filteredEvents.length} {filteredEvents.length === 1 ? 'evento disponível' : 'eventos disponíveis'}
                      </div>
                    )}
                  </div>
                  <EventsCarousel events={filteredEvents.slice(0, 5)} sellerRef={sellerRef} />
                </section>
              )}

               {/* Grid de todos os eventos */}
               <section id="todos-eventos" className="space-y-4 scroll-mt-4">
                 <div className="space-y-1">
                   <h2 className="text-lg sm:text-xl font-semibold text-foreground">Todos os eventos</h2>
                   <p className="text-sm text-muted-foreground">
                     Compare destinos, datas e valores para escolher a melhor opção da {companyDisplayName || 'empresa'}.
                   </p>
                 </div>

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
                     description="No momento esta empresa não possui eventos em venda."
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
                 <section className="space-y-4 rounded-2xl border bg-card/70 p-4 sm:p-6">
                   <div className="space-y-2 text-center max-w-2xl mx-auto">
                     <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                       Confiança para comprar
                     </span>
                     <h2 className="text-lg sm:text-xl font-semibold text-foreground">
                       Por que viajar com a gente?
                     </h2>
                     <p className="text-sm text-muted-foreground">
                       A vitrine foi organizada para você encontrar sua viagem, entender o embarque e comprar com mais segurança.
                     </p>
                   </div>
                   <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                     {[
                       { icon: Bus, label: 'Viagens organizadas com operação mais confortável' },
                       { icon: UserCheck, label: 'Equipe preparada para conduzir o embarque' },
                       { icon: ClipboardCheck, label: 'Informações do embarque apresentadas com clareza' },
                       { icon: ShieldCheck, label: 'Compra segura com confirmação pelo sistema' },
                       ...(company?.whatsapp
                         ? [{ icon: HeadsetIcon, label: 'Atendimento rápido para tirar dúvidas no WhatsApp' }]
                         : []),
                       { icon: MapPin, label: 'Locais e destinos destacados para facilitar a escolha' },
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
