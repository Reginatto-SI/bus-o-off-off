import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Event, Trip, Vehicle, Driver, BoardingLocation, EventBoardingLocation, TripType } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatsCard } from '@/components/admin/StatsCard';
import { FilterCard } from '@/components/admin/FilterCard';
import { ActionsDropdown, ActionItem } from '@/components/admin/ActionsDropdown';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Calendar,
  MapPin,
  Plus,
  Loader2,
  Bus,
  Users,
  FileEdit,
  ShoppingBag,
  CheckCircle,
  Pencil,
  Trash2,
  ExternalLink,
  Clock,
  Globe,
  FileText,
  Info,
  Ticket,
  Lock,
  XCircle,
  Check,
  Image,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { buildDebugToastMessage, logSupabaseError } from '@/lib/errorDebug';

// Types
interface EventFilters {
  search: string;
  status: 'all' | 'rascunho' | 'a_venda' | 'encerrado';
}

interface EventWithTrips extends Event {
  trips: { count: number }[];
}

interface TripWithDetails extends Trip {
  vehicle?: Vehicle;
  driver?: Driver;
  assistant_driver?: Driver;
}

interface EventBoardingLocationWithDetails extends EventBoardingLocation {
  boarding_location?: BoardingLocation;
  trip?: Trip;
}

const initialFilters: EventFilters = {
  search: '',
  status: 'all',
};

const statusOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'a_venda', label: 'À Venda' },
  { value: 'encerrado', label: 'Encerrado' },
] as const;

const vehicleTypeLabels: Record<Vehicle['type'], string> = {
  onibus: 'Ônibus',
  micro_onibus: 'Micro-ônibus',
  van: 'Van',
};

