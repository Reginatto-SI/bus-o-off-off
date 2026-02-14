import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Company } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/admin/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { FileText, IdCard, Loader2, MapPin, Phone, CreditCard, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { buildDebugToastMessage, logSupabaseError } from '@/lib/errorDebug';
import { Navigate, useSearchParams } from 'react-router-dom';
import { CityAutocomplete } from '@/components/ui/city-autocomplete';

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
  const [searchParams] = useSearchParams();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [stripeConnecting, setStripeConnecting] = useState(false);
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

  const hydrateFormFromCompany = (data: Company | null) => {
    // Comentário: mantém o formulário consistente com o registro único da empresa ativa.
    setEditingId(data?.id ?? null);
    setForm({
      legal_name: data?.legal_name ?? '',
      trade_name: data?.trade_name ?? data?.name ?? '',
      cnpj: data?.cnpj ?? data?.document ?? '',
      email: data?.email ?? '',
      phone: data?.phone ?? '',
      whatsapp: data?.whatsapp ?? '',
      website: data?.website ?? '',
      address: data?.address ?? '',
      city: data?.city ?? '',
      state: (data?.state ?? '').toUpperCase(),
      notes: data?.notes ?? '',
      logo_url: data?.logo_url ?? '',
    });
  };

  const fetchCompany = async () => {
    setLoading(true);

    const baseQuery = supabase.from('companies').select('*');
    const { data, error } = activeCompanyId
      ? await baseQuery.eq('id', activeCompanyId).maybeSingle()
      : await baseQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();

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
      setCompany((data ?? null) as Company | null);
      hydrateFormFromCompany((data ?? null) as Company | null);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCompany();
  }, [activeCompanyId]);

  // Handle Stripe return from onboarding
  useEffect(() => {
    const stripeParam = searchParams.get('stripe');
    if (stripeParam === 'complete') {
      toast.success('Onboarding Stripe concluído! Os dados serão atualizados.');
      fetchCompany();
    } else if (stripeParam === 'refresh') {
      toast.info('O onboarding Stripe precisa ser retomado.');
    }
  }, [searchParams]);

  const handleConnectStripe = async () => {
    if (!editingId) {
      toast.error('Salve a empresa antes de conectar o Stripe');
      return;
    }

    setStripeConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-connect-account', {
        body: { company_id: editingId },
      });

      if (error) throw error;

      if (data?.already_complete && data?.dashboard_url) {
        window.open(data.dashboard_url, '_blank');
        toast.success('Stripe já está conectado. Abrindo painel...');
        fetchCompany();
      } else if (data?.onboarding_url) {
        window.open(data.onboarding_url, '_blank');
        toast.info('Complete o cadastro na aba do Stripe que foi aberta.');
      }
    } catch (err) {
      console.error('Stripe connect error:', err);
      toast.error('Erro ao conectar Stripe. Tente novamente.');
    } finally {
      setStripeConnecting(false);
    }
  };

  const resetForm = () => {
    // Comentário: volta ao estado atual da empresa quando disponível.
    if (company) {
      hydrateFormFromCompany(company);
      return;
    }
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
      resetForm();
      fetchCompany();
    }
    setSaving(false);
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
      fetchCompany();
      toast.success('Logo atualizada');
    }

    setLogoUploading(false);
  };

  if (!isGerente && !isOperador) {
    return <Navigate to="/admin/eventos" replace />;
  }

  return (
    <AdminLayout>
      <div className="p-4 lg:p-8 space-y-6">
        <PageHeader
          title="Empresa"
          description="Dados cadastrais e informações institucionais da empresa"
        />

        {loading ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-60" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </CardContent>
            </Card>
          </div>
        ) : (
          <form className="space-y-6" onSubmit={handleSubmit}>
            <Card>
              <CardHeader>
                <CardTitle>Dados da Empresa</CardTitle>
                <CardDescription>
                  {company
                    ? 'Atualize as informações cadastrais da empresa.'
                    : 'Cadastre os dados da empresa ativa para começar.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tabs defaultValue="dados" className="space-y-4">
                  <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2">
                    <TabsTrigger
                      value="dados"
                      className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap"
                    >
                      <IdCard className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 truncate">Dados Gerais</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="endereco"
                      className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap"
                    >
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 truncate">Endereço</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="contato"
                      className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap"
                    >
                      <Phone className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 truncate">Contato</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="observacoes"
                      className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap"
                    >
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 truncate">Observações</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="pagamentos"
                      className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap"
                    >
                      <CreditCard className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 truncate">Pagamentos</span>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="dados" className="mt-0 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-[180px,1fr]">
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
                    {/* Comentário: layout responsivo compacto (1 col mobile, 2 col md, 3 col desktop). */}
                    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
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
                    {/* Comentário: ordem lógica e grid compacto para reduzir rolagem no desktop. */}
                    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                      {/* Comentário: address é um campo único no schema; mantemos granularidade mínima para não inventar colunas. */}
                      <div className="space-y-2 md:col-span-2 lg:col-span-3">
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
                        <CityAutocomplete
                          value={{ city: form.city, state: form.state }}
                          onChange={({ city, state }) => setForm({ ...form, city, state })}
                          placeholder="Ex: São Paulo — SP"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="state">UF</Label>
                        {/* Comentário: UF é preenchida automaticamente pelo autocomplete de cidade. */}
                        <Input
                          id="state"
                          value={form.state}
                          readOnly
                          className="bg-muted"
                          placeholder="SP"
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="contato" className="mt-0">
                    {/* Comentário: layout responsivo compacto para dados de contato. */}
                    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
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
                      <div className="space-y-2 md:col-span-2 lg:col-span-3">
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

                  <TabsContent value="pagamentos" className="mt-0">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium">Integração Stripe</h3>
                          <p className="text-sm text-muted-foreground">
                            Conecte sua conta Stripe para receber pagamentos online.
                          </p>
                        </div>
                        {company?.stripe_onboarding_complete ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Conectado
                          </Badge>
                        ) : company?.stripe_account_id ? (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Pendente
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Não conectado</Badge>
                        )}
                      </div>

                      {company?.stripe_onboarding_complete ? (
                        <div className="space-y-3">
                          <p className="text-sm text-muted-foreground">
                            Sua conta Stripe está conectada e pronta para receber pagamentos.
                            A plataforma retém automaticamente 7,5% de comissão sobre cada venda.
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleConnectStripe}
                            disabled={stripeConnecting}
                          >
                            {stripeConnecting ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <ExternalLink className="h-4 w-4 mr-2" />
                            )}
                            Acessar Painel Stripe
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-sm text-muted-foreground">
                            {company?.stripe_account_id
                              ? 'Seu cadastro no Stripe está incompleto. Clique abaixo para retomar.'
                              : 'Conecte ao Stripe para receber pagamentos de passagens vendidas online.'}
                          </p>
                          <Button
                            type="button"
                            onClick={handleConnectStripe}
                            disabled={stripeConnecting}
                          >
                            {stripeConnecting ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <CreditCard className="h-4 w-4 mr-2" />
                            )}
                            {company?.stripe_account_id ? 'Retomar Cadastro Stripe' : 'Conectar Stripe'}
                          </Button>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={resetForm}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </AdminLayout>
  );
}
