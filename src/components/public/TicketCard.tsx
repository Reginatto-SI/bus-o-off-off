import { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Download, FileText, Armchair, Calendar, MapPin, Clock, Phone, MessageCircle, Copy, Loader2, RefreshCw, Bus, Hash, User } from 'lucide-react';
import { formatDateOnlyBR } from '@/lib/date';
import { generateTicketPdf } from '@/lib/ticketPdfGenerator';
import { generateTicketImageFromCanvas } from '@/lib/ticketImageGenerator';
import { formatBoardingDateTime } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { SaleStatus } from '@/types/database';
import { formatCurrencyBRL } from '@/lib/currency';

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
  boardingToleranceMinutes?: number | null;
  boardingLocationName: string;
  boardingLocationAddress: string;
  boardingDepartureTime: string | null;
  boardingDepartureDate: string | null;
  saleStatus: SaleStatus;
  saleId?: string;
  stripeCheckoutSessionId?: string | null;
  companyName: string;
  companyLogoUrl: string | null;
  companyCity: string | null;
  companyState: string | null;
  companyPrimaryColor: string | null;
  companyCnpj: string | null;
  companyPhone: string | null;
  companyWhatsapp: string | null;
  companyAddress: string | null;
  companySlogan: string | null;
  vehicleType?: string | null;
  vehiclePlate?: string | null;
  driverName?: string | null;
  fees?: { name: string; amount: number }[];
  totalPaid?: number;
  unitPrice?: number;
  // Double Decker / categoria
  seatCategory?: string | null;
  seatFloor?: number | null;
  vehicleFloors?: number | null;
}

function maskCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return cpf;
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

