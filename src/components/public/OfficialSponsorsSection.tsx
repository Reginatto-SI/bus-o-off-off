import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Bus, Star, TrendingUp } from "lucide-react";
import { buildWhatsappWaMeLink } from "@/lib/whatsapp";

type OfficialSponsorPlaceholderCard = {
  type: "placeholder";
  icon: typeof Star;
  headline: string;
  text: string;
  cta: string;
  accent: string;
};

type OfficialSponsorRealCard = {
  type: "sponsor";
  sponsorName: string;
  headline: string;
  text: string;
  cta: string;
  imageSrc: string;
  desktopImageSrc?: string;
  mobileImageSrc?: string;
  href: string;
  alt: string;
  desktopAlt?: string;
  mobileAlt?: string;
  accent?: string;
  icon?: typeof Star;
};

type OfficialSponsorCard = OfficialSponsorPlaceholderCard | OfficialSponsorRealCard;

type OfficialSponsorsSectionProps = {
  title?: string;
  subtitle?: string;
  className?: string;
  compact?: boolean;
};

// Manutenção: patrocinadores reais podem usar banners em /public/sponsors/.
// Recomendado: desktop em /public/sponsors/ com .webp ou .png, proporção larga 5:1 (2000 x 400 px).
// Mobile permanece 16:9 (1200 x 675 px). Use desktopImageSrc/mobileImageSrc quando houver criativos separados.
// Exemplo para patrocinador real:
// {
//   type: "sponsor",
//   sponsorName: "Nome da Empresa",
//   headline: "Nome da Empresa",
//   text: "Patrocinador oficial SmartBus BR.",
//   cta: "Conhecer patrocinador",
//   imageSrc: "/sponsors/patrocinador-01-mobile.webp",
//   desktopImageSrc: "/sponsors/patrocinador-01-desktop.webp",
//   mobileImageSrc: "/sponsors/patrocinador-01-mobile.webp",
//   href: "https://site-do-patrocinador.com.br",
//   alt: "Banner do patrocinador Nome da Empresa",
//   desktopAlt: "Banner horizontal do patrocinador Nome da Empresa",
//   mobileAlt: "Banner mobile do patrocinador Nome da Empresa",
// }
// Fonte única dos cards oficiais: landing e /eventos reaproveitam os mesmos placeholders e patrocinadores reais.
const OFFICIAL_SPONSOR_CARDS: OfficialSponsorCard[] = [
  {
    type: "placeholder",
    icon: Star,
    headline: "Anuncie aqui",
    text: "Sua marca pode aparecer em uma área de destaque dentro do SmartBus BR.",
    cta: "Quero ser patrocinador",
    accent: "from-primary/20 via-white to-orange-50",
  },
  {
    type: "placeholder",
    icon: TrendingUp,
    headline: "Sua marca em uma plataforma em crescimento",
    text: "Conecte sua empresa a uma vitrine digital de excursões e passagens.",
    cta: "Conhecer espaço publicitário",
    accent: "from-slate-950 via-slate-800 to-primary/70",
  },
  {
    type: "placeholder",
    icon: Bus,
    headline: "Se você viu este espaço, seu público também pode ver",
    text: "Fortaleça sua marca em um ambiente profissional, moderno e conectado ao setor de viagens e transporte.",
    cta: "Falar com a equipe",
    accent: "from-white via-orange-50 to-primary/20",
  },
];

