import type { Event, EventBoardingLocation } from '@/types/database';
import { parseDateOnlyAsLocal } from '@/lib/date';

type EventLike = Pick<Event, 'id' | 'date'>;
type BoardingLike = Pick<EventBoardingLocation, 'event_id' | 'departure_date' | 'departure_time'>;

const TIME_ONLY_REGEX = /^\d{2}:\d{2}(:\d{2})?$/;

function parseOperationalDateTime(date: string | null | undefined, time: string | null | undefined): Date | null {
  if (!date) return null;

  const baseDate = parseDateOnlyAsLocal(date);
  if (!baseDate) return null;

  if (!time || !TIME_ONLY_REGEX.test(time)) {
    // Comentário de suporte: quando o embarque não possui hora cadastrada, tratamos o evento como válido até o fim do dia local.
    return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 23, 59, 59, 999);
  }

  const [hours, minutes, seconds = '0'] = time.split(':');
  return new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    Number(hours),
    Number(minutes),
    Number(seconds),
    0,
  );
}

export function getEventOperationalEnd(event: EventLike, boardings: BoardingLike[]): Date | null {
  const lastBoardingAt = boardings
    .filter((boarding) => boarding.event_id === event.id)
    .reduce<Date | null>((latest, boarding) => {
      const candidate = parseOperationalDateTime(boarding.departure_date, boarding.departure_time);
      if (!candidate) return latest;
      if (!latest || candidate.getTime() > latest.getTime()) return candidate;
      return latest;
    }, null);

  if (lastBoardingAt) return lastBoardingAt;

  // Fallback seguro: eventos sem embarques continuam usando a data principal para não desaparecerem indevidamente.
  return parseOperationalDateTime(event.date, null);
}

export function buildEventOperationalEndMap<TEvent extends EventLike, TBoarding extends BoardingLike>(
  events: TEvent[],
  boardings: TBoarding[],
): Map<string, Date | null> {
  return new Map(events.map((event) => [event.id, getEventOperationalEnd(event, boardings)]));
}

export function isOperationallyVisible(
  eventId: string,
  operationalEndMap: Map<string, Date | null>,
  now = new Date(),
): boolean {
  const operationalEnd = operationalEndMap.get(eventId);
  if (!operationalEnd) return true;
  return operationalEnd.getTime() >= now.getTime();
}

export function filterOperationallyVisibleEvents<TEvent extends EventLike>(
  events: TEvent[],
  operationalEndMap: Map<string, Date | null>,
  now = new Date(),
): TEvent[] {
  return events.filter((event) => isOperationallyVisible(event.id, operationalEndMap, now));
}
