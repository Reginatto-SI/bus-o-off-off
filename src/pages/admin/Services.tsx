import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  Service,
  ServiceControlType,
  ServiceStatus,
  ServiceUnitType,
} from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { AdminLayout } from '@/components/layout/AdminLayout';
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
  const { isGerente, isDeveloper, activeCompanyId, user, loading: authLoading } = useAuth();

  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceFormState>(emptyForm);
  const [filters, setFilters] = useState<ServiceFilters>(initialFilters);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const canManage = isGerente || isDeveloper;

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
        toast.success('Serviço cadastrado.');
        setDialogOpen(false);
        await fetchServices();
      }
    }
    setSaving(false);
  };

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
      <PageHeader
        title="Passeios & Serviços"
        description="Cadastre os serviços (passeios, atrações, transfers) que sua agência poderá vincular aos eventos."
        actions={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo serviço
          </Button>
        }
      />

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

      <Card className="mt-4">
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
                {filtered.map((service) => {
                  const actions: ActionItem[] = [
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
                  return (
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
                        <ActionsDropdown actions={actions} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal de cadastro/edição */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Editar serviço' : 'Novo serviço'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
          <div className="mt-2 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir serviço?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Se o serviço já estiver vinculado a algum
              evento, a exclusão poderá ser bloqueada — nesse caso, prefira inativar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
