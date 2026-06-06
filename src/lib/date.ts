import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const BRAZIL_OPERATIONAL_TIME_ZONE = 'America/Sao_Paulo';

/**
 * Data-calendário em timezone explícito, usada quando a regra de negócio é por dia operacional.
 */
export function getCalendarDateInTimeZone(
  value: Date = new Date(),
  timeZone = BRAZIL_OPERATIONAL_TIME_ZONE,
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    return formatDateOnly(value);
  }

  return `${year}-${month}-${day}`;
}

/**
 * Serializa um Date já normalizado como YYYY-MM-DD sem converter para UTC.
 */
export function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Parse local para campos DATE (YYYY-MM-DD), sem UTC.
 * Evita o bug de "-1 dia" causado por parse automático com timezone.
 */
export function parseDateOnlyAsLocal(dateString: string): Date | null {
  if (!DATE_ONLY_REGEX.test(dateString)) {
    return null;
  }

  const [year, month, day] = dateString.split('-').map(Number);
  const localDate = new Date(year, month - 1, day);

  return Number.isNaN(localDate.getTime()) ? null : localDate;
}

/**
 * Padronização de formatação para DATE no sistema (sem conversão de timezone).
 */
export function formatDateOnlyBR(dateString: string, pattern = 'dd/MM/yyyy'): string {
  const localDate = parseDateOnlyAsLocal(dateString);
  if (!localDate) return dateString;

  return format(localDate, pattern, { locale: ptBR });
}

/**
 * Formata timestamp respeitando timezone explícito (ou timezone do navegador por padrão).
 */
export function formatDateTimeBR(
  value: string | Date,
  options?: Intl.DateTimeFormatOptions,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone,
    ...options,
  }).format(date);
}


export function formatPurchaseDateTimeBR(
  value: string | Date,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const formatted = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(date);

  return formatted.replace(',', ' às');
}
