import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { CommercialPartner, CommercialPartnerStatus, CommercialPartnerTier } from '@/types/database';
import { formatPhoneBR, normalizePhoneForStorage } from '@/lib/phone';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Briefcase,
  Check,
  Eye,
  Image,
  Globe,
  Loader2,
  Star,
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

interface PartnerFilters {
  search: string;
  status: 'all' | CommercialPartnerStatus;
  tier: 'all' | CommercialPartnerTier;
}

const initialFilters: PartnerFilters = {
  search: '',
  status: 'all',
  tier: 'all',
};

const PARTNER_LOGO_BUCKET = 'company-logos';

const WIZARD_STEPS = [
  { label: 'Dados', icon: User },
  { label: 'Logo', icon: Image },
  { label: 'Redirecionamento', icon: Globe },
  { label: 'Contato', icon: Phone },
  { label: 'Exibição', icon: Eye },
] as const;

const TIER_VISIBILITY_DEFAULTS: Record<CommercialPartnerTier, { show_on_showcase: boolean; show_on_event_page: boolean; show_on_ticket: boolean }> = {
  basico: { show_on_showcase: true, show_on_event_page: false, show_on_ticket: false },
  destaque: { show_on_showcase: true, show_on_event_page: true, show_on_ticket: false },
  premium: { show_on_showcase: true, show_on_event_page: true, show_on_ticket: true },
};

const TIER_LABELS: Record<CommercialPartnerTier, string> = {
  basico: 'Básico',
  destaque: 'Destaque',
  premium: 'Premium',
};

