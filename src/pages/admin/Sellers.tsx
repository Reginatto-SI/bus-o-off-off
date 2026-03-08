/**
 * VENDEDORES — Módulo 100% gerencial.
 *
 * Vendedores NÃO têm nenhuma relação com Stripe, gateway de pagamento ou qualquer integração financeira.
 * O vendedor é um cadastro interno para:
 *   - Controle de comissão manual (apurada e paga pelo gerente via Pix ou outro meio próprio)
 *   - Rastreamento de vendas via link de referência (?ref=vendedorId)
 *
 * O Stripe lida apenas com o pagamento do cliente final e repasse ao parceiro (partners).
 * Vendedores não participam desse fluxo.
 */
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatPhoneBR, normalizePhoneForStorage } from '@/lib/phone';
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
import { Textarea } from '@/components/ui/textarea';
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
  Link as LinkIcon,
  Loader2,
  Pencil,
  Percent,
  Plus,
  Power,
  QrCode,
  UserCheck,
} from 'lucide-react';
import { SellerQRCodeModal } from '@/components/admin/SellerQRCodeModal';
import { toast } from 'sonner';
import { buildDebugToastMessage, logSupabaseError } from '@/lib/errorDebug';
import { formatCurrencyBRL } from '@/lib/currency';

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

// Resumo de vendas agrupado por seller_id
interface SellerSalesStats {
  count: number;
  total: number;
}

