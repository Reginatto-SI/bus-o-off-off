import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Seller } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
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
import {
  FileSpreadsheet,
  FileText,
  IdCard,
  Loader2,
  Pencil,
  Percent,
  Plus,
  Power,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { buildDebugToastMessage, logSupabaseError } from '@/lib/errorDebug';

interface SellerFilters {
  search: string;
  status: 'all' | Seller['status'];
  commissionRange: 'all' | '0-5' | '5-10' | '10-20' | '20+';
  commissionMin: string;
  commissionMax: string;
}

const initialFilters: SellerFilters = {
  search: '',
  status: 'all',
  commissionRange: 'all',
  commissionMin: '',
  commissionMax: '',
};

export default function Sellers() {
  const { activeCompanyId, activeCompany, user } = useAuth();
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<SellerFilters>(initialFilters);
  const [form, setForm] = useState({
    name: '',
    commission_percent: '10',
    status: 'ativo' as Seller['status'],
  });

  // Estatísticas para os cards no padrão da Frota (/admin/frota).
  const stats = useMemo(() => {
    const total = sellers.length;
    const ativos = sellers.filter((seller) => seller.status === 'ativo').length;
    const inativos = sellers.filter((seller) => seller.status === 'inativo').length;
    const averageCommission = total
      ? sellers.reduce((sum, seller) => sum + seller.commission_percent, 0) / total
      : 0;
    return { total, ativos, inativos, averageCommission };
  }, [sellers]);

  const filteredSellers = useMemo(() => {
    return sellers.filter((seller) => {
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        if (!seller.name.toLowerCase().includes(searchLower)) {
          return false;
        }
      }

      if (filters.status !== 'all' && seller.status !== filters.status) {
        return false;
      }

      if (filters.commissionRange !== 'all') {
        const commission = seller.commission_percent ?? 0;
        const rangeMap: Record<SellerFilters['commissionRange'], [number, number | null]> = {
          all: [0, null],
          '0-5': [0, 5],
          '5-10': [5, 10],
          '10-20': [10, 20],
          '20+': [20, null],
        };
        const [minRange, maxRange] = rangeMap[filters.commissionRange];
        if (commission < minRange) return false;
        if (maxRange !== null && commission >= maxRange) return false;
      }

      if (filters.commissionMin) {
        const minValue = Number(filters.commissionMin);
        if (!Number.isNaN(minValue) && seller.commission_percent < minValue) {
          return false;
        }
      }

      if (filters.commissionMax) {
        const maxValue = Number(filters.commissionMax);
        if (!Number.isNaN(maxValue) && seller.commission_percent > maxValue) {
          return false;
        }
      }

      return true;
    });
  }, [filters, sellers]);

  const hasActiveFilters = useMemo(() => {
    return (
      filters.search !== '' ||
      filters.status !== 'all' ||
      filters.commissionRange !== 'all' ||
      filters.commissionMin !== '' ||
      filters.commissionMax !== ''
    );
  }, [filters]);

  const exportColumns: ExportColumn[] = useMemo(
    () => [
      { key: 'name', label: 'Nome' },
      { key: 'commission_percent', label: 'Comissão (%)', format: (v) => `${v ?? 0}%` },
      { key: 'status', label: 'Status', format: (v) => (v === 'ativo' ? 'Ativo' : 'Inativo') },
      {
        key: 'created_at',
        label: 'Criado em',
        format: (v) => (v ? new Date(v).toLocaleDateString('pt-BR') : ''),
      },
    ],
    []
  );

  const fetchSellers = async () => {
    // Garantimos multiempresa filtrando por company_id quando disponível.
    if (!activeCompanyId) {
      setSellers([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('sellers')
      .select('*')
      .eq('company_id', activeCompanyId)
      .order('created_at', { ascending: false });

    if (error) {
      logSupabaseError({
        label: 'Erro ao carregar vendedores (sellers.select)',
        error,
        context: { action: 'select', table: 'sellers', companyId: activeCompanyId, userId: user?.id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao carregar vendedores',
          error,
          context: { action: 'select', table: 'sellers', companyId: activeCompanyId, userId: user?.id },
        })
      );
    } else {
      setSellers(data as Seller[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSellers();
  }, [activeCompanyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    if (!form.name.trim()) {
      toast.error('Nome é obrigatório');
      setSaving(false);
      return;
    }

    const commissionValue = Number(form.commission_percent);
    if (Number.isNaN(commissionValue) || commissionValue < 0 || commissionValue > 100) {
      toast.error('Comissão deve estar entre 0 e 100');
      setSaving(false);
      return;
    }

    if (!activeCompanyId) {
      const context = { action: editingId ? 'update' : 'insert', table: 'sellers', companyId: null, userId: user?.id };
      // Comentário: erro bruto quando a empresa ativa não foi resolvida no contexto do usuário.
      console.error('active_company_id ausente ao salvar vendedor.', context);
      toast.error(
        buildDebugToastMessage({
          title: 'active_company_id ausente',
          context,
        })
      );
      setSaving(false);
      return;
    }

    const data = {
      name: form.name,
      commission_percent: commissionValue,
      status: form.status,
      company_id: activeCompanyId,
    };

    let error;
    if (editingId) {
      // Não atualiza company_id na edição
      const { company_id, ...updateData } = data;
      ({ error } = await supabase
        .from('sellers')
        .update(updateData)
        .eq('id', editingId)
        .eq('company_id', activeCompanyId));
    } else {
      ({ error } = await supabase.from('sellers').insert([data]));
    }

    if (error) {
      logSupabaseError({
        label: 'Erro ao salvar vendedor (sellers.insert/update)',
        error,
        context: {
          action: editingId ? 'update' : 'insert',
          table: 'sellers',
          companyId: activeCompanyId,
          userId: user?.id,
          editingId,
          payload: data,
        },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao salvar vendedor',
          error,
          context: {
            action: editingId ? 'update' : 'insert',
            table: 'sellers',
            companyId: activeCompanyId,
            userId: user?.id,
            editingId,
          },
        })
      );
    } else {
      toast.success(editingId ? 'Vendedor atualizado' : 'Vendedor cadastrado');
      setDialogOpen(false);
      resetForm();
      fetchSellers();
    }
    setSaving(false);
  };

  const handleEdit = (seller: Seller) => {
    setEditingId(seller.id);
    setForm({
      name: seller.name,
      commission_percent: seller.commission_percent.toString(),
      status: seller.status,
    });
    setDialogOpen(true);
  };

  const handleToggleStatus = async (seller: Seller) => {
    if (!activeCompanyId) {
      const context = { action: 'update', table: 'sellers', companyId: null, userId: user?.id, sellerId: seller.id };
      console.error('active_company_id ausente ao atualizar status do vendedor.', context);
      toast.error(
        buildDebugToastMessage({
          title: 'active_company_id ausente',
          context,
        })
      );
      return;
    }

    const nextStatus = seller.status === 'ativo' ? 'inativo' : 'ativo';
    const { error } = await supabase
      .from('sellers')
      .update({ status: nextStatus })
      .eq('id', seller.id)
      .eq('company_id', activeCompanyId);
    if (error) {
      logSupabaseError({
        label: 'Erro ao atualizar status do vendedor (sellers.update)',
        error,
        context: {
          action: 'update',
          table: 'sellers',
          companyId: activeCompanyId,
          userId: user?.id,
          sellerId: seller.id,
        },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao atualizar status do vendedor',
          error,
          context: {
            action: 'update',
            table: 'sellers',
            companyId: activeCompanyId,
            userId: user?.id,
            sellerId: seller.id,
          },
        })
      );
    } else {
      toast.success(`Vendedor ${nextStatus === 'ativo' ? 'ativado' : 'inativado'}`);
      fetchSellers();
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({ name: '', commission_percent: '10', status: 'ativo' });
  };

  const getSellerActions = (seller: Seller): ActionItem[] => [
    {
      label: 'Editar',
      icon: Pencil,
      onClick: () => handleEdit(seller),
    },
    {
      label: seller.status === 'ativo' ? 'Inativar' : 'Ativar',
      icon: Power,
      onClick: () => handleToggleStatus(seller),
      variant: seller.status === 'ativo' ? 'destructive' : 'default',
    },
  ];

  return (
    <AdminLayout>
      <div className="page-container">
        <PageHeader
          title="Vendedores"
          description="Gerencie vendedores e comissões"
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
              <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Vendedor
                  </Button>
                </DialogTrigger>
                {/* Comentário: aplicamos o padrão do modal da Frota (/admin/frota) com abas, scroll interno e footer fixo. */}
                <DialogContent className="admin-modal flex h-[90vh] max-h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 p-0">
                  <DialogHeader className="admin-modal__header px-6 py-4">
                    <DialogTitle>{editingId ? 'Editar' : 'Novo'} Vendedor</DialogTitle>
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
                          value="comissao"
                          className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80"
                        >
                          <Percent className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 truncate">Comissão</span>
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
                              <Label>Status</Label>
                              <Select
                                value={form.status}
                                onValueChange={(value: Seller['status']) => setForm({ ...form, status: value })}
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

                        {/* Comentário: não incluímos aba de contato por ausência de colunas no schema atual de sellers. */}
                        <TabsContent value="comissao" className="mt-0">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="commission">Comissão (%)</Label>
                              <Input
                                id="commission"
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                value={form.commission_percent}
                                onChange={(e) => setForm({ ...form, commission_percent: e.target.value })}
                                required
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

        {/* Comentário: KPIs reaproveitam o padrão de cards da Frota para manter consistência visual. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatsCard label="Total de vendedores" value={stats.total} icon={UserCheck} />
          <StatsCard label="Vendedores ativos" value={stats.ativos} icon={UserCheck} variant="success" />
          <StatsCard label="Vendedores inativos" value={stats.inativos} icon={UserCheck} variant="destructive" />
          <StatsCard
            label="Comissão média"
            value={`${stats.averageCommission.toFixed(1)}%`}
            icon={Percent}
          />
        </div>

        {/* Comentário: card de filtros segue o mesmo layout e comportamento de /admin/frota. */}
        <FilterCard
          className="mb-6"
          searchValue={filters.search}
          onSearchChange={(value) => setFilters({ ...filters, search: value })}
          searchPlaceholder="Pesquisar por nome..."
          selects={[
            {
              id: 'status',
              label: 'Status',
              placeholder: 'Status',
              value: filters.status,
              onChange: (value) => setFilters({ ...filters, status: value as SellerFilters['status'] }),
              options: [
                { value: 'all', label: 'Todos' },
                { value: 'ativo', label: 'Ativo' },
                { value: 'inativo', label: 'Inativo' },
              ],
            },
            {
              id: 'commissionRange',
              label: 'Comissão',
              placeholder: 'Comissão',
              value: filters.commissionRange,
              onChange: (value) =>
                setFilters({ ...filters, commissionRange: value as SellerFilters['commissionRange'] }),
              options: [
                { value: 'all', label: 'Todas' },
                { value: '0-5', label: '0% a 5%' },
                { value: '5-10', label: '5% a 10%' },
                { value: '10-20', label: '10% a 20%' },
                { value: '20+', label: 'Acima de 20%' },
              ],
            },
          ]}
          onClearFilters={() => setFilters(initialFilters)}
          hasActiveFilters={hasActiveFilters}
          advancedFilters={
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <FilterInput
                id="commissionMin"
                label="Comissão mín."
                placeholder="Ex: 5"
                value={filters.commissionMin}
                onChange={(value) => setFilters({ ...filters, commissionMin: value })}
                type="number"
              />
              <FilterInput
                id="commissionMax"
                label="Comissão máx."
                placeholder="Ex: 20"
                value={filters.commissionMax}
                onChange={(value) => setFilters({ ...filters, commissionMax: value })}
                type="number"
              />
            </div>
          }
        />

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : sellers.length === 0 ? (
          <EmptyState
            icon={<UserCheck className="h-8 w-8 text-muted-foreground" />}
            title="Nenhum vendedor cadastrado"
            description="Adicione vendedores para rastrear comissões"
            action={
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Vendedor
              </Button>
            }
          />
        ) : filteredSellers.length === 0 ? (
          <EmptyState
            icon={<UserCheck className="h-8 w-8 text-muted-foreground" />}
            title="Nenhum vendedor encontrado"
            description="Ajuste os filtros para encontrar vendedores"
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
                    <TableHead>Comissão (%)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[60px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSellers.map((seller) => (
                    <TableRow key={seller.id}>
                      <TableCell className="font-medium">{seller.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Percent className="h-4 w-4 text-muted-foreground" />
                          {seller.commission_percent}%
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={seller.status} />
                      </TableCell>
                      <TableCell>
                        <ActionsDropdown actions={getSellerActions(seller)} />
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
        data={filteredSellers}
        storageKey="vendedores"
        fileName="vendedores"
        sheetName="Vendedores"
      />

      <ExportPDFModal
        open={pdfModalOpen}
        onOpenChange={setPdfModalOpen}
        columns={exportColumns}
        data={filteredSellers}
        storageKey="vendedores"
        fileName="vendedores"
        title="Vendedores"
        company={activeCompany}
      />
    </AdminLayout>
  );
}