export function OfficialSponsorsSection({
  title = "Patrocinadores Oficiais SmartBus BR",
  subtitle = "Sua marca pode aparecer em uma vitrine digital em crescimento, vista por empresas, organizadores e passageiros.",
  // Landing padrão mais compacta para integrar a seção ao fluxo sem afetar o modo compact de /eventos.
  className = "bg-gradient-to-b from-background to-muted/30 py-8 sm:py-10",
  compact = false,
}: OfficialSponsorsSectionProps) {
  const [activeSponsorCardIndex, setActiveSponsorCardIndex] = useState(0);
  const sponsorCarouselRef = useRef<HTMLDivElement>(null);
  const [isDesktopSponsorCarouselHovered, setIsDesktopSponsorCarouselHovered] = useState(false);
  const [hasInteractedWithDesktopSponsorCarousel, setHasInteractedWithDesktopSponsorCarousel] = useState(false);
  const [hasInteractedWithMobileSponsorCarousel, setHasInteractedWithMobileSponsorCarousel] = useState(false);
  const sponsorWhatsappUrl =
    buildWhatsappWaMeLink({
      phone: "(31) 99207-4309",
      message: "Olá! Quero conhecer os espaços de Patrocinadores Oficiais do SmartBus BR.",
    }) ??
    "https://wa.me/5531992074309?text=Ol%C3%A1!%20Quero%20conhecer%20os%20espa%C3%A7os%20de%20Patrocinadores%20Oficiais%20do%20SmartBus%20BR.";


  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isDesktopViewport = window.matchMedia("(min-width: 1024px)").matches;
    if (
      prefersReducedMotion ||
      !isDesktopViewport ||
      isDesktopSponsorCarouselHovered ||
      hasInteractedWithDesktopSponsorCarousel ||
      OFFICIAL_SPONSOR_CARDS.length <= 1
    ) {
      return;
    }

    // Autoplay discreto no banner desktop preservado sem alterar setas, dots ou layout amplo.
    const interval = window.setInterval(() => {
      setActiveSponsorCardIndex((currentIndex) => (currentIndex + 1) % OFFICIAL_SPONSOR_CARDS.length);
    }, 8000);

    return () => window.clearInterval(interval);
  }, [hasInteractedWithDesktopSponsorCarousel, isDesktopSponsorCarouselHovered]);

  const selectDesktopSponsorCard = (index: number) => {
    setHasInteractedWithDesktopSponsorCarousel(true);
    setActiveSponsorCardIndex(index);
  };

  const showPreviousDesktopSponsor = () => {
    selectDesktopSponsorCard((activeSponsorCardIndex - 1 + OFFICIAL_SPONSOR_CARDS.length) % OFFICIAL_SPONSOR_CARDS.length);
  };

  const showNextDesktopSponsor = () => {
    selectDesktopSponsorCard((activeSponsorCardIndex + 1) % OFFICIAL_SPONSOR_CARDS.length);
  };

  const handleSponsorCarouselScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    const firstCard = container.querySelector<HTMLElement>("[data-sponsor-card]");
    if (!firstCard) return;

    // Mantém o indicador mobile sincronizado sem biblioteca extra: cada item ocupa a largura visível do scroll.
    const step = firstCard.offsetWidth;
    if (step <= 0) return;

    const nextIndex = Math.min(
      OFFICIAL_SPONSOR_CARDS.length - 1,
      Math.max(0, Math.round(container.scrollLeft / step)),
    );
    setActiveSponsorCardIndex(nextIndex);
  };

  const scrollToSponsorCard = useCallback((index: number, shouldMarkInteraction = true) => {
    if (shouldMarkInteraction) {
      setHasInteractedWithMobileSponsorCarousel(true);
    }

    const container = sponsorCarouselRef.current;
    const card = container?.querySelector<HTMLElement>(`[data-sponsor-card="${index}"]`);
    if (container && card) {
      // Evita desalinhamento lateral no mobile: o snap começa no início do item, não no centro.
      container.scrollTo({ left: card.offsetLeft - container.offsetLeft, behavior: "smooth" });
    }
    setActiveSponsorCardIndex(index);
  }, []);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobileViewport = window.matchMedia("(max-width: 1023px)").matches;
    if (
      prefersReducedMotion ||
      !isMobileViewport ||
      hasInteractedWithMobileSponsorCarousel ||
      OFFICIAL_SPONSOR_CARDS.length <= 1
    ) {
      return;
    }

    // Mobile ganha rotação leve, mas para após toque/arraste/dot para priorizar controle manual.
    const interval = window.setInterval(() => {
      const nextIndex = (activeSponsorCardIndex + 1) % OFFICIAL_SPONSOR_CARDS.length;
      scrollToSponsorCard(nextIndex, false);
    }, 7000);

    return () => window.clearInterval(interval);
  }, [activeSponsorCardIndex, hasInteractedWithMobileSponsorCarousel, scrollToSponsorCard]);

  return (
    <section className={className}>
      <div className={`mx-auto max-w-7xl ${compact ? "px-0" : "px-4 sm:px-6 lg:px-8"}`}>
        <div className={`rounded-[2rem] border border-border/80 bg-card/95 shadow-[0_28px_80px_-60px_rgba(15,23,42,0.55)] ${compact ? "p-3 sm:p-4 lg:p-5" : "p-4 sm:p-5 lg:p-6"}`}>
          <div className={`flex flex-col ${compact ? "gap-3" : "gap-3"} lg:flex-row lg:items-end lg:justify-between`}>
            <div className={`${compact ? "max-w-4xl space-y-2" : "max-w-3xl space-y-2"}`}>
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Star className="h-3.5 w-3.5" />
                Espaços comerciais oficiais
              </div>
              <div className={compact ? "space-y-1.5" : "space-y-2"}>
                <h2 className={`${compact ? "text-lg sm:text-xl" : "text-2xl sm:text-3xl"} font-extrabold tracking-tight text-foreground`}>
                  {title}
                </h2>
                <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">{subtitle}</p>
              </div>
            </div>
            {!compact && (
              <div className="rounded-2xl border border-primary/15 bg-primary/5 p-3 text-sm text-muted-foreground lg:max-w-sm">
                <p className="font-semibold text-foreground">Destaque sua marca em uma área oficial do SmartBus BR.</p>
                <p className="mt-1">Espaços pensados para marcas que querem estar próximas de empresas, organizadores e passageiros em uma vitrine digital de viagens e excursões.</p>
              </div>
            )}
          </div>

          <div
            ref={sponsorCarouselRef}
            onScroll={handleSponsorCarouselScroll}
            onPointerDown={() => setHasInteractedWithMobileSponsorCarousel(true)}
            className={`${compact ? "mt-3 sm:mt-4" : "mt-4 sm:mt-5"} flex snap-x snap-mandatory gap-0 overflow-x-auto pb-3 [scrollbar-width:none] [-ms-overflow-style:none] lg:hidden [&::-webkit-scrollbar]:hidden`}
          >
            {OFFICIAL_SPONSOR_CARDS.map((card, index) => {
              const cardHref = card.type === "sponsor" ? card.href : sponsorWhatsappUrl;
              const mobileImageSrc = card.type === "sponsor" ? card.mobileImageSrc ?? card.imageSrc : undefined;
              const mobileAlt = card.type === "sponsor" ? card.mobileAlt ?? card.alt : undefined;

              return (
                <article
                  key={card.headline}
                  data-sponsor-card={index}
                  className="flex w-full min-w-0 flex-none basis-full snap-start flex-col overflow-hidden rounded-[1.6rem] border border-border/80 bg-background shadow-[0_24px_60px_-46px_rgba(15,23,42,0.65)]"
                >
                  <div className={`relative aspect-video overflow-hidden bg-gradient-to-br ${card.accent ?? "from-white via-orange-50 to-primary/15"}`}>
                    {card.type === "sponsor" ? (
                      <a href={card.href} target="_blank" rel="noreferrer" aria-label={`Abrir site do patrocinador ${card.sponsorName}`}>
                        <img src={mobileImageSrc} alt={mobileAlt} className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]" loading="lazy" />
                      </a>
                    ) : (
                      <div className="flex h-full items-center justify-center px-6 text-center">
                        {/* Placeholder limpo: a área superior deve se comportar como banner real, sem competir com o conteúdo do card. */}
                        <div className="space-y-3">
                          <p className="text-lg font-semibold uppercase tracking-[0.34em] text-slate-900">Anuncie aqui</p>
                          <p className="mx-auto max-w-[15rem] text-sm leading-relaxed text-slate-500">Espaço reservado para patrocinador oficial</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className={`flex min-w-0 flex-1 flex-col ${compact ? "space-y-2 p-4" : "space-y-3 p-5"}`}>
                    <h3 className={`${compact ? "min-h-0" : "min-h-[2.5rem]"} break-words text-base font-bold leading-tight text-foreground`}>{card.headline}</h3>
                    <p className={`${compact ? "min-h-0" : "min-h-[3rem]"} flex-1 break-words text-sm leading-relaxed text-muted-foreground`}>{card.text}</p>
                    <a href={cardHref} target="_blank" rel="noreferrer" className="mt-auto inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary to-orange-500 px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/15 transition-all hover:-translate-y-0.5 hover:shadow-primary/25">
                      {card.cta}
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-3 flex justify-center gap-2 lg:hidden">
            {OFFICIAL_SPONSOR_CARDS.map((card, index) => (
              <button type="button" key={`sponsor-dot-${card.headline}`} onClick={() => scrollToSponsorCard(index)} className={`h-2 rounded-full transition-all ${index === activeSponsorCardIndex ? "w-6 bg-primary" : "w-2 bg-primary/30"}`} aria-label={`Ver patrocinador ${index + 1}`} />
            ))}
          </div>

          <div
            className={`${compact ? "mt-4" : "mt-5"} hidden lg:block`}
            onMouseEnter={() => setIsDesktopSponsorCarouselHovered(true)}
            onMouseLeave={() => setIsDesktopSponsorCarouselHovered(false)}
            onFocus={() => setHasInteractedWithDesktopSponsorCarousel(true)}
          >
            {(() => {
              const activeCard = OFFICIAL_SPONSOR_CARDS[activeSponsorCardIndex] ?? OFFICIAL_SPONSOR_CARDS[0];
              const desktopImageSrc = activeCard.type === "sponsor" ? activeCard.desktopImageSrc ?? activeCard.imageSrc : undefined;
              const desktopAlt = activeCard.type === "sponsor" ? activeCard.desktopAlt ?? activeCard.alt : undefined;
              const activeHref = activeCard.type === "sponsor" ? activeCard.href : sponsorWhatsappUrl;

              return (
                <div className="relative">
                  <button type="button" onClick={showPreviousDesktopSponsor} className="absolute left-4 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-background/80 text-foreground shadow-lg backdrop-blur transition hover:bg-background" aria-label="Ver patrocinador anterior">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div className={`overflow-hidden rounded-[1.75rem] border border-border/80 bg-gradient-to-br shadow-[0_28px_90px_-55px_rgba(15,23,42,0.7)] ${activeCard.accent ?? "from-white via-orange-50 to-primary/15"}`}>
                    {activeCard.type === "sponsor" ? (
                      <a href={activeCard.href} target="_blank" rel="noreferrer" aria-label={`Abrir site do patrocinador ${activeCard.sponsorName}`} className="block">
                        <img src={desktopImageSrc} alt={desktopAlt} className="aspect-[5/1] w-full object-cover transition-transform duration-500 hover:scale-[1.01]" loading="lazy" />
                      </a>
                    ) : (
                      <a href={activeHref} target="_blank" rel="noreferrer" className="flex aspect-[5/1] min-h-[220px] w-full items-center justify-center px-8 text-center">
                        {/* Desktop valoriza o espaço comercial com banner amplo e sem ícones grandes. */}
                        <div className="space-y-3">
                          <p className="text-2xl font-bold uppercase tracking-[0.42em] text-slate-900">Anuncie aqui</p>
                          <p className="text-sm font-medium text-slate-600">Espaço reservado para patrocinador oficial SmartBus BR</p>
                          <span className="inline-flex rounded-full border border-primary/20 bg-background/75 px-4 py-2 text-sm font-semibold text-primary shadow-sm">Quero ser patrocinador</span>
                        </div>
                      </a>
                    )}
                  </div>
                  <button type="button" onClick={showNextDesktopSponsor} className="absolute right-4 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-background/80 text-foreground shadow-lg backdrop-blur transition hover:bg-background" aria-label="Ver próximo patrocinador">
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              );
            })()}
            <div className="mt-4 flex justify-center gap-2">
              {OFFICIAL_SPONSOR_CARDS.map((card, index) => (
                <button type="button" key={`desktop-sponsor-dot-${card.headline}`} onClick={() => selectDesktopSponsorCard(index)} className={`h-2 rounded-full transition-all ${index === activeSponsorCardIndex ? "w-8 bg-primary" : "w-2.5 bg-primary/30 hover:bg-primary/50"}`} aria-label={`Ver patrocinador ${index + 1}`} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
