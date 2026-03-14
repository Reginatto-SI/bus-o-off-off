import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { calculateFees, type EventFeeInput, type FeeLineItem } from '@/lib/feeCalculator';
import { Sale, TicketRecord } from '@/types/database';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TicketCardData } from '@/components/public/TicketCard';
import { PassengerTicketList } from '@/components/public/PassengerTicketList';
import {
  CheckCircle2, Calendar, MapPin, Clock, Loader2, Ticket,
  User, Phone, ExternalLink, Armchair, AlertCircle, MessageCircle, RefreshCw,
} from 'lucide-react';
import { formatDateOnlyBR, parseDateOnlyAsLocal } from '@/lib/date';
import { formatBoardingDateTime } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { SaleStatus } from '@/types/database';
import { getConfirmationResponsibilityText } from '@/lib/intermediationPolicy';

interface CompanyInfo {
  name: string;
  trade_name: string | null;
  logo_url: string | null;
  city: string | null;
  state: string | null;
  primary_color: string | null;
  ticket_color: string | null;
  cnpj: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  slogan: string | null;
}

function formatCnpjDisplay(cnpj: string | null): string | null {
  if (!cnpj) return null;
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return cnpj;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export default function Confirmation() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const paymentSuccess = searchParams.get('payment') === 'success';
  const [sale, setSale] = useState<Sale | null>(null);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [seatDataMap, setSeatDataMap] = useState<Record<string, { category: string; floor: number }>>({});
  const [vehicleFloors, setVehicleFloors] = useState<number>(1);
  const [boardingDepartureTime, setBoardingDepartureTime] = useState<string | null>(null);
  const [boardingDepartureDate, setBoardingDepartureDate] = useState<string | null>(null);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);
  const [feeLines, setFeeLines] = useState<FeeLineItem[]>([]);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [lastVerificationAt, setLastVerificationAt] = useState<Date | null>(null);
  const [commercialPartners, setCommercialPartners] = useState<{ name: string; logo_url: string | null }[]>([]);
  const [eventSponsors, setEventSponsors] = useState<{ name: string; logo_url: string | null }[]>([]);
  // Removed verifyCalledRef — polling now calls verify-payment-status periodically (see below)

  useEffect(() => {
    const fetchSale = async () => {
      if (!id) return;

      const [saleRes, ticketsRes] = await Promise.all([
        supabase
          .from('sales')
          .select('*, event:events(*), trip:trips(*, vehicle:vehicles(*), driver:drivers!trips_driver_id_fkey(name)), boarding_location:boarding_locations(*)')
          .eq('id', id)
          .single(),
        supabase
          .from('tickets')
          .select('*')
          .eq('sale_id', id)
          .order('seat_label', { ascending: true }),
      ]);

      if (saleRes.data) {
        setSale(saleRes.data as unknown as Sale);

        let companyFeePercent: number | null = null;
        const companyId = (saleRes.data as any).event?.company_id;
        if (companyId) {
          const { data: companyData } = await supabase
            .from('companies')
            .select('name, trade_name, logo_url, city, state, primary_color, ticket_color, cnpj, phone, whatsapp, address, slogan, platform_fee_percent')
            .eq('id', companyId)
            .maybeSingle();
          if (companyData) {
            setCompany(companyData as CompanyInfo);
            companyFeePercent = companyData.platform_fee_percent != null ? Number(companyData.platform_fee_percent) : null;

            // Fetch commercial partners for ticket
            const { data: partnersData } = await supabase
              .from('commercial_partners')
              .select('name, logo_url')
              .eq('company_id', companyId)
              .eq('status', 'ativo')
              .eq('show_on_ticket', true)
              .order('display_order')
              .limit(6);
            setCommercialPartners((partnersData || []).map((p: any) => ({ name: p.name, logo_url: p.logo_url })));

            // Fetch event sponsors for ticket
            const { data: esData } = await supabase
              .from('event_sponsors')
              .select('display_order, sponsor:sponsors(name, banner_url, status)')
              .eq('event_id', saleRes.data.event_id)
              .eq('show_on_ticket', true)
              .order('display_order')
              .limit(6);
            setEventSponsors(
              (esData || [])
                .filter((es: any) => es.sponsor?.status === 'ativo')
                .map((es: any) => ({ name: es.sponsor.name, logo_url: es.sponsor.banner_url }))
            );
          }
        }

        const { data: selectedBoarding } = await supabase
          .from('event_boarding_locations')
          .select('departure_time, departure_date')
          .eq('event_id', saleRes.data.event_id)
          .eq('trip_id', saleRes.data.trip_id)
          .eq('boarding_location_id', saleRes.data.boarding_location_id)
          .maybeSingle();
        setBoardingDepartureTime(selectedBoarding?.departure_time ?? null);
        setBoardingDepartureDate((selectedBoarding as any)?.departure_date ?? null);

        const { data: feesData } = await supabase
          .from('event_fees')
          .select('name, fee_type, value, is_active')
          .eq('event_id', saleRes.data.event_id)
          .eq('is_active', true)
          .order('sort_order');
        if (saleRes.data) {
          if (companyFeePercent == null) {
            toast({ title: 'Taxa da plataforma da empresa indisponível', variant: 'destructive' });
          } else {
            const breakdown = calculateFees(saleRes.data.unit_price, (feesData ?? []) as EventFeeInput[], {
              passToCustomer: Boolean((saleRes.data.event as any)?.pass_platform_fee_to_customer),
              feePercent: Number(companyFeePercent),
            });
            setFeeLines(breakdown.fees);
          }
        }
      }
      if (ticketsRes.data) {
        setTickets(ticketsRes.data as TicketRecord[]);

        // Fetch seat category/floor for each ticket
        const seatIds = (ticketsRes.data as TicketRecord[]).map(t => t.seat_id).filter(Boolean) as string[];
        if (seatIds.length > 0) {
          const { data: seatsData } = await supabase
            .from('seats')
            .select('id, category, floor')
            .in('id', seatIds);
          if (seatsData) {
            const map: Record<string, { category: string; floor: number }> = {};
            seatsData.forEach((s: any) => { map[s.id] = { category: s.category || 'convencional', floor: s.floor || 1 }; });
            setSeatDataMap(map);
          }
        }

        // Get vehicle floors from trip
        const tripVehicle = (saleRes.data as any)?.trip?.vehicle;
        if (tripVehicle) setVehicleFloors(tripVehicle.floors || 1);
      }
      setLoading(false);
    };

    fetchSale();
  }, [id]);

  // Chamada on-demand ao verify-payment-status (fallback manual + auto após 15s)
  const verifyPaymentStatus = useCallback(async () => {
    if (!id) return;
    setIsVerifyingPayment(true);
    // Guardamos a última tentativa para dar feedback claro ao usuário em estados pendentes.
    setLastVerificationAt(new Date());
    try {
      const { data, error } = await supabase.functions.invoke('verify-payment-status', {
        body: { sale_id: id },
      });
      if (error) throw error;

      if (data?.paymentStatus === 'pago') {
        // Recarregar tickets e atualizar status local
        const { data: freshTickets } = await supabase
          .from('tickets').select('*').eq('sale_id', id).order('seat_label', { ascending: true });
        if (freshTickets) setTickets(freshTickets as TicketRecord[]);
        setSale((prev) => (prev ? { ...prev, status: 'pago' } : prev));
        toast({ title: 'Pagamento confirmado ✅' });
      } else if (data?.paymentStatus === 'processando') {
        toast({ title: 'Pagamento ainda em processamento' });
      } else if (data?.paymentStatus === 'expirado') {
        toast({ title: 'Sessão de pagamento expirada', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erro ao verificar pagamento', variant: 'destructive' });
    } finally {
      setIsVerifyingPayment(false);
    }
  }, [id, toast]);

  // Polling para confirmação de pagamento (works for both pendente_pagamento and reservado)
  useEffect(() => {
    if (!id || !sale) return;
    // Only poll if sale is in a pending state
    const isPending = sale.status === 'pendente_pagamento' || (sale.status === 'reservado' && paymentSuccess);
    if (!isPending) return;

    let attempts = 0;
    const maxAttempts = 120; // 6 minutes at 3s intervals

    const interval = setInterval(async () => {
      attempts++;

      // FIX: Periodically call verify-payment-status every ~30s (every 10th attempt)
      // instead of a single call at attempt 5. This ensures automatic sync with Asaas
      // even when the webhook doesn't fire (common in Sandbox). The manual button
      // already proves this logic works — now the polling reuses it automatically.
      if (attempts >= 5 && attempts % 10 === 0) {
        supabase.functions.invoke('verify-payment-status', { body: { sale_id: id } })
          .catch(() => {});
      }

      const { data } = await supabase.from('sales').select('status').eq('id', id).maybeSingle();

      if (data?.status === 'pago') {
        const { data: freshTickets } = await supabase
          .from('tickets').select('*').eq('sale_id', id).order('seat_label', { ascending: true });
        if (freshTickets) setTickets(freshTickets as TicketRecord[]);
        setSale((prev) => (prev ? { ...prev, status: 'pago' } : prev));
        clearInterval(interval);
      } else if (data?.status === 'cancelado') {
        setSale((prev) => (prev ? { ...prev, status: 'cancelado' } : prev));
        clearInterval(interval);
      } else if (attempts >= maxAttempts) {
        setPollingTimedOut(true);
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [id, sale?.status, paymentSuccess]);

  const companyDisplayName = company?.trade_name || company?.name || '';
  const companyLocation = [company?.city, company?.state].filter(Boolean).join(' - ');
  const formattedCnpj = formatCnpjDisplay(company?.cnpj);

  // Encaminha ticket_number para o card oficial da passagem (mesmo template de tela/PDF).
  const ticketCards: TicketCardData[] = tickets.map((t) => {
    const unitPrice = sale?.unit_price ?? 0;
    const totalPaidPerTicket = feeLines.length > 0 && sale
      ? (sale.gross_amount ?? sale.unit_price * sale.quantity) / sale.quantity
      : undefined;

    const seatInfo = t.seat_id ? seatDataMap[t.seat_id] : null;

    return {
      ticketId: t.id,
      ticketNumber: t.ticket_number,
      qrCodeToken: t.qr_code_token,
      passengerName: t.passenger_name,
      passengerCpf: t.passenger_cpf,
      seatLabel: t.seat_label,
      boardingStatus: t.boarding_status,
      eventName: sale?.event?.name || '',
      eventDate: sale?.event?.date || '',
      eventCity: sale?.event?.city || '',
      eventTransportPolicy: sale?.event?.transport_policy ?? 'trecho_independente',
      boardingToleranceMinutes: sale?.event?.boarding_tolerance_minutes ?? null,
      boardingLocationName: sale?.boarding_location?.name || '',
      boardingLocationAddress: sale?.boarding_location?.address || '',
      boardingDepartureTime: boardingDepartureTime,
      boardingDepartureDate: boardingDepartureDate,
      saleStatus: (sale?.status || 'reservado') as SaleStatus,
      saleId: sale?.id,
      stripeCheckoutSessionId: sale?.stripe_checkout_session_id || null,
      asaasPaymentId: (sale as any)?.asaas_payment_id || null,
      companyName: companyDisplayName,
      companyLogoUrl: company?.logo_url || null,
      companyCity: company?.city || null,
      companyState: company?.state || null,
      companyPrimaryColor: company?.ticket_color || company?.primary_color || null,
      companyCnpj: company?.cnpj || null,
      companyPhone: company?.phone || null,
      companyWhatsapp: company?.whatsapp || null,
      companyAddress: company?.address || null,
      companySlogan: company?.slogan || null,
      vehicleType: (sale?.trip as any)?.vehicle?.type || null,
      vehiclePlate: (sale?.trip as any)?.vehicle?.plate || null,
      driverName: (sale?.trip as any)?.driver?.name || null,
      fees: feeLines.length > 0 ? feeLines : undefined,
      unitPrice: feeLines.length > 0 ? unitPrice : undefined,
      totalPaid: totalPaidPerTicket,
      seatCategory: seatInfo?.category || null,
      seatFloor: seatInfo?.floor || null,
      vehicleFloors: vehicleFloors,
      commercialPartners: commercialPartners.length > 0 ? commercialPartners : undefined,
      eventSponsors: eventSponsors.length > 0 ? eventSponsors : undefined,
    };
  });

  if (loading) {
    return (
      <PublicLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PublicLayout>
    );
  }

  if (!sale) {
    return (
      <PublicLayout>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-center text-muted-foreground">Reserva não encontrada</p>
        </div>
      </PublicLayout>
    );
  }

  const isPaid = sale.status === 'pago';
  const isPendingPayment = sale.status === 'pendente_pagamento';

  return (
    <PublicLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Status header */}
        <div className="text-center mb-8">
          {sale.status === 'pago' ? (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-2">Pagamento Confirmado!</h1>
              <p className="text-muted-foreground">Seu pagamento foi confirmado e suas passagens estão garantidas.</p>
            </>
          ) : (isPendingPayment || (sale.status === 'reservado' && paymentSuccess)) && !pollingTimedOut ? (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 mb-4">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-2">Aguardando Confirmação do Pagamento</h1>
              <p className="text-muted-foreground">
                Assim que o pagamento for confirmado, sua passagem será gerada automaticamente.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Você pode fechar esta página — sua passagem será gerada mesmo assim.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={verifyPaymentStatus}
                disabled={isVerifyingPayment}
              >
                {isVerifyingPayment ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Atualizar status do pagamento
              </Button>
              {lastVerificationAt && (
                <p className="text-xs text-muted-foreground mt-2">
                  Última tentativa: {new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(lastVerificationAt)}
                </p>
              )}
            </>
          ) : (isPendingPayment || paymentSuccess) && pollingTimedOut ? (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
                <AlertCircle className="h-8 w-8 text-amber-600" />
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-2">Pagamento em Processamento</h1>
              <p className="text-muted-foreground">Seu pagamento está sendo processado pelo banco. Sua passagem será gerada automaticamente quando confirmado.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={verifyPaymentStatus}
                disabled={isVerifyingPayment}
              >
                {isVerifyingPayment ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Atualizar status do pagamento
              </Button>
              {lastVerificationAt && (
                <p className="text-xs text-muted-foreground mt-2">
                  Última tentativa: {new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(lastVerificationAt)}
                </p>
              )}
            </>
          ) : sale.status === 'cancelado' ? (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-2">Compra Cancelada</h1>
              <p className="text-muted-foreground">
                {sale.cancel_reason || 'Esta compra foi cancelada.'}
              </p>
            </>
          ) : (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
                <AlertCircle className="h-8 w-8 text-amber-600" />
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-2">Reserva Registrada</h1>
              <p className="text-muted-foreground">Sua passagem foi reservada com sucesso</p>
            </>
          )}
        </div>

        {/* Company identity + ticket cards when paid/cancelled */}
        {(isPaid || sale.status === 'cancelado') && ticketCards.length > 0 && (
          <div className="space-y-4 mb-6">
            {company && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/40 border">
                {company.logo_url && (
                  <img
                    src={company.logo_url}
                    alt={companyDisplayName}
                    className="h-14 w-14 rounded-lg object-contain shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-foreground text-base">{companyDisplayName}</p>
                  {formattedCnpj && <p className="text-xs text-muted-foreground">CNPJ: {formattedCnpj}</p>}
                  {companyLocation && <p className="text-xs text-muted-foreground">{companyLocation}</p>}
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {company.phone && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {company.phone}
                      </span>
                    )}
                    {company.whatsapp && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MessageCircle className="h-3 w-3" />
                        {company.whatsapp}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Transporte oficial do evento</p>
                </div>
              </div>
            )}

            <h2 className="font-semibold text-lg">
              {isPaid ? 'Suas Passagens' : 'Passagens (Canceladas)'}
            </h2>
            {/* Agrupamento por passageiro com ida/volta sob demanda */}
            <PassengerTicketList tickets={ticketCards} />
          </div>
        )}

        {/* Sale details card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Detalhes da Reserva</CardTitle>
              <StatusBadge status={sale.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="font-semibold text-lg mb-2">{sale.event?.name}</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {sale.event && (() => {
                    // Evita parse UTC de date-only (YYYY-MM-DD) que causa -1 dia em fuso BR.
                    const localDate = parseDateOnlyAsLocal(sale.event.date);
                    return localDate
                      ? new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(localDate)
                      : formatDateOnlyBR(sale.event.date);
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {sale.event?.city}
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="font-medium mb-2">Informações de Embarque</h4>
              <div className="space-y-2 text-sm">
                {(boardingDepartureTime || boardingDepartureDate) && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{formatBoardingDateTime(boardingDepartureDate, boardingDepartureTime, sale?.event?.date || '')}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{sale.boarding_location?.name}</span>
                </div>
                <p className="text-muted-foreground pl-6">{sale.boarding_location?.address}</p>
                {sale.boarding_location?.maps_url && (
                  <a
                    href={sale.boarding_location.maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline pl-6"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Ver no Google Maps
                  </a>
                )}
              </div>
            </div>

            {!isPaid && sale.status !== 'cancelado' && (
              <>
                <Separator />
                {tickets.length > 0 ? (
                  <div>
                    <h4 className="font-medium mb-3">Passageiros</h4>
                    <div className="space-y-3">
                      {tickets.map((ticket) => (
                        <div key={ticket.id} className="flex items-start gap-3 bg-muted/40 rounded-lg p-3">
                          <Armchair className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <div className="text-sm space-y-0.5">
                            <p className="font-medium">Assento {ticket.seat_label} — {ticket.passenger_name}</p>
                            <p className="text-muted-foreground">
                              CPF: {ticket.passenger_cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
                            </p>
                            {ticket.passenger_phone && (
                              <p className="text-muted-foreground">Tel: {ticket.passenger_phone}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <h4 className="font-medium mb-2">Passageiro</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span>{sale.customer_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{sale.customer_phone}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Ticket className="h-4 w-4 text-muted-foreground" />
                        <span>{sale.quantity} passagem(ns)</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Reforço institucional pós-compra: mantém clareza jurídica sem atrapalhar a confirmação principal. */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Informações importantes sobre sua compra</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {getConfirmationResponsibilityText(companyDisplayName || 'empresa organizadora')}
            </p>
          </CardContent>
        </Card>


        <div className="bg-muted/50 rounded-lg p-4 mb-6">
          <p className="text-sm text-muted-foreground text-center">
            <strong>Importante:</strong> Apresente este comprovante no momento do embarque.
            Chegue ao local de embarque com pelo menos 15 minutos de antecedência.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Link to="/consultar-passagens">
            <Button variant="outline" className="w-full">
              <Ticket className="h-4 w-4 mr-2" />
              Consultar Passagens
            </Button>
          </Link>
          <Link to="/eventos">
            <Button variant="outline" className="w-full">Ver outros eventos</Button>
          </Link>
        </div>
      </div>
    </PublicLayout>
  );
}
