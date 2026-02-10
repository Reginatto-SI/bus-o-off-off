import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

export type SeatState = 'available' | 'selected' | 'occupied' | 'blocked';

interface SeatButtonProps {
  label: string;
  state: SeatState;
  onClick: () => void;
}

const stateStyles: Record<SeatState, string> = {
  available:
    'bg-muted/60 border-border text-foreground hover:bg-muted cursor-pointer',
  selected:
    'bg-primary border-primary text-primary-foreground cursor-pointer ring-2 ring-primary/30',
  occupied:
    'bg-muted-foreground/20 border-muted-foreground/30 text-muted-foreground cursor-not-allowed',
  blocked:
    'bg-muted-foreground/10 border-muted-foreground/20 text-muted-foreground/50 cursor-not-allowed',
};

export function SeatButton({ label, state, onClick }: SeatButtonProps) {
  const isInteractive = state === 'available' || state === 'selected';

  return (
    <button
      type="button"
      onClick={isInteractive ? onClick : undefined}
      disabled={!isInteractive}
      aria-label={`Assento ${label} - ${state === 'available' ? 'disponível' : state === 'selected' ? 'selecionado' : state === 'occupied' ? 'ocupado' : 'bloqueado'}`}
      className={cn(
        'relative flex items-center justify-center w-10 h-10 rounded-lg border text-xs font-semibold transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        stateStyles[state],
      )}
    >
      {state === 'blocked' ? (
        <X className="h-3.5 w-3.5" />
      ) : (
        <span>{label}</span>
      )}
    </button>
  );
}
