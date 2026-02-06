import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Company } from '@/types/database';
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
  Calendar,
  FileText,
  IdCard,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Power,
  Phone,
} from 'lucide-react';
import { toast } from 'sonner';
import { buildDebugToastMessage, logSupabaseError } from '@/lib/errorDebug';
import { formatCnpj, getCompanyLocation } from '@/lib/pdfUtils';
import { Navigate } from 'react-router-dom';

interface CompanyFilters {
  search: string;
  status: 'all' | 'ativo' | 'inativo';
}

const initialFilters: CompanyFilters = {
  search: '',
  status: 'all',
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LOGO_SIZE_MB = 2;
const MAX_LOGO_SIZE_BYTES = MAX_LOGO_SIZE_MB * 1024 * 1024;
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
// Comentário: este bucket deve existir no Supabase Storage para permitir o upload da logo.
const COMPANY_LOGO_BUCKET = 'company-logos';

const getCnpjDigits = (value: string) => value.replace(/\D/g, '').slice(0, 14);

const formatCnpjInput = (value: string) => {
  const digits = getCnpjDigits(value);
  if (!digits) return '';
  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2}).*/,
    (_, p1, p2, p3, p4, p5) => `${p1}.${p2}.${p3}/${p4}${p5 ? `-${p5}` : ''}`
  );
};

