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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Download, Upload, Loader2, Eye, Pencil, Copy, Power, LayoutTemplate, Save } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { TemplateLayout, TemplateVehicleType } from '@/types/database';

type ItemCategory = 'convencional' | 'executivo' | 'semi_leito' | 'leito' | 'leito_cama';
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

const VEHICLE_OPTIONS: Array<{ value: TemplateVehicleType; label: string; floors: number; cols: number }> = [
  { value: 'onibus', label: 'Ônibus', floors: 1, cols: 5 },
  { value: 'double_deck', label: 'Double Deck', floors: 2, cols: 5 },
  { value: 'micro_onibus', label: 'Micro-ônibus', floors: 1, cols: 5 },
  { value: 'van', label: 'Van', floors: 1, cols: 4 },
];

const TAG_OPTIONS = ['janela', 'corredor', 'frente', 'fundo', 'proximo_banheiro', 'proximo_escada', 'premium'] as const;

export default function TemplatesLayout() {
  const { isDeveloper } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [templates, setTemplates] = useState<TemplateLayout[]>([]);
  const [filteredSearch, setFilteredSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ativo' | 'inativo'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | TemplateVehicleType>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeFloor, setActiveFloor] = useState(1);
  const [form, setForm] = useState({
    name: '',
    vehicle_type: 'onibus' as TemplateVehicleType,
    description: '',
    status: 'ativo' as 'ativo' | 'inativo',
    floors: 1,
    grid_rows: 12,
    grid_columns: 5,
  });
  const [items, setItems] = useState<TemplateItem[]>([]);

  const resetForm = () => {
    setEditingId(null);
    setActiveFloor(1);
    setForm({ name: '', vehicle_type: 'onibus', description: '', status: 'ativo', floors: 1, grid_rows: 12, grid_columns: 5 });
    setItems([]);
  };

  const fetchTemplates = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('template_layouts').select('*').order('updated_at', { ascending: false });
    if (error) toast.error('Erro ao carregar templates oficiais');
    else setTemplates((data ?? []) as TemplateLayout[]);
    setLoading(false);
  };

  useEffect(() => {
    if (isDeveloper) fetchTemplates();
  }, [isDeveloper]);

  const filtered = useMemo(() => templates.filter((template) => {
    if (filteredSearch && !template.name.toLowerCase().includes(filteredSearch.toLowerCase())) return false;
    if (statusFilter !== 'all' && template.status !== statusFilter) return false;
    if (typeFilter !== 'all' && template.vehicle_type !== typeFilter) return false;
    return true;
  }), [templates, filteredSearch, statusFilter, typeFilter]);

  const openEdit = async (template: TemplateLayout) => {
    setEditingId(template.id);
    setDialogOpen(true);
    setItemsLoading(true);
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

  const toggleGridCell = (row: number, column: number) => {
    const currentIndex = items.findIndex((item) => item.floor_number === activeFloor && item.row_number === row && item.column_number === column);
    if (currentIndex >= 0) {
      const clone = [...items];
      clone.splice(currentIndex, 1);
      setItems(clone);
      return;
    }
    // Comentário: sempre criamos assento com número automático inicial para manter o editor guiado simples.
    const nextSeatNumber = String(items.filter((item) => !!item.seat_number).length + 1);
    setItems([...items, {
      floor_number: activeFloor,
      row_number: row,
      column_number: column,
      seat_number: nextSeatNumber,
      category: 'convencional',
      tags: column === 1 || column === form.grid_columns ? ['janela'] : ['corredor'],
      is_blocked: false,
    }]);
  };

  const selectedCell = (row: number, column: number) => items.find((item) => item.floor_number === activeFloor && item.row_number === row && item.column_number === column);

  const validateItems = () => {
    const seatNumbers = items.filter((item) => !item.is_blocked && item.seat_number).map((item) => item.seat_number);
    if (new Set(seatNumbers).size !== seatNumbers.length) {
      toast.error('Não é permitido número de assento duplicado');
      return false;
    }
    const hasInvalidFloor = items.some((item) => item.floor_number > form.floors);
    if (hasInvalidFloor) {
      toast.error('Existem assentos em pavimento inválido');
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
    fetchTemplates();
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

    const { data: sourceItems } = await supabase.from('template_layout_items').select('floor_number, row_number, column_number, seat_number, category, tags, is_blocked').eq('template_layout_id', template.id);
    if ((sourceItems ?? []).length > 0) {
      await supabase.from('template_layout_items').insert((sourceItems ?? []).map((item) => ({ ...item, template_layout_id: data.id })));
    }
    toast.success('Template duplicado');
    fetchTemplates();
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

  if (!isDeveloper) return <Navigate to="/admin/eventos" replace />;

  const rowIndexes = Array.from({ length: form.grid_rows }, (_, i) => i + 1);
  const columnIndexes = Array.from({ length: form.grid_columns }, (_, i) => i + 1);

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
                              <Select value={form.vehicle_type} onValueChange={(value: TemplateVehicleType) => {
                                const found = VEHICLE_OPTIONS.find((item) => item.value === value);
                                setForm({ ...form, vehicle_type: value, floors: found?.floors ?? 1, grid_columns: found?.cols ?? 5 });
                                setActiveFloor(1);
                              }}>
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
                              <Input type="number" value={form.floors} min={1} max={2} onChange={(e) => setForm({ ...form, floors: Number(e.target.value || 1) })} />
                            </div>
                          </div>
                        </TabsContent>
                        <TabsContent value="layout" className="mt-0">
                          {itemsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                            <div className="space-y-4">
                              <div className="flex items-center gap-2">
                                <Label>Pavimento:</Label>
                                <Select value={String(activeFloor)} onValueChange={(v) => setActiveFloor(Number(v))}>
                                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {Array.from({ length: form.floors }, (_, idx) => idx + 1).map((floor) => (
                                      <SelectItem key={floor} value={String(floor)}>{floor === 1 ? 'Inferior' : 'Superior'}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="overflow-x-auto border rounded-md p-3">
                                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${form.grid_columns}, minmax(44px, 1fr))` }}>
                                  {rowIndexes.flatMap((row) => columnIndexes.map((column) => {
                                    const item = selectedCell(row, column);
                                    return (
                                      <button
                                        key={`${row}-${column}`}
                                        type="button"
                                        className={`h-12 rounded border text-xs ${item ? (item.is_blocked ? 'bg-muted text-muted-foreground' : 'bg-primary/10 border-primary') : 'bg-background hover:bg-muted/50'}`}
                                        onClick={() => toggleGridCell(row, column)}
                                      >
                                        {item?.is_blocked ? 'BLOQ' : item?.seat_number ?? `${row}.${column}`}
                                      </button>
                                    );
                                  }))}
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground">Clique na posição para adicionar/remover assento. Corredor é implícito pelas colunas sem assento.</p>
                            </div>
                          )}
                        </TabsContent>
                        <TabsContent value="preview" className="mt-0">
                          <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">Capacidade total: {items.filter((item) => !item.is_blocked).length} assentos</p>
                            <div className="flex flex-wrap gap-2">
                              {['convencional', 'executivo', 'semi_leito', 'leito', 'leito_cama'].map((category) => (
                                <Badge key={category} variant="secondary">
                                  {category}: {items.filter((item) => item.category === category && !item.is_blocked).length}
                                </Badge>
                              ))}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {TAG_OPTIONS.map((tag) => <Badge key={tag} variant="outline">{tag}: {items.filter((item) => item.tags.includes(tag)).length}</Badge>)}
                            </div>
                          </div>
                        </TabsContent>
                      </div>
                    </Tabs>
                    <div className="admin-modal__footer px-6 py-4 flex justify-end gap-2">
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
          onSearchChange={setFilteredSearch}
          searchPlaceholder="Buscar por nome do template"
          selects={[
            {
              id: 'status', label: 'Status', placeholder: 'Status', value: statusFilter,
              onChange: (value) => setStatusFilter(value as 'all' | 'ativo' | 'inativo'),
              options: [{ value: 'all', label: 'Todos' }, { value: 'ativo', label: 'Ativo' }, { value: 'inativo', label: 'Inativo' }],
            },
            {
              id: 'type', label: 'Tipo', placeholder: 'Tipo', value: typeFilter,
              onChange: (value) => setTypeFilter(value as 'all' | TemplateVehicleType),
              options: [{ value: 'all', label: 'Todos' }, ...VEHICLE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))],
            },
          ]}
          onClearFilters={() => { setFilteredSearch(''); setStatusFilter('all'); setTypeFilter('all'); }}
          hasActiveFilters={!!filteredSearch || statusFilter !== 'all' || typeFilter !== 'all'}
        />

        {loading ? (
          <div className="flex items-center justify-center py-14"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
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
                  {filtered.map((template) => (
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
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
