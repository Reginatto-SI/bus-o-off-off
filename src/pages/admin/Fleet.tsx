import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Vehicle } from '@/types/database';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatsCard } from '@/components/admin/StatsCard';
import { FilterCard, FilterInput } from '@/components/admin/FilterCard';
import { ActionsDropdown, ActionItem } from '@/components/admin/ActionsDropdown';
import { ExportExcelModal, ExportColumn } from '@/components/admin/ExportExcelModal';
import { ExportPDFModal } from '@/components/admin/ExportPDFModal';
import {
  Dialog,
  DialogClose,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  Bus,
  CheckCircle,
  FileSpreadsheet,
  FileText,
  IdCard,
  Loader2,
  Pencil,
  Plus,
  Power,
  Radio,
  Users,
  Wrench,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { buildDebugToastMessage, logSupabaseError } from '@/lib/errorDebug';

// Types
interface FleetFilters {
  search: string;
  status: 'all' | 'ativo' | 'inativo';
  type: 'all' | 'onibus' | 'micro_onibus' | 'van';
  brand: string;
  model: string;
  yearModel: string;
  capacityMin: string;
  capacityMax: string;
}

const initialFilters: FleetFilters = {
  search: '',
  status: 'all',
  type: 'all',
  brand: '',
  model: '',
  yearModel: '',
  capacityMin: '',
  capacityMax: '',
};

// Adicionado Micro-ônibus como tipo suportado. Valor interno: micro_onibus
const vehicleTypeOptions = [
  { value: 'onibus', label: 'Ônibus' },
  { value: 'micro_onibus', label: 'Micro-ônibus' },
  { value: 'van', label: 'Van' },
] as const;

const vehicleTypeLabels: Record<Vehicle['type'], string> = {
  onibus: 'Ônibus',
  micro_onibus: 'Micro-ônibus',
  van: 'Van',
};


const getSeatSidesByType = (type: Vehicle['type']) => {
  // Comentário: usamos presets brasileiros para acelerar cadastro e manter edição manual quando necessário.
  if (type === 'van') return { seatsLeftSide: '2', seatsRightSide: '1' };
  return { seatsLeftSide: '2', seatsRightSide: '2' };
};

export default function Fleet() {
  const { isGerente, isOperador, activeCompanyId, activeCompany, user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FleetFilters>(initialFilters);

  // Export columns configuration
  const exportColumns: ExportColumn[] = [
    { key: 'type', label: 'Tipo', format: (v) => vehicleTypeLabels[v as Vehicle['type']] ?? v },
    { key: 'brand', label: 'Marca' },
    { key: 'model', label: 'Modelo' },
    { key: 'plate', label: 'Placa' },
    { key: 'owner', label: 'Proprietário' },
    { key: 'capacity', label: 'Capacidade' },
    { key: 'status', label: 'Status', format: (v) => (v === 'ativo' ? 'Ativo' : 'Inativo') },
    { key: 'year_model', label: 'Ano do Modelo' },
    { key: 'color', label: 'Cor' },
    { key: 'renavam', label: 'Renavam' },
    { key: 'chassis', label: 'Chassi' },
    { key: 'whatsapp_group_link', label: 'Link WhatsApp' },
    { key: 'notes', label: 'Observações' },
  ];
  const defaultSeatSides = getSeatSidesByType('onibus');
  const [form, setForm] = useState({
    type: 'onibus' as Vehicle['type'],
    plate: '',
    owner: '',
    brand: '',
    model: '',
    year_model: '',
    capacity: '',
    seats_left_side: defaultSeatSides.seatsLeftSide,
    seats_right_side: defaultSeatSides.seatsRightSide,
    chassis: '',
    renavam: '',
    color: '',
    whatsapp_group_link: '',
    notes: '',
  });

  // Stats calculations
  const stats = useMemo(() => {
    const total = vehicles.length;
    const ativos = vehicles.filter((v) => v.status === 'ativo').length;
    const inativos = vehicles.filter((v) => v.status === 'inativo').length;
    const capacidadeTotal = vehicles.reduce((sum, v) => sum + v.capacity, 0);
    return { total, ativos, inativos, capacidadeTotal };
  }, [vehicles]);

  // Filtered vehicles
  const filteredVehicles = useMemo(() => {
    return vehicles.filter((vehicle) => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          vehicle.plate.toLowerCase().includes(searchLower) ||
          (vehicle.owner?.toLowerCase().includes(searchLower) ?? false) ||
          (vehicle.brand?.toLowerCase().includes(searchLower) ?? false) ||
          (vehicle.model?.toLowerCase().includes(searchLower) ?? false);
        if (!matchesSearch) return false;
      }

      // Status filter
      if (filters.status !== 'all' && vehicle.status !== filters.status) {
        return false;
      }

      // Type filter
      if (filters.type !== 'all' && vehicle.type !== filters.type) {
        return false;
      }

      // Brand filter
      if (filters.brand && !vehicle.brand?.toLowerCase().includes(filters.brand.toLowerCase())) {
        return false;
      }

      // Model filter
      if (filters.model && !vehicle.model?.toLowerCase().includes(filters.model.toLowerCase())) {
        return false;
      }

      // Year filter
      if (filters.yearModel && vehicle.year_model?.toString() !== filters.yearModel) {
        return false;
      }

      // Capacity min
      if (filters.capacityMin && vehicle.capacity < parseInt(filters.capacityMin, 10)) {
        return false;
      }

      // Capacity max
      if (filters.capacityMax && vehicle.capacity > parseInt(filters.capacityMax, 10)) {
        return false;
      }

      return true;
    });
  }, [vehicles, filters]);

  const hasActiveFilters = useMemo(() => {
    return (
      filters.search !== '' ||
      filters.status !== 'all' ||
      filters.type !== 'all' ||
      filters.brand !== '' ||
      filters.model !== '' ||
      filters.yearModel !== '' ||
      filters.capacityMin !== '' ||
      filters.capacityMax !== ''
    );
  }, [filters]);


  const seatLayoutPreview = useMemo(() => {
    const capacity = Number.parseInt(form.capacity, 10);
    const leftSide = Number.parseInt(form.seats_left_side, 10);
    const rightSide = Number.parseInt(form.seats_right_side, 10);

    if (Number.isNaN(capacity) || Number.isNaN(leftSide) || Number.isNaN(rightSide)) return null;
    if (capacity <= 0 || leftSide <= 0 || rightSide <= 0) return null;

    const rows: Array<{ rowNumber: number; left: Array<number | null>; right: Array<number | null> }> = [];
    let seatLabel = 1;
    let rowNumber = 1;

    while (seatLabel <= capacity) {
      const left: Array<number | null> = [];
      const right: Array<number | null> = [];

      for (let index = 0; index < leftSide; index++) {
        left.push(seatLabel <= capacity ? seatLabel++ : null);
      }

      for (let index = 0; index < rightSide; index++) {
        right.push(seatLabel <= capacity ? seatLabel++ : null);
      }

      // Comentário: no lado direito, exibimos menor número na janela e maior no corredor (padrão operacional).
      rows.push({ rowNumber, left, right: right.reverse() });
      rowNumber++;
    }

    // Comentário: limitamos a visualização para manter o modal compacto sem perder noção do layout.
    const maxRowsVisible = 10;
    const visibleRows = rows.slice(0, maxRowsVisible);

    return {
      visibleRows,
      hiddenRowsCount: Math.max(rows.length - maxRowsVisible, 0),
    };
  }, [form.capacity, form.seats_left_side, form.seats_right_side]);

  const fetchVehicles = async () => {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      logSupabaseError({
        label: 'Erro ao carregar frota (vehicles.select)',
        error,
        context: { action: 'select', table: 'vehicles', companyId: activeCompanyId, userId: user?.id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao carregar frota',
          error,
          context: { action: 'select', table: 'vehicles', companyId: activeCompanyId, userId: user?.id },
        })
      );
    } else {
      setVehicles(data as Vehicle[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchVehicles();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    if (!activeCompanyId) {
      const context = { action: editingId ? 'update' : 'insert', table: 'vehicles', companyId: null, userId: user?.id };
      console.error('active_company_id ausente ao salvar veículo.', context);
      toast.error(
        buildDebugToastMessage({
          title: 'active_company_id ausente',
          context,
        })
      );
      setSaving(false);
      return;
    }

    const yearModel = form.year_model ? Number.parseInt(form.year_model, 10) : null;
    const capacity = Number.parseInt(form.capacity, 10);
    const seatsLeftSide = Number.parseInt(form.seats_left_side, 10);
    const seatsRightSide = Number.parseInt(form.seats_right_side, 10);
    const normalizedPlate = form.plate.trim().toUpperCase();
    const isAdmin = isGerente || isOperador;

    if (!isAdmin) {
      console.warn('Permissão insuficiente ao salvar veículo: usuário não-admin.');
      toast.error('Você não tem permissão para salvar veículos');
      setSaving(false);
      return;
    }

    if (!normalizedPlate) {
      console.warn('Validação de veículo: placa ausente no modal de frota.');
      toast.error('Informe a placa do veículo');
      setSaving(false);
      return;
    }

    if (Number.isNaN(capacity)) {
      console.warn('Validação de veículo: capacidade inválida (NaN) no modal de frota.');
      toast.error('Informe uma capacidade válida');
      setSaving(false);
      return;
    }

    if (Number.isNaN(seatsLeftSide) || Number.isNaN(seatsRightSide) || seatsLeftSide < 1 || seatsRightSide < 1) {
      // Comentário: evitamos configuração inválida que quebraria a renderização do mapa de assentos no checkout.
      console.warn('Validação de veículo: fileiras laterais inválidas no modal de frota.');
      toast.error('Informe uma configuração válida de fileiras (mínimo 1 de cada lado)');
      setSaving(false);
      return;
    }

    const vehicleData = {
      type: form.type,
      plate: normalizedPlate,
      owner: form.owner.trim(),
      brand: form.brand || null,
      model: form.model || null,
      year_model: Number.isNaN(yearModel) ? null : yearModel,
      capacity,
      seats_left_side: seatsLeftSide,
      seats_right_side: seatsRightSide,
      chassis: form.chassis || null,
      renavam: form.renavam || null,
      color: form.color || null,
      whatsapp_group_link: form.whatsapp_group_link || null,
      notes: form.notes || null,
      company_id: activeCompanyId,
    };

    let error;
    if (editingId) {
      const { company_id, ...updateData } = vehicleData;
      ({ error } = await supabase.from('vehicles').update(updateData).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('vehicles').insert([vehicleData]));
    }

    if (error) {
      logSupabaseError({
        label: 'Erro ao salvar veículo (vehicles.insert/update)',
        error,
        context: {
          action: editingId ? 'update' : 'insert',
          table: 'vehicles',
          companyId: activeCompanyId,
          userId: user?.id,
          editingId,
          payload: {
            ...vehicleData,
            plate: normalizedPlate,
          },
        },
      });
      const isRlsError =
        error.message.includes('row-level security') ||
        error.message.includes('permission denied') ||
        error.code === '42501';
      const isDuplicatePlate = error.message.includes('unique') || error.message.includes('duplicate key');
      const fallbackMessage = isRlsError
        ? 'Sem permissão para salvar veículos'
        : isDuplicatePlate
          ? 'Placa já cadastrada'
          : 'Erro ao salvar veículo';
      toast.error(
        buildDebugToastMessage({
          title: fallbackMessage,
          error,
          context: {
            action: editingId ? 'update' : 'insert',
            table: 'vehicles',
            companyId: activeCompanyId,
            userId: user?.id,
            editingId,
          },
        })
      );
    } else {
      toast.success(editingId ? 'Veículo atualizado' : 'Veículo cadastrado');
      setDialogOpen(false);
      resetForm();
      fetchVehicles();
    }
    setSaving(false);
  };

  const handleEdit = (vehicle: Vehicle) => {
    setEditingId(vehicle.id);
    setForm({
      type: vehicle.type,
      plate: vehicle.plate,
      owner: vehicle.owner ?? '',
      brand: vehicle.brand ?? '',
      model: vehicle.model ?? '',
      year_model: vehicle.year_model?.toString() ?? '',
      capacity: vehicle.capacity.toString(),
      seats_left_side: vehicle.seats_left_side?.toString() ?? '2',
      seats_right_side: vehicle.seats_right_side?.toString() ?? '2',
      chassis: vehicle.chassis ?? '',
      renavam: vehicle.renavam ?? '',
      color: vehicle.color ?? '',
      whatsapp_group_link: vehicle.whatsapp_group_link ?? '',
      notes: vehicle.notes ?? '',
    });
    setDialogOpen(true);
  };

  const handleToggleStatus = async (vehicle: Vehicle) => {
    const nextStatus = vehicle.status === 'ativo' ? 'inativo' : 'ativo';
    const { error } = await supabase
      .from('vehicles')
      .update({ status: nextStatus })
      .eq('id', vehicle.id);
    if (error) {
      logSupabaseError({
        label: 'Erro ao atualizar status do veículo (vehicles.update)',
        error,
        context: { action: 'update', table: 'vehicles', companyId: activeCompanyId, userId: user?.id, vehicleId: vehicle.id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao atualizar status',
          error,
          context: { action: 'update', table: 'vehicles', companyId: activeCompanyId, userId: user?.id, vehicleId: vehicle.id },
        })
      );
    } else {
      toast.success(`Veículo ${nextStatus === 'ativo' ? 'ativado' : 'desativado'}`);
      fetchVehicles();
    }
  };

  const resetForm = () => {
    const defaults = getSeatSidesByType('onibus');
    setEditingId(null);
    setForm({
      type: 'onibus',
      plate: '',
      owner: '',
      brand: '',
      model: '',
      year_model: '',
      capacity: '',
      seats_left_side: defaults.seatsLeftSide,
      seats_right_side: defaults.seatsRightSide,
      chassis: '',
      renavam: '',
      color: '',
      whatsapp_group_link: '',
      notes: '',
    });
  };

  const getVehicleActions = (vehicle: Vehicle): ActionItem[] => [
    {
      label: 'Editar',
      icon: Pencil,
      onClick: () => handleEdit(vehicle),
    },
    {
      label: vehicle.status === 'ativo' ? 'Desativar' : 'Ativar',
      icon: Power,
      onClick: () => handleToggleStatus(vehicle),
      variant: vehicle.status === 'ativo' ? 'destructive' : 'default',
    },
  ];

  const handleExportExcel = () => {
    setExportModalOpen(true);
  };

  const handleExportPDF = () => {
    setPdfModalOpen(true);
  };

  return (
    <AdminLayout>
      <div className="page-container">
        {/* Header */}
        <PageHeader
          title="Frota"
          description="Gerencie os veículos disponíveis"
          actions={
            <>
              <Button variant="outline" size="sm" onClick={handleExportExcel}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportPDF}>
                <FileText className="h-4 w-4 mr-2" />
                PDF
              </Button>
              <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Veículo
                  </Button>
                </DialogTrigger>
                <DialogContent className="admin-modal flex h-[90vh] max-h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 p-0">
                  <DialogHeader className="admin-modal__header px-6 py-4">
                    <DialogTitle>{editingId ? 'Editar' : 'Novo'} Veículo</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="flex h-full flex-col">
                    <Tabs defaultValue="identificacao" className="flex h-full flex-col">
                      <TabsList className="admin-modal__tabs flex h-auto w-full flex-wrap justify-start gap-1 px-6 py-2">
                        <TabsTrigger
                          value="identificacao"
                          className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80"
                        >
                          <IdCard className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 truncate">Identificação</span>
                        </TabsTrigger>
                        <TabsTrigger
                          value="capacidade"
                          className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80"
                        >
                          <Users className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 truncate">Capacidade</span>
                        </TabsTrigger>
                        <TabsTrigger
                          value="tecnicos"
                          className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80"
                        >
                          <Wrench className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 truncate">Dados Técnicos</span>
                        </TabsTrigger>
                        <TabsTrigger
                          value="operacao"
                          className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80"
                        >
                          <Radio className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 truncate">Operação/Comunicação</span>
                        </TabsTrigger>
                      </TabsList>

                      <div className="admin-modal__body flex-1 overflow-y-auto px-6 py-4">
                        <TabsContent value="identificacao" className="mt-0">
                          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            <div className="space-y-2">
                              <Label>Tipo de Frota</Label>
                              <Select
                                value={form.type}
                                onValueChange={(value: Vehicle['type']) => {
                                  const seatDefaults = getSeatSidesByType(value);
                                  // Comentário: ao trocar tipo, aplicamos preset inicial, mantendo possibilidade de ajuste manual.
                                  setForm({
                                    ...form,
                                    type: value,
                                    seats_left_side: seatDefaults.seatsLeftSide,
                                    seats_right_side: seatDefaults.seatsRightSide,
                                  });
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue />
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
                            <div className="space-y-2">
                              <Label htmlFor="plate">Placa</Label>
                              <Input
                                id="plate"
                                value={form.plate}
                                onChange={(e) => setForm({ ...form, plate: e.target.value })}
                                placeholder="ABC-1234"
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="owner">Proprietário</Label>
                              <Input
                                id="owner"
                                value={form.owner}
                                onChange={(e) => setForm({ ...form, owner: e.target.value })}
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="brand">Marca</Label>
                              <Input
                                id="brand"
                                value={form.brand}
                                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="model">Modelo</Label>
                              <Input
                                id="model"
                                value={form.model}
                                onChange={(e) => setForm({ ...form, model: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="year_model">Ano Modelo</Label>
                              <Input
                                id="year_model"
                                type="number"
                                value={form.year_model}
                                onChange={(e) => setForm({ ...form, year_model: e.target.value })}
                                placeholder="2024"
                              />
                            </div>
                          </div>
                        </TabsContent>

                        <TabsContent value="capacidade" className="mt-0">
                          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            <div className="space-y-2 sm:col-span-1 xl:col-span-1">
                              <Label htmlFor="capacity">Capacidade máxima de passageiros</Label>
                              <Input
                                id="capacity"
                                type="number"
                                min="1"
                                value={form.capacity}
                                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                                placeholder="46"
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="seats_left_side">Fileiras lado esquerdo</Label>
                              <Input
                                id="seats_left_side"
                                type="number"
                                min="1"
                                max="4"
                                value={form.seats_left_side}
                                onChange={(e) => setForm({ ...form, seats_left_side: e.target.value })}
                                placeholder="2"
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="seats_right_side">Fileiras lado direito</Label>
                              <Input
                                id="seats_right_side"
                                type="number"
                                min="1"
                                max="4"
                                value={form.seats_right_side}
                                onChange={(e) => setForm({ ...form, seats_right_side: e.target.value })}
                                placeholder="2"
                                required
                              />
                            </div>
                          </div>

                          <div className="mt-5 space-y-2">
                            <Label>Prévia do layout (visão superior)</Label>
                            <div className="rounded-lg border bg-muted/20 p-3">
                              {seatLayoutPreview ? (
                                <div className="mx-auto w-full max-w-[420px]">
                                  <div className="rounded-xl border bg-background/80 p-3">
                                    <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                                      <span>Motorista</span>
                                      <span>Layout {form.seats_left_side}x{form.seats_right_side}</span>
                                    </div>

                                    <div className="space-y-1.5">
                                      {seatLayoutPreview.visibleRows.map((row) => (
                                        <div key={row.rowNumber} className="flex items-center justify-center gap-1">
                                          <div className="flex gap-1">
                                            {row.left.map((seatNumber, index) => (
                                              <div key={`left-${row.rowNumber}-${index}`} className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-[10px] font-semibold">
                                                {seatNumber ?? ''}
                                              </div>
                                            ))}
                                          </div>
                                          <div className="mx-1 h-6 w-5 border-x border-dashed border-border/80" />
                                          <div className="flex gap-1">
                                            {row.right.map((seatNumber, index) => (
                                              <div key={`right-${row.rowNumber}-${index}`} className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-[10px] font-semibold">
                                                {seatNumber ?? ''}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>

                                    {seatLayoutPreview.hiddenRowsCount > 0 && (
                                      <p className="mt-2 text-center text-xs text-muted-foreground">
                                        +{seatLayoutPreview.hiddenRowsCount} fileira(s) não exibida(s) na prévia
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  Informe capacidade e fileiras válidas para visualizar a simulação.
                                </p>
                              )}
                            </div>
                          </div>
                        </TabsContent>

                        <TabsContent value="tecnicos" className="mt-0">
                          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            <div className="space-y-2">
                              <Label htmlFor="chassis">Chassi</Label>
                              <Input
                                id="chassis"
                                value={form.chassis}
                                onChange={(e) => setForm({ ...form, chassis: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="renavam">Renavam</Label>
                              <Input
                                id="renavam"
                                value={form.renavam}
                                onChange={(e) => setForm({ ...form, renavam: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="color">Cor</Label>
                              <Input
                                id="color"
                                value={form.color}
                                onChange={(e) => setForm({ ...form, color: e.target.value })}
                              />
                            </div>
                          </div>
                        </TabsContent>

                        <TabsContent value="operacao" className="mt-0">
                          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            <div className="space-y-2 sm:col-span-2">
                              <Label htmlFor="whatsapp_group_link">Link do grupo de WhatsApp</Label>
                              <Input
                                id="whatsapp_group_link"
                                type="url"
                                value={form.whatsapp_group_link}
                                onChange={(e) =>
                                  setForm({ ...form, whatsapp_group_link: e.target.value })
                                }
                                placeholder="https://chat.whatsapp.com/..."
                              />
                            </div>
                            <div className="space-y-2 sm:col-span-2 xl:col-span-3">
                              <Label htmlFor="notes">Observações permanentes</Label>
                              <Textarea
                                id="notes"
                                value={form.notes}
                                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                rows={4}
                              />
                            </div>
                          </div>
                        </TabsContent>
                      </div>
                    </Tabs>
                    <div className="admin-modal__footer px-6 py-4">
                      <div className="flex flex-wrap justify-end gap-3">
                        <DialogClose asChild>
                          <Button type="button" variant="outline">
                            Cancelar
                          </Button>
                        </DialogClose>
                        <Button type="submit" disabled={saving}>
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                        </Button>
                      </div>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          }
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatsCard
            label="Total de veículos"
            value={stats.total}
            icon={Bus}
          />
          <StatsCard
            label="Veículos ativos"
            value={stats.ativos}
            icon={CheckCircle}
            variant="success"
          />
          <StatsCard
            label="Veículos inativos"
            value={stats.inativos}
            icon={XCircle}
            variant="destructive"
          />
          <StatsCard
            label="Capacidade total"
            value={`${stats.capacidadeTotal} pass.`}
            icon={Users}
          />
        </div>

        {/* Filters */}
        <FilterCard
          className="mb-6"
          searchValue={filters.search}
          onSearchChange={(value) => setFilters({ ...filters, search: value })}
          searchPlaceholder="Pesquisar por placa, proprietário, marca ou modelo..."
          selects={[
            {
              id: 'status',
              label: 'Status',
              placeholder: 'Status',
              value: filters.status,
              onChange: (value) => setFilters({ ...filters, status: value as FleetFilters['status'] }),
              options: [
                { value: 'all', label: 'Todos' },
                { value: 'ativo', label: 'Ativo' },
                { value: 'inativo', label: 'Inativo' },
              ],
            },
            {
              id: 'type',
              label: 'Tipo',
              placeholder: 'Tipo',
              value: filters.type,
              onChange: (value) => setFilters({ ...filters, type: value as FleetFilters['type'] }),
              options: [
                { value: 'all', label: 'Todos' },
                ...vehicleTypeOptions,
              ],
            },
          ]}
          onClearFilters={() => setFilters(initialFilters)}
          hasActiveFilters={hasActiveFilters}
          advancedFilters={
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <FilterInput
                id="brand"
                label="Marca"
                placeholder="Ex: Mercedes"
                value={filters.brand}
                onChange={(value) => setFilters({ ...filters, brand: value })}
              />
              <FilterInput
                id="model"
                label="Modelo"
                placeholder="Ex: O-500"
                value={filters.model}
                onChange={(value) => setFilters({ ...filters, model: value })}
              />
              <FilterInput
                id="yearModel"
                label="Ano Modelo"
                placeholder="Ex: 2024"
                value={filters.yearModel}
                onChange={(value) => setFilters({ ...filters, yearModel: value })}
                type="number"
              />
              <FilterInput
                id="capacityMin"
                label="Capacidade mín."
                placeholder="Ex: 20"
                value={filters.capacityMin}
                onChange={(value) => setFilters({ ...filters, capacityMin: value })}
                type="number"
              />
              <FilterInput
                id="capacityMax"
                label="Capacidade máx."
                placeholder="Ex: 50"
                value={filters.capacityMax}
                onChange={(value) => setFilters({ ...filters, capacityMax: value })}
                type="number"
              />
            </div>
          }
        />

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : vehicles.length === 0 ? (
          <EmptyState
            icon={<Bus className="h-8 w-8 text-muted-foreground" />}
            title="Nenhum veículo cadastrado"
            description="Adicione veículos à sua frota"
            action={
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Veículo
              </Button>
            }
          />
        ) : filteredVehicles.length === 0 ? (
          <EmptyState
            icon={<Bus className="h-8 w-8 text-muted-foreground" />}
            title="Nenhum veículo encontrado"
            description="Ajuste os filtros para encontrar veículos"
            action={
              <Button variant="outline" onClick={() => setFilters(initialFilters)}>
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Marca / Modelo</TableHead>
                    <TableHead>Placa</TableHead>
                    <TableHead>Proprietário</TableHead>
                    <TableHead>Capacidade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[60px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVehicles.map((vehicle) => (
                    <TableRow key={vehicle.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Bus className="h-4 w-4 text-muted-foreground" />
                          {vehicleTypeLabels[vehicle.type] ?? vehicle.type}
                        </div>
                      </TableCell>
                      <TableCell>
                        {vehicle.brand || vehicle.model
                          ? `${vehicle.brand ?? ''} ${vehicle.model ? `/ ${vehicle.model}` : ''}`.trim()
                          : '-'}
                      </TableCell>
                      <TableCell className="font-mono">{vehicle.plate}</TableCell>
                      <TableCell>{vehicle.owner ?? '-'}</TableCell>
                      <TableCell>{vehicle.capacity} passageiros</TableCell>
                      <TableCell>
                        <StatusBadge status={vehicle.status} />
                      </TableCell>
                      <TableCell>
                        <ActionsDropdown actions={getVehicleActions(vehicle)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Export Excel Modal */}
        <ExportExcelModal
          open={exportModalOpen}
          onOpenChange={setExportModalOpen}
          columns={exportColumns}
          data={filteredVehicles}
          storageKey="frota"
          fileName="frota"
          sheetName="Frota"
        />

        {/* Export PDF Modal */}
        <ExportPDFModal
          open={pdfModalOpen}
          onOpenChange={setPdfModalOpen}
          columns={exportColumns}
          data={filteredVehicles}
          storageKey="frota"
          fileName="frota"
          title="Frota de Veículos"
        company={activeCompany}
        />
      </div>
    </AdminLayout>
  );
}
