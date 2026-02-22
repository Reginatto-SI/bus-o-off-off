import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formata data + hora de embarque de forma amigável.
 * Ex: "Sáb, 15/02 às 23:30"
 * Fallback: se `date` for null, usa `eventDate`.
 * Se `time` for null, exibe apenas a data.
 */
export function formatBoardingDateTime(
  date: string | null,
  time: string | null,
  eventDate: string,
): string {
  const dateStr = date || eventDate;
  // Usar parse manual para evitar problemas de timezone com new Date('YYYY-MM-DD')
  const [year, month, day] = dateStr.split('-').map(Number);
  const parsedDate = new Date(year, month - 1, day);

  if (isNaN(parsedDate.getTime())) {
    return time ? time.slice(0, 5) : '';
  }

  const dayOfWeek = format(parsedDate, "EEE", { locale: ptBR });
  const dayMonth = format(parsedDate, "dd/MM", { locale: ptBR });
  const capitalizedDay = dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1);

  if (!time) {
    return `${capitalizedDay}, ${dayMonth}`;
  }

  return `${capitalizedDay}, ${dayMonth} às ${time.slice(0, 5)}`;
}

/**
 * Padroniza a visualização do local de embarque no formato "HH:MM - Nome do Local".
 * Quando não há horário vinculado, usa "--:--" para manter consistência visual sem quebrar a tela.
 */
export function formatBoardingLocationLabel(
  locationName: string | null | undefined,
  departureTime: string | null | undefined,
): string {
  const safeName = locationName?.trim() || '-';
  const safeTime = departureTime?.slice(0, 5) || '--:--';
  return `${safeTime} - ${safeName}`;
}
