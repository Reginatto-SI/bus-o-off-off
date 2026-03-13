import { useState, useCallback, useMemo } from 'react';
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
import { ArrowLeft, Loader2, Search, Ticket } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { SaleStatus } from '@/types/database';
import { formatDateOnlyBR } from '@/lib/date';

type TicketLookupResponseTicket = {
  ticketId: string;
  qrCodeToken: string;
  passengerName: string;
  passengerCpf: string;
  seatLabel: string;
  boardingStatus: string;
  eventName: string;
  eventDate: string;
  eventCity: string;
  eventId?: string | null;
  boardingToleranceMinutes?: number | null;
  boardingLocationName: string;
  boardingLocationAddress: string;
  boardingDepartureTime: string | null;
  boardingDepartureDate: string | null;
  saleStatus?: SaleStatus;
  saleId?: string;
  stripeCheckoutSessionId?: string | null;
  asaasPaymentId?: string | null;
  unitPrice?: number;
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
  seatCategory?: string | null;
  seatFloor?: number | null;
  vehicleFloors?: number | null;
  passPlatformFeeToCustomer?: boolean;
  platformFeePercent?: number | null;
};

function formatCpfInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatCityState(city: string): string {
  const cityStateMatch = city.match(/^(.*)\s[-–—]\s([A-Za-z]{2})$/);
  if (!cityStateMatch) return city;
  const [, cityName, state] = cityStateMatch;
  return `${cityName}/${state.toUpperCase()}`;
}

