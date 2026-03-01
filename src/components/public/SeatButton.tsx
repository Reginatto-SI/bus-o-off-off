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
    'bg-white border-gray-300 text-gray-700 hover:border-primary/50 hover:bg-primary/5 cursor-pointer',
  selected:
    'bg-primary border-primary text-primary-foreground cursor-pointer ring-2 ring-primary/30',
  occupied:
    'bg-red-50 border-red-300 text-red-400 cursor-not-allowed',
  blocked:
    'bg-amber-50 border-amber-300 text-amber-500 cursor-not-allowed',
};

const categoryStyles: Record<string, string> = {
  leito: 'border-yellow-500 bg-yellow-50',
  executivo: 'border-emerald-500 bg-emerald-50',
  semi_leito: 'border-blue-500 bg-blue-50',
};

export function SeatButton({ label, state, category, onClick }: SeatButtonProps) {
  const isInteractive = state === 'available' || state === 'selected';
  const categoryClass = state === 'available' && category && category !== 'convencional'
    ? categoryStyles[category] || ''
    : '';

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
