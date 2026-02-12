import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Event, Trip, BoardingLocation, Seat, VehicleType } from '@/types/database';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { EventSummaryCard } from '@/components/public/EventSummaryCard';
import { SeatMap } from '@/components/public/SeatMap';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  MapPin,
  Clock,
  Loader2,
  ArrowLeft,
  User,
  Ticket,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

// ---- CPF validation helpers ----
function isValidCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  if (rest !== parseInt(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  return rest === parseInt(digits[10]);
}

function formatCpfMask(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatPhoneMask(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// ---- Auto-generate seats for a vehicle ----
function generateSeatLayout(capacity: number, vehicleType: VehicleType, floors: number): Omit<Seat, 'id' | 'company_id' | 'created_at' | 'vehicle_id'>[] {
  const seats: Omit<Seat, 'id' | 'company_id' | 'created_at' | 'vehicle_id'>[] = [];
  const isSmall = vehicleType === 'van';
  const cols = isSmall ? 3 : 4;

  const seatsPerFloor = floors > 1 ? Math.ceil(capacity / floors) : capacity;

  for (let floor = 1; floor <= floors; floor++) {
    const floorCapacity = floor === floors ? capacity - seats.length : seatsPerFloor;
    let seatCount = 0;
    let row = 1;

    while (seatCount < floorCapacity) {
      for (let col = 1; col <= cols && seatCount < floorCapacity; col++) {
        seatCount++;
        const label = String(seats.length + 1);
        seats.push({
          label,
          floor,
          row_number: row,
          column_number: col,
          status: 'disponivel',
        });
      }
      row++;
    }
  }

  return seats;
}

// ---- Passenger data type ----
interface PassengerData {
  name: string;
  cpf: string;
  phone: string;
}

function isPassengerComplete(p: PassengerData): boolean {
  const rawCpf = p.cpf.replace(/\D/g, '');
  return p.name.trim().length >= 3 && rawCpf.length === 11 && isValidCpf(rawCpf);
}

export default function Checkout() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const tripId = searchParams.get('trip');
  const locationId = searchParams.get('location');
  const quantity = parseInt(searchParams.get('quantity') || '1');
  const sellerRef = searchParams.get('ref');
  const departureTime = searchParams.get('time');

  const [event, setEvent] = useState<Event | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [location, setLocation] = useState<BoardingLocation | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [occupiedSeatIds, setOccupiedSeatIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingSeats, setGeneratingSeats] = useState(false);

  // Step management: 1 = seat selection, 2 = passenger data
  const [step, setStep] = useState(1);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [passengers, setPassengers] = useState<PassengerData[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [payerIndex, setPayerIndex] = useState(0);
  const [openPassengerIdx, setOpenPassengerIdx] = useState<number | null>(0);

  // ---- Load data ----
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

      // Fetch seats for this vehicle
      if (tripRes.data) {
        const vehicleId = (tripRes.data as Trip).vehicle_id;
        const { data: existingSeats } = await supabase
          .from('seats')
          .select('*')
          .eq('vehicle_id', vehicleId)
          .order('floor', { ascending: true })
          .order('row_number', { ascending: true })
          .order('column_number', { ascending: true });

        if (existingSeats && existingSeats.length > 0) {
          // Validate layout compatibility with vehicle type
          const vehicle = (tripRes.data as Trip).vehicle!;
          const expectedCols = vehicle.type === 'van' ? 3 : 4;
          const maxCol = Math.max(...existingSeats.map((s: any) => s.column_number));

          if (maxCol !== expectedCols) {
            // Check if any tickets exist for this trip before regenerating
            const { count: ticketCount } = await supabase
              .from('tickets')
              .select('id', { count: 'exact', head: true })
              .eq('trip_id', tripId!);

            if (!ticketCount || ticketCount === 0) {
              // Safe to delete and regenerate
              await supabase.from('seats').delete().eq('vehicle_id', vehicleId);

              setGeneratingSeats(true);
              const layout = generateSeatLayout(
                vehicle.capacity,
                vehicle.type,
                vehicle.floors ?? 1,
              );
              const seatInserts = layout.map((s) => ({
                vehicle_id: vehicleId,
                label: s.label,
                floor: s.floor,
                row_number: s.row_number,
                column_number: s.column_number,
                status: s.status,
                company_id: (tripRes.data as Trip).company_id,
              }));
              const { data: created } = await supabase
                .from('seats')
                .insert(seatInserts)
                .select();
              if (created) setSeats(created as Seat[]);
              setGeneratingSeats(false);
            } else {
              // Tickets exist — use existing seats even if mismatched
              setSeats(existingSeats as Seat[]);
            }
          } else {
            setSeats(existingSeats as Seat[]);
          }
        } else {
          // Auto-generate seats
          setGeneratingSeats(true);
          const vehicle = (tripRes.data as Trip).vehicle!;
          const layout = generateSeatLayout(
            vehicle.capacity,
            vehicle.type,
            vehicle.floors ?? 1,
          );

          const seatInserts = layout.map((s) => ({
            vehicle_id: vehicleId,
            label: s.label,
            floor: s.floor,
            row_number: s.row_number,
            column_number: s.column_number,
            status: s.status,
            company_id: (tripRes.data as Trip).company_id,
          }));

          const { data: created } = await supabase
            .from('seats')
            .insert(seatInserts)
            .select();

          if (created) setSeats(created as Seat[]);
          setGeneratingSeats(false);
        }

        // Fetch occupied seats (tickets for this trip)
        const { data: tickets } = await supabase
          .from('tickets')
          .select('seat_id')
          .eq('trip_id', tripId);

        if (tickets) {
          setOccupiedSeatIds(tickets.map((t: any) => t.seat_id).filter(Boolean));
        }
      }

      setLoading(false);
    };

    fetchData();
  }, [id, tripId, locationId, navigate]);

  // Init passengers array when advancing to step 2
  const handleAdvanceToPassengers = () => {
    if (selectedSeats.length !== quantity) {
      toast.error(`Selecione exatamente ${quantity} assento${quantity > 1 ? 's' : ''}`);
      return;
    }
    setPassengers(
      selectedSeats.map(() => ({ name: '', cpf: '', phone: '' }))
    );
    setErrors({});
    setPayerIndex(0);
    setOpenPassengerIdx(0);
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Get seat label by id
  const seatLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    seats.forEach((s) => { map[s.id] = s.label; });
    return map;
  }, [seats]);

  // Update passenger field
  const updatePassenger = (index: number, field: keyof PassengerData, value: string) => {
    setPassengers((prev) => {
      const copy = [...prev];
      if (field === 'cpf') {
        copy[index] = { ...copy[index], cpf: formatCpfMask(value) };
      } else if (field === 'phone') {
        copy[index] = { ...copy[index], phone: formatPhoneMask(value) };
      } else {
        copy[index] = { ...copy[index], [field]: value };
      }
      return copy;
    });
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[`${index}_${field}`];
      return copy;
    });
  };

  // Validate passengers
  const validatePassengers = (): boolean => {
    const newErrors: Record<string, string> = {};
    const cpfs = new Set<string>();

    passengers.forEach((p, i) => {
      if (!p.name.trim() || p.name.trim().length < 3) {
        newErrors[`${i}_name`] = 'Nome deve ter pelo menos 3 caracteres';
      }
      const rawCpf = p.cpf.replace(/\D/g, '');
      if (!rawCpf || rawCpf.length !== 11) {
        newErrors[`${i}_cpf`] = 'CPF deve ter 11 dígitos';
      } else if (!isValidCpf(rawCpf)) {
        newErrors[`${i}_cpf`] = 'CPF inválido';
      } else if (cpfs.has(rawCpf)) {
        newErrors[`${i}_cpf`] = 'CPF já utilizado nesta compra';
      } else {
        cpfs.add(rawCpf);
      }
    });

    // Validate payer has valid CPF
    const payerCpf = passengers[payerIndex]?.cpf.replace(/\D/g, '');
    if (!payerCpf || !isValidCpf(payerCpf)) {
      newErrors[`${payerIndex}_cpf`] = 'O responsável pelo pagamento precisa ter CPF válido';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Submit purchase
  const handleSubmit = async () => {
    if (!validatePassengers()) {
      // Open the first passenger with error
      const firstErrorKey = Object.keys(errors)[0];
      if (firstErrorKey) {
        const idx = parseInt(firstErrorKey.split('_')[0]);
        setOpenPassengerIdx(idx);
      }
      return;
    }
    if (!event || !trip || !location) return;

    setSubmitting(true);

    // Re-check availability
    const { data: availableSeats } = await supabase.rpc('get_trip_available_capacity', {
      trip_uuid: tripId!,
    });

    if (availableSeats !== null && quantity > availableSeats) {
      toast.error(`Apenas ${availableSeats} vaga${availableSeats !== 1 ? 's' : ''} disponível`);
      setSubmitting(false);
      return;
    }

    const payer = passengers[payerIndex];

    // Create sale
    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert({
        event_id: id!,
        trip_id: tripId!,
        boarding_location_id: locationId!,
        seller_id: sellerRef || null,
        customer_name: payer.name.trim(),
        customer_cpf: payer.cpf.replace(/\D/g, ''),
        customer_phone: payer.phone.replace(/\D/g, ''),
        quantity,
        unit_price: event.unit_price ?? 0,
        status: 'reservado' as const,
        company_id: event.company_id,
      })
      .select()
      .single();

    if (saleError || !sale) {
      console.error('Sale error:', saleError);
      toast.error('Erro ao finalizar compra. Tente novamente.');
      setSubmitting(false);
      return;
    }

    // Create tickets
    const ticketInserts = selectedSeats.map((seatId, i) => ({
      sale_id: sale.id,
      trip_id: tripId!,
      seat_id: seatId,
      seat_label: seatLabelMap[seatId] || String(i + 1),
      passenger_name: passengers[i].name.trim(),
      passenger_cpf: passengers[i].cpf.replace(/\D/g, ''),
      passenger_phone: passengers[i].phone.replace(/\D/g, '') || null,
      company_id: event.company_id,
    }));

    const { error: ticketError } = await supabase.from('tickets').insert(ticketInserts);

    if (ticketError) {
      console.error('Ticket error:', ticketError);
      if (ticketError.code === '23505') {
        toast.error('Um ou mais assentos já foram reservados. Escolha outros assentos.');
      } else {
        toast.error('Erro ao reservar assentos. Tente novamente.');
      }
      await supabase.from('sales').delete().eq('id', sale.id);
      setSubmitting(false);
      return;
    }

    navigate(`/confirmacao/${sale.id}`);
  };

  // Format the departure time for display
  const displayTime = departureTime ? departureTime.slice(0, 5) : null;

  // ---- Render ----

  if (loading || generatingSeats) {
    return (
      <PublicLayout>
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            {generatingSeats ? 'Preparando mapa de assentos...' : 'Carregando...'}
          </p>
        </div>
      </PublicLayout>
    );
  }

  if (!event || !trip || !location) {
    return (
      <PublicLayout>
        <div className="max-w-lg mx-auto px-4 py-8 text-center">
          <p className="text-muted-foreground mb-4">Dados inválidos para esta compra.</p>
          <Button onClick={() => navigate('/eventos')}>Ver eventos</Button>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Header with back & step indicator */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => {
              if (step === 2) {
                setStep(1);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              } else {
                navigate(-1);
              }
            }}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">
              {step === 1 ? 'Escolha seus assentos' : 'Dados dos passageiros'}
            </h1>
            <p className="text-xs text-muted-foreground">
              Etapa {step} de 2
            </p>
          </div>
        </div>

        {/* Event summary */}
        <EventSummaryCard event={event} compact />

        {/* Purchase info strip */}
        <div className="flex items-center gap-3 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            <span className="truncate">{location.name}</span>
          </div>
          {displayTime && (
            <>
              <Separator orientation="vertical" className="h-4" />
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span>{displayTime}</span>
              </div>
            </>
          )}
          <Separator orientation="vertical" className="h-4" />
          <div className="flex items-center gap-1.5">
            <Ticket className="h-3.5 w-3.5" />
            <span>{quantity}x</span>
          </div>
        </div>

        {/* ============ STEP 1: Seat Selection ============ */}
        {step === 1 && (
          <>
            <SeatMap
              seats={seats}
              occupiedSeatIds={occupiedSeatIds}
              maxSelection={quantity}
              selectedSeats={selectedSeats}
              onSelectionChange={setSelectedSeats}
              floors={trip.vehicle?.floors ?? 1}
            />

            <Button
              className="w-full h-14 text-lg font-medium"
              disabled={selectedSeats.length !== quantity}
              onClick={handleAdvanceToPassengers}
            >
              Continuar para dados dos passageiros
              <ChevronRight className="h-5 w-5 ml-1" />
            </Button>
          </>
        )}

        {/* ============ STEP 2: Passenger Data (Accordion) ============ */}
        {step === 2 && (
          <>
            {/* Selected seats summary */}
            <div className="flex flex-wrap gap-1.5">
              {selectedSeats.map((seatId) => (
                <span
                  key={seatId}
                  className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-medium px-2 py-1 rounded-md"
                >
                  Assento {seatLabelMap[seatId]}
                </span>
              ))}
            </div>

            {/* Passenger accordion */}
            <div className="space-y-2">
              {passengers.map((passenger, idx) => {
                const isComplete = isPassengerComplete(passenger);
                const seatLabel = seatLabelMap[selectedSeats[idx]];
                const isOpen = openPassengerIdx === idx;
                const hasError = Object.keys(errors).some(k => k.startsWith(`${idx}_`));

                return (
                  <Collapsible
                    key={selectedSeats[idx]}
                    open={isOpen}
                    onOpenChange={(open) => setOpenPassengerIdx(open ? idx : null)}
                  >
                    <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-3 bg-card border rounded-lg hover:bg-muted/30 transition-colors text-left">
                      <div className="flex items-center gap-2 min-w-0">
                        <User className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm font-medium truncate">
                          Assento {seatLabel} — {passenger.name.trim() || 'Pendente'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {hasError ? (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                            <AlertCircle className="h-3 w-3 mr-0.5" />
                            Erro
                          </Badge>
                        ) : isComplete ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] px-1.5 py-0">
                            <CheckCircle2 className="h-3 w-3 mr-0.5" />
                            OK
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0">
                            Pendente
                          </Badge>
                        )}
                        {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent className="px-4 pb-4 pt-2 border border-t-0 rounded-b-lg bg-card space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor={`name-${idx}`} className="text-sm">
                          Nome completo
                        </Label>
                        <Input
                          id={`name-${idx}`}
                          value={passenger.name}
                          onChange={(e) => updatePassenger(idx, 'name', e.target.value)}
                          placeholder="Nome do passageiro"
                          maxLength={100}
                        />
                        {errors[`${idx}_name`] && (
                          <p className="text-xs text-destructive">{errors[`${idx}_name`]}</p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor={`cpf-${idx}`} className="text-sm">
                          CPF
                        </Label>
                        <Input
                          id={`cpf-${idx}`}
                          value={passenger.cpf}
                          onChange={(e) => updatePassenger(idx, 'cpf', e.target.value)}
                          placeholder="000.000.000-00"
                          maxLength={14}
                        />
                        {errors[`${idx}_cpf`] && (
                          <p className="text-xs text-destructive">{errors[`${idx}_cpf`]}</p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor={`phone-${idx}`} className="text-sm">
                          Telefone (opcional)
                        </Label>
                        <Input
                          id={`phone-${idx}`}
                          value={passenger.phone}
                          onChange={(e) => updatePassenger(idx, 'phone', e.target.value)}
                          placeholder="(00) 00000-0000"
                          maxLength={15}
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>

            {/* Payer selection */}
            {passengers.length > 1 && (
              <div className="space-y-3 bg-muted/30 rounded-lg p-4 border">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  Responsável pelo pagamento
                </h3>
                <RadioGroup
                  value={String(payerIndex)}
                  onValueChange={(v) => setPayerIndex(Number(v))}
                  className="space-y-2"
                >
                  {passengers.map((p, idx) => {
                    const seatLabel = seatLabelMap[selectedSeats[idx]];
                    const displayName = p.name.trim() || 'Não preenchido';
                    const displayCpf = p.cpf || '—';
                    return (
                      <label
                        key={idx}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-card cursor-pointer hover:bg-muted/30 transition-colors"
                      >
                        <RadioGroupItem value={String(idx)} />
                        <div className="text-sm min-w-0">
                          <div className="font-medium truncate">Assento {seatLabel} — {displayName}</div>
                          <div className="text-xs text-muted-foreground">CPF: {displayCpf}</div>
                        </div>
                      </label>
                    );
                  })}
                </RadioGroup>
              </div>
            )}

            <Button
              className="w-full h-14 text-lg font-medium"
              disabled={submitting}
              onClick={handleSubmit}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Finalizando...
                </>
              ) : (
                'Finalizar compra'
              )}
            </Button>
          </>
        )}
      </div>
    </PublicLayout>
  );
}
