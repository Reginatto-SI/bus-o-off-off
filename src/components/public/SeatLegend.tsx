import { cn } from '@/lib/utils';
import { Check, User, Ban, Circle } from 'lucide-react';
import type { SeatCategory } from '@/types/database';

const statusItems = [
  {
    label: 'Disponível',
    icon: <Circle className="h-2.5 w-2.5" strokeWidth={2} />,
    className: 'text-gray-500',
  },
  {
    label: 'Selecionado',
    icon: <Check className="h-2.5 w-2.5" strokeWidth={3} />,
    className: 'text-primary',
  },
  {
    label: 'Ocupado',
    icon: <User className="h-2.5 w-2.5" />,
    className: 'text-gray-400',
  },
  {
    label: 'Bloqueado',
    icon: <Ban className="h-2.5 w-2.5" />,
    className: 'text-amber-600/80',
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
  executivo: 'border-emerald-400/80',
  leito: 'border-yellow-500/80',
  semi_leito: 'border-yellow-500/80',
  leito_cama: 'border-yellow-500/80',
};

interface SeatLegendProps {
  categories?: SeatCategory[];
}

export function SeatLegend({ categories }: SeatLegendProps) {
  void categories;

  // Mantemos os 3 tipos fixos para uma leitura previsível e compacta no mobile.
  const normalizedCategories: Array<'convencional' | 'executivo' | 'leito'> = [
    'convencional',
    'executivo',
    'leito',
  ];

  return (
    <div className="space-y-2">
      {/* Linha única e compacta: status é prioridade visual, sem caixas para não competir com o mapa. */}
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        {statusItems.map((item, index) => (
          <div key={item.label} className="flex items-center gap-1">
            <span className={cn('inline-flex items-center', item.className)}>{item.icon}</span>
            <span className="font-normal">{item.label}</span>
            {index < statusItems.length - 1 && <span className="text-muted-foreground/60">•</span>}
          </div>
        ))}
      </div>

      {/* Bloco secundário de categoria com baixo contraste para manter o foco no mapa. */}
      <div className="rounded-md bg-muted/25 px-2 py-1.5">
        <p className="text-[10px] text-muted-foreground/80 text-center">
          A cor da borda indica o tipo da poltrona.
        </p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 justify-center">
          {normalizedCategories.map((cat) => (
            <div key={cat} className="flex items-center gap-1 text-[10px] text-muted-foreground/85">
              <div
                className={cn(
                  'w-3.5 h-3.5 rounded-[4px] border bg-white',
                  categoryBorderColors[cat] || categoryBorderColors.convencional,
                )}
              />
              <span>{categoryLabels[cat]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
