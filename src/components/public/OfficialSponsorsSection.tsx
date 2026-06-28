import { useRef, useState } from "react";
import { ArrowRight, Bus, Star, TrendingUp } from "lucide-react";
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
  href: string;
  alt: string;
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
// Recomendado: .webp ou .png, proporção 16:9, 1200 x 675 px, arquivo leve e alt sempre preenchido.
// Exemplo para patrocinador real:
// {
//   type: "sponsor",
//   sponsorName: "Nome da Empresa",
//   headline: "Nome da Empresa",
//   text: "Patrocinador oficial SmartBus BR.",
//   cta: "Conhecer patrocinador",
//   imageSrc: "/sponsors/patrocinador-01.webp",
//   href: "https://site-do-patrocinador.com.br",
//   alt: "Banner do patrocinador Nome da Empresa",
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
  className = "bg-gradient-to-b from-background to-muted/30 py-12 sm:py-16",
  compact = false,
}: OfficialSponsorsSectionProps) {
  const [activeSponsorCardIndex, setActiveSponsorCardIndex] = useState(0);
  const sponsorCarouselRef = useRef<HTMLDivElement>(null);
  const sponsorWhatsappUrl =
    buildWhatsappWaMeLink({
      phone: "(31) 99207-4309",
      message: "Olá! Quero conhecer os espaços de Patrocinadores Oficiais do SmartBus BR.",
    }) ??
    "https://wa.me/5531992074309?text=Ol%C3%A1!%20Quero%20conhecer%20os%20espa%C3%A7os%20de%20Patrocinadores%20Oficiais%20do%20SmartBus%20BR.";

  const handleSponsorCarouselScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    const firstCard = container.querySelector<HTMLElement>("[data-sponsor-card]");
    if (!firstCard) return;

    // Mantém o indicador mobile sincronizado sem biblioteca extra: o índice vem da largura real do card + gap do carrossel.
    const gap = Number.parseFloat(window.getComputedStyle(container).columnGap || "0");
    const step = firstCard.offsetWidth + gap;
    if (step <= 0) return;

    const nextIndex = Math.min(
      OFFICIAL_SPONSOR_CARDS.length - 1,
      Math.max(0, Math.round(container.scrollLeft / step)),
    );
    setActiveSponsorCardIndex(nextIndex);
  };

  const scrollToSponsorCard = (index: number) => {
    const container = sponsorCarouselRef.current;
    const card = container?.querySelector<HTMLElement>(`[data-sponsor-card="${index}"]`);
    card?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    setActiveSponsorCardIndex(index);
  };

  return (
    <section className={className}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className={`rounded-[2rem] border border-border/80 bg-card/95 shadow-[0_28px_80px_-60px_rgba(15,23,42,0.55)] ${compact ? "p-3 sm:p-4 lg:p-5" : "p-5 sm:p-7 lg:p-8"}`}>
          <div className={`flex flex-col ${compact ? "gap-3" : "gap-4"} lg:flex-row lg:items-end lg:justify-between`}>
            <div className={`${compact ? "max-w-4xl space-y-2" : "max-w-3xl space-y-3"}`}>
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
              <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm text-muted-foreground lg:max-w-sm">
                <p className="font-semibold text-foreground">Destaque sua marca em uma área oficial do SmartBus BR.</p>
                <p className="mt-1">Espaços pensados para marcas que querem estar próximas de empresas, organizadores e passageiros em uma vitrine digital de viagens e excursões.</p>
              </div>
            )}
          </div>

          <div
            ref={sponsorCarouselRef}
            onScroll={handleSponsorCarouselScroll}
            className={`${compact ? "mt-3 sm:mt-4" : "mt-6 sm:mt-7"} flex snap-x gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [-ms-overflow-style:none] lg:grid lg:grid-cols-3 lg:overflow-visible lg:pb-0 [&::-webkit-scrollbar]:hidden`}
          >
            {OFFICIAL_SPONSOR_CARDS.map((card, index) => {
              const cardHref = card.type === "sponsor" ? card.href : sponsorWhatsappUrl;

              return (
                <article
                  key={card.headline}
                  data-sponsor-card={index}
                  className="flex min-w-[86%] snap-center flex-col overflow-hidden rounded-[1.6rem] border border-border/80 bg-background shadow-[0_24px_60px_-46px_rgba(15,23,42,0.65)] sm:min-w-[48%] lg:min-w-0"
                >
                  <div className={`relative aspect-video overflow-hidden bg-gradient-to-br ${card.accent ?? "from-white via-orange-50 to-primary/15"}`}>
                    {card.type === "sponsor" ? (
                      <a href={card.href} target="_blank" rel="noreferrer" aria-label={`Abrir site do patrocinador ${card.sponsorName}`}>
                        <img src={card.imageSrc} alt={card.alt} className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]" loading="lazy" />
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
                  <div className={`flex flex-1 flex-col ${compact ? "space-y-2 p-3 sm:p-4" : "space-y-3 p-5"}`}>
                    <h3 className={`${compact ? "min-h-0" : "min-h-[2.5rem]"} text-base font-bold leading-tight text-foreground`}>{card.headline}</h3>
                    <p className={`${compact ? "min-h-0" : "min-h-[3rem]"} flex-1 text-sm leading-relaxed text-muted-foreground`}>{card.text}</p>
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
        </div>
      </div>
    </section>
  );
}
