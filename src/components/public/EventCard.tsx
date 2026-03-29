import { Link } from 'react-router-dom';
import { MapPin, MessageCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { parseDateOnlyAsLocal, formatDateOnlyBR } from '@/lib/date';
import { buildWhatsappWaMeLink } from '@/lib/whatsapp';
import { formatCurrencyBRL } from '@/lib/currency';
import { getEventCategoryLabel } from '@/lib/eventCategory';
import { EventWithCompany } from '@/types/database';
import { DateBadge } from './DateBadge';

interface EventCardProps {
  event: EventWithCompany;
  sellerRef?: string | null;
  isSoldOut?: boolean;
}

const DEFAULT_EVENT_IMAGE = '/assets/eventos/evento_padrao.png';

export function EventCard({ event, sellerRef, isSoldOut = false }: EventCardProps) {
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
  // Correção do bug: o badge público passa a usar a categoria real do evento (event_category),
  // substituindo o texto genérico fixo que ocultava a classificação cadastrada no admin.
  const categoryLabel = getEventCategoryLabel(event.event_category);

  return (
    <Card className="group overflow-hidden rounded-2xl border-border/70 bg-card shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_18px_45px_-24px_rgba(15,23,42,0.55)]">
      <Link to={linkTo} className="block">
        {/* Banner com reforço de contraste para leitura premium sem alterar conteúdo do card. */}
        <div className="relative aspect-video">
          <img
            src={imageUrl}
            alt={event.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
          
          {/* Badge Esgotado */}
          {isSoldOut && (
            <Badge 
              variant="destructive" 
              className="absolute top-3 right-3 z-20 rounded-full px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] shadow-sm"
            >
              Esgotado
            </Badge>
          )}
        </div>
      </Link>

      <CardContent className="space-y-3.5 p-4 sm:space-y-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge variant="secondary" className="rounded-full border border-primary/15 bg-primary/5 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-primary">
            {categoryLabel}
          </Badge>
          <span className="text-xs text-muted-foreground/90">
            Compra online e embarque organizado
          </span>
        </div>
        {/* Nome, Data Badge e Preço */}
        <div className="flex gap-3">
          <DateBadge date={event.date} className="flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <Link to={linkTo}>
              <h3 className="text-lg font-bold leading-tight text-foreground line-clamp-2 hover:text-primary transition-colors">
                {event.name}
              </h3>
            </Link>
            {/* Comentário de suporte: o preço fica próximo do título para facilitar leitura rápida em listas comerciais. */}
            <p className="mt-1 text-2xl font-extrabold tracking-tight text-primary">
              {formatCurrencyBRL(event.unit_price)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Garanta sua passagem com antecedência e veja os detalhes do embarque antes de concluir.
            </p>
          </div>
        </div>

        {/* Local */}
        <div className="rounded-xl border border-border/70 bg-muted/25 p-2.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 flex-shrink-0" />
            <span>{event.city}</span>
          </div>
        </div>

        {/* Empresa organizadora */}
        {event.company && (
          <Link
            to={event.company && (event.company as any).public_slug ? `/empresa/${(event.company as any).public_slug}` : '#'}
            className="flex items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-muted/40 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {event.company.logo_url ? (
              <img
                src={event.company.logo_url}
                alt={event.company.name}
                className="h-5 w-5 rounded-full object-cover border flex-shrink-0"
              />
            ) : (
              <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <span className="text-[0.5rem] font-bold text-muted-foreground">
                  {event.company.name?.charAt(0)?.toUpperCase()}
                </span>
              </div>
            )}
            <span className="text-xs font-medium text-muted-foreground truncate hover:text-primary transition-colors">
              {event.company.name}
            </span>
          </Link>
        )}

        {/* CTA secundário de suporte sem competir com o botão principal de compra. */}
        {whatsappHelpLink && (
          <div className="flex justify-end pt-1">
            <a
              href={whatsappHelpLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Ajuda no WhatsApp
            </a>
          </div>
        )}

        {/* CTA */}
          <Button 
          className={cn("h-12 w-full text-base font-semibold shadow-sm")}
          disabled={isSoldOut}
          asChild={!isSoldOut}
        >
          {isSoldOut ? (
            <span>Esgotado</span>
          ) : (
            <Link to={linkTo}>Comprar passagem</Link>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
