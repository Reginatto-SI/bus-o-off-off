import type { TicketCardData } from '@/components/public/TicketCard';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function generateTicketImageFromCanvas(ticket: TicketCardData, sourceCanvas: HTMLCanvasElement) {
  const canvasW = 420;
  const canvasH = 620;
  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const accentColor = ticket.companyPrimaryColor || '#F97316';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 0, canvasW, 6);

  let currentY = 26;

  if (ticket.companyLogoUrl) {
    try {
      const logo = await loadImage(ticket.companyLogoUrl);
      const logoH = 44;
      const logoW = (logo.width / logo.height) * logoH;
      ctx.drawImage(logo, (canvasW - logoW) / 2, currentY, logoW, logoH);
      currentY += logoH + 8;
    } catch {
      ctx.fillStyle = '#1a1a1a';
      ctx.font = 'bold 20px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ticket.companyName, canvasW / 2, currentY + 20);
      currentY += 32;
    }
  } else {
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 20px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(ticket.companyName, canvasW / 2, currentY + 20);
    currentY += 32;
  }

  const companyLoc = [ticket.companyCity, ticket.companyState].filter(Boolean).join(' - ');
  if (companyLoc) {
    ctx.fillStyle = '#666666';
    ctx.font = '12px Arial, sans-serif';
    ctx.fillText(companyLoc, canvasW / 2, currentY + 12);
    currentY += 18;
  }

  if (ticket.companyCnpj) {
    const digits = ticket.companyCnpj.replace(/\D/g, '');
    if (digits.length === 14) {
      const formatted = digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
      ctx.fillStyle = '#999999';
      ctx.font = '10px Arial, sans-serif';
      ctx.fillText(`CNPJ: ${formatted}`, canvasW / 2, currentY + 12);
      currentY += 18;
    }
  }

  currentY += 8;
  ctx.strokeStyle = '#e5e5e5';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, currentY);
  ctx.lineTo(canvasW - 40, currentY);
  ctx.stroke();
  currentY += 16;

  const qrSize = 200;
  ctx.drawImage(sourceCanvas, (canvasW - qrSize) / 2, currentY, qrSize, qrSize);
  currentY += qrSize + 20;

  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 16px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(ticket.eventName, canvasW / 2, currentY);
  currentY += 24;

  ctx.fillStyle = '#444444';
  ctx.font = '14px Arial, sans-serif';
  ctx.fillText(`Assento ${ticket.seatLabel} — ${ticket.passengerName}`, canvasW / 2, currentY);
  currentY += 22;

  ctx.fillStyle = '#666666';
  ctx.font = '13px Arial, sans-serif';
  ctx.fillText(format(new Date(ticket.eventDate), 'dd/MM/yyyy', { locale: ptBR }), canvasW / 2, currentY);
  currentY += 30;

  ctx.fillStyle = '#aaaaaa';
  ctx.font = '10px Arial, sans-serif';
  ctx.fillText('Documento emitido digitalmente.', canvasW / 2, canvasH - 16);

  const link = document.createElement('a');
  link.download = `passagem-${ticket.seatLabel}-${ticket.passengerName.split(' ')[0]}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
