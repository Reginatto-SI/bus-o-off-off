import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface QuantitySelectorProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max: number;
  disabled?: boolean;
}

export function QuantitySelector({ value, onChange, min = 1, max, disabled }: QuantitySelectorProps) {
  const canDecrease = value > min && !disabled;
  const canIncrease = value < max && !disabled;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-xl border bg-card p-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 rounded-lg shrink-0"
          disabled={!canDecrease}
          onClick={() => onChange(value - 1)}
        >
          <Minus className="h-5 w-5" />
        </Button>

        <span className={cn(
          'text-lg font-semibold text-foreground',
          disabled && 'opacity-50',
        )}>
          {value} {value === 1 ? 'passagem' : 'passagens'}
        </span>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 rounded-lg shrink-0"
          disabled={!canIncrease}
          onClick={() => onChange(value + 1)}
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>

      <p className="text-sm text-muted-foreground text-center">
        Máximo de {max} {max === 1 ? 'passagem disponível' : 'passagens disponíveis'}
      </p>
    </div>
  );
}
