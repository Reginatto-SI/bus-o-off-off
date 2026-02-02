import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Driver } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
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
  Users,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Phone,
  CreditCard,
  IdCard,
  CircleMinus,
  CirclePlus,
} from 'lucide-react';
import { toast } from 'sonner';

export default function Drivers() {
  const { activeCompanyId } = useAuth();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    cpf: '',
    cnh: '',
    cnh_category: '',
    cnh_expires_at: '',
    notes: '',
    status: 'ativo' as Driver['status'],
  });

  // Comentário: máscara simples para CPF (000.000.000-00) mantendo apenas dígitos.
  const formatCpfInput = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9)
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  };

  // Comentário: máscara simples de telefone brasileiro (DD) 99999-9999.
  const formatPhoneInput = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10)
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const fetchDrivers = async () => {
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .order('name');

    if (error) {
      // Comentário: log detalhado para diagnosticar falhas de leitura sem expor no toast.
      console.error('Erro ao carregar motoristas (drivers.select)', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      toast.error('Erro ao carregar motoristas');
    } else {
      setDrivers(data as Driver[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDrivers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    if (!activeCompanyId) {
      toast.error('Nenhuma empresa ativa');
      setSaving(false);
      return;
    }

    const normalizedCpf = form.cpf.replace(/\D/g, '');
    const normalizedPhone = form.phone.replace(/\D/g, '');

    if (!form.name.trim()) {
      // Comentário: validação obrigatória de nome no cadastro.
      toast.error('Nome é obrigatório');
      setSaving(false);
      return;
    }

    if (!normalizedCpf) {
      // Comentário: validação obrigatória de CPF com feedback claro.
      toast.error('CPF é obrigatório');
      setSaving(false);
      return;
    }

    if (normalizedCpf.length !== 11) {
      // Comentário: validação simples de tamanho do CPF antes de enviar ao Supabase.
      toast.error('CPF inválido');
      setSaving(false);
      return;
    }

    if (!normalizedPhone) {
      // Comentário: validação obrigatória de telefone com feedback claro.
      toast.error('Telefone é obrigatório');
      setSaving(false);
      return;
    }

    const driverData = {
      name: form.name.trim(),
      phone: normalizedPhone,
      cpf: normalizedCpf,
      cnh: form.cnh.trim(),
      cnh_category: form.cnh_category.trim() || null,
      cnh_expires_at: form.cnh_expires_at || null,
      notes: form.notes.trim() || null,
      status: form.status,
      company_id: activeCompanyId,
    };

    let error;
    if (editingId) {
      // Não atualiza company_id na edição
      const { company_id, ...updateData } = driverData;
      ({ error } = await supabase.from('drivers').update(updateData).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('drivers').insert([driverData]));
    }

    if (error) {
      // Comentário: log detalhado para identificar RLS/constraints (ex.: CPF duplicado).
      console.error('Erro ao salvar motorista (drivers.insert/update)', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        editingId,
        payload: driverData,
      });
      const isDuplicateCpf = error.message.includes('unique') || error.message.includes('duplicate key');
      toast.error(isDuplicateCpf ? 'CPF já cadastrado' : 'Erro ao salvar motorista');
    } else {
      toast.success(editingId ? 'Motorista atualizado' : 'Motorista cadastrado');
      setDialogOpen(false);
      resetForm();
      fetchDrivers();
    }
    setSaving(false);
  };

  const handleEdit = (driver: Driver) => {
    setEditingId(driver.id);
    // Comentário: mapeia campos novos para edição, mantendo máscaras visuais.
    setForm({
      name: driver.name,
      phone: formatPhoneInput(driver.phone),
      cpf: formatCpfInput(driver.cpf ?? ''),
      cnh: driver.cnh,
      cnh_category: driver.cnh_category ?? '',
      cnh_expires_at: driver.cnh_expires_at ?? '',
      notes: driver.notes ?? '',
      status: driver.status ?? 'ativo',
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('drivers').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao excluir motorista');
    } else {
      toast.success('Motorista excluído');
      fetchDrivers();
    }
  };

  const handleToggleStatus = async (driver: Driver) => {
    const nextStatus = driver.status === 'ativo' ? 'inativo' : 'ativo';
    const { error } = await supabase
      .from('drivers')
      .update({ status: nextStatus })
      .eq('id', driver.id);
    if (error) {
      toast.error('Erro ao atualizar status');
    } else {
      toast.success(`Motorista ${nextStatus === 'ativo' ? 'ativado' : 'desativado'}`);
      fetchDrivers();
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({
      name: '',
      phone: '',
      cpf: '',
      cnh: '',
      cnh_category: '',
      cnh_expires_at: '',
      notes: '',
      status: 'ativo',
    });
  };

  return (
    <AdminLayout>
      <div className="page-container">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Motoristas</h1>
            <p className="text-muted-foreground">Gerencie os motoristas cadastrados</p>
          </div>

          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Motorista
              </Button>
            </DialogTrigger>
            {/* Admin Modal UI: aplica shell do modal de Veículos sem alterar responsividade */}
            <DialogContent className="admin-modal flex h-[90vh] max-h-[90vh] w-[95vw] max-w-4xl flex-col gap-0 p-0">
              {/* Admin Modal UI: header padronizado com separação sutil */}
              <DialogHeader className="admin-modal__header px-6 py-4">
                <DialogTitle>{editingId ? 'Editar' : 'Novo'} Motorista</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="flex h-full flex-col">
                {/* Admin Modal UI: body com grid 2 colunas e scroll interno */}
                <div className="admin-modal__body flex-1 overflow-y-auto px-6 py-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="name">Nome</Label>
                      <Input
                        id="name"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cpf">CPF</Label>
                      <Input
                        id="cpf"
                        value={form.cpf}
                        onChange={(e) => setForm({ ...form, cpf: formatCpfInput(e.target.value) })}
                        placeholder="000.000.000-00"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefone</Label>
                      <Input
                        id="phone"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: formatPhoneInput(e.target.value) })}
                        placeholder="(11) 99999-9999"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cnh">CNH</Label>
                      <Input
                        id="cnh"
                        value={form.cnh}
                        onChange={(e) => setForm({ ...form, cnh: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cnh_category">Categoria CNH</Label>
                      <Input
                        id="cnh_category"
                        value={form.cnh_category}
                        onChange={(e) => setForm({ ...form, cnh_category: e.target.value })}
                        placeholder="A/B/C/D/E"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cnh_expires_at">Validade CNH</Label>
                      <Input
                        id="cnh_expires_at"
                        type="date"
                        value={form.cnh_expires_at}
                        onChange={(e) => setForm({ ...form, cnh_expires_at: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select
                        value={form.status}
                        onValueChange={(value: Driver['status']) =>
                          setForm({ ...form, status: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ativo">Ativo</SelectItem>
                          <SelectItem value="inativo">Inativo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="notes">Observações</Label>
                      <Textarea
                        id="notes"
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        rows={4}
                      />
                    </div>
                  </div>
                </div>
                {/* Admin Modal UI: footer com botões alinhados à direita */}
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
        ) : drivers.length === 0 ? (
          <EmptyState
            icon={<Users className="h-8 w-8 text-muted-foreground" />}
            title="Nenhum motorista cadastrado"
            description="Adicione motoristas para atribuir às viagens"
            action={
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Motorista
              </Button>
            }
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>CNH</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[120px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drivers.map((driver) => (
                    <TableRow key={driver.id}>
                      <TableCell className="font-medium">{driver.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <IdCard className="h-4 w-4 text-muted-foreground" />
                          {formatCpfInput(driver.cpf ?? '')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          {formatPhoneInput(driver.phone)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-muted-foreground" />
                          {driver.cnh}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={driver.status ?? 'ativo'} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(driver)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggleStatus(driver)}
                          >
                            {driver.status === 'ativo' ? (
                              <CircleMinus className="h-4 w-4 text-destructive" />
                            ) : (
                              <CirclePlus className="h-4 w-4 text-primary" />
                            )}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(driver.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
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