export default function TicketLookup() {
  const { toast } = useToast();
  const [cpf, setCpf] = useState('');
  const [tickets, setTickets] = useState<TicketCardData[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [refreshingSaleIds, setRefreshingSaleIds] = useState<Set<string>>(new Set());

  const handleRefreshStatus = useCallback(async (saleId: string) => {
    setRefreshingSaleIds((prev) => new Set(prev).add(saleId));
    try {
      const { data, error } = await supabase.functions.invoke('verify-payment-status', {
        body: { sale_id: saleId },
      });
      if (error) throw error;

      const newStatus = data?.paymentStatus;
      if (newStatus === 'pago') {
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

  const autoVerifyPendingSales = useCallback(async (cards: TicketCardData[]) => {
    const pendingSaleIds = [...new Set(
      cards
        .filter((t) => t.saleStatus !== 'pago' && t.saleStatus !== 'cancelado' && (t.stripeCheckoutSessionId || t.asaasPaymentId) && t.saleId)
        .map((t) => t.saleId!)
    )].slice(0, 3);

    if (pendingSaleIds.length === 0) return;

    const results = await Promise.allSettled(
      pendingSaleIds.map(async (saleId) => {
        const { data } = await supabase.functions.invoke('verify-payment-status', {
          body: { sale_id: saleId },
        });
        return { saleId, status: data?.paymentStatus };
      })
    );

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
    if (cpfDigits.length !== 11) {
      toast({ title: 'Preencha o CPF corretamente', variant: 'destructive' });
      return;
    }

    setSearching(true);
    setSearched(true);

    try {
      // Novo fluxo público: busca centralizada apenas por CPF, sem depender de seleção prévia de evento.
      const { data, error } = await supabase.functions.invoke('ticket-lookup', {
        body: { cpf: cpfDigits },
      });

      if (error) throw error;

      const ticketResults: TicketLookupResponseTicket[] = data?.tickets || [];
      const eventFeesByEvent = (data?.eventFeesByEvent || {}) as Record<string, EventFeeInput[]>;

      const cards: TicketCardData[] = ticketResults.map((ticket) => {
        const unitPrice = ticket.unitPrice ?? 0;
        const eventFees = ticket.eventId ? (eventFeesByEvent[ticket.eventId] || []) : [];

        const hasFeeConfig = ticket.platformFeePercent != null;
        const breakdown = hasFeeConfig
          ? calculateFees(unitPrice, eventFees, {
              passToCustomer: Boolean(ticket.passPlatformFeeToCustomer),
              feePercent: Number(ticket.platformFeePercent),
            })
          : null;

        return {
          ticketId: ticket.ticketId,
          qrCodeToken: ticket.qrCodeToken,
          passengerName: ticket.passengerName,
          passengerCpf: ticket.passengerCpf,
          seatLabel: ticket.seatLabel,
          boardingStatus: ticket.boardingStatus,
          eventName: ticket.eventName,
          eventDate: ticket.eventDate,
          eventCity: ticket.eventCity,
          boardingToleranceMinutes: ticket.boardingToleranceMinutes ?? null,
          boardingLocationName: ticket.boardingLocationName,
          boardingLocationAddress: ticket.boardingLocationAddress,
          boardingDepartureTime: ticket.boardingDepartureTime,
          boardingDepartureDate: ticket.boardingDepartureDate,
          saleStatus: (ticket.saleStatus || 'reservado') as SaleStatus,
          saleId: ticket.saleId || undefined,
          stripeCheckoutSessionId: ticket.stripeCheckoutSessionId || null,
          asaasPaymentId: ticket.asaasPaymentId || null,
          companyName: ticket.companyName,
          companyLogoUrl: ticket.companyLogoUrl,
          companyCity: ticket.companyCity,
          companyState: ticket.companyState,
          companyPrimaryColor: ticket.companyPrimaryColor,
          companyCnpj: ticket.companyCnpj,
          companyPhone: ticket.companyPhone,
          companyWhatsapp: ticket.companyWhatsapp,
          companyAddress: ticket.companyAddress,
          companySlogan: ticket.companySlogan,
          vehicleType: ticket.vehicleType || null,
          vehiclePlate: ticket.vehiclePlate || null,
          driverName: ticket.driverName || null,
          seatCategory: ticket.seatCategory || null,
          seatFloor: ticket.seatFloor || null,
          vehicleFloors: ticket.vehicleFloors || null,
          fees: breakdown && breakdown.fees.length > 0 ? breakdown.fees : undefined,
          totalPaid: breakdown && breakdown.fees.length > 0 ? breakdown.unitPriceWithFees : undefined,
        };
      });

      setTickets(cards);
      autoVerifyPendingSales(cards);
    } catch {
      toast({ title: 'Erro ao buscar passagens', variant: 'destructive' });
    }

    setSearching(false);
  };

  // Organização visual do resultado: agrupar por evento melhora leitura quando CPF tem múltiplas compras.
  const ticketsByEvent = useMemo(() => {
    const grouped = new Map<string, { title: string; subtitle: string; tickets: TicketCardData[] }>();

    tickets.forEach((ticket) => {
      const key = `${ticket.eventName}-${ticket.eventDate}-${ticket.eventCity}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          title: ticket.eventName,
          subtitle: `${formatDateOnlyBR(ticket.eventDate)} • ${formatCityState(ticket.eventCity)}`,
          tickets: [],
        });
      }
      grouped.get(key)!.tickets.push(ticket);
    });

    return Array.from(grouped.values());
  }, [tickets]);

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
          <h1 className="text-2xl font-bold text-foreground mb-2">Encontrar minhas passagens</h1>
          <p className="text-muted-foreground">Informe o CPF utilizado na compra ou do passageiro para localizar suas passagens.</p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Etapa 1: Buscar por CPF</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
              disabled={searching || cpf.replace(/\D/g, '').length !== 11}
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
              Buscar minhas passagens
            </Button>

            <p className="text-xs text-muted-foreground text-center pt-2">Dica: o CPF deve ser o mesmo informado no momento da compra da passagem.</p>
          </CardContent>
        </Card>

        {searched && !searching && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-lg">Etapa 2: Resultado da busca</h2>
              <Button variant="outline" size="sm" onClick={() => { setSearched(false); setTickets([]); }}>
                Refazer busca
              </Button>
            </div>

            {tickets.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-lg bg-card">
                <p className="font-medium">Nenhuma passagem encontrada para este CPF.</p>
                <p className="text-sm mt-1">Verifique se o CPF informado é o mesmo usado na compra.</p>
              </div>
            ) : (
              <div className="space-y-6">
                <p className="text-sm text-muted-foreground">{tickets.length} passagem(ns) encontrada(s).</p>
                {ticketsByEvent.map((group) => (
                  <div key={`${group.title}-${group.subtitle}`} className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-base">{group.title}</h3>
                      <p className="text-sm text-muted-foreground">{group.subtitle}</p>
                    </div>
                    <PassengerTicketList
                      tickets={group.tickets}
                      onRefreshStatus={handleRefreshStatus}
                      isRefreshingSaleIds={refreshingSaleIds}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
