import { formatDateOnlyBR } from '@/lib/date';
import type { TicketCardData } from '@/components/public/TicketCard';
import { formatBoardingDateTime } from '@/lib/utils';
import { formatCurrencyBRL } from '@/lib/currency';

interface TicketVisualRenderOptions {
  width?: number;
  backgroundColor?: string;
}

function maskCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return cpf;
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

function formatCnpj(cnpj: string | null): string | null {
  if (!cnpj) return null;
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return cnpj;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Renderiza uma imagem única da passagem para manter o mesmo padrão visual
 * entre web, PDF e exportação do QR Code.
 */
export async function renderTicketVisual(
  ticket: TicketCardData,
  sourceCanvas: HTMLCanvasElement,
  options: TicketVisualRenderOptions = {},
): Promise<HTMLCanvasElement> {
  const width = options.width ?? 820;
  // Dynamic height: base + extra for fees
  const hasFees = ticket.fees && ticket.fees.length > 0;
  const feeRows = hasFees ? ticket.fees!.length + (ticket.unitPrice != null ? 1 : 0) + (ticket.totalPaid != null ? 1 : 0) : 0;
  const hasVehicleInfo = !!(ticket.vehicleType || ticket.vehiclePlate || ticket.driverName);
  const vehicleInfoHeight = hasVehicleInfo ? 130 : 0;
  const hasSeatMeta = !!(ticket.seatCategory && ticket.seatCategory !== 'convencional') || !!(ticket.vehicleFloors && ticket.vehicleFloors > 1 && ticket.seatFloor);
  const seatMetaHeight = hasSeatMeta ? 60 : 0;
  const height = 920 + (feeRows * 26) + (hasFees ? 40 : 0) + vehicleInfoHeight + seatMetaHeight;
  const padding = 24;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Falha ao criar contexto da passagem');
  }

  const accentColor = ticket.companyPrimaryColor || '#F97316';
  const backgroundColor = options.backgroundColor ?? '#f5f6f8';
  const cardX = padding;
  const cardY = padding;
  const cardW = width - padding * 2;
  const cardH = height - padding * 2;

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  // Cartão principal com sombra leve para preservar o visual do modal.
  ctx.shadowColor = 'rgba(15, 23, 42, 0.08)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 2;
  roundedRect(ctx, cardX, cardY, cardW, cardH, 12);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.shadowColor = 'transparent';

  ctx.fillStyle = accentColor;
  roundedRect(ctx, cardX, cardY, cardW, 8, 8);
  ctx.fill();

  const companyLoc = [ticket.companyCity, ticket.companyState].filter(Boolean).join(' - ');
  const formattedCnpj = formatCnpj(ticket.companyCnpj);

  let y = cardY + 26;

  if (ticket.companyLogoUrl) {
    try {
      const logo = await loadImage(ticket.companyLogoUrl);
      const logoSize = 52;
      ctx.drawImage(logo, cardX + 24, y, logoSize, logoSize);
    } catch {
      // Seguimos somente com os textos quando a logo falhar no carregamento.
    }
  }

  const headerX = cardX + 88;
  ctx.fillStyle = '#111827';
  ctx.font = '600 32px Inter, Arial, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(ticket.companyName, headerX, y + 2);

  ctx.fillStyle = '#64748b';
  ctx.font = '400 18px Inter, Arial, sans-serif';
  let companyMetaY = y + 40;

  if (formattedCnpj) {
    ctx.fillText(`CNPJ: ${formattedCnpj}`, headerX, companyMetaY);
    companyMetaY += 24;
  }

  if (companyLoc) {
    ctx.fillText(companyLoc, headerX, companyMetaY);
    companyMetaY += 24;
  }

  const contacts = [ticket.companyPhone, ticket.companyWhatsapp].filter(Boolean).join('   •   ');
  if (contacts) {
    ctx.fillText(contacts, headerX, companyMetaY);
  }

  y = cardY + 130;
  const qrSize = 240;
  const qrX = cardX + (cardW - qrSize) / 2;
  ctx.drawImage(sourceCanvas, qrX, y, qrSize, qrSize);

  y += qrSize + 26;

  ctx.fillStyle = '#111827';
  ctx.font = '600 30px Inter, Arial, sans-serif';
  ctx.fillText(`Assento ${ticket.seatLabel}`, cardX + 34, y);

  const statusLabel = ticket.saleStatus === 'pago' ? 'Pago' : ticket.saleStatus === 'reservado' ? 'Reservado' : 'Cancelado';
  const statusColor = ticket.saleStatus === 'pago' ? '#16a34a' : ticket.saleStatus === 'reservado' ? '#d97706' : '#dc2626';
  const badgeW = statusLabel === 'Reservado' ? 126 : 98;
  roundedRect(ctx, cardX + cardW - badgeW - 30, y - 2, badgeW, 34, 17);
  ctx.fillStyle = `${statusColor}22`;
  ctx.fill();
  ctx.fillStyle = statusColor;
  ctx.font = '600 18px Inter, Arial, sans-serif';
  ctx.fillText(statusLabel, cardX + cardW - badgeW - 30 + 24, y + 6);

  y += 46;
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cardX + 30, y);
  ctx.lineTo(cardX + cardW - 30, y);
  ctx.stroke();

  y += 20;
  // Estrutura oficial: inicia com os dados do titular para leitura rápida no embarque.
  ctx.fillStyle = '#0f172a';
  ctx.font = '600 24px Inter, Arial, sans-serif';
  ctx.fillText('Dados do Passageiro', cardX + 34, y);
  y += 34;

  ctx.fillStyle = '#475569';
  ctx.font = '400 21px Inter, Arial, sans-serif';
  ctx.fillText(ticket.passengerName, cardX + 34, y);
  y += 30;
  ctx.fillText(`CPF: ${maskCpf(ticket.passengerCpf)}`, cardX + 34, y);
  y += 30;
  ctx.fillText(`Assento ${ticket.seatLabel}`, cardX + 34, y);

  if (ticket.vehicleFloors != null && ticket.vehicleFloors > 1 && ticket.seatFloor != null) {
    y += 28;
    ctx.fillText(`Pavimento: ${ticket.seatFloor === 2 ? 'Superior' : 'Inferior'}`, cardX + 34, y);
  }

  const categoryLabels: Record<string, string> = { leito: 'Leito', executivo: 'Executivo', semi_leito: 'Semi-leito', leito_cama: 'Leito Cama', convencional: 'Convencional' };
  if (ticket.seatCategory && ticket.seatCategory !== 'convencional') {
    y += 28;
    ctx.fillText(`Categoria: ${categoryLabels[ticket.seatCategory] || ticket.seatCategory}`, cardX + 34, y);
  }

  // Código curto da venda (para suporte rápido)
  if ((ticket as any).saleId) {
    y += 28;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '400 18px monospace, Courier, sans-serif';
    ctx.fillText(`Código: ${((ticket as any).saleId as string).slice(0, 8)}`, cardX + 34, y);
  }

  y += 32;
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + 30, y);
  ctx.lineTo(cardX + cardW - 30, y);
  ctx.stroke();

  y += 20;
  ctx.fillStyle = '#0f172a';
  ctx.font = '600 24px Inter, Arial, sans-serif';
  ctx.fillText('Evento', cardX + 34, y);
  y += 34;

  ctx.fillStyle = '#475569';
  ctx.font = '400 21px Inter, Arial, sans-serif';
  ctx.fillText(ticket.eventName, cardX + 34, y);
  y += 30;
  // Evita parse UTC de date-only (YYYY-MM-DD) que causa -1 dia em fuso BR.
  ctx.fillText(formatDateOnlyBR(ticket.eventDate), cardX + 34, y);
  y += 40;

  ctx.fillStyle = '#0f172a';
  ctx.font = '600 24px Inter, Arial, sans-serif';
  ctx.fillText('Embarque', cardX + 34, y);
  y += 34;

  ctx.fillStyle = '#475569';
  ctx.font = '400 21px Inter, Arial, sans-serif';
  ctx.fillText(ticket.boardingLocationName, cardX + 34, y);
  y += 30;
  if (ticket.boardingDepartureDate || ticket.boardingDepartureTime) {
    ctx.fillText(formatBoardingDateTime(ticket.boardingDepartureDate, ticket.boardingDepartureTime, ticket.eventDate), cardX + 34, y);
    y += 30;
  }

  ctx.fillStyle = '#64748b';
  ctx.font = '400 19px Inter, Arial, sans-serif';
  const toleranceText = ticket.boardingToleranceMinutes != null
    ? `Tolerância máxima de embarque: ${ticket.boardingToleranceMinutes} minutos após o horário informado.`
    : 'Embarque pontual no horário informado.';
  ctx.fillText(toleranceText, cardX + 34, y);
  y += 28;

  // Vehicle/Driver info section
  if (hasVehicleInfo) {
    y += 10;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardX + 30, y);
    ctx.lineTo(cardX + cardW - 30, y);
    ctx.stroke();
    y += 18;

    ctx.fillStyle = '#0f172a';
    ctx.font = '600 20px Inter, Arial, sans-serif';
    ctx.fillText('Informações do Veículo', cardX + 34, y);
    y += 32;

    const vehicleTypeLabels: Record<string, string> = { onibus: 'Ônibus', micro_onibus: 'Micro-ônibus', van: 'Van' };
    ctx.fillStyle = '#475569';
    ctx.font = '400 20px Inter, Arial, sans-serif';
    if (ticket.vehicleType) {
      ctx.fillText(`🚍  ${vehicleTypeLabels[ticket.vehicleType] || ticket.vehicleType}`, cardX + 34, y);
      y += 30;
    }
    if (ticket.vehiclePlate) {
      ctx.fillText(`🔢  ${ticket.vehiclePlate}`, cardX + 34, y);
      y += 30;
    }
    ctx.fillText(`👤  ${ticket.driverName || 'A definir'}`, cardX + 34, y);
    y += 10;
  }

  y += 16;
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + 30, y);
  ctx.lineTo(cardX + cardW - 30, y);
  ctx.stroke();
  y += 18;

  ctx.fillStyle = '#0f172a';
  ctx.font = '600 20px Inter, Arial, sans-serif';
  ctx.fillText('Observações Operacionais', cardX + 34, y);
  y += 30;

  ctx.fillStyle = '#475569';
  ctx.font = '400 18px Inter, Arial, sans-serif';
  ctx.fillText('• É obrigatório apresentar documento oficial com foto no momento do embarque.', cardX + 34, y);
  y += 26;
  ctx.fillText('• Recomenda-se chegar com antecedência mínima de 10 minutos.', cardX + 34, y);

  // Fee breakdown section
  if (ticket.fees && ticket.fees.length > 0) {
    y += 10;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardX + 30, y);
    ctx.lineTo(cardX + cardW - 30, y);
    ctx.stroke();
    y += 18;

    ctx.font = '400 18px Inter, Arial, sans-serif';
    if (ticket.unitPrice != null) {
      ctx.fillStyle = '#64748b';
      ctx.fillText('Passagem', cardX + 34, y);
      ctx.fillText(formatCurrencyBRL(ticket.unitPrice), cardX + cardW - 160, y);
      y += 26;
    }
    ticket.fees.forEach((fee) => {
      ctx.fillStyle = '#64748b';
      ctx.fillText(fee.name, cardX + 34, y);
      ctx.fillText(formatCurrencyBRL(fee.amount), cardX + cardW - 160, y);
      y += 26;
    });
    if (ticket.totalPaid != null) {
      ctx.fillStyle = '#0f172a';
      ctx.font = '600 20px Inter, Arial, sans-serif';
      ctx.fillText('Total pago', cardX + 34, y);
      ctx.fillText(formatCurrencyBRL(ticket.totalPaid), cardX + cardW - 160, y);
    }
  }

  return canvas;
}
