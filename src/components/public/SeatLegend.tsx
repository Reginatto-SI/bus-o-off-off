import { cn } from '@/lib/utils';
import { Check, User, Ban } from 'lucide-react';
import type { SeatCategory } from '@/types/database';

const statusItems = [
  {
    label: 'Disponível',
    className: 'bg-white border-gray-300 text-gray-700',
    icon: null,
  },
  {
    label: 'Selecionado',
    className: 'bg-primary border-primary text-primary-foreground',
    icon: <Check className="h-2.5 w-2.5" strokeWidth={3} />,
  },
  {
    label: 'Ocupado',
    className: 'bg-red-50 border-red-300 text-red-400',
    icon: <User className="h-2.5 w-2.5" />,
  },
  {
    label: 'Bloqueado',
    className: 'bg-amber-50 border-amber-300 text-amber-500',
    icon: <Ban className="h-2.5 w-2.5" />,
  },
];

const categoryLabels: Record<string, string> = {
  convencional: 'Convencional',
  executivo: 'Executivo',
  leito: 'Leito',
  semi_leito: 'Semi-leito',
};

const categoryColors: Record<string, string> = {
  leito: 'bg-yellow-50 border-yellow-500 text-yellow-700',
  executivo: 'bg-emerald-50 border-emerald-500 text-emerald-700',
  semi_leito: 'bg-blue-50 border-blue-500 text-blue-700',
  convencional: 'bg-white border-gray-300 text-gray-700',
};

interface SeatLegendProps {
  categories?: SeatCategory[];
}

export function SeatLegend({ categories }: SeatLegendProps) {
  const uniqueCategories = categories ? [...new Set(categories)] : [];
  const showCategories = uniqueCategories.length > 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 justify-center">
        {statusItems.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className={cn('w-6 h-6 rounded-lg border-2 flex items-center justify-center', item.className)}>
              {item.icon}
            </div>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
      {showCategories && (
        <div className="flex flex-wrap gap-3 justify-center pt-1">
          {uniqueCategories.map((cat) => (
            <div key={cat} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className={cn('w-5 h-5 rounded border-2', categoryColors[cat] || categoryColors.convencional)} />
              <span>{categoryLabels[cat] || cat}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
