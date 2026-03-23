import { useState, useEffect, useCallback } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EventWithCompany } from '@/types/database';
import { Button } from '@/components/ui/button';
import { EventCardFeatured } from './EventCardFeatured';

interface EventsCarouselProps {
  events: EventWithCompany[];
  sellerRef?: string | null;
}

export function EventsCarousel({ events, sellerRef }: EventsCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ 
    loop: true,
    align: 'start',
  });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  const scrollTo = useCallback((index: number) => {
    if (emblaApi) emblaApi.scrollTo(index);
  }, [emblaApi]);

  const scrollPrev = useCallback(() => {
    emblaApi?.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    emblaApi?.scrollNext();
  }, [emblaApi]);

  if (events.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Carrossel */}
      <div className="relative">
        {/* Comentário de suporte: adicionamos navegação manual para reduzir ambiguidade do swipe em desktop, mantendo o mesmo carrossel existente. */}
        {events.length > 1 && (
          <div className="pointer-events-none absolute inset-y-0 left-0 right-0 z-10 hidden items-center justify-between px-3 sm:flex">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="pointer-events-auto h-10 w-10 rounded-full shadow-md"
              onClick={scrollPrev}
              aria-label="Ver evento anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="pointer-events-auto h-10 w-10 rounded-full shadow-md"
              onClick={scrollNext}
              aria-label="Ver próximo evento"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex">
            {events.map((event) => (
              <div 
                key={event.id} 
                className="flex-[0_0_100%] min-w-0 pl-4 first:pl-0"
              >
                <EventCardFeatured 
                  event={event} 
                  sellerRef={sellerRef}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Indicadores (bolinhas) */}
      {events.length > 1 && (
        <div className="flex justify-center gap-2">
          {events.map((_, index) => (
            <button
              key={index}
              onClick={() => scrollTo(index)}
              className={cn(
                "w-2 h-2 rounded-full transition-colors",
                index === selectedIndex ? "bg-primary" : "bg-muted"
              )}
              aria-label={`Ir para evento ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
