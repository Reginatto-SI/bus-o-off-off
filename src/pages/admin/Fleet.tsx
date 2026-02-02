import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Vehicle } from '@/types/database';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
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
  CircleMinus,
  CirclePlus,
  IdCard,
  Loader2,
  Pencil,
  Plus,
  Radio,
  Users,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { buildDebugToastMessage, logSupabaseError } from '@/lib/errorDebug';

export default function Fleet() {
  const { isGerente, isOperador, activeCompanyId, user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: 'onibus' as Vehicle['type'],
    plate: '',
    owner: '',
    brand: '',
    model: '',
    year_model: '',
    capacity: '',
    chassis: '',
    renavam: '',
    color: '',
    whatsapp_group_link: '',
    notes: '',
  });

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
      // Comentário: feedback amigável, com detalhes apenas em modo debug.
      console.error('Nenhuma empresa ativa ao salvar veículo.', context);
      toast.error(
        buildDebugToastMessage({
          title: 'Nenhuma empresa ativa',
          context,
        })
      );
      setSaving(false);
      return;
    }

    const yearModel = form.year_model ? Number.parseInt(form.year_model, 10) : null;
    const capacity = Number.parseInt(form.capacity, 10);
    const normalizedPlate = form.plate.trim().toUpperCase();
    const isAdmin = isGerente || isOperador;

    if (!isAdmin) {
      // Comentário: bloqueia tentativa de escrita para usuários sem permissão (RLS exige admin).
      console.warn('Permissão insuficiente ao salvar veículo: usuário não-admin.');
      toast.error('Você não tem permissão para salvar veículos');
      setSaving(false);
      return;
    }

    if (!normalizedPlate) {
      // Comentário: evita request inválida quando a placa obrigatória está vazia.
      console.warn('Validação de veículo: placa ausente no modal de frota.');
      toast.error('Informe a placa do veículo');
      setSaving(false);
      return;
    }

    if (Number.isNaN(capacity)) {
      // Comentário: previne envio de NaN para o Supabase (erro de tipo em coluna integer).
      console.warn('Validação de veículo: capacidade inválida (NaN) no modal de frota.');
      toast.error('Informe uma capacidade válida');
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
      chassis: form.chassis || null,
      renavam: form.renavam || null,
      color: form.color || null,
      whatsapp_group_link: form.whatsapp_group_link || null,
      notes: form.notes || null,
      company_id: activeCompanyId,
    };

    let error;
    if (editingId) {
      // Não atualiza company_id na edição
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
      // Comentário: mensagens mais úteis para RLS/constraint sem expor detalhes técnicos.
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
    setEditingId(null);
    setForm({
      type: 'onibus',
      plate: '',
      owner: '',
      brand: '',
      model: '',
      year_model: '',
      capacity: '',
      chassis: '',
      renavam: '',
      color: '',
      whatsapp_group_link: '',
      notes: '',
    });
  };

  return (
    <AdminLayout>
      <div className="page-container">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Frota</h1>
            <p className="text-muted-foreground">Gerencie os veículos disponíveis</p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Veículo
              </Button>
            </DialogTrigger>
            {/* Admin Modal UI: preset visual reutilizável (não altera layout/responsividade) */}
            {/* Admin Modal UI: remove gap do container para evitar espaço entre header e tabs */}
            <DialogContent className="admin-modal flex h-[90vh] max-h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 p-0">
              {/* Admin Modal UI: header com separação sutil sem mexer no grid */}
              <DialogHeader className="admin-modal__header px-6 py-4">
                <DialogTitle>{editingId ? 'Editar' : 'Novo'} Veículo</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="flex h-full flex-col">
                <Tabs defaultValue="identificacao" className="flex h-full flex-col">
                  {/* Tabs: ícone inline + truncate para evitar overflow em telas menores */}
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

                  {/* Admin Modal UI: body com scroll interno preservado */}
                  <div className="admin-modal__body flex-1 overflow-y-auto px-6 py-4">
                    <TabsContent value="identificacao" className="mt-0">
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        <div className="space-y-2">
                          <Label>Tipo de Frota</Label>
                          <Select
                            value={form.type}
                            onValueChange={(value: Vehicle['type']) => setForm({ ...form, type: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="onibus">Ônibus</SelectItem>
                              <SelectItem value="van">Van</SelectItem>
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
                {/* Admin Modal UI: footer com separador sutil e botões alinhados à direita */}
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
        </div>

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
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Placa</TableHead>
                    <TableHead>Proprietário</TableHead>
                    <TableHead>Capacidade máxima</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehicles.map((vehicle) => (
                    <TableRow key={vehicle.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Bus className="h-4 w-4 text-muted-foreground" />
                          {vehicle.type === 'onibus' ? 'Ônibus' : 'Van'}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{vehicle.plate}</TableCell>
                      <TableCell>{vehicle.owner ?? '-'}</TableCell>
                      <TableCell>{vehicle.capacity} passageiros</TableCell>
                      <TableCell>
                        <StatusBadge status={vehicle.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(vehicle)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggleStatus(vehicle)}
                          >
                            {vehicle.status === 'ativo' ? (
                              <CircleMinus className="h-4 w-4 text-destructive" />
                            ) : (
                              <CirclePlus className="h-4 w-4 text-primary" />
                            )}
                          </Button>
                        </div>
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
