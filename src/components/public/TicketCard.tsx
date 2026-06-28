import { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Ticket as TicketIcon,
  FileText,
  Armchair,
  Calendar,
  MapPin,
  Clock,
  Phone,
  Copy,
  Loader2,
  RefreshCw,
  Bus,
  Hash,
  User,
  QrCode,
  ShieldAlert,
  ExternalLink,
  ArrowLeftRight,
  Info,
  Star,
  Download,
  IdCard,
} from 'lucide-react';
import { formatDateOnlyBR, formatPurchaseDateTimeBR } from '@/lib/date';
import { generateTicketPdf } from '@/lib/ticketPdfGenerator';
import { generateTicketImageFromCanvas } from '@/lib/ticketImageGenerator';
import { formatBoardingDateTime } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { SaleStatus } from '@/types/database';
import type { TransportPolicy } from '@/types/database';
import { formatCurrencyBRL } from '@/lib/currency';
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon';
import {
  getTicketTransportOperatedByText,
  TICKET_PDF_FOOTER_TEXT,
  TICKET_PLATFORM_LIABILITY_TEXT,
  TICKET_PLATFORM_SALES_TEXT,
} from '@/lib/intermediationPolicy';

export interface TicketCardData {
  ticketId: string;
  ticketNumber?: string | null;
  purchaseConfirmedAt?: string | null;
  purchaseOriginLabel?: string | null;
  qrCodeToken: string;
  passengerName: string;
  passengerCpf: string;
  seatLabel: string;
  boardingStatus: string;
  eventName: string;
  eventDate: string;
  eventCity: string;
  eventTransportPolicy?: TransportPolicy;
  whatsappGroupLink?: string | null;
  boardingToleranceMinutes?: number | null;
  boardingLocationName: string;
  boardingLocationAddress: string;
  boardingDepartureTime: string | null;
  boardingDepartureDate: string | null;
  saleStatus: SaleStatus;
  saleId?: string;
  asaasPaymentId?: string | null;
  companyName: string;
  companyLogoUrl: string | null;
  companyCity: string | null;
  companyState: string | null;
  /** @deprecated Não é mais aplicada na passagem virtual SmartBus (visual fixo). */
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
  benefitApplied?: boolean;
  benefitProgramName?: string | null;
  benefitDiscountAmount?: number | null;
  seatCategory?: string | null;
  seatFloor?: number | null;
  vehicleFloors?: number | null;
  commercialPartners?: { name: string; logo_url: string | null }[];
  eventSponsors?: { name: string; logo_url: string | null }[];
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
  consolidatedRoundTrip?: {
    returnSeatLabel: string;
    returnSeatIsPlaceholder: boolean;
  };
  allowReservedDownloads?: boolean;
  reservedPresentation?: 'default' | 'receipt';
  onRefreshStatus?: (saleId: string) => Promise<void>;
  isRefreshing?: boolean;
  showWhatsAppGroupCta?: boolean;
}

function getFriendlySeatLabel(seatLabel: string): string {
  if (!seatLabel.toUpperCase().startsWith('VOLTA-')) return seatLabel;
  const raw = seatLabel.replace(/^VOLTA-/i, '');
  if (/^\d+$/.test(raw) || raw.toUpperCase() === 'SN') return 'Retorno incluso';
  return raw;
}

const vehicleTypeLabel: Record<string, string> = {
  onibus: 'Ônibus',
  micro_onibus: 'Micro-ônibus',
  van: 'Van',
};

const seatCategoryLabel: Record<string, string> = {
  leito: 'Leito',
  executivo: 'Executivo',
  semi_leito: 'Semi-leito',
  leito_cama: 'Leito Cama',
  convencional: 'Convencional',
};

/** Título de seção em laranja, caixa alta, padrão SmartBus. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-bold tracking-[0.12em] text-[hsl(var(--ticket-accent))] uppercase">
      {children}
    </h3>
  );
}

/** Divisor laranja fino entre seções. */
function SectionDivider() {
  return <div className="h-px w-full bg-[hsl(var(--ticket-accent))]/40 my-4" />;
}

