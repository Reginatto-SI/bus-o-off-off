import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  Service,
  ServiceControlType,
  ServiceStatus,
  ServiceUnitType,
} from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AdminMobileBottomNav } from '@/components/layout/AdminMobileBottomNav';
import { AdminMobileHeader } from '@/components/layout/AdminMobileHeader';
import { AdminMobileMoreMenu } from '@/components/layout/AdminMobileMoreMenu';
import { adminMobileBottomNavItems } from '@/components/layout/adminMobileBottomNavItems';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/admin/PageHeader';
import { FilterCard } from '@/components/admin/FilterCard';
import { ActionsDropdown, ActionItem } from '@/components/admin/ActionsDropdown';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  Loader2,
  Pencil,
  Plus,
  Power,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { buildDebugToastMessage, logSupabaseError } from '@/lib/errorDebug';

// =====================================================================
// /admin/servicos — Cadastro base de Passeios & Serviços
// Reutiliza a entidade `companies` como Agência (sem nova entidade).
// Esta etapa NÃO implementa venda, checkout, QR ou validação.
// =====================================================================

const UNIT_TYPE_LABELS: Record<ServiceUnitType, string> = {
  pessoa: 'Pessoa',
  veiculo: 'Veículo',
  unitario: 'Unitário',
};

// Mapeamento de nomenclatura com o PRD:
// - PRD "tipo_controle" => coluna/contrato técnico "control_type".
const CONTROL_TYPE_LABELS: Record<ServiceControlType, string> = {
  validacao_obrigatoria: 'Com validação',
  sem_validacao: 'Sem validação',
};

interface ServiceFilters {
  search: string;
  status: 'all' | ServiceStatus;
  unit_type: 'all' | ServiceUnitType;
}

const initialFilters: ServiceFilters = {
  search: '',
  status: 'all',
  unit_type: 'all',
};

interface ServiceFormState {
  name: string;
  description: string;
  unit_type: ServiceUnitType;
  control_type: ServiceControlType;
  // PRD "ativo/inativo": em services este estado técnico é persistido em `status`.
  status: ServiceStatus;
}

const emptyForm: ServiceFormState = {
  name: '',
  description: '',
  unit_type: 'unitario',
  control_type: 'sem_validacao',
  status: 'ativo',
};

