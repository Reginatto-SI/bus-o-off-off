import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SeatCategory, TemplateLayout, Vehicle } from '@/types/database';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

type TemplatePreviewItem = {
  floor_number: number;
  row_number: number;
  column_number: number;
  seat_number: string | null;
  category: SeatCategory | null;
  tags: string[] | null;
  is_blocked: boolean;
};

const TEMPLATE_PREVIEW_CATEGORIES: SeatCategory[] = ['convencional', 'executivo', 'semi_leito', 'leito', 'leito_cama'];

const TEMPLATE_PREVIEW_CATEGORY_COLORS: Record<SeatCategory, string> = {
  convencional: 'bg-sky-100 text-sky-700 border-sky-200',
  executivo: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  semi_leito: 'bg-amber-100 text-amber-700 border-amber-200',
  leito: 'bg-violet-100 text-violet-700 border-violet-200',
  leito_cama: 'bg-rose-100 text-rose-700 border-rose-200',
};


// Comentário P0: sincronização idempotente layout_snapshot → seats.
// Garante que assentos no banco reflitam exatamente o snapshot do veículo.
async function syncSeatsFromSnapshot(
  vehicleId: string,
  companyId: string,
  snapshot: Record<string, any> | null,
) {
  if (!snapshot || !snapshot.items || !Array.isArray(snapshot.items)) return;

  const items = snapshot.items as Array<{
    floor_number: number;
    row_number: number;
    column_number: number;
    seat_number?: string | null;
    category?: string;
    is_blocked?: boolean;
  }>;

  // 1. Buscar seats existentes do veículo
  const { data: existingSeats } = await supabase
    .from('seats')
    .select('id, floor, row_number, column_number')
    .eq('vehicle_id', vehicleId);

  const existing = existingSeats ?? [];
  const existingMap = new Map<string, string>();
  existing.forEach((s) => {
    existingMap.set(`${s.floor}-${s.row_number}-${s.column_number}`, s.id);
  });

  // 2. Numerar sequencialmente (items já vêm ordenados do snapshot)
  const nonBlockedItems = items.filter((i) => !i.is_blocked);
  let seatNumber = 1;
  const labelMap = new Map<number, string>(); // index → label
  items.forEach((item, idx) => {
    if (item.is_blocked) {
      labelMap.set(idx, item.seat_number || 'X');
    } else {
      labelMap.set(idx, item.seat_number || String(seatNumber++));
    }
  });

  const toInsert: Array<{
    vehicle_id: string;
    company_id: string;
    label: string;
    floor: number;
    row_number: number;
    column_number: number;
    status: string;
    category: string;
  }> = [];

  const toUpdate: Array<{ id: string; label: string; status: string; category: string }> = [];
  const processedKeys = new Set<string>();

  items.forEach((item, idx) => {
    const key = `${item.floor_number}-${item.row_number}-${item.column_number}`;
    processedKeys.add(key);
    const label = labelMap.get(idx) || String(idx + 1);
    const status = item.is_blocked ? 'bloqueado' : 'disponivel';
    const category = item.category || 'convencional';

    const existingId = existingMap.get(key);
    if (existingId) {
      toUpdate.push({ id: existingId, label, status, category });
    } else {
      toInsert.push({
        vehicle_id: vehicleId,
        company_id: companyId,
        label,
        floor: item.floor_number,
        row_number: item.row_number,
        column_number: item.column_number,
        status,
        category,
      });
    }
  });

  // 3. Seats que existem no banco mas não no snapshot: verificar se têm tickets vinculados
  const orphanIds = existing
    .filter((s) => !processedKeys.has(`${s.floor}-${s.row_number}-${s.column_number}`))
    .map((s) => s.id);

  // 4. Executar operações
  if (toInsert.length > 0) {
    await supabase.from('seats').insert(toInsert);
  }

  for (const upd of toUpdate) {
    await supabase
      .from('seats')
      .update({ label: upd.label, status: upd.status, category: upd.category })
      .eq('id', upd.id);
  }

  if (orphanIds.length > 0) {
    // Verificar se algum tem ticket vinculado
    const { data: linkedTickets } = await supabase
      .from('tickets')
      .select('seat_id')
      .in('seat_id', orphanIds);

    const linkedSeatIds = new Set((linkedTickets ?? []).map((t) => t.seat_id));
    const toDelete = orphanIds.filter((id) => !linkedSeatIds.has(id));
    const toBlock = orphanIds.filter((id) => linkedSeatIds.has(id));

    if (toDelete.length > 0) {
      await supabase.from('seats').delete().in('id', toDelete);
    }
    if (toBlock.length > 0) {
      await supabase.from('seats').update({ status: 'bloqueado' }).in('id', toBlock);
    }
  }

  // 5. Atualizar capacidade do veículo = assentos não bloqueados
  const calculatedCapacity = nonBlockedItems.length;
  await supabase.from('vehicles').update({ capacity: calculatedCapacity }).eq('id', vehicleId);
}

