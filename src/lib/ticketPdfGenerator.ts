import jsPDF from 'jspdf';
import { loadImageAsBase64, hexToRgb } from '@/lib/pdfUtils';
import type { TicketCardData } from '@/components/public/TicketCard';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const MOTIVATIONAL_PHRASES = [
  'Prepare-se para a melhor viagem da sua vida!',
  'Nos vemos no embarque!',
  'Partiu viver essa experiência!',
  'A aventura está prestes a começar!',
  'Sua viagem começa aqui!',
];

function maskCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return cpf;
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

function getRandomPhrase(): string {
  return MOTIVATIONAL_PHRASES[Math.floor(Math.random() * MOTIVATIONAL_PHRASES.length)];
}

interface GenerateTicketPdfParams {
  ticket: TicketCardData;
  qrBase64: string;
}

export async function generateTicketPdf({ ticket, qrBase64 }: GenerateTicketPdfParams) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
  const pageW = 148;
  let y = 0;

  // Determine company color
  const colorHex = ticket.companyPrimaryColor || '#F97316';
  const { r, g, b } = hexToRgb(colorHex);

  // ── Header bar ──
  const headerH = 32;
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, pageW, headerH, 'F');

  // Company logo
  let logoEndX = 10;
  if (ticket.companyLogoUrl) {
    try {
      const logoB64 = await loadImageAsBase64(ticket.companyLogoUrl);
      if (logoB64) {
        doc.addImage(logoB64, 'PNG', 8, 4, 22, 22);
        logoEndX = 34;
      }
    } catch {
      // no logo available
    }
  }

  // Company name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(ticket.companyName || 'PASSAGEM', logoEndX, 14);

  // Company location
  const companyLoc = [ticket.companyCity, ticket.companyState].filter(Boolean).join(' - ');
  if (companyLoc) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(companyLoc, logoEndX, 20);
  }

  // Motivational phrase
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.text(getRandomPhrase(), logoEndX, 27);

  y = headerH + 8;

  // ── QR Code centered ──
  doc.setTextColor(30, 30, 30);
  const qrSize = 50;
  const qrX = (pageW - qrSize) / 2;
  doc.addImage(qrBase64, 'PNG', qrX, y, qrSize, qrSize);
  y += qrSize + 6;

  // ── Status badge ──
  if (ticket.saleStatus === 'pago') {
    doc.setFillColor(34, 197, 94);
    doc.roundedRect((pageW - 28) / 2, y, 28, 7, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('PAGA', pageW / 2, y + 5, { align: 'center' });
    y += 12;
  } else if (ticket.saleStatus === 'cancelado') {
    doc.setFillColor(239, 68, 68);
    doc.roundedRect((pageW - 34) / 2, y, 34, 7, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('CANCELADA', pageW / 2, y + 5, { align: 'center' });
    y += 12;
  }

  // ── Separator ──
  y += 2;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(12, y, pageW - 12, y);
  y += 6;

  // ── Info fields ──
  doc.setTextColor(30, 30, 30);

  const addField = (label: string, value: string) => {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(140, 140, 140);
    doc.text(label, 14, y);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(value, 14, y + 5);
    y += 12;
  };

  addField('EVENTO', ticket.eventName);
  addField('DATA', format(new Date(ticket.eventDate), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR }));
  addField('PASSAGEIRO', ticket.passengerName);
  addField('CPF', maskCpf(ticket.passengerCpf));
  addField('ASSENTO', ticket.seatLabel);
  addField('LOCAL DE EMBARQUE', ticket.boardingLocationName);
  if (ticket.boardingDepartureTime) {
    addField('HORÁRIO DE SAÍDA', ticket.boardingDepartureTime.slice(0, 5));
  }

  // ── Footer ──
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(170, 170, 170);
  doc.text('Emitido digitalmente. Apresente este QR Code no embarque.', pageW / 2, 200, { align: 'center' });

  doc.save(`passagem-${ticket.seatLabel}-${ticket.passengerName.split(' ')[0]}.pdf`);
}
