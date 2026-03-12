import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { calculateFees, type EventFeeInput } from '@/lib/feeCalculator';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { TicketCardData } from '@/components/public/TicketCard';
import { PassengerTicketList } from '@/components/public/PassengerTicketList';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2, Search, Ticket } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { SaleStatus } from '@/types/database';
import { formatDateOnlyBR, parseDateOnlyAsLocal } from '@/lib/date';

type TicketLookupEvent = {
  id: string;
  name: string;
  date: string;
  city: string;
  status: string;
  is_archived: boolean;
};

function formatCpfInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatEventDate(date: string): string {
  // Padronização de formatação de datas no sistema sem conversão de timezone para campos DATE.
  return formatDateOnlyBR(date);
}


function formatCityState(city: string): string {
  const cityStateMatch = city.match(/^(.*)\s[-–—]\s([A-Za-z]{2})$/);
  if (!cityStateMatch) return city;
  const [, cityName, state] = cityStateMatch;
  return `${cityName}/${state.toUpperCase()}`;
}

function formatEventOptionLabel(event: { name: string; city: string; date: string }): string {
  return `${event.name} — ${formatCityState(event.city)} • ${formatEventDate(event.date)}`;
}

function getEventDeadlineDate(event: TicketLookupEvent, departureDate?: string | null): Date | null {
  const eventDeadline = departureDate || event.date;
  if (!eventDeadline) return null;

  // Evita parse UTC de date-only (YYYY-MM-DD) que causa -1 dia em fuso BR.
  const parsedDate = parseDateOnlyAsLocal(eventDeadline);
  if (!parsedDate) return null;
  parsedDate.setHours(23, 59, 59, 999);
  return parsedDate;
}