const getSeatSidesByType = (type: Vehicle['type']) => {
  // Comentário: usamos presets brasileiros para acelerar cadastro e manter edição manual quando necessário.
  if (type === 'van') return { seatsLeftSide: '2', seatsRightSide: '1' };
  return { seatsLeftSide: '2', seatsRightSide: '2' };
};

export default function Fleet() {
  const { isGerente, isOperador, activeCompanyId, activeCompany, user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [templateLayouts, setTemplateLayouts] = useState<TemplateLayout[]>([]);
  const [templateItemsByLayoutId, setTemplateItemsByLayoutId] = useState<Record<string, TemplatePreviewItem[]>>({});
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
    floors: '1',
    seats_left_side: defaultSeatSides.seatsLeftSide,
    seats_right_side: defaultSeatSides.seatsRightSide,
    chassis: '',
    renavam: '',
    color: '',
    whatsapp_group_link: '',
    notes: '',
    template_layout_id: '',
    clone_vehicle_id: '',
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


  const selectedTemplate = useMemo(
    () => templateLayouts.find((template) => template.id === form.template_layout_id) ?? null,
    [templateLayouts, form.template_layout_id],
  );

  const templateDetailSummary = useMemo(() => {
    if (!selectedTemplate) return null;

    const templateItems = templateItemsByLayoutId[selectedTemplate.id] ?? [];
    const totalCapacityFromItems = templateItems.filter((item) => !item.is_blocked && item.seat_number).length;

    // Comentário: quando o template ainda não carregou itens, usamos os dados persistidos no veículo como fallback.
    const fallbackCapacity = Number.parseInt(form.capacity, 10);
    const totalCapacity = totalCapacityFromItems > 0 ? totalCapacityFromItems : (Number.isNaN(fallbackCapacity) ? 0 : fallbackCapacity);

    // Comentário: na ausência de metadado explícito de configuração, derivamos 2x2/2x1 pela largura do grid.
    const gridColumns = selectedTemplate.grid_columns;
    let leftSide = 1;
    let rightSide = 1;
    if (gridColumns >= 3 && gridColumns % 2 === 1) {
      leftSide = (gridColumns - 1) / 2;
      rightSide = (gridColumns - 1) / 2;
    } else if (gridColumns >= 4 && gridColumns % 2 === 0) {
      leftSide = gridColumns / 2;
      rightSide = gridColumns / 2;
    }

    return {
      capacity: totalCapacity,
      floors: selectedTemplate.floors,
      leftSide,
      rightSide,
      configurationLabel: `${leftSide}x${rightSide}`,
      description: selectedTemplate.description,
      imageUrl: selectedTemplate.image_url,
    };
  }, [selectedTemplate, templateItemsByLayoutId, form.capacity]);

  // Comentário: Aba Capacidade agora é exclusiva para Template Oficial para evitar inconsistência e confusão de cadastro.
  useEffect(() => {
    if (!selectedTemplate || !templateDetailSummary) return;
    setForm((prev) => {
      const nextCapacity = String(templateDetailSummary.capacity);
      const nextFloors = String(templateDetailSummary.floors);
      const nextLeftSide = String(templateDetailSummary.leftSide);
      const nextRightSide = String(templateDetailSummary.rightSide);

      if (
        prev.capacity === nextCapacity &&
        prev.floors === nextFloors &&
        prev.seats_left_side === nextLeftSide &&
        prev.seats_right_side === nextRightSide &&
        prev.clone_vehicle_id === ''
      ) {
        return prev;
      }

      return {
        ...prev,
        capacity: nextCapacity,
        floors: nextFloors,
        seats_left_side: nextLeftSide,
        seats_right_side: nextRightSide,
        clone_vehicle_id: '',
      };
    });
  }, [selectedTemplate, templateDetailSummary]);

  const selectedTemplateItems = useMemo(() => {
    if (!selectedTemplate) return [];
    return templateItemsByLayoutId[selectedTemplate.id] ?? [];
  }, [selectedTemplate, templateItemsByLayoutId]);

  const previewFloorLabels = useMemo(
    () => (selectedTemplate ? Array.from({ length: selectedTemplate.floors }, (_, idx) => idx + 1) : []),
    [selectedTemplate],
  );

  const previewRowIndexes = useMemo(
    () => (selectedTemplate ? Array.from({ length: selectedTemplate.grid_rows }, (_, idx) => idx + 1) : []),
    [selectedTemplate],
  );

  const previewColumnIndexes = useMemo(
    () => (selectedTemplate ? Array.from({ length: selectedTemplate.grid_columns }, (_, idx) => idx + 1) : []),
    [selectedTemplate],
  );

  const previewCategoryTotals = useMemo(() => {
    return TEMPLATE_PREVIEW_CATEGORIES.reduce<Record<SeatCategory, number>>((acc, category) => {
      acc[category] = selectedTemplateItems.filter((item) => !item.is_blocked && item.category === category).length;
      return acc;
    }, {
      convencional: 0,
      executivo: 0,
      semi_leito: 0,
      leito: 0,
      leito_cama: 0,
    });
  }, [selectedTemplateItems]);

  const previewBlockedTotal = useMemo(
    () => selectedTemplateItems.filter((item) => item.is_blocked).length,
    [selectedTemplateItems],
  );

  const previewCapacityTotal = useMemo(
    () => selectedTemplateItems.filter((item) => !item.is_blocked).length,
    [selectedTemplateItems],
  );

  const getPreviewItemByCoord = (floor: number, row: number, column: number) => {
    return selectedTemplateItems.find(
      (item) => item.floor_number === floor && item.row_number === row && item.column_number === column,
    );
  };

  const fetchTemplateItems = async (templateLayoutId: string) => {
    if (!templateLayoutId || templateItemsByLayoutId[templateLayoutId]) return;
    const { data, error } = await supabase
      .from('template_layout_items')
      .select('floor_number, row_number, column_number, seat_number, category, tags, is_blocked')
      .eq('template_layout_id', templateLayoutId)
      .order('floor_number')
      .order('row_number')
      .order('column_number');

    if (error) return;

    setTemplateItemsByLayoutId((prev) => ({
      ...prev,
      [templateLayoutId]: (data ?? []) as TemplatePreviewItem[],
    }));
  };


  // Guard: não buscar sem empresa ativa (isolamento multi-tenant obrigatório)
  const fetchTemplateLayouts = async () => {
    // Comentário: templates oficiais são globais, por isso não filtramos por empresa nesta consulta.
    const { data, error } = await supabase
      .from('template_layouts')
      .select('*')
      .eq('status', 'ativo')
      .order('name');

    if (!error) setTemplateLayouts((data ?? []) as TemplateLayout[]);
  };

  const fetchVehicles = async () => {
    if (!activeCompanyId) return;
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('company_id', activeCompanyId)
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

  // Recarrega ao trocar empresa ativa (isolamento multi-tenant)
  useEffect(() => {
    fetchTemplateLayouts();
  }, []);

  useEffect(() => {
    if (activeCompanyId) fetchVehicles();
  }, [activeCompanyId]);

  useEffect(() => {
    if (form.template_layout_id) {
      fetchTemplateItems(form.template_layout_id);
    }
  }, [form.template_layout_id]);

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
    const normalizedPlate = form.plate.trim().toUpperCase();
    const isAdmin = isGerente || isOperador;

    if (!isAdmin) {
      console.warn('Permissão insuficiente ao salvar veículo: usuário não-admin.');
      toast.error('Você não tem permissão para salvar veículos');
      setSaving(false);
      return;
    }

    if (!form.template_layout_id) {
      toast.error('Selecione um template oficial de layout para o veículo');
      setSaving(false);
      return;
    }

    const templateForVehicle = templateLayouts.find((template) => template.id === form.template_layout_id);
    if (!templateForVehicle) {
      toast.error('Template oficial inválido. Selecione um layout válido');
      setSaving(false);
      return;
    }

    const templateItems = templateItemsByLayoutId[templateForVehicle.id] ?? [];
    const derivedCapacity = templateItems.filter((item) => !item.is_blocked && item.seat_number).length;
    const capacity = derivedCapacity > 0 ? derivedCapacity : Number.parseInt(form.capacity, 10);
    const seatsLeftSide = Number.parseInt(form.seats_left_side, 10);
    const seatsRightSide = Number.parseInt(form.seats_right_side, 10);

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
      floors: Math.max(1, Math.min(2, Number.parseInt(form.floors, 10) || 1)),
      seats_left_side: seatsLeftSide,
      seats_right_side: seatsRightSide,
      chassis: form.chassis || null,
      renavam: form.renavam || null,
      color: form.color || null,
      whatsapp_group_link: form.whatsapp_group_link || null,
      notes: form.notes || null,
      template_layout_id: form.template_layout_id || null,
      // Comentário: snapshot é preenchido no momento da criação para preservar o layout histórico do veículo.
      layout_snapshot: null,
      template_layout_version: null,
      company_id: activeCompanyId,
    };

    // Comentário: ao criar veículo, copiamos snapshot do template para evitar quebra em versões futuras.
    if (!editingId && form.template_layout_id && !vehicleData.layout_snapshot) {
      const selectedTemplate = templateLayouts.find((template) => template.id === form.template_layout_id);
      if (selectedTemplate) {
        const { data: snapshotItems } = await supabase
          .from('template_layout_items')
          .select('floor_number, row_number, column_number, seat_number, category, tags, is_blocked')
          .eq('template_layout_id', selectedTemplate.id)
          .order('floor_number')
          .order('row_number')
          .order('column_number');

        vehicleData.layout_snapshot = {
          template_layout_id: selectedTemplate.id,
          template_name: selectedTemplate.name,
          template_version: selectedTemplate.current_version,
          floors: selectedTemplate.floors,
          grid_rows: selectedTemplate.grid_rows,
          grid_columns: selectedTemplate.grid_columns,
          items: snapshotItems ?? [],
        };
        vehicleData.template_layout_version = selectedTemplate.current_version;
      }
    }

    let savedVehicleId = editingId;
    let error;
    if (editingId) {
      const { company_id, ...updateData } = vehicleData;
      ({ error } = await supabase.from('vehicles').update(updateData).eq('id', editingId));
    } else {
      const result = await supabase.from('vehicles').insert([vehicleData]).select('id').single();
      error = result.error;
      if (result.data) savedVehicleId = result.data.id;
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
      // Comentário P0: sincronizar seats a partir do layout_snapshot após salvar veículo.
      if (savedVehicleId && vehicleData.layout_snapshot) {
        try {
          await syncSeatsFromSnapshot(savedVehicleId, activeCompanyId, vehicleData.layout_snapshot as Record<string, any>);
        } catch (syncError) {
          console.error('Erro ao sincronizar assentos:', syncError);
          toast.error('Veículo salvo, mas houve erro ao sincronizar assentos.');
        }
      }
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
      floors: (vehicle.floors ?? 1).toString(),
      seats_left_side: vehicle.seats_left_side?.toString() ?? '2',
      seats_right_side: vehicle.seats_right_side?.toString() ?? '2',
      chassis: vehicle.chassis ?? '',
      renavam: vehicle.renavam ?? '',
      color: vehicle.color ?? '',
      whatsapp_group_link: vehicle.whatsapp_group_link ?? '',
      notes: vehicle.notes ?? '',
      template_layout_id: vehicle.template_layout_id ?? '',
      clone_vehicle_id: '',
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
      floors: '1',
      seats_left_side: defaults.seatsLeftSide,
      seats_right_side: defaults.seatsRightSide,
      chassis: '',
      renavam: '',
      color: '',
      whatsapp_group_link: '',
      notes: '',
      template_layout_id: '',
      clone_vehicle_id: '',
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
                          {/* Comentário: Aba Capacidade agora é exclusiva para Template Oficial para evitar inconsistência e confusão de cadastro. */}
                          <div className="grid gap-4 xl:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Layout do Veículo (Template Oficial)</Label>
                              <Select
                                value={form.template_layout_id || 'none'}
                                onValueChange={(value) => setForm({ ...form, template_layout_id: value === 'none' ? '' : value })}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione o template" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Selecione um template oficial</SelectItem>
                                  {templateLayouts.map((template) => (
                                    <SelectItem key={template.id} value={template.id}>
                                      {template.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="rounded-lg border bg-muted/20 p-4">
                              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                                <CheckCircle className="h-4 w-4 text-primary" />
                                <span>Detalhes do Template</span>
                              </div>
                              <p className="mb-3 text-xs text-muted-foreground">
                                Derivado do Template Oficial (não editável aqui).
                              </p>
                              {selectedTemplate && templateDetailSummary ? (
                                <div className="space-y-3 text-sm">
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <div className="rounded-md border bg-background p-2">
                                      <p className="text-xs text-muted-foreground">Capacidade total</p>
                                      <p className="font-medium">{templateDetailSummary.capacity}</p>
                                    </div>
                                    <div className="rounded-md border bg-background p-2">
                                      <p className="text-xs text-muted-foreground">Pavimentos</p>
                                      <p className="font-medium">{templateDetailSummary.floors}</p>
                                    </div>
                                    <div className="rounded-md border bg-background p-2 sm:col-span-2">
                                      <p className="text-xs text-muted-foreground">Configuração</p>
                                      <p className="font-medium">{templateDetailSummary.configurationLabel}</p>
                                    </div>
                                  </div>
                                  {templateDetailSummary.description && (
                                    <div>
                                      <p className="text-xs text-muted-foreground">Descrição</p>
                                      <p>{templateDetailSummary.description}</p>
                                    </div>
                                  )}
                                  {templateDetailSummary.imageUrl && (
                                    <div className="space-y-1">
                                      <p className="text-xs text-muted-foreground">Imagem de referência</p>
                                      <img
                                        src={templateDetailSummary.imageUrl}
                                        alt={`Template ${selectedTemplate.name}`}
                                        className="h-28 w-full rounded-md border object-cover"
                                        loading="lazy"
                                      />
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  Selecione um Template Oficial para visualizar os detalhes derivados.
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="mt-5 space-y-2">
                            <Label>Prévia do layout (visão superior)</Label>
                            <div className="rounded-lg border bg-muted/20 p-3">
                              {selectedTemplate ? (
                                <div className="space-y-4">
                                  <div className="space-y-3 rounded-md border p-3">
                                    <p className="text-sm text-muted-foreground">Capacidade total: {previewCapacityTotal} assentos</p>
                                    <div className="flex flex-wrap gap-2">
                                      {TEMPLATE_PREVIEW_CATEGORIES.map((category) => (
                                        <Badge key={category} className={TEMPLATE_PREVIEW_CATEGORY_COLORS[category]}>
                                          {category}: {previewCategoryTotals[category]}
                                        </Badge>
                                      ))}
                                      <Badge variant="outline">Bloqueados: {previewBlockedTotal}</Badge>
                                    </div>
                                  </div>

                                  {/* Comentário: Prévia do layout na frota reutiliza o preview oficial do template para garantir fidelidade visual e evitar divergência entre cadastro e operação. */}
                                  <div className="max-h-[520px] space-y-4 overflow-auto pr-1">
                                    {previewFloorLabels.map((floor) => (
                                      <div key={floor} className="rounded-md border p-3">
                                        <p className="mb-3 text-sm font-medium">{floor === 1 ? 'Pavimento Inferior' : 'Pavimento Superior'}</p>
                                        <div className="overflow-x-auto">
                                          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${selectedTemplate.grid_columns}, minmax(44px, 1fr))` }}>
                                            {previewRowIndexes.flatMap((row) => previewColumnIndexes.map((column) => {
                                              const cell = getPreviewItemByCoord(floor, row, column);

                                              if (!cell) {
                                                return <div key={`${floor}-${row}-${column}`} className="h-12 rounded border border-dashed bg-muted/20" />;
                                              }

                                              if (cell.is_blocked) {
                                                return <div key={`${floor}-${row}-${column}`} className="flex h-12 items-center justify-center rounded border bg-muted text-xs text-muted-foreground">BLOQ</div>;
                                              }

                                              const colorClass = TEMPLATE_PREVIEW_CATEGORY_COLORS[cell.category ?? 'convencional'];

                                              return (
                                                <div key={`${floor}-${row}-${column}`} className={`flex h-12 items-center justify-center rounded border text-xs ${colorClass}`}>
                                                  {cell.seat_number ?? 'ASS'}
                                                </div>
                                              );
                                            }))}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  Selecione um Template Oficial para visualizar o layout completo.
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