export default function CompanyPage() {
  const { activeCompanyId, user, isGerente, isOperador } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<CompanyFilters>(initialFilters);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [form, setForm] = useState({
    legal_name: '',
    trade_name: '',
    cnpj: '',
    email: '',
    phone: '',
    whatsapp: '',
    website: '',
    address: '',
    city: '',
    state: '',
    notes: '',
    logo_url: '',
  });

  const fetchCompanies = async () => {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      logSupabaseError({
        label: 'Erro ao carregar empresas (companies.select)',
        error,
        context: { action: 'select', table: 'companies', companyId: activeCompanyId, userId: user?.id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao carregar empresas',
          error,
          context: { action: 'select', table: 'companies', companyId: activeCompanyId, userId: user?.id },
        })
      );
    } else {
      setCompanies((data ?? []) as Company[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCompanies();
  }, [activeCompanyId]);

  const filteredCompanies = useMemo(() => {
    return companies.filter((company) => {
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          company.legal_name?.toLowerCase().includes(searchLower) ||
          company.trade_name?.toLowerCase().includes(searchLower) ||
          company.name.toLowerCase().includes(searchLower) ||
          company.cnpj?.toLowerCase().includes(searchLower) ||
          company.document?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      if (filters.status !== 'all') {
        const status = company.is_active ? 'ativo' : 'inativo';
        if (status !== filters.status) return false;
      }

      return true;
    });
  }, [companies, filters]);

  const hasActiveFilters = useMemo(() => {
    return filters.search !== '' || filters.status !== 'all';
  }, [filters]);

  const kpiCompany = useMemo(() => {
    if (companies.length === 0) return null;
    return companies.find((company) => company.id === activeCompanyId) ?? companies[0];
  }, [companies, activeCompanyId]);

  const stats = useMemo(() => {
    const statusLabel = kpiCompany ? (kpiCompany.is_active ? 'Ativa' : 'Inativa') : '—';
    const hasCnpj = Boolean((kpiCompany?.cnpj ?? kpiCompany?.document)?.trim());
    const hasLocation = Boolean(kpiCompany?.city?.trim() && kpiCompany?.state?.trim());
    const updatedAt = kpiCompany?.updated_at
      ? new Date(kpiCompany.updated_at).toLocaleDateString('pt-BR')
      : '—';

    return {
      statusLabel,
      hasCnpj,
      hasLocation,
      updatedAt,
    };
  }, [kpiCompany]);

  const resetForm = () => {
    setEditingId(null);
    setForm({
      legal_name: '',
      trade_name: '',
      cnpj: '',
      email: '',
      phone: '',
      whatsapp: '',
      website: '',
      address: '',
      city: '',
      state: '',
      notes: '',
      logo_url: '',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const isAdmin = isGerente || isOperador;
    if (!isAdmin) {
      toast.error('Você não tem permissão para salvar empresa');
      setSaving(false);
      return;
    }

    const legalName = form.legal_name.trim();
    const tradeName = form.trade_name.trim();

    if (!legalName && !tradeName) {
      toast.error('Informe a razão social ou o nome fantasia');
      setSaving(false);
      return;
    }

    const cnpjDigits = getCnpjDigits(form.cnpj);
    if (form.cnpj && cnpjDigits.length !== 14) {
      toast.error('CNPJ inválido');
      setSaving(false);
      return;
    }

    if (form.state && form.state.trim().length !== 2) {
      toast.error('UF deve conter 2 caracteres');
      setSaving(false);
      return;
    }

    if (form.email && !emailRegex.test(form.email)) {
      toast.error('E-mail inválido');
      setSaving(false);
      return;
    }

    // Comentário: o campo `name` é obrigatório no schema, então usamos trade_name/legal_name como base.
    // Também mantemos `document` sincronizado com CNPJ para compatibilidade com dados legados.
    const payload = {
      name: tradeName || legalName,
      legal_name: legalName || null,
      trade_name: tradeName || null,
      cnpj: form.cnpj.trim() || null,
      document: cnpjDigits ? form.cnpj.trim() : null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      website: form.website.trim() || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim().toUpperCase() || null,
      notes: form.notes.trim() || null,
      logo_url: form.logo_url?.trim() || null,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from('companies').update(payload).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('companies').insert([payload]));
    }

    if (error) {
      logSupabaseError({
        label: 'Erro ao salvar empresa (companies.insert/update)',
        error,
        context: {
          action: editingId ? 'update' : 'insert',
          table: 'companies',
          companyId: activeCompanyId,
          userId: user?.id,
          editingId,
          payload,
        },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao salvar empresa',
          error,
          context: {
            action: editingId ? 'update' : 'insert',
            table: 'companies',
            companyId: activeCompanyId,
            userId: user?.id,
            editingId,
          },
        })
      );
    } else {
      toast.success(editingId ? 'Empresa atualizada' : 'Empresa cadastrada');
      setDialogOpen(false);
      resetForm();
      fetchCompanies();
    }
    setSaving(false);
  };

  const handleEdit = (company: Company) => {
    setEditingId(company.id);
    setForm({
      legal_name: company.legal_name ?? '',
      trade_name: company.trade_name ?? company.name ?? '',
      cnpj: company.cnpj ?? company.document ?? '',
      email: company.email ?? '',
      phone: company.phone ?? '',
      whatsapp: company.whatsapp ?? '',
      website: company.website ?? '',
      address: company.address ?? '',
      city: company.city ?? '',
      state: company.state ?? '',
      notes: company.notes ?? '',
      logo_url: company.logo_url ?? '',
    });
    setDialogOpen(true);
  };

  const handleLogoUpload = async (file?: File) => {
    if (!file) return;

    const isAdmin = isGerente || isOperador;
    if (!isAdmin) {
      toast.error('Você não tem permissão para alterar a logo');
      return;
    }

    if (!editingId) {
      toast.error('Salve a empresa antes de enviar a logo');
      return;
    }

    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      toast.error('Formato de logo inválido. Envie PNG, JPG ou SVG');
      return;
    }

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      toast.error(`A logo deve ter no máximo ${MAX_LOGO_SIZE_MB}MB`);
      return;
    }

    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    if (bucketsError) {
      logSupabaseError({
        label: 'Erro ao listar buckets (storage.listBuckets)',
        error: bucketsError,
        context: { action: 'listBuckets', bucket: COMPANY_LOGO_BUCKET, companyId: editingId, userId: user?.id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao validar bucket de logo',
          error: bucketsError,
          context: { action: 'listBuckets', bucket: COMPANY_LOGO_BUCKET, companyId: editingId },
        })
      );
      return;
    }

    const hasLogoBucket = buckets?.some((bucket) => bucket.name === COMPANY_LOGO_BUCKET);
    if (!hasLogoBucket) {
      toast.error('Bucket de logos não encontrado. Crie o bucket company-logos no Supabase Storage.');
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
    const fileName = `company-${editingId}.${extension}`;

    setLogoUploading(true);

    // Comentário: armazenamos a imagem no Storage para uso futuro em PDFs/relatórios,
    // salvando apenas a URL pública no banco (evita base64 e mantém o payload leve).
    const { error: uploadError } = await supabase.storage
      .from(COMPANY_LOGO_BUCKET)
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      logSupabaseError({
        label: 'Erro ao enviar logo (storage.upload)',
        error: uploadError,
        context: { action: 'upload', bucket: COMPANY_LOGO_BUCKET, companyId: editingId, userId: user?.id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao enviar logo',
          error: uploadError,
          context: { action: 'upload', bucket: COMPANY_LOGO_BUCKET, companyId: editingId },
        })
      );
      setLogoUploading(false);
      return;
    }

    const { data } = supabase.storage.from(COMPANY_LOGO_BUCKET).getPublicUrl(fileName);
    const publicUrl = data?.publicUrl;

    if (!publicUrl) {
      toast.error('Não foi possível obter a URL da logo');
      setLogoUploading(false);
      return;
    }

    const { error: updateError } = await supabase
      .from('companies')
      .update({ logo_url: publicUrl })
      .eq('id', editingId);

    if (updateError) {
      logSupabaseError({
        label: 'Erro ao salvar logo (companies.update)',
        error: updateError,
        context: { action: 'update', table: 'companies', companyId: editingId, userId: user?.id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao salvar logo',
          error: updateError,
          context: { action: 'update', table: 'companies', companyId: editingId },
        })
      );
    } else {
      setForm((prev) => ({ ...prev, logo_url: publicUrl }));
      fetchCompanies();
      toast.success('Logo atualizada');
    }

    setLogoUploading(false);
  };

  const handleToggleStatus = async (company: Company) => {
    const nextStatus = company.is_active ? 'inativo' : 'ativo';
    const { error } = await supabase
      .from('companies')
      .update({ is_active: !company.is_active })
      .eq('id', company.id);

    if (error) {
      logSupabaseError({
        label: 'Erro ao atualizar status da empresa (companies.update)',
        error,
        context: { action: 'update', table: 'companies', companyId: company.id, userId: user?.id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao atualizar status',
          error,
          context: { action: 'update', table: 'companies', companyId: company.id, userId: user?.id },
        })
      );
    } else {
      toast.success(`Empresa ${nextStatus === 'ativo' ? 'ativada' : 'desativada'}`);
      fetchCompanies();
    }
  };

  const getCompanyActions = (company: Company): ActionItem[] => [
    {
      label: 'Editar',
      icon: Pencil,
      onClick: () => handleEdit(company),
    },
    {
      label: company.is_active ? 'Inativar' : 'Ativar',
      icon: Power,
      onClick: () => handleToggleStatus(company),
      variant: company.is_active ? 'destructive' : 'default',
    },
  ];

  if (!isGerente && !isOperador) {
    return <Navigate to="/admin/eventos" replace />;
  }

  return (
    <AdminLayout>
      <div className="page-container">
        {/* Header */}
        <PageHeader
          title="Empresa"
          description="Dados cadastrais e informações institucionais da empresa"
          actions={
            <Dialog
              open={dialogOpen}
              onOpenChange={(open) => {
                setDialogOpen(open);
                if (!open) resetForm();
              }}
            >
              <DialogTrigger asChild>
                <Button onClick={() => (kpiCompany ? handleEdit(kpiCompany) : resetForm())}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar empresa
                </Button>
              </DialogTrigger>
              <DialogContent className="admin-modal flex h-[90vh] max-h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 p-0">
                <DialogHeader className="admin-modal__header px-6 py-4">
                  <DialogTitle>{editingId ? 'Editar' : 'Nova'} Empresa</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex h-full flex-col">
                  <Tabs defaultValue="dados" className="flex h-full flex-col">
                    <TabsList className="admin-modal__tabs flex h-auto w-full flex-wrap justify-start gap-1 px-6 py-2">
                      <TabsTrigger
                        value="dados"
                        className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80"
                      >
                        <IdCard className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 truncate">Dados Gerais</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="endereco"
                        className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80"
                      >
                        <MapPin className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 truncate">Endereço</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="contato"
                        className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80"
                      >
                        <Phone className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 truncate">Contato</span>
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
                      <TabsContent value="dados" className="mt-0">
                        <div className="mb-6 grid gap-4 sm:grid-cols-[180px,1fr]">
                          <div className="space-y-2">
                            <Label>Logo da empresa</Label>
                            <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-4 text-center">
                              {form.logo_url ? (
                                <img
                                  src={form.logo_url}
                                  alt="Logo da empresa"
                                  className="h-20 w-20 rounded-md object-contain"
                                />
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  Sem logo definida
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col justify-center gap-3">
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-foreground">Upload da logo</p>
                              <p className="text-xs text-muted-foreground">
                                Use uma imagem PNG, JPG ou SVG (até {MAX_LOGO_SIZE_MB}MB).
                              </p>
                            </div>
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept={ALLOWED_LOGO_TYPES.join(',')}
                              className="hidden"
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                void handleLogoUpload(file);
                                event.currentTarget.value = '';
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full sm:w-fit"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={logoUploading}
                            >
                              {logoUploading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : form.logo_url ? (
                                'Alterar logo'
                              ) : (
                                'Enviar logo'
                              )}
                            </Button>
                          </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                          <div className="space-y-2">
                            <Label htmlFor="legal_name">Razão Social</Label>
                            <Input
                              id="legal_name"
                              value={form.legal_name}
                              onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
                              placeholder="Empresa Exemplo LTDA"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="trade_name">Nome Fantasia</Label>
                            <Input
                              id="trade_name"
                              value={form.trade_name}
                              onChange={(e) => setForm({ ...form, trade_name: e.target.value })}
                              placeholder="Empresa Exemplo"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="cnpj">CNPJ</Label>
                            <Input
                              id="cnpj"
                              value={form.cnpj}
                              onChange={(e) =>
                                setForm({ ...form, cnpj: formatCnpjInput(e.target.value) })
                              }
                              placeholder="00.000.000/0000-00"
                            />
                          </div>
                          {/* Comentário: inscrição estadual não existe no schema atual, então não exibimos aqui. */}
                        </div>
                      </TabsContent>

                      <TabsContent value="endereco" className="mt-0">
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                          {/* Comentário: address é um campo único no schema; mantemos granularidade mínima para não inventar colunas. */}
                          <div className="space-y-2 sm:col-span-2 xl:col-span-3">
                            <Label htmlFor="address">Endereço</Label>
                            <Input
                              id="address"
                              value={form.address}
                              onChange={(e) => setForm({ ...form, address: e.target.value })}
                              placeholder="Rua Exemplo, 123"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="city">Cidade</Label>
                            <Input
                              id="city"
                              value={form.city}
                              onChange={(e) => setForm({ ...form, city: e.target.value })}
                              placeholder="São Paulo"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="state">UF</Label>
                            <Input
                              id="state"
                              value={form.state}
                              onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
                              placeholder="SP"
                              maxLength={2}
                            />
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="contato" className="mt-0">
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                          <div className="space-y-2">
                            <Label htmlFor="email">E-mail principal</Label>
                            <Input
                              id="email"
                              type="email"
                              value={form.email}
                              onChange={(e) => setForm({ ...form, email: e.target.value })}
                              placeholder="contato@empresa.com"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="phone">Telefone</Label>
                            <Input
                              id="phone"
                              value={form.phone}
                              onChange={(e) => setForm({ ...form, phone: e.target.value })}
                              placeholder="(11) 99999-9999"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="whatsapp">WhatsApp</Label>
                            <Input
                              id="whatsapp"
                              value={form.whatsapp}
                              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                              placeholder="(11) 99999-9999"
                            />
                          </div>
                          <div className="space-y-2 sm:col-span-2 xl:col-span-3">
                            <Label htmlFor="website">Site</Label>
                            <Input
                              id="website"
                              value={form.website}
                              onChange={(e) => setForm({ ...form, website: e.target.value })}
                              placeholder="https://www.empresa.com"
                            />
                          </div>
                          {/* Comentário: nome do responsável não existe no schema atual, então não exibimos aqui. */}
                        </div>
                      </TabsContent>

                      <TabsContent value="observacoes" className="mt-0">
                        <div className="grid gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="notes">Observações institucionais</Label>
                            <Textarea
                              id="notes"
                              value={form.notes}
                              onChange={(e) => setForm({ ...form, notes: e.target.value })}
                              rows={5}
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
          }
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatsCard label="Status da empresa" value={stats.statusLabel} icon={Power} />
          <StatsCard
            label="CNPJ informado"
            value={stats.hasCnpj ? 'Sim' : 'Não'}
            icon={IdCard}
            variant={stats.hasCnpj ? 'success' : 'default'}
          />
          <StatsCard
            label="Cidade/UF informados"
            value={stats.hasLocation ? 'Sim' : 'Não'}
            icon={MapPin}
            variant={stats.hasLocation ? 'success' : 'default'}
          />
          <StatsCard label="Última atualização" value={stats.updatedAt} icon={Calendar} />
        </div>

        {/* Filters */}
        <FilterCard
          className="mb-6"
          searchValue={filters.search}
          onSearchChange={(value) => setFilters({ ...filters, search: value })}
          searchPlaceholder="Pesquisar por razão social, nome fantasia ou CNPJ..."
          selects={[
            {
              id: 'status',
              label: 'Status',
              placeholder: 'Status',
              value: filters.status,
              onChange: (value) => setFilters({ ...filters, status: value as CompanyFilters['status'] }),
              options: [
                { value: 'all', label: 'Todos' },
                { value: 'ativo', label: 'Ativa' },
                { value: 'inativo', label: 'Inativa' },
              ],
            },
          ]}
          onClearFilters={() => setFilters(initialFilters)}
          hasActiveFilters={hasActiveFilters}
        />

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : companies.length === 0 ? (
          <EmptyState
            icon={<IdCard className="h-8 w-8 text-muted-foreground" />}
            title="Nenhuma empresa cadastrada"
            description="Cadastre os dados da empresa ativa"
            action={
              <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Empresa
              </Button>
            }
          />
        ) : filteredCompanies.length === 0 ? (
          <EmptyState
            icon={<IdCard className="h-8 w-8 text-muted-foreground" />}
            title="Nenhuma empresa encontrada"
            description="Ajuste os filtros para encontrar empresas"
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
                    <TableHead>Razão Social</TableHead>
                    <TableHead>Nome Fantasia</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Cidade / UF</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[60px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCompanies.map((company) => (
                    <TableRow key={company.id}>
                      <TableCell>{company.legal_name ?? company.name}</TableCell>
                      <TableCell>{company.trade_name ?? '-'}</TableCell>
                      <TableCell className="font-mono">
                        {formatCnpj(company.cnpj ?? company.document) ?? '-'}
                      </TableCell>
                      <TableCell>{getCompanyLocation(company) ?? '-'}</TableCell>
                      <TableCell>
                        <StatusBadge status={company.is_active ? 'ativo' : 'inativo'} />
                      </TableCell>
                      <TableCell>
                        <ActionsDropdown actions={getCompanyActions(company)} />
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