export default function Services() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isGerente, isDeveloper, activeCompanyId, user, loading: authLoading } = useAuth();

  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceFormState>(emptyForm);
  const [filters, setFilters] = useState<ServiceFilters>(initialFilters);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [returnEventBelongsToCompany, setReturnEventBelongsToCompany] = useState(false);
  const [mobileMoreMenuOpen, setMobileMoreMenuOpen] = useState(false);
  const autoCreateProcessedRef = useRef(false);

  const canManage = isGerente || isDeveloper;
  const returnEventId = searchParams.get('eventId') ?? '';
  const returnToServiceSales = searchParams.get('returnTo') === '/vendas/servicos'
    ? `/vendas/servicos${returnEventId ? `?eventId=${returnEventId}` : ''}`
    : null;
  const linkServiceToEventUrl = returnEventId
    ? `/admin/eventos/${returnEventId}?tab=services&returnTo=/vendas/servicos&eventId=${returnEventId}`
    : null;

  const fetchServices = async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    // Isolamento multiempresa: nunca consultar sem company_id (regra obrigatória do projeto).
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('company_id', activeCompanyId)
      .order('created_at', { ascending: false });

    if (error) {
      logSupabaseError({
        label: 'Erro ao carregar serviços',
        error,
        context: { action: 'select', table: 'services', userId: user?.id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao carregar serviços',
          error,
          context: { action: 'select', table: 'services' },
        }),
      );
    } else {
      setServices((data ?? []) as Service[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId]);

  useEffect(() => {
    async function validateReturnEvent() {
      if (!activeCompanyId || !returnEventId) {
        setReturnEventBelongsToCompany(false);
        return;
      }

      const { data, error } = await supabase
        .from('events')
        .select('id')
        .eq('id', returnEventId)
        .eq('company_id', activeCompanyId)
        .maybeSingle();

      if (error) {
        setReturnEventBelongsToCompany(false);
        return;
      }
      setReturnEventBelongsToCompany(Boolean(data));
    }

    validateReturnEvent();
  }, [activeCompanyId, returnEventId]);

  useEffect(() => {
    if (autoCreateProcessedRef.current) return;
    if (searchParams.get('action') !== 'create') return;
    if (!canManage || !activeCompanyId) return;

    autoCreateProcessedRef.current = true;
    openCreate();
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('action');
    setSearchParams(nextParams, { replace: true });
  }, [activeCompanyId, canManage, searchParams, setSearchParams]);

  const filtered = useMemo(() => {
    return services.filter((s) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hit =
          s.name.toLowerCase().includes(q) ||
          (s.description ?? '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (filters.status !== 'all' && s.status !== filters.status) return false;
      if (filters.unit_type !== 'all' && s.unit_type !== filters.unit_type) return false;
      return true;
    });
  }, [services, filters]);

  const hasActiveFilters =
    filters.search !== '' || filters.status !== 'all' || filters.unit_type !== 'all';

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (service: Service) => {
    setEditingId(service.id);
    setForm({
      name: service.name,
      description: service.description ?? '',
      unit_type: service.unit_type,
      control_type: service.control_type,
      status: service.status,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!activeCompanyId) {
      toast.error('Empresa ativa não identificada.');
      return;
    }
    const name = form.name.trim();
    if (!name) {
      toast.error('Informe o nome do serviço.');
      return;
    }

    setSaving(true);
    const payload = {
      company_id: activeCompanyId,
      name,
      description: form.description.trim() || null,
      unit_type: form.unit_type,
      control_type: form.control_type,
      status: form.status,
    };

    if (editingId) {
      const { error } = await supabase
        .from('services')
        .update(payload)
        .eq('id', editingId)
        .eq('company_id', activeCompanyId);

      if (error) {
        logSupabaseError({
          label: 'Erro ao atualizar serviço',
          error,
          context: { action: 'update', table: 'services', recordId: editingId },
        });
        toast.error(
          buildDebugToastMessage({
            title: 'Erro ao atualizar serviço',
            error,
            context: { action: 'update', table: 'services' },
          }),
        );
      } else {
        toast.success('Serviço atualizado.');
        setDialogOpen(false);
        await fetchServices();
      }
    } else {
      const { error } = await supabase.from('services').insert(payload);

      if (error) {
        logSupabaseError({
          label: 'Erro ao criar serviço',
          error,
          context: { action: 'insert', table: 'services' },
        });
        toast.error(
          buildDebugToastMessage({
            title: 'Erro ao criar serviço',
            error,
            context: { action: 'insert', table: 'services' },
          }),
        );
      } else {
        if (returnToServiceSales) {
          toast.success('Serviço cadastrado com sucesso', {
            description: returnEventBelongsToCompany && linkServiceToEventUrl && canManage
              ? 'Agora vincule o serviço ao evento para disponibilizá-lo na venda.'
              : 'Agora solicite a um administrador que vincule o serviço ao evento para disponibilizá-lo na venda.',
            action: returnEventBelongsToCompany && linkServiceToEventUrl && canManage
              ? {
                  label: 'Vincular ao evento',
                  onClick: () => navigate(linkServiceToEventUrl),
                }
              : undefined,
          });
        } else {
          toast.success('Serviço cadastrado.');
        }
        setDialogOpen(false);
        await fetchServices();
      }
    }
    setSaving(false);
  };

  // Mantém uma única fonte de ações para a tabela desktop e os cards mobile.
  const getServiceActions = (service: Service): ActionItem[] => [
    { label: 'Editar', icon: Pencil, onClick: () => openEdit(service) },
    {
      label: service.status === 'ativo' ? 'Inativar' : 'Ativar',
      icon: Power,
      onClick: () => toggleStatus(service),
    },
    {
      label: 'Excluir',
      icon: Trash2,
      variant: 'destructive',
      onClick: () => setConfirmDeleteId(service.id),
    },
  ];

  const toggleStatus = async (service: Service) => {
    if (!activeCompanyId) return;
    const newStatus: ServiceStatus = service.status === 'ativo' ? 'inativo' : 'ativo';
    const { error } = await supabase
      .from('services')
      .update({ status: newStatus })
      .eq('id', service.id)
      .eq('company_id', activeCompanyId);

    if (error) {
      logSupabaseError({
        label: 'Erro ao alterar status do serviço',
        error,
        context: { action: 'update', table: 'services', recordId: service.id },
      });
      toast.error('Não foi possível alterar o status.');
      return;
    }
    toast.success(newStatus === 'ativo' ? 'Serviço ativado.' : 'Serviço inativado.');
    fetchServices();
  };

  const handleDelete = async () => {
    if (!confirmDeleteId || !activeCompanyId) return;
    const { error } = await supabase
      .from('services')
      .delete()
      .eq('id', confirmDeleteId)
      .eq('company_id', activeCompanyId);

    if (error) {
      logSupabaseError({
        label: 'Erro ao excluir serviço',
        error,
        context: { action: 'delete', table: 'services', recordId: confirmDeleteId },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Não foi possível excluir',
          error,
          context: { action: 'delete', table: 'services' },
        }),
      );
    } else {
      toast.success('Serviço excluído.');
      fetchServices();
    }
    setConfirmDeleteId(null);
  };

  // Guard de acesso: somente gerente/developer (mesmo padrão das telas restritas).
  if (authLoading) {
    return (
      <AdminLayout>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }
  if (!canManage) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return (
    <AdminLayout>
      {/* Mobile usa chrome próprio; em lg+ o PageHeader e a tabela desktop permanecem preservados. */}
      <div className="min-h-screen bg-slate-50 pb-24 lg:bg-transparent lg:pb-0">
        <div className="lg:hidden">
          <AdminMobileHeader
            title="Serviços"
            subtitle="Cadastros disponíveis para venda"
            showMenuButton={false}
          />
        </div>

        <div className="page-container max-w-md space-y-4 px-3 py-4 sm:px-6 md:max-w-3xl lg:max-w-7xl lg:space-y-6 lg:px-8 lg:py-6">
          <div className="hidden lg:block">
            <PageHeader
              title="Passeios & Serviços"
              description="Cadastre os serviços (passeios, atrações, transfers) que sua agência poderá vincular aos eventos."
              actions={
                <div className="flex flex-wrap gap-2">
                  {returnToServiceSales && (
                    <Button type="button" variant="outline" onClick={() => navigate(returnToServiceSales)}>
                      Voltar para Venda de Serviços
                    </Button>
                  )}
                  <Button onClick={openCreate} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Novo serviço
                  </Button>
                </div>
              }
            />
          </div>

          <div className="flex flex-col gap-2 min-[360px]:flex-row lg:hidden">
            {returnToServiceSales && (
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(returnToServiceSales)}
                className="h-11 w-full shrink-0 px-3 text-xs min-[360px]:w-auto"
              >
                Voltar
              </Button>
            )}
            <Button onClick={openCreate} className="h-11 min-w-0 flex-1 gap-2 rounded-2xl text-sm font-semibold">
              <Plus className="h-4 w-4 shrink-0" />
              <span className="truncate">Adicionar serviço</span>
            </Button>
          </div>

          <div className="space-y-4 lg:space-y-6">
            <FilterCard
              searchValue={filters.search}
              onSearchChange={(v) => setFilters((f) => ({ ...f, search: v }))}
              searchPlaceholder="Buscar por nome ou descrição..."
              selects={[
                {
                  id: 'status',
                  label: 'Status',
                  placeholder: 'Todos',
                  value: filters.status,
                  onChange: (v) =>
                    setFilters((f) => ({ ...f, status: v as ServiceFilters['status'] })),
                  options: [
                    { value: 'all', label: 'Todos' },
                    { value: 'ativo', label: 'Ativo' },
                    { value: 'inativo', label: 'Inativo' },
                  ],
                },
                {
                  id: 'unit_type',
                  label: 'Tipo de unidade',
                  placeholder: 'Todos',
                  value: filters.unit_type,
                  onChange: (v) =>
                    setFilters((f) => ({ ...f, unit_type: v as ServiceFilters['unit_type'] })),
                  options: [
                    { value: 'all', label: 'Todos' },
                    { value: 'pessoa', label: 'Pessoa' },
                    { value: 'veiculo', label: 'Veículo' },
                    { value: 'unitario', label: 'Unitário' },
                  ],
                },
              ]}
              onClearFilters={() => setFilters(initialFilters)}
              hasActiveFilters={hasActiveFilters}
            />

            <Card className="hidden lg:block">
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex h-64 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filtered.length === 0 ? (
                  <EmptyState
                    icon={<Sparkles className="h-7 w-7 text-muted-foreground" />}
                    title={services.length === 0 ? 'Nenhum serviço cadastrado' : 'Nenhum serviço encontrado'}
                    description={
                      services.length === 0
                        ? 'Cadastre seu primeiro passeio ou serviço para começar a vinculá-lo aos eventos.'
                        : 'Ajuste os filtros para visualizar outros serviços.'
                    }
                    action={
                      services.length === 0 ? (
                        <Button onClick={openCreate} className="gap-2">
                          <Plus className="h-4 w-4" /> Novo serviço
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Tipo de unidade</TableHead>
                        <TableHead>Controle</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[60px] text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((service) => (
                        <TableRow key={service.id}>
                          <TableCell>
                            <div className="font-medium">{service.name}</div>
                            {service.description && (
                              <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                {service.description}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{UNIT_TYPE_LABELS[service.unit_type]}</TableCell>
                          <TableCell>{CONTROL_TYPE_LABELS[service.control_type]}</TableCell>
                          <TableCell>
                            <StatusBadge status={service.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <ActionsDropdown actions={getServiceActions(service)} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:hidden">
              {loading ? (
                <Card className="rounded-3xl border-slate-200/70 bg-white shadow-sm">
                  <CardContent className="flex h-48 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </CardContent>
                </Card>
              ) : filtered.length === 0 ? (
                <Card className="rounded-3xl border-slate-200/70 bg-white shadow-sm">
                  <CardContent className="px-4 py-8">
                    <EmptyState
                      icon={<Sparkles className="h-7 w-7 text-muted-foreground" />}
                      title={services.length === 0 ? 'Nenhum serviço cadastrado' : 'Nenhum serviço encontrado'}
                      description={
                        services.length === 0
                          ? 'Cadastre seu primeiro passeio ou serviço para começar a vinculá-lo aos eventos.'
                          : 'Ajuste os filtros para visualizar outros serviços.'
                      }
                      action={
                        services.length === 0 ? (
                          <Button onClick={openCreate} className="w-full gap-2">
                            <Plus className="h-4 w-4" /> Adicionar serviço
                          </Button>
                        ) : undefined
                      }
                    />
                  </CardContent>
                </Card>
              ) : (
                filtered.map((service) => (
                  <Card key={service.id} className="overflow-hidden rounded-3xl border-slate-200/70 bg-white shadow-sm">
                    <CardContent className="space-y-4 p-4">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-2">
                          <h2 className="break-words text-base font-bold leading-tight text-slate-950">
                            {service.name}
                          </h2>
                          <div className="flex flex-wrap gap-2">
                            <StatusBadge status={service.status} />
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                              {UNIT_TYPE_LABELS[service.unit_type]}
                            </span>
                          </div>
                        </div>
                        <div className="shrink-0">
                          <ActionsDropdown actions={getServiceActions(service)} />
                        </div>
                      </div>

                      {service.description ? (
                        <p className="line-clamp-3 break-words text-sm leading-relaxed text-slate-600">
                          {service.description}
                        </p>
                      ) : (
                        <p className="text-sm text-slate-500">Sem descrição cadastrada.</p>
                      )}

                      <div className="rounded-2xl bg-slate-50 p-3 text-sm">
                        <p className="text-xs font-medium text-slate-500">Controle</p>
                        <p className="mt-1 break-words font-semibold text-slate-900">
                          {CONTROL_TYPE_LABELS[service.control_type]}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="lg:hidden">
          <AdminMobileBottomNav
            items={adminMobileBottomNavItems}
            onMoreClick={() => setMobileMoreMenuOpen(true)}
          />
          <AdminMobileMoreMenu open={mobileMoreMenuOpen} onOpenChange={setMobileMoreMenuOpen} />
        </div>
      </div>

      {/* Modal de cadastro/edição */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-lg flex-col overflow-hidden rounded-2xl p-0 sm:max-h-[90vh] sm:w-full sm:p-6">
          <DialogHeader className="px-4 py-3 sm:p-0">
            <DialogTitle>
              {editingId ? 'Editar serviço' : 'Novo serviço'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto px-4 pb-6 sm:px-0">
            <div className="space-y-1.5">
              <Label htmlFor="service-name">Nome *</Label>
              <Input
                id="service-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Buggy, Catamarã, Mergulho"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="service-description">Descrição</Label>
              <Textarea
                id="service-description"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Detalhes do passeio/serviço (opcional)"
                rows={3}
                maxLength={500}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo de unidade</Label>
                <Select
                  value={form.unit_type}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, unit_type: v as ServiceUnitType }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pessoa">Pessoa</SelectItem>
                    <SelectItem value="veiculo">Veículo</SelectItem>
                    <SelectItem value="unitario">Unitário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de controle</Label>
                <Select
                  value={form.control_type}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, control_type: v as ServiceControlType }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="validacao_obrigatoria">
                      Com validação (gera QR no futuro)
                    </SelectItem>
                    <SelectItem value="sem_validacao">
                      Sem validação (apenas controle financeiro)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {editingId && (
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, status: v as ServiceStatus }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 border-t px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:mt-2 sm:flex-row sm:justify-end sm:border-0 sm:px-0 sm:py-0">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button className="w-full sm:w-auto" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? 'Salvar alterações' : 'Cadastrar serviço'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog
        open={Boolean(confirmDeleteId)}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
      >
        <AlertDialogContent className="w-[calc(100vw-1rem)] max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir serviço?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Se o serviço já estiver vinculado a algum
              evento, a exclusão poderá ser bloqueada — nesse caso, prefira inativar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="w-full sm:w-auto">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:w-auto"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
