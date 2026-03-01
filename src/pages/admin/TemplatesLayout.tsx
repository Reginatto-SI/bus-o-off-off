import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { PageHeader } from '@/components/admin/PageHeader';
import { FilterCard } from '@/components/admin/FilterCard';
import { ActionsDropdown } from '@/components/admin/ActionsDropdown';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Plus,
  Download,
  Upload,
  Loader2,
  Eye,
  Pencil,
  Copy,
  Power,
  LayoutTemplate,
  Save,
  Paintbrush,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { TemplateLayout, TemplateVehicleType } from '@/types/database';

type ItemCategory = 'convencional' | 'executivo' | 'semi_leito' | 'leito' | 'leito_cama';
type CellType = 'assento' | 'bloqueado' | 'vazio';

type TemplateItem = {
  id?: string;
  floor_number: number;
  row_number: number;
  column_number: number;
  seat_number: string | null;
  category: ItemCategory;
  tags: string[];
  is_blocked: boolean;
};

type CellCoord = { floor: number; row: number; column: number };

type CellEditorDraft = {
  cell_type: CellType;
  seat_number: string;
  category: ItemCategory;
  tags: string[];
};

const VEHICLE_OPTIONS: Array<{ value: TemplateVehicleType; label: string; floors: number; cols: number }> = [
  { value: 'onibus', label: 'Ônibus', floors: 1, cols: 5 },
  { value: 'double_deck', label: 'Double Deck', floors: 2, cols: 5 },
  { value: 'micro_onibus', label: 'Micro-ônibus', floors: 1, cols: 5 },
  { value: 'van', label: 'Van', floors: 1, cols: 4 },
];

const TAG_OPTIONS = ['janela', 'corredor', 'frente', 'fundo', 'proximo_banheiro', 'proximo_escada', 'premium'] as const;
const CATEGORY_OPTIONS: ItemCategory[] = ['convencional', 'executivo', 'semi_leito', 'leito', 'leito_cama'];

const CATEGORY_COLORS: Record<ItemCategory, string> = {
  convencional: 'bg-sky-100 text-sky-700 border-sky-200',
  executivo: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  semi_leito: 'bg-amber-100 text-amber-700 border-amber-200',
  leito: 'bg-violet-100 text-violet-700 border-violet-200',
  leito_cama: 'bg-rose-100 text-rose-700 border-rose-200',
};

const getCellKey = (coord: CellCoord) => `${coord.floor}-${coord.row}-${coord.column}`;

