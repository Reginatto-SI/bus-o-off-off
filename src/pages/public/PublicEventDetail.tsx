import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Event, Trip, EventBoardingLocation } from '@/types/database';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Loader2, Ticket, Bus, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { EventSummaryCard } from '@/components/public/EventSummaryCard';
import { VehicleCard } from '@/components/public/VehicleCard';
import { BoardingLocationCard } from '@/components/public/BoardingLocationCard';
import { QuantitySelector } from '@/components/public/QuantitySelector';
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';

export default function PublicEventDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sellerRef = searchParams.get('ref');

  const [event, setEvent] = useState<Event | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [locations, setLocations] = useState<EventBoardingLocation[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTrip, setSelectedTrip] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [availableSeatsMap, setAvailableSeatsMap] = useState<Record<string, number>>({});
  const [isInfoDrawerOpen, setIsInfoDrawerOpen] = useState(false);

  // Fetch event, trips, and locations
  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;

      const [eventRes, tripsRes, locationsRes] = await Promise.all([
        supabase.from('events').select('*').eq('id', id).eq('status', 'a_venda').single(),
        supabase.from('trips').select('*, vehicle:vehicles(*)').eq('event_id', id),
        supabase
          .from('event_boarding_locations')
          .select('*, boarding_location:boarding_locations(*)')
          .eq('event_id', id)
          .order('stop_order', { ascending: true }),
      ]);

      if (eventRes.data) setEvent(eventRes.data as Event);
      const allTrips = (tripsRes.data ?? []) as Trip[];
      const tripsData = allTrips.filter(t => t.trip_type === 'ida');
      setTrips(tripsData);
      if (locationsRes.data) setLocations(locationsRes.data as EventBoardingLocation[]);

      // Auto-select if only one trip
      if (tripsData.length === 1) {
        setSelectedTrip(tripsData[0].id);
      }

      // Fetch available seats for all trips
      if (tripsData.length > 0) {
        const results: Record<string, number> = {};
        await Promise.all(
          tripsData.map(async (trip) => {
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

  // Reset downstream selections when vehicle changes
  const handleSelectTrip = (tripId: string) => {
    setSelectedTrip(tripId);
    setSelectedLocation('');
    setQuantity(1);
  };

  // Filter locations by selected trip
  const filteredLocations = locations.filter((loc) => loc.trip_id === selectedTrip);

  // Auto-select if only one location
  useEffect(() => {
    if (filteredLocations.length === 1 && selectedTrip) {
      setSelectedLocation(filteredLocations[0].boarding_location_id);
    }
  }, [selectedTrip, filteredLocations.length]);

  const currentAvailableSeats = selectedTrip ? (availableSeatsMap[selectedTrip] ?? 0) : 0;
  const maxQuantity = event
    ? Math.min(
        currentAvailableSeats,
        event.max_tickets_per_purchase === 0 ? currentAvailableSeats : event.max_tickets_per_purchase
      )
    : 1;

  const handleContinue = () => {
    if (!selectedTrip || !selectedLocation || quantity < 1) {
      toast.error('Preencha todos os campos');
      return;
    }

    if (quantity > currentAvailableSeats) {
      toast.error(`Apenas ${currentAvailableSeats} lugares disponíveis`);
      return;
    }

    // Find departure_time from selected event boarding location
    const selectedEBL = filteredLocations.find(l => l.boarding_location_id === selectedLocation);
    const params = new URLSearchParams({
      trip: selectedTrip,
      location: selectedLocation,
      quantity: String(quantity),
      ...(selectedEBL?.departure_time && { time: selectedEBL.departure_time }),
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

  const hasTrips = trips.length > 0;

  return (
    <PublicLayout>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Back button */}
        <Button
          variant="ghost"
          className="px-0"
          onClick={() => navigate(`/eventos${sellerRef ? `?ref=${sellerRef}` : ''}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        {/* Event summary */}
        <EventSummaryCard event={event} compact />

        {/* Conteúdo cadastrado no Admin (aba Geral) para informar regras públicas do evento. */}
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
            {/* Vehicle selection */}
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Escolha o veículo disponível</h2>
              <div className="space-y-3">
                {trips.map((trip) => (
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

            {/* Boarding location selection */}
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

            {selectedTrip && filteredLocations.length === 0 && (
              <EmptyState
                icon={<Bus className="h-6 w-6 text-muted-foreground" />}
                title="Embarques não configurados"
                description="Os locais de embarque para este veículo ainda não foram definidos"
                className="py-6"
              />
            )}

            {/* Quantity selection */}
            {selectedTrip && selectedLocation && maxQuantity > 0 && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Quantas passagens?</h2>
                <QuantitySelector
                  value={quantity}
                  onChange={setQuantity}
                  min={1}
                  max={maxQuantity}
                />
              </section>
            )}

            {/* CTA */}
            <div className="pt-2">
              <Button
                className="w-full h-14 text-lg font-medium"
                disabled={!selectedTrip || !selectedLocation || quantity < 1}
                onClick={handleContinue}
              >
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
    </PublicLayout>
  );
}
