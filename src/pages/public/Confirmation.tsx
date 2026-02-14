import { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Sale, TicketRecord } from '@/types/database';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TicketCard, TicketCardData } from '@/components/public/TicketCard';
import {
  CheckCircle2,
  Calendar,
  MapPin,
  Clock,
  Loader2,
  Ticket,
  User,
  Phone,
  ExternalLink,
  Armchair,
  AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { SaleStatus } from '@/types/database';

export default function Confirmation() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const paymentSuccess = searchParams.get('payment') === 'success';
  const [sale, setSale] = useState<Sale | null>(null);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [boardingDepartureTime, setBoardingDepartureTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);

  // Initial data fetch
  useEffect(() => {
    const fetchSale = async () => {
      if (!id) return;

      const [saleRes, ticketsRes] = await Promise.all([
        supabase
          .from('sales')
          .select(
            '*, event:events(*), trip:trips(*, vehicle:vehicles(*)), boarding_location:boarding_locations(*)'
          )
          .eq('id', id)
          .single(),
        supabase
          .from('tickets')
          .select('*')
          .eq('sale_id', id)
          .order('seat_label', { ascending: true }),
      ]);

      if (saleRes.data) setSale(saleRes.data as Sale);
      if (ticketsRes.data) setTickets(ticketsRes.data as TicketRecord[]);

      if (saleRes.data) {
        const { data: selectedBoarding } = await supabase
          .from('event_boarding_locations')
          .select('departure_time')
          .eq('event_id', saleRes.data.event_id)
          .eq('trip_id', saleRes.data.trip_id)
          .eq('boarding_location_id', saleRes.data.boarding_location_id)
          .maybeSingle();

        setBoardingDepartureTime(selectedBoarding?.departure_time ?? null);
      }

      setLoading(false);
    };

    fetchSale();
  }, [id]);

  // Polling: check sale status every 3s when payment=success but status != 'pago'
  useEffect(() => {
    if (!paymentSuccess || !id || !sale || sale.status === 'pago') return;

    let attempts = 0;
    const maxAttempts = 60;

    const interval = setInterval(async () => {
      attempts++;
      const { data } = await supabase
        .from('sales')
        .select('status')
        .eq('id', id)
        .maybeSingle();

      if (data?.status === 'pago') {
        // Refetch tickets to get qr_code_token
        const { data: freshTickets } = await supabase
          .from('tickets')
          .select('*')
          .eq('sale_id', id)
          .order('seat_label', { ascending: true });
        if (freshTickets) setTickets(freshTickets as TicketRecord[]);
        setSale((prev) => (prev ? { ...prev, status: 'pago' } : prev));
        clearInterval(interval);
      } else if (attempts >= maxAttempts) {
        setPollingTimedOut(true);
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [paymentSuccess, id, sale?.status]);

  // Build TicketCardData from tickets
  const ticketCards: TicketCardData[] = tickets.map((t) => ({
    ticketId: t.id,
    qrCodeToken: t.qr_code_token,
    passengerName: t.passenger_name,
    passengerCpf: t.passenger_cpf,
    seatLabel: t.seat_label,
    boardingStatus: t.boarding_status,
    eventName: sale?.event?.name || '',
    eventDate: sale?.event?.date || '',
    eventCity: sale?.event?.city || '',
    boardingLocationName: sale?.boarding_location?.name || '',
    boardingLocationAddress: sale?.boarding_location?.address || '',
    boardingDepartureTime: boardingDepartureTime,
    saleStatus: (sale?.status || 'reservado') as SaleStatus,
  }));

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

  return (
    <PublicLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-8">
          {sale.status === 'pago' ? (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-2">
                Pagamento Confirmado!
              </h1>
              <p className="text-muted-foreground">
                Seu pagamento foi confirmado e suas passagens estão garantidas.
              </p>
            </>
          ) : paymentSuccess && !pollingTimedOut ? (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 mb-4">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-2">
                Verificando Pagamento...
              </h1>
              <p className="text-muted-foreground">
                Estamos confirmando seu pagamento. Isso pode levar alguns segundos.
              </p>
            </>
          ) : paymentSuccess && pollingTimedOut ? (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
                <AlertCircle className="h-8 w-8 text-amber-600" />
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-2">
                Pagamento em Processamento
              </h1>
              <p className="text-muted-foreground">
                Seu pagamento está sendo processado. Atualize a página em alguns minutos para ver a confirmação.
              </p>
            </>
          ) : (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
                <AlertCircle className="h-8 w-8 text-amber-600" />
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-2">
                Reserva Registrada
              </h1>
              <p className="text-muted-foreground">
                Sua passagem foi reservada com sucesso
              </p>
            </>
          )}
        </div>

        {/* QR Code Ticket Cards when paid or cancelled */}
        {(isPaid || sale.status === 'cancelado') && ticketCards.length > 0 && (
          <div className="space-y-4 mb-6">
            <h2 className="font-semibold text-lg">
              {isPaid ? 'Suas Passagens' : 'Passagens (Canceladas)'}
            </h2>
            {ticketCards.map((tc) => (
              <TicketCard key={tc.ticketId} ticket={tc} />
            ))}
          </div>
        )}

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
                  {sale.event &&
                    format(new Date(sale.event.date), "EEEE, dd 'de' MMMM 'de' yyyy", {
                      locale: ptBR,
                    })}
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
                {boardingDepartureTime && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>Horário de saída: {boardingDepartureTime.slice(0, 5)}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{sale.boarding_location?.name}</span>
                </div>
                <p className="text-muted-foreground pl-6">
                  {sale.boarding_location?.address}
                </p>
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

            {/* Show passenger list only when NOT paid (no QR cards shown) */}
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
                            <p className="font-medium">
                              Assento {ticket.seat_label} — {ticket.passenger_name}
                            </p>
                            <p className="text-muted-foreground">
                              CPF: {ticket.passenger_cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
                            </p>
                            {ticket.passenger_phone && (
                              <p className="text-muted-foreground">
                                Tel: {ticket.passenger_phone}
                              </p>
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
            <Button variant="outline" className="w-full">
              Ver outros eventos
            </Button>
          </Link>
        </div>
      </div>
    </PublicLayout>
  );
}