function formatCnpjDisplay(cnpj: string | null): string | null {
  if (!cnpj) return null;
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return cnpj;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

interface TicketCardProps {
  ticket: TicketCardData;
  allowReservedDownloads?: boolean;
  // Callback para verificar status de pagamento no Stripe (on-demand)
  onRefreshStatus?: (saleId: string) => Promise<void>;
  isRefreshing?: boolean;
}

export function TicketCard({ ticket, allowReservedDownloads = false, onRefreshStatus, isRefreshing }: TicketCardProps) {
  const { toast } = useToast();
  const qrRef = useRef<HTMLCanvasElement>(null);
  const ticketContainerRef = useRef<HTMLDivElement>(null);
  const isPaid = ticket.saleStatus === 'pago';
  const canDownload = isPaid || (allowReservedDownloads && ticket.saleStatus === 'reservado');
  const isCancelled = ticket.saleStatus === 'cancelado';
  const accentColor = ticket.companyPrimaryColor || '#F97316';
  const companyLoc = [ticket.companyCity, ticket.companyState].filter(Boolean).join(' - ');
  const formattedCnpj = formatCnpjDisplay(ticket.companyCnpj);

  // Status visual: "processando" quando reservado mas com checkout Stripe em andamento
  const displayStatus = (ticket.saleStatus === 'reservado' && ticket.stripeCheckoutSessionId)
    ? 'processando'
    : ticket.saleStatus;

  // Mostrar botão de atualizar status quando não está pago e existe checkout session
  const showRefreshButton = !isPaid && !isCancelled && ticket.stripeCheckoutSessionId && onRefreshStatus && ticket.saleId;

  const handleCopySaleId = async () => {
    if (!ticket.saleId) return;
    try {
      await navigator.clipboard.writeText(ticket.saleId);
      toast({ title: 'Código copiado!' });
    } catch {
      toast({ title: 'Erro ao copiar', variant: 'destructive' });
    }
  };

  const handleDownloadPdf = async () => {
    const canvas = qrRef.current;
    if (!canvas) return;
    const qrBase64 = canvas.toDataURL('image/png');
    await generateTicketPdf({ ticket, qrBase64, ticketElement: ticketContainerRef.current });
  };

  const handleDownloadImage = async () => {
    const sourceCanvas = qrRef.current;
    if (!sourceCanvas) return;
    await generateTicketImageFromCanvas(ticket, sourceCanvas);
  };

  return (
    <Card ref={ticketContainerRef} className={isCancelled ? 'opacity-60' : ''}>
      {/* Company accent bar */}
      <div className="h-1.5 rounded-t-lg" style={{ backgroundColor: accentColor }} />
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col items-center gap-4">
          {/* Company identity header */}
          <div className="w-full">
            <div className="flex items-start gap-3">
              {ticket.companyLogoUrl && (
                <img
                  src={ticket.companyLogoUrl}
                  alt={ticket.companyName}
                  className="h-12 w-12 rounded-lg object-contain shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-base truncate">{ticket.companyName}</p>
                {formattedCnpj && (
                  <p className="text-xs text-muted-foreground">CNPJ: {formattedCnpj}</p>
                )}
                {companyLoc && (
                  <p className="text-xs text-muted-foreground">{companyLoc}</p>
                )}
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {ticket.companyPhone && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      {ticket.companyPhone}
                    </span>
                  )}
                  {ticket.companyWhatsapp && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MessageCircle className="h-3 w-3" />
                      {ticket.companyWhatsapp}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

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
                <Armchair className="h-4 w-4" style={{ color: accentColor }} />
                Assento {ticket.seatLabel}
              </div>
              <StatusBadge status={displayStatus} />
            </div>
            {/* Estrutura oficial: bloco do titular antes dos dados operacionais do evento. */}
            <div className="border-t pt-3 mt-2 space-y-3 text-muted-foreground">
              <div className="space-y-1">
                <p className="font-medium text-foreground text-sm">Dados do Passageiro</p>
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5" />
                  {ticket.passengerName}
                </div>
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5" />
                  CPF: {maskCpf(ticket.passengerCpf)}
                </div>
                <div className="flex items-center gap-2">
                  <Armchair className="h-3.5 w-3.5" />
                  Assento {ticket.seatLabel}
                </div>
                {ticket.vehicleFloors != null && ticket.vehicleFloors > 1 && ticket.seatFloor != null && (
                  <div className="flex items-center gap-2 text-xs">
                    Pavimento: {ticket.seatFloor === 2 ? 'Superior' : 'Inferior'}
                  </div>
                )}
                {ticket.seatCategory && ticket.seatCategory !== 'convencional' && (
                  <div className="flex items-center gap-2 text-xs">
                    Categoria: {{ leito: 'Leito', executivo: 'Executivo', semi_leito: 'Semi-leito', leito_cama: 'Leito Cama', convencional: 'Convencional' }[ticket.seatCategory] || ticket.seatCategory}
                  </div>
                )}
                {/* ID da Passagem — para suporte rápido */}
                {ticket.saleId && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="text-xs">Código: <span className="font-mono">{ticket.saleId.slice(0, 8)}</span></span>
                    <button
                      onClick={handleCopySaleId}
                      className="p-0.5 rounded hover:bg-muted transition-colors"
                      title="Copiar código completo"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <p className="font-medium text-foreground text-sm">Evento</p>
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5" />
                  {ticket.eventName}
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDateOnlyBR(ticket.eventDate)}
                </div>
              </div>

              <div className="space-y-1">
                <p className="font-medium text-foreground text-sm">Embarque</p>
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5" />
                  {ticket.boardingLocationName}
                </div>
                {(ticket.boardingDepartureTime || ticket.boardingDepartureDate) && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5" />
                    {formatBoardingDateTime(ticket.boardingDepartureDate, ticket.boardingDepartureTime, ticket.eventDate)}
                  </div>
                )}
                <p className="text-xs">
                  {ticket.boardingToleranceMinutes != null
                    ? `Tolerância máxima de embarque: ${ticket.boardingToleranceMinutes} minutos após o horário informado.`
                    : 'Embarque pontual no horário informado.'}
                </p>
              </div>
            </div>

            {/* Vehicle/Driver info */}
            {(ticket.vehicleType || ticket.vehiclePlate || ticket.driverName) && (
              <div className="border-t pt-2 mt-2 space-y-1 text-muted-foreground text-xs">
                <p className="font-medium text-foreground text-sm mb-1">Informações do Veículo</p>
                {ticket.vehicleType && (
                  <div className="flex items-center gap-2">
                    <Bus className="h-3.5 w-3.5" />
                    {{ onibus: 'Ônibus', micro_onibus: 'Micro-ônibus', van: 'Van' }[ticket.vehicleType] || ticket.vehicleType}
                  </div>
                )}
                {ticket.vehiclePlate && (
                  <div className="flex items-center gap-2">
                    <Hash className="h-3.5 w-3.5" />
                    {ticket.vehiclePlate}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5" />
                  {ticket.driverName || 'A definir'}
                </div>
              </div>
            )}

            <div className="border-t pt-2 mt-2 space-y-1 text-xs text-muted-foreground">
              <p className="font-medium text-foreground text-sm mb-1">Observações Operacionais</p>
              <p>• É obrigatório apresentar documento oficial com foto no momento do embarque.</p>
              <p>• Recomenda-se chegar com antecedência mínima de 10 minutos.</p>
            </div>

            {/* Fee breakdown */}
            {ticket.fees && ticket.fees.length > 0 && (
              <div className="border-t pt-2 mt-2 space-y-1 text-xs">
                {ticket.unitPrice != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Passagem</span>
                    <span>{formatCurrencyBRL(ticket.unitPrice)}</span>
                  </div>
                )}
                {ticket.fees.map((fee, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span className="text-muted-foreground">{fee.name}</span>
                    <span>{formatCurrencyBRL(fee.amount)}</span>
                  </div>
                ))}
                {ticket.totalPaid != null && (
                  <div className="flex justify-between font-semibold text-sm pt-1 border-t">
                    <span>Total pago</span>
                    <span>{formatCurrencyBRL(ticket.totalPaid)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Botão de atualizar status — fallback para sync com Stripe */}
          {showRefreshButton && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground"
              onClick={() => onRefreshStatus!(ticket.saleId!)}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Atualizar status do pagamento
            </Button>
          )}

          {/* Actions */}
          {canDownload && (
            // Mantém ações visíveis na interface, mas permite excluir este bloco do PDF.
            <div data-pdf-exclude="true" className="w-full flex flex-col sm:flex-row gap-2 pt-2">
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
