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
    className: 'bg-gray-100 border-gray-300 text-gray-500',
    icon: <User className="h-2.5 w-2.5" />,
  },
  {
    label: 'Bloqueado',
    className: 'bg-amber-100 border-amber-300 text-amber-700',
    icon: <Ban className="h-2.5 w-2.5" />,
  },
];

const categoryLabels: Record<string, string> = {
  convencional: 'Convencional',
  executivo: 'Executivo',
  leito: 'Leito',
  semi_leito: 'Leito',
  leito_cama: 'Leito',
};

const categoryBorderColors: Record<string, string> = {
  convencional: 'border-gray-300',
  executivo: 'border-emerald-500',
  leito: 'border-yellow-500',
  semi_leito: 'border-yellow-500',
  leito_cama: 'border-yellow-500',
};

interface SeatLegendProps {
  categories?: SeatCategory[];
}

export function SeatLegend({ categories }: SeatLegendProps) {
  void categories;

  // A categoria é sempre secundária no fluxo público, então a legenda fica fixa com 3 tipos.
  const normalizedCategories: Array<'convencional' | 'executivo' | 'leito'> = [
    'convencional',
    'executivo',
    'leito',
  ];

  return (
    <div className="space-y-3">
      <div className="text-center text-xs font-semibold text-muted-foreground">Status</div>
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
      <div className="text-center text-xs font-semibold text-muted-foreground">Tipo de poltrona</div>
      <div className="flex flex-wrap gap-3 justify-center pt-1">
        {normalizedCategories.map((cat) => (
          <div key={cat} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className={cn('w-5 h-5 rounded border-2 bg-white', categoryBorderColors[cat] || categoryBorderColors.convencional)} />
            <span>{categoryLabels[cat]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
