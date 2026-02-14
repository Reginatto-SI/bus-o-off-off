import { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Download, FileText, Armchair, Calendar, MapPin, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { generateTicketPdf } from '@/lib/ticketPdfGenerator';
import type { SaleStatus } from '@/types/database';

export interface TicketCardData {
  ticketId: string;
  qrCodeToken: string;
  passengerName: string;
  passengerCpf: string;
  seatLabel: string;
  boardingStatus: string;
  eventName: string;
  eventDate: string;
  eventCity: string;
  boardingLocationName: string;
  boardingLocationAddress: string;
  boardingDepartureTime: string | null;
  saleStatus: SaleStatus;
}

function maskCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return cpf;
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

export function TicketCard({ ticket }: { ticket: TicketCardData }) {
  const qrRef = useRef<HTMLCanvasElement>(null);
  const isPaid = ticket.saleStatus === 'pago';
  const isCancelled = ticket.saleStatus === 'cancelado';

  const handleDownloadPdf = async () => {
    const canvas = qrRef.current;
    if (!canvas) return;
    const qrBase64 = canvas.toDataURL('image/png');
    await generateTicketPdf({ ticket, qrBase64 });
  };

  const handleDownloadImage = () => {
    const sourceCanvas = qrRef.current;
    if (!sourceCanvas) return;

    const padding = 24;
    const textHeight = 80;
    const width = sourceCanvas.width + padding * 2;
    const height = sourceCanvas.height + padding * 2 + textHeight;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    ctx.drawImage(sourceCanvas, padding, padding);

    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 14px Arial';
    const textY = sourceCanvas.height + padding + 20;
    ctx.fillText(ticket.eventName, padding, textY);
    ctx.font = '12px Arial';
    ctx.fillText(`Assento ${ticket.seatLabel} — ${ticket.passengerName}`, padding, textY + 20);
    ctx.fillText(
      format(new Date(ticket.eventDate), "dd/MM/yyyy", { locale: ptBR }),
      padding,
      textY + 40
    );

    const link = document.createElement('a');
    link.download = `qrcode-${ticket.seatLabel}-${ticket.passengerName.split(' ')[0]}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <Card className={isCancelled ? 'opacity-60' : ''}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col items-center gap-4">
          {/* QR Code */}
          <div className="relative">
            <QRCodeCanvas
              ref={qrRef}
              value={ticket.qrCodeToken}
              size={180}
              level="M"
              includeMargin
              className={isCancelled ? 'opacity-40' : ''}
            />
            {isCancelled && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="bg-destructive text-destructive-foreground px-3 py-1 rounded-full text-xs font-bold rotate-[-15deg]">
                  CANCELADA
                </span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="w-full space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold">
                <Armchair className="h-4 w-4 text-primary" />
                Assento {ticket.seatLabel}
              </div>
              <StatusBadge status={ticket.saleStatus} />
            </div>
            <p className="font-medium">{ticket.passengerName}</p>
            <p className="text-muted-foreground">CPF: {maskCpf(ticket.passengerCpf)}</p>

            <div className="border-t pt-2 mt-2 space-y-1 text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" />
                {ticket.eventName} — {format(new Date(ticket.eventDate), "dd/MM/yyyy")}
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5" />
                {ticket.boardingLocationName}
              </div>
              {ticket.boardingDepartureTime && (
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" />
                  Saída: {ticket.boardingDepartureTime.slice(0, 5)}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          {isPaid && (
            <div className="w-full flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleDownloadPdf}
              >
                <FileText className="h-4 w-4 mr-2" />
                Salvar PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleDownloadImage}
              >
                <Download className="h-4 w-4 mr-2" />
                Salvar QR Code
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
