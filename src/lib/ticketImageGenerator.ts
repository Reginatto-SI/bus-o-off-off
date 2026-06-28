import type { TicketCardData } from '@/components/public/TicketCard';

export async function generateTicketImageFromCanvas(ticket: TicketCardData, sourceCanvas: HTMLCanvasElement) {
  // O botão informa "Salvar só QR Code"; por isso exporta somente o QR atual do TicketCard,
  // sem chamar o renderer legado da passagem em imagem.
  const padding = 32;
  const canvas = document.createElement('canvas');
  canvas.width = sourceCanvas.width + padding * 2;
  canvas.height = sourceCanvas.height + padding * 2;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Falha ao criar imagem do QR Code');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(sourceCanvas, padding, padding);

  const link = document.createElement('a');
  link.download = `qr-code-${ticket.seatLabel}-${ticket.passengerName.split(' ')[0]}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
