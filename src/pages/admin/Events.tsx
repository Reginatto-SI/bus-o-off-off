import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Event, Trip, Vehicle, Driver, BoardingLocation, EventBoardingLocation, TripType, TripCreationType, EventFee, TransportPolicy, Company, EventCategory } from '@/types/database';
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
  DialogFooter,
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
// RadioGroup removed — transport type now uses clickable cards
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
  ArrowUpDown,
  DollarSign,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Save,
  Rocket,
  PartyPopper,
  Star,
  Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import { addMonths, format, isAfter, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { buildDebugToastMessage, logSupabaseError } from '@/lib/errorDebug';
import { cn } from '@/lib/utils';
import { formatDateOnlyBR, parseDateOnlyAsLocal } from '@/lib/date';
import { DateBadge } from '@/components/public/DateBadge';
import { Progress } from '@/components/ui/progress';
import { useLocation } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { CalculationSimulationCard } from '@/components/admin/CalculationSimulationCard';
import { Checkbox } from '@/components/ui/checkbox';
import { CardHeader, CardTitle } from '@/components/ui/card';
// Popover removed — transport policy now uses clickable cards instead of Select+Popover
import { formatCurrencyBRL, formatCurrencyInputValueFromDigits, formatCurrencyValueBRL, parseCurrencyInputBRL } from '@/lib/currency';
import { EventSponsorsTab } from '@/components/admin/EventSponsorsTab';
import { AsaasOnboardingWizard, AsaasOnboardingCompanyData } from '@/components/admin/AsaasOnboardingWizard';
import { getAsaasIntegrationSnapshot } from '@/lib/asaasIntegrationStatus';
import { useRuntimePaymentEnvironment } from '@/hooks/use-runtime-payment-environment';
import { buildEventOperationalEndMap, isOperationallyVisible } from '@/lib/eventOperationalWindow';
// Types
interface EventFilters {
  search: string;
  status: 'all' | 'rascunho' | 'a_venda' | 'encerrado';
  eventCategory: 'all' | EventCategory;
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

// Versão textual do termo comercial de taxa da plataforma.
// Mantemos constante explícita para rastreabilidade mínima sem criar arquitetura jurídica complexa.
const PLATFORM_FEE_TERMS_VERSION = '2026-03-cancelamento-nao-devolve-taxa-v1';

type EventSortOption =
  | 'event_date_asc'
  | 'event_date_desc'
  | 'created_at_desc'
  | 'created_at_asc'
  | 'name_asc'
  | 'name_desc';

const EVENTS_PER_PAGE = 12;

const eventSortOptions: Array<{ value: EventSortOption; label: string }> = [
  { value: 'event_date_asc', label: 'Data do evento (mais próximo primeiro)' },
  { value: 'event_date_desc', label: 'Data do evento (mais distante primeiro)' },
  { value: 'created_at_desc', label: 'Data de criação (mais recente primeiro)' },
  { value: 'created_at_asc', label: 'Data de criação (mais antigo primeiro)' },
  { value: 'name_asc', label: 'Nome do evento (A → Z)' },
  { value: 'name_desc', label: 'Nome do evento (Z → A)' },
];

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
  eventCategory: 'all',
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

const eventCategoryFilterOptions: Array<{ value: EventFilters['eventCategory']; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'evento', label: 'Evento' },
  { value: 'excursao', label: 'Excursão' },
  // Nova categoria disponível também no filtro para manter consistência com o cadastro.
  { value: 'caravana', label: 'Caravana' },
  { value: 'bate_e_volta', label: 'Bate e volta' },
  { value: 'viagem', label: 'Viagem' },
];

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

/**
 * Política de Transporte do Evento — define a regra macro de como transportes são cadastrados e vendidos.
 * - ida_volta_obrigatorio: O modal de transporte NÃO exibe seleção de tipo; assume sempre Ida e Volta.
 * - ida_obrigatoria_volta_opcional: O modal NÃO exibe seleção de tipo; assume sempre Somente Ida.
 * - trecho_independente (Flexível): O modal EXIBE seleção de tipo, permitindo Ida, Volta ou Ida e Volta.
 */
const transportPolicyOptions: Array<{ value: TransportPolicy; label: string; description: string; icon: string }> = [
  {
    value: 'ida_volta_obrigatorio',
    label: 'Ida e volta obrigatória',
    description: 'Venda em pacote único. Ida e volta sempre vinculadas.',
    icon: '🔗',
  },
  {
    value: 'ida_obrigatoria_volta_opcional',
    label: 'Somente ida',
    description: 'Evento com operação apenas de ida, sem retorno vinculado.',
    icon: '➡️',
  },
  {
    value: 'trecho_independente',
    label: 'Flexível',
    description: 'Permite cadastrar transportes de ida, volta ou ida e volta conforme necessidade do evento.',
    icon: '🔀',
  },
];

type EventCategoryOptionValue = EventCategory;

const eventCategoryOptions: Array<{ value: EventCategoryOptionValue; label: string; description: string; icon: string }> = [
  { value: 'evento', label: 'Evento', description: 'Ocasião pontual com rota principal definida.', icon: '🎟️' },
  { value: 'excursao', label: 'Excursão', description: 'Viagem em grupo com ida e retorno planejados.', icon: '🚌' },
  // Caravana adicionada na própria fonte de verdade das categorias para reaproveitar o mesmo card/fluxo.
  { value: 'caravana', label: 'Caravana', description: 'Grupo organizado, torcida ou excursão com coordenação coletiva.', icon: '🧑‍🤝‍🧑' },
  { value: 'bate_e_volta', label: 'Bate e volta', description: 'Operação no mesmo dia com retorno vinculado.', icon: '🔁' },
  { value: 'viagem', label: 'Viagem', description: 'Operação com flexibilidade entre ida e volta.', icon: '🧭' },
];

const categorySuggestedTransportPolicyMap: Record<EventCategoryOptionValue, TransportPolicy> = {
  evento: 'ida_volta_obrigatorio',
  excursao: 'ida_volta_obrigatorio',
  caravana: 'ida_volta_obrigatorio',
  bate_e_volta: 'ida_volta_obrigatorio',
  viagem: 'trecho_independente',
};

const seatCategoryLabels: Record<string, string> = {
  convencional: 'Convencional',
  executivo: 'Executivo',
  semi_leito: 'Semi-leito',
  leito: 'Leito',
  leito_cama: 'Leito-cama',
};

export default function Events() {
  const location = useLocation();
  const { activeCompanyId, user } = useAuth();
  const { environment: runtimePaymentEnvironment } = useRuntimePaymentEnvironment();
  const [events, setEvents] = useState<EventWithTrips[]>([]);
  const [operationalEndMap, setOperationalEndMap] = useState<Map<string, Date | null>>(new Map());
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<EventFilters>(initialFilters);
  const [sortBy, setSortBy] = useState<EventSortOption>('event_date_asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [eventToArchiveAction, setEventToArchiveAction] = useState<EventWithTrips | null>(null);
  const [activeTab, setActiveTab] = useState('geral');

  // Post-create dialog
  const [isCreateWizardMode, setIsCreateWizardMode] = useState(false);
  const [_publishDecisionDialogOpen, setPublishDecisionDialogOpen] = useState(false);
  const [showStepErrors, setShowStepErrors] = useState(false);
  const [celebrationDialogOpen, setCelebrationDialogOpen] = useState(false);
  const [publishErrorInCelebration, setPublishErrorInCelebration] = useState<string | null>(null);
  const [platformFeeTermsDialogOpen, setPlatformFeeTermsDialogOpen] = useState(false);

  // Quick status change
  const [closeEventDialogOpen, setCloseEventDialogOpen] = useState(false);
  const [eventToClose, setEventToClose] = useState<EventWithTrips | null>(null);

  // Sales data for performance indicators
  const [salesByEvent, setSalesByEvent] = useState<Map<string, number>>(new Map());

  // Mantém o aceite sincronizado entre o checkbox e o botão de confirmação do modal de termos.
  const handleAcceptPlatformFeeTerms = () => {
    setForm((prev) => ({
      ...prev,
      platform_fee_terms_accepted: true,
      platform_fee_terms_accepted_at: prev.platform_fee_terms_accepted_at ?? new Date().toISOString(),
      // Rastreabilidade adicional: fixa a versão do termo vigente e usuário que confirmou o aceite.
      platform_fee_terms_version: PLATFORM_FEE_TERMS_VERSION,
      platform_fee_terms_accepted_by: user?.id ?? null,
    }));
    setPlatformFeeTermsDialogOpen(false);
  };
  
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

  // Gate de pagamentos (Asaas): bloqueia criação/publicação sem onboarding financeiro concluído.
  const [paymentsGateOpen, setPaymentsGateOpen] = useState(false);
  const [asaasWizardOpen, setAsaasWizardOpen] = useState(false);
  const [asaasWizardCompanyData, setAsaasWizardCompanyData] = useState<AsaasOnboardingCompanyData | null>(null);
  // Comentário de manutenção: mantemos a ação pendente para continuar o fluxo após conectar pagamentos.
  const [paymentsGatePendingAction, setPaymentsGatePendingAction] = useState<'create_event' | 'publish_from_form' | null>(null);
  // Fonte de verdade das taxas: na venda online a comissão exibida considera o total configurado da empresa.
  const [companyPlatformFeePercent, setCompanyPlatformFeePercent] = useState<number | null>(null);
  const [companySocioSplitPercent, setCompanySocioSplitPercent] = useState<number>(0);

  // Main form
  const [form, setForm] = useState({
    name: '',
    // Campo de UX: categoria ajuda a aplicar sugestão inicial de política de transporte.
    event_category: null as EventCategoryOptionValue | null,
    date: '',
    city: '',
    // Tolerância opcional em minutos para regras operacionais da passagem.
    boarding_tolerance_minutes: '10',
    description: '',
    // Campo público exibido no app mobile em 'Informações e regras'.
    public_info: '',
    status: 'rascunho' as Event['status'],
    unit_price: '',
    max_tickets_per_purchase: '0',
    allow_online_sale: true,
    allow_seller_sale: true,
    enable_checkout_validation: false,
    // Regra por evento: apenas define quem absorve a taxa da plataforma (cliente/organizador).
    pass_platform_fee_to_customer: false,
    // Aceite legal obrigatório para publicação. Persistido no evento para não "desmarcar" ao reabrir.
    platform_fee_terms_accepted: false,
    platform_fee_terms_accepted_at: null as string | null,
    platform_fee_terms_version: null as string | null,
    platform_fee_terms_accepted_by: null as string | null,
    image_url: '' as string | null,
    // Novo padrão de criação: 90% dos eventos operam com ida e volta obrigatória.
    transport_policy: 'ida_volta_obrigatorio' as TransportPolicy,
    use_category_pricing: false,
  });
  const [transportPolicyAutoHintVisible, setTransportPolicyAutoHintVisible] = useState(false);

  // Category pricing state
  const [categoryPrices, setCategoryPrices] = useState<{ category: string; price: string; seatCount: number }[]>([]);
  const [loadingCategoryPrices, setLoadingCategoryPrices] = useState(false);
  
  // Image upload state
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const pendingImagePreviewUrlRef = useRef<string | null>(null);
  // Ref do input usado pelo botão "Trocar" para abrir o seletor de arquivos de forma confiável.
  const replaceImageInputRef = useRef<HTMLInputElement | null>(null);

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

  const hasValidCompanyPlatformFee = companyPlatformFeePercent !== null && Number.isFinite(companyPlatformFeePercent);
  // Regra financeira oficial: tudo que a tela chama de "Taxa da Plataforma" precisa refletir o split real.
  const companyTotalPlatformFeePercent = (companyPlatformFeePercent ?? 0) + companySocioSplitPercent;

  const fetchCompanyPlatformFee = async () => {
    if (!activeCompanyId) {
      setCompanyPlatformFeePercent(null);
      return;
    }

    const { data, error } = await supabase
      .from('companies')
      .select('platform_fee_percent, socio_split_percent')
      .eq('id', activeCompanyId)
      .single();

    if (error || data?.platform_fee_percent == null) {
      // Comentário de suporte: bloqueamos operações financeiras sem taxa válida para evitar cobrança incorreta.
      setCompanyPlatformFeePercent(null);
      setCompanySocioSplitPercent(0);
      return;
    }

    setCompanyPlatformFeePercent(Number(data.platform_fee_percent));
    setCompanySocioSplitPercent(Number(data.socio_split_percent ?? 0));
  };

  const checkAsaasConnection = async () => {
    if (!activeCompanyId) {
      toast.error('Empresa não selecionada');
      return false;
    }

    const { data, error } = await supabase
      .from('companies')
      // Comentário de manutenção: a tela deve decidir conexão apenas pelo contrato por ambiente.
      // O legado em companies permanece no schema só por compatibilidade transitória.
      .select('asaas_api_key_production, asaas_wallet_id_production, asaas_account_id_production, asaas_account_email_production, asaas_onboarding_complete_production, asaas_api_key_sandbox, asaas_wallet_id_sandbox, asaas_account_id_sandbox, asaas_account_email_sandbox, asaas_onboarding_complete_sandbox')
      .eq('id', activeCompanyId)
      .single();

    if (error) {
      toast.error('Não foi possível validar a conexão de pagamentos da empresa');
      return false;
    }

    if (!runtimePaymentEnvironment) {
      toast.error('Ambiente operacional de pagamentos ainda não foi identificado');
      return false;
    }

    return getAsaasIntegrationSnapshot(data as unknown as Company, runtimePaymentEnvironment).currentIsConnected;
  };

  const fetchAsaasWizardCompanyData = async (): Promise<AsaasOnboardingCompanyData | null> => {
    if (!activeCompanyId) {
      toast.error('Empresa não selecionada');
      return null;
    }

    const { data, error } = await supabase
      .from('companies')
      .select('id, legal_type, email, document_number, cnpj, name, trade_name, legal_name, city, state, address, address_number, province, postal_code')
      .eq('id', activeCompanyId)
      .single();

    if (error || !data) {
      logSupabaseError({
        label: 'Erro ao carregar dados da empresa para onboarding Asaas (companies.select)',
        error,
        context: { action: 'select', table: 'companies', companyId: activeCompanyId, userId: user?.id },
      });
      toast.error('Não foi possível carregar os dados da empresa para conectar pagamentos. Atualize a página e tente novamente.');
      return null;
    }

    const legalType = data.legal_type === 'PF' ? 'PF' : 'PJ';
    const documentNumber = (data.document_number || data.cnpj || '').replace(/\D/g, '');
    const companyName = (data.trade_name || data.legal_name || data.name || '').trim();
    const email = (data.email || '').trim();

    const missingRequired: string[] = [];
    if (!companyName) missingRequired.push('nome da empresa');
    if (!email) missingRequired.push('e-mail');
    if (legalType === 'PF' && documentNumber.length !== 11) missingRequired.push('CPF válido');
    if (legalType === 'PJ' && documentNumber.length !== 14) missingRequired.push('CNPJ válido');

    if (missingRequired.length > 0) {
      toast.error(`Complete os dados da empresa em /admin/empresa antes de conectar pagamentos: ${missingRequired.join(', ')}.`);
      return null;
    }

    const missingRecommended: string[] = [];
    if (!data.city?.trim()) missingRecommended.push('cidade');
    if (!data.state?.trim()) missingRecommended.push('estado');
    if (!data.address?.trim()) missingRecommended.push('endereço');

    if (missingRecommended.length > 0) {
      // Comentário de manutenção: não bloqueia a conexão, apenas orienta para reduzir pendências no Asaas Sandbox.
      toast.warning(`Recomendado para o Asaas Sandbox: complete ${missingRecommended.join(', ')} em /admin/empresa.`);
    }

    return {
      companyId: data.id,
      companyName,
      legalType,
      documentNumber,
      email,
      address: (data.address || '').trim(),
      addressNumber: (data.address_number || '').trim(),
      province: (data.province || '').trim(),
      postalCode: (data.postal_code || '').replace(/\D/g, ''),
      city: (data.city || '').trim(),
      state: (data.state || '').trim(),
    };
  };

  const handleOpenAsaasWizardFromGate = async () => {
    // Comentário de manutenção: o gate só abre o wizard; a criação real ocorre no passo final de confirmação.
    const wizardData = await fetchAsaasWizardCompanyData();
    if (!wizardData) return;
    setAsaasWizardCompanyData(wizardData);
    setAsaasWizardOpen(true);
  };


  useEffect(() => {
    if (!paymentsGateOpen) return;

    // Revalida conexão Asaas ao voltar foco para liberar automaticamente a jornada de criação/publicação.
    const revalidateAsaasStatus = async () => {
      const connected = await checkAsaasConnection();
      if (!connected) return;

      setPaymentsGateOpen(false);

      // Continuidade automática: se estava tentando criar evento, abre modal de cadastro.
      if (paymentsGatePendingAction === 'create_event') {
        resetForm();
        setIsCreateWizardMode(true);
        setDialogOpen(true);
      }

      setPaymentsGatePendingAction(null);
      toast.success('Pagamentos conectados com sucesso. Você já pode continuar.');
    };

    const onFocus = () => {
      revalidateAsaasStatus();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [paymentsGateOpen, paymentsGatePendingAction, activeCompanyId]);
  useEffect(() => {
    // Comentário: permite deep-link de ação rápida do Dashboard sem alterar o fluxo padrão da tela.
    const params = new URLSearchParams(location.search);
    if (params.get('novo') !== '1') return;

    const openCreateFromDashboard = async () => {
      const hasAsaasConnection = await checkAsaasConnection();
      if (!hasAsaasConnection) {
        setPaymentsGatePendingAction('create_event');
        setPaymentsGateOpen(true);
        return;
      }

      resetForm();
      setIsCreateWizardMode(true);
      setDialogOpen(true);
    };

    openCreateFromDashboard();
  }, [location.search]);

  const hasAtLeastOneFleet = eventTrips.length > 0;
  const hasValidBoarding = eventBoardingLocations.some((boarding) => Boolean(boarding.trip_id));
  const hasTicketsRequirements = parseCurrencyInputBRL(form.unit_price) > 0;

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

    if (tabValue === 'patrocinadores') {
      if (!effectiveEventId) {
        return 'Salve o evento na aba Geral para liberar Patrocinadores.';
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

  const WIZARD_TABS_ORDER = ['geral', 'viagens', 'embarques', 'passagens', 'patrocinadores', 'publicacao'] as const;
  const WIZARD_TAB_LABELS: Record<string, string> = {
    geral: 'Geral',
    viagens: 'Frotas',
    embarques: 'Embarques',
    passagens: 'Passagens',
    patrocinadores: 'Patrocinadores',
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
    const hasPrice = parseCurrencyInputBRL(form.unit_price) > 0;
    const hasFeeAcceptance = form.platform_fee_terms_accepted;
    
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
      valid: hasName && hasDate && hasCity && hasTrips && hasBoardingForPublish && hasPrice && hasFeeAcceptance,
      checks: {
        hasName,
        hasDate,
        hasCity,
        hasTrips,
        hasBoardingLocations: hasBoardingForPublish,
        hasPrice,
        hasFeeAcceptance,
      },
    };
  }, [form, eventTrips, eventBoardingLocations]);

  // Computed: is read-only (encerrado)
  const isReadOnly = form.status === 'encerrado';
  const currentEditingEvent = useMemo(
    () => (editingId ? events.find((event) => event.id === editingId) ?? null : null),
    [editingId, events],
  );
  const hasSalesForEditingEvent = editingId ? (salesByEvent.get(editingId) || 0) > 0 : false;
  const isTransportPolicyLocked = Boolean(
    editingId && (currentEditingEvent?.status === 'a_venda' || form.status === 'a_venda' || hasSalesForEditingEvent),
  );
  const transportPolicyLockMessage = !isTransportPolicyLocked
    ? null
    : hasSalesForEditingEvent
      ? 'Política de transporte bloqueada pois já existem passagens vinculadas.'
      : 'Política de transporte não pode ser alterada após a publicação do evento.';

  // Flags de política de transporte — a política do evento (Etapa Geral) define a regra macro.
  // O tipo de transporte por item só aparece na política Flexível (trecho_independente).
  const isGroupedTransportPolicy = form.transport_policy === 'ida_obrigatoria_volta_opcional' || form.transport_policy === 'ida_volta_obrigatorio';
  const isRoundTripMandatoryPolicy = form.transport_policy === 'ida_volta_obrigatorio';
  const isSomenteIdaPolicy = form.transport_policy === 'ida_obrigatoria_volta_opcional';
  const isFlexiblePolicy = form.transport_policy === 'trecho_independente';

  const handleEventCategorySelect = (category: EventCategoryOptionValue) => {
    const suggestedPolicy = categorySuggestedTransportPolicyMap[category];
    // Mantemos a regra existente: se a política estiver bloqueada, só atualizamos a categoria visual.
    if (isTransportPolicyLocked) {
      setForm((prev) => ({ ...prev, event_category: category }));
      setTransportPolicyAutoHintVisible(false);
      return;
    }

    setForm((prev) => ({ ...prev, event_category: category, transport_policy: suggestedPolicy }));
    setTransportPolicyAutoHintVisible(true);
  };

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
      ...drivers
        .filter((driver) => driver.operational_role !== 'auxiliar_embarque')
        .map((driver) => ({
        value: driver.id,
        label: driver.name,
        })),
    ];
  }, [drivers]);

  // Filtered events
  const filteredEvents = useMemo(() => {
    const shouldApplyDefaultOperationalVisibility =
      filters.archiveState === 'active' &&
      filters.status === 'all' &&
      filters.eventCategory === 'all' &&
      filters.startDate === '' &&
      filters.endDate === '' &&
      filters.monthYear === 'all';

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

      if (shouldApplyDefaultOperationalVisibility && !isOperationallyVisible(event.id, operationalEndMap)) {
        return false;
      }

      if (filters.status !== 'all' && event.status !== filters.status) {
        return false;
      }

      if (filters.eventCategory !== 'all' && event.event_category !== filters.eventCategory) {
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
  }, [events, filters, vehiclesById, operationalEndMap]);

  const sortedEvents = useMemo(() => {
    // Sequência obrigatória da listagem: primeiro filtra, depois ordena.
    return [...filteredEvents].sort((a, b) => {
      const eventDateA = parseDateOnlyAsLocal(a.date).getTime();
      const eventDateB = parseDateOnlyAsLocal(b.date).getTime();
      const createdAtA = new Date(a.created_at).getTime();
      const createdAtB = new Date(b.created_at).getTime();

      switch (sortBy) {
        case 'event_date_desc':
          return eventDateB - eventDateA;
        case 'created_at_desc':
          return createdAtB - createdAtA;
        case 'created_at_asc':
          return createdAtA - createdAtB;
        case 'name_asc':
          return a.name.localeCompare(b.name, 'pt-BR');
        case 'name_desc':
          return b.name.localeCompare(a.name, 'pt-BR');
        case 'event_date_asc':
        default:
          return eventDateA - eventDateB;
      }
    });
  }, [filteredEvents, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sortedEvents.length / EVENTS_PER_PAGE));

  const paginatedEvents = useMemo(() => {
    // Paginação aplicada por último, sempre sobre o resultado já filtrado e ordenado.
    const startIndex = (currentPage - 1) * EVENTS_PER_PAGE;
    return sortedEvents.slice(startIndex, startIndex + EVENTS_PER_PAGE);
  }, [currentPage, sortedEvents]);

  const rangeStart = sortedEvents.length === 0 ? 0 : (currentPage - 1) * EVENTS_PER_PAGE + 1;
  const rangeEnd = sortedEvents.length === 0 ? 0 : Math.min(currentPage * EVENTS_PER_PAGE, sortedEvents.length);

  const hasActiveFilters = useMemo(() => {
    return (
      filters.search !== '' ||
      filters.status !== 'all' ||
      filters.eventCategory !== 'all' ||
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

  useEffect(() => {
    // Reset inteligente da paginação ao alterar filtros principais ou ordenação.
    setCurrentPage(1);
  }, [
    filters.search,
    filters.status,
    filters.eventCategory,
    filters.archiveState,
    filters.startDate,
    filters.endDate,
    sortBy,
  ]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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
      setOperationalEndMap(new Map());
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
      const eventRows = data as EventWithTrips[];
      setEvents(eventRows);

      if (eventRows.length > 0) {
        const { data: boardings } = await supabase
          .from('event_boarding_locations')
          .select('event_id, departure_date, departure_time')
          .in('event_id', eventRows.map((event) => event.id))
          .eq('company_id', activeCompanyId)
          .not('departure_date', 'is', null);

        setOperationalEndMap(buildEventOperationalEndMap(eventRows, (boardings ?? []) as any[]));
      } else {
        setOperationalEndMap(new Map());
      }
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
      fetchCompanyPlatformFee();
    }
  }, [activeCompanyId]);

  useEffect(() => {
    return () => {
      if (pendingImagePreviewUrlRef.current) {
        URL.revokeObjectURL(pendingImagePreviewUrlRef.current);
      }
    };
  }, []);

  // Fetch category prices for event — fonte: layout_snapshot dos veículos (verdade oficial)
  const fetchCategoryPrices = async (eventId: string) => {
    setLoadingCategoryPrices(true);
    try {
      // 1. Get saved prices
      const { data: savedPrices } = await supabase
        .from('event_category_prices')
        .select('*')
        .eq('event_id', eventId);

      // 2. Get vehicles linked via trips
      const { data: tripsData } = await supabase
        .from('trips')
        .select('vehicle_id')
        .eq('event_id', eventId);

      const vehicleIds = [...new Set((tripsData ?? []).map((t: any) => t.vehicle_id))];
      let seatCategories: { category: string; count: number }[] = [];

      if (vehicleIds.length > 0) {
        // Fonte principal: layout_snapshot (fonte de verdade oficial do template)
        const { data: vehiclesData } = await supabase
          .from('vehicles')
          .select('layout_snapshot')
          .in('id', vehicleIds);

        const categoryCounts: Record<string, number> = {};
        let usedSnapshot = false;

        (vehiclesData ?? []).forEach((v: any) => {
          if (v.layout_snapshot?.items && Array.isArray(v.layout_snapshot.items)) {
            usedSnapshot = true;
            (v.layout_snapshot.items as any[]).forEach((item: any) => {
              if (!item.is_blocked && item.seat_number) {
                const cat = item.category || 'convencional';
                categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
              }
            });
          }
        });

        // Fallback: se nenhum veículo tem snapshot, usar tabela seats
        if (!usedSnapshot) {
          const { data: seatsData } = await supabase
            .from('seats')
            .select('category')
            .in('vehicle_id', vehicleIds)
            .neq('status', 'bloqueado');

          (seatsData ?? []).forEach((s: any) => {
            categoryCounts[s.category] = (categoryCounts[s.category] ?? 0) + 1;
          });
        }

        seatCategories = Object.entries(categoryCounts).map(([category, count]) => ({ category, count }));
      }

      // 3. Merge: for each category from snapshot, use saved price or empty
      const savedMap = new Map((savedPrices ?? []).map((p: any) => [p.category, p.price]));
      const merged = seatCategories.map(({ category, count }) => ({
        category,
        price: savedMap.has(category) ? formatCurrencyValueBRL(savedMap.get(category)) : '',
        seatCount: count,
      }));

      setCategoryPrices(merged);
    } finally {
      setLoadingCategoryPrices(false);
    }
  };

  // Load event data when editing
  const loadEventData = async (eventId: string) => {
    await Promise.all([
      fetchEventTrips(eventId),
      fetchEventBoardingLocations(eventId),
      fetchEventFees(eventId),
      fetchCategoryPrices(eventId),
    ]);
  };

  // Handlers
  const persistEvent = async (targetStatus: 'rascunho' | 'a_venda' | 'encerrado') => {
    if (!activeCompanyId) {
      toast.error('Empresa não selecionada');
      return { error: true, eventId: editingId, isNew: false };
    }

    // Publicação gera receita: exige taxa válida da empresa e conexão Asaas concluída antes de seguir.
    if (targetStatus === 'a_venda' && !hasValidCompanyPlatformFee) {
      toast.error('Defina a Taxa da Plataforma da empresa em /admin/empresa antes de publicar.');
      setActiveTab('passagens');
      return { error: true, eventId: editingId, isNew: false };
    }

    if (targetStatus === 'a_venda') {
      const hasAsaasConnection = await checkAsaasConnection();
      if (!hasAsaasConnection) {
        setPaymentsGatePendingAction('publish_from_form');
        setPaymentsGateOpen(true);
        return { error: true, eventId: editingId, isNew: false };
      }
    }

    // Validate if trying to publish
    if (targetStatus === 'a_venda' && !publishChecklist.valid) {
      if (!form.platform_fee_terms_accepted) {
        toast.error('Aceite a taxa da plataforma na aba Passagens antes de publicar.');
        setActiveTab('passagens');
      } else {
        toast.error('Corrija os itens pendentes antes de publicar o evento');
        setActiveTab('publicacao');
      }
      return { error: true, eventId: editingId, isNew: false };
    }

    const parsedBoardingTolerance = form.boarding_tolerance_minutes === ''
      ? null
      : parseInt(form.boarding_tolerance_minutes, 10);

    if (parsedBoardingTolerance !== null && (Number.isNaN(parsedBoardingTolerance) || parsedBoardingTolerance <= 0)) {
      toast.error('A tolerância de embarque deve ser um número inteiro positivo');
      return { error: true, eventId: editingId, isNew: false };
    }

    const eventData = {
      name: form.name.trim(),
      date: form.date,
      city: form.city.trim(),
      // Campo opcional: vazio vira null, valor preenchido deve ser inteiro positivo.
      boarding_tolerance_minutes: parsedBoardingTolerance,
      description: form.description || null,
      public_info: form.public_info || null,
      event_category: form.event_category,
      status: targetStatus,
      unit_price: parseCurrencyInputBRL(form.unit_price),
      max_tickets_per_purchase: parseInt(form.max_tickets_per_purchase || '5', 10),
      allow_online_sale: form.allow_online_sale,
      allow_seller_sale: form.allow_seller_sale,
      enable_checkout_validation: form.enable_checkout_validation,
      pass_platform_fee_to_customer: form.pass_platform_fee_to_customer,
      platform_fee_terms_accepted: form.platform_fee_terms_accepted,
      platform_fee_terms_accepted_at: form.platform_fee_terms_accepted ? form.platform_fee_terms_accepted_at ?? new Date().toISOString() : null,
      // Transparência comercial: persistimos versão + usuário para fortalecer evidência de aceite.
      platform_fee_terms_version: form.platform_fee_terms_accepted ? (form.platform_fee_terms_version ?? PLATFORM_FEE_TERMS_VERSION) : null,
      platform_fee_terms_accepted_by: form.platform_fee_terms_accepted ? (form.platform_fee_terms_accepted_by ?? user?.id ?? null) : null,
      // Regra de integridade operacional: não permitimos troca de política após publicação/vendas
      // para evitar inconsistência entre viagens, embarques e passagens já comercializadas.
      transport_policy: isTransportPolicyLocked
        ? ((currentEditingEvent as any)?.transport_policy ?? form.transport_policy)
        : form.transport_policy,
      use_category_pricing: form.use_category_pricing,
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

    // Persist category prices if enabled
    if (!error && newEventId && form.use_category_pricing) {
      const pricesToUpsert = categoryPrices
        .filter((cp) => cp.price !== '' && parseCurrencyInputBRL(cp.price) >= 0)
        .map((cp) => ({
          event_id: newEventId,
          company_id: activeCompanyId!,
          category: cp.category,
          price: parseCurrencyInputBRL(cp.price),
        }));

      if (pricesToUpsert.length > 0) {
        await supabase
          .from('event_category_prices')
          .upsert(pricesToUpsert, { onConflict: 'event_id,category' });
      }

      // Remove prices for categories no longer present
      const activeCategories = categoryPrices.map((cp) => cp.category);
      if (activeCategories.length > 0) {
        await supabase
          .from('event_category_prices')
          .delete()
          .eq('event_id', newEventId)
          .not('category', 'in', `(${activeCategories.join(',')})`);
      }
    }

    // If category pricing was turned off, clean up saved prices
    if (!error && newEventId && !form.use_category_pricing) {
      await supabase
        .from('event_category_prices')
        .delete()
        .eq('event_id', newEventId);
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
      // Compatibilidade com eventos antigos: se a categoria vier nula, inferimos pela política atual.
      event_category: (event.event_category ?? (((event as any).transport_policy ?? 'ida_volta_obrigatorio') === 'trecho_independente' ? 'viagem' : 'evento')),
      date: event.date,
      city: event.city,
      boarding_tolerance_minutes: event.boarding_tolerance_minutes != null ? event.boarding_tolerance_minutes.toString() : '',
      description: event.description ?? '',
      public_info: event.public_info ?? '',
      status: event.status,
      // Padroniza carga do valor inicial com 2 casas no input de moeda (sem duplicar prefixo visual R$).
      unit_price: formatCurrencyValueBRL(event.unit_price ?? 0),
      max_tickets_per_purchase: event.max_tickets_per_purchase?.toString() ?? '0',
      allow_online_sale: event.allow_online_sale ?? true,
      allow_seller_sale: event.allow_seller_sale ?? true,
      enable_checkout_validation: event.enable_checkout_validation ?? false,
      pass_platform_fee_to_customer: (event as any).pass_platform_fee_to_customer ?? false,
      platform_fee_terms_accepted: (event as any).platform_fee_terms_accepted ?? false,
      platform_fee_terms_accepted_at: (event as any).platform_fee_terms_accepted_at ?? null,
      platform_fee_terms_version: (event as any).platform_fee_terms_version ?? null,
      platform_fee_terms_accepted_by: (event as any).platform_fee_terms_accepted_by ?? null,
      image_url: (event as any).image_url ?? null,
      transport_policy: (event as any).transport_policy ?? 'trecho_independente',
      use_category_pricing: (event as any).use_category_pricing ?? false,
    });
    setTransportPolicyAutoHintVisible(false);
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
    const type = trip.trip_type === 'ida' ? 'Somente Ida' : 'Somente Volta';
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

  useEffect(() => {
    if (!tripDialogOpen || editingTripId) return;

    /**
     * Sincronização automática: a política do evento define o tipo de transporte.
     * - ida_volta_obrigatorio → sempre ida_volta
     * - ida_obrigatoria_volta_opcional (Somente ida) → sempre ida
     * - trecho_independente (Flexível) → sem restrição, o usuário escolhe
     */
    if (isRoundTripMandatoryPolicy && tripForm.trip_creation_type !== 'ida_volta') {
      setTripForm((prev) => ({ ...prev, trip_creation_type: 'ida_volta' }));
      return;
    }

    if (isSomenteIdaPolicy && tripForm.trip_creation_type !== 'ida') {
      setTripForm((prev) => ({ ...prev, trip_creation_type: 'ida' }));
      return;
    }
  }, [tripDialogOpen, editingTripId, isRoundTripMandatoryPolicy, isSomenteIdaPolicy, tripForm.trip_creation_type]);

  const handleSaveTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !activeCompanyId) return;

    if (!editingTripId && isRoundTripMandatoryPolicy && tripForm.trip_creation_type !== 'ida_volta') {
      toast.error('Na política de pacote obrigatório, cadastre Ida e Volta em conjunto.');
      return;
    }

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
        toast.success('Transporte atualizado');
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

        toast.success('Transporte de Ida e Volta criado');
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

        toast.success('Transporte adicionado');
      }

      setTripDialogOpen(false);
      resetTripForm();
      fetchEventTrips(editingId);
      fetchEvents();
    } catch (error) {
      toast.error('Erro ao salvar transporte');
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
        `Este transporte possui ${tripBoardings.length} embarque(s) vinculado(s). ` +
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
        `Este transporte possui passagens vendidas ou reservadas. ` +
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
      toast.error('Erro ao excluir transporte');
    } else {
      toast.success('Transporte excluído');
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
      event_category: null,
      date: '',
      city: '',
      boarding_tolerance_minutes: '10',
      description: '',
      public_info: '',
      status: 'rascunho',
      unit_price: '',
      max_tickets_per_purchase: '0',
      allow_online_sale: true,
      allow_seller_sale: true,
      enable_checkout_validation: false,
      pass_platform_fee_to_customer: false,
      platform_fee_terms_accepted: false,
      platform_fee_terms_accepted_at: null,
      platform_fee_terms_version: null,
      platform_fee_terms_accepted_by: null,
      image_url: null,
      // Mantém o mesmo default ao reabrir/limpar o modal de criação.
      transport_policy: 'ida_volta_obrigatorio',
      use_category_pricing: false,
    });
    setTransportPolicyAutoHintVisible(false);
    setCategoryPrices([]);
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
      const hasAsaasConnection = await checkAsaasConnection();
      if (!hasAsaasConnection) {
        setPaymentsGatePendingAction(null);
        setPaymentsGateOpen(true);
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


  const groupedBoardingTripOptions = useMemo(() => {
    // Em políticas agrupadas, mostramos Ida+Volta como uma única opção comercial no seletor de embarques.
    return sortedEventTrips
      .filter((trip) => trip.trip_type === 'ida')
      .map((idaTrip) => {
        const pairedTrip = idaTrip.paired_trip_id
          ? sortedEventTrips.find((trip) => trip.id === idaTrip.paired_trip_id)
          : sortedEventTrips.find((trip) => trip.trip_type === 'volta');

        const baseLabel = idaTrip.vehicle
          ? `${vehicleTypeLabels[idaTrip.vehicle.type]} ${idaTrip.vehicle.plate}`
          : `Transporte ${idaTrip.id.slice(0, 8)}`;

        return {
          value: idaTrip.id,
          label: pairedTrip ? `${baseLabel} — Ida + Volta` : `${baseLabel} — Ida`,
          pairedTripId: pairedTrip?.id ?? null,
        };
      });
  }, [sortedEventTrips]);

  const getBoardingTripIdsForSelection = (tripId: string | null) => {
    if (!tripId) return null;
    if (!isGroupedTransportPolicy) return [tripId];

    const selectedIdaTrip = sortedEventTrips.find((trip) => trip.id === tripId);
    const pairedTrip = selectedIdaTrip?.paired_trip_id
      ? sortedEventTrips.find((trip) => trip.id === selectedIdaTrip.paired_trip_id)
      : sortedEventTrips.find((trip) => trip.trip_type === 'volta');

    // Quando a política é agrupada, tratar ida/volta como um único bloco visual evita duplicidade operacional.
    return pairedTrip ? [tripId, pairedTrip.id] : [tripId];
  };

  const boardingTripSelectorOptions = useMemo(() => {
    if (isGroupedTransportPolicy) {
      return groupedBoardingTripOptions.map((option) => ({ value: option.value, label: option.label }));
    }

    return sortedEventTrips.map((trip) => ({ value: trip.id, label: getTripLabelWithoutTime(trip) }));
  }, [isGroupedTransportPolicy, groupedBoardingTripOptions, sortedEventTrips]);

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
              const hasAsaasConnection = await checkAsaasConnection();
              if (!hasAsaasConnection) {
                setPaymentsGatePendingAction('create_event');
                setPaymentsGateOpen(true);
                return;
              }

              resetForm();
              setIsCreateWizardMode(true);
              setDialogOpen(true);
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Evento
            </Button>
          }
        />

        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertDescription>
            A visão padrão mostra somente eventos ainda dentro da janela operacional. Eventos finalizados continuam acessíveis ao aplicar filtros de histórico.
          </AlertDescription>
        </Alert>

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
            {
              id: 'eventCategory',
              label: 'Categoria do evento',
              placeholder: 'Categoria',
              value: filters.eventCategory,
              onChange: (value) => setFilters({ ...filters, eventCategory: value as EventFilters['eventCategory'] }),
              options: eventCategoryFilterOptions,
              icon: Tag,
            },
            {
              id: 'sortBy',
              label: 'Ordenar por',
              placeholder: 'Ordenação',
              value: sortBy,
              onChange: (value) => setSortBy(value as EventSortOption),
              options: eventSortOptions,
              icon: ArrowUpDown,
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
          onClearFilters={() => {
            setFilters(initialFilters);
            setSortBy('event_date_asc');
            setCurrentPage(1);
          }}
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
                const hasAsaasConnection = await checkAsaasConnection();
                if (!hasAsaasConnection) {
                  setPaymentsGatePendingAction('create_event');
                  setPaymentsGateOpen(true);
                  return;
                }

                resetForm();
                setIsCreateWizardMode(true);
                setDialogOpen(true);
              }}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Evento
              </Button>
            }
          />
        ) : sortedEvents.length === 0 ? (
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
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {paginatedEvents.map((event) => (
              <Card 
                key={event.id} 
                className={cn(
                  'card-corporate h-full overflow-hidden transition-all duration-300',
                  event.status === 'a_venda' && 'ring-1 ring-success/30 card-active-glow',
                  event.status === 'encerrado' && 'opacity-70',
                  event.status === 'rascunho' && 'border-dashed',
                )}
              >
                {/* Image with fallback - 1:1 padrão oficial (1080×1080 recomendado). */}
                {(() => {
                  const imgUrl = event.image_url || '/assets/eventos/evento_padrao.png';
                  return (
                    <div className="aspect-square w-full relative overflow-hidden bg-muted">
                      <img 
                        src={imgUrl} 
                        alt=""
                        aria-hidden="true"
                        className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-40"
                      />
                      <img 
                        src={imgUrl} 
                        alt={event.name}
                        className="relative w-full h-full object-contain"
                      />
                    </div>
                  );
                })()}
                
                <CardContent className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <DateBadge date={event.date} className="flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <h3 className="font-semibold text-foreground line-clamp-2">{event.name}</h3>
                        <ActionsDropdown actions={getEventActions(event)} />
                      </div>
                    </div>
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

            <div className="mt-4 flex flex-col gap-3 border-t px-1 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-muted-foreground">
                Exibindo {rangeStart}–{rangeEnd} de {sortedEvents.length} eventos
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">Página {currentPage} de {totalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage >= totalPages}
                >
                  Próxima
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </>
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
                        Etapa {getStepNumber(activeTab)} de {WIZARD_TABS_ORDER.length} — {WIZARD_TAB_LABELS[activeTab] || 'Geral'}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {Math.round((getStepNumber(activeTab) / WIZARD_TABS_ORDER.length) * 100)}%
                      </span>
                    </div>
                    <Progress value={(getStepNumber(activeTab) / WIZARD_TABS_ORDER.length) * 100} className="h-2" />
                  </div>
                )}

                <TabsList className="admin-modal__tabs flex h-auto w-full flex-wrap justify-start gap-1 px-6 py-2 border-b bg-muted/30">
                  {[
                    { value: 'geral', label: 'Geral', icon: FileText, count: null },
                    { value: 'viagens', label: 'Frotas', icon: Bus, count: editingId ? uniqueFleets : null },
                    { value: 'embarques', label: 'Embarques', icon: MapPin, count: editingId ? eventBoardingLocations.length : null },
                    { value: 'passagens', label: 'Passagens', icon: Ticket, count: null },
                    { value: 'patrocinadores', label: 'Patrocinadores', icon: Star, count: null },
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
                              <div className="inline-flex">
                                <input
                                  ref={replaceImageInputRef}
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  disabled={isReadOnly || uploadingImage}
                                  onChange={(e) => handleImageUpload(e.target.files?.[0])}
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={uploadingImage || isReadOnly}
                                  onClick={() => {
                                    // O clique no botão aciona explicitamente o input oculto.
                                    replaceImageInputRef.current?.click();
                                  }}
                                >
                                  <Upload className="h-4 w-4 mr-1" />
                                  Trocar
                                </Button>
                              </div>
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
                        <div className="space-y-2">
                          {/* Ajuste estrutural: categoria em linha própria para não disputar altura com o input de nome. */}
                          <Label>Categoria do Evento</Label>
                          {/* Grid ajustado para 3 colunas no desktop; com 5 opções mantém composição em 2 linhas (3 + 2). */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                            {eventCategoryOptions.map((option) => {
                              const isSelected = form.event_category === option.value;
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  disabled={isReadOnly}
                                  onClick={() => handleEventCategorySelect(option.value)}
                                  className={cn(
                                    'relative flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-all',
                                    isSelected
                                      ? 'ring-2 ring-primary border-primary bg-primary/5'
                                      : 'hover:border-primary/50 hover:bg-muted/50',
                                    isReadOnly && 'opacity-60 cursor-not-allowed',
                                  )}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm">{option.icon}</span>
                                    <span className="font-medium text-xs">{option.label}</span>
                                  </div>
                                  <p className="text-[11px] leading-snug text-muted-foreground">{option.description}</p>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-3">
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
                              Local onde o evento acontece (destino final do transporte)
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="boarding_tolerance_minutes">Tolerância (min)</Label>
                            <Input
                              id="boarding_tolerance_minutes"
                              type="number"
                              min={1}
                              step={1}
                              value={form.boarding_tolerance_minutes}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value === '') {
                                  setForm({ ...form, boarding_tolerance_minutes: '' });
                                  return;
                                }
                                const parsed = parseInt(value, 10);
                                if (Number.isNaN(parsed) || parsed <= 0) return;
                                setForm({ ...form, boarding_tolerance_minutes: parsed.toString() });
                              }}
                              placeholder="Ex: 10"
                              disabled={isReadOnly}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Política de Transporte — cards selecionáveis (regra macro do evento) */}
                    <div className="space-y-3">
                      <Label>Política de Transporte do Evento *</Label>
                      {transportPolicyLockMessage && (
                        <p className="text-xs text-amber-600">
                          {transportPolicyLockMessage}
                        </p>
                      )}
                      {transportPolicyAutoHintVisible && !transportPolicyLockMessage && (
                        <p className="text-xs text-muted-foreground">
                          Ajustamos automaticamente a política de transporte com base na categoria selecionada.
                        </p>
                      )}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                        {transportPolicyOptions.map((option) => {
                          const isSelected = form.transport_policy === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              disabled={isReadOnly || isTransportPolicyLocked}
                              onClick={() => {
                                if (isTransportPolicyLocked) return;
                                setForm({ ...form, transport_policy: option.value as TransportPolicy });
                                // Se houve ajuste automático anterior, ao editar manualmente removemos a mensagem.
                                setTransportPolicyAutoHintVisible(false);
                              }}
                              className={cn(
                                'relative flex flex-col items-start gap-1.5 rounded-lg border p-4 text-left transition-all',
                                isSelected
                                  ? 'ring-2 ring-primary border-primary bg-primary/5'
                                  : 'hover:border-primary/50 hover:bg-muted/50',
                                (isReadOnly || isTransportPolicyLocked) && 'opacity-60 cursor-not-allowed'
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-lg">{option.icon}</span>
                                <span className="font-medium text-sm">{option.label}</span>
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed">{option.description}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
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
                        <Label htmlFor="public_info">Informações e Regras (exibidas ao público)</Label>
                        <Textarea
                          id="public_info"
                          value={form.public_info}
                          onChange={(e) => setForm({ ...form, public_info: e.target.value })}
                          placeholder="Ex: regras de embarque, documentos obrigatórios e orientações gerais"
                          rows={3}
                          disabled={isReadOnly}
                        />
                        <p className="text-xs text-muted-foreground">
                          Esse conteúdo será exibido no aplicativo público ao clicar em 'Informações e regras'.
                        </p>
                      </div>
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
                        <p>Salve o evento primeiro para adicionar transportes.</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium">Transportes do Evento</h3>
                          {!isReadOnly && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setTripDialogOpen(true)}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Adicionar Transporte
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
                            <p>Nenhum transporte cadastrado</p>
                            <p className="text-sm">Adicione transportes para este evento</p>
                            {!isReadOnly && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mt-4"
                                onClick={() => setTripDialogOpen(true)}
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                Adicionar Transporte
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="grid gap-3 lg:grid-cols-2">
                            {/* Agrupamos trips pareadas em um único card de "Transporte" */}
                            {(() => {
                              const renderedTripIds = new Set<string>();
                              return sortedEventTrips.map((trip) => {
                                if (renderedTripIds.has(trip.id)) return null;
                                renderedTripIds.add(trip.id);

                                const pairedTrip = trip.paired_trip_id 
                                  ? eventTrips.find(t => t.id === trip.paired_trip_id) 
                                  : null;
                                
                                // Se esta é a volta de um par já renderizado, pular
                                if (trip.trip_type === 'volta' && pairedTrip && renderedTripIds.has(pairedTrip.id)) return null;
                                
                                if (pairedTrip) renderedTripIds.add(pairedTrip.id);

                                const isPaired = !!pairedTrip;
                                const badgeLabel = isPaired 
                                  ? 'IDA E VOLTA' 
                                  : trip.trip_type === 'ida' ? 'SOMENTE IDA' : 'SOMENTE VOLTA';
                                const badgeClass = isPaired
                                  ? 'bg-primary/10 text-primary'
                                  : trip.trip_type === 'ida'
                                    ? 'bg-primary/10 text-primary'
                                    : 'bg-secondary text-secondary-foreground';
                                
                                return (
                                  <Card key={trip.id} className="p-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-4 flex-wrap">
                                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${badgeClass}`}>
                                            {badgeLabel}
                                          </span>
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
                              });
                            })()}
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
                        <p>Adicione transportes primeiro</p>
                        <p className="text-sm">Cada embarque deve estar vinculado a um transporte específico.</p>
                      </div>
                    ) : (
                      <>
                        <div className="grid gap-4 lg:grid-cols-[40%,1fr] items-end">
                          <div className="space-y-2">
                            <Label>Selecionar transporte</Label>
                            <Select
                              value={selectedTripIdForBoardings ?? '__none__'}
                              onValueChange={(value) => setSelectedTripIdForBoardings(value === '__none__' ? null : value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione um transporte" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Todos os transportes</SelectItem>
                                {boardingTripSelectorOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center gap-6 text-sm pb-1">
                            <div>
                              <span className="text-muted-foreground">Total de embarques: </span>
                              <span className="font-medium">
                                {selectedTripIdForBoardings
                                  ? eventBoardingLocations.filter((ebl) => {
                                      const selectedTripIds = getBoardingTripIdsForSelection(selectedTripIdForBoardings);
                                      return selectedTripIds ? selectedTripIds.includes(ebl.trip_id ?? '') : false;
                                    }).length
                                  : eventBoardingLocations.length}
                              </span>
                            </div>
                            {(() => {
                              const targetTrip = selectedTripIdForBoardings || (sortedEventTrips.length > 0 ? sortedEventTrips[0].id : null);
                              if (!targetTrip) return null;
                              const selectedTripIds = getBoardingTripIdsForSelection(targetTrip) ?? [targetTrip];
                              const firstBoarding = eventBoardingLocations
                                .filter((ebl) => selectedTripIds.includes(ebl.trip_id ?? ''))
                                .sort((a, b) => a.stop_order - b.stop_order)[0];
                              if (!firstBoarding?.departure_time) return null;
                              return (
                                <div>
                                  <span className="text-muted-foreground">Horário base: </span>
                                  <span className="font-medium">{firstBoarding.departure_time.slice(0, 5)}</span>
                                </div>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <h3 className="font-medium">
                            {selectedTripIdForBoardings 
                              ? isGroupedTransportPolicy
                                ? 'Embarques do transporte selecionado (Ida + Volta)'
                                : 'Embarques do transporte selecionado'
                              : 'Todos os embarques'
                            }
                          </h3>
                          <div className="flex gap-2">
                            {/* Copy from Ida button - only for Volta trips */}
                            {!isReadOnly && selectedTripIdForBoardings && !isGroupedTransportPolicy && (() => {
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
                            ? eventBoardingLocations.filter((ebl) => {
                                const selectedTripIds = getBoardingTripIdsForSelection(selectedTripIdForBoardings);
                                return selectedTripIds ? selectedTripIds.includes(ebl.trip_id ?? '') : false;
                              })
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
                          const canReorderBoardings = !isReadOnly && Boolean(selectedTripIdForBoardings) && !isGroupedTransportPolicy;

                          if (sortedBoardings.length === 0) {
                            return (
                              <div className="text-center py-8 text-muted-foreground border rounded-lg">
                                <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p>Nenhum local de embarque definido</p>
                                <p className="text-sm">
                                  {selectedTripIdForBoardings 
                                    ? isGroupedTransportPolicy
                                      ? 'Adicione locais para o transporte (ida e volta)'
                                      : 'Adicione locais para este transporte'
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

                    {/* Card 1 — Configuração da Passagem */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Configuração da Passagem</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="unit_price">Preço Base da Passagem *</Label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                              <Input
                                id="unit_price"
                                type="text"
                                inputMode="numeric"
                                className="pl-10"
                                value={form.unit_price}
                                onChange={(e) => setForm({ ...form, unit_price: formatCurrencyInputValueFromDigits(e.target.value) })}
                                placeholder="0,00"
                                disabled={isReadOnly}
                              />
                            </div>
                            {form.use_category_pricing && (
                              <p className="text-xs text-muted-foreground">
                                Usado como fallback para categorias sem preço definido
                              </p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="max_tickets">Limite por Compra</Label>
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

                        <Separator />

                        {/* Switch: pricing por categoria */}
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label htmlFor="use_category_pricing">Usar preços por categoria de assento</Label>
                            <p className="text-xs text-muted-foreground">
                              Define preços diferentes para cada tipo de assento (ex.: convencional, executivo, leito)
                            </p>
                          </div>
                          <Switch
                            id="use_category_pricing"
                            checked={form.use_category_pricing}
                            onCheckedChange={(checked) => {
                              setForm({ ...form, use_category_pricing: checked });
                              if (checked && editingId && categoryPrices.length === 0) {
                                fetchCategoryPrices(editingId);
                              }
                            }}
                            disabled={isReadOnly}
                          />
                        </div>

                        {/* Category prices list */}
                        {form.use_category_pricing && (
                          <div className="space-y-3">
                            {loadingCategoryPrices ? (
                              <div className="flex items-center justify-center py-4">
                                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                              </div>
                            ) : categoryPrices.length === 0 ? (
                              <Alert>
                                <AlertTriangle className="h-4 w-4" />
                                <AlertDescription>
                                  Nenhuma categoria de assento encontrada nos veículos vinculados a este evento.
                                  Vincule frotas com layouts configurados na aba Frotas.
                                </AlertDescription>
                              </Alert>
                            ) : (
                              <>
                                {categoryPrices.every((cp) => !cp.price || cp.price === '') && (
                                  <Alert>
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertDescription>
                                      Nenhum preço por categoria definido. O preço base ({formatCurrencyBRL(parseCurrencyInputBRL(form.unit_price))}) será usado para todos os assentos.
                                    </AlertDescription>
                                  </Alert>
                                )}
                                <div className="grid gap-3 sm:grid-cols-2">
                                  {categoryPrices.map((cp, idx) => (
                                    <div key={cp.category} className="space-y-1.5 p-3 rounded-lg border bg-card">
                                      <div className="flex items-center justify-between">
                                        <Label className="text-sm font-medium">
                                          {seatCategoryLabels[cp.category] ?? cp.category}
                                        </Label>
                                        <span className="text-xs text-muted-foreground">
                                          {cp.seatCount} assento{cp.seatCount !== 1 ? 's' : ''}
                                        </span>
                                      </div>
                                      <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                                        <Input
                                          type="text"
                                          inputMode="numeric"
                                          className="pl-10 h-9"
                                          value={cp.price}
                                          onChange={(e) => {
                                            setCategoryPrices((prev) =>
                                              prev.map((item, i) => i === idx ? { ...item, price: formatCurrencyInputValueFromDigits(e.target.value) } : item)
                                            );
                                          }}
                                          placeholder="0,00"
                                          disabled={isReadOnly}
                                        />
                                      </div>
                                      {(!cp.price || cp.price === '') && (
                                        <p className="text-[11px] text-muted-foreground">
                                          Usará preço base: {formatCurrencyBRL(parseCurrencyInputBRL(form.unit_price))}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Card 2 — Canais de Venda */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Canais de Venda</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
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
                        <Separator />
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
                        <Separator />
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label htmlFor="enable_checkout_validation">Registrar saída (checkout)</Label>
                            <p className="text-sm text-muted-foreground">
                              Habilita o botão opcional de saída no app do motorista
                            </p>
                          </div>
                          <Switch
                            id="enable_checkout_validation"
                            checked={form.enable_checkout_validation}
                            onCheckedChange={(checked) => setForm({ ...form, enable_checkout_validation: checked })}
                            disabled={isReadOnly}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    {/* Card 3 — Taxa da Plataforma (dinâmica por empresa) */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <DollarSign className="h-4 w-4" />
                          Taxa da Plataforma ({hasValidCompanyPlatformFee ? `${companyTotalPlatformFeePercent}%` : 'indisponível'})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          A taxa aplicada na venda online considera a taxa total configurada na empresa.
                        </p>

                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label htmlFor="platform_fee_pass">Repassar taxa para o cliente</Label>
                            <p className="text-xs text-muted-foreground">
                              Se ativado, o cliente pagará o preço base + taxa total (plataforma + sócio) da empresa
                            </p>
                          </div>
                          <Switch
                            id="platform_fee_pass"
                            checked={form.pass_platform_fee_to_customer}
                            onCheckedChange={(checked) => setForm({ ...form, pass_platform_fee_to_customer: checked })}
                            disabled={isReadOnly}
                          />
                        </div>

                        {/* Simulação dinâmica */}
                        {form.unit_price && parseCurrencyInputBRL(form.unit_price) > 0 && (() => {
                          const basePrice = parseCurrencyInputBRL(form.unit_price);
                          if (!hasValidCompanyPlatformFee) {
                            return (
                              <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertDescription>
                                  Não foi possível carregar a taxa da plataforma da empresa. Ajuste em /admin/empresa para liberar a simulação.
                                </AlertDescription>
                              </Alert>
                            );
                          }

                          const platformFee = Math.round(basePrice * (companyTotalPlatformFeePercent / 100) * 100) / 100;
                          const clientPrice = form.pass_platform_fee_to_customer ? Math.round((basePrice + platformFee) * 100) / 100 : basePrice;
                          const organizerNet = form.pass_platform_fee_to_customer ? basePrice : Math.round((basePrice - platformFee) * 100) / 100;

                          return (
                            <Card className="p-3 bg-muted/50">
                              <p className="text-xs text-muted-foreground mb-2 font-medium">Simulação</p>
                              <div className="text-sm space-y-1">
                                <div className="flex justify-between">
                                  <span>Preço base</span>
                                  <span>{formatCurrencyBRL(basePrice)}</span>
                                </div>
                                <div className="flex justify-between text-muted-foreground">
                                  <span>Taxa da plataforma ({companyTotalPlatformFeePercent}%)</span>
                                  <span>{formatCurrencyBRL(platformFee)}</span>
                                </div>
                                <Separator className="my-1" />
                                <div className="flex justify-between font-medium">
                                  <span>Preço final ao cliente</span>
                                  <span>{formatCurrencyBRL(clientPrice)}</span>
                                </div>
                                <div className="flex justify-between font-medium text-primary">
                                  <span>Valor líquido do organizador</span>
                                  <span>{formatCurrencyBRL(organizerNet)}</span>
                                </div>
                              </div>
                            </Card>
                          );
                        })()}
                      </CardContent>
                    </Card>

                    {/* Card 4 — Aceite Obrigatório */}
                    <Card className={cn(
                      'border',
                      !form.platform_fee_terms_accepted && 'border-orange-500/30 bg-orange-500/5'
                    )}>
                      <CardContent className="pt-6">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            id="platform_fee_accepted"
                            checked={form.platform_fee_terms_accepted}
                            onCheckedChange={(checked) => setForm({
                              ...form,
                              // Transparência comercial: aceite explicita não devolução da taxa em cancelamentos/reembolsos.
                              platform_fee_terms_accepted: checked === true,
                              platform_fee_terms_accepted_at: checked === true ? (form.platform_fee_terms_accepted_at ?? new Date().toISOString()) : null,
                              platform_fee_terms_version: checked === true ? (form.platform_fee_terms_version ?? PLATFORM_FEE_TERMS_VERSION) : null,
                              platform_fee_terms_accepted_by: checked === true ? (form.platform_fee_terms_accepted_by ?? user?.id ?? null) : null,
                            })}
                            disabled={isReadOnly}
                          />
                          <div className="text-sm leading-relaxed">
                            <label htmlFor="platform_fee_accepted" className="cursor-pointer">
                              Li e aceito os termos da taxa da plataforma Smartbus BR, incluindo a regra de não devolução da taxa em cancelamentos ou reembolsos ao passageiro.
                            </label>{' '}
                            <Button
                              type="button"
                              variant="link"
                              className="h-auto p-0 align-baseline"
                              onClick={() => setPlatformFeeTermsDialogOpen(true)}
                              disabled={isReadOnly}
                            >
                              Ler termos
                            </Button>
                          </div>
                        </div>
                        {!form.platform_fee_terms_accepted && (
                          <p className="text-xs text-orange-600 mt-2 ml-7">
                            Este aceite é obrigatório para publicar o evento.
                          </p>
                        )}
                      </CardContent>
                    </Card>

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
                                        ? formatCurrencyBRL(Number(fee.value))
                                        : `${Number(fee.value).toFixed(1)}%`}
                                      {fee.fee_type === 'percent' && form.unit_price && (
                                        <span className="ml-1">
                                          (≈ {formatCurrencyBRL((parseCurrencyInputBRL(form.unit_price) * fee.value / 100))})
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

                        {/* ─── Simulação financeira (Etapa Passagens) ───
                           Mostra o impacto completo: base + taxas + comissão + líquido.
                           Mesma fórmula usada na Publicação e no checkout online. */}
                        {form.unit_price && parseCurrencyInputBRL(form.unit_price) > 0 && (
                          <CalculationSimulationCard
                            basePrice={parseCurrencyInputBRL(form.unit_price)}
                            fees={eventFees}
                            platformFeePercent={hasValidCompanyPlatformFee ? companyTotalPlatformFeePercent : undefined}
                            passPlatformFeeToCustomer={form.pass_platform_fee_to_customer}
                          />
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

                  {/* Tab Patrocinadores */}
                  <TabsContent value="patrocinadores" className="mt-0">
                    {editingId ? (
                      <EventSponsorsTab eventId={editingId} companyId={activeCompanyId!} isReadOnly={isReadOnly} />
                    ) : (
                      <p className="text-sm text-muted-foreground py-8 text-center">
                        Salve o evento primeiro para vincular patrocinadores.
                      </p>
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

                      {/* ─── Resumo Financeiro do Evento (Etapa Publicação) ───
                         Cálculo centralizado: comissão da plataforma incide sobre o valor BRUTO
                         cobrado do cliente (preço base + taxas adicionais), garantindo consistência
                         com o valor bruto cobrado no checkout (gross_amount). */}
                      {editingId && form.unit_price && parseCurrencyInputBRL(form.unit_price) > 0 && (
                        <Card className="p-4">
                          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            Resumo Financeiro do Evento
                          </h4>
                          <div className="text-sm space-y-2">
                            {(() => {
                              const basePrice = parseCurrencyInputBRL(form.unit_price);
                              if (!hasValidCompanyPlatformFee) {
                                return (
                                  <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertDescription>
                                      Não foi possível carregar a taxa da plataforma da empresa. Ajuste em /admin/empresa para liberar a simulação.
                                    </AlertDescription>
                                  </Alert>
                                );
                              }

                              // Soma das taxas adicionais ativas (fixas ou percentuais)
                              const totalAdditionalFees = eventFees
                                .filter(f => f.is_active)
                                .reduce((sum, fee) => sum + (fee.fee_type === 'percent' ? basePrice * fee.value / 100 : fee.value), 0);
                              const totalAdditionalFeesRounded = Math.round(totalAdditionalFees * 100) / 100;

                              // Valor bruto cobrado do cliente ANTES de eventual repasse da taxa da plataforma
                              const grossPerTicket = Math.round((basePrice + totalAdditionalFeesRounded) * 100) / 100;

                              // Comissão da plataforma incide sobre o bruto (base + taxas adicionais)
                              const feePercent = companyTotalPlatformFeePercent;
                              const platformFee = Math.round(grossPerTicket * (feePercent / 100) * 100) / 100;

                              // Valor final ao cliente e líquido da empresa dependem de quem absorve a comissão
                              const clientPrice = form.pass_platform_fee_to_customer
                                ? Math.round((grossPerTicket + platformFee) * 100) / 100
                                : grossPerTicket;
                              const organizerNet = form.pass_platform_fee_to_customer
                                ? grossPerTicket
                                : Math.round((grossPerTicket - platformFee) * 100) / 100;

                              return (
                                <>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Preço base da passagem</span>
                                    <span>{formatCurrencyBRL(basePrice)}</span>
                                  </div>
                                  {totalAdditionalFeesRounded > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Taxas adicionais</span>
                                      <span>+ {formatCurrencyBRL(totalAdditionalFeesRounded)}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between font-medium">
                                    <span>Valor final ao cliente</span>
                                    <span>{formatCurrencyBRL(clientPrice)}</span>
                                  </div>
                                  <Separator className="my-1" />
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Comissão plataforma + sócio ({feePercent}%)</span>
                                    <span>{formatCurrencyBRL(platformFee)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Responsável pela comissão</span>
                                    <span>{form.pass_platform_fee_to_customer ? 'Cliente' : 'Organizador'}</span>
                                  </div>
                                  <Separator className="my-1" />
                                  <div className="flex justify-between font-medium text-primary">
                                    <span>Líquido estimado por ingresso</span>
                                    <span>{formatCurrencyBRL(organizerNet)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Canais ativos</span>
                                    <span>
                                      {[form.allow_online_sale && 'Online', form.allow_seller_sale && 'Vendedor'].filter(Boolean).join(' • ') || 'Nenhum'}
                                    </span>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </Card>
                      )}

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
                            <div className="flex items-center gap-2">
                              {publishChecklist.checks.hasFeeAcceptance ? (
                                <Check className="h-4 w-4 text-green-600" />
                              ) : (
                                <XCircle className="h-4 w-4 text-destructive" />
                              )}
                              <span className={publishChecklist.checks.hasFeeAcceptance ? 'text-muted-foreground' : 'text-destructive'}>
                                Taxa da plataforma aceita
                              </span>
                            </div>
                          </div>
                          {!publishChecklist.valid && (
                            <p className="text-xs text-orange-600 mt-3">
                              Atenção: Corrija os itens pendentes antes de publicar o evento para venda.
                            </p>
                          )}
                          {/* Reforço operacional: cancelar venda/reembolsar passageiro não devolve taxa da plataforma. */}
                          <Alert className="mt-3 border-blue-500/30 bg-blue-500/5">
                            <AlertDescription className="text-xs text-blue-800 dark:text-blue-200">
                              Importante: em caso de cancelamento ou reembolso ao passageiro, a taxa da plataforma Smartbus BR permanece devida e não é devolvida à empresa organizadora.
                            </AlertDescription>
                          </Alert>
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
                    placeholder={feeForm.fee_type === 'fixed' ? 'R$ 0,00' : '0.0'}
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

        {/* Modal de termos da taxa da plataforma para reforçar transparência na etapa de passagens. */}
        <Dialog open={platformFeeTermsDialogOpen} onOpenChange={setPlatformFeeTermsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh]">
            <DialogHeader>
              <DialogTitle>Termos da Taxa da Plataforma</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 overflow-y-auto pr-1 text-sm leading-relaxed">
              <div>
                <p className="font-semibold">1. Cobrança da taxa</p>
                <p className="text-muted-foreground">
                  Ao ativar a venda de passagens neste evento, a empresa organizadora declara ciência e concordância com a cobrança da taxa da plataforma Smartbus BR sobre as vendas realizadas pelos canais digitais do sistema, conforme configuração comercial vigente da conta.
                </p>
              </div>

              <div>
                <p className="font-semibold">2. Natureza da taxa</p>
                <p className="text-muted-foreground">
                  A taxa da plataforma Smartbus BR remunera a intermediação da venda, a disponibilização do sistema, a estrutura tecnológica e os custos operacionais da plataforma.
                </p>
              </div>

              <div>
                <p className="font-semibold">3. Aplicação da taxa</p>
                <p className="text-muted-foreground">
                  Essa taxa é aplicada automaticamente apenas em vendas realizadas pelo sistema de venda online da plataforma.
                </p>
              </div>

              <div>
                <p className="font-semibold">4. Vendas manuais</p>
                <p className="text-muted-foreground">
                  Vendas registradas manualmente no painel administrativo podem não estar sujeitas à mesma cobrança automática da plataforma, dependendo do fluxo utilizado.
                </p>
              </div>

              <div>
                <p className="font-semibold">5. Cancelamento, reembolso e taxa da plataforma</p>
                <p className="text-muted-foreground">
                  Em caso de cancelamento da venda, cancelamento da passagem ou reembolso ao passageiro, a taxa da plataforma Smartbus BR não será devolvida à empresa organizadora.
                </p>
              </div>

              <div>
                <p className="font-semibold">6. Responsabilidade por reembolso</p>
                <p className="text-muted-foreground">
                  Caso a empresa opte por reembolsar total ou parcialmente o passageiro, esse reembolso será de responsabilidade da própria empresa organizadora, conforme sua política comercial e operacional, sem implicar devolução da taxa da plataforma.
                </p>
              </div>

              <div>
                <p className="font-semibold">7. Aceite e rastreabilidade</p>
                <p className="text-muted-foreground">
                  Ao publicar um evento utilizando o sistema de venda online da plataforma, o organizador declara estar ciente destes termos. O sistema registra data/hora, versão do termo e usuário responsável pelo aceite.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPlatformFeeTermsDialogOpen(false)}>
                Fechar
              </Button>
              <Button type="button" onClick={handleAcceptPlatformFeeTerms} disabled={isReadOnly}>
                Li e aceito
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Trip Modal - Simplified without time fields */}
        <Dialog open={tripDialogOpen} onOpenChange={(open) => { setTripDialogOpen(open); if (!open) resetTripForm(); }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingTripId ? 'Editar Transporte' : 'Adicionar Transporte'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSaveTrip} className="space-y-4">
              {/*
                * Tipo de Transporte — lógica condicional baseada na política do evento:
                * - ida_volta_obrigatorio / ida_obrigatoria_volta_opcional: tipo inferido automaticamente, campo oculto.
                * - trecho_independente (Flexível): o usuário escolhe entre Ida, Volta ou Ida e Volta.
                */}
              {!editingTripId ? (
                isFlexiblePolicy ? (
                  <div className="space-y-2">
                    <Label>Tipo de Transporte *</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: 'ida' as TripCreationType, label: 'Somente Ida', icon: '➡️' },
                        { value: 'volta' as TripCreationType, label: 'Somente Volta', icon: '⬅️' },
                        { value: 'ida_volta' as TripCreationType, label: 'Ida e Volta', icon: '🔗' },
                      ]).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setTripForm({ ...tripForm, trip_creation_type: opt.value })}
                          className={cn(
                            'flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-all text-xs',
                            tripForm.trip_creation_type === opt.value
                              ? 'ring-2 ring-primary border-primary bg-primary/5'
                              : 'hover:border-primary/50 hover:bg-muted/50'
                          )}
                        >
                          <span className="text-base">{opt.icon}</span>
                          <span className="font-medium">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                    {tripForm.trip_creation_type === 'ida_volta' && (
                      <p className="text-xs text-muted-foreground">
                        Serão criados dois trajetos vinculados (ida e volta) com os mesmos dados.
                      </p>
                    )}
                  </div>
                ) : null /* Políticas não-flexíveis: tipo inferido automaticamente, sem campo visível */
              ) : (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Tipo: <span className="font-medium text-foreground">{tripForm.trip_creation_type === 'ida' ? 'Somente Ida' : tripForm.trip_creation_type === 'volta' ? 'Somente Volta' : 'Ida e Volta'}</span>
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
                      {drivers
                        .filter((driver) => driver.operational_role !== 'auxiliar_embarque')
                        .map((driver) => (
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
                  O horário do transporte é definido automaticamente pelo primeiro embarque cadastrado.
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
                <Label htmlFor="trip_link">Vincular ao transporte *</Label>
                <Select
                  value={boardingForm.trip_id || '__none__'}
                  onValueChange={(value) => setBoardingForm({ ...boardingForm, trip_id: value === '__none__' ? '' : value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um transporte *" />
                  </SelectTrigger>
                  <SelectContent>
                    {isGroupedTransportPolicy
                      ? groupedBoardingTripOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))
                      : sortedEventTrips.map((trip) => (
                          <SelectItem key={trip.id} value={trip.id}>
                            {getTripLabelWithoutTime(trip)}
                          </SelectItem>
                        ))
                    }
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

      {/* Modal bloqueante para monetização: força conexão de pagamentos antes de criar/publicar evento. */}
      <Dialog open={paymentsGateOpen} onOpenChange={(open) => {
        if (!open) {
          setPaymentsGateOpen(false);
          setPaymentsGatePendingAction(null);
          return;
        }
        setPaymentsGateOpen(open);
      }}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
          <div className="p-6 pb-0">
            <DialogHeader className="space-y-3">
              <div className="mx-auto mb-1 inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#635BFF] to-[#7C3AED] shadow-lg shadow-[#635BFF]/20">
                <ShieldCheck className="h-7 w-7 text-white" />
              </div>
              <div className="mx-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200">
                <Lock className="h-3 w-3" />
                Conexão Segura SSL
              </div>
              <DialogTitle className="text-center text-xl">Configure seus pagamentos para começar a vender</DialogTitle>
              <p className="text-sm text-center font-medium text-muted-foreground">
                Conecte sua empresa ao Asaas e receba via Pix e cartão com repasse automático.
              </p>
            </DialogHeader>
          </div>

          <div className="px-6 py-4 space-y-4">
            <div className="space-y-2.5">
              {[
                'Receba pagamentos via Pix e Cartão',
                'Repasse automático para a conta da sua empresa',
                'Processo 100% seguro e criptografado',
              ].map((text) => (
                <div key={text} className="flex items-center gap-2.5">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                    <Check className="h-3 w-3 text-emerald-600" />
                  </div>
                  <span className="text-sm text-foreground">{text}</span>
                </div>
              ))}
            </div>

            <div className="rounded-lg bg-muted/50 border p-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Após a conexão, você poderá publicar eventos e iniciar as vendas sem configurações adicionais.
              </p>
            </div>
          </div>

          <Separator />

          <div className="px-6 pb-5 pt-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => {
                  setPaymentsGateOpen(false);
                  setPaymentsGatePendingAction(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="h-11 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
                onClick={() => { void handleOpenAsaasWizardFromGate(); }}
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Conectar Pagamentos
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground text-center">
              Pagamentos seguros via Asaas
            </p>
          </div>
        </DialogContent>
      </Dialog>


      <AsaasOnboardingWizard
        open={asaasWizardOpen}
        onOpenChange={setAsaasWizardOpen}
        companyData={asaasWizardCompanyData}
        onSuccess={async () => {
          const connected = await checkAsaasConnection();
          if (!connected) return;

          setPaymentsGateOpen(false);
          if (paymentsGatePendingAction === 'create_event') {
            resetForm();
            setIsCreateWizardMode(true);
            setDialogOpen(true);
          }
          setPaymentsGatePendingAction(null);
        }}
      />

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
