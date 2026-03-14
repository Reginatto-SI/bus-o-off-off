import { EventWithCompany } from '@/types/database';

/**
 * Normaliza texto para comparação flexível na busca pública:
 * - remove acentos
 * - ignora caixa alta/baixa
 * - elimina espaços extras
 */
const normalizeSearchText = (value: string | null | undefined): string => {
  if (!value) return '';

  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

/**
 * Busca de eventos orientada à experiência de vitrine:
 * retorna sempre lista de eventos filtrando por título, empresa e destino/cidade.
 */
export const filterEventsByTerm = (events: EventWithCompany[], term: string): EventWithCompany[] => {
  const normalizedTerm = normalizeSearchText(term);
  if (!normalizedTerm) return events;

  return events.filter((event) => {
    const searchableFields = [
      event.name,
      event.city,
      event.company?.name,
    ];

    return searchableFields.some((field) => normalizeSearchText(field).includes(normalizedTerm));
  });
};

