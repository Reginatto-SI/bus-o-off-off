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
  // Sincroniza destaque com a mesma regra de categoria dos cards públicos padrão.
  const categoryLabel = getEventCategoryLabel(event.event_category);

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
      <Link to={linkTo} className="block">
        {/* Comentário de manutenção: substituímos o AspectRatio híbrido por utilitários responsivos explícitos para isolar mobile (`aspect-[4/5]`) e desktop (`sm:aspect-[16/9]`) sem vazamento entre breakpoints. */}
        <div className="relative aspect-[4/5] sm:aspect-[16/9]">
          {/* Comentário de layout: o wrapper absoluto garante preenchimento total da área proporcional, evitando o bloco vazio observado no desktop. */}
          <div className="absolute inset-0">
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
            {/* Comentário de suporte: overlay mais forte para reforçar leitura comercial do destaque sem mudar a estrutura do banner. */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/10 z-20" />
          </div>
        </div>

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
        <div className="absolute bottom-0 left-0 right-0 z-30 space-y-2 p-3 pb-20 sm:space-y-3 sm:p-4 sm:pb-4 sm:pr-40">
          {/* Comentário de responsividade: no mobile reservamos espaço vertical extra para o CTA principal ocupar linha própria sem competir com título/preço. */}
          <div className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-white/95 backdrop-blur-sm">
            {categoryLabel}
          </div>
          {/* Nome, Data Badge e Preço */}
          <div className="flex gap-3 items-start">
            <DateBadge date={event.date} className="flex-shrink-0 bg-card/95 backdrop-blur-sm" />
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-bold text-white line-clamp-2 sm:text-xl">
                {event.name}
              </h3>
              {/* Comentário de manutenção: a descrição curta é ocultada em telas muito pequenas para preservar legibilidade do bloco principal. */}
              <p className="mt-1 hidden text-sm text-white/80 sm:block">
                Reserve sua vaga com antecedência e veja os detalhes antes de finalizar a compra.
              </p>
              <p className="text-2xl font-bold text-primary mt-1">
                {formatCurrencyBRL(event.unit_price)}
              </p>
            </div>
          </div>

          {/* Comentário de manutenção: metadados secundários aparecem apenas a partir de sm para não saturar o card no viewport móvel. */}
          <div className="hidden flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/90 sm:flex">
            <div className="flex items-center gap-1.5 min-w-0">
              <MapPin className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{event.city}</span>
            </div>

            {/* Empresa organizadora */}
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

          {/* Comentário de hierarquia: mantemos o suporte visível no mobile como ação secundária discreta, fora da área do CTA primário. */}
          {whatsappHelpLink && (
            <div className="sm:hidden">
              <a
                href={whatsappHelpLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-white/85 hover:text-white transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Ajuda no WhatsApp
              </a>
            </div>
          )}
        </div>
      </Link>

      {/* CTA */}
      <div className="absolute bottom-3 left-3 right-3 z-30 sm:bottom-4 sm:left-auto sm:right-4">
        {/* Comentário de UX: no mobile o CTA ocupa linha inteira para reforçar prioridade de compra e evitar sobreposição com conteúdo textual. */}
        <Button 
          size="lg"
          className={cn("h-12 w-full px-4 text-base font-medium shadow-lg sm:w-auto sm:px-6")}
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
