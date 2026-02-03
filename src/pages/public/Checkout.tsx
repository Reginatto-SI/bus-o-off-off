import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Event, Trip, BoardingLocation } from '@/types/database';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Calendar,
  MapPin,
  Clock,
  Loader2,
  ArrowLeft,
  User,
  Phone,
  CreditCard,
  Ticket,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { z } from 'zod';

const checkoutSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres').max(100),
  cpf: z.string().regex(/^\d{11}$/, 'CPF deve ter 11 dígitos'),
  phone: z.string().min(10, 'Telefone inválido').max(15),
});

export default function Checkout() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const tripId = searchParams.get('trip');
  const locationId = searchParams.get('location');
  const quantity = parseInt(searchParams.get('quantity') || '1');
  const sellerRef = searchParams.get('ref');

  const [event, setEvent] = useState<Event | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [location, setLocation] = useState<BoardingLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: '',
    cpf: '',
    phone: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchData = async () => {
      if (!id || !tripId || !locationId) {
        navigate('/eventos');
        return;
      }

      const [eventRes, tripRes, locationRes] = await Promise.all([
        supabase.from('events').select('*').eq('id', id).single(),
        supabase.from('trips').select('*, vehicle:vehicles(*)').eq('id', tripId).single(),
        supabase.from('boarding_locations').select('*').eq('id', locationId).single(),
      ]);

      if (eventRes.data) setEvent(eventRes.data as Event);
      if (tripRes.data) setTrip(tripRes.data as Trip);
      if (locationRes.data) setLocation(locationRes.data as BoardingLocation);
      setLoading(false);
    };

    fetchData();
  }, [id, tripId, locationId, navigate]);

  const formatCpf = (value: string) => {
    return value.replace(/\D/g, '').slice(0, 11);
  };

  const formatPhone = (value: string) => {
    return value.replace(/\D/g, '').slice(0, 11);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const validation = checkoutSchema.safeParse({
      name: form.name.trim(),
      cpf: form.cpf,
      phone: form.phone,
    });

    if (!validation.success) {
      const newErrors: Record<string, string> = {};
      validation.error.errors.forEach((err) => {
        if (err.path[0]) {
          newErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);

    // Check availability again
    const { data: availableSeats } = await supabase.rpc('get_trip_available_capacity', {
      trip_uuid: tripId,
    });

    if (availableSeats !== null && quantity > availableSeats) {
      toast.error(`Apenas ${availableSeats} lugares disponíveis`);
      setSubmitting(false);
      return;
    }

    const { data: sale, error } = await supabase
      .from('sales')
      .insert([
        {
          event_id: id,
          trip_id: tripId,
          boarding_location_id: locationId,
          seller_id: sellerRef || null,
          customer_name: form.name.trim(),
          customer_cpf: form.cpf,
          customer_phone: form.phone,
          quantity: quantity,
          unit_price: 0, // Price can be set by admin
          status: 'reservado' as const,
          company_id: event?.company_id!,
        },
      ])
      .select()
      .single();

    if (error) {
      toast.error('Erro ao finalizar compra');
      setSubmitting(false);
      return;
    }

    navigate(`/confirmacao/${sale.id}`);
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

  if (!event || !trip || !location) {
    return (
      <PublicLayout>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-center text-muted-foreground">Dados inválidos</p>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        <h1 className="text-2xl font-bold mb-6">Finalizar Compra</h1>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Resumo da Compra</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="font-semibold">{event.name}</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                  <Calendar className="h-4 w-4" />
                  {format(new Date(event.date), "dd/MM/yyyy", { locale: ptBR })}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  {event.city}
                </div>
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>Saída: {trip.departure_time.slice(0, 5)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>Embarque: {location.name}</span>
                </div>
                <p className="text-xs text-muted-foreground">{location.address}</p>
              </div>

              <Separator />

              <div className="flex items-center justify-between font-semibold">
                <div className="flex items-center gap-2">
                  <Ticket className="h-4 w-4" />
                  <span>Passagens</span>
                </div>
                <span>{quantity}x</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Dados do Passageiro</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Nome Completo
                  </Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="João da Silva"
                    required
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cpf" className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    CPF
                  </Label>
                  <Input
                    id="cpf"
                    value={form.cpf}
                    onChange={(e) => setForm({ ...form, cpf: formatCpf(e.target.value) })}
                    placeholder="00000000000"
                    maxLength={11}
                    required
                  />
                  {errors.cpf && (
                    <p className="text-sm text-destructive">{errors.cpf}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone" className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Telefone
                  </Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })}
                    placeholder="11999999999"
                    maxLength={11}
                    required
                  />
                  {errors.phone && (
                    <p className="text-sm text-destructive">{errors.phone}</p>
                  )}
                </div>

                <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Finalizando...
                    </>
                  ) : (
                    'Finalizar Compra'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </PublicLayout>
  );
}
