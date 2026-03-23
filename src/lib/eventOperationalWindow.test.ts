import { describe, expect, it } from 'vitest';
import { buildEventOperationalEndMap, filterOperationallyVisibleEvents, getEventOperationalEnd } from './eventOperationalWindow';

describe('eventOperationalWindow', () => {
  it('usa o último embarque como fim operacional quando existir retorno posterior à data principal', () => {
    const event = { id: 'evt-1', date: '2026-03-10' };
    const boardings = [
      { event_id: 'evt-1', departure_date: '2026-03-10', departure_time: '08:00:00' },
      { event_id: 'evt-1', departure_date: '2026-03-11', departure_time: '22:30:00' },
    ];

    const operationalEnd = getEventOperationalEnd(event, boardings);

    expect(operationalEnd?.toISOString()).toBe(new Date(2026, 2, 11, 22, 30, 0, 0).toISOString());
  });

  it('faz fallback para o fim do dia do evento quando não há embarques', () => {
    const event = { id: 'evt-2', date: '2026-03-10' };

    const operationalEnd = getEventOperationalEnd(event, []);

    expect(operationalEnd?.toISOString()).toBe(new Date(2026, 2, 10, 23, 59, 59, 999).toISOString());
  });

  it('filtra apenas eventos cuja janela operacional ainda está aberta', () => {
    const events = [
      { id: 'visible', date: '2026-03-10' },
      { id: 'finished', date: '2026-03-09' },
    ];
    const boardings = [
      { event_id: 'visible', departure_date: '2026-03-11', departure_time: '10:00:00' },
      { event_id: 'finished', departure_date: '2026-03-09', departure_time: '18:00:00' },
    ];

    const operationalEndMap = buildEventOperationalEndMap(events, boardings);
    const visibleEvents = filterOperationallyVisibleEvents(events, operationalEndMap, new Date(2026, 2, 10, 12, 0, 0, 0));

    expect(visibleEvents.map((event) => event.id)).toEqual(['visible']);
  });
});
