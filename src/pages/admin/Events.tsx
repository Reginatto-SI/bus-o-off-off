import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Event, Trip, Vehicle, Driver, BoardingLocation, EventBoardingLocation, TripType, TripCreationType, EventFee } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatsCard } from '@/components/admin/StatsCard';
import { FilterCard, FilterInput } from '@/components/admin/FilterCard';
import { ActionsDropdown, ActionItem } from '@/components/admin/ActionsDropdown';
import { CityAutocomplete } from '@/components/ui/city-autocomplete';
import { parseCityLabel, formatCityLabel } from '@/lib/cityUtils';
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
  CalendarDays,
  CalendarRange,
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
  Copy,
  Eye,
  Upload,
  GripVertical,
  Archive,
  ArchiveRestore,
  DollarSign,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Save,
  Rocket,
  PartyPopper,
} from 'lucide-react';
import { toast } from 'sonner';
import { addMonths, format, isAfter, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { buildDebugToastMessage, logSupabaseError } from '@/lib/errorDebug';
import { cn } from '@/lib/utils';
import { formatDateOnlyBR, parseDateOnlyAsLocal } from '@/lib/date';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Types
interface EventFilters {
  search: string;
  status: 'all' | 'rascunho' | 'a_venda' | 'encerrado';
  archiveState: 'active' | 'archived';
  startDate: string;
  endDate: string;
  monthYear: 'all' | 'current' | 'next' | string;
  vehicleId: string;
  vehicleType: 'all' | Vehicle['type'];
  driverId: string;
  imageStatus: 'all' | 'with' | 'without';
}

interface EventWithTrips extends Event {
  trips: { vehicle_id: string | null; driver_id: string | null; assistant_driver_id: string | null; capacity?: number }[];
}

interface TripWithDetails extends Trip {
  vehicle?: Vehicle;
  driver?: Driver;
  assistant_driver?: Driver;
}

interface EventBoardingLocationWithDetails extends EventBoardingLocation {
  boarding_location?: BoardingLocation;
  trip?: TripWithDetails;
}

const initialFilters: EventFilters = {
  search: '',
  status: 'all',
  archiveState: 'active',
  startDate: '',
  endDate: '',
  monthYear: 'all',
  vehicleId: 'all',
  vehicleType: 'all',
  driverId: 'all',
  imageStatus: 'all',
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

const vehicleTypeOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'onibus', label: 'Ônibus' },
  { value: 'micro_onibus', label: 'Micro-ônibus' },
  { value: 'van', label: 'Van' },
];

const imageStatusOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'with', label: 'Com imagem' },
  { value: 'without', label: 'Sem imagem' },
];

