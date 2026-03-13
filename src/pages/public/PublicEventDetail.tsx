import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Event, Trip, EventBoardingLocation, EventSponsor } from '@/types/database';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Ticket, Bus, ArrowLeft, MessageCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { EventSummaryCard } from '@/components/public/EventSummaryCard';
import { VehicleCard } from '@/components/public/VehicleCard';
import { BoardingLocationCard } from '@/components/public/BoardingLocationCard';
import { QuantitySelector } from '@/components/public/QuantitySelector';
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { buildWhatsappWaMeLink } from '@/lib/whatsapp';
import { parseDateOnlyAsLocal } from '@/lib/date';
import { normalizeWhatsappForWaMe } from '@/lib/whatsapp';

type TransportPolicy = Event['transport_policy'];

const isGroupedPolicy = (policy?: TransportPolicy) =>
  policy === 'ida_obrigatoria_volta_opcional' || policy === 'ida_volta_obrigatorio';

export default function PublicEventDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sellerRef = searchParams.get('ref');

  const [event, setEvent] = useState<Event | null>(null);
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [locations, setLocations] = useState<EventBoardingLocation[]>([]);
  const [eventSponsors, setEventSponsors] = useState<EventSponsor[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTrip, setSelectedTrip] = useState('');
  const [selectedReturnTrip, setSelectedReturnTrip] = useState<string | null>(null);
  const [includeReturn, setIncludeReturn] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [availableSeatsMap, setAvailableSeatsMap] = useState<Record<string, number>>({});
  const [isInfoDrawerOpen, setIsInfoDrawerOpen] = useState(false);
  const [isDescriptionDialogOpen, setIsDescriptionDialogOpen] = useState(false);
  const [supportWhatsapp, setSupportWhatsapp] = useState<string | null>(null);

  const transportPolicy: TransportPolicy = event?.transport_policy ?? 'trecho_independente';
  const groupedPolicy = isGroupedPolicy(transportPolicy);
  const mandatoryRoundTrip = transportPolicy === 'ida_volta_obrigatorio';

  const outboundTrips = useMemo(
    () => (groupedPolicy ? allTrips.filter((trip) => trip.trip_type === 'ida') : allTrips),
    [groupedPolicy, allTrips]
  );
  const eventDescription = event?.description?.trim() ?? '';
  const hasEventDescription = eventDescription.length > 0;

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;

      const [eventRes, tripsRes, locationsRes, sponsorsRes] = await Promise.all([
        supabase.from('events').select('*').eq('id', id).eq('status', 'a_venda').single(),
        supabase.from('trips').select('*, vehicle:vehicles(*)').eq('event_id', id),
        supabase
          .from('event_boarding_locations')
          .select('*, boarding_location:boarding_locations(*)')
          .eq('event_id', id)
          .order('stop_order', { ascending: true }),
        supabase
          .from('event_sponsors')
          .select('*, sponsor:sponsors(id, name, banner_url, link_type, site_url, whatsapp_phone, whatsapp_message)')
          .eq('event_id', id)
          .eq('show_on_event_page', true)
          .order('display_order', { ascending: true }),
      ]);

      if (eventRes.data) {
        const eventData = eventRes.data as Event & { whatsapp?: string | null };
        setEvent(eventData as Event);

        // Prioridade de suporte: WhatsApp no evento (quando existir) e fallback para WhatsApp da empresa.
        const eventWhatsapp = eventData.whatsapp?.trim() || null;
        if (eventWhatsapp) {
          setSupportWhatsapp(eventWhatsapp);
        } else {
          const { data: companyData } = await supabase
            .from('companies')
            .select('whatsapp')
            .eq('id', eventData.company_id)
            .single();
          setSupportWhatsapp(companyData?.whatsapp ?? null);
        }
      } else {
        setSupportWhatsapp(null);
      }

      const fetchedTrips = (tripsRes.data ?? []) as Trip[];
      setAllTrips(fetchedTrips);
      if (locationsRes.data) setLocations(locationsRes.data as EventBoardingLocation[]);
      setEventSponsors((sponsorsRes.data ?? []) as unknown as EventSponsor[]);

      const initialPolicy = (eventRes.data as Event | null)?.transport_policy ?? 'trecho_independente';
      const grouped = isGroupedPolicy(initialPolicy);
      const initialTrips = grouped ? fetchedTrips.filter((trip) => trip.trip_type === 'ida') : fetchedTrips;

      if (initialTrips.length === 1) {
        const outboundTrip = initialTrips[0];
        setSelectedTrip(outboundTrip.id);

        if (grouped) {
          const paired = outboundTrip.paired_trip_id
            ? fetchedTrips.find((trip) => trip.id === outboundTrip.paired_trip_id)
            : fetchedTrips.find((trip) => trip.trip_type === 'volta');
          setSelectedReturnTrip(paired?.id ?? null);
          setIncludeReturn(initialPolicy === 'ida_volta_obrigatorio' ? true : Boolean(paired));
        }
      }

      if (fetchedTrips.length > 0) {
        const results: Record<string, number> = {};
        await Promise.all(
          fetchedTrips.map(async (trip) => {
            const { data } = await supabase.rpc('get_trip_available_capacity', {
              trip_uuid: trip.id,
            });
            results[trip.id] = data ?? 0;
          })
        );
        setAvailableSeatsMap(results);
      }

      setLoading(false);
    };

    fetchData();
  }, [id]);

  const handleSelectTrip = (tripId: string) => {
    setSelectedTrip(tripId);
    setSelectedLocation('');
    setQuantity(1);

    if (!groupedPolicy) {
      setSelectedReturnTrip(null);
      setIncludeReturn(false);
      return;
    }

    const outboundTrip = allTrips.find((trip) => trip.id === tripId);
    const paired = outboundTrip?.paired_trip_id
      ? allTrips.find((trip) => trip.id === outboundTrip.paired_trip_id)
      : allTrips.find((trip) => trip.trip_type === 'volta');

    setSelectedReturnTrip(paired?.id ?? null);
    // Política padrão oficial: ida sempre obrigatória e volta opcional como complemento explícito para o cliente.
    setIncludeReturn(mandatoryRoundTrip ? true : Boolean(paired));
  };

  const filteredLocations = locations.filter((loc) => loc.trip_id === selectedTrip);

  const singleFilteredLocationId =
    filteredLocations.length === 1 ? filteredLocations[0].boarding_location_id : null;

  useEffect(() => {
    if (singleFilteredLocationId && selectedTrip) {
      setSelectedLocation(singleFilteredLocationId);
    }
  }, [selectedTrip, singleFilteredLocationId]);

  const currentAvailableSeats = selectedTrip ? (availableSeatsMap[selectedTrip] ?? 0) : 0;
  const returnAvailableSeats = selectedReturnTrip ? (availableSeatsMap[selectedReturnTrip] ?? 0) : 0;

  // Regra de estoque por política:
  // - trecho independente: valida trecho selecionado.
  // - ida obrigatória + volta opcional: valida ida e, se marcada, também volta.
  // - pacote obrigatório: limita pela menor disponibilidade entre ida e volta.
  const policyAvailableSeats = mandatoryRoundTrip
    ? Math.min(currentAvailableSeats, returnAvailableSeats)
    : includeReturn && selectedReturnTrip
    ? Math.min(currentAvailableSeats, returnAvailableSeats)
    : currentAvailableSeats;

  const maxQuantity = event
    ? Math.min(
        policyAvailableSeats,
        event.max_tickets_per_purchase === 0 ? policyAvailableSeats : event.max_tickets_per_purchase
      )
    : 1;


  const whatsappHelpLink = event
    ? buildWhatsappWaMeLink({
        phone: supportWhatsapp,
        message: `Olá! Estou com dúvida sobre o evento ${event.name} em ${(() => {
          const localDate = parseDateOnlyAsLocal(event.date);
          return localDate
            ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(localDate)
            : event.date;
        })()}. Pode me ajudar?`,
      })
    : null;

  const handleContinue = () => {
    if (!selectedTrip || !selectedLocation || quantity < 1) {
      toast.error('Preencha todos os campos');
      return;
    }

    if (mandatoryRoundTrip && !selectedReturnTrip) {
      toast.error('Este evento exige ida e volta, mas a volta não está configurada.');
      return;
    }

    if (quantity > policyAvailableSeats) {
      toast.error(`Apenas ${policyAvailableSeats} lugares disponíveis`);
      return;
    }

    const selectedEBL = filteredLocations.find((l) => l.boarding_location_id === selectedLocation);
    const params = new URLSearchParams({
      trip: selectedTrip,
      location: selectedLocation,
      quantity: String(quantity),
      ...(selectedEBL?.departure_time && { time: selectedEBL.departure_time }),
      ...(includeReturn && selectedReturnTrip && { return_trip: selectedReturnTrip }),
      ...(sellerRef && { ref: sellerRef }),
    });

    navigate(`/eventos/${id}/checkout?${params.toString()}`);
  };

  if (loading) {
    return (
      <PublicLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PublicLayout>
    );
  }

  if (!event) {
    return (
      <PublicLayout>
        <div className="max-w-lg mx-auto px-4 py-8">
          <EmptyState
            icon={<Ticket className="h-8 w-8 text-muted-foreground" />}
            title="Evento não encontrado"
            description="Este evento não existe ou não está mais disponível"
            action={
              <Button onClick={() => navigate('/eventos')}>Ver outros eventos</Button>
            }
          />
        </div>
      </PublicLayout>
    );
  }

  const hasTrips = outboundTrips.length > 0;

  return (
    <PublicLayout>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <Button variant="ghost" className="px-0" onClick={() => navigate(`/eventos${sellerRef ? `?ref=${sellerRef}` : ''}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        <EventSummaryCard event={event} compact />

        {/* Exibe a descrição pública do evento em card compacto somente quando houver conteúdo preenchido. */}
        {hasEventDescription && (
          <section className="rounded-lg border bg-card p-4 space-y-3">
            <h2 className="text-base font-semibold">Sobre o evento</h2>
            {/* Preview truncado em 3 linhas para manter o fluxo de compra compacto. */}
            <p className="text-sm text-muted-foreground whitespace-pre-line line-clamp-3">{eventDescription}</p>
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-sm"
              onClick={() => setIsDescriptionDialogOpen(true)}
            >
              Ler mais
            </Button>
          </section>
        )}

        {event.public_info && (
          <button
            type="button"
            onClick={() => setIsInfoDrawerOpen(true)}
            className="-mt-2 text-sm text-muted-foreground underline underline-offset-4"
          >
            Informações e regras
          </button>
        )}

        {!hasTrips ? (
          <EmptyState
            icon={<Bus className="h-6 w-6 text-muted-foreground" />}
            title="Transporte não disponível"
            description="Os transportes para este evento ainda não foram configurados"
            className="py-8"
          />
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">{groupedPolicy ? 'Transporte do Evento' : 'Escolha o veículo disponível'}</h2>
              {!groupedPolicy && (
                <p className="text-xs text-muted-foreground">Vagas controladas por trecho.</p>
              )}
              <div className="space-y-3">
                {outboundTrips.map((trip) => (
                  <VehicleCard
                    key={trip.id}
                    trip={trip}
                    availableSeats={availableSeatsMap[trip.id] ?? null}
                    isSelected={selectedTrip === trip.id}
                    onSelect={() => handleSelectTrip(trip.id)}
                  />
                ))}
              </div>
            </section>

            {groupedPolicy && selectedTrip && selectedReturnTrip && (
              <section className="rounded-lg border bg-muted/20 p-4 space-y-3">
                <p className="text-sm font-medium">Ida selecionada com sucesso.</p>
                <div className="flex items-center justify-between">
                  <label htmlFor="include-return" className="text-sm cursor-pointer">
                    {mandatoryRoundTrip ? 'Volta obrigatória neste evento' : 'Adicionar volta (opcional)'}
                  </label>
                  <Checkbox
                    id="include-return"
                    checked={includeReturn || mandatoryRoundTrip}
                    disabled={mandatoryRoundTrip}
                    onCheckedChange={(checked) => setIncludeReturn(Boolean(checked))}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Vagas Ida: {currentAvailableSeats} • Vagas Volta: {returnAvailableSeats}
                </p>
              </section>
            )}

            {selectedTrip && filteredLocations.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Escolha onde e quando embarcar</h2>
                <div className="space-y-3">
                  {filteredLocations.map((loc) => (
                    <BoardingLocationCard
                      key={loc.id}
                      location={loc}
                      eventDate={event?.date || ''}
                      isSelected={selectedLocation === loc.boarding_location_id}
                      onSelect={() => setSelectedLocation(loc.boarding_location_id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {selectedTrip && selectedLocation && maxQuantity > 0 && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Quantas passagens?</h2>
                <QuantitySelector value={quantity} onChange={setQuantity} min={1} max={maxQuantity} />
              </section>
            )}

            {/* Patrocinadores do evento */}
            {eventSponsors.length > 0 && (
              <section className="space-y-2 pt-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Patrocinadores</h3>
                <div className="flex flex-wrap justify-center gap-3">
                  {eventSponsors.map((es) => {
                    const sponsor = es.sponsor;
                    if (!sponsor) return null;
                    const link = sponsor.link_type === 'whatsapp' && sponsor.whatsapp_phone
                      ? `https://wa.me/${sponsor.whatsapp_phone.replace(/\D/g, '')}${sponsor.whatsapp_message ? `&text=${encodeURIComponent(sponsor.whatsapp_message)}` : ''}`
                      : sponsor.link_type === 'site' && sponsor.site_url ? sponsor.site_url : null;
                    const content = (
                      <div className="flex flex-col items-center gap-1 rounded-lg border bg-card p-2 w-24 transition-colors hover:bg-muted/50">
                        {sponsor.banner_url ? (
                          <img src={sponsor.banner_url} alt={sponsor.name} className="h-8 w-full object-contain" />
                        ) : (
                          <span className="text-[10px] font-medium text-muted-foreground text-center line-clamp-2">{sponsor.name}</span>
                        )}
                      </div>
                    );
                    return link ? (
                      <a key={es.id} href={link} target="_blank" rel="noopener noreferrer">{content}</a>
                    ) : (
                      <div key={es.id}>{content}</div>
                    );
                  })}
                </div>
              </section>
            )}

            <div className="pt-2 space-y-2">
              {whatsappHelpLink && (
                <div className="flex justify-end">
                  <a
                    href={whatsappHelpLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Ajuda no WhatsApp
                  </a>
                </div>
              )}
              <Button className="w-full h-14 text-lg font-medium" disabled={!selectedTrip || !selectedLocation || quantity < 1} onClick={handleContinue}>
                Escolher assentos
              </Button>
            </div>
          </>
        )}
      </div>

      <Drawer open={isInfoDrawerOpen} onOpenChange={setIsInfoDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Informações do Evento</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-2">
            <p className="whitespace-pre-wrap text-sm text-foreground">{event.public_info}</p>
          </div>
          <DrawerFooter>
            <Button type="button" onClick={() => setIsInfoDrawerOpen(false)}>
              Entendi
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Modal reutilizando o padrão do projeto para leitura completa da descrição do evento. */}
      <Dialog open={isDescriptionDialogOpen} onOpenChange={setIsDescriptionDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sobre o evento</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <p className="whitespace-pre-wrap text-sm text-foreground">{eventDescription}</p>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setIsDescriptionDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PublicLayout>
  );
}
