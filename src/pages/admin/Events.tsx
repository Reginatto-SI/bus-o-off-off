import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Event, Trip, Vehicle, Driver } from '@/types/database';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

interface TripWithVehicleDriver extends Trip {
  vehicle?: Vehicle;
  driver?: Driver;
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
  
  // Data for trips tab
  const [eventTrips, setEventTrips] = useState<TripWithVehicleDriver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  
  // Trip form modal
  const [tripDialogOpen, setTripDialogOpen] = useState(false);
  const [tripForm, setTripForm] = useState({
    vehicle_id: '',
    driver_id: '',
    departure_time: '',
    capacity: '',
  });
  const [savingTrip, setSavingTrip] = useState(false);

  const [form, setForm] = useState({
    name: '',
    date: '',
    city: '',
    description: '',
    status: 'rascunho' as Event['status'],
  });

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
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          event.name.toLowerCase().includes(searchLower) ||
          event.city.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Status filter
      if (filters.status !== 'all' && event.status !== filters.status) {
        return false;
      }

      return true;
    });
  }, [events, filters]);

  const hasActiveFilters = useMemo(() => {
    return filters.search !== '' || filters.status !== 'all';
  }, [filters]);

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
        driver:drivers(*)
      `)
      .eq('event_id', eventId)
      .order('departure_time', { ascending: true });

    if (error) {
      console.error('Erro ao carregar viagens:', error);
    } else {
      setEventTrips(data as TripWithVehicleDriver[]);
    }
    setLoadingTrips(false);
  };

  const fetchVehiclesAndDrivers = async () => {
    const [vehiclesRes, driversRes] = await Promise.all([
      supabase.from('vehicles').select('*').eq('status', 'ativo').order('plate'),
      supabase.from('drivers').select('*').eq('status', 'ativo').order('name'),
    ]);
    
    if (vehiclesRes.data) setVehicles(vehiclesRes.data as Vehicle[]);
    if (driversRes.data) setDrivers(driversRes.data as Driver[]);
  };

  useEffect(() => {
    fetchEvents();
    fetchVehiclesAndDrivers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    if (!activeCompanyId) {
      const context = { action: editingId ? 'update' : 'insert', table: 'events', companyId: null, userId: user?.id };
      console.error('active_company_id ausente ao salvar evento.', context);
      toast.error(
        buildDebugToastMessage({
          title: 'active_company_id ausente',
          context,
        })
      );
      setSaving(false);
      return;
    }

    const eventData = {
      name: form.name.trim(),
      date: form.date,
      city: form.city.trim(),
      description: form.description || null,
      status: form.status,
      company_id: activeCompanyId,
    };

    let error;
    if (editingId) {
      const { company_id: _companyId, ...updateData } = eventData;
      ({ error } = await supabase.from('events').update(updateData).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('events').insert([eventData]));
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
      setDialogOpen(false);
      resetForm();
      fetchEvents();
    }
    setSaving(false);
  };

  const handleEdit = (event: EventWithTrips) => {
    setEditingId(event.id);
    setForm({
      name: event.name,
      date: event.date,
      city: event.city,
      description: event.description ?? '',
      status: event.status,
    });
    fetchEventTrips(event.id);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!eventToDelete) return;

    const { error } = await supabase.from('events').delete().eq('id', eventToDelete.id);

    if (error) {
      logSupabaseError({
        label: 'Erro ao excluir evento (events.delete)',
        error,
        context: { action: 'delete', table: 'events', companyId: activeCompanyId, userId: user?.id, eventId: eventToDelete.id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao excluir evento',
          error,
          context: { action: 'delete', table: 'events', companyId: activeCompanyId, userId: user?.id },
        })
      );
    } else {
      toast.success('Evento excluído com sucesso');
      fetchEvents();
    }
    setDeleteDialogOpen(false);
    setEventToDelete(null);
  };

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
      vehicle_id: tripForm.vehicle_id,
      driver_id: tripForm.driver_id,
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
      setTripForm({ vehicle_id: '', driver_id: '', departure_time: '', capacity: '' });
      fetchEventTrips(editingId);
      fetchEvents(); // Update count
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

  const resetForm = () => {
    setEditingId(null);
    setEventTrips([]);
    setForm({
      name: '',
      date: '',
      city: '',
      description: '',
      status: 'rascunho',
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
    }

    actions.push({
      label: 'Ver Detalhes',
      icon: ExternalLink,
      onClick: () => {
        window.location.href = `/admin/eventos/${event.id}`;
      },
    });

    // Only allow delete for events without trips (as proxy for no sales)
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

        {/* Event Modal with Tabs */}
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogContent className="admin-modal flex h-[90vh] max-h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 p-0">
            <DialogHeader className="admin-modal__header px-6 py-4 border-b">
              <DialogTitle>{editingId ? 'Editar' : 'Novo'} Evento</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex h-full flex-col overflow-hidden">
              <Tabs defaultValue="geral" className="flex h-full flex-col overflow-hidden">
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
                  {/* Tab Geral */}
                  <TabsContent value="geral" className="mt-0 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="name">Nome do Evento *</Label>
                        <Input
                          id="name"
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                          placeholder="Ex: Festa do Peão de Barretos 2026"
                          required
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
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setTripDialogOpen(true)}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Adicionar Viagem
                          </Button>
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
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {eventTrips.map((trip) => (
                              <Card key={trip.id} className="p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-4 flex-wrap">
                                    <div className="flex items-center gap-2 text-sm">
                                      <Clock className="h-4 w-4 text-muted-foreground" />
                                      <span className="font-medium">{trip.departure_time?.slice(0, 5)}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm">
                                      <Bus className="h-4 w-4 text-muted-foreground" />
                                      <span>{trip.vehicle?.plate ?? 'Veículo não definido'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm">
                                      <Users className="h-4 w-4 text-muted-foreground" />
                                      <span>{trip.capacity} lugares</span>
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteTrip(trip.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </Card>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </TabsContent>

                  {/* Tab Publicação */}
                  <TabsContent value="publicacao" className="mt-0 space-y-4">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="status">Status do Evento</Label>
                        <Select
                          value={form.status}
                          onValueChange={(value: Event['status']) =>
                            setForm({ ...form, status: value })
                          }
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
                    Cancelar
                  </Button>
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
                </div>
              </Tabs>
            </form>
          </DialogContent>
        </Dialog>

        {/* Trip Modal */}
        <Dialog open={tripDialogOpen} onOpenChange={setTripDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Adicionar Viagem</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddTrip} className="space-y-4">
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
                    <SelectValue placeholder="Selecione um veículo" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map((vehicle) => (
                      <SelectItem key={vehicle.id} value={vehicle.id}>
                        {vehicle.plate} - {vehicle.brand} {vehicle.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="driver">Motorista *</Label>
                <Select
                  value={tripForm.driver_id}
                  onValueChange={(value) => setTripForm({ ...tripForm, driver_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um motorista" />
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
              <div className="space-y-2">
                <Label htmlFor="capacity">Capacidade</Label>
                <Input
                  id="capacity"
                  type="number"
                  value={tripForm.capacity}
                  onChange={(e) => setTripForm({ ...tripForm, capacity: e.target.value })}
                  placeholder="Herda do veículo se vazio"
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
