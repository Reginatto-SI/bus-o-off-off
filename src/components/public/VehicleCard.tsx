import { Trip, VehicleType } from '@/types/database';
import { Bus, Car } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { LucideIcon } from 'lucide-react';

const vehicleTypeLabels: Record<VehicleType, string> = {
  onibus: 'Ônibus',
  micro_onibus: 'Micro-ônibus',
  van: 'Van',
};

const vehicleIcons: Record<VehicleType, LucideIcon> = {
  onibus: Bus,
  micro_onibus: Bus,
  van: Car,
};

interface VehicleCardProps {
  trip: Trip;
  availableSeats: number | null;
  isSelected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}

export function VehicleCard({ trip, availableSeats, isSelected, onSelect, disabled }: VehicleCardProps) {
  const vehicleType = trip.vehicle?.type ?? 'van';
  const Icon = vehicleIcons[vehicleType];
  const label = vehicleTypeLabels[vehicleType];
  const totalCapacity = trip.vehicle?.capacity ?? trip.capacity;
  const isSoldOut = availableSeats !== null && availableSeats <= 0;
  const isDisabled = disabled || isSoldOut;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={isDisabled}
      className={cn(
        'relative w-full text-left rounded-xl border bg-card p-4 transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected && !isDisabled && 'ring-2 ring-primary bg-primary/5 border-primary',
        !isSelected && !isDisabled && 'hover:bg-muted/50 cursor-pointer',
        isDisabled && 'opacity-60 cursor-not-allowed',
      )}
    >
      {isSoldOut && (
        <Badge variant="destructive" className="absolute top-3 right-3 text-xs">
          Esgotado
        </Badge>
      )}

      <div className="flex items-start gap-4">
        <div className={cn(
          'flex items-center justify-center w-12 h-12 rounded-lg shrink-0',
          isSelected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
        )}>
          <Icon className="h-6 w-6" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground">{label}</p>
          <p className="text-sm text-muted-foreground">{totalCapacity} lugares</p>

          {availableSeats !== null && !isSoldOut && (
            <p className="text-sm font-medium text-primary mt-1">
              {availableSeats} {availableSeats === 1 ? 'vaga disponível' : 'vagas disponíveis'}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
