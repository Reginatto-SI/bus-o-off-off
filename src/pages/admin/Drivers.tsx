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
  BadgeCheck,
  FileSpreadsheet,
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Power,
} from 'lucide-react';
import { toast } from 'sonner';
import { buildDebugToastMessage, logSupabaseError } from '@/lib/errorDebug';
import { cn } from '@/lib/utils';

interface DriverFilters {
  search: string;
  status: 'all' | 'ativo' | 'inativo';
  cnhCategory: string;
}

const initialFilters: DriverFilters = {
  search: '',
  status: 'all',
  cnhCategory: 'all',
};

export default function Drivers() {
  const { activeCompanyId, activeCompany, user } = useAuth();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<DriverFilters>(initialFilters);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
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

  // Máscara simples para CPF (000.000.000-00)
  const formatCpfInput = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9)
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  };

  // Máscara simples de telefone brasileiro (DD) 99999-9999
  const formatPhoneInput = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10)
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  // Data de referência para cálculos de CNH
  const today = useMemo(() => new Date(), []);
  const thirtyDaysFromNow = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date;
  }, []);

  // KPIs memoizados
  const stats = useMemo(() => {
    const total = drivers.length;
    const ativos = drivers.filter((d) => d.status === 'ativo').length;
    const inativos = drivers.filter((d) => d.status === 'inativo').length;
    const cnhsAtencao = drivers.filter((d) => {
      if (!d.cnh_expires_at) return false;
      const expiresAt = new Date(d.cnh_expires_at);
      return expiresAt <= thirtyDaysFromNow;
    }).length;
    return { total, ativos, inativos, cnhsAtencao };
  }, [drivers, thirtyDaysFromNow]);

  // Filtros aplicados
  const filteredDrivers = useMemo(() => {
    return drivers.filter((driver) => {
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          driver.name.toLowerCase().includes(searchLower) ||
          (driver.cpf?.includes(filters.search) ?? false) ||
          driver.phone.includes(filters.search);
        if (!matchesSearch) return false;
      }
      if (filters.status !== 'all' && driver.status !== filters.status) {
        return false;
      }
      if (filters.cnhCategory !== 'all' && driver.cnh_category !== filters.cnhCategory) {
        return false;
      }
      return true;
    });
  }, [drivers, filters]);

  const hasActiveFilters = useMemo(() => {
    return filters.search !== '' || filters.status !== 'all' || filters.cnhCategory !== 'all';
  }, [filters]);

  // Colunas de exportação
  const exportColumns: ExportColumn[] = useMemo(
    () => [
      { key: 'name', label: 'Nome' },
      { key: 'cpf', label: 'CPF', format: (v) => formatCpfInput(v ?? '') },
      { key: 'phone', label: 'Telefone', format: (v) => formatPhoneInput(v) },
      { key: 'cnh', label: 'CNH' },
      { key: 'cnh_category', label: 'Categoria CNH' },
      {
        key: 'cnh_expires_at',
        label: 'Validade CNH',
        format: (v) => (v ? new Date(v).toLocaleDateString('pt-BR') : ''),
      },
      { key: 'status', label: 'Status', format: (v) => (v === 'ativo' ? 'Ativo' : 'Inativo') },
      { key: 'notes', label: 'Observações' },
    ],
    []
  );

  const fetchDrivers = async () => {
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .order('name');

    if (error) {
      logSupabaseError({
        label: 'Erro ao carregar motoristas (drivers.select)',
        error,
        context: { action: 'select', table: 'drivers', companyId: activeCompanyId, userId: user?.id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao carregar motoristas',
          error,
          context: { action: 'select', table: 'drivers', companyId: activeCompanyId, userId: user?.id },
        })
      );
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
      const context = { action: editingId ? 'update' : 'insert', table: 'drivers', companyId: null, userId: user?.id };
      console.error('active_company_id ausente ao salvar motorista.', context);
      toast.error(
        buildDebugToastMessage({
          title: 'active_company_id ausente',
          context,
        })
      );
      setSaving(false);
      return;
    }

    const normalizedCpf = form.cpf.replace(/\D/g, '');
    const normalizedPhone = form.phone.replace(/\D/g, '');

    if (!form.name.trim()) {
      toast.error('Nome é obrigatório');
      setSaving(false);
      return;
    }

    if (!normalizedCpf) {
      toast.error('CPF é obrigatório');
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
      const { company_id, ...updateData } = driverData;
      ({ error } = await supabase.from('drivers').update(updateData).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('drivers').insert([driverData]));
    }

    if (error) {
      logSupabaseError({
        label: 'Erro ao salvar motorista (drivers.insert/update)',
        error,
        context: {
          action: editingId ? 'update' : 'insert',
          table: 'drivers',
          companyId: activeCompanyId,
          userId: user?.id,
          editingId,
          payload: driverData,
        },
      });
      const isDuplicateCpf = error.message.includes('unique') || error.message.includes('duplicate key');
      const fallbackMessage = isDuplicateCpf ? 'CPF já cadastrado' : 'Erro ao salvar motorista';
      toast.error(
        buildDebugToastMessage({
          title: fallbackMessage,
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

  const handleToggleStatus = async (driver: Driver) => {
    const nextStatus = driver.status === 'ativo' ? 'inativo' : 'ativo';
    const { error } = await supabase
      .from('drivers')
      .update({ status: nextStatus })
      .eq('id', driver.id);
    if (error) {
      logSupabaseError({
        label: 'Erro ao atualizar status do motorista (drivers.update)',
        error,
        context: { action: 'update', table: 'drivers', companyId: activeCompanyId, userId: user?.id, driverId: driver.id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao atualizar status',
          error,
          context: { action: 'update', table: 'drivers', companyId: activeCompanyId, userId: user?.id, driverId: driver.id },
        })
      );
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

  // Menu de ações por motorista
  const getDriverActions = (driver: Driver): ActionItem[] => [
    {
      label: 'Editar',
      icon: Pencil,
      onClick: () => handleEdit(driver),
    },
    {
      label: driver.status === 'ativo' ? 'Desativar' : 'Ativar',
      icon: Power,
      onClick: () => handleToggleStatus(driver),
      variant: driver.status === 'ativo' ? 'destructive' : 'default',
    },
  ];

  // Função para verificar status de CNH
  const getCnhStatusClass = (expiresAt: string | null) => {
    if (!expiresAt) return '';
    const expDate = new Date(expiresAt);
    if (expDate < today) return 'text-destructive font-medium';
    if (expDate <= thirtyDaysFromNow) return 'text-warning font-medium';
    return '';
  };

  return (
    <AdminLayout>
      <div className="page-container">
        {/* Cabeçalho */}
        <PageHeader
          title="Motoristas"
          description="Gerencie os motoristas cadastrados"
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
                    Adicionar Motorista
                  </Button>
                </DialogTrigger>
                {/* Ajuste necessário: modal estava alto e com scroll/footer inconsistentes.
                    Aplicamos o mesmo padrão do modal de Frota (/admin/frota), incluindo abas,
                    para controlar dimensões, rolagem interna e alinhamento do footer. */}
                <DialogContent className="admin-modal flex h-[90vh] max-h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 p-0">
                  <DialogHeader className="admin-modal__header px-6 py-4">
                    <DialogTitle>{editingId ? 'Editar' : 'Novo'} Motorista</DialogTitle>
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
                          value="cnh"
                          className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80"
                        >
                          <BadgeCheck className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 truncate">CNH</span>
                        </TabsTrigger>
                        <TabsTrigger
                          value="observacoes"
                          className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80"
                        >
                          <FileText className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 truncate">Observações</span>
                        </TabsTrigger>
                      </TabsList>

                      <div className="admin-modal__body flex-1 overflow-y-auto px-6 py-4">
                        <TabsContent value="identificacao" className="mt-0">
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
                                onChange={(e) =>
                                  setForm({ ...form, cpf: formatCpfInput(e.target.value) })
                                }
                                placeholder="000.000.000-00"
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="phone">Telefone</Label>
                              <Input
                                id="phone"
                                value={form.phone}
                                onChange={(e) =>
                                  setForm({ ...form, phone: formatPhoneInput(e.target.value) })
                                }
                                placeholder="(11) 99999-9999"
                                required
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
                          </div>
                        </TabsContent>

                        <TabsContent value="cnh" className="mt-0">
                          <div className="grid gap-4 sm:grid-cols-2">
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
                                onChange={(e) =>
                                  setForm({ ...form, cnh_category: e.target.value })
                                }
                                placeholder="A/B/C/D/E"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="cnh_expires_at">Validade CNH</Label>
                              <Input
                                id="cnh_expires_at"
                                type="date"
                                value={form.cnh_expires_at}
                                onChange={(e) =>
                                  setForm({ ...form, cnh_expires_at: e.target.value })
                                }
                              />
                            </div>
                          </div>
                        </TabsContent>

                        <TabsContent value="observacoes" className="mt-0">
                          <div className="grid gap-4 sm:grid-cols-2">
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

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatsCard label="Total de motoristas" value={stats.total} icon={Users} />
          <StatsCard label="Motoristas ativos" value={stats.ativos} icon={CheckCircle} variant="success" />
          <StatsCard label="Motoristas inativos" value={stats.inativos} icon={XCircle} variant="destructive" />
          <StatsCard label="CNHs atenção" value={stats.cnhsAtencao} icon={AlertTriangle} variant="warning" />
        </div>

        {/* Filtros */}
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
              onChange: (value) => setFilters({ ...filters, status: value as DriverFilters['status'] }),
              options: [
                { value: 'all', label: 'Todos' },
                { value: 'ativo', label: 'Ativo' },
                { value: 'inativo', label: 'Inativo' },
              ],
            },
            {
              id: 'cnhCategory',
              label: 'Categoria',
              placeholder: 'Categoria CNH',
              value: filters.cnhCategory,
              onChange: (value) => setFilters({ ...filters, cnhCategory: value }),
              options: [
                { value: 'all', label: 'Todas' },
                { value: 'A', label: 'A' },
                { value: 'B', label: 'B' },
                { value: 'C', label: 'C' },
                { value: 'D', label: 'D' },
                { value: 'E', label: 'E' },
                { value: 'AB', label: 'AB' },
                { value: 'AC', label: 'AC' },
                { value: 'AD', label: 'AD' },
                { value: 'AE', label: 'AE' },
              ],
            },
          ]}
          onClearFilters={() => setFilters(initialFilters)}
          hasActiveFilters={hasActiveFilters}
        />

        {/* Conteúdo */}
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
        ) : filteredDrivers.length === 0 ? (
          <EmptyState
            icon={<Users className="h-8 w-8 text-muted-foreground" />}
            title="Nenhum motorista encontrado"
            description="Ajuste os filtros para encontrar motoristas"
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
                    <TableHead>Nome</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Categoria CNH</TableHead>
                    <TableHead>Validade CNH</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDrivers.map((driver) => (
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
                      <TableCell>{driver.cnh_category ?? '-'}</TableCell>
                      <TableCell>
                        {driver.cnh_expires_at ? (
                          <span className={cn(getCnhStatusClass(driver.cnh_expires_at))}>
                            {new Date(driver.cnh_expires_at).toLocaleDateString('pt-BR')}
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={driver.status ?? 'ativo'} />
                      </TableCell>
                      <TableCell>
                        <ActionsDropdown actions={getDriverActions(driver)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Modais de Exportação */}
      <ExportExcelModal
        open={exportModalOpen}
        onOpenChange={setExportModalOpen}
        columns={exportColumns}
        data={filteredDrivers}
        storageKey="motoristas"
        fileName="motoristas"
        sheetName="Motoristas"
      />

      <ExportPDFModal
        open={pdfModalOpen}
        onOpenChange={setPdfModalOpen}
        columns={exportColumns}
        data={filteredDrivers}
        storageKey="motoristas"
        fileName="motoristas"
        title="Motoristas"
        company={activeCompany}
      />
    </AdminLayout>
  );
}
