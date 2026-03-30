import { Link } from 'react-router-dom';
import { MapPin, MessageCircle } from 'lucide-react';
import { parseDateOnlyAsLocal, formatDateOnlyBR } from '@/lib/date';
import { DateBadge } from './DateBadge';
import { buildWhatsappWaMeLink } from '@/lib/whatsapp';
import { formatCurrencyBRL } from '@/lib/currency';
import { getEventCategoryLabel } from '@/lib/eventCategory';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { EventWithCompany } from '@/types/database';

interface EventCardFeaturedProps {
  event: EventWithCompany;
  sellerRef?: string | null;
  isSoldOut?: boolean;
}

const DEFAULT_EVENT_IMAGE = '/assets/eventos/evento_padrao.png';

export function EventCardFeatured({ event, sellerRef, isSoldOut = false }: EventCardFeaturedProps) {
  const linkTo = `/eventos/${event.id}${sellerRef ? `?ref=${sellerRef}` : ''}`;
  const imageUrl = event.image_url || DEFAULT_EVENT_IMAGE;
  const eventWhatsapp = (event as EventWithCompany & { whatsapp?: string | null }).whatsapp;
  const whatsappHelpLink = buildWhatsappWaMeLink({
    phone: eventWhatsapp ?? event.company?.whatsapp ?? null,
    message: `Olá! Estou com dúvida sobre o evento ${event.name} em ${(() => {
      const localDate = parseDateOnlyAsLocal(event.date);
      return localDate
        ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(localDate)
        : formatDateOnlyBR(event.date);
    })()}. Pode me ajudar?`,
  });
  // Mantemos fonte única de categoria para evitar divergência entre cards público normal e destaque.
  const categoryLabel = getEventCategoryLabel(event.event_category);

  return (
    <div className="group relative overflow-hidden rounded-2xl border-border/70 bg-card shadow-[0_16px_40px_-24px_rgba(15,23,42,0.55)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_24px_55px_-24px_rgba(15,23,42,0.6)]">
      <Link to={linkTo} className="block">
        {/* Mobile com proporção um pouco mais alta para dar respiro ao conteúdo principal do destaque. */}
        <div className="relative aspect-[3/4] sm:aspect-video">
          <img
            src={imageUrl}
            alt={event.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
          {/* Overlay escuro mantido para preservar legibilidade dos textos sobre o banner. */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/10 z-20" />
        </div>

        {/* Badge Esgotado */}
        {isSoldOut && (
          <Badge
            variant="destructive"
            className="absolute top-4 right-4 z-30 rounded-full px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] shadow-sm"
          >
            Esgotado
          </Badge>
        )}

        {/* Conteúdo do banner com pilha vertical no mobile para evitar disputa entre data, título e preço. */}
        {/* Ajuste fino de UX: mais respiro vertical no mobile sem alterar a estrutura do destaque. */}
        <div className="absolute bottom-0 left-0 right-0 z-30 space-y-4 p-4 pb-5 sm:space-y-3 sm:p-4 sm:pr-40">
          <div className="inline-flex items-center rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-white/95 backdrop-blur-sm">
            {categoryLabel}
          </div>

          {/* Separação explícita entre badge e conteúdo principal para reduzir sensação de bloco comprimido. */}
          <div className="mt-1 flex flex-col gap-2 sm:mt-0 sm:flex-row sm:items-start sm:gap-3">
            <DateBadge
              date={event.date}
              className="w-fit flex-shrink-0 bg-card/95 backdrop-blur-sm"
            />
            <div className="min-w-0 flex-1 space-y-1">
              {/* Clamp e quebra controlada seguram títulos extensos sem sobrepor data/preço no mobile. */}
              <h3 className="text-lg font-extrabold leading-snug text-white line-clamp-2 break-words sm:text-xl sm:leading-tight">
                {event.name}
              </h3>
              {/* Mobile recebe cidade dentro do bloco principal para manter contexto sem comprimir o rodapé. */}
              <p className="text-xs leading-snug text-white/85 line-clamp-1 sm:hidden">{event.city}</p>
              {/* Comentário de manutenção: a descrição curta é ocultada no mobile para preservar hierarquia visual do destaque. */}
              <p className="mt-1 hidden text-sm text-white/80 sm:block">
                Reserve sua vaga com antecedência e veja os detalhes antes de finalizar a compra.
              </p>
              {/* Preço com tamanho controlado no mobile para reduzir colisão visual em telas estreitas. */}
              <p className="text-lg font-extrabold leading-tight tracking-tight text-primary sm:text-2xl">
                {formatCurrencyBRL(event.unit_price)}
              </p>
            </div>
          </div>

          {/* Metadados secundários e suporte ficam no bloco desktop para não sobrecarregar o mobile. */}
          <div className="hidden flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/90 sm:flex">
            <div className="flex items-center gap-1.5 min-w-0">
              <MapPin className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{event.city}</span>
            </div>

            {event.company && (
              <Link
                to={event.company && (event.company as any).public_slug ? `/empresa/${(event.company as any).public_slug}` : '#'}
                className="flex items-center gap-1.5 min-w-0 hover:opacity-80 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                {event.company.logo_url ? (
                  <img
                    src={event.company.logo_url}
                    alt={event.company.name}
                    className="h-4 w-4 rounded-full object-cover border border-white/30 flex-shrink-0"
                  />
                ) : (
                  <div className="h-4 w-4 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-[0.45rem] font-bold text-white">
                      {event.company.name?.charAt(0)?.toUpperCase()}
                    </span>
                  </div>
                )}
                <span className="text-xs text-white/85 truncate hover:text-white transition-colors">{event.company.name}</span>
              </Link>
            )}

            {whatsappHelpLink && (
              <a
                href={whatsappHelpLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-white/85 hover:text-white transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Ajuda no WhatsApp
              </a>
            )}
          </div>
        </div>
      </Link>

      {/* No mobile o bloco de ação sai do banner para reduzir competição visual e aumentar respiro. */}
      <div className="space-y-2 p-3 pt-2 sm:hidden">
        <Button
          size="lg"
          className={cn('h-12 w-full px-4 text-base font-semibold shadow-lg')}
          disabled={isSoldOut}
          asChild={!isSoldOut}
        >
          {isSoldOut ? (
            <span>Esgotado</span>
          ) : (
            <Link to={linkTo}>Comprar passagem</Link>
          )}
        </Button>

        {whatsappHelpLink && (
          <a
            href={whatsappHelpLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Ajuda no WhatsApp
          </a>
        )}
      </div>

      {/* Desktop mantém CTA sobre o banner para preservar destaque comercial já conhecido. */}
      <div className="absolute bottom-4 right-4 z-30 hidden sm:block">
        <Button
          size="lg"
          className={cn('h-12 w-auto px-6 text-base font-semibold shadow-lg')}
          disabled={isSoldOut}
          asChild={!isSoldOut}
        >
          {isSoldOut ? (
            <span>Esgotado</span>
          ) : (
            <Link to={linkTo}>Comprar passagem</Link>
          )}
        </Button>
      </div>
    </div>
  );
}
