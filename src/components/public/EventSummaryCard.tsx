import { Event } from '@/types/database';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface EventSummaryCardProps {
  event: Event;
  compact?: boolean;
}

export function EventSummaryCard({ event }: EventSummaryCardProps) {
  return (
    <Card className="overflow-hidden">
      <div className="h-2 bg-gradient-to-r from-primary to-primary/70" />
      <CardContent className="p-4 space-y-2">
        <h1 className="text-xl font-bold text-foreground">{event.name}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            {format(new Date(event.date), "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4" />
            {event.city}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