export function TicketCard({
  ticket,
  consolidatedRoundTrip,
  allowReservedDownloads = false,
  reservedPresentation = 'default',
  onRefreshStatus,
  isRefreshing,
  showWhatsAppGroupCta = true,
}: TicketCardProps) {
  const { toast } = useToast();
  const qrRef = useRef<HTMLCanvasElement>(null);
  const ticketContainerRef = useRef<HTMLDivElement>(null);
  const isPaid = ticket.saleStatus === 'pago';
  const isReserved = ticket.saleStatus === 'reservado';
  const isReservedReceipt = isReserved && reservedPresentation === 'receipt';
  const canDownload = isPaid || (allowReservedDownloads && ticket.saleStatus === 'reservado');
  const isCancelled = ticket.saleStatus === 'cancelado';
  const companyLoc = [ticket.companyCity, ticket.companyState].filter(Boolean).join(' - ');
  const formattedCnpj = formatCnpjDisplay(ticket.companyCnpj);
  const seatDisplayLabel = getFriendlySeatLabel(ticket.seatLabel);
  const ticketNumberDisplay = ticket.ticketNumber || null;
  const purchaseConfirmedLabel = ticket.purchaseConfirmedAt
    ? formatPurchaseDateTimeBR(ticket.purchaseConfirmedAt)
    : null;

  const hasPaymentPending = Boolean(ticket.asaasPaymentId);
  const isProcessing = isReserved && hasPaymentPending;
  const statusLabel = isCancelled
    ? 'Cancelado'
    : isPaid
      ? 'Pago'
      : isProcessing
        ? 'Processando'
        : isReserved
          ? 'Reservado'
          : 'Aguardando';

  const showRefreshButton = !isPaid && !isCancelled && hasPaymentPending && onRefreshStatus && ticket.saleId;

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

  const statusClasses = isPaid
    ? 'border-[hsl(var(--ticket-success))]/60 text-[hsl(var(--ticket-success))] bg-[hsl(var(--ticket-success-bg))]/60'
    : isCancelled
      ? 'border-destructive/60 text-destructive bg-destructive/10'
      : 'border-yellow-500/60 text-yellow-400 bg-yellow-500/10';

  return (
    <div
      ref={ticketContainerRef}
      className={`mx-auto w-full max-w-[420px] bg-[hsl(var(--ticket-bg))] text-[hsl(var(--ticket-text))] rounded-2xl p-4 sm:p-5 space-y-4 ${isCancelled ? 'opacity-70' : ''}`}
      style={{ colorScheme: 'dark' }}
    >
      {/* 1. Cabeçalho */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--ticket-accent))]/15 text-[hsl(var(--ticket-accent))] shrink-0">
          <TicketIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight">Passagem digital</h2>
          <p className="text-xs text-[hsl(var(--ticket-muted))]">Apresente este bilhete no embarque</p>
        </div>
      </div>

      {/* 2. Card resumo do passageiro */}
      <div className="rounded-xl border border-[hsl(var(--ticket-border))] bg-[hsl(var(--ticket-surface))] p-4 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[hsl(var(--ticket-accent))]/70 text-[hsl(var(--ticket-accent))] shrink-0">
            <User className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight break-words">{ticket.passengerName}</p>
            <p className="text-xs text-[hsl(var(--ticket-muted))] mt-0.5">CPF: {maskCpf(ticket.passengerCpf)}</p>
          </div>
        </div>
        <div className="h-px bg-[hsl(var(--ticket-border))]" />
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="space-y-1">
            <div className="flex items-center justify-center gap-1.5">
              <Armchair className="h-4 w-4 text-[hsl(var(--ticket-accent))]" />
              <span className="text-sm font-bold">{seatDisplayLabel}</span>
            </div>
            <p className="text-[10px] uppercase tracking-wide text-[hsl(var(--ticket-muted))]">Assento</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-center gap-1.5">
              <ArrowLeftRight className="h-4 w-4 text-[hsl(var(--ticket-accent))]" />
              <span className="text-xs font-semibold">{consolidatedRoundTrip ? 'Ida e Volta' : 'Somente Ida'}</span>
            </div>
            <p className="text-[10px] uppercase tracking-wide text-[hsl(var(--ticket-muted))]">Tipo de viagem</p>
          </div>
          <div className="space-y-1">
            <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full border text-xs font-semibold ${statusClasses}`}>
              {statusLabel}
            </span>
            <p className="text-[10px] uppercase tracking-wide text-[hsl(var(--ticket-muted))]">Status</p>
          </div>
        </div>
      </div>

      {/* 3. Botões de ação */}
      {(canDownload || isReservedReceipt) && (
        <div data-pdf-exclude="true" className="flex flex-col gap-2">
          {showWhatsAppGroupCta && isPaid && ticket.whatsappGroupLink && (
            <a
              href={ticket.whatsappGroupLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--ticket-success))]/60 bg-[hsl(var(--ticket-surface-2))] px-3 py-3 text-[hsl(var(--ticket-success))] text-sm font-semibold leading-tight text-center hover:bg-[hsl(var(--ticket-success-bg))]/60 transition-colors min-h-[48px]"
            >
              <WhatsAppIcon size={18} />
              <span>Entrar no grupo do WhatsApp</span>
            </a>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--ticket-border))] bg-[hsl(var(--ticket-surface))] px-2 py-3 text-[hsl(var(--ticket-text))] text-xs font-semibold leading-tight text-center hover:bg-[hsl(var(--ticket-surface-2))] transition-colors min-h-[48px]"
            >
              <FileText className="h-4 w-4" />
              <span>{isReservedReceipt ? 'Comprovante (PDF)' : 'Salvar PDF'}</span>
            </button>
            {canDownload && !isReservedReceipt ? (
              <button
                type="button"
                onClick={handleDownloadImage}
                className="flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--ticket-border))] bg-[hsl(var(--ticket-surface))] px-2 py-3 text-[hsl(var(--ticket-text))] text-xs font-semibold leading-tight text-center hover:bg-[hsl(var(--ticket-surface-2))] transition-colors min-h-[48px]"
              >
                <QrCode className="h-4 w-4" />
                <span>Salvar só QR Code</span>
              </button>
            ) : (
              <div className="hidden" aria-hidden="true" />
            )}
          </div>
        </div>
      )}

      {/* 4. Card principal */}
      <div className="rounded-xl border border-[hsl(var(--ticket-border))] bg-[hsl(var(--ticket-surface))] p-4">
        {/* 5. Identidade SmartBus + Empresa */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Usa a marca oficial da passagem SmartBus em vez do SVG simplificado legado. */}
            <img
              src="/logo-branca2.png"
              alt="SmartBus BR"
              className="h-9 w-auto max-w-[160px] object-contain"
            />
          </div>
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {ticket.companyLogoUrl ? (
              <img
                src={ticket.companyLogoUrl}
                alt={ticket.companyName}
                className="h-14 w-14 rounded-lg object-contain bg-white p-1 shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-tight break-words">{ticket.companyName}</p>
              {formattedCnpj && (
                <p className="text-[10px] text-[hsl(var(--ticket-muted))] mt-0.5">CNPJ: {formattedCnpj}</p>
              )}
              {companyLoc && (
                <p className="text-[10px] text-[hsl(var(--ticket-muted))]">{companyLoc}</p>
              )}
              {ticket.companyPhone && (
                <p className="text-[10px] text-[hsl(var(--ticket-muted))] flex items-center gap-1 mt-0.5">
                  <Phone className="h-3 w-3" /> {ticket.companyPhone}
                </p>
              )}
              {ticket.companyWhatsapp && (
                <p className="text-[10px] text-[hsl(var(--ticket-muted))] flex items-center gap-1">
                  <WhatsAppIcon size={10} /> {ticket.companyWhatsapp}
                </p>
              )}
            </div>
          </div>
        </div>

        <SectionDivider />

        {/* 6. QR Code */}
        {isReservedReceipt ? (
          <div className="rounded-xl border-2 border-dashed border-amber-400/60 bg-amber-500/10 p-5 text-center">
            <QRCodeCanvas
              ref={qrRef}
              value={ticket.qrCodeToken}
              size={180}
              level="M"
              includeMargin
              className="hidden"
              aria-hidden="true"
            />
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20 text-amber-300">
              <QrCode className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold text-amber-200">QR Code de embarque indisponível</p>
            <p className="text-xs text-amber-200/80 mt-1">A passagem oficial com QR só é liberada após confirmação do pagamento.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="relative rounded-xl bg-white p-3">
              <QRCodeCanvas
                ref={qrRef}
                value={ticket.qrCodeToken}
                size={200}
                level="M"
                includeMargin={false}
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
            <p className="text-xs text-[hsl(var(--ticket-muted))]">Apresente o QR Code no embarque</p>
          </div>
        )}

        {isReservedReceipt && (
          <Alert className="mt-4 border-amber-500/40 bg-amber-500/10 text-amber-200">
            <ShieldAlert className="h-4 w-4 text-amber-300" />
            <AlertDescription className="text-amber-200">
              <strong>Comprovante de reserva.</strong> Este documento não autoriza embarque.
              A passagem oficial é liberada apenas quando a venda estiver <strong>paga</strong>.
            </AlertDescription>
          </Alert>
        )}

        <SectionDivider />

        {/* 7. Passageiro + Bilhete */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <SectionTitle>Passageiro</SectionTitle>
            <div className="flex items-start gap-2 text-xs">
              <User className="h-3.5 w-3.5 mt-0.5 text-[hsl(var(--ticket-muted))] shrink-0" />
              <span className="break-words">{ticket.passengerName}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[hsl(var(--ticket-muted))]">
              <IdCard className="h-3.5 w-3.5" />
              <span>CPF: {maskCpf(ticket.passengerCpf)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <SectionTitle>Bilhete</SectionTitle>
            {ticketNumberDisplay && (
              <div className="flex items-center gap-2 text-xs">
                <Hash className="h-3.5 w-3.5 text-[hsl(var(--ticket-muted))]" />
                <span className="text-[hsl(var(--ticket-muted))]">Passagem Nº</span>
                <span className="font-medium">{ticketNumberDisplay}</span>
              </div>
            )}
            {purchaseConfirmedLabel && (
              <div className="flex items-start gap-2 text-xs">
                <Calendar className="h-3.5 w-3.5 mt-0.5 text-[hsl(var(--ticket-muted))]" />
                <span className="text-[hsl(var(--ticket-muted))]">Compra em</span>
                <span>{purchaseConfirmedLabel}</span>
              </div>
            )}
            {/* A seção Bilhete fica restrita a identificadores da compra; origem, tipo, assento e volta já aparecem no resumo/embarque. */}
            {ticket.vehicleFloors != null && ticket.vehicleFloors > 1 && ticket.seatFloor != null && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[hsl(var(--ticket-muted))]">Pavimento</span>
                <span>{ticket.seatFloor === 2 ? 'Superior' : 'Inferior'}</span>
              </div>
            )}
            {ticket.seatCategory && ticket.seatCategory !== 'convencional' && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[hsl(var(--ticket-muted))]">Categoria</span>
                <span>{seatCategoryLabel[ticket.seatCategory] || ticket.seatCategory}</span>
              </div>
            )}
            {ticket.saleId && (
              <div className="flex items-center gap-1.5 text-[11px] text-[hsl(var(--ticket-muted))]">
                <span>Código: <span className="font-mono">{ticket.saleId.slice(0, 8)}</span></span>
                <button
                  onClick={handleCopySaleId}
                  className="p-0.5 rounded hover:bg-[hsl(var(--ticket-surface-2))] transition-colors"
                  title="Copiar código completo"
                  data-pdf-exclude="true"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        <SectionDivider />

        {/* 8. Evento */}
        <div className="space-y-2">
          <SectionTitle>Evento</SectionTitle>
          <div className="flex items-start gap-2 text-xs">
            <Star className="h-3.5 w-3.5 mt-0.5 text-[hsl(var(--ticket-muted))] shrink-0" />
            <span className="break-words font-medium">{ticket.eventName}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Calendar className="h-3.5 w-3.5 text-[hsl(var(--ticket-muted))]" />
            <span>{formatDateOnlyBR(ticket.eventDate)}</span>
          </div>
        </div>

        <SectionDivider />

        {/* 9. Embarque */}
        <div className="space-y-2">
          <SectionTitle>Embarque</SectionTitle>
          <div className="flex items-start gap-2 text-xs">
            <MapPin className="h-3.5 w-3.5 mt-0.5 text-[hsl(var(--ticket-muted))] shrink-0" />
            <span className="break-words font-medium">{ticket.boardingLocationName}</span>
          </div>
          {(ticket.boardingDepartureTime || ticket.boardingDepartureDate) && (
            <div className="flex items-center gap-2 text-xs">
              <Clock className="h-3.5 w-3.5 text-[hsl(var(--ticket-muted))]" />
              <span>{formatBoardingDateTime(ticket.boardingDepartureDate, ticket.boardingDepartureTime, ticket.eventDate)}</span>
            </div>
          )}
          <div className="flex items-start gap-2 text-xs text-[hsl(var(--ticket-muted))]">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              {ticket.boardingToleranceMinutes != null
                ? `Tolerância máxima de embarque: ${ticket.boardingToleranceMinutes} minutos após o horário informado.`
                : 'Embarque pontual no horário informado.'}
            </span>
          </div>
        </div>

        {/* 10. Veículo */}
        {(ticket.vehicleType || ticket.vehiclePlate || ticket.driverName) && (
          <>
            <SectionDivider />
            <div className="space-y-2">
              <SectionTitle>Informações do Veículo</SectionTitle>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="space-y-1">
                  <Bus className="h-4 w-4 mx-auto text-[hsl(var(--ticket-muted))]" />
                  <p className="text-xs font-medium">{ticket.vehicleType ? (vehicleTypeLabel[ticket.vehicleType] || ticket.vehicleType) : '—'}</p>
                  <p className="text-[10px] uppercase tracking-wide text-[hsl(var(--ticket-muted))]">Tipo</p>
                </div>
                <div className="space-y-1">
                  <IdCard className="h-4 w-4 mx-auto text-[hsl(var(--ticket-muted))]" />
                  <p className="text-xs font-medium break-all">{ticket.vehiclePlate || 'A definir'}</p>
                  <p className="text-[10px] uppercase tracking-wide text-[hsl(var(--ticket-muted))]">Placa</p>
                </div>
                <div className="space-y-1">
                  <User className="h-4 w-4 mx-auto text-[hsl(var(--ticket-muted))]" />
                  <p className="text-xs font-medium break-words">{ticket.driverName || 'A definir'}</p>
                  <p className="text-[10px] uppercase tracking-wide text-[hsl(var(--ticket-muted))]">Motorista</p>
                </div>
              </div>
            </div>
          </>
        )}

        <SectionDivider />

        {/* 11. Observações */}
        <div className="space-y-2">
          <SectionTitle>Observações Operacionais</SectionTitle>
          <ul className="space-y-1 text-xs text-[hsl(var(--ticket-muted))]">
            <li className="flex gap-2"><span className="text-[hsl(var(--ticket-accent))]">•</span> É obrigatório apresentar documento oficial com foto no momento do embarque.</li>
            <li className="flex gap-2"><span className="text-[hsl(var(--ticket-accent))]">•</span> Recomenda-se chegar com antecedência mínima de 10 minutos.</li>
          </ul>
        </div>

        {/* Benefício (mantido, discreto) */}
        {ticket.benefitApplied && (ticket.benefitProgramName || Number(ticket.benefitDiscountAmount ?? 0) > 0) && (
          <>
            <SectionDivider />
            <div className="space-y-1 text-xs">
              <SectionTitle>Benefício aplicado</SectionTitle>
              {ticket.benefitProgramName && (
                <div className="flex justify-between">
                  <span className="text-[hsl(var(--ticket-muted))]">Benefício</span>
                  <span>{ticket.benefitProgramName}</span>
                </div>
              )}
              {Number(ticket.benefitDiscountAmount ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-[hsl(var(--ticket-muted))]">Desconto</span>
                  <span>- {formatCurrencyBRL(Number(ticket.benefitDiscountAmount ?? 0))}</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Fee breakdown (mantido) */}
        {ticket.fees && ticket.fees.length > 0 && (
          <>
            <SectionDivider />
            <div className="space-y-1 text-xs">
              {ticket.unitPrice != null && (
                <div className="flex justify-between">
                  <span className="text-[hsl(var(--ticket-muted))]">Passagem</span>
                  <span>{formatCurrencyBRL(ticket.unitPrice)}</span>
                </div>
              )}
              {ticket.fees.map((fee, idx) => (
                <div key={idx} className="flex justify-between">
                  <span className="text-[hsl(var(--ticket-muted))]">{fee.name}</span>
                  <span>{formatCurrencyBRL(fee.amount)}</span>
                </div>
              ))}
              {ticket.totalPaid != null && (
                <div className="flex justify-between font-semibold text-sm pt-1 border-t border-[hsl(var(--ticket-border))]">
                  <span>Total pago</span>
                  <span>{formatCurrencyBRL(ticket.totalPaid)}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Parceiros */}
      {ticket.commercialPartners && ticket.commercialPartners.length > 0 && (
        <div className="rounded-xl border border-[hsl(var(--ticket-border))] bg-[hsl(var(--ticket-surface))] p-3 space-y-2">
          <SectionTitle>Parceiros oficiais</SectionTitle>
          <div className="flex flex-wrap gap-3 items-center">
            {ticket.commercialPartners.slice(0, 6).map((p, idx) => (
              p.logo_url ? (
                <img
                  key={idx}
                  src={p.logo_url}
                  alt={p.name}
                  className="h-8 max-w-[80px] object-contain bg-white rounded p-0.5"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <span key={idx} className="text-[10px] text-[hsl(var(--ticket-muted))] bg-[hsl(var(--ticket-surface-2))] px-2 py-1 rounded">{p.name}</span>
              )
            ))}
          </div>
        </div>
      )}

      {/* Patrocinadores */}
      {ticket.eventSponsors && ticket.eventSponsors.length > 0 && (
        <div className="rounded-xl border border-[hsl(var(--ticket-border))] bg-[hsl(var(--ticket-surface))] p-3 space-y-2">
          <SectionTitle>Patrocinadores do evento</SectionTitle>
          <div className="flex flex-wrap gap-3 items-center">
            {ticket.eventSponsors.slice(0, 6).map((s, idx) => (
              s.logo_url ? (
                <img
                  key={idx}
                  src={s.logo_url}
                  alt={s.name}
                  className="h-8 max-w-[80px] object-contain bg-white rounded p-0.5"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <span key={idx} className="text-[10px] text-[hsl(var(--ticket-muted))] bg-[hsl(var(--ticket-surface-2))] px-2 py-1 rounded">{s.name}</span>
              )
            ))}
          </div>
        </div>
      )}

      {/* 12. Rodapé */}
      <div
        data-ticket-pdf-footer="true"
        className="rounded-xl border border-[hsl(var(--ticket-border))] bg-[hsl(var(--ticket-surface-2))] p-3 space-y-2 text-[11px] text-[hsl(var(--ticket-muted))] leading-5 break-words [letter-spacing:normal] [word-spacing:normal] [font-stretch:normal] [white-space:normal] [word-break:normal] [overflow-wrap:break-word]"
      >
        <p>{getTicketTransportOperatedByText(ticket.companyName || 'empresa organizadora')}</p>
        <p>{TICKET_PLATFORM_SALES_TEXT}</p>
        <p>{TICKET_PLATFORM_LIABILITY_TEXT}</p>
        <p>{TICKET_PDF_FOOTER_TEXT}</p>
      </div>

      {/* Refresh status (oculto do PDF) */}
      {showRefreshButton && (
        <div data-pdf-exclude="true">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-[hsl(var(--ticket-muted))] hover:text-[hsl(var(--ticket-text))] hover:bg-[hsl(var(--ticket-surface-2))]"
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
        </div>
      )}
    </div>
  );
}
