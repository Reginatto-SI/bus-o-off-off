import { cn } from '@/lib/utils';
import { Check, User, Ban } from 'lucide-react';
import type { SeatCategory } from '@/types/database';

export type SeatState = 'available' | 'selected' | 'occupied' | 'blocked';

interface SeatButtonProps {
  label: string;
  state: SeatState;
  category?: SeatCategory;
  onClick: () => void;
}

const stateStyles: Record<SeatState, string> = {
  available:
    'bg-white text-gray-700 hover:bg-muted/40 cursor-pointer',
  selected:
    'bg-primary/15 text-primary border-primary shadow-sm cursor-pointer ring-2 ring-primary/35',
  occupied:
    'bg-gray-100 text-gray-500 cursor-not-allowed',
  blocked:
    'bg-amber-100 text-amber-700 cursor-not-allowed',
};

const categoryStyles: Record<string, string> = {
  convencional: 'border-gray-300',
  executivo: 'border-emerald-500',
  leito: 'border-yellow-500',
  semi_leito: 'border-yellow-500',
  leito_cama: 'border-yellow-500',
};

export function SeatButton({ label, state, category, onClick }: SeatButtonProps) {
  const isInteractive = state === 'available' || state === 'selected';
  // Categoria é informação secundária: controla apenas a borda em todos os status.
  const categoryClass = categoryStyles[category || 'convencional'] || categoryStyles.convencional;

  return (
    <button
      type="button"
      onClick={isInteractive ? onClick : undefined}
      disabled={!isInteractive}
      aria-label={`Assento ${label} - ${state === 'available' ? 'disponível' : state === 'selected' ? 'selecionado' : state === 'occupied' ? 'ocupado' : 'bloqueado'}`}
      className={cn(
        'relative flex items-center justify-center w-11 h-11 rounded-lg border-2 text-xs font-bold transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        stateStyles[state],
        categoryClass,
      )}
    >
      {state === 'selected' ? (
        <div className="flex flex-col items-center gap-0">
          <span className="text-[10px] leading-none">{label}</span>
          <Check className="h-3 w-3" strokeWidth={3} />
        </div>
      ) : state === 'occupied' ? (
        <User className="h-4 w-4" />
      ) : state === 'blocked' ? (
        <Ban className="h-4 w-4" />
      ) : (
        <span>{label}</span>
      )}
    </button>
  );
}
