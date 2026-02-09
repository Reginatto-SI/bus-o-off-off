import { EventBoardingLocation } from '@/types/database';
import { MapPin, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BoardingLocationCardProps {
  location: EventBoardingLocation;
  isSelected: boolean;
  onSelect: () => void;
}

export function BoardingLocationCard({ location, isSelected, onSelect }: BoardingLocationCardProps) {
  const bl = location.boarding_location;
  const departureTime = location.departure_time
    ? location.departure_time.slice(0, 5)
    : null;

  const cityState = [bl?.city, bl?.state].filter(Boolean).join(' — ');

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full text-left rounded-xl border bg-card p-4 transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected && 'ring-2 ring-primary bg-primary/5 border-primary',
        !isSelected && 'hover:bg-muted/50 cursor-pointer',
      )}
    >
      <div className="flex items-start gap-3">
        {/* Radio indicator */}
        <div className={cn(
          'mt-0.5 flex items-center justify-center w-5 h-5 rounded-full border-2 shrink-0',
          isSelected ? 'border-primary' : 'border-muted-foreground/40',
        )}>
          {isSelected && (
            <div className="w-2.5 h-2.5 rounded-full bg-primary" />
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <p className="font-medium text-foreground">{bl?.name ?? 'Local não definido'}</p>

          {bl?.address && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {bl.address}
            </p>
          )}

          {cityState && (
            <p className="text-sm text-muted-foreground pl-5">{cityState}</p>
          )}

          {departureTime && (
            <p className="text-sm font-semibold text-primary flex items-center gap-1.5 mt-2">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              Saída às {departureTime}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
