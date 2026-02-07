import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Event, Trip, Vehicle, Driver, BoardingLocation, EventBoardingLocation, Sale } from '@/types/database';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Bus,
  Plus,
  Loader2,
  Clock,
  Users,
  Trash2,
  ShoppingCart,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';

// Adicionado Micro-ônibus como tipo suportado. Valor interno: micro_onibus
const vehicleTypeLabels: Record<Vehicle['type'], string> = {
  onibus: 'Ônibus',
  micro_onibus: 'Micro-ônibus',
  van: 'Van',
};

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canViewFinancials, activeCompanyId } = useAuth();
  const [event, setEvent] = useState<Event | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [eventLocations, setEventLocations] = useState<EventBoardingLocation[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [locations, setLocations] = useState<BoardingLocation[]>([]);
  const [loading, setLoading] = useState(true);

  // Trip dialog
  const [tripDialogOpen, setTripDialogOpen] = useState(false);
  const [tripForm, setTripForm] = useState({
    vehicle_id: '',
    driver_id: '',
    departure_time: '',
    capacity: '',
  });
  const [savingTrip, setSavingTrip] = useState(false);

  // Location dialog
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);

  const fetchData = async () => {
    if (!id) return;

    const [eventRes, tripsRes, locationsRes, salesRes, vehiclesRes, driversRes, allLocationsRes] =
      await Promise.all([
        supabase.from('events').select('*').eq('id', id).single(),
        supabase
          .from('trips')
          .select('*, vehicle:vehicles(*), driver:drivers!trips_driver_id_fkey(*), assistant_driver:drivers!trips_assistant_driver_id_fkey(*)')
          .eq('event_id', id),
        supabase
          .from('event_boarding_locations')
          .select('*, boarding_location:boarding_locations(*)')
          .eq('event_id', id),
        supabase
          .from('sales')
          .select('*, event:events(*), boarding_location:boarding_locations(*)')
          .eq('event_id', id)
          .order('created_at', { ascending: false }),
        supabase.from('vehicles').select('*'),
        supabase.from('drivers').select('*'),
        supabase.from('boarding_locations').select('*'),
      ]);

    if (eventRes.data) setEvent(eventRes.data as Event);
    if (tripsRes.data) setTrips(tripsRes.data as Trip[]);
    if (locationsRes.data) setEventLocations(locationsRes.data as EventBoardingLocation[]);
    if (salesRes.data) setSales(salesRes.data as Sale[]);
    if (vehiclesRes.data) setVehicles(vehiclesRes.data as Vehicle[]);
    if (driversRes.data) setDrivers(driversRes.data as Driver[]);
    if (allLocationsRes.data) setLocations(allLocationsRes.data as BoardingLocation[]);

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const handleAddTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTrip(true);

    const vehicle = vehicles.find((v) => v.id === tripForm.vehicle_id);

    const { error } = await supabase.from('trips').insert([
      {
        event_id: id,
        vehicle_id: tripForm.vehicle_id,
        driver_id: tripForm.driver_id,
        departure_time: tripForm.departure_time,
        capacity: tripForm.capacity ? parseInt(tripForm.capacity) : vehicle?.capacity || 0,
        company_id: activeCompanyId!,
      },
    ]);

    if (error) {
      toast.error('Erro ao adicionar viagem');
    } else {
      toast.success('Viagem adicionada');
      setTripDialogOpen(false);
      setTripForm({ vehicle_id: '', driver_id: '', departure_time: '', capacity: '' });
      fetchData();
    }
    setSavingTrip(false);
  };

  const handleDeleteTrip = async (tripId: string) => {
    const { error } = await supabase.from('trips').delete().eq('id', tripId);
    if (error) {
      toast.error('Erro ao remover viagem');
    } else {
      toast.success('Viagem removida');
      fetchData();
    }
  };

  const handleAddLocation = async () => {
    if (!selectedLocationId) return;
    setSavingLocation(true);

    const { error } = await supabase.from('event_boarding_locations').insert([
      {
        event_id: id,
        boarding_location_id: selectedLocationId,
        company_id: activeCompanyId!,
      },
    ]);

    if (error) {
      toast.error('Erro ao adicionar local');
    } else {
      toast.success('Local adicionado');
      setLocationDialogOpen(false);
      setSelectedLocationId('');
      fetchData();
    }
    setSavingLocation(false);
  };

  const handleRemoveLocation = async (locationId: string) => {
    const { error } = await supabase
      .from('event_boarding_locations')
      .delete()
      .eq('id', locationId);
    if (error) {
      toast.error('Erro ao remover local');
    } else {
      toast.success('Local removido');
      fetchData();
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  if (!event) {
    return (
      <AdminLayout>
        <div className="page-container">
          <EmptyState
            icon={<Calendar className="h-8 w-8 text-muted-foreground" />}
            title="Evento não encontrado"
            description="O evento que você está procurando não existe"
            action={
              <Button onClick={() => navigate('/admin/eventos')}>Voltar aos Eventos</Button>
            }
          />
        </div>
      </AdminLayout>
    );
  }

  const availableLocations = locations.filter(
    (loc) => !eventLocations.some((el) => el.boarding_location_id === loc.id)
  );

  return (
    <AdminLayout>
      <div className="page-container">
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => navigate('/admin/eventos')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-xl">{event.name}</CardTitle>
                <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {format(new Date(event.date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {event.city}
                  </div>
                </div>
              </div>
              <StatusBadge status={event.status} />
            </div>
          </CardHeader>
          {event.description && (
            <CardContent>
              <p className="text-muted-foreground">{event.description}</p>
            </CardContent>
          )}
        </Card>

        <Tabs defaultValue="trips" className="space-y-4">
          <TabsList>
            <TabsTrigger value="trips">Viagens</TabsTrigger>
            <TabsTrigger value="locations">Locais de Embarque</TabsTrigger>
            <TabsTrigger value="sales">Vendas</TabsTrigger>
          </TabsList>

          <TabsContent value="trips">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Viagens</CardTitle>
                <Dialog open={tripDialogOpen} onOpenChange={setTripDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Nova Viagem</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleAddTrip} className="space-y-4">
                      <div className="space-y-2">
                        <Label>Veículo</Label>
                        <Select
                          value={tripForm.vehicle_id}
                          onValueChange={(value) =>
                            setTripForm({ ...tripForm, vehicle_id: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um veículo" />
                          </SelectTrigger>
                          <SelectContent>
                            {vehicles.map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                {vehicleTypeLabels[v.type] ?? v.type} - {v.plate} ({v.capacity} lugares)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Motorista</Label>
                        <Select
                          value={tripForm.driver_id}
                          onValueChange={(value) =>
                            setTripForm({ ...tripForm, driver_id: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um motorista" />
                          </SelectTrigger>
                          <SelectContent>
                            {drivers.map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Horário</Label>
                          <Input
                            type="time"
                            value={tripForm.departure_time}
                            onChange={(e) =>
                              setTripForm({ ...tripForm, departure_time: e.target.value })
                            }
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Capacidade</Label>
                          <Input
                            type="number"
                            placeholder="Padrão do veículo"
                            value={tripForm.capacity}
                            onChange={(e) =>
                              setTripForm({ ...tripForm, capacity: e.target.value })
                            }
                          />
                        </div>
                      </div>
                      <Button type="submit" className="w-full" disabled={savingTrip}>
                        {savingTrip ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Adicionar Viagem'
                        )}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {trips.length === 0 ? (
                  <EmptyState
                    icon={<Bus className="h-6 w-6 text-muted-foreground" />}
                    title="Nenhuma viagem cadastrada"
                    description="Adicione viagens para este evento"
                    className="py-8"
                  />
                ) : (
                  <div className="space-y-3">
                    {trips.map((trip) => (
                      <div
                        key={trip.id}
                        className="flex items-center justify-between p-3 bg-muted rounded-lg"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{trip.departure_time.slice(0, 5)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Bus className="h-4 w-4 text-muted-foreground" />
                            <span>
                              {vehicleTypeLabels[trip.vehicle?.type ?? 'van']} -{' '}
                              {trip.vehicle?.plate}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span>{trip.capacity} lugares</span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteTrip(trip.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="locations">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Locais de Embarque</CardTitle>
                <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" disabled={availableLocations.length === 0}>
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Adicionar Local de Embarque</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Local</Label>
                        <Select
                          value={selectedLocationId}
                          onValueChange={setSelectedLocationId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um local" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableLocations.map((loc) => (
                              <SelectItem key={loc.id} value={loc.id}>
                                {loc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        onClick={handleAddLocation}
                        className="w-full"
                        disabled={!selectedLocationId || savingLocation}
                      >
                        {savingLocation ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Adicionar'
                        )}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {eventLocations.length === 0 ? (
                  <EmptyState
                    icon={<MapPin className="h-6 w-6 text-muted-foreground" />}
                    title="Nenhum local cadastrado"
                    description="Adicione locais de embarque para este evento"
                    className="py-8"
                  />
                ) : (
                  <div className="space-y-3">
                    {eventLocations.map((el) => (
                      <div
                        key={el.id}
                        className="flex items-center justify-between p-3 bg-muted rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{el.boarding_location?.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {el.boarding_location?.address}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {el.boarding_location?.maps_url && (
                            <Button variant="ghost" size="icon" asChild>
                              <a
                                href={el.boarding_location.maps_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveLocation(el.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sales">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Vendas</CardTitle>
              </CardHeader>
              <CardContent>
                {sales.length === 0 ? (
                  <EmptyState
                    icon={<ShoppingCart className="h-6 w-6 text-muted-foreground" />}
                    title="Nenhuma venda realizada"
                    description="As vendas deste evento aparecerão aqui"
                    className="py-8"
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Local</TableHead>
                        <TableHead>Qtd</TableHead>
                        {canViewFinancials && <TableHead>Valor</TableHead>}
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sales.map((sale) => (
                        <TableRow key={sale.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{sale.customer_name}</p>
                              <p className="text-sm text-muted-foreground">{sale.customer_phone}</p>
                            </div>
                          </TableCell>
                          <TableCell>{sale.boarding_location?.name}</TableCell>
                          <TableCell>{sale.quantity}</TableCell>
                          {canViewFinancials && (
                            <TableCell>
                              R$ {(sale.quantity * sale.unit_price).toFixed(2)}
                            </TableCell>
                          )}
                          <TableCell>
                            <StatusBadge status={sale.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
