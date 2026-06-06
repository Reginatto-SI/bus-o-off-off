import { describe, expect, it } from 'vitest';
import { buildEventOperationalEndMap, filterOperationallyVisibleEvents, getEventOperationalEnd } from './eventOperationalWindow';

// A regra oficial: fim do dia do último embarque (ou da data do evento) + 2 dias de folga operacional
// para cobrir viagens de ida-e-volta cujo retorno não está cadastrado.

describe('eventOperationalWindow', () => {
  it('usa o último embarque (fim do dia + folga de 2 dias) como fim operacional', () => {
    const event = { id: 'evt-1', date: '2026-03-10' };
    const boardings = [
      { event_id: 'evt-1', departure_date: '2026-03-10', departure_time: '08:00:00' },
      { event_id: 'evt-1', departure_date: '2026-03-11', departure_time: '22:30:00' },
    ];

    const operationalEnd = getEventOperationalEnd(event, boardings);

    expect(operationalEnd?.toISOString()).toBe(new Date(2026, 2, 13, 23, 59, 59, 999).toISOString());
  });

  it('faz fallback para o fim do dia do evento + folga quando não há embarques', () => {
    const event = { id: 'evt-2', date: '2026-03-10' };

    const operationalEnd = getEventOperationalEnd(event, []);

    expect(operationalEnd?.toISOString()).toBe(new Date(2026, 2, 12, 23, 59, 59, 999).toISOString());
  });

  it('mantém eventos visíveis durante o dia do evento mesmo após o horário do embarque', () => {
    const events = [
      { id: 'today', date: '2026-03-10' },
      { id: 'finished', date: '2026-03-05' },
    ];
    const boardings = [
      { event_id: 'today', departure_date: '2026-03-10', departure_time: '08:00:00' },
      { event_id: 'finished', departure_date: '2026-03-05', departure_time: '18:00:00' },
    ];

    const operationalEndMap = buildEventOperationalEndMap(events, boardings);
    // "agora" é dia 10 às 14:00, depois do horário do embarque mas dentro da janela
    const visibleEvents = filterOperationallyVisibleEvents(events, operationalEndMap, new Date(2026, 2, 10, 14, 0, 0, 0));

    expect(visibleEvents.map((event) => event.id)).toEqual(['today']);
  });

  it('mantém evento visível dentro da folga (ex: dia 07 ainda mostra evento de dia 05)', () => {
    const events = [{ id: 'trip', date: '2026-03-05' }];
    const boardings = [
      { event_id: 'trip', departure_date: '2026-03-05', departure_time: '08:00:00' },
    ];

    const operationalEndMap = buildEventOperationalEndMap(events, boardings);
    const visibleEvents = filterOperationallyVisibleEvents(events, operationalEndMap, new Date(2026, 2, 7, 12, 0, 0, 0));

    expect(visibleEvents.map((event) => event.id)).toEqual(['trip']);
  });

  it('compara a janela operacional pelo calendário do Brasil, não por UTC', () => {
    const events = [{ id: 'brazil-today', date: '2026-06-06' }];
    const operationalEndMap = buildEventOperationalEndMap(events, []);

    const visibleEvents = filterOperationallyVisibleEvents(
      events,
      operationalEndMap,
      new Date('2026-06-09T01:30:00.000Z'), // 08/06 à noite no Brasil, ainda dentro de D+2.
    );

    expect(visibleEvents.map((event) => event.id)).toEqual(['brazil-today']);
  });

  it('remove evento quando a janela D-2 já acabou no calendário do Brasil', () => {
    const events = [{ id: 'old', date: '2026-06-06' }];
    const operationalEndMap = buildEventOperationalEndMap(events, []);

    const visibleEvents = filterOperationallyVisibleEvents(
      events,
      operationalEndMap,
      new Date('2026-06-09T03:01:00.000Z'), // 09/06 no Brasil: evento de 06/06 já passou de D+2.
    );

    expect(visibleEvents).toEqual([]);
  });

});
