import jsPDF from 'jspdf';
import { getLogoBase64, BRAND_ORANGE_RGB } from '@/lib/pdfUtils';
import type { TicketCardData } from '@/components/public/TicketCard';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function maskCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return cpf;
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

interface GenerateTicketPdfParams {
  ticket: TicketCardData;
  qrBase64: string;
}

export async function generateTicketPdf({ ticket, qrBase64 }: GenerateTicketPdfParams) {
  // A5 portrait (148 x 210 mm)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
  const pageW = 148;
  let y = 12;

  // Header bar
  const { r, g, b } = BRAND_ORANGE_RGB;
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, pageW, 28, 'F');

  // Logo
  try {
    const logoB64 = await getLogoBase64();
    doc.addImage(logoB64, 'JPEG', 8, 4, 20, 20);
  } catch {
    // no logo
  }

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('PASSAGEM', 34, y + 4);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Apresente no embarque', 34, y + 11);

  y = 36;
  doc.setTextColor(30, 30, 30);

  // QR Code centered
  const qrSize = 50;
  const qrX = (pageW - qrSize) / 2;
  doc.addImage(qrBase64, 'PNG', qrX, y, qrSize, qrSize);
  y += qrSize + 8;

  // Status badge
  if (ticket.saleStatus === 'pago') {
    doc.setFillColor(34, 197, 94);
    doc.roundedRect((pageW - 30) / 2, y - 2, 30, 7, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('PAGA', pageW / 2, y + 3, { align: 'center' });
    y += 12;
  } else if (ticket.saleStatus === 'cancelado') {
    doc.setFillColor(239, 68, 68);
    doc.roundedRect((pageW - 36) / 2, y - 2, 36, 7, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('CANCELADA', pageW / 2, y + 3, { align: 'center' });
    y += 12;
  }

  doc.setTextColor(30, 30, 30);

  // Info rows
  const addField = (label: string, value: string) => {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text(label, 12, y);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(value, 12, y + 5);
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

  // Footer
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150, 150, 150);
  doc.text('Documento gerado digitalmente. Apresente este QR Code no embarque.', pageW / 2, 200, { align: 'center' });

  doc.save(`passagem-${ticket.seatLabel}-${ticket.passengerName.split(' ')[0]}.pdf`);
}