export default function Sellers() {
  const { activeCompanyId, activeCompany, user } = useAuth();
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [salesStats, setSalesStats] = useState<Record<string, SellerSalesStats>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<SellerFilters>(initialFilters);
  const [qrModalSeller, setQrModalSeller] = useState<Seller | null>(null);
  const [form, setForm] = useState({
    name: '',
    cpf: '',
    phone: '',
    email: '',
    commission_percent: '10',
    pix_key: '',
    notes: '',
    status: 'ativo' as Seller['status'],
  });

  // Estatísticas para os cards
  const stats = useMemo(() => {
    const total = sellers.length;
    const ativos = sellers.filter((s) => s.status === 'ativo').length;
    const inativos = sellers.filter((s) => s.status === 'inativo').length;
    const averageCommission = total
      ? sellers.reduce((sum, s) => sum + s.commission_percent, 0) / total
      : 0;
    return { total, ativos, inativos, averageCommission };
  }, [sellers]);

  const filteredSellers = useMemo(() => {
    return sellers.filter((seller) => {
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchName = seller.name.toLowerCase().includes(searchLower);
        const matchPhone = seller.phone?.toLowerCase().includes(searchLower);
        const matchEmail = seller.email?.toLowerCase().includes(searchLower);
        if (!matchName && !matchPhone && !matchEmail) return false;
      }

      if (filters.status !== 'all' && seller.status !== filters.status) return false;

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
        if (!Number.isNaN(minValue) && seller.commission_percent < minValue) return false;
      }

      if (filters.commissionMax) {
        const maxValue = Number(filters.commissionMax);
        if (!Number.isNaN(maxValue) && seller.commission_percent > maxValue) return false;
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

  // Dados para exportação — inclui novos campos e resumo de vendas
  const exportColumns: ExportColumn[] = useMemo(
    () => [
      { key: 'name', label: 'Nome' },
      { key: 'cpf', label: 'CPF' },
      { key: 'phone', label: 'Telefone' },
      { key: 'email', label: 'E-mail' },
      { key: 'commission_percent', label: 'Comissão (%)', format: (v: any) => `${v ?? 0}%` },
      { key: 'pix_key', label: 'Chave Pix' },
      { key: 'status', label: 'Status', format: (v: any) => (v === 'ativo' ? 'Ativo' : 'Inativo') },
      {
        key: 'sales_count',
        label: 'Vendas (pagas)',
        format: (_v: any, row?: any) => {
          const st = row ? salesStats[row.id] : undefined;
          return st ? String(st.count) : '0';
        },
      },
      {
        key: 'sales_total',
        label: 'Total Vendido (R$)',
        format: (_v: any, row?: any) => {
          const st = row ? salesStats[row.id] : undefined;
          return formatCurrencyBRL(st?.total ?? 0);
        },
      },
      { key: 'notes', label: 'Observações' },
      {
        key: 'created_at',
        label: 'Criado em',
        format: (v: any) => (v ? new Date(v).toLocaleDateString('pt-BR') : ''),
      },
    ],
    [salesStats]
  );

  // Dados enriquecidos para exportação (adiciona campos calculados)
  const exportData = useMemo(() => {
    return filteredSellers.map((seller) => {
      const st = salesStats[seller.id];
      return {
        ...seller,
        sales_count: st?.count ?? 0,
        sales_total: st?.total ?? 0,
      };
    });
  }, [filteredSellers, salesStats]);

  const fetchSellers = async () => {
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

  // Buscar resumo de vendas pagas agrupado por seller_id
  const fetchSalesStats = async () => {
    if (!activeCompanyId) return;

    const { data, error } = await supabase
      .from('sales')
      .select('seller_id, quantity, unit_price, gross_amount')
      .eq('company_id', activeCompanyId)
      .eq('status', 'pago')
      .not('seller_id', 'is', null);

    if (error) {
      console.error('Erro ao buscar resumo de vendas por vendedor:', error);
      return;
    }

    const grouped: Record<string, SellerSalesStats> = {};
    (data || []).forEach((sale: any) => {
      const sid = sale.seller_id as string;
      if (!grouped[sid]) grouped[sid] = { count: 0, total: 0 };
      grouped[sid].count += 1;
      // Usa gross_amount se disponível, senão calcula
      grouped[sid].total += sale.gross_amount ?? (sale.quantity * sale.unit_price);
    });
    setSalesStats(grouped);
  };

  useEffect(() => {
    fetchSellers();
    fetchSalesStats();
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
      console.error('active_company_id ausente ao salvar vendedor.', context);
      toast.error(buildDebugToastMessage({ title: 'active_company_id ausente', context }));
      setSaving(false);
      return;
    }

    const payload = {
      name: form.name,
      cpf: form.cpf || null,
      phone: form.phone || null,
      email: form.email || null,
      commission_percent: commissionValue,
      pix_key: form.pix_key || null,
      notes: form.notes || null,
      status: form.status,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase
        .from('sellers')
        .update(payload)
        .eq('id', editingId)
        .eq('company_id', activeCompanyId));
    } else {
      ({ error } = await supabase.from('sellers').insert([{ ...payload, company_id: activeCompanyId }]));
    }

    if (error) {
      logSupabaseError({
        label: 'Erro ao salvar vendedor (sellers.insert/update)',
        error,
        context: { action: editingId ? 'update' : 'insert', table: 'sellers', companyId: activeCompanyId, userId: user?.id, editingId, payload },
      });
      toast.error(buildDebugToastMessage({ title: 'Erro ao salvar vendedor', error, context: { action: editingId ? 'update' : 'insert', table: 'sellers', companyId: activeCompanyId, userId: user?.id, editingId } }));
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
      cpf: seller.cpf || '',
      phone: seller.phone || '',
      email: seller.email || '',
      commission_percent: seller.commission_percent.toString(),
      pix_key: seller.pix_key || '',
      notes: seller.notes || '',
      status: seller.status,
    });
    setDialogOpen(true);
  };

  const handleToggleStatus = async (seller: Seller) => {
    if (!activeCompanyId) {
      const context = { action: 'update', table: 'sellers', companyId: null, userId: user?.id, sellerId: seller.id };
      console.error('active_company_id ausente ao atualizar status do vendedor.', context);
      toast.error(buildDebugToastMessage({ title: 'active_company_id ausente', context }));
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
        context: { action: 'update', table: 'sellers', companyId: activeCompanyId, userId: user?.id, sellerId: seller.id },
      });
      toast.error(buildDebugToastMessage({ title: 'Erro ao atualizar status do vendedor', error, context: { action: 'update', table: 'sellers', companyId: activeCompanyId, userId: user?.id, sellerId: seller.id } }));
    } else {
      toast.success(`Vendedor ${nextStatus === 'ativo' ? 'ativado' : 'inativado'}`);
      fetchSellers();
    }
  };

  /**
   * Copia o link curto do vendedor (/v/{short_code}).
   * Se short_code não existir (fallback), copia o link longo e avisa.
   */
  const handleCopyLink = (seller: Seller) => {
    if (seller.short_code) {
      const shortLink = `${window.location.origin}/v/${seller.short_code}`;
      navigator.clipboard.writeText(shortLink).then(
        () => toast.success(`Link curto de ${seller.name} copiado!`),
        () => toast.error('Falha ao copiar link')
      );
    } else {
      // Fallback: link longo (não deveria acontecer, mas por segurança)
      const longLink = `${window.location.origin}/eventos?ref=${seller.id}`;
      navigator.clipboard.writeText(longLink).then(
        () => toast.info(`Link longo copiado (short_code não disponível)`),
        () => toast.error('Falha ao copiar link')
      );
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({ name: '', cpf: '', phone: '', email: '', commission_percent: '10', pix_key: '', notes: '', status: 'ativo' });
  };

  const getSellerActions = (seller: Seller): ActionItem[] => [
    {
      label: 'Editar',
      icon: Pencil,
      onClick: () => handleEdit(seller),
    },
    {
      label: 'Copiar Link de Venda',
      icon: LinkIcon,
      onClick: () => handleCopyLink(seller),
    },
    {
      label: 'Ver QR Code',
      icon: QrCode,
      onClick: () => setQrModalSeller(seller),
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
                              <Label htmlFor="name">Nome *</Label>
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
                                onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                                placeholder="000.000.000-00"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="phone">Telefone / WhatsApp</Label>
                              <Input
                                id="phone"
                                value={form.phone}
                                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                placeholder="(00) 00000-0000"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="email">E-mail</Label>
                              <Input
                                id="email"
                                type="email"
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                placeholder="vendedor@email.com"
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
                            <div className="space-y-2">
                              <Label htmlFor="pix_key">Chave Pix</Label>
                              <Input
                                id="pix_key"
                                value={form.pix_key}
                                onChange={(e) => setForm({ ...form, pix_key: e.target.value })}
                                placeholder="CPF, e-mail, telefone ou chave aleatória"
                              />
                              <p className="text-xs text-muted-foreground">
                                Informativo — para pagamento manual de comissão pelo gerente.
                              </p>
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                              <Label htmlFor="notes">Observações</Label>
                              <Textarea
                                id="notes"
                                value={form.notes}
                                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                placeholder="Anotações internas sobre o vendedor..."
                                rows={3}
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
          <StatsCard label="Total de vendedores" value={stats.total} icon={UserCheck} />
          <StatsCard label="Vendedores ativos" value={stats.ativos} icon={UserCheck} variant="success" />
          <StatsCard label="Vendedores inativos" value={stats.inativos} icon={UserCheck} variant="destructive" />
          <StatsCard
            label="Comissão média"
            value={`${stats.averageCommission.toFixed(1)}%`}
            icon={Percent}
          />
        </div>

        {/* Filtros */}
        <FilterCard
          className="mb-6"
          searchValue={filters.search}
          onSearchChange={(value) => setFilters({ ...filters, search: value })}
          searchPlaceholder="Pesquisar por nome, telefone, e-mail..."
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
                    <TableHead>Telefone</TableHead>
                    <TableHead>Comissão (%)</TableHead>
                    <TableHead>Vendas</TableHead>
                    <TableHead>Total Vendido</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[60px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSellers.map((seller) => {
                    const st = salesStats[seller.id];
                    return (
                      <TableRow key={seller.id}>
                        <TableCell className="font-medium">{seller.name}</TableCell>
                        <TableCell className="text-muted-foreground">{seller.phone || '—'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Percent className="h-4 w-4 text-muted-foreground" />
                            {seller.commission_percent}%
                          </div>
                        </TableCell>
                        <TableCell>{st?.count ?? 0}</TableCell>
                        <TableCell>
                          {formatCurrencyBRL(st?.total ?? 0)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={seller.status} />
                        </TableCell>
                        <TableCell>
                          <ActionsDropdown actions={getSellerActions(seller)} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
        data={exportData}
        storageKey="vendedores"
        fileName="vendedores"
        sheetName="Vendedores"
      />

      <ExportPDFModal
        open={pdfModalOpen}
        onOpenChange={setPdfModalOpen}
        columns={exportColumns}
        data={exportData}
        storageKey="vendedores"
        fileName="vendedores"
        title="Vendedores"
        company={activeCompany}
      />
      {/* Modal de QR Code do vendedor — link curto */}
      {qrModalSeller != null && (
        <SellerQRCodeModal
          sellerName={qrModalSeller.name}
          shortCode={qrModalSeller.short_code}
          open={qrModalSeller != null}
          onOpenChange={(open) => { if (!open) setQrModalSeller(null); }}
        />
      )}
    </AdminLayout>
  );
}
