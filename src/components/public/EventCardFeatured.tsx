import { Link } from 'react-router-dom';
import { Calendar, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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
                {format(new Date(event.date), "dd 'de' MMM", {
                  locale: ptBR,
                })}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              <span>{event.city}</span>
            </div>
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
