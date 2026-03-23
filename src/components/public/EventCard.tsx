import { Link } from 'react-router-dom';
import { MapPin, MessageCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { cn } from '@/lib/utils';
import { parseDateOnlyAsLocal, formatDateOnlyBR } from '@/lib/date';
import { buildWhatsappWaMeLink } from '@/lib/whatsapp';
import { formatCurrencyBRL } from '@/lib/currency';
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

  return (
    <Card className="overflow-hidden rounded-2xl border shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <Link to={linkTo} className="block">
        {/* Banner com blur letterbox */}
        <div className="relative">
          <AspectRatio ratio={3 / 2}>
            <div className="relative w-full h-full">
              {/* Background blur */}
              <div 
                className="absolute inset-0 bg-cover bg-center blur-xl scale-110 opacity-60"
                style={{ backgroundImage: `url(${imageUrl})` }}
              />
              {/* Imagem principal */}
              <img
                src={imageUrl}
                alt={event.name}
                className="relative w-full h-full object-contain z-10"
              />
            </div>
          </AspectRatio>
          
          {/* Badge Esgotado */}
          {isSoldOut && (
            <Badge 
              variant="destructive" 
              className="absolute top-3 right-3 z-20"
            >
              Esgotado
            </Badge>
          )}
        </div>
      </Link>

      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="rounded-full px-2.5 py-1 text-[0.65rem] uppercase tracking-[0.16em]">
            Viagem para evento
          </Badge>
          <span className="text-xs text-muted-foreground">
            Compra online e embarque organizado
          </span>
        </div>
        {/* Nome, Data Badge e Preço */}
        <div className="flex gap-3">
          <DateBadge date={event.date} className="flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <Link to={linkTo}>
              <h3 className="text-lg font-semibold text-foreground line-clamp-2 hover:text-primary transition-colors">
                {event.name}
              </h3>
            </Link>
            {/* Comentário de suporte: o preço fica próximo do título para facilitar leitura rápida em listas comerciais. */}
            <p className="text-xl font-bold text-primary mt-1">
              {formatCurrencyBRL(event.unit_price)}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Garanta sua passagem com antecedência e veja os detalhes do embarque antes de concluir.
            </p>
          </div>
        </div>

        {/* Local */}
        <div className="text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 flex-shrink-0" />
            <span>{event.city}</span>
          </div>
        </div>

        {/* Empresa organizadora */}
        {event.company && (
          <div className="flex items-center gap-2">
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
            <span className="text-xs text-muted-foreground truncate">
              {event.company.name}
            </span>
          </div>
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
          className={cn("w-full h-12 text-base font-medium")}
          disabled={isSoldOut}
          asChild={!isSoldOut}
        >
          {isSoldOut ? (
            <span>Esgotado</span>
          ) : (
            <Link to={linkTo}>Ver detalhes e comprar</Link>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
