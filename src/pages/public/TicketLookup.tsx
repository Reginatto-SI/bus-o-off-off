import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { TicketCard, TicketCardData } from '@/components/public/TicketCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, Ticket } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { SaleStatus } from '@/types/database';

function formatCpfInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export default function TicketLookup() {
  const { toast } = useToast();
  const [selectedEventId, setSelectedEventId] = useState('');
  const [cpf, setCpf] = useState('');
  const [tickets, setTickets] = useState<TicketCardData[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);

  // Fetch events (a_venda + encerrado via tickets public access)
  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['ticket-lookup-events'],
    queryFn: async () => {
      // Tickets have public SELECT, so we can get distinct events via tickets
      const { data } = await supabase
        .from('tickets')
        .select('sale_id, trip_id');
      
      if (!data || data.length === 0) return [];

      // Get unique trip_ids to find events
      const tripIds = [...new Set(data.map(t => t.trip_id))];
      const { data: trips } = await supabase
        .from('trips')
        .select('id, event_id')
        .in('id', tripIds);

      if (!trips) return [];

      const eventIds = [...new Set(trips.map(t => t.event_id))];
      
      // Try to get events directly (public policy allows a_venda)
      const { data: publicEvents } = await supabase
        .from('events')
        .select('id, name, date, city, status')
        .in('id', eventIds)
        .order('date', { ascending: false });

      return publicEvents || [];
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
      // Get tickets for this CPF
      const { data: ticketRows } = await supabase
        .from('tickets')
        .select('*, sale:sales(*, event:events(*), boarding_location:boarding_locations(*)), trip:trips(*)')
        .eq('passenger_cpf', cpfDigits);

      if (!ticketRows || ticketRows.length === 0) {
        setTickets([]);
        setSearching(false);
        return;
      }

      // Filter by event
      const filtered = ticketRows.filter((t: any) => t.trip?.event_id === selectedEventId);

      const cards: TicketCardData[] = filtered.map((t: any) => {
        // Find boarding departure time
        return {
          ticketId: t.id,
          qrCodeToken: t.qr_code_token,
          passengerName: t.passenger_name,
          passengerCpf: t.passenger_cpf,
          seatLabel: t.seat_label,
          boardingStatus: t.boarding_status,
          eventName: t.sale?.event?.name || '',
          eventDate: t.sale?.event?.date || '',
          eventCity: t.sale?.event?.city || '',
          boardingLocationName: t.sale?.boarding_location?.name || '',
          boardingLocationAddress: t.sale?.boarding_location?.address || '',
          boardingDepartureTime: null,
          saleStatus: (t.sale?.status || 'reservado') as SaleStatus,
        };
      });

      // Fetch boarding departure times
      for (const card of cards) {
        const ticket = filtered.find((t: any) => t.id === card.ticketId);
        if (ticket?.sale) {
          const { data: ebl } = await supabase
            .from('event_boarding_locations')
            .select('departure_time')
            .eq('event_id', ticket.trip?.event_id)
            .eq('trip_id', ticket.trip_id)
            .eq('boarding_location_id', ticket.sale.boarding_location_id)
            .maybeSingle();
          card.boardingDepartureTime = ebl?.departure_time ?? null;
        }
      }

      setTickets(cards);
    } catch {
      toast({ title: 'Erro ao buscar passagens', variant: 'destructive' });
    }

    setSearching(false);
  };

  return (
    <PublicLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Ticket className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Consultar Passagens</h1>
          <p className="text-muted-foreground">
            Informe o evento e seu CPF para visualizar suas passagens
          </p>
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
              ) : (
                <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o evento" />
                  </SelectTrigger>
                  <SelectContent>
                    {events?.map((e: any) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name} — {e.city}
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
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
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
                <h2 className="font-semibold text-lg">
                  {tickets.length} passagem(ns) encontrada(s)
                </h2>
                {tickets.map((t) => (
                  <TicketCard key={t.ticketId} ticket={t} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </PublicLayout>
  );
}
