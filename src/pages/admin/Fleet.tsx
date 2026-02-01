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
import { Bus, CircleMinus, CirclePlus, Loader2, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';

export default function Fleet() {
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
      toast.error('Erro ao carregar frota');
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

    const yearModel = form.year_model ? Number.parseInt(form.year_model, 10) : null;
    const capacity = Number.parseInt(form.capacity, 10);

    const vehicleData = {
      type: form.type,
      plate: form.plate.trim().toUpperCase(),
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
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from('vehicles').update(vehicleData).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('vehicles').insert([vehicleData]));
    }

    if (error) {
      toast.error(error.message.includes('unique') ? 'Placa já cadastrada' : 'Erro ao salvar veículo');
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
      toast.error('Erro ao atualizar status');
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
            <DialogContent className="h-[650px] max-h-[650px] w-[1200px] max-w-[1200px] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? 'Editar' : 'Novo'} Veículo</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Tabs defaultValue="identificacao" className="space-y-4">
                  <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
                    <TabsTrigger value="identificacao">Identificação</TabsTrigger>
                    <TabsTrigger value="capacidade">Capacidade</TabsTrigger>
                    <TabsTrigger value="tecnicos">Dados Técnicos</TabsTrigger>
                    <TabsTrigger value="operacao">Operação/Comunicação</TabsTrigger>
                  </TabsList>

                  <TabsContent value="identificacao" className="space-y-4">
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
                  </TabsContent>

                  <TabsContent value="capacidade" className="space-y-4">
                    <div className="space-y-2">
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
                  </TabsContent>

                  <TabsContent value="tecnicos" className="space-y-4">
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
                  </TabsContent>

                  <TabsContent value="operacao" className="space-y-4">
                    <div className="space-y-2">
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
                    <div className="space-y-2">
                      <Label htmlFor="notes">Observações permanentes</Label>
                      <Textarea
                        id="notes"
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        rows={4}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
                <Button type="submit" className="w-full" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                </Button>
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
