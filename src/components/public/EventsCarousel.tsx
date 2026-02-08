import { useState, useEffect, useCallback } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { cn } from '@/lib/utils';
import { EventWithCompany } from '@/types/database';
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

  if (events.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Carrossel */}
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
