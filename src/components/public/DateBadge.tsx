import { parseDateOnlyAsLocal } from '@/lib/date';

interface DateBadgeProps {
  date: string;
  className?: string;
}

const MONTHS_SHORT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const DAYS_SHORT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

export function DateBadge({ date, className = '' }: DateBadgeProps) {
  const localDate = parseDateOnlyAsLocal(date);
  if (!localDate) return null;

  const day = localDate.getDate().toString().padStart(2, '0');
  const month = MONTHS_SHORT[localDate.getMonth()];
  const weekday = DAYS_SHORT[localDate.getDay()];

  return (
    <div
      className={`inline-flex flex-col items-center justify-center rounded-lg bg-card border shadow-sm px-2.5 py-1.5 min-w-[3.25rem] ${className}`}
    >
      <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-primary leading-none">
        {month}
      </span>
      <span className="text-xl font-bold text-foreground leading-tight">
        {day}
      </span>
      <span className="text-[0.6rem] font-medium uppercase text-muted-foreground leading-none">
        {weekday}
      </span>
    </div>
  );
}