export default function CommercialPartners() {
  const { isGerente, user, activeCompanyId } = useAuth();
  const [partners, setPartners] = useState<CommercialPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dados');
  const [filters, setFilters] = useState<PartnerFilters>(initialFilters);

  // Wizard state
  const [wizardStep, setWizardStep] = useState(1);
  const [isCreateWizardMode, setIsCreateWizardMode] = useState(false);

  const [form, setForm] = useState({
    name: '',
    status: 'ativo' as CommercialPartnerStatus,
    display_order: '1',
    partner_tier: 'basico' as CommercialPartnerTier,
    logo_url: null as string | null,
    website_url: '',
    instagram_url: '',
    whatsapp_phone: '',
    contact_phone: '',
    contact_email: '',
    notes: '',
    show_on_showcase: true,
    show_on_event_page: false,
    show_on_ticket: false,
  });

  const stats = useMemo(() => {
    const total = partners.length;
    const ativos = partners.filter((p) => p.status === 'ativo').length;
    const premium = partners.filter((p) => p.partner_tier === 'premium').length;
    const destaque = partners.filter((p) => p.partner_tier === 'destaque').length;
    return { total, ativos, premium, destaque };
  }, [partners]);

  const filteredPartners = useMemo(() => {
    return partners.filter((p) => {
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        if (!p.name.toLowerCase().includes(searchLower)) return false;
      }
      if (filters.status !== 'all' && p.status !== filters.status) return false;
      if (filters.tier !== 'all' && p.partner_tier !== filters.tier) return false;
      return true;
    });
  }, [filters, partners]);

  const hasActiveFilters = useMemo(() => {
    return filters.search !== '' || filters.status !== 'all' || filters.tier !== 'all';
  }, [filters]);

  const fetchPartners = async () => {
    if (!activeCompanyId) return;

    const { data, error } = await supabase
      .from('commercial_partners')
      .select('*')
      .eq('company_id', activeCompanyId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      logSupabaseError({
        label: 'Erro ao carregar parceiros comerciais',
        error,
        context: { action: 'select', table: 'commercial_partners', userId: user?.id },
      });
      toast.error(buildDebugToastMessage({ title: 'Erro ao carregar parceiros', error, context: { action: 'select', table: 'commercial_partners' } }));
    } else {
      setPartners((data ?? []) as CommercialPartner[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPartners();
  }, [activeCompanyId]);

  const resetForm = () => {
    setEditingId(null);
    setUploadingImage(false);
    setActiveTab('dados');
    setWizardStep(1);
    setIsCreateWizardMode(false);
    setForm({
      name: '',
      status: 'ativo',
      display_order: '1',
      partner_tier: 'basico',
      logo_url: null,
      website_url: '',
      instagram_url: '',
      whatsapp_phone: '',
      contact_phone: '',
      contact_email: '',
      notes: '',
      show_on_showcase: true,
      show_on_event_page: false,
      show_on_ticket: false,
    });
  };

  const buildPartnerData = () => {
    const orderValue = Number.parseInt(form.display_order, 10);
    return {
      name: form.name.trim(),
      status: form.status,
      display_order: Number.isNaN(orderValue) ? 1 : orderValue,
      partner_tier: form.partner_tier,
      logo_url: form.logo_url,
      website_url: form.website_url.trim() || null,
      instagram_url: form.instagram_url.trim() || null,
      whatsapp_phone: normalizePhoneForStorage(form.whatsapp_phone) || null,
      contact_phone: normalizePhoneForStorage(form.contact_phone) || null,
      contact_email: form.contact_email.trim() || null,
      notes: form.notes.trim() || null,
      show_on_showcase: form.show_on_showcase,
      show_on_event_page: form.show_on_event_page,
      show_on_ticket: form.show_on_ticket,
    };
  };

  const handleWizardStep1Save = async () => {
    if (!form.name.trim()) {
      toast.error('Nome do parceiro é obrigatório');
      return;
    }
    setSaving(true);

    const orderValue = Number.parseInt(form.display_order, 10);
    const defaults = TIER_VISIBILITY_DEFAULTS[form.partner_tier];
    const { data, error } = await supabase
      .from('commercial_partners')
      .insert([{
        name: form.name.trim(),
        status: form.status,
        display_order: Number.isNaN(orderValue) ? 1 : orderValue,
        partner_tier: form.partner_tier,
        company_id: activeCompanyId!,
        show_on_showcase: defaults.show_on_showcase,
        show_on_event_page: defaults.show_on_event_page,
        show_on_ticket: defaults.show_on_ticket,
      }])
      .select('id')
      .single();

    if (error) {
      logSupabaseError({ label: 'Erro ao criar parceiro (wizard step 1)', error, context: { action: 'insert', table: 'commercial_partners', userId: user?.id } });
      toast.error(buildDebugToastMessage({ title: 'Erro ao criar parceiro', error, context: { action: 'insert', table: 'commercial_partners' } }));
    } else {
      setEditingId(data.id);
      setForm((prev) => ({ ...prev, ...defaults }));
      toast.success('Parceiro criado. Continue o cadastro.');
      setWizardStep(2);
    }
    setSaving(false);
  };

  const handleWizardStepSave = async (nextStep?: number) => {
    if (!editingId) return;
    setSaving(true);

    const partnerData = buildPartnerData();
    const { error } = await supabase
      .from('commercial_partners')
      .update(partnerData)
      .eq('id', editingId)
      .eq('company_id', activeCompanyId!);

    if (error) {
      logSupabaseError({ label: 'Erro ao salvar parceiro (wizard step)', error, context: { action: 'update', table: 'commercial_partners', userId: user?.id, editingId } });
      toast.error(buildDebugToastMessage({ title: 'Erro ao salvar parceiro', error, context: { action: 'update', table: 'commercial_partners' } }));
    } else if (nextStep) {
      setWizardStep(nextStep);
    } else {
      toast.success('Parceiro cadastrado com sucesso!');
      setDialogOpen(false);
      resetForm();
      fetchPartners();
    }
    setSaving(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);

    if (!form.name.trim()) {
      toast.error('Nome do parceiro é obrigatório');
      setSaving(false);
      return;
    }

    const partnerData = buildPartnerData();
    let error;
    if (editingId) {
      ({ error } = await supabase.from('commercial_partners').update(partnerData).eq('id', editingId).eq('company_id', activeCompanyId!));
    } else {
      ({ error } = await supabase.from('commercial_partners').insert([{ ...partnerData, company_id: activeCompanyId! }]));
    }

    if (error) {
      logSupabaseError({ label: 'Erro ao salvar parceiro', error, context: { action: editingId ? 'update' : 'insert', table: 'commercial_partners', userId: user?.id, editingId, payload: partnerData } });
      toast.error(buildDebugToastMessage({ title: 'Erro ao salvar parceiro', error, context: { action: editingId ? 'update' : 'insert', table: 'commercial_partners' } }));
    } else {
      toast.success(editingId ? 'Parceiro atualizado' : 'Parceiro cadastrado');
      setDialogOpen(false);
      resetForm();
      fetchPartners();
    }
    setSaving(false);
  };

  const handleEdit = (partner: CommercialPartner) => {
    setEditingId(partner.id);
    setActiveTab('dados');
    setIsCreateWizardMode(false);
    setWizardStep(1);
    setForm({
      name: partner.name,
      status: partner.status,
      display_order: partner.display_order.toString(),
      partner_tier: partner.partner_tier,
      logo_url: partner.logo_url,
      website_url: partner.website_url ?? '',
      instagram_url: partner.instagram_url ?? '',
      whatsapp_phone: formatPhoneBR(partner.whatsapp_phone ?? ''),
      contact_phone: formatPhoneBR(partner.contact_phone ?? ''),
      contact_email: partner.contact_email ?? '',
      notes: partner.notes ?? '',
      show_on_showcase: partner.show_on_showcase,
      show_on_event_page: partner.show_on_event_page,
      show_on_ticket: partner.show_on_ticket,
    });
    setDialogOpen(true);
  };

  const handleNewPartner = () => {
    resetForm();
    setIsCreateWizardMode(true);
    setWizardStep(1);
    setDialogOpen(true);
  };

  const handleToggleStatus = async (partner: CommercialPartner) => {
    const newStatus = partner.status === 'ativo' ? 'inativo' : 'ativo';
    const { error } = await supabase
      .from('commercial_partners')
      .update({ status: newStatus })
      .eq('id', partner.id)
      .eq('company_id', activeCompanyId!);

    if (error) {
      toast.error('Erro ao atualizar status');
      return;
    }

    setPartners((prev) =>
      prev.map((item) => (item.id === partner.id ? { ...item, status: newStatus as CommercialPartnerStatus } : item))
    );
    toast.success('Status atualizado');
  };

  const handleImageUpload = async (file?: File) => {
    if (!file || !editingId) return;
    setUploadingImage(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `partner-${editingId}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from(PARTNER_LOGO_BUCKET)
      .upload(fileName, file);

    if (uploadError) {
      toast.error('Erro ao fazer upload da logo');
      setUploadingImage(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from(PARTNER_LOGO_BUCKET)
      .getPublicUrl(fileName);

    const { error: updateError } = await supabase
      .from('commercial_partners')
      .update({ logo_url: publicUrl })
      .eq('id', editingId)
      .eq('company_id', activeCompanyId!);

    if (updateError) {
      toast.error('Erro ao salvar URL da logo');
    } else {
      setForm((prev) => ({ ...prev, logo_url: publicUrl }));
      toast.success('Logo enviada com sucesso');
    }
    setUploadingImage(false);
  };

  const [deleteTarget, setDeleteTarget] = useState<CommercialPartner | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget || !activeCompanyId) return;
    const { error } = await supabase
      .from('commercial_partners')
      .delete()
      .eq('id', deleteTarget.id)
      .eq('company_id', activeCompanyId);

    if (error) {
      toast.error('Erro ao excluir parceiro');
    } else {
      toast.success('Parceiro excluído');
      fetchPartners();
    }
    setDeleteTarget(null);
  };

  const getPartnerActions = (partner: CommercialPartner): ActionItem[] => [
    { label: 'Editar', icon: Pencil, onClick: () => handleEdit(partner) },
    {
      label: partner.status === 'ativo' ? 'Inativar' : 'Ativar',
      icon: Power,
      onClick: () => handleToggleStatus(partner),
      variant: partner.status === 'ativo' ? 'destructive' : 'default',
    },
    { label: 'Excluir', icon: Trash2, onClick: () => setDeleteTarget(partner), variant: 'destructive' as const },
  ];

  if (!isGerente) {
    return <Navigate to="/admin/eventos" replace />;
  }

  // ─── Shared form field renderers ───────────────────────────────────

  const renderDadosFields = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cp-name">Nome da empresa parceira *</Label>
        <Input
          id="cp-name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
          placeholder="Ex: Restaurante Sabor da Terra"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v: CommercialPartnerStatus) => setForm({ ...form, status: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="inativo">Inativo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cp-order">Ordem de exibição</Label>
          <Input
            id="cp-order"
            type="number"
            min="0"
            value={form.display_order}
            onChange={(e) => setForm({ ...form, display_order: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">Quanto menor o número, mais destaque na listagem.</p>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Nível do parceiro</Label>
        <div className="grid grid-cols-3 gap-3">
          {([
            { value: 'basico' as CommercialPartnerTier, title: 'Básico', emoji: '', desc: 'Exibição padrão na vitrine da empresa. O parceiro aparece na lista de parceiros oficiais.' },
            { value: 'destaque' as CommercialPartnerTier, title: 'Destaque', emoji: ' ⭐', desc: 'Maior visibilidade na vitrine. Pode aparecer antes dos parceiros básicos.' },
            { value: 'premium' as CommercialPartnerTier, title: 'Premium', emoji: ' 🔥', desc: 'Máximo destaque na vitrine. Aparece nas posições prioritárias e possui maior visibilidade no sistema.' },
          ]).map((tier) => (
            <button
              key={tier.value}
              type="button"
              // Ao trocar o nível, aplica automaticamente os defaults de visibilidade
              // correspondentes (TIER_VISIBILITY_DEFAULTS). O usuário ainda pode
              // personalizar manualmente na aba Exibição depois.
              onClick={() => {
                const defaults = TIER_VISIBILITY_DEFAULTS[tier.value];
                setForm({ ...form, partner_tier: tier.value, ...defaults });
              }}
              className={`rounded-lg border p-3 text-left transition-all cursor-pointer hover:border-primary/60 ${
                form.partner_tier === tier.value
                  ? 'border-primary ring-2 ring-primary bg-primary/5'
                  : 'border-border'
              }`}
            >
              <span className="block text-sm font-semibold">{tier.title}{tier.emoji}</span>
              <span className="block text-xs text-muted-foreground mt-1">{tier.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderLogoFields = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Logo do parceiro</Label>
        {form.logo_url ? (
          <div className="space-y-2">
            <label className="group relative block h-[150px] w-full max-w-[300px] overflow-hidden rounded-lg border bg-muted cursor-pointer">
              <img src={form.logo_url} alt="Logo do parceiro" className="h-full w-full object-contain p-2" />
              <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-background/80 px-2 py-1 text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.preventDefault(); setImagePreviewOpen(true); }}>
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={async (e) => {
                    e.preventDefault();
                    if (editingId) {
                      await supabase.from('commercial_partners').update({ logo_url: null }).eq('id', editingId);
                    }
                    setForm((prev) => ({ ...prev, logo_url: null }));
                    toast.success('Logo removida');
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <input type="file" accept="image/*" className="hidden" disabled={uploadingImage || !editingId} onChange={(e) => handleImageUpload(e.target.files?.[0])} />
            </label>
            <label className="inline-flex">
              <input type="file" accept="image/*" className="hidden" disabled={uploadingImage || !editingId} onChange={(e) => handleImageUpload(e.target.files?.[0])} />
              <Button type="button" variant="outline" size="sm" disabled={uploadingImage}>
                <Upload className="h-4 w-4 mr-1" /> Trocar
              </Button>
            </label>
          </div>
        ) : (
          <label
            className={`flex h-[150px] w-full max-w-[300px] flex-col items-center justify-center gap-2 rounded-lg border bg-muted/30 text-center transition-colors ${
              !editingId ? 'border-muted-foreground/15 cursor-not-allowed' : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-primary/5 cursor-pointer'
            }`}
          >
            <input type="file" accept="image/*" className="hidden" disabled={uploadingImage || !editingId} onChange={(e) => handleImageUpload(e.target.files?.[0])} />
            {uploadingImage ? <Loader2 className="h-6 w-6 text-primary animate-spin" /> : <Image className="h-6 w-6 text-muted-foreground/50" />}
            <p className="text-sm text-muted-foreground">
              {uploadingImage ? 'Enviando logo...' : !editingId ? 'Salve o parceiro primeiro' : 'Adicionar logo'}
            </p>
            <p className="text-xs text-muted-foreground/70">Tamanho ideal: 300×300px</p>
          </label>
        )}
      </div>
    </div>
  );

  const renderRedirecionamentoFields = () => (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="cp-website">URL do site</Label>
        <Input id="cp-website" value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} placeholder="https://www.parceiro.com.br" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cp-instagram">Instagram</Label>
        <Input id="cp-instagram" value={form.instagram_url} onChange={(e) => setForm({ ...form, instagram_url: e.target.value })} placeholder="https://instagram.com/parceiro" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cp-whatsapp">WhatsApp</Label>
        <Input id="cp-whatsapp" value={form.whatsapp_phone} onChange={(e) => setForm({ ...form, whatsapp_phone: formatPhoneBR(e.target.value) })} placeholder="(00) 00000-0000" maxLength={15} inputMode="tel" />
      </div>
    </div>
  );

  const renderContatoFields = () => (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="cp-phone">Telefone</Label>
        <Input id="cp-phone" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: formatPhoneBR(e.target.value) })} placeholder="(00) 00000-0000" maxLength={15} inputMode="tel" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cp-email">E-mail</Label>
        <Input id="cp-email" type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="cp-notes">Observações</Label>
        <Textarea id="cp-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Informações adicionais sobre este parceiro..." />
      </div>
    </div>
  );

  const renderExibicaoFields = () => {
    // Verifica se a configuração atual diverge do padrão do nível selecionado.
    // Se divergir, exibe um aviso visual discreto informando personalização manual.
    const defaults = TIER_VISIBILITY_DEFAULTS[form.partner_tier];
    const isCustomized =
      form.show_on_showcase !== defaults.show_on_showcase ||
      form.show_on_event_page !== defaults.show_on_event_page ||
      form.show_on_ticket !== defaults.show_on_ticket;

    return (
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">
          A configuração abaixo foi definida automaticamente com base no nível <strong>{TIER_LABELS[form.partner_tier]}</strong>. Você pode ajustar manualmente se necessário.
        </p>

        {isCustomized && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <span className="mt-0.5">⚠️</span>
            <span>Configuração de exibição personalizada — as opções abaixo diferem do padrão do nível "{TIER_LABELS[form.partner_tier]}".</span>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="cp-showcase"
              checked={form.show_on_showcase}
              onCheckedChange={(checked) => setForm({ ...form, show_on_showcase: !!checked })}
            />
            <div>
              <Label htmlFor="cp-showcase" className="cursor-pointer">
                Mostrar na vitrine pública
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">(Básico, Destaque e Premium)</span>
              </Label>
              <p className="text-xs text-muted-foreground">O parceiro aparecerá na seção "Parceiros oficiais" da página pública da empresa.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="cp-event-page"
              checked={form.show_on_event_page}
              onCheckedChange={(checked) => setForm({ ...form, show_on_event_page: !!checked })}
            />
            <div>
              <Label htmlFor="cp-event-page" className="cursor-pointer">
                Mostrar na página de eventos
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">(Destaque e Premium)</span>
              </Label>
              <p className="text-xs text-muted-foreground">O parceiro aparecerá na página de detalhe dos eventos, separado dos patrocinadores.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="cp-ticket"
              checked={form.show_on_ticket}
              onCheckedChange={(checked) => setForm({ ...form, show_on_ticket: !!checked })}
            />
            <div>
              <Label htmlFor="cp-ticket" className="cursor-pointer">
                Mostrar na passagem
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">(Premium)</span>
              </Label>
              <p className="text-xs text-muted-foreground">O parceiro pode aparecer de forma discreta no rodapé da passagem gerada.</p>
            </div>
          </div>
        </div>
      </div>
    );
  };



  const renderWizardProgress = () => (
    <div className="px-6 py-4 border-b border-border">
      <div className="flex items-center justify-between">
        {WIZARD_STEPS.map((step, index) => {
          const stepNumber = index + 1;
          const isCompleted = wizardStep > stepNumber;
          const isCurrent = wizardStep === stepNumber;

          return (
            <div key={step.label} className="flex items-center flex-1 last:flex-initial">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                    isCompleted
                      ? 'bg-primary text-primary-foreground'
                      : isCurrent
                        ? 'bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2 ring-offset-background'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : stepNumber}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${isCurrent ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {step.label}
                </span>
              </div>
              {index < WIZARD_STEPS.length - 1 && (
                <div className={`mx-2 h-0.5 flex-1 rounded-full transition-colors ${isCompleted ? 'bg-primary' : 'bg-muted'}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderWizardFooter = () => {
    if (wizardStep === 1) {
      return (
        <div className="admin-modal__footer px-6 py-4">
          <div className="flex flex-wrap justify-end gap-3">
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="button" disabled={saving} onClick={handleWizardStep1Save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar e continuar'}
            </Button>
          </div>
        </div>
      );
    }

    if (wizardStep === 5) {
      return (
        <div className="admin-modal__footer px-6 py-4">
          <div className="flex flex-wrap justify-between gap-3">
            <Button type="button" variant="outline" onClick={() => setWizardStep(4)}>Voltar</Button>
            <Button type="button" disabled={saving} onClick={() => handleWizardStepSave()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Finalizar cadastro'}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="admin-modal__footer px-6 py-4">
        <div className="flex flex-wrap justify-between gap-3">
          <Button type="button" variant="outline" onClick={() => setWizardStep(wizardStep - 1)}>Voltar</Button>
          <Button type="button" disabled={saving} onClick={() => handleWizardStepSave(wizardStep + 1)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continuar'}
          </Button>
        </div>
      </div>
    );
  };

  const renderWizardContent = () => (
    <div className="flex h-full flex-col overflow-hidden">
      {renderWizardProgress()}
      <div className="admin-modal__body flex-1 overflow-y-auto px-6 py-4">
        {wizardStep === 1 && renderDadosFields()}
        {wizardStep === 2 && renderLogoFields()}
        {wizardStep === 3 && renderRedirecionamentoFields()}
        {wizardStep === 4 && renderContatoFields()}
        {wizardStep === 5 && renderExibicaoFields()}
      </div>
      {renderWizardFooter()}
    </div>
  );

  const renderEditContent = () => (
    <form onSubmit={handleSubmit} className="flex h-full flex-col overflow-hidden">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col overflow-hidden">
        <TabsList className="admin-modal__tabs flex h-auto w-full flex-wrap justify-start gap-1 px-6 py-2">
          <TabsTrigger value="dados" className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80">
            <User className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">Dados gerais</span>
          </TabsTrigger>
          <TabsTrigger value="logo" className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80">
            <Image className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">Logo</span>
          </TabsTrigger>
          <TabsTrigger value="redirecionamento" className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80">
            <Globe className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">Redirecionamento</span>
          </TabsTrigger>
          <TabsTrigger value="contato" className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80">
            <Phone className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">Contato</span>
          </TabsTrigger>
          <TabsTrigger value="exibicao" className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80">
            <Eye className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">Exibição</span>
          </TabsTrigger>
        </TabsList>
        <div className="admin-modal__body flex-1 overflow-y-auto px-6 py-4">
          <TabsContent value="dados" className="mt-0">{renderDadosFields()}</TabsContent>
          <TabsContent value="logo" className="mt-0">{renderLogoFields()}</TabsContent>
          <TabsContent value="redirecionamento" className="mt-0">{renderRedirecionamentoFields()}</TabsContent>
          <TabsContent value="contato" className="mt-0">{renderContatoFields()}</TabsContent>
          <TabsContent value="exibicao" className="mt-0">{renderExibicaoFields()}</TabsContent>
        </div>
      </Tabs>
      <div className="admin-modal__footer px-6 py-4">
        <div className="flex flex-wrap justify-end gap-3">
          <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
          </Button>
        </div>
      </div>
    </form>
  );

  return (
    <AdminLayout>
      <div className="page-container">
        <PageHeader
          title="Parceiros Comerciais"
          description="Gerencie empresas parceiras que mantêm relacionamento institucional com sua empresa. Restaurantes, hotéis, lojas e demais parceiros recorrentes."
          actions={
            <Dialog
              open={dialogOpen}
              onOpenChange={(open) => {
                setDialogOpen(open);
                if (!open) resetForm();
              }}
            >
              <DialogTrigger asChild>
                <Button onClick={handleNewPartner}>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo parceiro
                </Button>
              </DialogTrigger>
              <DialogContent className="admin-modal flex h-[90vh] max-h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 p-0">
                <DialogHeader className="admin-modal__header px-6 py-4">
                  <DialogTitle>
                    {isCreateWizardMode ? 'Novo parceiro comercial' : 'Editar parceiro comercial'}
                  </DialogTitle>
                </DialogHeader>
                {isCreateWizardMode ? renderWizardContent() : renderEditContent()}
              </DialogContent>
            </Dialog>
          }
        />

        {/* KPIs */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:mb-6 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
          <StatsCard label="Total de parceiros" value={stats.total} icon={Briefcase} className="col-span-2 min-h-0 p-3 sm:col-span-1 sm:p-4" />
          <StatsCard label="Parceiros ativos" value={stats.ativos} icon={Briefcase} variant="success" className="min-h-0 p-3 sm:p-4" />
          <StatsCard label="Premium" value={stats.premium} icon={Star} variant="warning" className="min-h-0 p-3 sm:p-4" />
          <StatsCard label="Destaque" value={stats.destaque} icon={Star} className="min-h-0 p-3 sm:p-4" />
        </div>

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
              onChange: (value) => setFilters({ ...filters, status: value as PartnerFilters['status'] }),
              options: [
                { value: 'all', label: 'Todos' },
                { value: 'ativo', label: 'Ativo' },
                { value: 'inativo', label: 'Inativo' },
              ],
            },
            {
              id: 'tier',
              label: 'Nível',
              placeholder: 'Nível',
              value: filters.tier,
              onChange: (value) => setFilters({ ...filters, tier: value as PartnerFilters['tier'] }),
              options: [
                { value: 'all', label: 'Todos' },
                { value: 'basico', label: 'Básico' },
                { value: 'destaque', label: 'Destaque' },
                { value: 'premium', label: 'Premium' },
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
        ) : filteredPartners.length === 0 ? (
          <EmptyState
            icon={<Briefcase className="h-8 w-8 text-muted-foreground" />}
            title="Nenhum parceiro encontrado"
            description="Cadastre empresas parceiras que mantêm relacionamento com sua empresa."
            action={
              <Button onClick={handleNewPartner}>
                <Plus className="h-4 w-4 mr-2" />
                Novo parceiro
              </Button>
            }
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="hidden sm:table-cell">Logo</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Nível</TableHead>
                    <TableHead className="hidden md:table-cell">Ordem</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[60px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPartners.map((partner) => (
                    <TableRow key={partner.id} className="align-top">
                      <TableCell className="hidden sm:table-cell py-3 sm:py-4">
                        {partner.logo_url ? (
                          <div className="h-10 w-10 overflow-hidden rounded-md border bg-muted">
                            <img src={partner.logo_url} alt={`Logo ${partner.name}`} className="h-full w-full object-contain p-1" />
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sem logo</span>
                        )}
                      </TableCell>
                      <TableCell className="py-3 sm:py-4">
                        {/* Mobile: bloco principal concentra identificação e contexto comercial. */}
                        <div className="space-y-1">
                          <p className="font-medium leading-tight">{partner.name}</p>
                          <p className="text-xs text-muted-foreground md:hidden">Ordem: {partner.display_order}</p>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 sm:py-4">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          partner.partner_tier === 'premium'
                            ? 'bg-warning/10 text-warning'
                            : partner.partner_tier === 'destaque'
                              ? 'bg-primary/10 text-primary'
                              : 'bg-muted text-muted-foreground'
                        }`}>
                          {TIER_LABELS[partner.partner_tier]}{partner.partner_tier === 'destaque' ? ' ⭐' : partner.partner_tier === 'premium' ? ' 🔥' : ''}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell py-3 sm:py-4">{partner.display_order}</TableCell>
                      <TableCell className="py-3 sm:py-4">
                        <StatusBadge status={partner.status} />
                      </TableCell>
                      <TableCell className="py-3 sm:py-4">
                        {/* Mobile: melhora pista visual de ações sem adicionar botões extras. */}
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-[11px] font-medium text-muted-foreground md:hidden">Ações</span>
                          <div className="rounded-md border border-border/60 bg-muted/30">
                            <ActionsDropdown actions={getPartnerActions(partner)} />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Preview da logo */}
        <Dialog open={imagePreviewOpen} onOpenChange={setImagePreviewOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Pré-visualização da logo</DialogTitle></DialogHeader>
            {form.logo_url ? (
              <div className="flex justify-center">
                <img src={form.logo_url} alt="Pré-visualização da logo do parceiro" className="w-full max-w-[400px] rounded-lg border object-contain" />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma logo selecionada.</p>
            )}
          </DialogContent>
        </Dialog>

        {/* AlertDialog de confirmação para exclusão */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir parceiro</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir <strong>{deleteTarget?.name}</strong>? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
}