export default function TicketLookup() {
  const { toast } = useToast();
  const [selectedEventId, setSelectedEventId] = useState('');
  const [cpf, setCpf] = useState('');
  const [tickets, setTickets] = useState<TicketCardData[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  // Controla quais saleIds estão sendo verificados no Stripe
  const [refreshingSaleIds, setRefreshingSaleIds] = useState<Set<string>>(new Set());

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['ticket-lookup-events'],
    queryFn: async () => {
      const { data } = await supabase.from('tickets').select('sale_id, trip_id');
      if (!data || data.length === 0) return [];

      const tripIds = [...new Set(data.map(t => t.trip_id))];
      const { data: trips } = await supabase.from('trips').select('id, event_id').in('id', tripIds);
      if (!trips) return [];

      const eventIds = [...new Set(trips.map(t => t.event_id))];

      const { data: boardingLocations } = await supabase
        .from('event_boarding_locations')
        .select('event_id, departure_date')
        .in('event_id', eventIds)
        .not('departure_date', 'is', null);

      const latestDepartureByEvent = new Map<string, string>();
      (boardingLocations || []).forEach((boarding) => {
        if (!boarding.departure_date) return;
        const currentLatestDate = latestDepartureByEvent.get(boarding.event_id);
        if (!currentLatestDate || boarding.departure_date > currentLatestDate) {
          latestDepartureByEvent.set(boarding.event_id, boarding.departure_date);
        }
      });

      const { data: publicEvents } = await supabase
        .from('events')
        .select('id, name, date, city, status, is_archived')
        .eq('status', 'a_venda')
        .eq('is_archived', false)
        .in('id', eventIds);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const availableEvents = (publicEvents || []).filter((event) => {
        const eventDeadline = getEventDeadlineDate(event, latestDepartureByEvent.get(event.id));
        return eventDeadline ? eventDeadline >= today : true;
      });

      return availableEvents.sort((a, b) => {
        const dateA = parseDateOnlyAsLocal(a.date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const dateB = parseDateOnlyAsLocal(b.date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const dateComparison = dateA - dateB;
        if (dateComparison !== 0) return dateComparison;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
    },
  });

  // Verificação on-demand de status de pagamento no Stripe
  const handleRefreshStatus = useCallback(async (saleId: string) => {
    setRefreshingSaleIds((prev) => new Set(prev).add(saleId));
    try {
      const { data, error } = await supabase.functions.invoke('verify-payment-status', {
        body: { sale_id: saleId },
      });
      if (error) throw error;

      const newStatus = data?.paymentStatus;
      if (newStatus === 'pago') {
        // Atualizar o status do ticket na lista
        setTickets((prev) =>
          prev.map((t) => (t.saleId === saleId ? { ...t, saleStatus: 'pago' as SaleStatus } : t))
        );
        toast({ title: 'Pagamento confirmado ✅' });
      } else if (newStatus === 'processando') {
        toast({ title: 'Pagamento ainda em processamento' });
      } else if (newStatus === 'expirado') {
        toast({ title: 'Sessão de pagamento expirada', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erro ao verificar status', variant: 'destructive' });
    } finally {
      setRefreshingSaleIds((prev) => {
        const next = new Set(prev);
        next.delete(saleId);
        return next;
      });
    }
  }, [toast]);

  // Verificação automática de vendas pendentes com checkout Stripe
  const autoVerifyPendingSales = useCallback(async (cards: TicketCardData[]) => {
    // Coleta saleIds únicos que estão pendentes e têm checkout session
    const pendingSaleIds = [...new Set(
      cards
        .filter((t) => t.saleStatus !== 'pago' && t.saleStatus !== 'cancelado' && (t.stripeCheckoutSessionId || t.asaasPaymentId) && t.saleId)
        .map((t) => t.saleId!)
    )].slice(0, 3); // Máximo 3 verificações por busca

    if (pendingSaleIds.length === 0) return;

    // Verificar em paralelo
    const results = await Promise.allSettled(
      pendingSaleIds.map(async (saleId) => {
        const { data } = await supabase.functions.invoke('verify-payment-status', {
          body: { sale_id: saleId },
        });
        return { saleId, status: data?.paymentStatus };
      })
    );

    // Atualizar tickets cujo status mudou para "pago"
    const paidSaleIds = new Set<string>();
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.status === 'pago') {
        paidSaleIds.add(result.value.saleId);
      }
    }

    if (paidSaleIds.size > 0) {
      setTickets((prev) =>
        prev.map((t) => (t.saleId && paidSaleIds.has(t.saleId) ? { ...t, saleStatus: 'pago' as SaleStatus } : t))
      );
      toast({ title: 'Status de pagamento atualizado ✅' });
    }
  }, [toast]);

  const handleSearch = async () => {
    const cpfDigits = cpf.replace(/\D/g, '');
    if (!selectedEventId || cpfDigits.length !== 11) {
      toast({ title: 'Preencha o evento e o CPF corretamente', variant: 'destructive' });
      return;
    }

    setSearching(true);
    setSearched(true);

    try {
      const { data, error } = await supabase.functions.invoke('ticket-lookup', {
        body: { event_id: selectedEventId, cpf: cpfDigits },
      });

      if (error) throw error;

      const ticketResults = data?.tickets || [];
      const commercialPartners = data?.commercialPartners || [];
      const eventSponsorsData = data?.eventSponsors || [];
      const eventFees: EventFeeInput[] = (data?.eventFees || []).map((f: any) => ({
        name: f.name,
        fee_type: f.fee_type as 'fixed' | 'percent',
        value: f.value,
        is_active: true,
      }));

      const passPlatformFeeToCustomer = Boolean(data?.passPlatformFeeToCustomer);
      const platformFeePercent = data?.platformFeePercent;

      if (platformFeePercent == null) {
        throw new Error('platform_fee_percent não disponível para emissão da passagem');
      }

      const cards: TicketCardData[] = ticketResults.map((t: any) => {
        const unitPrice = t.unitPrice ?? 0;
        const breakdown = calculateFees(unitPrice, eventFees, {
          passToCustomer: passPlatformFeeToCustomer,
          feePercent: Number(platformFeePercent),
        });

        return {
          ticketId: t.ticketId,
          qrCodeToken: t.qrCodeToken,
          passengerName: t.passengerName,
          passengerCpf: t.passengerCpf,
          seatLabel: t.seatLabel,
          boardingStatus: t.boardingStatus,
          eventName: t.eventName,
          eventDate: t.eventDate,
          eventCity: t.eventCity,
          boardingToleranceMinutes: t.boardingToleranceMinutes ?? null,
          boardingLocationName: t.boardingLocationName,
          boardingLocationAddress: t.boardingLocationAddress,
          boardingDepartureTime: t.boardingDepartureTime,
          boardingDepartureDate: t.boardingDepartureDate,
          saleStatus: (t.saleStatus || 'reservado') as SaleStatus,
          saleId: t.saleId || undefined,
          stripeCheckoutSessionId: t.stripeCheckoutSessionId || null,
          asaasPaymentId: t.asaasPaymentId || null,
          companyName: t.companyName,
          companyLogoUrl: t.companyLogoUrl,
          companyCity: t.companyCity,
          companyState: t.companyState,
          companyPrimaryColor: t.companyPrimaryColor,
          companyCnpj: t.companyCnpj,
          companyPhone: t.companyPhone,
          companyWhatsapp: t.companyWhatsapp,
          companyAddress: t.companyAddress,
          companySlogan: t.companySlogan,
          vehicleType: t.vehicleType || null,
          vehiclePlate: t.vehiclePlate || null,
          driverName: t.driverName || null,
          seatCategory: t.seatCategory || null,
          seatFloor: t.seatFloor || null,
          vehicleFloors: t.vehicleFloors || null,
          fees: breakdown.fees.length > 0 ? breakdown.fees : undefined,
          totalPaid: breakdown.fees.length > 0 ? breakdown.unitPriceWithFees : undefined,
          commercialPartners: commercialPartners.length > 0 ? commercialPartners : undefined,
          eventSponsors: eventSponsorsData.length > 0 ? eventSponsorsData : undefined,
        };
      });

      setTickets(cards);

      // Verificação automática de vendas pendentes (sem bloquear UI)
      autoVerifyPendingSales(cards);
    } catch {
      toast({ title: 'Erro ao buscar passagens', variant: 'destructive' });
    }

    setSearching(false);
  };

  const uniqueCompanies = new Set(tickets.map((ticket) => ticket.companyName).filter(Boolean));
  const hasMultipleCompanies = uniqueCompanies.size > 1;

  return (
    <PublicLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-4">
          <Button asChild variant="ghost" className="h-10 px-3 text-sm">
            <Link to="/eventos">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Comprar Passagens
            </Link>
          </Button>
        </div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-3">
            <Ticket className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Encontrar minha passagem</h1>
          <p className="text-muted-foreground">Informe o evento e o CPF utilizado na compra para localizar suas passagens.</p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Buscar Passagens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Evento da viagem</Label>
              {eventsLoading ? (
                <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando eventos...
                </div>
              ) : events && events.length === 0 ? (
                <div className="space-y-1 py-2 text-sm text-muted-foreground">
                  <p>Nenhum evento disponível para consulta no momento.</p>
                  <p>Se você precisa consultar um evento antigo, fale com o organizador.</p>
                </div>
              ) : (
                <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar evento" /></SelectTrigger>
                  <SelectContent>
                    {events?.map((e: any) => (
                      <SelectItem key={e.id} value={e.id} className="truncate">
                        {formatEventOptionLabel(e)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div>
              <Label>CPF do Passageiro</Label>
              <Input
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(e) => setCpf(formatCpfInput(e.target.value))}
                maxLength={14}
              />
              <p className="text-xs text-muted-foreground mt-1">Use o CPF do passageiro ou o CPF utilizado na compra.</p>
            </div>

            <Button
              className="w-full"
              onClick={handleSearch}
              disabled={searching || !selectedEventId || cpf.replace(/\D/g, '').length !== 11}
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
              Ver minhas passagens
            </Button>

            <p className="text-xs text-muted-foreground text-center pt-2">Dica: utilize o CPF informado no momento da compra da passagem.</p>
          </CardContent>
        </Card>

        {/* Results */}
        {searched && !searching && (
          <>
            {tickets.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Nenhuma passagem encontrada para este evento e CPF.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <h2 className="font-semibold text-lg">{tickets.length} passagem(ns) encontrada(s)</h2>
                {/* Agrupamento por passageiro com ida/volta sob demanda */}
                <PassengerTicketList
                  tickets={tickets}
                  onRefreshStatus={handleRefreshStatus}
                  isRefreshingSaleIds={refreshingSaleIds}
                />
              </div>
            )}
          </>
        )}
      </div>
    </PublicLayout>
  );
}
