import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { calculateFees, type EventFeeInput } from '@/lib/feeCalculator';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { TicketCard, TicketCardData } from '@/components/public/TicketCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2, Search, Ticket } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { SaleStatus } from '@/types/database';

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
  const parsedDate = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return date;
  }

  return parsedDate.toLocaleDateString('pt-BR');
}

function formatCityState(city: string): string {
  // Comentário: em alguns cadastros o campo cidade já vem como "Cidade — UF".
  // Normalizamos para "Cidade/UF" para manter o padrão visual solicitado no dropdown.
  const cityStateMatch = city.match(/^(.*)\s[-–—]\s([A-Za-z]{2})$/);

  if (!cityStateMatch) {
    return city;
  }

  const [, cityName, state] = cityStateMatch;
  return `${cityName}/${state.toUpperCase()}`;
}

function formatEventOptionLabel(event: { name: string; city: string; date: string }): string {
  return `${event.name} — ${formatCityState(event.city)} • ${formatEventDate(event.date)}`;
}

function getEventDeadlineDate(event: TicketLookupEvent, departureDate?: string | null): Date | null {
  const eventDeadline = departureDate || event.date;
  if (!eventDeadline) return null;

  const parsedDate = new Date(`${eventDeadline}T23:59:59`);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

export default function TicketLookup() {
  const { toast } = useToast();
  const [selectedEventId, setSelectedEventId] = useState('');
  const [cpf, setCpf] = useState('');
  const [tickets, setTickets] = useState<TicketCardData[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);

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
        // Comentário: no público mostramos somente eventos à venda.
        .eq('status', 'a_venda')
        // Comentário: não mostrar eventos arquivados em listas públicas.
        .eq('is_archived', false)
        .in('id', eventIds);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const availableEvents = (publicEvents || []).filter((event) => {
        const eventDeadline = getEventDeadlineDate(event, latestDepartureByEvent.get(event.id));

        // Comentário: somente eventos dentro do prazo para consulta pública.
        return eventDeadline ? eventDeadline >= today : true;
      });

      // Comentário: ordenação principal por data crescente (evento mais próximo primeiro)
      // e desempate por nome para manter previsibilidade na listagem.
      return availableEvents.sort((a, b) => {
        const dateComparison = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (dateComparison !== 0) return dateComparison;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
    },
  });

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
      const eventFees: EventFeeInput[] = (data?.eventFees || []).map((f: any) => ({
        name: f.name,
        fee_type: f.fee_type as 'fixed' | 'percent',
        value: f.value,
        is_active: true,
      }));

      const cards: TicketCardData[] = ticketResults.map((t: any) => {
        const unitPrice = t.unitPrice ?? 0;
        const breakdown = calculateFees(unitPrice, eventFees);

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
          boardingLocationName: t.boardingLocationName,
          boardingLocationAddress: t.boardingLocationAddress,
          boardingDepartureTime: t.boardingDepartureTime,
          boardingDepartureDate: t.boardingDepartureDate,
          saleStatus: (t.saleStatus || 'reservado') as SaleStatus,
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
          fees: breakdown.fees.length > 0 ? breakdown.fees : undefined,
          totalPaid: breakdown.fees.length > 0 ? breakdown.unitPriceWithFees : undefined,
        };
      });

      setTickets(cards);
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
        {/* Comentário: ação de retorno destacada para o fluxo mobile entre consulta e compra. */}
        <div className="mb-4">
          <Button asChild variant="ghost" className="h-10 px-3 text-sm">
            <Link to="/eventos">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Comprar Passagens
            </Link>
          </Button>
        </div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Ticket className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Consultar Passagens</h1>
          <p className="text-muted-foreground">Informe o evento e seu CPF para visualizar suas passagens</p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Buscar Passagens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Evento</Label>
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
                  <SelectTrigger><SelectValue placeholder="Selecione o evento" /></SelectTrigger>
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
            </div>

            <Button
              className="w-full"
              onClick={handleSearch}
              disabled={searching || !selectedEventId || cpf.replace(/\D/g, '').length !== 11}
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
              Buscar Passagens
            </Button>
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
                {tickets.map((t, index) => {
                  const previousCompanyName = index > 0 ? tickets[index - 1].companyName : null;
                  const shouldShowCompanySeparator = hasMultipleCompanies && t.companyName !== previousCompanyName;

                  return (
                    <div key={t.ticketId} className="space-y-2">
                      {shouldShowCompanySeparator && (
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Empresa: {t.companyName}
                        </p>
                      )}
                      <TicketCard ticket={t} />
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </PublicLayout>
  );
}
