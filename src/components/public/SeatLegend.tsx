import { cn } from '@/lib/utils';
import { Check, User, Ban } from 'lucide-react';

const items = [
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

export function SeatLegend() {
  return (
    <div className="flex flex-wrap gap-4 justify-center">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className={cn('w-6 h-6 rounded-lg border-2 flex items-center justify-center', item.className)}>
            {item.icon}
          </div>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
