import type { TicketCardData } from '@/components/public/TicketCard';
import { renderTicketVisual } from '@/lib/ticketVisualRenderer';

export async function generateTicketImageFromCanvas(ticket: TicketCardData, sourceCanvas: HTMLCanvasElement) {
  // Reaproveitamos o mesmo render visual para evitar divergência com PDF/modal.
  const canvas = await renderTicketVisual(ticket, sourceCanvas);
  const link = document.createElement('a');
  link.download = `passagem-${ticket.seatLabel}-${ticket.passengerName.split(' ')[0]}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
