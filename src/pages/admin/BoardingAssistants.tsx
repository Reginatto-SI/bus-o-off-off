import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Driver } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatsCard } from '@/components/admin/StatsCard';
import { FilterCard } from '@/components/admin/FilterCard';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Users,
  Plus,
  Loader2,
  Pencil,
  Phone,
  IdCard,
  FileSpreadsheet,
  FileText,
  CheckCircle,
  XCircle,
  Power,
  UserX,
  Link,
  BadgeCheck,
  MapPinned,
} from 'lucide-react';
import { toast } from 'sonner';
import { buildDebugToastMessage, logSupabaseError } from '@/lib/errorDebug';

interface BoardingAssistantFilters {
  search: string;
  status: 'all' | 'ativo' | 'inativo';
  linkedUser: 'all' | 'yes' | 'no';
}

const initialFilters: BoardingAssistantFilters = {
  search: '',
  status: 'all',
  linkedUser: 'all',
};

export default function BoardingAssistants() {
  const { activeCompanyId, activeCompany, user } = useAuth();
  const [assistants, setAssistants] = useState<Driver[]>([]);
  const [linkedAssistantIds, setLinkedAssistantIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<BoardingAssistantFilters>(initialFilters);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    cpf: '',
    rg: '',
    birth_date: '',
    phone: '',
    whatsapp: '',
    email: '',
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    status: 'ativo' as Driver['status'],
    emergency_contact_name: '',
    emergency_contact_phone: '',
    notes: '',
  });

  const formatCpfInput = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  };

  const formatPhoneInput = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const formatCepInput = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  };

  const stats = useMemo(() => {
    const total = assistants.length;
    const ativos = assistants.filter((a) => a.status === 'ativo').length;
    const inativos = assistants.filter((a) => a.status === 'inativo').length;
    const semUsuarioVinculado = assistants.filter((a) => !linkedAssistantIds.has(a.id)).length;
    return { total, ativos, inativos, semUsuarioVinculado };
  }, [assistants, linkedAssistantIds]);

  const filteredAssistants = useMemo(() => {
    return assistants.filter((assistant) => {
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          assistant.name.toLowerCase().includes(searchLower) ||
          (assistant.cpf?.includes(filters.search) ?? false) ||
          assistant.phone.includes(filters.search);
        if (!matchesSearch) return false;
      }

      if (filters.status !== 'all' && assistant.status !== filters.status) return false;

      if (filters.linkedUser === 'yes' && !linkedAssistantIds.has(assistant.id)) return false;
      if (filters.linkedUser === 'no' && linkedAssistantIds.has(assistant.id)) return false;

      return true;
    });
  }, [assistants, filters, linkedAssistantIds]);

  const hasActiveFilters = useMemo(() => {
    return filters.search !== '' || filters.status !== 'all' || filters.linkedUser !== 'all';
  }, [filters]);

  const exportColumns: ExportColumn[] = useMemo(
    () => [
      { key: 'name', label: 'Nome' },
      { key: 'cpf', label: 'CPF', format: (v) => formatCpfInput(v ?? '') },
      { key: 'phone', label: 'Telefone', format: (v) => formatPhoneInput(v) },
      { key: 'email', label: 'E-mail' },
      { key: 'status', label: 'Status', format: (v) => (v === 'ativo' ? 'Ativo' : 'Inativo') },
      {
        key: 'id',
        label: 'Usuário vinculado',
        format: (id) => (linkedAssistantIds.has(id) ? 'Sim' : 'Não'),
      },
      { key: 'notes', label: 'Observações' },
    ],
    [linkedAssistantIds]
  );

  const fetchLinkedUsers = async () => {
    if (!activeCompanyId) return;

    const { data, error } = await supabase
      .from('user_roles')
      .select('driver_id')
      .eq('company_id', activeCompanyId)
      .eq('role', 'motorista')
      .eq('operational_role', 'auxiliar_embarque')
      .not('driver_id', 'is', null);

    if (error) {
      logSupabaseError({
        label: 'Erro ao carregar vínculos de auxiliares (user_roles.select)',
        error,
        context: { action: 'select', table: 'user_roles', companyId: activeCompanyId, userId: user?.id },
      });
      return;
    }

    setLinkedAssistantIds(new Set((data ?? []).map((item) => item.driver_id as string)));
  };

  const fetchAssistants = async () => {
    if (!activeCompanyId) return;

    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .eq('company_id', activeCompanyId)
      .eq('operational_role', 'auxiliar_embarque')
      .order('name');

    if (error) {
      logSupabaseError({
        label: 'Erro ao carregar auxiliares de embarque (drivers.select)',
        error,
        context: { action: 'select', table: 'drivers', companyId: activeCompanyId, userId: user?.id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao carregar auxiliares de embarque',
          error,
          context: { action: 'select', table: 'drivers', companyId: activeCompanyId, userId: user?.id },
        })
      );
    } else {
      setAssistants(data as Driver[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!activeCompanyId) return;

    setLoading(true);
    Promise.all([fetchAssistants(), fetchLinkedUsers()]).finally(() => setLoading(false));
  }, [activeCompanyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    if (!activeCompanyId) {
      const context = { action: editingId ? 'update' : 'insert', table: 'drivers', companyId: null, userId: user?.id };
      console.error('active_company_id ausente ao salvar auxiliar de embarque.', context);
      toast.error(buildDebugToastMessage({ title: 'active_company_id ausente', context }));
      setSaving(false);
      return;
    }

    const normalizedCpf = form.cpf.replace(/\D/g, '');
    const normalizedPhone = form.phone.replace(/\D/g, '');
    const normalizedWhatsapp = form.whatsapp.replace(/\D/g, '') || null;
    const normalizedCep = form.cep.replace(/\D/g, '') || null;
    const normalizedEmergencyPhone = form.emergency_contact_phone.replace(/\D/g, '') || null;

    if (!form.name.trim()) {
      toast.error('Nome completo é obrigatório');
      setSaving(false);
      return;
    }

    if (normalizedCpf.length !== 11) {
      toast.error('CPF inválido');
      setSaving(false);
      return;
    }

    if (!normalizedPhone) {
      toast.error('Telefone é obrigatório');
      setSaving(false);
      return;
    }

    const assistantData = {
      name: form.name.trim(),
      cpf: normalizedCpf,
      rg: form.rg.trim() || null,
      birth_date: form.birth_date || null,
      phone: normalizedPhone,
      whatsapp: normalizedWhatsapp,
      email: form.email.trim() || null,
      cep: normalizedCep,
      street: form.street.trim() || null,
      number: form.number.trim() || null,
      complement: form.complement.trim() || null,
      neighborhood: form.neighborhood.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      emergency_contact_name: form.emergency_contact_name.trim() || null,
      emergency_contact_phone: normalizedEmergencyPhone,
      notes: form.notes.trim() || null,
      status: form.status,
      cnh: 'NAO_APLICAVEL',
      operational_role: 'auxiliar_embarque',
      company_id: activeCompanyId,
    };

    let error;
    if (editingId) {
      const { company_id, ...updateData } = assistantData;
      ({ error } = await supabase.from('drivers').update(updateData).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('drivers').insert([assistantData]));
    }

    if (error) {
      logSupabaseError({
        label: 'Erro ao salvar auxiliar de embarque (drivers.insert/update)',
        error,
        context: {
          action: editingId ? 'update' : 'insert',
          table: 'drivers',
          companyId: activeCompanyId,
          userId: user?.id,
          editingId,
        },
      });
      const isDuplicateCpf = error.message.includes('unique') || error.message.includes('duplicate key');
      toast.error(
        buildDebugToastMessage({
          title: isDuplicateCpf ? 'CPF já cadastrado' : 'Erro ao salvar auxiliar de embarque',
          error,
          context: {
            action: editingId ? 'update' : 'insert',
            table: 'drivers',
            companyId: activeCompanyId,
            userId: user?.id,
            editingId,
          },
        })
      );
      setSaving(false);
      return;
    }

    toast.success(editingId ? 'Auxiliar de embarque atualizado' : 'Auxiliar de embarque cadastrado');
    setDialogOpen(false);
    resetForm();
    await Promise.all([fetchAssistants(), fetchLinkedUsers()]);
    setSaving(false);
  };

  const handleEdit = (assistant: Driver) => {
    setEditingId(assistant.id);
    setForm({
      name: assistant.name,
      cpf: formatCpfInput(assistant.cpf ?? ''),
      rg: assistant.rg ?? '',
      birth_date: assistant.birth_date ?? '',
      phone: formatPhoneInput(assistant.phone),
      whatsapp: formatPhoneInput(assistant.whatsapp ?? ''),
      email: assistant.email ?? '',
      cep: formatCepInput(assistant.cep ?? ''),
      street: assistant.street ?? '',
      number: assistant.number ?? '',
      complement: assistant.complement ?? '',
      neighborhood: assistant.neighborhood ?? '',
      city: assistant.city ?? '',
      state: assistant.state ?? '',
      status: assistant.status ?? 'ativo',
      emergency_contact_name: assistant.emergency_contact_name ?? '',
      emergency_contact_phone: formatPhoneInput(assistant.emergency_contact_phone ?? ''),
      notes: assistant.notes ?? '',
    });
    setDialogOpen(true);
  };

  const handleToggleStatus = async (assistant: Driver) => {
    const nextStatus = assistant.status === 'ativo' ? 'inativo' : 'ativo';
    const { error } = await supabase.from('drivers').update({ status: nextStatus }).eq('id', assistant.id);

    if (error) {
      logSupabaseError({
        label: 'Erro ao atualizar status do auxiliar de embarque (drivers.update)',
        error,
        context: { action: 'update', table: 'drivers', companyId: activeCompanyId, userId: user?.id, driverId: assistant.id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao atualizar status',
          error,
          context: { action: 'update', table: 'drivers', companyId: activeCompanyId, userId: user?.id, driverId: assistant.id },
        })
      );
      return;
    }

    toast.success(`Auxiliar de embarque ${nextStatus === 'ativo' ? 'ativado' : 'desativado'}`);
    await fetchAssistants();
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({
      name: '',
      cpf: '',
      rg: '',
      birth_date: '',
      phone: '',
      whatsapp: '',
      email: '',
      cep: '',
      street: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: '',
      status: 'ativo',
      emergency_contact_name: '',
      emergency_contact_phone: '',
      notes: '',
    });
  };

  const getActions = (assistant: Driver): ActionItem[] => [
    {
      label: 'Editar',
      icon: Pencil,
      onClick: () => handleEdit(assistant),
    },
    {
      label: assistant.status === 'ativo' ? 'Desativar' : 'Ativar',
      icon: Power,
      onClick: () => handleToggleStatus(assistant),
      variant: assistant.status === 'ativo' ? 'destructive' : 'default',
    },
  ];

  return (
    <AdminLayout>
      <div className="page-container">
        <PageHeader
          title="Auxiliares de Embarque"
          description="Gerencie o cadastro operacional dos auxiliares de embarque"
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => setExportModalOpen(true)}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPdfModalOpen(true)}>
                <FileText className="h-4 w-4 mr-2" />
                PDF
              </Button>
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
                    Adicionar Auxiliar
                  </Button>
                </DialogTrigger>
                <DialogContent className="admin-modal flex h-[90vh] max-h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 p-0">
                  <DialogHeader className="admin-modal__header px-6 py-4">
                    <DialogTitle>{editingId ? 'Editar' : 'Novo'} Auxiliar de Embarque</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
                    <Tabs defaultValue="dados-pessoais" className="flex h-full min-h-0 flex-col">
                      <TabsList className="admin-modal__tabs flex h-auto w-full flex-wrap justify-start gap-1 px-6 py-2">
                        {/* Mantém o padrão visual de abas do admin (ícone + texto) sem criar novos componentes. */}
                        <TabsTrigger
                          value="dados-pessoais"
                          className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80"
                        >
                          <IdCard className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 truncate">Dados pessoais</span>
                        </TabsTrigger>
                        <TabsTrigger
                          value="contato-endereco"
                          className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80"
                        >
                          <MapPinned className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 truncate">Contato e endereço</span>
                        </TabsTrigger>
                        <TabsTrigger
                          value="dados-operacionais"
                          className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80"
                        >
                          <BadgeCheck className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 truncate">Dados operacionais</span>
                        </TabsTrigger>
                      </TabsList>

                      <div className="admin-modal__body flex-1 overflow-y-auto px-6 py-4 min-h-0">
                        <TabsContent value="dados-pessoais" className="mt-0">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2 sm:col-span-2">
                              <Label htmlFor="name">Nome completo</Label>
                              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
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
                              <Label htmlFor="rg">RG</Label>
                              <Input id="rg" value={form.rg} onChange={(e) => setForm({ ...form, rg: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="birth_date">Data de nascimento</Label>
                              <Input id="birth_date" type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
                            </div>
                          </div>
                        </TabsContent>

                        <TabsContent value="contato-endereco" className="mt-0">
                          {/* Reorganização em 3 colunas no desktop para compactar a aba e reduzir o estouro visual. */}
                          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                              <Label htmlFor="whatsapp">WhatsApp</Label>
                              <Input
                                id="whatsapp"
                                value={form.whatsapp}
                                onChange={(e) => setForm({ ...form, whatsapp: formatPhoneInput(e.target.value) })}
                                placeholder="(11) 99999-9999"
                              />
                            </div>
                            <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                              <Label htmlFor="cep">CEP</Label>
                              <Input id="cep" value={form.cep} onChange={(e) => setForm({ ...form, cep: formatCepInput(e.target.value) })} placeholder="00000-000" />
                            </div>
                            <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                              <Label htmlFor="email">E-mail</Label>
                              <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                            </div>
                            <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                              <Label htmlFor="street">Logradouro</Label>
                              <Input id="street" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="number">Número</Label>
                              <Input id="number" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="complement">Complemento</Label>
                              <Input id="complement" value={form.complement} onChange={(e) => setForm({ ...form, complement: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="neighborhood">Bairro</Label>
                              <Input id="neighborhood" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="city">Cidade</Label>
                              <Input id="city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="state">UF</Label>
                              <Input id="state" value={form.state} maxLength={2} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} />
                            </div>
                          </div>
                        </TabsContent>

                        <TabsContent value="dados-operacionais" className="mt-0">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Status</Label>
                              <Select
                                value={form.status}
                                onValueChange={(value: Driver['status']) => setForm({ ...form, status: value })}
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
                            <div className="space-y-2">
                              <Label htmlFor="emergency_contact_name">Contato de emergência</Label>
                              <Input
                                id="emergency_contact_name"
                                value={form.emergency_contact_name}
                                onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="emergency_contact_phone">Telefone de emergência</Label>
                              <Input
                                id="emergency_contact_phone"
                                value={form.emergency_contact_phone}
                                onChange={(e) => setForm({ ...form, emergency_contact_phone: formatPhoneInput(e.target.value) })}
                                placeholder="(11) 99999-9999"
                              />
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                              <Label htmlFor="notes">Observações</Label>
                              <Textarea id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={4} />
                            </div>
                          </div>
                        </TabsContent>
                      </div>
                    </Tabs>

                    <div className="admin-modal__footer px-6 py-4">
                      <div className="flex flex-wrap justify-end gap-3">
                        <DialogClose asChild>
                          <Button type="button" variant="outline">Cancelar</Button>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatsCard label="Total de auxiliares" value={stats.total} icon={Users} />
          <StatsCard label="Auxiliares ativos" value={stats.ativos} icon={CheckCircle} variant="success" />
          <StatsCard label="Auxiliares inativos" value={stats.inativos} icon={XCircle} variant="destructive" />
          <StatsCard label="Sem usuário vinculado" value={stats.semUsuarioVinculado} icon={UserX} variant="warning" />
        </div>

        <FilterCard
          className="mb-6"
          searchValue={filters.search}
          onSearchChange={(value) => setFilters({ ...filters, search: value })}
          searchPlaceholder="Pesquisar por nome, CPF ou telefone..."
          selects={[
            {
              id: 'status',
              label: 'Status',
              placeholder: 'Status',
              value: filters.status,
              onChange: (value) => setFilters({ ...filters, status: value as BoardingAssistantFilters['status'] }),
              options: [
                { value: 'all', label: 'Todos' },
                { value: 'ativo', label: 'Ativo' },
                { value: 'inativo', label: 'Inativo' },
              ],
            },
            {
              id: 'linked-user',
              label: 'Vinculado a usuário',
              placeholder: 'Vinculado',
              value: filters.linkedUser,
              onChange: (value) => setFilters({ ...filters, linkedUser: value as BoardingAssistantFilters['linkedUser'] }),
              options: [
                { value: 'all', label: 'Todos' },
                { value: 'yes', label: 'Sim' },
                { value: 'no', label: 'Não' },
              ],
            },
          ]}
          onClearFilters={() => setFilters(initialFilters)}
          hasActiveFilters={hasActiveFilters}
        />

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : assistants.length === 0 ? (
          <EmptyState
            icon={<Users className="h-8 w-8 text-muted-foreground" />}
            title="Nenhum auxiliar de embarque cadastrado"
            description="Adicione auxiliares para gestão operacional"
            action={
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Auxiliar
              </Button>
            }
          />
        ) : filteredAssistants.length === 0 ? (
          <EmptyState
            icon={<Users className="h-8 w-8 text-muted-foreground" />}
            title="Nenhum auxiliar encontrado"
            description="Ajuste os filtros para encontrar auxiliares"
            action={<Button variant="outline" onClick={() => setFilters(initialFilters)}>Limpar filtros</Button>}
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
                    <TableHead>E-mail</TableHead>
                    <TableHead>Vinculado</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssistants.map((assistant) => (
                    <TableRow key={assistant.id}>
                      <TableCell className="font-medium">{assistant.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <IdCard className="h-4 w-4 text-muted-foreground" />
                          {formatCpfInput(assistant.cpf ?? '')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          {formatPhoneInput(assistant.phone)}
                        </div>
                      </TableCell>
                      <TableCell>{assistant.email ?? '-'}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-2 text-sm">
                          <Link className="h-4 w-4 text-muted-foreground" />
                          {linkedAssistantIds.has(assistant.id) ? 'Sim' : 'Não'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={assistant.status ?? 'ativo'} />
                      </TableCell>
                      <TableCell>
                        <ActionsDropdown actions={getActions(assistant)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <ExportExcelModal
        open={exportModalOpen}
        onOpenChange={setExportModalOpen}
        columns={exportColumns}
        data={filteredAssistants}
        storageKey="auxiliares-embarque"
        fileName="auxiliares-embarque"
        sheetName="AuxiliaresEmbarque"
      />

      <ExportPDFModal
        open={pdfModalOpen}
        onOpenChange={setPdfModalOpen}
        columns={exportColumns}
        data={filteredAssistants}
        storageKey="auxiliares-embarque"
        fileName="auxiliares-embarque"
        title="Auxiliares de Embarque"
        company={activeCompany}
      />
    </AdminLayout>
  );
}
