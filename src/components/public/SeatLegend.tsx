import { cn } from '@/lib/utils';

const items = [
  { label: 'Disponível', className: 'bg-muted/60 border-border' },
  { label: 'Selecionado', className: 'bg-primary border-primary' },
  { label: 'Ocupado', className: 'bg-muted-foreground/20 border-muted-foreground/30' },
  { label: 'Bloqueado', className: 'bg-muted-foreground/10 border-muted-foreground/20' },
];

export function SeatLegend() {
  return (
    <div className="flex flex-wrap gap-4 justify-center">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className={cn('w-5 h-5 rounded border', item.className)} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
