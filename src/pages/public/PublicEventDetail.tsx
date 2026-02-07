import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Event, Trip, EventBoardingLocation, VehicleType } from '@/types/database';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Calendar, MapPin, Clock, Loader2, Ticket, Bus, Users, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

// Adicionado Micro-ônibus como tipo suportado. Valor interno: micro_onibus
const vehicleTypeLabels: Record<VehicleType, string> = {
  onibus: 'Ônibus',
  micro_onibus: 'Micro-ônibus',
  van: 'Van',
};

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
  const [quantity, setQuantity] = useState('1');
  const [availableSeats, setAvailableSeats] = useState<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;

      const [eventRes, tripsRes, locationsRes] = await Promise.all([
        supabase.from('events').select('*').eq('id', id).eq('status', 'a_venda').single(),
        supabase.from('trips').select('*, vehicle:vehicles(*), driver:drivers!trips_driver_id_fkey(*), assistant_driver:drivers!trips_assistant_driver_id_fkey(*)').eq('event_id', id),
        supabase
          .from('event_boarding_locations')
          .select('*, boarding_location:boarding_locations(*)')
          .eq('event_id', id),
      ]);

      if (eventRes.data) setEvent(eventRes.data as Event);
      if (tripsRes.data) setTrips(tripsRes.data as Trip[]);
      if (locationsRes.data) setLocations(locationsRes.data as EventBoardingLocation[]);
      setLoading(false);
    };

    fetchData();
  }, [id]);

  useEffect(() => {
    const checkAvailability = async () => {
      if (!selectedTrip) {
        setAvailableSeats(null);
        return;
      }

      const { data } = await supabase.rpc('get_trip_available_capacity', {
        trip_uuid: selectedTrip,
      });

      setAvailableSeats(data);
    };

    checkAvailability();
  }, [selectedTrip]);

  const handleContinue = () => {
    if (!selectedTrip || !selectedLocation || !quantity) {
      toast.error('Preencha todos os campos');
      return;
    }

    const qty = parseInt(quantity);
    if (availableSeats !== null && qty > availableSeats) {
      toast.error(`Apenas ${availableSeats} lugares disponíveis`);
      return;
    }

    const params = new URLSearchParams({
      trip: selectedTrip,
      location: selectedLocation,
      quantity: quantity,
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

  const selectedTripData = trips.find((t) => t.id === selectedTrip);

  return (
    <PublicLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => navigate(`/eventos${sellerRef ? `?ref=${sellerRef}` : ''}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        <Card className="mb-6">
          <div className="h-2 bg-gradient-to-r from-primary to-primary/70" />
          <CardHeader>
            <CardTitle className="text-2xl">{event.name}</CardTitle>
            <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {format(new Date(event.date), "EEEE, dd 'de' MMMM 'de' yyyy", {
                  locale: ptBR,
                })}
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {event.city}
              </div>
            </div>
          </CardHeader>
          {event.description && (
            <CardContent>
              <p className="text-muted-foreground">{event.description}</p>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Selecione sua Passagem</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {trips.length === 0 || locations.length === 0 ? (
              <EmptyState
                icon={<Bus className="h-6 w-6 text-muted-foreground" />}
                title="Viagens não disponíveis"
                description="As viagens para este evento ainda não foram configuradas"
                className="py-8"
              />
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Horário da Viagem</Label>
                  <Select value={selectedTrip} onValueChange={setSelectedTrip}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o horário" />
                    </SelectTrigger>
                    <SelectContent>
                      {trips.map((trip) => (
                        <SelectItem key={trip.id} value={trip.id}>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            {trip.departure_time ? trip.departure_time.slice(0, 5) : 'A definir'} -{' '}
                            {vehicleTypeLabels[trip.vehicle?.type ?? 'van']}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedTripData && availableSeats !== null && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {availableSeats} lugares disponíveis
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Local de Embarque</Label>
                  <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o local" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.boarding_location_id}>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            {loc.boarding_location?.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantidade de Passagens</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="1"
                    max={availableSeats || 10}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full sm:w-32"
                  />
                </div>

                <Button
                  onClick={handleContinue}
                  className="w-full"
                  size="lg"
                  disabled={!selectedTrip || !selectedLocation}
                >
                  Continuar
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}