export default function TemplatesLayout() {
  const { isDeveloper } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [templates, setTemplates] = useState<TemplateLayout[]>([]);
  const [filteredSearch, setFilteredSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ativo' | 'inativo'>('ativo');
  const [typeFilter, setTypeFilter] = useState<'all' | TemplateVehicleType>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeFloor, setActiveFloor] = useState(1);
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [lastSelectedCell, setLastSelectedCell] = useState<CellCoord | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<CellCoord | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<TemplateLayout | null>(null);

  const [editorDraft, setEditorDraft] = useState<CellEditorDraft>({
    cell_type: 'assento',
    seat_number: '',
    category: 'convencional',
    tags: [],
  });
  const [paintMode, setPaintMode] = useState(false);
  const [paintDraft, setPaintDraft] = useState<CellEditorDraft>({
    cell_type: 'assento',
    seat_number: '',
    category: 'convencional',
    tags: [],
  });
  const [previewMode, setPreviewMode] = useState<'categoria' | 'tags'>('categoria');
  const [previewTag, setPreviewTag] = useState<(typeof TAG_OPTIONS)[number]>('janela');
  const [form, setForm] = useState({
    name: '',
    vehicle_type: 'onibus' as TemplateVehicleType,
    description: '',
    status: 'ativo' as 'ativo' | 'inativo',
    floors: 1,
    grid_rows: 12,
    grid_columns: 5,
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasActiveFilters = filteredSearch !== '' || statusFilter !== 'ativo' || typeFilter !== 'all';

  const resetForm = () => {
    setEditingId(null);
    setActiveFloor(1);
    setSelectedKeys([]);
    setLastSelectedCell(null);
    setEditorOpen(false);
    setEditingCell(null);
    setPaintMode(false);
    setForm({ name: '', vehicle_type: 'onibus', description: '', status: 'ativo', floors: 1, grid_rows: 12, grid_columns: 5 });
    setItems([]);
  };

  const fetchTemplates = async (requestedPage = page, requestedPageSize = pageSize) => {
    setLoading(true);

    const from = (requestedPage - 1) * requestedPageSize;
    const to = from + requestedPageSize - 1;

    let query = supabase
      .from('template_layouts')
      .select('*', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(from, to);

    if (filteredSearch) query = query.ilike('name', `%${filteredSearch}%`);
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (typeFilter !== 'all') query = query.eq('vehicle_type', typeFilter);

    const { data, error, count } = await query;

    if (error) {
      toast.error('Erro ao carregar templates oficiais');
      setTemplates([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }

    setTemplates((data ?? []) as TemplateLayout[]);
    setTotalCount(count ?? 0);

    // Comentário: ajusta automaticamente para página anterior quando exclusão deixa a página atual vazia.
    if ((data ?? []).length === 0 && requestedPage > 1) {
      setPage(requestedPage - 1);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!isDeveloper) return;
    fetchTemplates(page, pageSize);
  }, [isDeveloper, filteredSearch, statusFilter, typeFilter, page, pageSize]);

  const floorLabels = useMemo(() => Array.from({ length: form.floors }, (_, idx) => idx + 1), [form.floors]);

  const getItemByCoord = (coord: CellCoord) => items.find((item) => item.floor_number === coord.floor && item.row_number === coord.row && item.column_number === coord.column);

  const getCellTypeFromItem = (item?: TemplateItem): CellType => {
    if (!item) return 'vazio';
    return item.is_blocked ? 'bloqueado' : 'assento';
  };

  const getDefaultSeatNumber = (floor: number) => {
    // Comentário: gera próximo número livre no pavimento para agilizar criação em massa.
    const used = new Set(items.filter((item) => item.floor_number === floor && !item.is_blocked && item.seat_number).map((item) => item.seat_number));
    let next = 1;
    while (used.has(String(next))) next += 1;
    return String(next);
  };

  const validateDraft = (draft: CellEditorDraft, targetCoords: CellCoord[]) => {
    if (draft.cell_type === 'assento') {
      if (!draft.category) {
        toast.error('Assento deve ter categoria');
        return false;
      }

      const numbersToApply = targetCoords.map((coord, index) => {
        if (draft.seat_number.trim()) {
          return targetCoords.length > 1 ? String(Number.parseInt(draft.seat_number, 10) + index) : draft.seat_number.trim();
        }
        const existing = getItemByCoord(coord);
        return existing?.seat_number ?? getDefaultSeatNumber(coord.floor);
      });

      const hasInvalidNumber = numbersToApply.some((number) => !number);
      if (hasInvalidNumber) {
        toast.error('Informe número de assento válido');
        return false;
      }

      for (let idx = 0; idx < targetCoords.length; idx += 1) {
        const coord = targetCoords[idx];
        const candidateNumber = numbersToApply[idx];
        const duplicated = items.some((item) => {
          if (item.floor_number !== coord.floor || item.is_blocked || !item.seat_number) return false;
          if (item.seat_number !== candidateNumber) return false;
          return !(item.row_number === coord.row && item.column_number === coord.column);
        });
        if (duplicated) {
          toast.error(`Número de assento duplicado no pavimento ${coord.floor}: ${candidateNumber}`);
          return false;
        }
      }
    }

    return true;
  };

  const applyDraftToCoords = (draft: CellEditorDraft, targetCoords: CellCoord[]) => {
    if (targetCoords.length === 0) return;
    if (!validateDraft(draft, targetCoords)) return;

    setItems((prev) => {
      const next = [...prev];

      targetCoords.forEach((coord, index) => {
        const currentIndex = next.findIndex((item) => item.floor_number === coord.floor && item.row_number === coord.row && item.column_number === coord.column);

        if (draft.cell_type === 'vazio') {
          if (currentIndex >= 0) next.splice(currentIndex, 1);
          return;
        }

        const seatNumber = draft.cell_type === 'assento'
          ? (draft.seat_number.trim()
            ? (targetCoords.length > 1 ? String(Number.parseInt(draft.seat_number, 10) + index) : draft.seat_number.trim())
            : (next[currentIndex]?.seat_number ?? getDefaultSeatNumber(coord.floor)))
          : null;

        const payload: TemplateItem = {
          floor_number: coord.floor,
          row_number: coord.row,
          column_number: coord.column,
          seat_number: draft.cell_type === 'assento' ? seatNumber : null,
          category: draft.cell_type === 'assento' ? draft.category : 'convencional',
          tags: draft.cell_type === 'assento' ? draft.tags : [],
          is_blocked: draft.cell_type === 'bloqueado',
        };

        if (currentIndex >= 0) next[currentIndex] = { ...next[currentIndex], ...payload };
        else next.push(payload);
      });

      return next;
    });
  };

  const openCellEditor = (coord: CellCoord) => {
    const item = getItemByCoord(coord);
    const cellType = getCellTypeFromItem(item);

    setEditingCell(coord);
    setEditorDraft({
      cell_type: cellType,
      seat_number: item?.seat_number ?? (cellType === 'assento' ? getDefaultSeatNumber(coord.floor) : ''),
      category: item?.category ?? 'convencional',
      tags: item?.tags ?? [],
    });
    setEditorOpen(true);
  };

  const handleGridCellClick = (coord: CellCoord, event: React.MouseEvent<HTMLButtonElement>) => {
    const key = getCellKey(coord);

    if (paintMode) {
      applyDraftToCoords(paintDraft, [coord]);
      return;
    }

    if (event.shiftKey && lastSelectedCell && lastSelectedCell.floor === coord.floor) {
      const minRow = Math.min(lastSelectedCell.row, coord.row);
      const maxRow = Math.max(lastSelectedCell.row, coord.row);
      const minColumn = Math.min(lastSelectedCell.column, coord.column);
      const maxColumn = Math.max(lastSelectedCell.column, coord.column);
      const area: string[] = [];

      for (let row = minRow; row <= maxRow; row += 1) {
        for (let column = minColumn; column <= maxColumn; column += 1) {
          area.push(getCellKey({ floor: coord.floor, row, column }));
        }
      }

      setSelectedKeys((prev) => Array.from(new Set([...prev, ...area])));
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      setSelectedKeys((prev) => prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]);
      setLastSelectedCell(coord);
      return;
    }

    setSelectedKeys([key]);
    setLastSelectedCell(coord);
    openCellEditor(coord);
  };

  const openBulkEditor = () => {
    const selectedCoords = selectedKeys.map((key) => {
      const [floor, row, column] = key.split('-').map((value) => Number.parseInt(value, 10));
      return { floor, row, column };
    });

    if (selectedCoords.length === 0) {
      toast.error('Selecione ao menos uma posição');
      return;
    }

    const first = selectedCoords[0];
    const firstItem = getItemByCoord(first);
    setEditingCell(first);
    setEditorDraft({
      cell_type: getCellTypeFromItem(firstItem),
      seat_number: firstItem?.seat_number ?? '',
      category: firstItem?.category ?? 'convencional',
      tags: firstItem?.tags ?? [],
    });
    setEditorOpen(true);
  };

  const openEdit = async (template: TemplateLayout) => {
    setEditingId(template.id);
    setDialogOpen(true);
    setItemsLoading(true);
    setSelectedKeys([]);
    setLastSelectedCell(null);
    setPaintMode(false);

    setForm({
      name: template.name,
      vehicle_type: template.vehicle_type,
      description: template.description ?? '',
      status: template.status,
      floors: template.floors,
      grid_rows: template.grid_rows,
      grid_columns: template.grid_columns,
    });

    const { data, error } = await supabase
      .from('template_layout_items')
      .select('id, floor_number, row_number, column_number, seat_number, category, tags, is_blocked')
      .eq('template_layout_id', template.id)
      .order('floor_number')
      .order('row_number')
      .order('column_number');

    if (error) {
      toast.error('Erro ao carregar itens do layout');
      setItems([]);
    } else {
      setItems((data ?? []) as TemplateItem[]);
    }
    setItemsLoading(false);
  };

  const validateItems = () => {
    const duplicatedByFloor = items.some((item) => {
      if (item.is_blocked || !item.seat_number) return false;
      return items.some((other) =>
        other !== item
        && !other.is_blocked
        && other.floor_number === item.floor_number
        && other.seat_number === item.seat_number
      );
    });

    if (duplicatedByFloor) {
      toast.error('Não é permitido número de assento duplicado no mesmo pavimento');
      return false;
    }

    const hasInvalidFloor = items.some((item) => item.floor_number > form.floors);
    if (hasInvalidFloor) {
      toast.error('Existem assentos em pavimento inválido');
      return false;
    }

    const hasSeatWithoutCategory = items.some((item) => !item.is_blocked && !item.category);
    if (hasSeatWithoutCategory) {
      toast.error('Todos os assentos devem ter categoria');
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Informe o nome do template');
    if (!validateItems()) return;

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      vehicle_type: form.vehicle_type,
      description: form.description.trim() || null,
      status: form.status,
      floors: form.floors,
      grid_rows: form.grid_rows,
      grid_columns: form.grid_columns,
    };

    let templateId = editingId;
    if (editingId) {
      const { error } = await supabase.from('template_layouts').update(payload).eq('id', editingId);
      if (error) {
        toast.error('Erro ao atualizar template');
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await supabase.from('template_layouts').insert(payload).select('id').single();
      if (error || !data) {
        toast.error('Erro ao criar template');
        setSaving(false);
        return;
      }
      templateId = data.id;
    }

    if (!templateId) {
      toast.error('Template inválido');
      setSaving(false);
      return;
    }

    // Comentário: estratégia simples e segura para evitar inconsistência entre grade e itens.
    await supabase.from('template_layout_items').delete().eq('template_layout_id', templateId);
    if (items.length > 0) {
      const { error: itemsError } = await supabase.from('template_layout_items').insert(
        items.map((item) => ({ ...item, template_layout_id: templateId }))
      );
      if (itemsError) {
        toast.error('Erro ao salvar mapa do template');
        setSaving(false);
        return;
      }
    }

    toast.success(editingId ? 'Template atualizado' : 'Template criado');
    setDialogOpen(false);
    resetForm();
    setPage(1);
    setSaving(false);
  };

  const duplicateTemplate = async (template: TemplateLayout) => {
    const { data, error } = await supabase.from('template_layouts').insert({
      name: `${template.name} (Cópia)`,
      vehicle_type: template.vehicle_type,
      description: template.description,
      status: 'inativo',
      floors: template.floors,
      grid_rows: template.grid_rows,
      grid_columns: template.grid_columns,
    }).select('id').single();

    if (error || !data) return toast.error('Erro ao duplicar template');

    const { data: sourceItems } = await supabase
      .from('template_layout_items')
      .select('floor_number, row_number, column_number, seat_number, category, tags, is_blocked')
      .eq('template_layout_id', template.id);

    if ((sourceItems ?? []).length > 0) {
      await supabase.from('template_layout_items').insert((sourceItems ?? []).map((item) => ({ ...item, template_layout_id: data.id })));
    }

    toast.success('Template duplicado');
    setPage(1);
  };

  const toggleStatus = async (template: TemplateLayout) => {
    const nextStatus = template.status === 'ativo' ? 'inativo' : 'ativo';
    const { error } = await supabase.from('template_layouts').update({ status: nextStatus }).eq('id', template.id);
    if (error) toast.error('Erro ao alterar status');
    else {
      toast.success(`Template ${nextStatus}`);
      fetchTemplates();
    }
  };

  const handleDeleteTemplate = async () => {
    if (!templateToDelete) return;
    setDeleting(true);

    // Comentário: proteção para não excluir template em uso por veículos existentes.
    const { count: vehiclesUsing, error: vehiclesError } = await supabase
      .from('vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('template_layout_id', templateToDelete.id);

    // TODO: quando integração de templates em eventos/viagens for concluída, incluir a mesma proteção nessas entidades.
    if (vehiclesError) {
      toast.error('Erro ao validar vínculos do template');
      setDeleting(false);
      return;
    }

    if ((vehiclesUsing ?? 0) > 0) {
      toast.error('Não é possível excluir: template está em uso.');
      setDeleting(false);
      return;
    }

    const { error } = await supabase.from('template_layouts').delete().eq('id', templateToDelete.id);

    if (error) {
      toast.error('Erro ao excluir template');
    } else {
      toast.success('Template excluído com sucesso');
      setTemplateToDelete(null);
      fetchTemplates();
    }

    setDeleting(false);
  };

  if (!isDeveloper) return <Navigate to="/admin/eventos" replace />;

  const rowIndexes = Array.from({ length: form.grid_rows }, (_, i) => i + 1);
  const columnIndexes = Array.from({ length: form.grid_columns }, (_, i) => i + 1);

  const applyEditorDraft = () => {
    if (!editingCell) return;
    applyDraftToCoords(editorDraft, [editingCell]);
    setEditorOpen(false);
  };

  const applyEditorToSelected = () => {
    const coords = selectedKeys.map((key) => {
      const [floor, row, column] = key.split('-').map((value) => Number.parseInt(value, 10));
      return { floor, row, column };
    });

    if (coords.length === 0) {
      toast.error('Nenhuma posição selecionada');
      return;
    }

    applyDraftToCoords(editorDraft, coords);
    setEditorOpen(false);
  };

  return (
    <AdminLayout>
      <div className="page-container">
        <PageHeader
          title="Templates de Layout"
          description="Catálogo oficial de layouts globais para cadastro de veículos"
          actions={
            <>
              <Button variant="outline" size="sm"><Upload className="h-4 w-4 mr-2" />Importar</Button>
              <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-2" />Exportar</Button>
              <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button onClick={resetForm}><Plus className="h-4 w-4 mr-2" />Novo Template</Button>
                </DialogTrigger>
                <DialogContent className="admin-modal flex h-[90vh] max-h-[90vh] w-[95vw] max-w-6xl flex-col gap-0 p-0">
                  <DialogHeader className="admin-modal__header px-6 py-4">
                    <DialogTitle>{editingId ? 'Editar' : 'Novo'} Template Oficial</DialogTitle>
                  </DialogHeader>
                  <div className="flex h-full flex-col">
                    <Tabs defaultValue="geral" className="flex h-full flex-col">
                      <TabsList className="admin-modal__tabs flex h-auto w-full flex-wrap justify-start gap-1 px-6 py-2">
                        <TabsTrigger value="geral">Geral</TabsTrigger>
                        <TabsTrigger value="layout">Layout</TabsTrigger>
                        <TabsTrigger value="preview">Preview</TabsTrigger>
                      </TabsList>
                      <div className="admin-modal__body flex-1 overflow-y-auto px-6 py-4">
                        <TabsContent value="geral" className="space-y-4 mt-0">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Nome *</Label>
                              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                              <Label>Tipo de Veículo</Label>
                              <Select
                                value={form.vehicle_type}
                                onValueChange={(value: TemplateVehicleType) => {
                                  const found = VEHICLE_OPTIONS.find((item) => item.value === value);
                                  setForm({ ...form, vehicle_type: value, floors: found?.floors ?? 1, grid_columns: found?.cols ?? 5 });
                                  setActiveFloor(1);
                                  setSelectedKeys([]);
                                }}
                              >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {VEHICLE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                              <Label>Descrição</Label>
                              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
                            </div>
                            <div className="space-y-2">
                              <Label>Status</Label>
                              <Select value={form.status} onValueChange={(value: 'ativo' | 'inativo') => setForm({ ...form, status: value })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="ativo">Ativo</SelectItem><SelectItem value="inativo">Inativo</SelectItem></SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Pavimentos</Label>
                              <Input type="number" value={form.floors} min={1} max={2} onChange={(e) => setForm({ ...form, floors: Math.max(1, Math.min(2, Number(e.target.value || 1))) })} />
                            </div>
                            <div className="space-y-2">
                              <Label>Linhas da grade</Label>
                              <Input type="number" value={form.grid_rows} min={4} max={40} onChange={(e) => setForm({ ...form, grid_rows: Math.max(4, Math.min(40, Number(e.target.value || 12))) })} />
                            </div>
                            <div className="space-y-2">
                              <Label>Colunas da grade</Label>
                              <Input type="number" value={form.grid_columns} min={3} max={10} onChange={(e) => setForm({ ...form, grid_columns: Math.max(3, Math.min(10, Number(e.target.value || 5))) })} />
                            </div>
                          </div>
                        </TabsContent>

                        <TabsContent value="layout" className="mt-0">
                          {itemsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                            <div className="space-y-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <Label>Pavimento:</Label>
                                <Select value={String(activeFloor)} onValueChange={(v) => { setActiveFloor(Number(v)); setSelectedKeys([]); }}>
                                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {floorLabels.map((floor) => (
                                      <SelectItem key={floor} value={String(floor)}>{floor === 1 ? 'Inferior' : 'Superior'}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Badge variant="secondary">{selectedKeys.length} selecionados</Badge>
                                <Button variant="outline" size="sm" onClick={openBulkEditor}>Editar selecionados</Button>
                              </div>

                              <div className="grid gap-3 rounded-md border p-3 lg:grid-cols-12">
                                <div className="space-y-2 lg:col-span-9">
                                  <div className="overflow-x-auto rounded-md border bg-muted/10 p-3">
                                    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${form.grid_columns}, minmax(44px, 1fr))` }}>
                                      {rowIndexes.flatMap((row) => columnIndexes.map((column) => {
                                        const coord = { floor: activeFloor, row, column };
                                        const cellItem = getItemByCoord(coord);
                                        const cellType = getCellTypeFromItem(cellItem);
                                        const key = getCellKey(coord);
                                        const selected = selectedKeys.includes(key);

                                        const baseClass = cellType === 'assento'
                                          ? CATEGORY_COLORS[cellItem?.category ?? 'convencional']
                                          : cellType === 'bloqueado'
                                            ? 'bg-muted text-muted-foreground border-muted-foreground/20'
                                            : 'bg-background hover:bg-muted/60';

                                        return (
                                          <button
                                            key={key}
                                            type="button"
                                            className={`h-12 rounded border text-xs ${baseClass} ${selected ? 'ring-2 ring-primary' : ''}`}
                                            onClick={(event) => handleGridCellClick(coord, event)}
                                          >
                                            {cellType === 'bloqueado' ? 'BLOQ' : cellType === 'assento' ? (cellItem?.seat_number ?? 'ASS') : `${row}.${column}`}
                                          </button>
                                        );
                                      }))}
                                    </div>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    Clique para editar. Use Ctrl/⌘ + clique para seleção múltipla e Shift + clique para seleção em área.
                                  </p>
                                </div>

                                <div className="space-y-3 lg:col-span-3">
                                  <div className="rounded-md border p-3">
                                    <div className="flex items-center justify-between">
                                      <p className="text-sm font-medium">Modo pintura</p>
                                      <Button size="sm" variant={paintMode ? 'default' : 'outline'} onClick={() => setPaintMode((prev) => !prev)}>
                                        <Paintbrush className="mr-2 h-4 w-4" />
                                        {paintMode ? 'Sair' : 'Ativar'}
                                      </Button>
                                    </div>
                                    <div className="mt-3 space-y-2">
                                      <Label>Tipo</Label>
                                      <Select value={paintDraft.cell_type} onValueChange={(value: CellType) => setPaintDraft((prev) => ({ ...prev, cell_type: value }))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="assento">Assento</SelectItem>
                                          <SelectItem value="bloqueado">Bloqueado</SelectItem>
                                          <SelectItem value="vazio">Vazio/Corredor</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      {paintDraft.cell_type === 'assento' && (
                                        <>
                                          <Label>Categoria</Label>
                                          <Select value={paintDraft.category} onValueChange={(value: ItemCategory) => setPaintDraft((prev) => ({ ...prev, category: value }))}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                              {CATEGORY_OPTIONS.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}
                                            </SelectContent>
                                          </Select>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </TabsContent>

                        <TabsContent value="preview" className="mt-0 space-y-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <Label>Visualização:</Label>
                            <Select value={previewMode} onValueChange={(value: 'categoria' | 'tags') => setPreviewMode(value)}>
                              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="categoria">Exibir por Categoria</SelectItem>
                                <SelectItem value="tags">Exibir Tags</SelectItem>
                              </SelectContent>
                            </Select>
                            {previewMode === 'tags' && (
                              <Select value={previewTag} onValueChange={(value: (typeof TAG_OPTIONS)[number]) => setPreviewTag(value)}>
                                <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {TAG_OPTIONS.map((tag) => <SelectItem key={tag} value={tag}>{tag}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            )}
                          </div>

                          <div className="space-y-3 rounded-md border p-3">
                            <p className="text-sm text-muted-foreground">Capacidade total: {items.filter((item) => !item.is_blocked).length} assentos</p>
                            <div className="flex flex-wrap gap-2">
                              {CATEGORY_OPTIONS.map((category) => (
                                <Badge key={category} className={CATEGORY_COLORS[category]}>
                                  {category}: {items.filter((item) => item.category === category && !item.is_blocked).length}
                                </Badge>
                              ))}
                              <Badge variant="outline">Bloqueados: {items.filter((item) => item.is_blocked).length}</Badge>
                            </div>
                          </div>

                          <div className="space-y-4">
                            {floorLabels.map((floor) => (
                              <div key={floor} className="rounded-md border p-3">
                                <p className="mb-3 text-sm font-medium">{floor === 1 ? 'Pavimento Inferior' : 'Pavimento Superior'}</p>
                                <div className="overflow-x-auto">
                                  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${form.grid_columns}, minmax(44px, 1fr))` }}>
                                    {rowIndexes.flatMap((row) => columnIndexes.map((column) => {
                                      const cell = getItemByCoord({ floor, row, column });
                                      const cellType = getCellTypeFromItem(cell);

                                      if (cellType === 'vazio') {
                                        return <div key={`${floor}-${row}-${column}`} className="h-12 rounded border border-dashed bg-muted/20" />;
                                      }

                                      if (cellType === 'bloqueado') {
                                        return <div key={`${floor}-${row}-${column}`} className="flex h-12 items-center justify-center rounded border bg-muted text-xs text-muted-foreground">BLOQ</div>;
                                      }

                                      const tagHighlight = previewMode === 'tags' && cell?.tags.includes(previewTag);
                                      const colorClass = previewMode === 'categoria'
                                        ? CATEGORY_COLORS[cell?.category ?? 'convencional']
                                        : tagHighlight
                                          ? 'bg-primary/20 text-primary border-primary'
                                          : 'bg-muted/40 text-muted-foreground border-muted';

                                      return (
                                        <div key={`${floor}-${row}-${column}`} className={`flex h-12 items-center justify-center rounded border text-xs ${colorClass}`}>
                                          {cell?.seat_number ?? 'ASS'}
                                        </div>
                                      );
                                    }))}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </TabsContent>
                      </div>
                    </Tabs>
                    <div className="admin-modal__footer flex justify-end gap-2 px-6 py-4">
                      <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                      <Button onClick={handleSave} disabled={saving}><Save className="h-4 w-4 mr-2" />{saving ? 'Salvando...' : 'Salvar Template'}</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          }
        />

        <FilterCard
          searchValue={filteredSearch}
          onSearchChange={(value) => { setFilteredSearch(value); setPage(1); }}
          searchPlaceholder="Buscar por nome do template"
          selects={[
            {
              id: 'status', label: 'Status', placeholder: 'Status', value: statusFilter,
              onChange: (value) => { setStatusFilter(value as 'all' | 'ativo' | 'inativo'); setPage(1); },
              options: [{ value: 'ativo', label: 'Ativo' }, { value: 'inativo', label: 'Inativo' }, { value: 'all', label: 'Todos' }],
            },
            {
              id: 'type', label: 'Tipo', placeholder: 'Tipo', value: typeFilter,
              onChange: (value) => { setTypeFilter(value as 'all' | TemplateVehicleType); setPage(1); },
              options: [{ value: 'all', label: 'Todos' }, ...VEHICLE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))],
            },
          ]}
          onClearFilters={() => { setFilteredSearch(''); setStatusFilter('ativo'); setTypeFilter('all'); setPage(1); }}
          hasActiveFilters={hasActiveFilters}
        />

        <div className="mt-5">
          {loading ? (
            <div className="flex items-center justify-center py-14"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : templates.length === 0 ? (
            <EmptyState
              icon={<LayoutTemplate className="h-8 w-8 text-muted-foreground" />}
              title="Nenhum template encontrado"
              description="Cadastre templates oficiais para padronizar o layout de assentos"
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="admin-table-header">
                      <TableHead>Nome</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Versão</TableHead>
                      <TableHead>Atualizado em</TableHead>
                      <TableHead className="w-[72px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((template) => (
                      <TableRow key={template.id}>
                        <TableCell className="font-medium">{template.name}</TableCell>
                        <TableCell>{VEHICLE_OPTIONS.find((option) => option.value === template.vehicle_type)?.label ?? template.vehicle_type}</TableCell>
                        <TableCell><StatusBadge status={template.status} /></TableCell>
                        <TableCell>v{template.current_version}</TableCell>
                        <TableCell>{new Date(template.updated_at).toLocaleString('pt-BR')}</TableCell>
                        <TableCell>
                          <ActionsDropdown
                            actions={[
                              { label: 'Ver', icon: Eye, onClick: () => openEdit(template) },
                              { label: 'Editar', icon: Pencil, onClick: () => openEdit(template) },
                              { label: 'Duplicar', icon: Copy, onClick: () => duplicateTemplate(template) },
                              { label: template.status === 'ativo' ? 'Inativar' : 'Ativar', icon: Power, onClick: () => toggleStatus(template) },
                              { label: 'Excluir', icon: Trash2, variant: 'destructive', onClick: () => setTemplateToDelete(template) },
                            ]}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Página {page} de {totalPages} • {totalCount} registro(s)
                  </p>
                  <div className="flex items-center gap-2">
                    <Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value)); setPage(1); }}>
                      <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10 / pág</SelectItem>
                        <SelectItem value="20">20 / pág</SelectItem>
                        <SelectItem value="50">50 / pág</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((prev) => prev - 1)}>
                      <ChevronLeft className="h-4 w-4 mr-1" />Anterior
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((prev) => prev + 1)}>
                      Próximo<ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Comentário: popup de propriedades segue padrão de Dialog já usado no painel admin. */}
        <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Propriedades da posição</DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Tipo do item</Label>
                <Select
                  value={editorDraft.cell_type}
                  onValueChange={(value: CellType) => setEditorDraft((prev) => ({
                    ...prev,
                    cell_type: value,
                    seat_number: value === 'assento' ? prev.seat_number : '',
                    tags: value === 'assento' ? prev.tags : [],
                  }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="assento">Assento</SelectItem>
                    <SelectItem value="bloqueado">Bloqueado</SelectItem>
                    <SelectItem value="vazio">Vazio/Corredor</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {editorDraft.cell_type === 'assento' && (
                <>
                  <div className="space-y-2">
                    <Label>Número do assento</Label>
                    <Input value={editorDraft.seat_number} onChange={(event) => setEditorDraft((prev) => ({ ...prev, seat_number: event.target.value }))} placeholder="Ex.: 12" />
                  </div>
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Select value={editorDraft.category} onValueChange={(value: ItemCategory) => setEditorDraft((prev) => ({ ...prev, category: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tags</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {TAG_OPTIONS.map((tag) => (
                        <label key={tag} className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                          <Checkbox
                            checked={editorDraft.tags.includes(tag)}
                            onCheckedChange={(checked) => {
                              setEditorDraft((prev) => ({
                                ...prev,
                                tags: checked ? [...prev.tags, tag] : prev.tags.filter((value) => value !== tag),
                              }));
                            }}
                          />
                          {tag}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancelar</Button>
                <Button onClick={applyEditorDraft}>Aplicar</Button>
                {selectedKeys.length > 1 && (
                  <Button variant="secondary" onClick={applyEditorToSelected}>Aplicar nos selecionados</Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!templateToDelete} onOpenChange={(open) => { if (!open) setTemplateToDelete(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Template</AlertDialogTitle>
              <AlertDialogDescription>
                Deseja excluir definitivamente este template? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteTemplate} disabled={deleting}>
                {deleting ? 'Excluindo...' : 'Excluir'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
}