export default function Events() {
  const { activeCompanyId, user } = useAuth();
  const [events, setEvents] = useState<EventWithTrips[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<EventFilters>(initialFilters);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [eventToArchiveAction, setEventToArchiveAction] = useState<EventWithTrips | null>(null);
  const [activeTab, setActiveTab] = useState('geral');

  // Post-create dialog
  const [isCreateWizardMode, setIsCreateWizardMode] = useState(false);
  const [_publishDecisionDialogOpen, setPublishDecisionDialogOpen] = useState(false);
  const [showStepErrors, setShowStepErrors] = useState(false);
  const [celebrationDialogOpen, setCelebrationDialogOpen] = useState(false);
  const [publishErrorInCelebration, setPublishErrorInCelebration] = useState<string | null>(null);

  // Quick status change
  const [closeEventDialogOpen, setCloseEventDialogOpen] = useState(false);
  const [eventToClose, setEventToClose] = useState<EventWithTrips | null>(null);

  // Sales data for performance indicators
  const [salesByEvent, setSalesByEvent] = useState<Map<string, number>>(new Map());
  
  // Data for trips tab
  const [eventTrips, setEventTrips] = useState<TripWithDetails[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  
  // Data for boarding locations tab
  const [eventBoardingLocations, setEventBoardingLocations] = useState<EventBoardingLocationWithDetails[]>([]);
  const [boardingLocations, setBoardingLocations] = useState<BoardingLocation[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [draggingBoardingId, setDraggingBoardingId] = useState<string | null>(null);
  const [reorderingBoardings, setReorderingBoardings] = useState(false);
  
  // Trip form modal - simplified (time comes from first boarding)
  const [tripDialogOpen, setTripDialogOpen] = useState(false);
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [tripForm, setTripForm] = useState({
    // UX: padrão operacional mais comum no cadastro de evento é criar Ida + Volta juntos.
    trip_creation_type: 'ida_volta' as TripCreationType,
    vehicle_id: '',
    driver_id: '',
    assistant_driver_id: '',
    capacity: '',
  });
  const [savingTrip, setSavingTrip] = useState(false);
  
  // Delete trip dialog with validation
  const [deleteTripDialogOpen, setDeleteTripDialogOpen] = useState(false);
  const [tripToDelete, setTripToDelete] = useState<TripWithDetails | null>(null);
  const [tripDeleteBlockReason, setTripDeleteBlockReason] = useState<string | null>(null);

  // Boarding location form modal
  const [boardingDialogOpen, setBoardingDialogOpen] = useState(false);
  const [editingBoardingId, setEditingBoardingId] = useState<string | null>(null);
  const [boardingForm, setBoardingForm] = useState({
    boarding_location_id: '',
    departure_date: '',
    departure_time: '',
    trip_id: '',
    stop_order: '',
  });
  const [savingBoarding, setSavingBoarding] = useState(false);
  
  // Delete boarding dialog with validation
  const [deleteBoardingDialogOpen, setDeleteBoardingDialogOpen] = useState(false);
  const [boardingToDelete, setBoardingToDelete] = useState<EventBoardingLocationWithDetails | null>(null);
  const [boardingDeleteBlockReason, setBoardingDeleteBlockReason] = useState<string | null>(null);

  // Selected trip for boardings tab
  const [selectedTripIdForBoardings, setSelectedTripIdForBoardings] = useState<string | null>(null);

  // Copy boardings dialog
  const [copyBoardingsDialogOpen, setCopyBoardingsDialogOpen] = useState(false);
  const [invertBoardingsOrder, setInvertBoardingsOrder] = useState(true);
  const [copyingBoardings, setCopyingBoardings] = useState(false);

  // Event fees state
  const [eventFees, setEventFees] = useState<EventFee[]>([]);
  const [loadingFees, setLoadingFees] = useState(false);
  const [feeDialogOpen, setFeeDialogOpen] = useState(false);
  const [editingFeeId, setEditingFeeId] = useState<string | null>(null);
  const [feeForm, setFeeForm] = useState({ name: '', fee_type: 'fixed' as 'fixed' | 'percent', value: '', is_active: true });
  const [savingFee, setSavingFee] = useState(false);

  // Gate Stripe para monetização: bloqueia criação/publicação sem conta conectada.
  const [stripeGateOpen, setStripeGateOpen] = useState(false);
  const [stripeConnecting, setStripeConnecting] = useState(false);
  const [stripeGatePendingAction, setStripeGatePendingAction] = useState<'create_event' | 'publish_from_form' | null>(null);

  // Main form
  const [form, setForm] = useState({
    name: '',
    date: '',
    city: '',
    description: '',
    // Campo público exibido no app mobile em 'Informações e regras'.
    public_info: '',
    status: 'rascunho' as Event['status'],
    unit_price: '',
    max_tickets_per_purchase: '0',
    allow_online_sale: true,
    allow_seller_sale: true,
    image_url: '' as string | null,
  });
  
  // Image upload state
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const pendingImagePreviewUrlRef = useRef<string | null>(null);

  const clearPendingImage = () => {
    if (pendingImagePreviewUrlRef.current) {
      URL.revokeObjectURL(pendingImagePreviewUrlRef.current);
      pendingImagePreviewUrlRef.current = null;
    }
    setPendingImageFile(null);
  };

  // Regras de progressão entre abas (fluxo guiado): evita pulo de etapa e reduz erros de backend.
  const geralMissingFields = useMemo(() => {
    const missing: string[] = [];
    if (!form.name.trim()) missing.push('Nome');
    if (!form.date) missing.push('Data');
    if (!form.city.trim()) missing.push('Cidade');
    return missing;
  }, [form.name, form.date, form.city]);

  const isGeralComplete = geralMissingFields.length === 0;

  const checkStripeConnection = async () => {
    if (!activeCompanyId) {
      toast.error('Empresa não selecionada');
      return false;
    }

    const { data, error } = await supabase
      .from('companies')
      .select('stripe_account_id, stripe_onboarding_complete')
      .eq('id', activeCompanyId)
      .single();

    if (error) {
      toast.error('Não foi possível validar a conexão Stripe da empresa');
      return false;
    }

    return Boolean(data?.stripe_account_id && data?.stripe_onboarding_complete);
  };

  const handleConnectStripeFromGate = async () => {
    if (!activeCompanyId) {
      toast.error('Empresa não selecionada');
      return;
    }

    setStripeConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-connect-account', {
        body: { company_id: activeCompanyId },
      });

      if (error) {
        const errData = data || {};
        throw new Error(errData.error || error.message);
      }

      if (data?.already_complete) {
        toast.success('Sua empresa já está conectada ao Stripe.');
      }

      if (data?.onboarding_url) {
        // Fluxo em mesma aba para retorno automático ao sistema após finalizar onboarding.
        window.location.href = data.onboarding_url;
        return;
      }

      const connected = await checkStripeConnection();
      if (connected) {
        setStripeGateOpen(false);
      }
    } catch (err: any) {
      console.error('Erro ao iniciar Stripe Connect:', err);
      toast.error(err?.message || 'Erro ao conectar com Stripe. Tente novamente.');
    } finally {
      setStripeConnecting(false);
    }
  };

  useEffect(() => {
    if (!stripeGateOpen) return;

    const revalidateStripeStatus = async () => {
      const connected = await checkStripeConnection();
      if (!connected) return;

      setStripeGateOpen(false);

      // Continuidade automática: se estava tentando criar evento, abre modal de cadastro.
      if (stripeGatePendingAction === 'create_event') {
        resetForm();
        setDialogOpen(true);
      }

      setStripeGatePendingAction(null);
      toast.success('Stripe conectado com sucesso. Você já pode continuar.');
    };

    const onFocus = () => {
      revalidateStripeStatus();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [stripeGateOpen, stripeGatePendingAction, activeCompanyId]);
  const hasAtLeastOneFleet = eventTrips.length > 0;
  const hasValidBoarding = eventBoardingLocations.some((boarding) => Boolean(boarding.trip_id));
  const hasTicketsRequirements = parseFloat(form.unit_price || '0') > 0;

  const getTabLockMessage = (tabValue: string, persistedEventId?: string | null): string | null => {
    const effectiveEventId = persistedEventId ?? editingId;
    if (tabValue === 'geral') return null;

    if (tabValue === 'viagens') {
      if (!isGeralComplete) {
        return `Complete ${geralMissingFields.join(', ')} na aba Geral para liberar Frotas.`;
      }
      if (!effectiveEventId) {
        return 'Salve o evento na aba Geral para liberar Frotas.';
      }
      return null;
    }

    if (tabValue === 'embarques') {
      if (!isGeralComplete) {
        return `Complete ${geralMissingFields.join(', ')} na aba Geral para liberar Embarques.`;
      }
      if (!effectiveEventId) {
        return 'Salve o evento na aba Geral para liberar Embarques.';
      }
      if (!hasAtLeastOneFleet) {
        return 'Adicione pelo menos 1 frota para liberar Embarques.';
      }
      return null;
    }

    if (tabValue === 'passagens') {
      if (!isGeralComplete) {
        return `Complete ${geralMissingFields.join(', ')} na aba Geral para liberar Passagens.`;
      }
      if (!effectiveEventId) {
        return 'Salve o evento na aba Geral para liberar Passagens.';
      }
      if (!hasAtLeastOneFleet) {
        return 'Adicione pelo menos 1 frota para liberar Passagens.';
      }
      if (!hasValidBoarding) {
        return 'Crie pelo menos 1 embarque para liberar Passagens.';
      }
      return null;
    }

    if (tabValue === 'publicacao') {
      if (!isGeralComplete) {
        return `Complete ${geralMissingFields.join(', ')} na aba Geral para liberar Publicação.`;
      }
      if (!effectiveEventId) {
        return 'Salve o evento na aba Geral para liberar Publicação.';
      }
      if (!hasAtLeastOneFleet) {
        return 'Adicione pelo menos 1 frota para liberar Publicação.';
      }
      if (!hasValidBoarding) {
        return 'Crie pelo menos 1 embarque para liberar Publicação.';
      }
      if (!hasTicketsRequirements) {
        return 'Defina o preço da passagem para liberar Publicação.';
      }
      return null;
    }

    return null;
  };

  const handleTabChange = (nextTab: string) => {
    const lockMessage = getTabLockMessage(nextTab);
    if (lockMessage) {
      toast.error(lockMessage);
      return;
    }
    setShowStepErrors(false);
    setActiveTab(nextTab);
  };

  const WIZARD_TABS_ORDER = ['geral', 'viagens', 'embarques', 'passagens', 'publicacao'] as const;
  const WIZARD_TAB_LABELS: Record<string, string> = {
    geral: 'Geral',
    viagens: 'Frotas',
    embarques: 'Embarques',
    passagens: 'Passagens',
    publicacao: 'Publicação',
  };

  const getNextWizardTab = (currentTab: string): string | null => {
    const currentIndex = WIZARD_TABS_ORDER.indexOf(currentTab as any);
    if (currentIndex < 0 || currentIndex === WIZARD_TABS_ORDER.length - 1) return null;
    return WIZARD_TABS_ORDER[currentIndex + 1];
  };

  const getPreviousWizardTab = (currentTab: string): string | null => {
    const currentIndex = WIZARD_TABS_ORDER.indexOf(currentTab as any);
    if (currentIndex <= 0) return null;
    return WIZARD_TABS_ORDER[currentIndex - 1];
  };

  const getStepNumber = (tab: string): number => {
    const idx = WIZARD_TABS_ORDER.indexOf(tab as any);
    return idx >= 0 ? idx + 1 : 1;
  };

  const isStepComplete = (tab: string): boolean => {
    if (tab === 'geral') return isGeralComplete;
    if (tab === 'viagens') return hasAtLeastOneFleet;
    if (tab === 'embarques') return hasValidBoarding;
    if (tab === 'passagens') return hasTicketsRequirements;
    if (tab === 'publicacao') return publishChecklist.valid;
    return false;
  };

  const getCurrentStepErrors = (tab: string): string[] => {
    if (tab === 'geral') return geralMissingFields.length > 0 ? [`Preencha: ${geralMissingFields.join(', ')}`] : [];
    if (tab === 'viagens') return !hasAtLeastOneFleet ? ['Adicione pelo menos 1 frota/transporte'] : [];
    if (tab === 'embarques') return !hasValidBoarding ? ['Crie pelo menos 1 embarque vinculado a uma frota'] : [];
    if (tab === 'passagens') return !hasTicketsRequirements ? ['Defina o preço da passagem (maior que zero)'] : [];
    return [];
  };

  // Computed: can publish checklist - only requires IDA with boarding
  const publishChecklist = useMemo(() => {
    const hasName = form.name.trim() !== '';
    const hasDate = form.date !== '';
    const hasCity = form.city.trim() !== '';
    const hasTrips = eventTrips.length > 0;
    const hasPrice = parseFloat(form.unit_price || '0') > 0;
    
    // NEW: At least one IDA trip must have boarding (volta is optional)
    const hasIdaWithBoarding = eventTrips.some(trip => 
      trip.trip_type === 'ida' && 
      eventBoardingLocations.some(ebl => ebl.trip_id === trip.id)
    );
    
    // If no IDA trips exist, accept any boarding
    const hasBoardingForPublish = eventTrips.some(t => t.trip_type === 'ida')
      ? hasIdaWithBoarding
      : eventBoardingLocations.length > 0;

    return {
      valid: hasName && hasDate && hasCity && hasTrips && hasBoardingForPublish && hasPrice,
      checks: {
        hasName,
        hasDate,
        hasCity,
        hasTrips,
        hasBoardingLocations: hasBoardingForPublish,
        hasPrice,
      },
    };
  }, [form, eventTrips, eventBoardingLocations]);

  // Computed: is read-only (encerrado)
  const isReadOnly = form.status === 'encerrado';

  // Stats calculations
  const stats = useMemo(() => {
    // KPIs do topo representam apenas eventos ativos para manter a leitura operacional da tela.
    const activeEvents = events.filter((e) => !e.is_archived);
    const total = activeEvents.length;
    const rascunhos = activeEvents.filter((e) => e.status === 'rascunho').length;
    const aVenda = activeEvents.filter((e) => e.status === 'a_venda').length;
    const encerrados = activeEvents.filter((e) => e.status === 'encerrado').length;
    return { total, rascunhos, aVenda, encerrados };
  }, [events]);

  const vehiclesById = useMemo(() => {
    return new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  }, [vehicles]);

  // Opções rápidas de mês/ano para o filtro avançado.
  const monthYearOptions = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, index) => addMonths(now, index));

    const customMonths = months.map((date) => ({
      value: format(date, 'yyyy-MM'),
      label: format(date, 'MMMM/yyyy', { locale: ptBR }),
    }));

    return [
      { value: 'all', label: 'Todos' },
      { value: 'current', label: 'Mês atual' },
      { value: 'next', label: 'Próximo mês' },
      ...customMonths,
    ];
  }, []);

  const vehicleOptions = useMemo(() => {
    return [
      { value: 'all', label: 'Todos' },
      ...vehicles.map((vehicle) => ({
        value: vehicle.id,
        label: `${vehicleTypeLabels[vehicle.type] ?? vehicle.type} • ${vehicle.plate}`,
      })),
    ];
  }, [vehicles]);

  const driverOptions = useMemo(() => {
    return [
      { value: 'all', label: 'Todos' },
      ...drivers.map((driver) => ({
        value: driver.id,
        label: driver.name,
      })),
    ];
  }, [drivers]);

  // Filtered events
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      // Evita parse UTC de date-only (YYYY-MM-DD) que causa -1 dia em fuso BR.
      const eventDate = event.date ? parseDateOnlyAsLocal(event.date) : null;

      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          event.name.toLowerCase().includes(searchLower) ||
          event.city.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Arquivamento é controle administrativo separado do status operacional.
      const shouldShowArchived = filters.archiveState === 'archived';
      if (event.is_archived !== shouldShowArchived) return false;

      if (filters.status !== 'all' && event.status !== filters.status) {
        return false;
      }

      // Regra: evento só aparece se estiver dentro do período filtrado.
      if (filters.startDate) {
        const startDate = parseDateOnlyAsLocal(filters.startDate);
        if (!eventDate || isBefore(eventDate, startDate)) {
          return false;
        }
      }

      if (filters.endDate) {
        const endDate = parseDateOnlyAsLocal(filters.endDate);
        if (!eventDate || isAfter(eventDate, endDate)) {
          return false;
        }
      }

      if (filters.monthYear !== 'all') {
        if (!eventDate) return false;
        const targetMonth =
          filters.monthYear === 'current'
            ? format(new Date(), 'yyyy-MM')
            : filters.monthYear === 'next'
              ? format(addMonths(new Date(), 1), 'yyyy-MM')
              : filters.monthYear;
        if (format(eventDate, 'yyyy-MM') !== targetMonth) {
          return false;
        }
      }

      if (filters.vehicleId !== 'all') {
        const hasVehicle = event.trips?.some((trip) => trip.vehicle_id === filters.vehicleId);
        if (!hasVehicle) return false;
      }

      if (filters.vehicleType !== 'all') {
        const hasVehicleType = event.trips?.some((trip) => {
          if (!trip.vehicle_id) return false;
          return vehiclesById.get(trip.vehicle_id)?.type === filters.vehicleType;
        });
        if (!hasVehicleType) return false;
      }

      if (filters.driverId !== 'all') {
        const hasDriver = event.trips?.some((trip) => (
          trip.driver_id === filters.driverId ||
          trip.assistant_driver_id === filters.driverId
        ));
        if (!hasDriver) return false;
      }

      if (filters.imageStatus !== 'all') {
        const hasImage = Boolean(event.image_url);
        if (filters.imageStatus === 'with' && !hasImage) return false;
        if (filters.imageStatus === 'without' && hasImage) return false;
      }

      return true;
    });
  }, [events, filters, vehiclesById]);

  const hasActiveFilters = useMemo(() => {
    return (
      filters.search !== '' ||
      filters.status !== 'all' ||
      filters.archiveState !== 'active' ||
      filters.startDate !== '' ||
      filters.endDate !== '' ||
      filters.monthYear !== 'all' ||
      filters.vehicleId !== 'all' ||
      filters.vehicleType !== 'all' ||
      filters.driverId !== 'all' ||
      filters.imageStatus !== 'all'
    );
  }, [filters]);

  // Count unique vehicles (fleets) - not counting ida+volta as separate
  const uniqueFleets = useMemo(() => {
    const uniqueVehicleIds = new Set(eventTrips.map(t => t.vehicle_id));
    return uniqueVehicleIds.size;
  }, [eventTrips]);

  // Correct capacity: sum only once per vehicle (not duplicating ida+volta)
  const correctTotalCapacity = useMemo(() => {
    const vehicleCapacities = new Map<string, number>();
    eventTrips.forEach(trip => {
      if (trip.vehicle_id && !vehicleCapacities.has(trip.vehicle_id)) {
        vehicleCapacities.set(trip.vehicle_id, trip.capacity || 0);
      }
    });
    return Array.from(vehicleCapacities.values()).reduce((sum, cap) => sum + cap, 0);
  }, [eventTrips]);

  // Fetch functions
  // Guard: não buscar sem empresa ativa (isolamento multi-tenant obrigatório)
  const fetchEvents = async () => {
    if (!activeCompanyId) return;
    const { data, error } = await supabase
      .from('events')
      .select(`
        *,
        trips:trips(vehicle_id, driver_id, assistant_driver_id, capacity)
      `)
      .eq('company_id', activeCompanyId)
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

  const fetchSalesData = async () => {
    if (!activeCompanyId) return;
    const { data: salesData } = await supabase
      .from('sales')
      .select('event_id, quantity')
      .eq('company_id', activeCompanyId)
      .in('status', ['reservado', 'pago']);

    const map = new Map<string, number>();
    salesData?.forEach(sale => {
      const current = map.get(sale.event_id) || 0;
      map.set(sale.event_id, current + sale.quantity);
    });
    setSalesByEvent(map);
  };

  // Count unique vehicles (fleets) for card display
  const getFleetCount = (event: EventWithTrips) => {
    if (!event.trips || !Array.isArray(event.trips)) return 0;
    const uniqueVehicles = new Set(
      event.trips
        .filter((t: { vehicle_id: string }) => t.vehicle_id)
        .map((t: { vehicle_id: string }) => t.vehicle_id)
    );
    return uniqueVehicles.size;
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
      .order('stop_order', { ascending: true });

    if (error) {
      console.error('Erro ao carregar locais de embarque:', error);
    } else {
      setEventBoardingLocations((data || []) as EventBoardingLocationWithDetails[]);
    }
    setLoadingLocations(false);
  };

  const fetchVehiclesAndDrivers = async () => {
    if (!activeCompanyId) return;
    const [vehiclesRes, driversRes, locationsRes] = await Promise.all([
      supabase.from('vehicles').select('*').eq('company_id', activeCompanyId).eq('status', 'ativo').order('plate'),
      supabase.from('drivers').select('*').eq('company_id', activeCompanyId).eq('status', 'ativo').order('name'),
      supabase.from('boarding_locations').select('*').eq('company_id', activeCompanyId).eq('status', 'ativo').order('name'),
    ]);
    
    if (vehiclesRes.data) setVehicles(vehiclesRes.data as Vehicle[]);
    if (driversRes.data) setDrivers(driversRes.data as Driver[]);
    if (locationsRes.data) setBoardingLocations(locationsRes.data as BoardingLocation[]);
  };

  const fetchEventFees = async (eventId: string) => {
    setLoadingFees(true);
    const { data } = await supabase
      .from('event_fees')
      .select('*')
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true });
    setEventFees((data || []) as unknown as EventFee[]);
    setLoadingFees(false);
  };

  // Recarrega ao trocar empresa ativa (isolamento multi-tenant)
  useEffect(() => {
    if (activeCompanyId) {
      fetchEvents();
      fetchVehiclesAndDrivers();
      fetchSalesData();
    }
  }, [activeCompanyId]);

  useEffect(() => {
    return () => {
      if (pendingImagePreviewUrlRef.current) {
        URL.revokeObjectURL(pendingImagePreviewUrlRef.current);
      }
    };
  }, []);

  // Load event data when editing
  const loadEventData = async (eventId: string) => {
    await Promise.all([
      fetchEventTrips(eventId),
      fetchEventBoardingLocations(eventId),
      fetchEventFees(eventId),
    ]);
  };

  // Handlers
  const persistEvent = async (targetStatus: 'rascunho' | 'a_venda' | 'encerrado') => {
    if (!activeCompanyId) {
      toast.error('Empresa não selecionada');
      return { error: true, eventId: editingId, isNew: false };
    }

    // Publicação gera receita: exige Stripe conectado antes de seguir.
    if (targetStatus === 'a_venda') {
      const hasStripe = await checkStripeConnection();
      if (!hasStripe) {
        setStripeGatePendingAction('publish_from_form');
        setStripeGateOpen(true);
        return { error: true, eventId: editingId, isNew: false };
      }
    }

    // Validate if trying to publish
    if (targetStatus === 'a_venda' && !publishChecklist.valid) {
      toast.error('Corrija os itens pendentes antes de publicar o evento');
      setActiveTab('publicacao');
      return { error: true, eventId: editingId, isNew: false };
    }

    const eventData = {
      name: form.name.trim(),
      date: form.date,
      city: form.city.trim(),
      description: form.description || null,
      public_info: form.public_info || null,
      status: targetStatus,
      unit_price: parseFloat(form.unit_price || '0'),
      max_tickets_per_purchase: parseInt(form.max_tickets_per_purchase || '5', 10),
      allow_online_sale: form.allow_online_sale,
      allow_seller_sale: form.allow_seller_sale,
      company_id: activeCompanyId,
    };

    let error;
    let newEventId = editingId;
    const isCreating = !editingId;

    if (editingId) {
      const { company_id: _companyId, ...updateData } = eventData;
      ({ error } = await supabase.from('events').update(updateData).eq('id', editingId));
    } else {
      const { data, error: insertError } = await supabase.from('events').insert([eventData]).select('id').single();
      error = insertError;
      if (data) newEventId = data.id;
    }

    if (!error && pendingImageFile && newEventId) {
      setUploadingImage(true);
      const fileExt = pendingImageFile.name.split('.').pop();
      const fileName = `${newEventId}-${Date.now()}.${fileExt}`;

      // Upload adiado: evita exigir rascunho prévio e impede lixo em storage ao cancelar modal.
      const { error: uploadError } = await supabase.storage
        .from('event-images')
        .upload(fileName, pendingImageFile, { upsert: false });

      if (uploadError) {
        error = uploadError;
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('event-images')
          .getPublicUrl(fileName);

        const { error: imageUpdateError } = await supabase
          .from('events')
          .update({ image_url: publicUrl })
          .eq('id', newEventId);

        if (imageUpdateError) {
          error = imageUpdateError;
          await supabase.storage.from('event-images').remove([fileName]);
        } else {
          clearPendingImage();
          setForm((prev) => ({ ...prev, image_url: publicUrl }));
        }
      }
      setUploadingImage(false);
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
      return { error: true, eventId: newEventId, isNew: false };
    }

    if (isCreating && newEventId) {
      setEditingId(newEventId);
      await loadEventData(newEventId);
    }

    fetchEvents();
    fetchSalesData();
    return { error: false, eventId: newEventId, isNew: isCreating };
  };

  const handleWizardAdvance = async () => {
    const nextTab = getNextWizardTab(activeTab);
    if (!nextTab) return;

    // Validate current step
    const errors = getCurrentStepErrors(activeTab);
    if (errors.length > 0) {
      setShowStepErrors(true);
      return;
    }

    setSaving(true);
    setShowStepErrors(false);
    // Fluxo wizard: salva progresso técnico como rascunho sem pedir status ao usuário.
    const result = await persistEvent('rascunho');
    setSaving(false);

    if (result.error) return;

    const lockMessage = getTabLockMessage(nextTab, result.eventId ?? null);
    if (lockMessage) {
      toast.error(lockMessage);
      return;
    }

    setActiveTab(nextTab);
  };

  const handleWizardFinalize = async () => {
    // Check if all checklist items are valid
    if (!publishChecklist.valid) {
      setShowStepErrors(true);
      return;
    }

    // Save as draft first
    setSaving(true);
    const result = await persistEvent('rascunho');
    setSaving(false);

    if (result.error) return;

    // Open celebration dialog
    setPublishErrorInCelebration(null);
    setCelebrationDialogOpen(true);
  };

  const handleCelebrationPublish = async () => {
    setSaving(true);
    const result = await persistEvent('a_venda');
    setSaving(false);

    if (result.error) {
      setPublishErrorInCelebration('Não foi possível publicar. Verifique as pendências e tente novamente.');
      return;
    }

    setCelebrationDialogOpen(false);
    setDialogOpen(false);
    resetForm();
    toast.success('Evento publicado com sucesso! Já está visível no portal.', {
      duration: 4000,
      icon: '🚀',
    });
  };

  const handleCelebrationDraft = () => {
    setCelebrationDialogOpen(false);
    setDialogOpen(false);
    resetForm();
    toast.success('Evento salvo como rascunho');
  };

  const handleCelebrationGoToList = () => {
    setCelebrationDialogOpen(false);
    setDialogOpen(false);
    resetForm();
  };

  const _handleFinalizeWizard = async (targetStatus: Event['status']) => {
    setPublishDecisionDialogOpen(false);
    setSaving(true);
    const result = await persistEvent(targetStatus);
    setSaving(false);

    if (result.error) return;

    toast.success(targetStatus === 'a_venda' ? 'Evento publicado com sucesso' : 'Evento salvo como rascunho');
    setDialogOpen(false);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // No modo wizard de criação, o submit final é sempre mediado pelo popup celebrativo.
    if (isCreateWizardMode) {
      if (activeTab !== 'publicacao') {
        await handleWizardAdvance();
        return;
      }
      await handleWizardFinalize();
      return;
    }

    setSaving(true);
    const result = await persistEvent(form.status);
    setSaving(false);

    if (result.error) return;

    toast.success(editingId ? 'Evento atualizado com sucesso' : 'Evento criado com sucesso');
    setDialogOpen(false);
    resetForm();
  };

  const handleEdit = async (event: EventWithTrips) => {
    setIsCreateWizardMode(false);
    setEditingId(event.id);
    setForm({
      name: event.name,
      date: event.date,
      city: event.city,
      description: event.description ?? '',
      public_info: event.public_info ?? '',
      status: event.status,
      unit_price: event.unit_price?.toString() ?? '0',
      max_tickets_per_purchase: event.max_tickets_per_purchase?.toString() ?? '0',
      allow_online_sale: event.allow_online_sale ?? true,
      allow_seller_sale: event.allow_seller_sale ?? true,
      image_url: (event as any).image_url ?? null,
    });
    setActiveTab('geral');
    loadEventData(event.id);
    setPublishDecisionDialogOpen(false);
    setDialogOpen(true);
  };

  const handleArchiveToggle = async () => {
    if (!eventToArchiveAction) return;
    if (!activeCompanyId) {
      toast.error('Empresa ativa não encontrada para arquivar o evento');
      return;
    }

    const willArchive = !eventToArchiveAction.is_archived;

    const { error } = await supabase
      .from('events')
      // Segurança extra no client: limita update ao tenant ativo e nunca altera status operacional.
      .update({
        is_archived: willArchive,
        // Ao arquivar, bloqueamos venda online para evitar exposição operacional indevida.
        allow_online_sale: willArchive ? false : eventToArchiveAction.allow_online_sale,
      })
      .eq('id', eventToArchiveAction.id)
      .eq('company_id', activeCompanyId);

    if (error) {
      toast.error(willArchive ? 'Erro ao arquivar evento' : 'Erro ao reativar evento');
    } else {
      toast.success(willArchive ? 'Evento arquivado com sucesso' : 'Evento reativado com sucesso');
      fetchEvents();
      fetchSalesData();
    }

    setArchiveDialogOpen(false);
    setEventToArchiveAction(null);
  };

  // Trip handlers
  // Helper function for dropdown (without time)
  const getTripLabelWithoutTime = (trip: TripWithDetails) => {
    const type = trip.trip_type === 'ida' ? 'Ida' : 'Volta';
    const vehicleType = trip.vehicle 
      ? vehicleTypeLabels[trip.vehicle.type] 
      : 'Veículo';
    const plate = trip.vehicle?.plate ?? '???';
    const capacity = trip.capacity;
    const driver = trip.driver?.name ?? 'Motorista não definido';
    
    return `${type} • ${vehicleType} ${plate} • ${capacity} lug. • Motorista: ${driver}`;
  };

  const handleBoardingDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    boardingId: string
  ) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', boardingId);
    setDraggingBoardingId(boardingId);
  };

  const handleBoardingDragEnd = () => {
    setDraggingBoardingId(null);
  };

  const handleBoardingDrop = async (
    event: React.DragEvent<HTMLDivElement>,
    targetId: string,
    scopedBoardings: EventBoardingLocationWithDetails[]
  ) => {
    event.preventDefault();
    if (!editingId || !selectedTripIdForBoardings || reorderingBoardings) return;

    const sourceId = draggingBoardingId || event.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === targetId) return;

    const currentOrder = [...scopedBoardings];
    const sourceIndex = currentOrder.findIndex((ebl) => ebl.id === sourceId);
    const targetIndex = currentOrder.findIndex((ebl) => ebl.id === targetId);

    if (sourceIndex === -1 || targetIndex === -1) return;

    const [moved] = currentOrder.splice(sourceIndex, 1);
    currentOrder.splice(targetIndex, 0, moved);

    const updatedOrder = currentOrder.map((ebl, index) => ({
      ...ebl,
      stop_order: index + 1,
    }));

    // Atualiza o estado local para refletir imediatamente a nova ordem.
    setEventBoardingLocations((prev) =>
      prev.map((ebl) => {
        const updated = updatedOrder.find((item) => item.id === ebl.id);
        return updated ? { ...ebl, stop_order: updated.stop_order } : ebl;
      })
    );

    setReorderingBoardings(true);

    // Persistimos a ordem da viagem selecionada (1..N) para evitar buracos.
    // Usamos update individual pois upsert requer todos os campos obrigatórios
    const updatePromises = updatedOrder.map((ebl) =>
      supabase
        .from('event_boarding_locations')
        .update({ stop_order: ebl.stop_order })
        .eq('id', ebl.id)
    );

    const results = await Promise.all(updatePromises);
    const error = results.find((r) => r.error)?.error;

    if (error) {
      toast.error('Erro ao reordenar embarques');
      console.error(error);
      fetchEventBoardingLocations(editingId);
    }

    setReorderingBoardings(false);
  };
  
  // Edit trip handler
  const handleEditTrip = (trip: TripWithDetails) => {
    setEditingTripId(trip.id);
    setTripForm({
      trip_creation_type: trip.trip_type as TripCreationType,
      vehicle_id: trip.vehicle_id,
      driver_id: trip.driver_id,
      assistant_driver_id: trip.assistant_driver_id ?? '',
      capacity: trip.capacity.toString(),
    });
    setTripDialogOpen(true);
  };

  const handleSaveTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !activeCompanyId) return;
    
    setSavingTrip(true);

    const selectedVehicle = vehicles.find(v => v.id === tripForm.vehicle_id);
    const capacity = tripForm.capacity 
      ? parseInt(tripForm.capacity, 10) 
      : selectedVehicle?.capacity ?? 0;

    const assistantDriverId = tripForm.assistant_driver_id && tripForm.assistant_driver_id !== '__none__' 
      ? tripForm.assistant_driver_id 
      : null;

    try {
      if (editingTripId) {
        // EDITING existing trip
        const updateData = {
          vehicle_id: tripForm.vehicle_id,
          driver_id: tripForm.driver_id,
          assistant_driver_id: assistantDriverId,
          capacity,
        };

        const { error } = await supabase
          .from('trips')
          .update(updateData)
          .eq('id', editingTripId);

        if (error) throw error;
        toast.success('Viagem atualizada');
        setEditingTripId(null);
      } else if (tripForm.trip_creation_type === 'ida_volta') {
        // Create both trips (ida + volta) with pairing - NO departure_time
        const idaTripData = {
          event_id: editingId,
          trip_type: 'ida' as TripType,
          vehicle_id: tripForm.vehicle_id,
          driver_id: tripForm.driver_id,
          assistant_driver_id: assistantDriverId,
          departure_time: null, // Will be set from first boarding
          capacity,
          company_id: activeCompanyId,
        };

        const { data: idaTrip, error: idaError } = await supabase
          .from('trips')
          .insert([idaTripData])
          .select('id')
          .single();

        if (idaError) throw idaError;

        const voltaTripData = {
          event_id: editingId,
          trip_type: 'volta' as TripType,
          vehicle_id: tripForm.vehicle_id,
          driver_id: tripForm.driver_id,
          assistant_driver_id: assistantDriverId,
          departure_time: null, // Will be set from first boarding
          paired_trip_id: idaTrip.id,
          capacity,
          company_id: activeCompanyId,
        };

        const { data: voltaTrip, error: voltaError } = await supabase
          .from('trips')
          .insert([voltaTripData])
          .select('id')
          .single();

        if (voltaError) throw voltaError;

        // Update ida trip with volta pair
        await supabase
          .from('trips')
          .update({ paired_trip_id: voltaTrip.id })
          .eq('id', idaTrip.id);

        toast.success('Viagens de Ida e Volta criadas e vinculadas');
      } else {
        // Single trip creation - NO departure_time
        const tripData = {
          event_id: editingId,
          trip_type: tripForm.trip_creation_type as TripType,
          vehicle_id: tripForm.vehicle_id,
          driver_id: tripForm.driver_id,
          assistant_driver_id: assistantDriverId,
          departure_time: null, // Will be set from first boarding
          capacity,
          company_id: activeCompanyId,
        };

        const { error } = await supabase.from('trips').insert([tripData]);
        if (error) throw error;

        toast.success('Viagem adicionada');
      }

      setTripDialogOpen(false);
      resetTripForm();
      fetchEventTrips(editingId);
      fetchEvents();
    } catch (error) {
      toast.error('Erro ao salvar viagem');
      console.error(error);
    }
    setSavingTrip(false);
  };

  const resetTripForm = () => {
    setEditingTripId(null);
    setTripForm({ 
      trip_creation_type: 'ida_volta', 
      vehicle_id: '', 
      driver_id: '', 
      assistant_driver_id: '',
      capacity: '' 
    });
  };

  // Delete trip with validation
  const confirmDeleteTrip = async (trip: TripWithDetails) => {
    // Check if trip has linked boardings
    const tripBoardings = eventBoardingLocations.filter(ebl => ebl.trip_id === trip.id);
    
    if (tripBoardings.length > 0) {
      setTripDeleteBlockReason(
        `Esta viagem possui ${tripBoardings.length} embarque(s) vinculado(s). ` +
        `Remova ou realoque os embarques antes de excluir.`
      );
      setTripToDelete(trip);
      setDeleteTripDialogOpen(true);
      return;
    }

    // Check if trip has sales
    const { data: sales } = await supabase
      .from('sales')
      .select('id')
      .eq('trip_id', trip.id)
      .limit(1);

    if (sales && sales.length > 0) {
      setTripDeleteBlockReason(
        `Esta viagem possui passagens vendidas ou reservadas. ` +
        `Não é possível excluir. Considere marcar o evento como encerrado.`
      );
      setTripToDelete(trip);
      setDeleteTripDialogOpen(true);
      return;
    }

    // No blocks - confirm deletion
    setTripDeleteBlockReason(null);
    setTripToDelete(trip);
    setDeleteTripDialogOpen(true);
  };

  const handleDeleteTripConfirmed = async () => {
    if (!tripToDelete || tripDeleteBlockReason || !editingId) return;
    
    const { error } = await supabase.from('trips').delete().eq('id', tripToDelete.id);

    if (error) {
      toast.error('Erro ao excluir viagem');
    } else {
      toast.success('Viagem excluída');
      fetchEventTrips(editingId);
      fetchEvents();
    }
    setDeleteTripDialogOpen(false);
    setTripToDelete(null);
  };

  // Boarding location handlers
  // Edit boarding handler
  const handleEditBoarding = (boarding: EventBoardingLocationWithDetails) => {
    setEditingBoardingId(boarding.id);
    setBoardingForm({
      boarding_location_id: boarding.boarding_location_id,
      departure_date: boarding.departure_date ?? '',
      departure_time: boarding.departure_time ?? '',
      trip_id: boarding.trip_id ?? '',
      stop_order: boarding.stop_order?.toString() ?? '',
    });
    setBoardingDialogOpen(true);
  };

  // Open boarding dialog with pre-selected trip
  const handleOpenBoardingDialog = () => {
    setEditingBoardingId(null);
    setBoardingForm({
      boarding_location_id: '',
      departure_date: form.date || '',
      departure_time: '',
      trip_id: selectedTripIdForBoardings || '',
      stop_order: '',
    });
    setBoardingDialogOpen(true);
  };

  // Save boarding (create or edit)
  const handleSaveBoarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !activeCompanyId) return;
    
    setSavingBoarding(true);

    const tripId = boardingForm.trip_id && boardingForm.trip_id !== '__none__' 
      ? boardingForm.trip_id 
      : null;

    // Calculate next stop_order for this trip
    const existingBoardings = eventBoardingLocations.filter(
      ebl => ebl.trip_id === tripId && ebl.id !== editingBoardingId
    );
    const nextOrder = boardingForm.stop_order 
      ? parseInt(boardingForm.stop_order, 10)
      : existingBoardings.length + 1;

    if (editingBoardingId) {
      // EDITING existing boarding
      const updateData = {
        boarding_location_id: boardingForm.boarding_location_id,
        departure_date: boardingForm.departure_date || null,
        departure_time: boardingForm.departure_time || null,
        trip_id: tripId,
        stop_order: nextOrder,
      };

      const { error } = await supabase
        .from('event_boarding_locations')
        .update(updateData)
        .eq('id', editingBoardingId);

      if (error) {
        toast.error('Erro ao atualizar local de embarque');
        console.error(error);
      } else {
        toast.success('Local de embarque atualizado');
        setBoardingDialogOpen(false);
        setEditingBoardingId(null);
        setBoardingForm({ boarding_location_id: '', departure_date: '', departure_time: '', trip_id: '', stop_order: '' });
        fetchEventBoardingLocations(editingId);
      }
    } else {
      // CREATING new boarding
      const boardingData = {
        event_id: editingId,
        boarding_location_id: boardingForm.boarding_location_id,
        departure_date: boardingForm.departure_date || null,
        departure_time: boardingForm.departure_time || null,
        trip_id: tripId,
        stop_order: nextOrder,
        company_id: activeCompanyId,
      };

      const { error } = await supabase.from('event_boarding_locations').insert([boardingData]);

      if (error) {
        toast.error('Erro ao adicionar local de embarque');
        console.error(error);
      } else {
        toast.success('Local de embarque adicionado');
        setBoardingDialogOpen(false);
        setBoardingForm({ boarding_location_id: '', departure_date: '', departure_time: '', trip_id: '', stop_order: '' });
        fetchEventBoardingLocations(editingId);
      }
    }
    setSavingBoarding(false);
  };

  // Confirm delete boarding with validation
  const confirmDeleteBoarding = async (boarding: EventBoardingLocationWithDetails) => {
    // Check if boarding has linked sales
    const { data: sales } = await supabase
      .from('sales')
      .select('id')
      .eq('boarding_location_id', boarding.boarding_location_id)
      .eq('trip_id', boarding.trip_id)
      .limit(1);

    if (sales && sales.length > 0) {
      setBoardingDeleteBlockReason(
        `Este local de embarque possui passageiros vinculados. ` +
        `Não é possível excluir.`
      );
      setBoardingToDelete(boarding);
      setDeleteBoardingDialogOpen(true);
      return;
    }

    // No blocks - confirm deletion
    setBoardingDeleteBlockReason(null);
    setBoardingToDelete(boarding);
    setDeleteBoardingDialogOpen(true);
  };

  const handleDeleteBoardingConfirmed = async () => {
    if (!boardingToDelete || boardingDeleteBlockReason || !editingId) return;
    
    const { error } = await supabase
      .from('event_boarding_locations')
      .delete()
      .eq('id', boardingToDelete.id);

    if (error) {
      toast.error('Erro ao excluir local de embarque');
    } else {
      toast.success('Local de embarque excluído');
      fetchEventBoardingLocations(editingId);
    }
    setDeleteBoardingDialogOpen(false);
    setBoardingToDelete(null);
  };

  // Copy boardings from ida to volta
  const handleCopyBoardingsFromIda = async () => {
    if (!selectedTripIdForBoardings || !editingId || !activeCompanyId) return;
    
    setCopyingBoardings(true);
    
    // Find the selected trip (should be volta)
    const selectedTrip = eventTrips.find(t => t.id === selectedTripIdForBoardings);
    if (!selectedTrip || selectedTrip.trip_type !== 'volta') {
      toast.error('Selecione uma viagem de volta para copiar embarques');
      setCopyingBoardings(false);
      return;
    }

    // Find ida trip (paired or first ida)
    const idaTrip = selectedTrip.paired_trip_id 
      ? eventTrips.find(t => t.id === selectedTrip.paired_trip_id)
      : eventTrips.find(t => t.trip_type === 'ida');
    
    if (!idaTrip) {
      toast.error('Nenhuma viagem de ida encontrada');
      setCopyingBoardings(false);
      return;
    }
    
    // Get ida boardings
    const idaBoardings = eventBoardingLocations
      .filter(ebl => ebl.trip_id === idaTrip.id)
      .sort((a, b) => (a.stop_order || 1) - (b.stop_order || 1));
    
    if (idaBoardings.length === 0) {
      toast.error('A viagem de ida não possui embarques');
      setCopyingBoardings(false);
      return;
    }
    
    // Prepare new boardings (optionally inverted)
    const newBoardings = idaBoardings.map((ebl, index) => ({
      event_id: editingId,
      boarding_location_id: ebl.boarding_location_id,
      trip_id: selectedTripIdForBoardings,
      // Regra de UX: copiamos apenas os locais; horário da volta fica para ajuste manual.
      departure_time: null,
      stop_order: invertBoardingsOrder 
        ? idaBoardings.length - index 
        : index + 1,
      company_id: activeCompanyId,
    }));
    
    const { error } = await supabase
      .from('event_boarding_locations')
      // Se o usuário repetir a ação, atualizamos ordem/horário da mesma viagem em vez de falhar.
      .upsert(newBoardings, { onConflict: 'event_id,trip_id,boarding_location_id' });
    
    if (error) {
      logSupabaseError({
        label: 'Erro ao copiar embarques da ida para volta (event_boarding_locations.upsert)',
        error,
        context: {
          action: 'upsert',
          table: 'event_boarding_locations',
          eventId: editingId,
          fromTripId: idaTrip.id,
          toTripId: selectedTripIdForBoardings,
          companyId: activeCompanyId,
          userId: user?.id,
        },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao copiar embarques',
          error,
          context: {
            action: 'upsert',
            table: 'event_boarding_locations',
            eventId: editingId,
            fromTripId: idaTrip.id,
            toTripId: selectedTripIdForBoardings,
          },
        })
      );
    } else {
      toast.success(`${newBoardings.length} locais copiados da ida`);
      setCopyBoardingsDialogOpen(false);
      fetchEventBoardingLocations(editingId);
    }
    
    setCopyingBoardings(false);
  };

  const resetForm = () => {
    clearPendingImage();
    setEditingId(null);
    setIsCreateWizardMode(false);
    setPublishDecisionDialogOpen(false);
    setCelebrationDialogOpen(false);
    setShowStepErrors(false);
    setPublishErrorInCelebration(null);
    setEventTrips([]);
    setEventBoardingLocations([]);
    setActiveTab('geral');
    setUploadingImage(false);
    setForm({
      name: '',
      date: '',
      city: '',
      description: '',
      public_info: '',
      status: 'rascunho',
      unit_price: '',
      max_tickets_per_purchase: '0',
      allow_online_sale: true,
      allow_seller_sale: true,
      image_url: null,
    });
  };

  const handleImageUpload = async (file?: File) => {
    if (!file) return;

    // Agora permitimos selecionar banner antes do evento existir.
    // O arquivo fica pendente em memória e só vai para o storage após salvar.
    if (!editingId) {
      if (pendingImagePreviewUrlRef.current) {
        URL.revokeObjectURL(pendingImagePreviewUrlRef.current);
      }
      const previewUrl = URL.createObjectURL(file);
      pendingImagePreviewUrlRef.current = previewUrl;
      setPendingImageFile(file);
      setForm((prev) => ({ ...prev, image_url: previewUrl }));
      return;
    }

    if (!activeCompanyId) return;

    setUploadingImage(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${editingId}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('event-images')
      .upload(fileName, file, { upsert: false });

    if (uploadError) {
      toast.error('Erro ao fazer upload da imagem');
      setUploadingImage(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('event-images')
      .getPublicUrl(fileName);

    // Mantém o padrão atual: com ID existente o banner já é persistido direto no evento.
    const { error: updateError } = await supabase
      .from('events')
      .update({ image_url: publicUrl })
      .eq('id', editingId);

    if (updateError) {
      toast.error('Erro ao salvar URL da imagem');
    } else {
      setForm((prev) => ({ ...prev, image_url: publicUrl }));
      toast.success('Imagem enviada com sucesso');
    }
    setUploadingImage(false);
  };

  // Quick status change from card
  const handleQuickStatusChange = async (event: EventWithTrips, newStatus: Event['status']) => {
    if (newStatus === 'a_venda') {
      const hasStripe = await checkStripeConnection();
      if (!hasStripe) {
        setStripeGatePendingAction(null);
        setStripeGateOpen(true);
        return;
      }

      // Validate publish requirements
      const hasTrips = event.trips && event.trips.length > 0;
      const hasPrice = event.unit_price > 0;
      
      // Check for ida boardings
      const { data: boardings } = await supabase
        .from('event_boarding_locations')
        .select('id, trip_id')
        .eq('event_id', event.id);

      // Simpler check: just verify boardings exist
      const hasBoardings = boardings && boardings.length > 0;
      
      const pendencias: string[] = [];
      if (!hasTrips) pendencias.push('frota/transporte');
      if (!hasBoardings) pendencias.push('locais de embarque');
      if (!hasPrice) pendencias.push('preço da passagem');

      if (pendencias.length > 0) {
        toast.error(`Não é possível publicar. Faltam: ${pendencias.join(', ')}`, { duration: 5000 });
        return;
      }
    }

    if (newStatus === 'encerrado') {
      setEventToClose(event);
      setCloseEventDialogOpen(true);
      return;
    }

    const { error } = await supabase
      .from('events')
      .update({ status: newStatus })
      .eq('id', event.id);

    if (error) {
      toast.error('Erro ao alterar status do evento');
    } else {
      if (newStatus === 'a_venda') {
        toast.success('Evento publicado com sucesso! O evento já está visível no portal.', {
          duration: 4000,
          icon: '🚀',
        });
      } else {
        toast.success('Status do evento atualizado');
      }
      fetchEvents();
      fetchSalesData();
    }
  };

  const handleCloseEventConfirmed = async () => {
    if (!eventToClose) return;
    const { error } = await supabase
      .from('events')
      .update({ status: 'encerrado' })
      .eq('id', eventToClose.id);

    if (error) {
      toast.error('Erro ao encerrar evento');
    } else {
      toast.success('Evento encerrado com sucesso');
      fetchEvents();
    }
    setCloseEventDialogOpen(false);
    setEventToClose(null);
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

    // Quick status transitions
    if (event.status === 'rascunho') {
      actions.push({
        label: 'Colocar à Venda',
        icon: ShoppingBag,
        onClick: () => handleQuickStatusChange(event, 'a_venda'),
      });
    }
    if (event.status === 'a_venda') {
      actions.push({
        label: 'Voltar para Rascunho',
        icon: FileEdit,
        onClick: () => handleQuickStatusChange(event, 'rascunho'),
      });
      actions.push({
        label: 'Encerrar Evento',
        icon: CheckCircle,
        onClick: () => handleQuickStatusChange(event, 'encerrado'),
      });
    }

    actions.push({
      label: event.is_archived ? 'Reativar evento' : 'Arquivar evento',
      icon: event.is_archived ? ArchiveRestore : Archive,
      onClick: () => {
        // Fluxo único: evento nunca é removido fisicamente, apenas alterna arquivamento.
        setEventToArchiveAction(event);
        setArchiveDialogOpen(true);
      },
      variant: event.is_archived ? 'default' : 'destructive',
    });

    return actions;
  };

  // Available boarding locations (not already added)

  // Mantém uma única regra de ordenação para exibir viagens sempre como Ida -> Volta.
  const sortedEventTrips = useMemo(() => {
    const tripTypeOrder: Record<TripType, number> = { ida: 0, volta: 1 };
    return [...eventTrips].sort((a, b) => {
      const typeDiff = tripTypeOrder[a.trip_type] - tripTypeOrder[b.trip_type];
      if (typeDiff !== 0) return typeDiff;
      // Empate: preserva previsibilidade por horário e, por último, id.
      return (a.departure_time ?? '').localeCompare(b.departure_time ?? '') || a.id.localeCompare(b.id);
    });
  }, [eventTrips]);

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
            <Button onClick={async () => {
              const hasStripe = await checkStripeConnection();
              if (!hasStripe) {
                setStripeGatePendingAction('create_event');
                setStripeGateOpen(true);
                return;
              }

              resetForm();
              setDialogOpen(true);
            }}>
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
          searchLabel="Busca textual"
          searchPlaceholder="Pesquisar por nome ou cidade..."
          selects={[
            {
              id: 'status',
              label: 'Status do evento',
              placeholder: 'Status',
              value: filters.status,
              onChange: (value) => setFilters({ ...filters, status: value as EventFilters['status'] }),
              options: statusOptions.map(opt => ({ value: opt.value, label: opt.label })),
              icon: CheckCircle,
            },
            {
              id: 'archiveState',
              label: 'Arquivamento',
              placeholder: 'Arquivamento',
              value: filters.archiveState,
              onChange: (value) => setFilters({ ...filters, archiveState: value as EventFilters['archiveState'] }),
              options: [
                { value: 'active', label: 'Ativos' },
                { value: 'archived', label: 'Arquivados' },
              ],
              icon: Archive,
            },
          ]}
          mainFilters={
            <>
              <FilterInput
                id="startDate"
                label="Data inicial"
                placeholder="Selecionar data"
                value={filters.startDate}
                onChange={(value) => setFilters({ ...filters, startDate: value })}
                type="date"
                icon={CalendarRange}
              />
              <FilterInput
                id="endDate"
                label="Data final"
                placeholder="Selecionar data"
                value={filters.endDate}
                onChange={(value) => setFilters({ ...filters, endDate: value })}
                type="date"
                icon={CalendarRange}
              />
            </>
          }
          onClearFilters={() => setFilters(initialFilters)}
          hasActiveFilters={hasActiveFilters}
          advancedFilters={
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <CalendarDays className="h-4 w-4" />
                  Mês / Ano
                </label>
                <Select
                  value={filters.monthYear}
                  onValueChange={(value) => setFilters({ ...filters, monthYear: value })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o mês" />
                  </SelectTrigger>
                  <SelectContent>
                    {monthYearOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Bus className="h-4 w-4" />
                  Tipo de frota
                </label>
                <Select
                  value={filters.vehicleType}
                  onValueChange={(value) =>
                    setFilters({ ...filters, vehicleType: value as EventFilters['vehicleType'] })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Tipo de frota" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicleTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Bus className="h-4 w-4" />
                  Veículo
                </label>
                <Select
                  value={filters.vehicleId}
                  onValueChange={(value) => setFilters({ ...filters, vehicleId: value })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o veículo" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Users className="h-4 w-4" />
                  Motorista
                </label>
                <Select
                  value={filters.driverId}
                  onValueChange={(value) => setFilters({ ...filters, driverId: value })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o motorista" />
                  </SelectTrigger>
                  <SelectContent>
                    {driverOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Image className="h-4 w-4" />
                  Imagem do evento
                </label>
                <Select
                  value={filters.imageStatus}
                  onValueChange={(value) =>
                    setFilters({ ...filters, imageStatus: value as EventFilters['imageStatus'] })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Imagem" />
                  </SelectTrigger>
                  <SelectContent>
                    {imageStatusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          }
          className="mb-6"
        />

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : events.filter((event) => event.is_archived === (filters.archiveState === 'archived')).length === 0 ? (
          <EmptyState
            icon={<Calendar className="h-8 w-8 text-muted-foreground" />}
            title={filters.archiveState === 'archived' ? 'Nenhum evento arquivado' : 'Nenhum evento cadastrado'}
            description={filters.archiveState === 'archived' ? 'Os eventos arquivados aparecerão aqui.' : 'Crie seu primeiro evento para começar a vender passagens'}
            action={
              <Button onClick={async () => {
                const hasStripe = await checkStripeConnection();
                if (!hasStripe) {
                  setStripeGatePendingAction('create_event');
                  setStripeGateOpen(true);
                  return;
                }

                resetForm();
                setDialogOpen(true);
              }}>
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
              <Card 
                key={event.id} 
                className={cn(
                  'card-corporate h-full overflow-hidden transition-all duration-300',
                  event.status === 'a_venda' && 'ring-1 ring-success/30 card-active-glow',
                  event.status === 'encerrado' && 'opacity-70',
                  event.status === 'rascunho' && 'border-dashed',
                )}
              >
                {/* Image or Placeholder - 1:1 padrão oficial (1080×1080 recomendado). */}
                {event.image_url ? (
                  <div className="aspect-square w-full relative overflow-hidden bg-muted">
                    <img 
                      src={event.image_url} 
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-40"
                    />
                    <img 
                      src={event.image_url} 
                      alt={event.name}
                      className="relative w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="aspect-square w-full bg-gradient-to-br from-muted/50 to-muted flex items-center justify-center">
                    <div className="text-center">
                      <Calendar className="h-10 w-10 mx-auto text-muted-foreground/30" />
                      <span className="text-xl font-bold text-muted-foreground/20 mt-1 block">
                        {event.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  </div>
                )}
                
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-semibold text-foreground line-clamp-2">{event.name}</h3>
                    <ActionsDropdown actions={getEventActions(event)} />
                  </div>
                  
                  <div className="mb-3 flex items-center gap-1.5">
                    <StatusBadge status={event.status} />
                    {event.is_archived && (
                      <Badge variant="secondary" className="uppercase tracking-wide">Arquivado</Badge>
                    )}
                    {event.status === 'a_venda' && (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
                      </span>
                    )}
                  </div>
                  
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 shrink-0" />
                      <span>
                        {/* Padronização de formatação de datas no sistema sem conversão UTC para DATE-only. */}
                        {formatDateOnlyBR(event.date, "dd 'de' MMMM 'de' yyyy")}
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
                      <span>{getFleetCount(event)} transporte(s)</span>
                    </div>
                  </div>

                  {/* Performance indicator for a_venda */}
                  {event.status === 'a_venda' && (() => {
                    const totalSold = salesByEvent.get(event.id) || 0;
                    // Calculate capacity from unique vehicles in trips
                    const vehicleCapacities = new Map<string, number>();
                    event.trips?.forEach(t => {
                      if (t.vehicle_id && !vehicleCapacities.has(t.vehicle_id)) {
                        vehicleCapacities.set(t.vehicle_id, t.capacity || 0);
                      }
                    });
                    const totalCapacity = Array.from(vehicleCapacities.values()).reduce((sum, c) => sum + c, 0);
                    const percentSold = totalCapacity > 0 ? Math.round((totalSold / totalCapacity) * 100) : 0;
                    
                    if (totalCapacity === 0) return null;
                    return (
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>{totalSold} vendido(s)</span>
                          <span>{percentSold}%</span>
                        </div>
                        <Progress value={percentSold} className="h-1.5" />
                      </div>
                    );
                  })()}

                  {/* Pendencies indicator for rascunho */}
                  {event.status === 'rascunho' && (() => {
                    const pendencias: string[] = [];
                    if (!event.trips?.length) pendencias.push('frota');
                    if (event.unit_price <= 0) pendencias.push('preço');
                    if (pendencias.length === 0) return null;
                    return (
                      <div className="mt-3 flex items-center gap-1.5 text-xs text-warning">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>Faltam: {pendencias.join(', ')}</span>
                      </div>
                    );
                  })()}
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
              <Tabs value={activeTab} onValueChange={handleTabChange} className="flex h-full flex-col overflow-hidden">
                {/* Wizard Progress Indicator */}
                {!isReadOnly && (
                  <div className="px-6 pt-4 pb-2 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">
                        Etapa {getStepNumber(activeTab)} de 5 — {WIZARD_TAB_LABELS[activeTab] || 'Geral'}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {Math.round((getStepNumber(activeTab) / 5) * 100)}%
                      </span>
                    </div>
                    <Progress value={(getStepNumber(activeTab) / 5) * 100} className="h-2" />
                  </div>
                )}

                <TabsList className="admin-modal__tabs flex h-auto w-full flex-wrap justify-start gap-1 px-6 py-2 border-b bg-muted/30">
                  {[
                    { value: 'geral', label: 'Geral', icon: FileText, count: null },
                    { value: 'viagens', label: 'Frotas', icon: Bus, count: editingId ? uniqueFleets : null },
                    { value: 'embarques', label: 'Embarques', icon: MapPin, count: editingId ? eventBoardingLocations.length : null },
                    { value: 'passagens', label: 'Passagens', icon: Ticket, count: null },
                    { value: 'publicacao', label: 'Publicação', icon: Globe, count: null },
                  ].map((tab) => {
                    const lockMessage = getTabLockMessage(tab.value);
                    const TabIcon = tab.icon;
                    const stepComplete = isStepComplete(tab.value);
                    const isCurrentTab = activeTab === tab.value;

                    return (
                      <TabsTrigger
                        key={tab.value}
                        value={tab.value}
                        aria-disabled={Boolean(lockMessage)}
                        className={cn(
                          'inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80',
                          lockMessage && 'opacity-45 text-muted-foreground'
                        )}
                      >
                        {/* Step status indicator */}
                        {lockMessage ? (
                          <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : stepComplete && !isCurrentTab ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
                        ) : (
                          <TabIcon className="h-4 w-4 shrink-0" />
                        )}
                        <span className="min-w-0 truncate">{tab.label}</span>
                        {tab.count !== null && (
                          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{tab.count}</span>
                        )}
                      </TabsTrigger>
                    );
                  })}
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
                    {showStepErrors && activeTab === 'geral' && geralMissingFields.length > 0 && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          Preencha os campos obrigatórios: <strong>{geralMissingFields.join(', ')}</strong>
                        </AlertDescription>
                      </Alert>
                    )}
                    {/* Layout 2 colunas para banner + nome (UX mais profissional e evita espaço vazio ao lado do banner). */}
                    <div className="grid gap-4 lg:grid-cols-[200px,1fr] items-start">
                      <div className="space-y-2">
                        <Label>Imagem/Banner do Evento</Label>
                        {/* Padrão oficial 1:1 (1080×1080 recomendado) para manter consistência. */}
                        {form.image_url ? (
                          <div className="space-y-2">
                            <label
                              className={`group relative block h-40 w-40 lg:h-44 lg:w-44 overflow-hidden rounded-lg border bg-muted ${
                                isReadOnly ? 'cursor-default' : 'cursor-pointer'
                              }`}
                            >
                              {/* Miniatura 1:1 para não dominar o modal. */}
                              <img 
                                src={form.image_url} 
                                alt=""
                                aria-hidden="true"
                                className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-40"
                              />
                              {/* Main image - no crop, centered (contain). */}
                              <img 
                                src={form.image_url} 
                                alt="Banner do evento" 
                                className="relative w-full h-full object-contain"
                              />
                              {!isReadOnly && (
                                <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-background/80 px-2 py-1 text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    aria-label="Visualizar banner"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      setImagePreviewOpen(true);
                                    }}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    aria-label="Remover banner"
                                    onClick={async (event) => {
                                      event.preventDefault();
                                      // Se estiver criando (sem ID), removemos somente o pendente local.
                                      if (editingId) {
                                        await supabase
                                          .from('events')
                                          .update({ image_url: null })
                                          .eq('id', editingId);
                                      } else {
                                        clearPendingImage();
                                      }
                                      setForm((prev) => ({ ...prev, image_url: null }));
                                      toast.success('Imagem removida');
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                              {!isReadOnly && (
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  disabled={isReadOnly || uploadingImage}
                                  onChange={(e) => handleImageUpload(e.target.files?.[0])}
                                />
                              )}
                            </label>
                            {!isReadOnly && (
                              <label className="inline-flex">
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  disabled={isReadOnly || uploadingImage}
                                  onChange={(e) => handleImageUpload(e.target.files?.[0])}
                                />
                                <Button type="button" variant="outline" size="sm" disabled={uploadingImage || isReadOnly}>
                                  <Upload className="h-4 w-4 mr-1" />
                                  Trocar
                                </Button>
                              </label>
                            )}
                          </div>
                        ) : (
                          <label 
                            className={`flex h-40 w-40 lg:h-44 lg:w-44 flex-col items-center justify-center gap-2 rounded-lg border bg-muted/30 text-center transition-colors ${
                              isReadOnly 
                                ? 'border-muted-foreground/15 cursor-not-allowed' 
                                : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-primary/5 cursor-pointer'
                            }`}
                          >
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={isReadOnly || uploadingImage}
                              onChange={(e) => handleImageUpload(e.target.files?.[0])}
                            />
                            {uploadingImage ? (
                              <Loader2 className="h-8 w-8 text-primary animate-spin" />
                            ) : (
                              <Image className="h-8 w-8 text-muted-foreground/50" />
                            )}
                            <p className="text-sm text-muted-foreground">
                              {uploadingImage 
                                ? 'Enviando imagem...' 
                                : pendingImageFile
                                  ? 'Banner pendente (salve para persistir)'
                                  : 'Adicionar banner (1080×1080)'
                              }
                            </p>
                            <p className="text-xs text-muted-foreground/70">
                              1:1 com contain, sem cortes
                            </p>
                          </label>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="space-y-2">
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
                        <div className="grid gap-4 sm:grid-cols-2">
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
                            <Label htmlFor="city">Cidade do Evento (Destino) *</Label>
                            <CityAutocomplete
                              value={parseCityLabel(form.city)}
                              onChange={({ city, state }) => setForm({ ...form, city: formatCityLabel(city, state) })}
                              placeholder="Ex: Barretos — SP"
                              disabled={isReadOnly}
                            />
                            <p className="text-xs text-muted-foreground">
                              Local onde o evento acontece (destino final da viagem)
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
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

                    <div className="space-y-2">
                      <Label htmlFor="public_info">Informações e Regras Importantes (exibidas ao público)</Label>
                      <Textarea
                        id="public_info"
                        value={form.public_info}
                        onChange={(e) => setForm({ ...form, public_info: e.target.value })}
                        placeholder="Ex: regras de embarque, documentos obrigatórios e orientações gerais"
                        rows={4}
                        disabled={isReadOnly}
                      />
                      <p className="text-xs text-muted-foreground">
                        Esse conteúdo será exibido no aplicativo público ao clicar em ‘Informações e regras’.
                      </p>
                    </div>
                  </TabsContent>

                  {/* Tab Viagens */}
                  <TabsContent value="viagens" className="mt-0 space-y-4">
                    {showStepErrors && activeTab === 'viagens' && !hasAtLeastOneFleet && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          Adicione pelo menos <strong>1 frota/transporte</strong> para avançar.
                        </AlertDescription>
                      </Alert>
                    )}
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
                            {/* Mantemos a ordem visual Ida → Volta para evitar confusão no operador. */}
                            {sortedEventTrips.map((trip) => {
                              const pairedTrip = trip.paired_trip_id 
                                ? eventTrips.find(t => t.id === trip.paired_trip_id) 
                                : null;
                              
                              return (
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
                                        {/* Horários removidos: exibimos apenas dados essenciais da frota. */}
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
                                        {pairedTrip && (
                                          <span className="ml-2 text-primary">
                                            [Par: {pairedTrip.trip_type === 'ida' ? 'Ida' : 'Volta'}]
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    {!isReadOnly && (
                                      <div className="flex items-center gap-1">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8"
                                          onClick={() => handleEditTrip(trip)}
                                        >
                                          <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-destructive hover:text-destructive"
                                          onClick={() => confirmDeleteTrip(trip)}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                </Card>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </TabsContent>

                  {/* Tab Embarques - with trip selector and copy feature */}
                  <TabsContent value="embarques" className="mt-0 space-y-4">
                    {showStepErrors && activeTab === 'embarques' && !hasValidBoarding && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          Crie pelo menos <strong>1 embarque vinculado a uma frota</strong> para avançar.
                        </AlertDescription>
                      </Alert>
                    )}
                    {!editingId ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Info className="h-8 w-8 mx-auto mb-2" />
                        <p>Salve o evento primeiro para adicionar locais de embarque.</p>
                      </div>
                    ) : eventTrips.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground border rounded-lg">
                        <Bus className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>Adicione viagens primeiro</p>
                        <p className="text-sm">Cada embarque deve estar vinculado a uma viagem específica.</p>
                      </div>
                    ) : (
                      <>
                        {/* Trip Selector */}
                        <div className="space-y-2">
                          <Label>Viagem Selecionada</Label>
                          <Select
                            value={selectedTripIdForBoardings ?? '__none__'}
                            onValueChange={(value) => setSelectedTripIdForBoardings(value === '__none__' ? null : value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione uma viagem" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Todas as viagens</SelectItem>
                              {sortedEventTrips.map((trip) => (
                                <SelectItem key={trip.id} value={trip.id}>
                                  {getTripLabelWithoutTime(trip)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <h3 className="font-medium">
                            {selectedTripIdForBoardings 
                              ? `Embarques da viagem selecionada`
                              : 'Todos os embarques'
                            }
                          </h3>
                          <div className="flex gap-2">
                            {/* Copy from Ida button - only for Volta trips */}
                            {!isReadOnly && selectedTripIdForBoardings && (() => {
                              const selectedTrip = eventTrips.find(t => t.id === selectedTripIdForBoardings);
                              const hasIdaWithBoardings = eventTrips.some(t => 
                                t.trip_type === 'ida' && 
                                eventBoardingLocations.some(ebl => ebl.trip_id === t.id)
                              );
                              if (selectedTrip?.trip_type === 'volta' && hasIdaWithBoardings) {
                                return (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCopyBoardingsDialogOpen(true)}
                                  >
                                    <Copy className="h-4 w-4 mr-2" />
                                    Copiar locais da Ida
                                  </Button>
                                );
                              }
                              return null;
                            })()}
                            {!isReadOnly && boardingLocations.length > 0 && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleOpenBoardingDialog}
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                Adicionar Local
                              </Button>
                            )}
                          </div>
                        </div>

                        {loadingLocations ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          </div>
                        ) : (() => {
                          const filteredBoardings = selectedTripIdForBoardings
                            ? eventBoardingLocations.filter(ebl => ebl.trip_id === selectedTripIdForBoardings)
                            : eventBoardingLocations;
                          
                          const sortedBoardings = [...filteredBoardings].sort((a, b) => {
                            if (!selectedTripIdForBoardings) {
                              const tripOrderA = a.trip?.trip_type === 'ida' ? 0 : 1;
                              const tripOrderB = b.trip?.trip_type === 'ida' ? 0 : 1;
                              if (tripOrderA !== tripOrderB) {
                                return tripOrderA - tripOrderB;
                              }
                            }
                            return (a.stop_order || 1) - (b.stop_order || 1);
                          });
                          const canReorderBoardings = !isReadOnly && Boolean(selectedTripIdForBoardings);

                          if (sortedBoardings.length === 0) {
                            return (
                              <div className="text-center py-8 text-muted-foreground border rounded-lg">
                                <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p>Nenhum local de embarque definido</p>
                                <p className="text-sm">
                                  {selectedTripIdForBoardings 
                                    ? 'Adicione locais para esta viagem'
                                    : 'Adicione locais onde os passageiros embarcarão'
                                  }
                                </p>
                                {!isReadOnly && boardingLocations.length > 0 && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="mt-4"
                                    onClick={handleOpenBoardingDialog}
                                  >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Adicionar Local
                                  </Button>
                                )}
                                {boardingLocations.length === 0 && (
                                  <p className="text-xs text-destructive mt-4">
                                    Cadastre locais de embarque em Configurações → Locais de Embarque
                                  </p>
                                )}
                              </div>
                            );
                          }

                          return (
                            <div className="space-y-3">
                              {sortedBoardings.map((ebl) => (
                                <Card
                                  key={ebl.id}
                                  className={`p-3 ${draggingBoardingId === ebl.id ? 'opacity-70' : ''}`}
                                  onDragOver={(event) => {
                                    if (canReorderBoardings) {
                                      event.preventDefault();
                                    }
                                  }}
                                  onDrop={(event) => {
                                    if (canReorderBoardings) {
                                      void handleBoardingDrop(event, ebl.id, sortedBoardings);
                                    }
                                  }}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3">
                                      {canReorderBoardings && (
                                        <div
                                          className="mt-0.5 text-muted-foreground cursor-grab active:cursor-grabbing"
                                          draggable={!reorderingBoardings}
                                          onDragStart={(event) => handleBoardingDragStart(event, ebl.id)}
                                          onDragEnd={handleBoardingDragEnd}
                                          aria-label="Arraste para reordenar"
                                        >
                                          <GripVertical className="h-4 w-4" />
                                        </div>
                                      )}
                                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium shrink-0">
                                        {ebl.stop_order || '?'}
                                      </div>
                                      <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                                      <div>
                                        <p className="font-medium">{ebl.boarding_location?.name}</p>
                                        <p className="text-sm text-muted-foreground">{ebl.boarding_location?.address}</p>
                                        {ebl.boarding_location?.city && ebl.boarding_location?.state && (
                                          <p className="text-xs text-muted-foreground/80">
                                            {formatCityLabel(ebl.boarding_location.city, ebl.boarding_location.state)}
                                          </p>
                                        )}
                                        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                                          {(ebl.departure_date || ebl.departure_time) && (
                                            <span className="flex items-center gap-1">
                                              <Clock className="h-3 w-3" />
                                              {ebl.departure_date
                                                ? `${ebl.departure_date.split('-').reverse().slice(0, 2).join('/')}${ebl.departure_time ? ` às ${ebl.departure_time.slice(0, 5)}` : ''}`
                                                : ebl.departure_time ? ebl.departure_time.slice(0, 5) : ''}
                                            </span>
                                          )}
                                          {!selectedTripIdForBoardings && (
                                            <span>
                                              Viagem: {ebl.trip ? (ebl.trip.trip_type === 'ida' ? 'Ida' : 'Volta') : 'N/A'}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    {!isReadOnly && (
                                      <div className="flex items-center gap-1 shrink-0">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8"
                                          onClick={() => handleEditBoarding(ebl)}
                                        >
                                          <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-destructive hover:text-destructive"
                                          onClick={() => confirmDeleteBoarding(ebl)}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                </Card>
                              ))}
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </TabsContent>

                  {/* Tab Passagens / Venda */}
                  <TabsContent value="passagens" className="mt-0 space-y-6">
                    {showStepErrors && activeTab === 'passagens' && !hasTicketsRequirements && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          Defina o <strong>preço da passagem</strong> (maior que zero) para avançar.
                        </AlertDescription>
                      </Alert>
                    )}
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
                              onBlur={() => {
                                if (form.unit_price) {
                                  const value = parseFloat(form.unit_price);
                                  if (!isNaN(value)) {
                                    setForm({ ...form, unit_price: value.toFixed(2) });
                                  }
                                }
                              }}
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
                            min="0"
                            max="20"
                            value={form.max_tickets_per_purchase}
                            onChange={(e) => setForm({ ...form, max_tickets_per_purchase: e.target.value })}
                            disabled={isReadOnly}
                          />
                          <p className="text-xs text-muted-foreground">
                            Use 0 para permitir compras sem limite por pedido
                          </p>
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

                    {/* Taxas Adicionais */}
                    {editingId && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium">Taxas Adicionais</h3>
                          {!isReadOnly && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setFeeForm({ name: '', fee_type: 'fixed', value: '', is_active: true });
                                setEditingFeeId(null);
                                setFeeDialogOpen(true);
                              }}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Adicionar Taxa
                            </Button>
                          )}
                        </div>

                        {loadingFees ? (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                          </div>
                        ) : eventFees.length === 0 ? (
                          <div className="text-center py-6 text-muted-foreground border rounded-lg">
                            <DollarSign className="h-7 w-7 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Nenhuma taxa adicional configurada</p>
                            <p className="text-xs mt-1">Taxas como embarque ou operacional podem ser adicionadas aqui</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {eventFees.sort((a, b) => a.sort_order - b.sort_order).map((fee) => (
                              <Card key={fee.id} className={cn('p-3', !fee.is_active && 'opacity-60')}>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-sm truncate">{fee.name}</span>
                                      <Badge variant={fee.is_active ? 'default' : 'secondary'} className="text-xs shrink-0">
                                        {fee.is_active ? 'Ativa' : 'Inativa'}
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {fee.fee_type === 'fixed'
                                        ? `R$ ${Number(fee.value).toFixed(2)}`
                                        : `${Number(fee.value).toFixed(1)}%`}
                                      {fee.fee_type === 'percent' && form.unit_price && (
                                        <span className="ml-1">
                                          (≈ R$ {(parseFloat(form.unit_price || '0') * fee.value / 100).toFixed(2)})
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                  {!isReadOnly && (
                                    <div className="flex items-center gap-1">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={async () => {
                                          await supabase.from('event_fees').update({ is_active: !fee.is_active } as any).eq('id', fee.id);
                                          fetchEventFees(editingId!);
                                        }}
                                      >
                                        {fee.is_active ? <XCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => {
                                          setEditingFeeId(fee.id);
                                          setFeeForm({
                                            name: fee.name,
                                            fee_type: fee.fee_type as 'fixed' | 'percent',
                                            value: String(fee.value),
                                            is_active: fee.is_active,
                                          });
                                          setFeeDialogOpen(true);
                                        }}
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:text-destructive"
                                        onClick={async () => {
                                          await supabase.from('event_fees').delete().eq('id', fee.id);
                                          fetchEventFees(editingId!);
                                          toast.success('Taxa removida');
                                        }}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </Card>
                            ))}
                          </div>
                        )}

                        {/* Fee calculation preview */}
                        {eventFees.filter(f => f.is_active).length > 0 && form.unit_price && (
                          <Card className="p-3 bg-muted/50">
                            <p className="text-xs text-muted-foreground mb-1">Simulação de cálculo</p>
                            <div className="text-sm space-y-0.5">
                              <div className="flex justify-between">
                                <span>Passagem</span>
                                <span>R$ {parseFloat(form.unit_price || '0').toFixed(2)}</span>
                              </div>
                              {eventFees.filter(f => f.is_active).map(fee => {
                                const basePrice = parseFloat(form.unit_price || '0');
                                const feeAmount = fee.fee_type === 'percent' ? basePrice * fee.value / 100 : fee.value;
                                return (
                                  <div key={fee.id} className="flex justify-between text-muted-foreground">
                                    <span>{fee.name}</span>
                                    <span>+ R$ {feeAmount.toFixed(2)}</span>
                                  </div>
                                );
                              })}
                              <div className="flex justify-between font-medium border-t pt-1 mt-1">
                                <span>Total por passageiro</span>
                                <span>R$ {(() => {
                                  const basePrice = parseFloat(form.unit_price || '0');
                                  const totalFees = eventFees.filter(f => f.is_active).reduce((sum, fee) => {
                                    return sum + (fee.fee_type === 'percent' ? basePrice * fee.value / 100 : fee.value);
                                  }, 0);
                                  return (basePrice + totalFees).toFixed(2);
                                })()}</span>
                              </div>
                            </div>
                          </Card>
                        )}
                      </div>
                    )}

                    {/* Event Summary */}
                    {editingId && (
                      <Card className="p-4 bg-muted/50">
                        <h4 className="text-sm font-medium mb-3">Resumo do Evento</h4>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Transportes</p>
                            <p className="font-medium">{uniqueFleets}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Capacidade Total</p>
                            <p className="font-medium">{correctTotalCapacity} lugares</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Locais de Embarque</p>
                            <p className="font-medium">{eventBoardingLocations.length}</p>
                          </div>
                        </div>
                      </Card>
                    )}
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
                                Pelo menos 1 local de embarque na Ida
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

                <div className="admin-modal__footer px-6 py-4 border-t">
                  {isReadOnly ? (
                    <div className="flex justify-end">
                      <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                        Fechar
                      </Button>
                    </div>
                  ) : !isCreateWizardMode ? (
                    /* Modo edição: manter botões existentes */
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={saving}>
                        {saving ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</>
                        ) : 'Salvar'}
                      </Button>
                    </div>
                  ) : (
                    /* Modo wizard: rodapé padronizado */
                    <div className="flex items-center justify-between">
                      {/* Lado esquerdo: Salvar rascunho */}
                      <div>
                        {getStepNumber(activeTab) > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={saving}
                            onClick={async () => {
                              setSaving(true);
                              await persistEvent('rascunho');
                              setSaving(false);
                              toast.success('Rascunho salvo');
                            }}
                          >
                            <Save className="h-4 w-4 mr-1.5" />
                            Salvar rascunho
                          </Button>
                        )}
                      </div>
                      {/* Lado direito: Voltar + Próximo/Finalizar */}
                      <div className="flex items-center gap-2">
                        {getPreviousWizardTab(activeTab) && (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={saving}
                            onClick={() => {
                              const prev = getPreviousWizardTab(activeTab);
                              if (prev) {
                                setShowStepErrors(false);
                                setActiveTab(prev);
                              }
                            }}
                          >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Voltar
                          </Button>
                        )}
                        {activeTab === 'publicacao' ? (
                          <Button
                            type="submit"
                            disabled={saving}
                          >
                            {saving ? (
                              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</>
                            ) : (
                              <><PartyPopper className="h-4 w-4 mr-1.5" />Finalizar</>
                            )}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            disabled={saving}
                            onClick={() => { void handleWizardAdvance(); }}
                          >
                            {saving ? (
                              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</>
                            ) : (
                              <>Próximo<ChevronRight className="h-4 w-4 ml-1" /></>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </Tabs>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={imagePreviewOpen} onOpenChange={setImagePreviewOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Pré-visualização do banner (1:1)</DialogTitle>
            </DialogHeader>
            <div className="relative mx-auto w-full max-w-md aspect-square overflow-hidden rounded-lg border bg-muted">
              {/* Prévia 1:1 com contain para evitar distorções/cortes. */}
              {form.image_url ? (
                <>
                  <img
                    src={form.image_url}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-40"
                  />
                  <img
                    src={form.image_url}
                    alt="Pré-visualização do banner do evento"
                    className="relative w-full h-full object-contain"
                  />
                </>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                  Nenhuma imagem selecionada
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Fee Dialog */}
        <Dialog open={feeDialogOpen} onOpenChange={(open) => { setFeeDialogOpen(open); if (!open) { setEditingFeeId(null); setFeeForm({ name: '', fee_type: 'fixed', value: '', is_active: true }); } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingFeeId ? 'Editar Taxa' : 'Adicionar Taxa'}</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!editingId || !activeCompanyId) return;
                setSavingFee(true);
                const feeData = {
                  name: feeForm.name,
                  fee_type: feeForm.fee_type,
                  value: parseFloat(feeForm.value) || 0,
                  is_active: feeForm.is_active,
                  event_id: editingId,
                  company_id: activeCompanyId,
                  sort_order: editingFeeId ? undefined : eventFees.length,
                };
                if (editingFeeId) {
                  const { name, fee_type, value, is_active } = feeData;
                  await supabase.from('event_fees').update({ name, fee_type, value, is_active } as any).eq('id', editingFeeId);
                } else {
                  await supabase.from('event_fees').insert(feeData as any);
                }
                setSavingFee(false);
                setFeeDialogOpen(false);
                setEditingFeeId(null);
                fetchEventFees(editingId);
                toast.success(editingFeeId ? 'Taxa atualizada' : 'Taxa adicionada');
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Nome da Taxa *</Label>
                <Input
                  value={feeForm.name}
                  onChange={(e) => setFeeForm({ ...feeForm, name: e.target.value })}
                  placeholder="Ex: Taxa de Embarque"
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Tipo *</Label>
                  <Select value={feeForm.fee_type} onValueChange={(v: 'fixed' | 'percent') => setFeeForm({ ...feeForm, fee_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                      <SelectItem value="percent">Percentual (%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Valor *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={feeForm.value}
                    onChange={(e) => setFeeForm({ ...feeForm, value: e.target.value })}
                    placeholder={feeForm.fee_type === 'fixed' ? '0.00' : '0.0'}
                    required
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>Taxa ativa</Label>
                <Switch checked={feeForm.is_active} onCheckedChange={(v) => setFeeForm({ ...feeForm, is_active: v })} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setFeeDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={savingFee || !feeForm.name || !feeForm.value}>
                  {savingFee ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {editingFeeId ? 'Salvar' : 'Adicionar'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Trip Modal - Simplified without time fields */}
        <Dialog open={tripDialogOpen} onOpenChange={(open) => { setTripDialogOpen(open); if (!open) resetTripForm(); }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingTripId ? 'Editar Viagem' : 'Adicionar Viagem'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSaveTrip} className="space-y-4">
              {/* Trip Type - only show for creation, locked for editing */}
              {!editingTripId ? (
                <div className="space-y-2">
                  <Label>Tipo da Viagem *</Label>
                  <RadioGroup
                    value={tripForm.trip_creation_type}
                    onValueChange={(value: TripCreationType) => setTripForm({ ...tripForm, trip_creation_type: value })}
                    className="flex flex-wrap gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="ida" id="trip_type_ida" />
                      <Label htmlFor="trip_type_ida" className="font-normal cursor-pointer">Ida</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="volta" id="trip_type_volta" />
                      <Label htmlFor="trip_type_volta" className="font-normal cursor-pointer">Volta</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="ida_volta" id="trip_type_ida_volta" />
                      <Label htmlFor="trip_type_ida_volta" className="font-normal cursor-pointer">Ida e Volta</Label>
                    </div>
                  </RadioGroup>
                  {tripForm.trip_creation_type === 'ida_volta' && (
                    <p className="text-xs text-muted-foreground">
                      Serão criadas duas viagens vinculadas com os mesmos dados.
                    </p>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Tipo: <span className="font-medium text-foreground">{tripForm.trip_creation_type === 'ida' ? 'Ida' : 'Volta'}</span>
                    <span className="ml-2 text-xs">(não pode ser alterado)</span>
                  </p>
                </div>
              )}

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
                          {vehicleTypeLabels[vehicle.type]} {vehicle.plate} ({vehicle.capacity} lug.)
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
                      <SelectItem value="__none__">Nenhum</SelectItem>
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

              {/* Info about time */}
              <div className="p-3 bg-muted/50 rounded-lg border border-muted">
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <Info className="h-4 w-4 shrink-0" />
                  O horário da viagem é definido automaticamente pelo primeiro embarque cadastrado.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setTripDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={savingTrip || !tripForm.vehicle_id || !tripForm.driver_id}
                >
                  {savingTrip ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : editingTripId ? (
                    'Salvar'
                  ) : (
                    tripForm.trip_creation_type === 'ida_volta' ? 'Criar Ida e Volta' : 'Adicionar'
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Boarding Location Modal - Trip required, using getTripLabel */}
        <Dialog open={boardingDialogOpen} onOpenChange={setBoardingDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingBoardingId ? 'Editar Local de Embarque' : 'Adicionar Local de Embarque'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSaveBoarding} className="space-y-4">
              {/* Link to Trip - Required */}
              <div className="space-y-2">
                <Label htmlFor="trip_link">Vincular a Viagem *</Label>
                <Select
                  value={boardingForm.trip_id || '__none__'}
                  onValueChange={(value) => setBoardingForm({ ...boardingForm, trip_id: value === '__none__' ? '' : value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma viagem *" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedEventTrips.map((trip) => (
                      <SelectItem key={trip.id} value={trip.id}>
                        {getTripLabelWithoutTime(trip)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
                    {boardingLocations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Departure Date */}
              <div className="space-y-2">
                <Label htmlFor="boarding_date">Data do Embarque</Label>
                <Input
                  id="boarding_date"
                  type="date"
                  value={boardingForm.departure_date}
                  onChange={(e) => setBoardingForm({ ...boardingForm, departure_date: e.target.value })}
                />
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

              {/* Stop Order */}
              <div className="space-y-2">
                <Label htmlFor="stop_order">Ordem da Parada</Label>
                <Input
                  id="stop_order"
                  type="number"
                  min="1"
                  value={boardingForm.stop_order}
                  onChange={(e) => setBoardingForm({ ...boardingForm, stop_order: e.target.value })}
                  placeholder="Automático"
                />
                <p className="text-xs text-muted-foreground">
                  Deixe em branco para inserir na próxima posição
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setBoardingDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={savingBoarding || !boardingForm.boarding_location_id || !boardingForm.trip_id}
                >
                  {savingBoarding ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : editingBoardingId ? (
                    'Salvar'
                  ) : (
                    'Adicionar'
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Diálogo de arquivamento (exclusão virtual segura) */}
        <AlertDialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{eventToArchiveAction?.is_archived ? 'Reativar Evento' : 'Arquivar Evento'}</AlertDialogTitle>
              <AlertDialogDescription>
                {eventToArchiveAction?.is_archived
                  ? 'O evento voltará para a listagem principal de ativos e poderá ser vendido novamente conforme suas regras atuais.'
                  : 'O evento sairá da listagem principal e não ficará disponível para venda no portal público.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleArchiveToggle}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {eventToArchiveAction?.is_archived ? 'Reativar' : 'Arquivar'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>

      {/* Modal bloqueante para monetização: força Stripe antes de criar/publicar evento. */}
      <Dialog open={stripeGateOpen} onOpenChange={(open) => {
        if (!open) {
          setStripeGateOpen(false);
          setStripeGatePendingAction(null);
          return;
        }
        setStripeGateOpen(open);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#635BFF]/10">
              <ShieldCheck className="h-6 w-6 text-[#635BFF]" />
            </div>
            <DialogTitle className="text-center text-xl">Conecte sua conta Stripe para começar a vender</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Para receber os valores das passagens diretamente na sua conta bancária, é necessário conectar sua empresa ao Stripe. O processo é rápido e seguro.
            </p>

            <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStripeGateOpen(false);
                  setStripeGatePendingAction(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="bg-[#635BFF] hover:bg-[#5A54E6] text-white"
                onClick={handleConnectStripeFromGate}
                disabled={stripeConnecting}
              >
                {stripeConnecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <DollarSign className="h-4 w-4 mr-2" />}
                Conectar com Stripe
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

        {/* Delete Trip Dialog with Validation */}
        <AlertDialog open={deleteTripDialogOpen} onOpenChange={setDeleteTripDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {tripDeleteBlockReason ? 'Exclusão Bloqueada' : 'Excluir Viagem'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {tripDeleteBlockReason || (
                  `Tem certeza que deseja excluir esta viagem (${tripToDelete?.trip_type === 'ida' ? 'Ida' : 'Volta'})?`
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {tripDeleteBlockReason ? 'Entendi' : 'Cancelar'}
              </AlertDialogCancel>
              {!tripDeleteBlockReason && (
                <AlertDialogAction
                  onClick={handleDeleteTripConfirmed}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Excluir
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Boarding Dialog with Validation */}
        <AlertDialog open={deleteBoardingDialogOpen} onOpenChange={setDeleteBoardingDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {boardingDeleteBlockReason ? 'Exclusão Bloqueada' : 'Excluir Local de Embarque'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {boardingDeleteBlockReason || 'Tem certeza que deseja excluir este local de embarque?'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {boardingDeleteBlockReason ? 'Entendi' : 'Cancelar'}
              </AlertDialogCancel>
              {!boardingDeleteBlockReason && (
                <AlertDialogAction
                  onClick={handleDeleteBoardingConfirmed}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Excluir
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Copy Boardings Dialog */}
        <AlertDialog open={copyBoardingsDialogOpen} onOpenChange={setCopyBoardingsDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Copiar Locais da Ida</AlertDialogTitle>
              <AlertDialogDescription>
                Os locais de embarque da viagem de ida serão copiados para a volta selecionada.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="invert_order"
                  checked={invertBoardingsOrder}
                  onCheckedChange={setInvertBoardingsOrder}
                />
                <Label htmlFor="invert_order" className="cursor-pointer">
                  Inverter ordem das paradas (recomendado para volta)
                </Label>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Os horários não serão copiados; ajuste o horário da volta manualmente se necessário.
              </p>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCopyBoardingsFromIda}
                disabled={copyingBoardings}
              >
                {copyingBoardings ? 'Copiando...' : 'Copiar'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {/* Close Event Confirmation Dialog */}
        <AlertDialog open={closeEventDialogOpen} onOpenChange={setCloseEventDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Encerrar Evento</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja encerrar o evento "{eventToClose?.name}"?
                Após encerrado, o evento não poderá mais ser reaberto ou editado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCloseEventConfirmed}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Encerrar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Popup celebrativo de conclusão do wizard */}
        <Dialog open={celebrationDialogOpen} onOpenChange={setCelebrationDialogOpen}>
          <DialogContent className="sm:max-w-md text-center">
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Rocket className="h-8 w-8 text-primary" />
              </div>
              <DialogTitle className="text-xl">
                Parabéns! Seu evento foi criado com sucesso.
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                Agora você pode colocar seu evento online e começar a vender.
              </p>

              {publishErrorInCelebration && (
                <Alert variant="destructive" className="text-left">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{publishErrorInCelebration}</AlertDescription>
                </Alert>
              )}

              <div className="flex flex-col gap-2 w-full pt-2">
                <Button
                  onClick={handleCelebrationPublish}
                  disabled={saving}
                  className="w-full"
                >
                  {saving ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Publicando...</>
                  ) : (
                    <><Rocket className="h-4 w-4 mr-2" />Publicar evento agora</>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCelebrationDraft}
                  disabled={saving}
                  className="w-full"
                >
                  Manter como rascunho
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleCelebrationGoToList}
                  disabled={saving}
                  className="w-full text-muted-foreground"
                >
                  Ir para lista de eventos
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
