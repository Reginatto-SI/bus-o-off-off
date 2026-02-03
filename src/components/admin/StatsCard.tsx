import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  variant?: 'default' | 'success' | 'warning' | 'destructive';
  className?: string;
}

const variantStyles = {
  default: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

export function StatsCard({
  label,
  value,
  icon: Icon,
  variant = 'default',
  className,
}: StatsCardProps) {
  return (
    <div className={cn('stats-card', className)}>
      <div className="flex items-center justify-between">
        <div>
          <p className="stats-card__label">{label}</p>
          <p className="stats-card__value">{value}</p>
        </div>
        <div className={cn('p-3 rounded-full bg-muted', variantStyles[variant])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
