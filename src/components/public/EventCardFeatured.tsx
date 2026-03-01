import { Link } from 'react-router-dom';
import { Calendar, MapPin, MessageCircle } from 'lucide-react';
import { parseDateOnlyAsLocal, formatDateOnlyBR } from '@/lib/date';
import { buildWhatsappWaMeLink } from '@/lib/whatsapp';
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

const formatPrice = (price: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(price);
};

export function EventCardFeatured({ event, sellerRef, isSoldOut = false }: EventCardFeaturedProps) {
  const linkTo = `/eventos/${event.id}${sellerRef ? `?ref=${sellerRef}` : ''}`;
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
          {event.image_url ? (
            <div className="relative w-full h-full">
              {/* Background blur */}
              <div 
                className="absolute inset-0 bg-cover bg-center blur-xl scale-110"
                style={{ backgroundImage: `url(${event.image_url})` }}
              />
              {/* Imagem principal */}
              <img
                src={event.image_url}
                alt={event.name}
                className="relative w-full h-full object-contain z-10"
              />
              {/* Overlay escuro */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-20" />
            </div>
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
              <Calendar className="h-16 w-16 text-muted-foreground/50" />
            </div>
          )}
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
        <div className="absolute bottom-0 left-0 right-0 p-4 z-30 space-y-3">
          {/* Nome e Preço */}
          <div>
            <h3 className="text-xl font-bold text-white line-clamp-2">
              {event.name}
            </h3>
            <p className="text-2xl font-bold text-primary mt-1">
              {formatPrice(event.unit_price)}
            </p>
          </div>

          {/* Data e Local */}
          <div className="flex flex-wrap gap-4 text-sm text-white/90">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              <span>
                {(() => {
                  // Evita parse UTC de date-only (YYYY-MM-DD) que causa -1 dia em fuso BR.
                  const localDate = parseDateOnlyAsLocal(event.date);
                  return localDate
                    ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(localDate)
                    : formatDateOnlyBR(event.date, 'dd/MM');
                })()}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              <span>{event.city}</span>
            </div>
          </div>
        </div>
      </Link>

      {/* CTA secundário de ajuda, visual leve para não disputar atenção com o botão de compra. */}
      {whatsappHelpLink && (
        <a
          href={whatsappHelpLink}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-5 left-4 z-30 inline-flex items-center gap-1.5 text-xs text-white/85 hover:text-white transition-colors"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          Ajuda no WhatsApp
        </a>
      )}

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
