import { EventCategory } from '@/types/database';

const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  evento: 'Evento',
  excursao: 'Excursão',
  caravana: 'Caravana',
  bate_e_volta: 'Bate e volta',
  viagem: 'Viagem',
};

/**
 * Mantém o rótulo público sincronizado com a categoria real salva no evento.
 * O fallback só é usado quando o dado realmente não existir.
 */
export function getEventCategoryLabel(category: EventCategory | null | undefined, fallback = 'Evento'): string {
  if (!category) return fallback;
  return EVENT_CATEGORY_LABELS[category] ?? fallback;
}
