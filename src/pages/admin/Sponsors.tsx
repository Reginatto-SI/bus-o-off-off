import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Sponsor } from '@/types/database';
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
  Eye,
  Image,
  Link2,
  Loader2,
  Pencil,
  Phone,
  Plus,
  Power,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { buildDebugToastMessage, logSupabaseError } from '@/lib/errorDebug';

// Comentário: patrocinadores são globais (não vinculados a eventos) e aparecem no carrossel do app.
interface SponsorFilters {
  search: string;
  status: 'all' | Sponsor['status'];
}

const initialFilters: SponsorFilters = {
  search: '',
  status: 'all',
};

const SPONSOR_BANNER_BUCKET = 'event-images';

export default function Sponsors() {
  const { isGerente, user } = useAuth();
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dados');
  const [filters, setFilters] = useState<SponsorFilters>(initialFilters);
  const [form, setForm] = useState({
    name: '',
    status: 'ativo' as Sponsor['status'],
    carousel_order: '1',
    banner_url: null as string | null,
    link_type: 'site' as Sponsor['link_type'],
    site_url: '',
    whatsapp_phone: '',
    whatsapp_message: '',
    contact_name: '',
    contact_phone: '',
    contact_email: '',
  });

  const stats = useMemo(() => {
    const total = sponsors.length;
    const ativos = sponsors.filter((sponsor) => sponsor.status === 'ativo').length;
    const inativos = sponsors.filter((sponsor) => sponsor.status === 'inativo').length;
    return { total, ativos, inativos };
  }, [sponsors]);

  const filteredSponsors = useMemo(() => {
    return sponsors.filter((sponsor) => {
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        if (!sponsor.name.toLowerCase().includes(searchLower)) {
          return false;
        }
      }

      if (filters.status !== 'all' && sponsor.status !== filters.status) {
        return false;
      }

      return true;
    });
  }, [filters, sponsors]);

  const hasActiveFilters = useMemo(() => {
    return filters.search !== '' || filters.status !== 'all';
  }, [filters]);

  const fetchSponsors = async () => {
    const { data, error } = await supabase
      .from('sponsors')
      .select('*')
      .order('carousel_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      logSupabaseError({
        label: 'Erro ao carregar patrocinadores (sponsors.select)',
        error,
        context: { action: 'select', table: 'sponsors', userId: user?.id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao carregar patrocinadores',
          error,
          context: { action: 'select', table: 'sponsors' },
        })
      );
    } else {
      setSponsors(data as Sponsor[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSponsors();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setUploadingImage(false);
    setActiveTab('dados');
    setForm({
      name: '',
      status: 'ativo',
      carousel_order: '1',
      banner_url: null,
      link_type: 'site',
      site_url: '',
      whatsapp_phone: '',
      whatsapp_message: '',
      contact_name: '',
      contact_phone: '',
      contact_email: '',
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);

    if (!form.name.trim()) {
      toast.error('Nome do patrocinador é obrigatório');
      setSaving(false);
      return;
    }

    const orderValue = Number.parseInt(form.carousel_order, 10);
    if (Number.isNaN(orderValue) || orderValue < 0) {
      toast.error('Informe uma ordem válida para o carrossel');
      setSaving(false);
      return;
    }

    if (form.link_type === 'site' && !form.site_url.trim()) {
      toast.error('Informe a URL do site');
      setSaving(false);
      return;
    }

    if (form.link_type === 'whatsapp' && !form.whatsapp_phone.trim()) {
      toast.error('Informe o telefone do WhatsApp');
      setSaving(false);
      return;
    }

    // Comentário: mantemos os campos não utilizados como null para reduzir ruído no banco.
    const sponsorData = {
      name: form.name.trim(),
      status: form.status,
      carousel_order: orderValue,
      banner_url: form.banner_url,
      link_type: form.link_type,
      site_url: form.link_type === 'site' ? form.site_url.trim() : null,
      whatsapp_phone: form.link_type === 'whatsapp' ? form.whatsapp_phone.trim() : null,
      whatsapp_message: form.link_type === 'whatsapp' ? form.whatsapp_message.trim() || null : null,
      contact_name: form.contact_name.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      contact_email: form.contact_email.trim() || null,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from('sponsors').update(sponsorData).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('sponsors').insert([sponsorData]));
    }

    if (error) {
      logSupabaseError({
        label: 'Erro ao salvar patrocinador (sponsors.insert/update)',
        error,
        context: {
          action: editingId ? 'update' : 'insert',
          table: 'sponsors',
          userId: user?.id,
          editingId,
          payload: sponsorData,
        },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao salvar patrocinador',
          error,
          context: { action: editingId ? 'update' : 'insert', table: 'sponsors' },
        })
      );
    } else {
      toast.success(editingId ? 'Patrocinador atualizado' : 'Patrocinador cadastrado');
      setDialogOpen(false);
      resetForm();
      fetchSponsors();
    }

    setSaving(false);
  };

  const handleEdit = (sponsor: Sponsor) => {
    setEditingId(sponsor.id);
    setActiveTab('dados');
    setForm({
      name: sponsor.name,
      status: sponsor.status,
      carousel_order: sponsor.carousel_order.toString(),
      banner_url: sponsor.banner_url,
      link_type: sponsor.link_type,
      site_url: sponsor.site_url ?? '',
      whatsapp_phone: sponsor.whatsapp_phone ?? '',
      whatsapp_message: sponsor.whatsapp_message ?? '',
      contact_name: sponsor.contact_name ?? '',
      contact_phone: sponsor.contact_phone ?? '',
      contact_email: sponsor.contact_email ?? '',
    });
    setDialogOpen(true);
  };

  const handleToggleStatus = async (sponsor: Sponsor) => {
    const newStatus = sponsor.status === 'ativo' ? 'inativo' : 'ativo';
    const { error } = await supabase
      .from('sponsors')
      .update({ status: newStatus })
      .eq('id', sponsor.id);

    if (error) {
      logSupabaseError({
        label: 'Erro ao atualizar status do patrocinador (sponsors.update)',
        error,
        context: { action: 'update', table: 'sponsors', userId: user?.id, sponsorId: sponsor.id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao atualizar status',
          error,
          context: { action: 'update', table: 'sponsors' },
        })
      );
      return;
    }

    setSponsors((prev) =>
      prev.map((item) => (item.id === sponsor.id ? { ...item, status: newStatus } : item))
    );
    toast.success('Status atualizado');
  };

  const handleImageUpload = async (file?: File) => {
    if (!file || !editingId) return;

    setUploadingImage(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${editingId}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from(SPONSOR_BANNER_BUCKET)
      .upload(fileName, file);

    if (uploadError) {
      toast.error('Erro ao fazer upload do banner');
      setUploadingImage(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from(SPONSOR_BANNER_BUCKET)
      .getPublicUrl(fileName);

    const { error: updateError } = await supabase
      .from('sponsors')
      .update({ banner_url: publicUrl })
      .eq('id', editingId);

    if (updateError) {
      toast.error('Erro ao salvar URL do banner');
    } else {
      setForm((prev) => ({ ...prev, banner_url: publicUrl }));
      toast.success('Banner enviado com sucesso');
    }

    setUploadingImage(false);
  };

  const getSponsorActions = (sponsor: Sponsor): ActionItem[] => [
    {
      label: 'Editar',
      icon: Pencil,
      onClick: () => handleEdit(sponsor),
    },
    {
      label: sponsor.status === 'ativo' ? 'Inativar' : 'Ativar',
      icon: Power,
      onClick: () => handleToggleStatus(sponsor),
      variant: sponsor.status === 'ativo' ? 'destructive' : 'default',
    },
  ];

  if (!isGerente) {
    return <Navigate to="/admin/eventos" replace />;
  }

  return (
    <AdminLayout>
      <div className="page-container">
        <PageHeader
          title="Patrocinadores"
          description="Gerencie os patrocinadores globais do carrossel do app"
          actions={
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
                  Adicionar patrocinador
                </Button>
              </DialogTrigger>
              {/* Comentário: modal segue o padrão da Frota (/admin/frota) com abas e footer fixo. */}
              <DialogContent className="admin-modal flex h-[90vh] max-h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 p-0">
                <DialogHeader className="admin-modal__header px-6 py-4">
                  <DialogTitle>{editingId ? 'Editar' : 'Novo'} patrocinador</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex h-full flex-col overflow-hidden">
                  <Tabs
                    value={activeTab}
                    onValueChange={setActiveTab}
                    className="flex h-full flex-col overflow-hidden"
                  >
                    <TabsList className="admin-modal__tabs flex h-auto w-full flex-wrap justify-start gap-1 px-6 py-2">
                      <TabsTrigger
                        value="dados"
                        className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80"
                      >
                        <User className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 truncate">Dados gerais</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="banner"
                        className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80"
                      >
                        <Image className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 truncate">Banner</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="redirecionamento"
                        className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80"
                      >
                        <Link2 className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 truncate">Redirecionamento</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="contato"
                        className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80"
                      >
                        <Phone className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 truncate">Contato</span>
                      </TabsTrigger>
                    </TabsList>

                    <div className="admin-modal__body flex-1 overflow-y-auto px-6 py-4">
                      <TabsContent value="dados" className="mt-0">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="name">Nome do patrocinador *</Label>
                            <Input
                              id="name"
                              value={form.name}
                              onChange={(e) => setForm({ ...form, name: e.target.value })}
                              required
                              placeholder="Ex: Banco Parceiro"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Status</Label>
                            <Select
                              value={form.status}
                              onValueChange={(value: Sponsor['status']) =>
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
                          <div className="space-y-2">
                            <Label htmlFor="carousel_order">Ordem no carrossel *</Label>
                            <Input
                              id="carousel_order"
                              type="number"
                              min="0"
                              value={form.carousel_order}
                              onChange={(e) => setForm({ ...form, carousel_order: e.target.value })}
                              required
                            />
                            <p className="text-xs text-muted-foreground">
                              Quanto menor o número, mais à esquerda no carrossel.
                            </p>
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="banner" className="mt-0">
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Banner do patrocinador</Label>
                            {form.banner_url ? (
                              <div className="space-y-2">
                                <label
                                  className={`group relative block h-24 w-64 overflow-hidden rounded-lg border bg-muted cursor-pointer`}
                                >
                                  {/* Comentário: blur de fundo para destacar o banner principal (mesmo padrão do evento). */}
                                  <img
                                    src={form.banner_url}
                                    alt=""
                                    aria-hidden="true"
                                    className="absolute inset-0 h-full w-full object-cover blur-xl scale-110 opacity-40"
                                  />
                                  <img
                                    src={form.banner_url}
                                    alt="Banner do patrocinador"
                                    className="relative h-full w-full object-contain"
                                  />
                                  <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-background/80 px-2 py-1 text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      aria-label="Visualizar banner"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        setImagePreviewOpen(true);
                                      }}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive hover:text-destructive"
                                      aria-label="Remover banner"
                                      onClick={async (e) => {
                                        e.preventDefault();
                                        if (editingId) {
                                          await supabase
                                            .from('sponsors')
                                            .update({ banner_url: null })
                                            .eq('id', editingId);
                                        }
                                        setForm((prev) => ({ ...prev, banner_url: null }));
                                        toast.success('Banner removido');
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    disabled={uploadingImage || !editingId}
                                    onChange={(e) => handleImageUpload(e.target.files?.[0])}
                                  />
                                </label>
                                <label className="inline-flex">
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    disabled={uploadingImage || !editingId}
                                    onChange={(e) => handleImageUpload(e.target.files?.[0])}
                                  />
                                  <Button type="button" variant="outline" size="sm" disabled={uploadingImage}>
                                    <Upload className="h-4 w-4 mr-1" />
                                    Trocar
                                  </Button>
                                </label>
                              </div>
                            ) : (
                              <label
                                className={`flex h-24 w-64 flex-col items-center justify-center gap-2 rounded-lg border bg-muted/30 text-center transition-colors ${
                                  !editingId
                                    ? 'border-muted-foreground/15 cursor-not-allowed'
                                    : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-primary/5 cursor-pointer'
                                }`}
                              >
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  disabled={uploadingImage || !editingId}
                                  onChange={(e) => handleImageUpload(e.target.files?.[0])}
                                />
                                {uploadingImage ? (
                                  <Loader2 className="h-6 w-6 text-primary animate-spin" />
                                ) : (
                                  <Image className="h-6 w-6 text-muted-foreground/50" />
                                )}
                                <p className="text-sm text-muted-foreground">
                                  {uploadingImage
                                    ? 'Enviando banner...'
                                    : !editingId
                                      ? 'Salve o patrocinador primeiro'
                                      : 'Adicionar banner (600×150)'}
                                </p>
                                <p className="text-xs text-muted-foreground/70">Proporção 4:1 (sem cortes)</p>
                              </label>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Este banner será exibido no carrossel do topo do aplicativo.
                          </p>
                        </div>
                      </TabsContent>

                      <TabsContent value="redirecionamento" className="mt-0">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Tipo de redirecionamento</Label>
                            <Select
                              value={form.link_type}
                              onValueChange={(value: Sponsor['link_type']) =>
                                setForm({ ...form, link_type: value })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="site">Site</SelectItem>
                                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {form.link_type === 'site' ? (
                            <div className="space-y-2 sm:col-span-2">
                              <Label htmlFor="site_url">URL do site</Label>
                              <Input
                                id="site_url"
                                value={form.site_url}
                                onChange={(e) => setForm({ ...form, site_url: e.target.value })}
                                placeholder="https://www.patrocinador.com.br"
                              />
                            </div>
                          ) : (
                            <>
                              <div className="space-y-2">
                                <Label htmlFor="whatsapp_phone">Telefone WhatsApp</Label>
                                <Input
                                  id="whatsapp_phone"
                                  value={form.whatsapp_phone}
                                  onChange={(e) => setForm({ ...form, whatsapp_phone: e.target.value })}
                                  placeholder="+55 11 99999-9999"
                                />
                              </div>
                              <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor="whatsapp_message">Mensagem padrão (opcional)</Label>
                                <Textarea
                                  id="whatsapp_message"
                                  value={form.whatsapp_message}
                                  onChange={(e) => setForm({ ...form, whatsapp_message: e.target.value })}
                                  rows={3}
                                  placeholder="Olá! Vi o banner no app e gostaria de saber mais."
                                />
                              </div>
                            </>
                          )}
                        </div>
                      </TabsContent>

                      <TabsContent value="contato" className="mt-0">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="contact_name">Nome do contato</Label>
                            <Input
                              id="contact_name"
                              value={form.contact_name}
                              onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="contact_phone">Telefone</Label>
                            <Input
                              id="contact_phone"
                              value={form.contact_phone}
                              onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="contact_email">E-mail</Label>
                            <Input
                              id="contact_email"
                              type="email"
                              value={form.contact_email}
                              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
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

        {/* Comentário: KPIs seguem o padrão visual da Frota. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatsCard label="Total de patrocinadores" value={stats.total} icon={Image} />
          <StatsCard label="Patrocinadores ativos" value={stats.ativos} icon={Image} variant="success" />
          <StatsCard label="Patrocinadores inativos" value={stats.inativos} icon={Image} variant="destructive" />
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
              onChange: (value) => setFilters({ ...filters, status: value as SponsorFilters['status'] }),
              options: [
                { value: 'all', label: 'Todos' },
                { value: 'ativo', label: 'Ativo' },
                { value: 'inativo', label: 'Inativo' },
              ],
            },
          ]}
          onClearFilters={() => setFilters(initialFilters)}
          hasActiveFilters={hasActiveFilters}
        />

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredSponsors.length === 0 ? (
          <EmptyState
            title="Nenhum patrocinador encontrado"
            description="Cadastre patrocinadores para aparecerem no carrossel do app"
            action={
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar patrocinador
              </Button>
            }
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Banner</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo de link</TableHead>
                    <TableHead>Ordem</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[60px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSponsors.map((sponsor) => (
                    <TableRow key={sponsor.id}>
                      <TableCell>
                        {sponsor.banner_url ? (
                          <div className="h-10 w-24 overflow-hidden rounded-md border bg-muted">
                            <img
                              src={sponsor.banner_url}
                              alt={`Banner ${sponsor.name}`}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sem banner</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{sponsor.name}</TableCell>
                      <TableCell>{sponsor.link_type === 'whatsapp' ? 'WhatsApp' : 'Site'}</TableCell>
                      <TableCell>{sponsor.carousel_order}</TableCell>
                      <TableCell>
                        <StatusBadge status={sponsor.status} />
                      </TableCell>
                      <TableCell>
                        <ActionsDropdown actions={getSponsorActions(sponsor)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Preview do banner seguindo padrão de modal do evento */}
        <Dialog open={imagePreviewOpen} onOpenChange={setImagePreviewOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Pré-visualização do banner</DialogTitle>
            </DialogHeader>
            {form.banner_url ? (
              <div className="flex justify-center">
                <img
                  src={form.banner_url}
                  alt="Pré-visualização do banner do patrocinador"
                  className="w-full max-w-[720px] rounded-lg border object-contain"
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum banner selecionado.</p>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
