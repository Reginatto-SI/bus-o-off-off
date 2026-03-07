import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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
