import { Link } from 'react-router-dom';
import { MapPin, MessageCircle } from 'lucide-react';
import { parseDateOnlyAsLocal, formatDateOnlyBR } from '@/lib/date';
import { DateBadge } from './DateBadge';
import { buildWhatsappWaMeLink } from '@/lib/whatsapp';
import { formatCurrencyBRL } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AspectRatio } from '@/components/ui/aspect-ratio';
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

  return (
    <div className="relative overflow-hidden rounded-xl">
      <Link to={linkTo} className="block">
        <AspectRatio ratio={16 / 9}>
          <div className="relative w-full h-full">
            {/* Background blur */}
            <div 
              className="absolute inset-0 bg-cover bg-center blur-xl scale-110"
              style={{ backgroundImage: `url(${imageUrl})` }}
            />
            {/* Imagem principal */}
            <img
              src={imageUrl}
              alt={event.name}
              className="relative w-full h-full object-contain z-10"
            />
            {/* Overlay escuro */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-20" />
          </div>
        </AspectRatio>

        {/* Badge Esgotado */}
        {isSoldOut && (
          <Badge 
            variant="destructive" 
            className="absolute top-4 right-4 z-30"
          >
            Esgotado
          </Badge>
        )}

        {/* Conteúdo sobre o banner */}
        <div className="absolute bottom-0 left-0 right-0 p-4 pr-40 z-30 space-y-3">
          {/* Nome, Data Badge e Preço */}
          <div className="flex gap-3 items-start">
            <DateBadge date={event.date} className="flex-shrink-0 bg-card/95 backdrop-blur-sm" />
            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-bold text-white line-clamp-2">
                {event.name}
              </h3>
              <p className="text-2xl font-bold text-primary mt-1">
                {formatCurrencyBRL(event.unit_price)}
              </p>
            </div>
          </div>

          {/* Metadados secundários no mesmo fluxo para evitar sobreposição com CTAs absolutos do banner. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/90">
            <div className="flex items-center gap-1.5 min-w-0">
              <MapPin className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{event.city}</span>
            </div>

            {/* Empresa organizadora */}
            {event.company && (
              <div className="flex items-center gap-1.5 min-w-0">
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
                <span className="text-xs text-white/85 truncate">{event.company.name}</span>
              </div>
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

      {/* CTA */}
      <div className="absolute bottom-4 right-4 z-30">
        <Button 
          size="lg"
          className={cn("h-12 px-6 text-base font-medium shadow-lg")}
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