export default function Events() {
  const { activeCompanyId, user } = useAuth();
  const [events, setEvents] = useState<EventWithTrips[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<EventFilters>(initialFilters);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<EventWithTrips | null>(null);
  const [activeTab, setActiveTab] = useState('geral');
  
  // Data for trips tab
  const [eventTrips, setEventTrips] = useState<TripWithDetails[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  
  // Data for boarding locations tab
  const [eventBoardingLocations, setEventBoardingLocations] = useState<EventBoardingLocationWithDetails[]>([]);
  const [boardingLocations, setBoardingLocations] = useState<BoardingLocation[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  
  // Trip form modal
  const [tripDialogOpen, setTripDialogOpen] = useState(false);
  const [tripForm, setTripForm] = useState({
    trip_type: 'ida' as TripType,
    vehicle_id: '',
    driver_id: '',
    assistant_driver_id: '',
    departure_time: '',
    capacity: '',
  });
  const [savingTrip, setSavingTrip] = useState(false);

  // Boarding location form modal
  const [boardingDialogOpen, setBoardingDialogOpen] = useState(false);
  const [boardingForm, setBoardingForm] = useState({
    boarding_location_id: '',
    departure_time: '',
    trip_id: '',
  });
  const [savingBoarding, setSavingBoarding] = useState(false);

  // Main form
  const [form, setForm] = useState({
    name: '',
    date: '',
    city: '',
    description: '',
    status: 'rascunho' as Event['status'],
    unit_price: '',
    max_tickets_per_purchase: '5',
    allow_online_sale: true,
    allow_seller_sale: true,
  });

  // Computed: can publish checklist
  const publishChecklist = useMemo(() => {
    const hasName = form.name.trim() !== '';
    const hasDate = form.date !== '';
    const hasCity = form.city.trim() !== '';
    const hasTrips = eventTrips.length > 0;
    const hasBoardingLocations = eventBoardingLocations.length > 0;
    const hasPrice = parseFloat(form.unit_price || '0') > 0;

    return {
      valid: hasName && hasDate && hasCity && hasTrips && hasBoardingLocations && hasPrice,
      checks: {
        hasName,
        hasDate,
        hasCity,
        hasTrips,
        hasBoardingLocations,
        hasPrice,
      },
    };
  }, [form, eventTrips, eventBoardingLocations]);

  // Computed: is read-only (encerrado)
  const isReadOnly = form.status === 'encerrado';

  // Stats calculations
  const stats = useMemo(() => {
    const total = events.length;
    const rascunhos = events.filter((e) => e.status === 'rascunho').length;
    const aVenda = events.filter((e) => e.status === 'a_venda').length;
    const encerrados = events.filter((e) => e.status === 'encerrado').length;
    return { total, rascunhos, aVenda, encerrados };
  }, [events]);

  // Filtered events
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          event.name.toLowerCase().includes(searchLower) ||
          event.city.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      if (filters.status !== 'all' && event.status !== filters.status) {
        return false;
      }

      return true;
    });
  }, [events, filters]);

  const hasActiveFilters = useMemo(() => {
    return filters.search !== '' || filters.status !== 'all';
  }, [filters]);

  // Total capacity from trips
  const totalCapacity = useMemo(() => {
    return eventTrips.reduce((sum, trip) => sum + (trip.capacity || 0), 0);
  }, [eventTrips]);

  // Fetch functions
  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from('events')
      .select(`
        *,
        trips:trips(count)
      `)
      .order('date', { ascending: false });

    if (error) {
      logSupabaseError({
        label: 'Erro ao carregar eventos (events.select)',
        error,
        context: { action: 'select', table: 'events', companyId: activeCompanyId, userId: user?.id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao carregar eventos',
          error,
          context: { action: 'select', table: 'events', companyId: activeCompanyId, userId: user?.id },
        })
      );
    } else {
      setEvents(data as EventWithTrips[]);
    }
    setLoading(false);
  };

  const fetchEventTrips = async (eventId: string) => {
    setLoadingTrips(true);
    const { data, error } = await supabase
      .from('trips')
      .select(`
        *,
        vehicle:vehicles(*),
        driver:drivers!trips_driver_id_fkey(*),
        assistant_driver:drivers!trips_assistant_driver_id_fkey(*)
      `)
      .eq('event_id', eventId)
      .order('departure_time', { ascending: true });

    if (error) {
      console.error('Erro ao carregar viagens:', error);
    } else {
      setEventTrips((data || []) as TripWithDetails[]);
    }
    setLoadingTrips(false);
  };

  const fetchEventBoardingLocations = async (eventId: string) => {
    setLoadingLocations(true);
    const { data, error } = await supabase
      .from('event_boarding_locations')
      .select(`
        *,
        boarding_location:boarding_locations(*),
        trip:trips(*)
      `)
      .eq('event_id', eventId)
      .order('departure_time', { ascending: true, nullsFirst: false });

    if (error) {
      console.error('Erro ao carregar locais de embarque:', error);
    } else {
      setEventBoardingLocations((data || []) as EventBoardingLocationWithDetails[]);
    }
    setLoadingLocations(false);
  };

  const fetchVehiclesAndDrivers = async () => {
    const [vehiclesRes, driversRes, locationsRes] = await Promise.all([
      supabase.from('vehicles').select('*').eq('status', 'ativo').order('plate'),
      supabase.from('drivers').select('*').eq('status', 'ativo').order('name'),
      supabase.from('boarding_locations').select('*').eq('status', 'ativo').order('name'),
    ]);
    
    if (vehiclesRes.data) setVehicles(vehiclesRes.data as Vehicle[]);
    if (driversRes.data) setDrivers(driversRes.data as Driver[]);
    if (locationsRes.data) setBoardingLocations(locationsRes.data as BoardingLocation[]);
  };

  useEffect(() => {
    fetchEvents();
    fetchVehiclesAndDrivers();
  }, []);

  // Load event data when editing
  const loadEventData = async (eventId: string) => {
    await Promise.all([
      fetchEventTrips(eventId),
      fetchEventBoardingLocations(eventId),
    ]);
  };

  // Handlers
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    if (!activeCompanyId) {
      toast.error('Empresa não selecionada');
      setSaving(false);
      return;
    }

    // Validate if trying to publish
    if (form.status === 'a_venda' && !publishChecklist.valid) {
      toast.error('Corrija os itens pendentes antes de publicar o evento');
      setActiveTab('publicacao');
      setSaving(false);
      return;
    }

    const eventData = {
      name: form.name.trim(),
      date: form.date,
      city: form.city.trim(),
      description: form.description || null,
      status: form.status,
      unit_price: parseFloat(form.unit_price || '0'),
      max_tickets_per_purchase: parseInt(form.max_tickets_per_purchase || '5', 10),
      allow_online_sale: form.allow_online_sale,
      allow_seller_sale: form.allow_seller_sale,
      company_id: activeCompanyId,
    };

    let error;
    let newEventId = editingId;

    if (editingId) {
      const { company_id: _companyId, ...updateData } = eventData;
      ({ error } = await supabase.from('events').update(updateData).eq('id', editingId));
    } else {
      const { data, error: insertError } = await supabase.from('events').insert([eventData]).select('id').single();
      error = insertError;
      if (data) newEventId = data.id;
    }

    if (error) {
      logSupabaseError({
        label: 'Erro ao salvar evento (events.insert/update)',
        error,
        context: { action: editingId ? 'update' : 'insert', table: 'events', companyId: activeCompanyId, userId: user?.id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao salvar evento',
          error,
          context: { action: editingId ? 'update' : 'insert', table: 'events', companyId: activeCompanyId, userId: user?.id },
        })
      );
    } else {
      toast.success(editingId ? 'Evento atualizado com sucesso' : 'Evento criado com sucesso');
      
      // If new event, switch to edit mode to allow adding trips/locations
      if (!editingId && newEventId) {
        setEditingId(newEventId);
        loadEventData(newEventId);
        setActiveTab('viagens');
        toast.info('Agora você pode adicionar viagens e locais de embarque');
      } else {
        setDialogOpen(false);
        resetForm();
      }
      fetchEvents();
    }
    setSaving(false);
  };

  const handleEdit = async (event: EventWithTrips) => {
    setEditingId(event.id);
    setForm({
      name: event.name,
      date: event.date,
      city: event.city,
      description: event.description ?? '',
      status: event.status,
      unit_price: event.unit_price?.toString() ?? '0',
      max_tickets_per_purchase: event.max_tickets_per_purchase?.toString() ?? '5',
      allow_online_sale: event.allow_online_sale ?? true,
      allow_seller_sale: event.allow_seller_sale ?? true,
    });
    setActiveTab('geral');
    loadEventData(event.id);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!eventToDelete) return;

    const { error } = await supabase.from('events').delete().eq('id', eventToDelete.id);

    if (error) {
      toast.error('Erro ao excluir evento');
    } else {
      toast.success('Evento excluído com sucesso');
      fetchEvents();
    }
    setDeleteDialogOpen(false);
    setEventToDelete(null);
  };

  // Trip handlers
  const handleAddTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !activeCompanyId) return;
    
    setSavingTrip(true);

    const selectedVehicle = vehicles.find(v => v.id === tripForm.vehicle_id);
    const capacity = tripForm.capacity 
      ? parseInt(tripForm.capacity, 10) 
      : selectedVehicle?.capacity ?? 0;

    const tripData = {
      event_id: editingId,
      trip_type: tripForm.trip_type,
      vehicle_id: tripForm.vehicle_id,
      driver_id: tripForm.driver_id,
      assistant_driver_id: tripForm.assistant_driver_id || null,
      departure_time: tripForm.departure_time,
      capacity,
      company_id: activeCompanyId,
    };

    const { error } = await supabase.from('trips').insert([tripData]);

    if (error) {
      toast.error('Erro ao adicionar viagem');
      console.error(error);
    } else {
      toast.success('Viagem adicionada');
      setTripDialogOpen(false);
      setTripForm({ 
        trip_type: 'ida', 
        vehicle_id: '', 
        driver_id: '', 
        assistant_driver_id: '',
        departure_time: '', 
        capacity: '' 
      });
      fetchEventTrips(editingId);
      fetchEvents();
    }
    setSavingTrip(false);
  };

  const handleDeleteTrip = async (tripId: string) => {
    if (!editingId) return;
    
    const { error } = await supabase.from('trips').delete().eq('id', tripId);

    if (error) {
      toast.error('Erro ao remover viagem');
    } else {
      toast.success('Viagem removida');
      fetchEventTrips(editingId);
      fetchEvents();
    }
  };

  // Boarding location handlers
  const handleAddBoarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !activeCompanyId) return;
    
    setSavingBoarding(true);

    const boardingData = {
      event_id: editingId,
      boarding_location_id: boardingForm.boarding_location_id,
      departure_time: boardingForm.departure_time || null,
      trip_id: boardingForm.trip_id || null,
      company_id: activeCompanyId,
    };

    const { error } = await supabase.from('event_boarding_locations').insert([boardingData]);

    if (error) {
      toast.error('Erro ao adicionar local de embarque');
      console.error(error);
    } else {
      toast.success('Local de embarque adicionado');
      setBoardingDialogOpen(false);
      setBoardingForm({ boarding_location_id: '', departure_time: '', trip_id: '' });
      fetchEventBoardingLocations(editingId);
    }
    setSavingBoarding(false);
  };

  const handleDeleteBoarding = async (boardingId: string) => {
    if (!editingId) return;
    
    const { error } = await supabase.from('event_boarding_locations').delete().eq('id', boardingId);

    if (error) {
      toast.error('Erro ao remover local de embarque');
    } else {
      toast.success('Local de embarque removido');
      fetchEventBoardingLocations(editingId);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setEventTrips([]);
    setEventBoardingLocations([]);
    setActiveTab('geral');
    setForm({
      name: '',
      date: '',
      city: '',
      description: '',
      status: 'rascunho',
      unit_price: '',
      max_tickets_per_purchase: '5',
      allow_online_sale: true,
      allow_seller_sale: true,
    });
  };

  const getEventActions = (event: EventWithTrips): ActionItem[] => {
    const actions: ActionItem[] = [];

    if (event.status !== 'encerrado') {
      actions.push({
        label: 'Editar',
        icon: Pencil,
        onClick: () => handleEdit(event),
      });
    } else {
      actions.push({
        label: 'Visualizar',
        icon: ExternalLink,
        onClick: () => handleEdit(event),
      });
    }

    actions.push({
      label: 'Ver Detalhes',
      icon: ExternalLink,
      onClick: () => {
        window.location.href = `/admin/eventos/${event.id}`;
      },
    });

    const tripCount = event.trips?.[0]?.count ?? 0;
    if (tripCount === 0) {
      actions.push({
        label: 'Excluir',
        icon: Trash2,
        onClick: () => {
          setEventToDelete(event);
          setDeleteDialogOpen(true);
        },
        variant: 'destructive',
      });
    }

    return actions;
  };

  const getTripCount = (event: EventWithTrips) => {
    return event.trips?.[0]?.count ?? 0;
  };

  // Available boarding locations (not already added)
  const availableBoardingLocations = useMemo(() => {
    const addedIds = eventBoardingLocations.map(ebl => ebl.boarding_location_id);
    return boardingLocations.filter(bl => !addedIds.includes(bl.id));
  }, [boardingLocations, eventBoardingLocations]);

  return (
    <AdminLayout>
      <div className="page-container">
        {/* Header */}
        <PageHeader
          title="Eventos"
          description="Gerencie os eventos e viagens"
          actions={
            <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Evento
            </Button>
          }
        />

        {/* Stats Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <StatsCard
            label="Total de Eventos"
            value={stats.total}
            icon={Calendar}
          />
          <StatsCard
            label="Rascunhos"
            value={stats.rascunhos}
            icon={FileEdit}
          />
          <StatsCard
            label="À Venda"
            value={stats.aVenda}
            icon={ShoppingBag}
            variant="success"
          />
          <StatsCard
            label="Encerrados"
            value={stats.encerrados}
            icon={CheckCircle}
            variant="destructive"
          />
        </div>

        {/* Filters */}
        <FilterCard
          searchValue={filters.search}
          onSearchChange={(value) => setFilters({ ...filters, search: value })}
          searchPlaceholder="Pesquisar por nome ou cidade..."
          selects={[
            {
              id: 'status',
              label: 'Status',
              placeholder: 'Status',
              value: filters.status,
              onChange: (value) => setFilters({ ...filters, status: value as EventFilters['status'] }),
              options: statusOptions.map(opt => ({ value: opt.value, label: opt.label })),
            },
          ]}
          onClearFilters={() => setFilters(initialFilters)}
          hasActiveFilters={hasActiveFilters}
          className="mb-6"
        />

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            icon={<Calendar className="h-8 w-8 text-muted-foreground" />}
            title="Nenhum evento cadastrado"
            description="Crie seu primeiro evento para começar a vender passagens"
            action={
              <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Evento
              </Button>
            }
          />
        ) : filteredEvents.length === 0 ? (
          <EmptyState
            icon={<Calendar className="h-8 w-8 text-muted-foreground" />}
            title="Nenhum evento encontrado"
            description="Ajuste os filtros para encontrar eventos"
            action={
              <Button variant="outline" onClick={() => setFilters(initialFilters)}>
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredEvents.map((event) => (
              <Card key={event.id} className="card-corporate h-full">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-semibold text-foreground line-clamp-2">{event.name}</h3>
                    <ActionsDropdown actions={getEventActions(event)} />
                  </div>
                  
                  <div className="mb-3">
                    <StatusBadge status={event.status} />
                  </div>
                  
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 shrink-0" />
                      <span>
                        {format(new Date(event.date), "dd 'de' MMMM 'de' yyyy", {
                          locale: ptBR,
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span>{event.city}</span>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-3 border-t border-border flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Bus className="h-4 w-4" />
                      <span>{getTripCount(event)} viagem(ns)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Event Modal with 5 Tabs */}
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogContent className="admin-modal flex h-[90vh] max-h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 p-0">
            <DialogHeader className="admin-modal__header px-6 py-4 border-b">
              <DialogTitle className="flex items-center gap-2">
                {isReadOnly && <Lock className="h-4 w-4 text-muted-foreground" />}
                {editingId ? (isReadOnly ? 'Visualizar' : 'Editar') : 'Novo'} Evento
              </DialogTitle>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="flex h-full flex-col overflow-hidden">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col overflow-hidden">
                <TabsList className="admin-modal__tabs flex h-auto w-full flex-wrap justify-start gap-1 px-6 py-2 border-b bg-muted/30">
                  <TabsTrigger
                    value="geral"
                    className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80"
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate">Geral</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="viagens"
                    className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80"
                    disabled={!editingId}
                  >
                    <Bus className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate">Viagens</span>
                    {editingId && <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{eventTrips.length}</span>}
                  </TabsTrigger>
                  <TabsTrigger
                    value="embarques"
                    className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80"
                    disabled={!editingId}
                  >
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate">Embarques</span>
                    {editingId && <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{eventBoardingLocations.length}</span>}
                  </TabsTrigger>
                  <TabsTrigger
                    value="passagens"
                    className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80"
                  >
                    <Ticket className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate">Passagens</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="publicacao"
                    className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80"
                  >
                    <Globe className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate">Publicação</span>
                  </TabsTrigger>
                </TabsList>

                <div className="admin-modal__body flex-1 overflow-y-auto px-6 py-4">
                  {/* Read-only warning for encerrado events */}
                  {isReadOnly && (
                    <Card className="mb-4 border-destructive/50 bg-destructive/5">
                      <CardContent className="p-4 flex items-start gap-3">
                        <Lock className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-medium text-destructive">Evento Encerrado</p>
                          <p className="text-muted-foreground">
                            Este evento foi encerrado e não pode mais ser editado. Os dados estão disponíveis apenas para consulta.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Tab Geral */}
                  <TabsContent value="geral" className="mt-0 space-y-4">
                    {/* Image placeholder */}
                    <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center bg-muted/20">
                      <Image className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">
                        Arraste uma imagem ou clique para selecionar
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        (Funcionalidade em desenvolvimento)
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="name">Nome do Evento *</Label>
                        <Input
                          id="name"
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                          placeholder="Ex: Festa do Peão de Barretos 2026"
                          required
                          disabled={isReadOnly}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="date">Data *</Label>
                        <Input
                          id="date"
                          type="date"
                          value={form.date}
                          onChange={(e) => setForm({ ...form, date: e.target.value })}
                          required
                          disabled={isReadOnly}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="city">Cidade *</Label>
                        <Input
                          id="city"
                          value={form.city}
                          onChange={(e) => setForm({ ...form, city: e.target.value })}
                          placeholder="Ex: Barretos - SP"
                          required
                          disabled={isReadOnly}
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="description">Descrição</Label>
                        <Textarea
                          id="description"
                          value={form.description}
                          onChange={(e) => setForm({ ...form, description: e.target.value })}
                          placeholder="Descrição do evento (opcional)"
                          rows={3}
                          disabled={isReadOnly}
                        />
                      </div>
                    </div>
                  </TabsContent>

                  {/* Tab Viagens */}
                  <TabsContent value="viagens" className="mt-0 space-y-4">
                    {!editingId ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Info className="h-8 w-8 mx-auto mb-2" />
                        <p>Salve o evento primeiro para adicionar viagens.</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium">Viagens do Evento</h3>
                          {!isReadOnly && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setTripDialogOpen(true)}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Adicionar Viagem
                            </Button>
                          )}
                        </div>

                        {loadingTrips ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          </div>
                        ) : eventTrips.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground border rounded-lg">
                            <Bus className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>Nenhuma viagem cadastrada</p>
                            <p className="text-sm">Adicione viagens para este evento</p>
                            {!isReadOnly && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mt-4"
                                onClick={() => setTripDialogOpen(true)}
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                Adicionar Viagem
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {eventTrips.map((trip) => (
                              <Card key={trip.id} className="p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-4 flex-wrap">
                                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                                        trip.trip_type === 'ida' 
                                          ? 'bg-primary/10 text-primary' 
                                          : 'bg-secondary text-secondary-foreground'
                                      }`}>
                                        {trip.trip_type === 'ida' ? 'IDA' : 'VOLTA'}
                                      </span>
                                      <div className="flex items-center gap-2 text-sm">
                                        <Clock className="h-4 w-4 text-muted-foreground" />
                                        <span className="font-medium">{trip.departure_time?.slice(0, 5)}</span>
                                      </div>
                                      <div className="flex items-center gap-2 text-sm">
                                        <Bus className="h-4 w-4 text-muted-foreground" />
                                        <span>
                                          {trip.vehicle ? `${vehicleTypeLabels[trip.vehicle.type]} ${trip.vehicle.plate}` : 'Veículo não definido'}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 text-sm">
                                        <Users className="h-4 w-4 text-muted-foreground" />
                                        <span>{trip.capacity} lugares</span>
                                      </div>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      Motorista: {trip.driver?.name ?? 'Não definido'}
                                      {trip.assistant_driver && ` | Ajudante: ${trip.assistant_driver.name}`}
                                    </div>
                                  </div>
                                  {!isReadOnly && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                      onClick={() => handleDeleteTrip(trip.id)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </Card>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </TabsContent>

                  {/* Tab Embarques */}
                  <TabsContent value="embarques" className="mt-0 space-y-4">
                    {!editingId ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Info className="h-8 w-8 mx-auto mb-2" />
                        <p>Salve o evento primeiro para adicionar locais de embarque.</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium">Locais de Embarque do Evento</h3>
                          {!isReadOnly && availableBoardingLocations.length > 0 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setBoardingDialogOpen(true)}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Adicionar Local
                            </Button>
                          )}
                        </div>

                        {loadingLocations ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          </div>
                        ) : eventBoardingLocations.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground border rounded-lg">
                            <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>Nenhum local de embarque definido</p>
                            <p className="text-sm">Adicione locais onde os passageiros embarcarão</p>
                            {!isReadOnly && availableBoardingLocations.length > 0 && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mt-4"
                                onClick={() => setBoardingDialogOpen(true)}
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                Adicionar Local
                              </Button>
                            )}
                            {availableBoardingLocations.length === 0 && (
                              <p className="text-xs text-destructive mt-4">
                                Cadastre locais de embarque em Configurações → Locais de Embarque
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {eventBoardingLocations.map((ebl) => (
                              <Card key={ebl.id} className="p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-start gap-3">
                                    <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                                    <div>
                                      <p className="font-medium">{ebl.boarding_location?.name}</p>
                                      <p className="text-sm text-muted-foreground">{ebl.boarding_location?.address}</p>
                                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                                        {ebl.departure_time && (
                                          <span className="flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            Horário: {ebl.departure_time.slice(0, 5)}
                                          </span>
                                        )}
                                        <span>
                                          Viagem: {ebl.trip ? (ebl.trip.trip_type === 'ida' ? 'Ida' : 'Volta') : 'Todas'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  {!isReadOnly && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                      onClick={() => handleDeleteBoarding(ebl.id)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </Card>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </TabsContent>

                  {/* Tab Passagens / Venda */}
                  <TabsContent value="passagens" className="mt-0 space-y-6">
                    <div className="space-y-4">
                      <h3 className="font-medium">Configurações de Venda</h3>
                      
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="unit_price">Preço da Passagem *</Label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                            <Input
                              id="unit_price"
                              type="number"
                              step="0.01"
                              min="0"
                              className="pl-10"
                              value={form.unit_price}
                              onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                              placeholder="0,00"
                              disabled={isReadOnly}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="max_tickets">Limite de Passagens por Compra</Label>
                          <Input
                            id="max_tickets"
                            type="number"
                            min="1"
                            max="20"
                            value={form.max_tickets_per_purchase}
                            onChange={(e) => setForm({ ...form, max_tickets_per_purchase: e.target.value })}
                            disabled={isReadOnly}
                          />
                        </div>
                      </div>

                      <div className="space-y-4 pt-4">
                        <h4 className="text-sm font-medium text-muted-foreground">Canais de Venda</h4>
                        
                        <Card className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label htmlFor="allow_online_sale">Venda Online</Label>
                              <p className="text-sm text-muted-foreground">
                                Passagens disponíveis no portal público
                              </p>
                            </div>
                            <Switch
                              id="allow_online_sale"
                              checked={form.allow_online_sale}
                              onCheckedChange={(checked) => setForm({ ...form, allow_online_sale: checked })}
                              disabled={isReadOnly}
                            />
                          </div>
                        </Card>
                        
                        <Card className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label htmlFor="allow_seller_sale">Venda por Vendedor</Label>
                              <p className="text-sm text-muted-foreground">
                                Vendedores podem vender via link exclusivo
                              </p>
                            </div>
                            <Switch
                              id="allow_seller_sale"
                              checked={form.allow_seller_sale}
                              onCheckedChange={(checked) => setForm({ ...form, allow_seller_sale: checked })}
                              disabled={isReadOnly}
                            />
                          </div>
                        </Card>
                      </div>
                    </div>

                    {/* Event Summary */}
                    {editingId && (
                      <Card className="p-4 bg-muted/50">
                        <h4 className="text-sm font-medium mb-3">Resumo do Evento</h4>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Viagens</p>
                            <p className="font-medium">{eventTrips.length}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Capacidade Total</p>
                            <p className="font-medium">{totalCapacity} lugares</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Locais de Embarque</p>
                            <p className="font-medium">{eventBoardingLocations.length}</p>
                          </div>
                        </div>
                      </Card>
                    )}

                    {/* Info Card */}
                    <Card className="p-4 bg-primary/5 border-primary/20">
                      <div className="flex items-start gap-3">
                        <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <div className="text-sm text-muted-foreground">
                          <p>
                            O pagamento será processado no momento da compra. Neste MVP, o pagamento é simulado. 
                            A integração com gateway será implementada em versão futura.
                          </p>
                        </div>
                      </div>
                    </Card>
                  </TabsContent>

                  {/* Tab Publicação */}
                  <TabsContent value="publicacao" className="mt-0 space-y-4">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="status">Status do Evento</Label>
                        <Select
                          value={form.status}
                          onValueChange={(value: Event['status']) => setForm({ ...form, status: value })}
                          disabled={isReadOnly}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="rascunho">Rascunho</SelectItem>
                            <SelectItem value="a_venda">À Venda</SelectItem>
                            <SelectItem value="encerrado">Encerrado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Publish Checklist */}
                      {editingId && form.status !== 'encerrado' && (
                        <Card className={`p-4 ${publishChecklist.valid ? 'bg-green-500/5 border-green-500/20' : 'bg-orange-500/5 border-orange-500/20'}`}>
                          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                            {publishChecklist.valid ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-orange-500" />
                            )}
                            Checklist para Publicação
                          </h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                              {publishChecklist.checks.hasName && publishChecklist.checks.hasDate ? (
                                <Check className="h-4 w-4 text-green-600" />
                              ) : (
                                <XCircle className="h-4 w-4 text-destructive" />
                              )}
                              <span className={publishChecklist.checks.hasName && publishChecklist.checks.hasDate ? 'text-muted-foreground' : 'text-destructive'}>
                                Nome e data definidos
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {publishChecklist.checks.hasTrips ? (
                                <Check className="h-4 w-4 text-green-600" />
                              ) : (
                                <XCircle className="h-4 w-4 text-destructive" />
                              )}
                              <span className={publishChecklist.checks.hasTrips ? 'text-muted-foreground' : 'text-destructive'}>
                                Pelo menos 1 viagem cadastrada
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {publishChecklist.checks.hasBoardingLocations ? (
                                <Check className="h-4 w-4 text-green-600" />
                              ) : (
                                <XCircle className="h-4 w-4 text-destructive" />
                              )}
                              <span className={publishChecklist.checks.hasBoardingLocations ? 'text-muted-foreground' : 'text-destructive'}>
                                Pelo menos 1 local de embarque
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {publishChecklist.checks.hasPrice ? (
                                <Check className="h-4 w-4 text-green-600" />
                              ) : (
                                <XCircle className="h-4 w-4 text-destructive" />
                              )}
                              <span className={publishChecklist.checks.hasPrice ? 'text-muted-foreground' : 'text-destructive'}>
                                Preço da passagem definido
                              </span>
                            </div>
                          </div>
                          {!publishChecklist.valid && (
                            <p className="text-xs text-orange-600 mt-3">
                              Atenção: Corrija os itens pendentes antes de publicar o evento para venda.
                            </p>
                          )}
                        </Card>
                      )}

                      {/* Status Info Card */}
                      <Card className="p-4 bg-muted/50">
                        <div className="flex items-start gap-3">
                          <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                          <div className="text-sm text-muted-foreground space-y-2">
                            <p>
                              <strong className="text-foreground">Rascunho:</strong> Evento visível apenas
                              para administradores. Não aparece no portal público.
                            </p>
                            <p>
                              <strong className="text-foreground">À Venda:</strong> Evento publicado e
                              visível no portal público para compra de passagens.
                            </p>
                            <p>
                              <strong className="text-foreground">Encerrado:</strong> Evento finalizado.
                              Não aceita mais vendas e não pode ser editado.
                            </p>
                          </div>
                        </div>
                      </Card>
                    </div>
                  </TabsContent>
                </div>

                <div className="admin-modal__footer px-6 py-4 border-t flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    {isReadOnly ? 'Fechar' : 'Cancelar'}
                  </Button>
                  {!isReadOnly && (
                    <Button type="submit" disabled={saving}>
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        'Salvar'
                      )}
                    </Button>
                  )}
                </div>
              </Tabs>
            </form>
          </DialogContent>
        </Dialog>

        {/* Trip Modal */}
        <Dialog open={tripDialogOpen} onOpenChange={setTripDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Adicionar Viagem</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddTrip} className="space-y-4">
              {/* Trip Type */}
              <div className="space-y-2">
                <Label>Tipo da Viagem *</Label>
                <RadioGroup
                  value={tripForm.trip_type}
                  onValueChange={(value: TripType) => setTripForm({ ...tripForm, trip_type: value })}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="ida" id="trip_type_ida" />
                    <Label htmlFor="trip_type_ida" className="font-normal cursor-pointer">Ida</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="volta" id="trip_type_volta" />
                    <Label htmlFor="trip_type_volta" className="font-normal cursor-pointer">Volta</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Vehicle */}
                <div className="space-y-2">
                  <Label htmlFor="vehicle">Veículo *</Label>
                  <Select
                    value={tripForm.vehicle_id}
                    onValueChange={(value) => {
                      const vehicle = vehicles.find(v => v.id === value);
                      setTripForm({ 
                        ...tripForm, 
                        vehicle_id: value,
                        capacity: vehicle?.capacity?.toString() ?? '',
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map((vehicle) => (
                        <SelectItem key={vehicle.id} value={vehicle.id}>
                          {vehicle.plate} ({vehicle.capacity} lug.)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Capacity */}
                <div className="space-y-2">
                  <Label htmlFor="capacity">Capacidade</Label>
                  <Input
                    id="capacity"
                    type="number"
                    value={tripForm.capacity}
                    onChange={(e) => setTripForm({ ...tripForm, capacity: e.target.value })}
                    placeholder="Auto"
                    disabled
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Driver */}
                <div className="space-y-2">
                  <Label htmlFor="driver">Motorista *</Label>
                  <Select
                    value={tripForm.driver_id}
                    onValueChange={(value) => setTripForm({ ...tripForm, driver_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {drivers.map((driver) => (
                        <SelectItem key={driver.id} value={driver.id}>
                          {driver.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Assistant Driver */}
                <div className="space-y-2">
                  <Label htmlFor="assistant_driver">Ajudante</Label>
                  <Select
                    value={tripForm.assistant_driver_id}
                    onValueChange={(value) => setTripForm({ ...tripForm, assistant_driver_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Opcional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Nenhum</SelectItem>
                      {drivers
                        .filter(d => d.id !== tripForm.driver_id)
                        .map((driver) => (
                          <SelectItem key={driver.id} value={driver.id}>
                            {driver.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Departure Time */}
              <div className="space-y-2">
                <Label htmlFor="departure_time">Horário de Saída *</Label>
                <Input
                  id="departure_time"
                  type="time"
                  value={tripForm.departure_time}
                  onChange={(e) => setTripForm({ ...tripForm, departure_time: e.target.value })}
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setTripDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={savingTrip || !tripForm.vehicle_id || !tripForm.driver_id || !tripForm.departure_time}
                >
                  {savingTrip ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Adicionar'
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Boarding Location Modal */}
        <Dialog open={boardingDialogOpen} onOpenChange={setBoardingDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Adicionar Local de Embarque</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddBoarding} className="space-y-4">
              {/* Location */}
              <div className="space-y-2">
                <Label htmlFor="boarding_location">Local *</Label>
                <Select
                  value={boardingForm.boarding_location_id}
                  onValueChange={(value) => setBoardingForm({ ...boardingForm, boarding_location_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um local cadastrado" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBoardingLocations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Departure Time */}
              <div className="space-y-2">
                <Label htmlFor="boarding_time">Horário de Embarque</Label>
                <Input
                  id="boarding_time"
                  type="time"
                  value={boardingForm.departure_time}
                  onChange={(e) => setBoardingForm({ ...boardingForm, departure_time: e.target.value })}
                />
              </div>

              {/* Link to Trip */}
              <div className="space-y-2">
                <Label htmlFor="trip_link">Vincular a Viagem</Label>
                <Select
                  value={boardingForm.trip_id}
                  onValueChange={(value) => setBoardingForm({ ...boardingForm, trip_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas as viagens" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todas as viagens</SelectItem>
                    {eventTrips.map((trip) => (
                      <SelectItem key={trip.id} value={trip.id}>
                        {trip.trip_type === 'ida' ? 'Ida' : 'Volta'} - {trip.departure_time?.slice(0, 5)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Opcional - deixe em branco para disponível em todas
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setBoardingDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={savingBoarding || !boardingForm.boarding_location_id}
                >
                  {savingBoarding ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Adicionar'
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Evento</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir o evento "{eventToDelete?.name}"?
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
}
