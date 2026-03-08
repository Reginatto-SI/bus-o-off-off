import { useCallback, useEffect, useRef, useState } from 'react';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { FileText, IdCard, Loader2, MapPin, Phone, CreditCard, ExternalLink, CheckCircle2, AlertCircle, Eye, Palette, Link2, Copy, Download, QrCode, Store } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BrandIdentityTab } from '@/components/admin/BrandIdentityTab';
import { toast } from 'sonner';
import { buildDebugToastMessage, logSupabaseError } from '@/lib/errorDebug';
import { Navigate, useSearchParams } from 'react-router-dom';
import { CityAutocomplete } from '@/components/ui/city-autocomplete';
import { isReservedPublicSlug, normalizePublicSlug } from '@/lib/publicSlug';
import { downloadShowcaseQrPng, downloadShowcaseQrSvg } from '@/lib/showcaseShare';
import { QRCodeSVG } from 'qrcode.react';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LOGO_SIZE_MB = 2;
const MAX_LOGO_SIZE_BYTES = MAX_LOGO_SIZE_MB * 1024 * 1024;
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
// Comentário: este bucket deve existir no Supabase Storage para permitir o upload da logo.
const COMPANY_LOGO_BUCKET = 'company-logos';

const COMPANY_COVER_BUCKET = 'company-covers';
const MAX_COVER_SIZE_MB = 5;
const MAX_COVER_SIZE_BYTES = MAX_COVER_SIZE_MB * 1024 * 1024;
const ALLOWED_COVER_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];


function isBucketMissingErrorMessage(message?: string | null) {
  const normalized = (message ?? '').toLowerCase();
  return (
    normalized.includes('bucket')
    && (normalized.includes('not found') || normalized.includes('does not exist') || normalized.includes('não encontrado'))
  );
}

const getCnpjDigits = (value: string) => value.replace(/\D/g, '').slice(0, 14);
const getCpfDigits = (value: string) => value.replace(/\D/g, '').slice(0, 11);
const getDocumentDigits = (value: string, legalType: 'PF' | 'PJ') =>
  legalType === 'PF' ? getCpfDigits(value) : getCnpjDigits(value);

const formatCnpjInput = (value: string) => {
  const digits = getCnpjDigits(value);
  if (!digits) return '';
  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2}).*/,
    (_, p1, p2, p3, p4, p5) => `${p1}.${p2}.${p3}/${p4}${p5 ? `-${p5}` : ''}`
  );
};

const formatCpfInput = (value: string) => {
  const digits = getCpfDigits(value);
  if (!digits) return '';
  return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{0,2}).*/, (_, p1, p2, p3, p4) =>
    `${p1}.${p2}.${p3}${p4 ? `-${p4}` : ''}`
  );
};

const isValidCpf = (value: string) => {
  const cpf = getCpfDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calcDigit = (base: string, factor: number) => {
    const total = base
      .split('')
      .reduce((sum, current, index) => sum + Number(current) * (factor - index), 0);
    const remainder = (total * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  const digit1 = calcDigit(cpf.slice(0, 9), 10);
  const digit2 = calcDigit(cpf.slice(0, 10), 11);
  return digit1 === Number(cpf[9]) && digit2 === Number(cpf[10]);
};

const isValidCnpj = (value: string) => {
  const cnpj = getCnpjDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

  const calcDigit = (base: string, weights: number[]) => {
    const total = base
      .split('')
      .reduce((sum, current, index) => sum + Number(current) * weights[index], 0);
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const digit1 = calcDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const digit2 = calcDigit(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digit1 === Number(cnpj[12]) && digit2 === Number(cnpj[13]);
};

const getCompanyDisplayNameForPersistence = ({
  legalType,
  tradeName,
  legalName,
  fullName,
}: {
  legalType: 'PF' | 'PJ';
  tradeName: string;
  legalName: string;
  fullName: string;
}) => {
  // Comentário de manutenção: mantemos uma regra única e explícita para `companies.name`
  // e evitamos fallback implícito entre PF/PJ durante troca de tipo cadastral.
  if (legalType === 'PJ') return tradeName || legalName;
  return tradeName || fullName;
};

export default function CompanyPage() {
  const { activeCompanyId, user, isGerente, isOperador, isDeveloper, updateActiveCompany } = useAuth();
  const [searchParams] = useSearchParams();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [stripeConnecting, setStripeConnecting] = useState(false);
  const [form, setForm] = useState({
    legal_type: 'PJ' as 'PF' | 'PJ',
    full_name: '',
    legal_name: '',
    trade_name: '',
    document_number: '',
    email: '',
    phone: '',
    whatsapp: '',
    website: '',
    address: '',
    city: '',
    state: '',
    notes: '',
    logo_url: '',
    public_slug: '',
    // Vitrine pública (Fase 1)
    cover_image_url: '',
    intro_text: '',
    background_style: 'solid' as 'solid' | 'subtle_gradient' | 'cover_overlay',
  });
  const [brandColors, setBrandColors] = useState({
    primary: '#F97316',
    accent: '#2563EB',
    ticket: '#F97316',
  });
  const [slugCheckLoading, setSlugCheckLoading] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const showcaseQrRef = useRef<HTMLDivElement | null>(null);

  const normalizedPublicSlug = normalizePublicSlug(form.public_slug);
  const isReservedSlug = normalizedPublicSlug ? isReservedPublicSlug(normalizedPublicSlug) : false;
  const shortLink = normalizedPublicSlug ? `https://www.smartbusbr.com.br/${normalizedPublicSlug}` : 'https://www.smartbusbr.com.br/{nick}';
  const canonicalLink = normalizedPublicSlug ? `https://www.smartbusbr.com.br/empresa/${normalizedPublicSlug}` : 'https://www.smartbusbr.com.br/empresa/{nick}';
  const canRenderShowcaseQr = normalizedPublicSlug.length > 0 && !isReservedSlug && slugAvailable === true;

  const getShowcaseQrFileBaseName = () => `qrcode-vitrine-${normalizedPublicSlug || 'nick'}`;

  const handleDownloadShowcaseQrSvg = () => {
    if (!canRenderShowcaseQr) {
      toast.error('Configure um nick válido para exportar o QR Code');
      return;
    }

    const result = downloadShowcaseQrSvg(showcaseQrRef.current, getShowcaseQrFileBaseName());
    if (result !== 'ok') {
      toast.error('Erro ao gerar SVG do QR Code');
      return;
    }

    toast.success('QR Code SVG baixado!');
  };

  const handleDownloadShowcaseQrPng = async () => {
    if (!canRenderShowcaseQr) {
      toast.error('Configure um nick válido para exportar o QR Code');
      return;
    }

    const result = await downloadShowcaseQrPng(showcaseQrRef.current, getShowcaseQrFileBaseName());
    if (result === 'missing_svg') {
      toast.error('Erro ao gerar PNG do QR Code');
      return;
    }

    if (result === 'render_error') {
      toast.error('Erro ao renderizar PNG do QR Code');
      return;
    }

    if (result === 'export_error') {
      toast.error('Erro ao exportar PNG do QR Code');
      return;
    }

    if (result === 'process_error') {
      toast.error('Erro ao processar QR Code para download');
      return;
    }

    toast.success('QR Code PNG baixado!');
  };

  const hydrateFormFromCompany = (data: Company | null) => {
    const legalType = data?.legal_type === 'PF' ? 'PF' : 'PJ';
    const legacyDocument = data?.document_number ?? data?.cnpj ?? data?.document ?? '';
    const normalizedDocument = legalType === 'PF'
      ? formatCpfInput(legacyDocument)
      : formatCnpjInput(legacyDocument);

    // Comentário: mantém o formulário consistente com o registro único da empresa ativa.
    setEditingId(data?.id ?? null);
    setForm({
      legal_type: legalType,
      full_name: legalType === 'PF' ? (data?.name ?? data?.legal_name ?? '') : '',
      legal_name: data?.legal_name ?? '',
      trade_name: data?.trade_name ?? data?.name ?? '',
      document_number: normalizedDocument,
      email: data?.email ?? '',
      phone: data?.phone ?? '',
      whatsapp: data?.whatsapp ?? '',
      website: data?.website ?? '',
      address: data?.address ?? '',
      city: data?.city ?? '',
      state: (data?.state ?? '').toUpperCase(),
      notes: data?.notes ?? '',
      logo_url: data?.logo_url ?? '',
      public_slug: data?.public_slug ?? '',
      // Vitrine pública (Fase 1): hydrate dos novos campos
      cover_image_url: data?.cover_image_url ?? '',
      intro_text: data?.intro_text ?? '',
      background_style: data?.background_style ?? 'solid',
    });
    // Comentário: mantém as cores da identidade visual dentro do payload principal do formulário.
    setBrandColors({
      primary: data?.primary_color ?? '#F97316',
      accent: data?.accent_color ?? '#2563EB',
      ticket: data?.ticket_color ?? '#F97316',
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

  const [capabilitiesReady, setCapabilitiesReady] = useState<boolean | null>(null);
  const [capabilitiesDetail, setCapabilitiesDetail] = useState<{ transfers: string; card_payments: string } | null>(null);
  const [pixEnabled, setPixEnabled] = useState<boolean | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollingRef = useRef(false);

  // Centralized function to refresh Stripe status
  const refreshStripeStatus = useCallback(async (companyId: string): Promise<boolean> => {
    if (pollingRef.current) return false;
    pollingRef.current = true;
    try {
      const { data, error } = await supabase.functions.invoke('create-connect-account', {
        body: { company_id: companyId },
      });
      if (error) {
        console.warn('refreshStripeStatus error:', error);
        return false;
      }
      if (data?.capabilities_ready !== undefined) {
        setCapabilitiesReady(data.capabilities_ready);
      }
      if (data?.capabilities) {
        setCapabilitiesDetail(data.capabilities);
      }
      await fetchCompany();
      return !!data?.capabilities_ready;
    } catch (err) {
      console.warn('refreshStripeStatus exception:', err);
      return false;
    } finally {
      pollingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchCompany();
  }, [activeCompanyId]);

  useEffect(() => {
    // Comentário: valida disponibilidade do nick com debounce para reduzir chamadas ao banco.
    const hasSlug = normalizedPublicSlug.length > 0;
    if (!hasSlug) {
      setSlugAvailable(null);
      setSlugCheckLoading(false);
      return;
    }

    if (isReservedSlug) {
      setSlugAvailable(false);
      setSlugCheckLoading(false);
      return;
    }

    setSlugCheckLoading(true);
    const timeoutId = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc('is_company_public_slug_available', {
        input_slug: normalizedPublicSlug,
        current_company_id: editingId,
      });

      if (error) {
        setSlugAvailable(null);
      } else {
        setSlugAvailable(Boolean(data));
      }
      setSlugCheckLoading(false);
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [normalizedPublicSlug, editingId, isReservedSlug]);

  // Handle Stripe return from onboarding — trigger immediate refresh + start polling
  useEffect(() => {
    const stripeParam = searchParams.get('stripe');
    if (stripeParam === 'complete') {
      toast.success('Onboarding Stripe concluído! Verificando status...');
      if (editingId) {
        setIsPolling(true);
        refreshStripeStatus(editingId);
      } else {
        fetchCompany();
      }
    } else if (stripeParam === 'refresh') {
      toast.info('O onboarding Stripe precisa ser retomado.');
    }
  }, [searchParams]);

  // Polling: auto-refresh while stripe_account_id exists but capabilities not ready
  useEffect(() => {
    if (!editingId || !company?.stripe_account_id || capabilitiesReady === true) {
      setIsPolling(false);
      return;
    }
    if (!isPolling) return;

    let attempts = 0;
    const MAX_ATTEMPTS = 10;
    const INTERVAL_MS = 3000;

    const interval = setInterval(async () => {
      attempts++;
      const ready = await refreshStripeStatus(editingId);
      if (ready || attempts >= MAX_ATTEMPTS) {
        clearInterval(interval);
        setIsPolling(false);
        if (ready) {
          toast.success('Stripe conectado e ativo!');
        } else {
          toast.info('Status ainda pendente. Use o botão "Atualizar status" para verificar novamente.');
        }
      }
    }, INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [isPolling, editingId, company?.stripe_account_id, capabilitiesReady]);

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

      if (error) {
        // Edge function returns structured error in data even on non-2xx
        const errData = data || {};
        if (errData.action_url) {
          toast.error(errData.error || 'Erro na configuração do Stripe', {
            duration: 10000,
            action: {
              label: 'Abrir Stripe',
              onClick: () => window.open(errData.action_url, '_blank'),
            },
          });
          return;
        }
        throw new Error(errData.error || error.message);
      }

      // Update capabilities status from response
      if (data?.capabilities_ready !== undefined) {
        setCapabilitiesReady(data.capabilities_ready);
      }
      if (data?.capabilities) {
        setCapabilitiesDetail(data.capabilities);
      }

      if (data?.already_complete && data?.dashboard_url) {
        window.open(data.dashboard_url, '_blank');
        if (data.capabilities_ready) {
          toast.success('Stripe conectado e ativo. Abrindo painel...');
        } else {
          toast.warning('Stripe conectado, mas as capabilities ainda não foram ativadas. Aguarde a aprovação do Stripe.');
        }
        fetchCompany();
      } else if (data?.onboarding_url) {
        window.open(data.onboarding_url, '_blank');
        toast.info('Complete o cadastro na aba do Stripe que foi aberta.');
      }
    } catch (err: unknown) {
      console.error('Stripe connect error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erro ao conectar Stripe. Tente novamente.';
      toast.error(errorMessage);
    } finally {
      setStripeConnecting(false);
    }
  };

  const handleCheckStripeStatus = async () => {
    if (!editingId) return;
    setStripeConnecting(true);
    try {
      const ready = await refreshStripeStatus(editingId);
      if (ready) {
        toast.success('Capabilities ativas! Pagamentos online prontos.');
      } else {
        toast.info('Capabilities ainda pendentes. Aguarde a aprovação do Stripe.');
      }
    } catch (err) {
      console.error('Stripe status check error:', err);
      toast.error('Erro ao verificar status. Tente novamente.');
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
      legal_type: 'PJ',
      full_name: '',
      legal_name: '',
      trade_name: '',
      document_number: '',
      email: '',
      phone: '',
      whatsapp: '',
      website: '',
      address: '',
      city: '',
      state: '',
      notes: '',
      logo_url: '',
      public_slug: '',
      cover_image_url: '',
      intro_text: '',
      background_style: 'solid',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    // Hardening Fase 1: somente gerente/developer pode editar empresa.
    // O banco já bloqueia via RLS, mas a UI deve refletir isso para consistência.
    const canEdit = isGerente || isDeveloper;
    if (!canEdit) {
      toast.error('Somente gerentes podem editar dados da empresa');
      setSaving(false);
      return;
    }

    const legalName = form.legal_name.trim();
    const fullName = form.full_name.trim();
    const tradeName = form.trade_name.trim();
    const legalType = form.legal_type;

    if (!legalType) {
      toast.error('Selecione o tipo de cadastro');
      setSaving(false);
      return;
    }

    // Comentário de manutenção (PF/PJ):
    // 1) O tipo jurídico explícito evita ambiguidade entre Empresa e Pessoa Física.
    // 2) Campos obrigatórios mudam por tipo e essa validação mantém consistência para
    //    vitrine pública, pagamentos e relatórios, que dependem de documento fiscal válido.
    if (legalType === 'PJ' && (!legalName || !tradeName)) {
      toast.error('Preencha Razão Social e Nome Fantasia');
      setSaving(false);
      return;
    }

    if (legalType === 'PF' && !fullName) {
      toast.error('Preencha o Nome Completo');
      setSaving(false);
      return;
    }

    const normalizedDocumentDigits = getDocumentDigits(form.document_number, legalType);

    if (legalType === 'PJ' && !isValidCnpj(normalizedDocumentDigits)) {
      toast.error('CNPJ inválido');
      setSaving(false);
      return;
    }

    if (legalType === 'PF' && !isValidCpf(normalizedDocumentDigits)) {
      toast.error('CPF inválido');
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

    if (form.public_slug && isReservedSlug) {
      toast.error('Este nick é reservado e não pode ser utilizado');
      setSaving(false);
      return;
    }

    if (form.public_slug && slugAvailable === false) {
      toast.error('Este nick já está em uso por outra empresa');
      setSaving(false);
      return;
    }

    // Comentário de manutenção:
    // - Persistimos documento sempre com apenas dígitos para evitar divergência entre máscara/UI e banco.
    // - Mantemos `document` e `cnpj` por compatibilidade legada, mas no mesmo padrão normalizado.
    // - `companies.name` segue regra explícita por tipo jurídico para evitar fallback incorreto em trocas PF/PJ.
    const persistedDisplayName = getCompanyDisplayNameForPersistence({
      legalType,
      tradeName,
      legalName,
      fullName,
    });

    if (!persistedDisplayName) {
      toast.error('Preencha um nome de exibição válido para a empresa');
      setSaving(false);
      return;
    }

    const payload = {
      name: persistedDisplayName,
      legal_type: legalType,
      legal_name: legalType === 'PJ' ? (legalName || null) : null,
      trade_name: tradeName || null,
      cnpj: legalType === 'PJ' ? normalizedDocumentDigits : null,
      document: normalizedDocumentDigits || null,
      document_number: normalizedDocumentDigits || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      website: form.website.trim() || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim().toUpperCase() || null,
      notes: form.notes.trim() || null,
      logo_url: form.logo_url?.trim() || null,
      public_slug: normalizedPublicSlug || null,
      primary_color: brandColors.primary || null,
      accent_color: brandColors.accent || null,
      ticket_color: brandColors.ticket || null,
      // Vitrine pública (Fase 1): novos campos persistidos
      cover_image_url: form.cover_image_url?.trim() || null,
      intro_text: form.intro_text?.trim() || null,
      background_style: form.background_style,
    };

    let error;
    let savedCompany: Company | null = null;
    if (editingId) {
      const response = await supabase
        .from('companies')
        .update(payload)
        .eq('id', editingId)
        .select('*')
        .single();
      error = response.error;
      savedCompany = (response.data as Company | null) ?? null;
    } else {
      const response = await supabase
        .from('companies')
        .insert([payload])
        .select('*')
        .single();
      error = response.error;
      savedCompany = (response.data as Company | null) ?? null;
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

      // Comentário: sincroniza imediatamente a empresa ativa para reaplicar as cores sem refresh manual.
      if (savedCompany?.id && savedCompany.id === activeCompanyId) {
        updateActiveCompany(savedCompany);
      }

      if (savedCompany) {
        setCompany(savedCompany);
        hydrateFormFromCompany(savedCompany);
      } else {
        resetForm();
        fetchCompany();
      }
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

      if (isBucketMissingErrorMessage(uploadError.message)) {
        toast.error('Não foi possível enviar a logo agora porque o bucket de armazenamento ainda não está disponível. Tente novamente em instantes ou contate o suporte.');
      } else {
        toast.error(
          buildDebugToastMessage({
            title: 'Erro ao enviar logo',
            error: uploadError,
            context: { action: 'upload', bucket: COMPANY_LOGO_BUCKET, companyId: editingId },
          })
        );
      }
      setLogoUploading(false);
      return;
    }

    const cacheBustedVersion = Date.now();
    const { data } = supabase.storage.from(COMPANY_LOGO_BUCKET).getPublicUrl(fileName);
    const publicUrl = data?.publicUrl ? `${data.publicUrl}?v=${cacheBustedVersion}` : null;

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

  const handleCoverUpload = async (file?: File) => {
    if (!file) return;
    if (!isGerente) {
      toast.error('Apenas gerentes podem alterar a capa');
      return;
    }
    if (!editingId) {
      toast.error('Salve a empresa antes de enviar a capa');
      return;
    }
    if (!ALLOWED_COVER_TYPES.includes(file.type)) {
      toast.error('Formato inválido. Envie JPG, PNG ou WEBP');
      return;
    }
    if (file.size > MAX_COVER_SIZE_BYTES) {
      toast.error(`A imagem deve ter no máximo ${MAX_COVER_SIZE_MB}MB`);
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `cover-${editingId}.${extension}`;

    setCoverUploading(true);

    const { error: uploadError } = await supabase.storage
      .from(COMPANY_COVER_BUCKET)
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      logSupabaseError({
        label: 'Erro ao enviar capa (storage.upload)',
        error: uploadError,
        context: { action: 'upload', bucket: COMPANY_COVER_BUCKET, companyId: editingId, userId: user?.id },
      });
      if (isBucketMissingErrorMessage(uploadError.message)) {
        toast.error('Bucket de armazenamento não disponível. Tente novamente em instantes.');
      } else {
        toast.error(
          buildDebugToastMessage({
            title: 'Erro ao enviar capa',
            error: uploadError,
            context: { action: 'upload', bucket: COMPANY_COVER_BUCKET, companyId: editingId },
          })
        );
      }
      setCoverUploading(false);
      return;
    }

    const cacheBusted = Date.now();
    const { data } = supabase.storage.from(COMPANY_COVER_BUCKET).getPublicUrl(fileName);
    const publicUrl = data?.publicUrl ? `${data.publicUrl}?v=${cacheBusted}` : null;

    if (!publicUrl) {
      toast.error('Não foi possível obter a URL da capa');
      setCoverUploading(false);
      return;
    }

    const { error: updateError } = await supabase
      .from('companies')
      .update({ cover_image_url: publicUrl })
      .eq('id', editingId);

    if (updateError) {
      logSupabaseError({
        label: 'Erro ao salvar capa (companies.update)',
        error: updateError,
        context: { action: 'update', table: 'companies', companyId: editingId, userId: user?.id },
      });
      toast.error('Erro ao salvar capa');
    } else {
      setForm((prev) => ({ ...prev, cover_image_url: publicUrl }));
      fetchCompany();
      toast.success('Imagem de capa atualizada');
    }

    setCoverUploading(false);
  };

  const handleRemoveCover = async () => {
    if (!editingId) return;
    const { error } = await supabase
      .from('companies')
      .update({ cover_image_url: null })
      .eq('id', editingId);

    if (error) {
      toast.error('Erro ao remover capa');
      return;
    }
    setForm((prev) => ({ ...prev, cover_image_url: '' }));
    fetchCompany();
    toast.success('Imagem de capa removida');
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
                      value="identidade"
                      className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap"
                    >
                      <Palette className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 truncate">Identidade Visual</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="pagamentos"
                      className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap"
                    >
                      <CreditCard className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 truncate">Pagamentos</span>
                    </TabsTrigger>
                    {/* Vitrine Pública: aba visível somente para gerente/developer */}
                    {isGerente && (
                      <TabsTrigger
                        value="vitrine"
                        className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap"
                      >
                        <Store className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 truncate">Vitrine Pública</span>
                      </TabsTrigger>
                    )}
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
                    <div className="space-y-3 rounded-md border p-4">
                      <div className="space-y-1">
                        <Label>Tipo de cadastro</Label>
                        <p className="text-xs text-muted-foreground">
                          Escolha o tipo de cadastro para habilitar os campos corretos.
                        </p>
                      </div>
                      <RadioGroup
                        value={form.legal_type}
                        onValueChange={(value: 'PF' | 'PJ') =>
                          setForm((prev) => ({
                            ...prev,
                            // Comentário de manutenção: ao trocar o tipo limpamos campos exclusivos
                            // do tipo anterior para evitar vazamento de contexto entre PF/PJ.
                            legal_type: value,
                            legal_name: value === 'PF' ? '' : prev.legal_name,
                            full_name: value === 'PJ' ? '' : prev.full_name,
                            document_number: value === 'PF'
                              ? formatCpfInput(prev.document_number)
                              : formatCnpjInput(prev.document_number),
                          }))
                        }
                        className="grid gap-2 md:grid-cols-2"
                      >
                        <div className="flex items-center space-x-2 rounded-md border p-3">
                          <RadioGroupItem value="PJ" id="legal_type_pj" />
                          <Label htmlFor="legal_type_pj" className="cursor-pointer">Empresa (CNPJ)</Label>
                        </div>
                        <div className="flex items-center space-x-2 rounded-md border p-3">
                          <RadioGroupItem value="PF" id="legal_type_pf" />
                          <Label htmlFor="legal_type_pf" className="cursor-pointer">Pessoa Fisica (CPF)</Label>
                        </div>
                      </RadioGroup>
                    </div>

                    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                      {form.legal_type === 'PJ' ? (
                        <>
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
                        </>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="full_name">Nome Completo</Label>
                            <Input
                              id="full_name"
                              value={form.full_name}
                              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                              placeholder="Nome completo da pessoa"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="trade_name">Nome público/Apelido da vitrine (opcional)</Label>
                            <Input
                              id="trade_name"
                              value={form.trade_name}
                              onChange={(e) => setForm({ ...form, trade_name: e.target.value })}
                              placeholder="Como deseja aparecer na vitrine"
                            />
                          </div>
                        </>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="document_number">{form.legal_type === 'PJ' ? 'CNPJ' : 'CPF'}</Label>
                        <Input
                          id="document_number"
                          value={form.document_number}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              document_number: form.legal_type === 'PJ'
                                ? formatCnpjInput(e.target.value)
                                : formatCpfInput(e.target.value),
                            })
                          }
                          placeholder={form.legal_type === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00'}
                        />
                      </div>
                      {/* Comentário: inscrição estadual não existe no schema atual, então não exibimos aqui. */}
                    </div>

                    {/* Comentário: card de parâmetros da vitrine pública mantendo padrão visual já usado no admin. */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Vitrine Pública (Link curto)</CardTitle>
                        <CardDescription>
                          Configure o nick para divulgar sua vitrine com um link fácil de compartilhar.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="public_slug">Seu nick (link público)</Label>
                              <Input
                                id="public_slug"
                                value={form.public_slug}
                                onChange={(e) => setForm({ ...form, public_slug: e.target.value })}
                                placeholder="Ex: Viagens São José"
                              />
                            </div>

                            <div className="grid gap-2 rounded-md border p-3 text-sm">
                              <div className="flex items-start gap-2">
                                <Link2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                                <div>
                                  <p className="font-medium">Curto: {shortLink}</p>
                                  <p className="text-muted-foreground">Canônico: {canonicalLink}</p>
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {slugCheckLoading ? (
                                <Badge variant="secondary" className="gap-1">
                                  <Loader2 className="h-3 w-3 animate-spin" /> Validando nick...
                                </Badge>
                              ) : isReservedSlug ? (
                                <Badge variant="destructive" className="gap-1">
                                  <AlertCircle className="h-3 w-3" /> Indisponível (reservado)
                                </Badge>
                              ) : normalizedPublicSlug && slugAvailable === true ? (
                                <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
                                  <CheckCircle2 className="h-3 w-3" /> Disponível
                                </Badge>
                              ) : normalizedPublicSlug && slugAvailable === false ? (
                                <Badge variant="destructive" className="gap-1">
                                  <AlertCircle className="h-3 w-3" /> Indisponível (já em uso)
                                </Badge>
                              ) : (
                                <Badge variant="outline">Digite um nick para validar</Badge>
                              )}

                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={!normalizedPublicSlug}
                                onClick={async () => {
                                  await navigator.clipboard.writeText(shortLink);
                                  toast.success('Link curto copiado!');
                                }}
                              >
                                <Copy className="mr-2 h-4 w-4" />
                                Copiar link curto
                              </Button>
                            </div>

                            <p className="text-xs text-muted-foreground">
                              Evite mudar depois para não quebrar links divulgados.
                            </p>
                          </div>

                          <div className="rounded-md border bg-muted/20 p-3">
                            <div className="space-y-3">
                              <p className="text-sm font-medium">QR Code da vitrine</p>
                              <div className="flex min-h-[220px] items-center justify-center rounded-md border bg-white p-3">
                                {canRenderShowcaseQr ? (
                                  <div ref={showcaseQrRef}>
                                    <QRCodeSVG value={shortLink} size={200} level="H" includeMargin={false} />
                                  </div>
                                ) : (
                                  <div className="space-y-2 text-center text-muted-foreground">
                                    <QrCode className="mx-auto h-8 w-8" />
                                    <p className="text-xs">
                                      Configure um nick válido para gerar o QR Code da vitrine.
                                    </p>
                                  </div>
                                )}
                              </div>

                              <p className="text-center text-xs text-muted-foreground">
                                Escaneie para abrir a vitrine
                              </p>

                              <div className="grid gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="justify-start"
                                  onClick={handleDownloadShowcaseQrPng}
                                  disabled={!canRenderShowcaseQr}
                                >
                                  <Download className="mr-2 h-4 w-4" />
                                  Baixar QR Code (PNG)
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="justify-start"
                                  onClick={handleDownloadShowcaseQrSvg}
                                  disabled={!canRenderShowcaseQr}
                                >
                                  <Download className="mr-2 h-4 w-4" />
                                  Baixar QR Code (SVG)
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
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

                  <TabsContent value="identidade" className="mt-0">
                    <BrandIdentityTab
                      company={company}
                      colors={brandColors}
                      onColorsChange={setBrandColors}
                    />
                  </TabsContent>

                  <TabsContent value="pagamentos" className="mt-0">
                    <div className="space-y-6">
                      {/* Comentário: card de comissionamento é uma área restrita e visível apenas para developer. */}
                      {isDeveloper && (
                        <div className="rounded-lg border p-4 space-y-4">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-medium">Comissionamento da Plataforma</h3>
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Eye className="h-3.5 w-3.5" />
                              Developer Only
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Configure a taxa cobrada pela plataforma e o percentual repassado ao parceiro.
                          </p>
                          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="platform_fee_percent">Taxa da Plataforma (%)</Label>
                              <Input
                                id="platform_fee_percent"
                                type="number"
                                min="0"
                                max="100"
                                step="0.5"
                                value={company?.platform_fee_percent ?? 7.5}
                                onChange={async (e) => {
                                  const val = parseFloat(e.target.value);
                                  if (editingId && !isNaN(val)) {
                                    await supabase.from('companies').update({ platform_fee_percent: val }).eq('id', editingId);
                                    fetchCompany();
                                  }
                                }}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="partner_split_percent">Repasse ao Parceiro (%)</Label>
                              <Input
                                id="partner_split_percent"
                                type="number"
                                min="0"
                                max="100"
                                step="0.5"
                                value={company?.partner_split_percent ?? 50}
                                onChange={async (e) => {
                                  const val = parseFloat(e.target.value);
                                  if (editingId && !isNaN(val)) {
                                    await supabase.from('companies').update({ partner_split_percent: val }).eq('id', editingId);
                                    fetchCompany();
                                  }
                                }}
                              />
                              <p className="text-xs text-muted-foreground">
                                Percentual da comissão da plataforma que será repassado automaticamente ao parceiro via Stripe Transfer.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Integração Stripe */}
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium">Integração Stripe</h3>
                          <p className="text-sm text-muted-foreground">
                            Conecte sua conta para receber pagamentos online. Para Pessoa Física usamos CPF; para Pessoa Jurídica usamos CNPJ.
                          </p>
                        </div>
                        {isPolling ? (
                          <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-blue-200">
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            Verificando...
                          </Badge>
                        ) : company?.stripe_onboarding_complete && capabilitiesReady !== false ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Conectado e ativo
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

                      {/* Polling indicator */}
                      {isPolling && (
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                          <p className="text-blue-700">
                            Verificando vínculo com o Stripe... Aguarde até 30 segundos.
                          </p>
                        </div>
                      )}

                      {/* Capabilities warning */}
                      {!isPolling && capabilitiesReady === false && company?.stripe_account_id && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm space-y-2">
                          <p className="text-amber-800 font-medium">
                            ⚠️ Capabilities ainda não ativas
                          </p>
                          <p className="text-amber-700 text-xs">
                            A conta Stripe foi conectada, mas as capabilities de pagamento ({capabilitiesDetail?.transfers || 'transfers'}: {capabilitiesDetail?.transfers || '?'}, {capabilitiesDetail?.card_payments || 'card_payments'}: {capabilitiesDetail?.card_payments || '?'}) ainda não foram ativadas pelo Stripe.
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleCheckStripeStatus}
                            disabled={stripeConnecting || isPolling}
                          >
                            {stripeConnecting ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : null}
                            Atualizar status
                          </Button>
                        </div>
                      )}

                      {/* Pending status — fallback button */}
                      {!isPolling && company?.stripe_account_id && !company?.stripe_onboarding_complete && capabilitiesReady !== false && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm space-y-2">
                          <p className="text-amber-700">
                            Estamos aguardando confirmação do Stripe. Se você já concluiu o cadastro, clique abaixo para verificar.
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleCheckStripeStatus}
                            disabled={stripeConnecting || isPolling}
                          >
                            {stripeConnecting ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : null}
                            Atualizar status
                          </Button>
                        </div>
                      )}

                      {company?.stripe_onboarding_complete && capabilitiesReady !== false ? (
                        <div className="space-y-3">
                          <p className="text-sm text-muted-foreground">
                            Sua conta Stripe está conectada e pronta para receber pagamentos.
                            A plataforma retém automaticamente <strong>{company?.platform_fee_percent ?? 7.5}%</strong> de comissão sobre cada venda.
                          </p>
                          <div className="flex gap-2">
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
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={handleCheckStripeStatus}
                              disabled={stripeConnecting}
                            >
                              Verificar status
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-sm text-muted-foreground">
                            {company?.stripe_account_id
                              ? 'Seu cadastro no Stripe está incompleto. Clique abaixo para retomar.'
                              : form.legal_type === 'PF'
                                ? 'Conecte ao Stripe usando seus dados de Pessoa Física (CPF) para receber pagamentos.'
                                : 'Conecte ao Stripe usando os dados da Pessoa Jurídica (CNPJ) para receber pagamentos.'}
                          </p>
                          <Button
                            type="button"
                            onClick={handleConnectStripe}
                            disabled={stripeConnecting || isPolling}
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

                  {/* Vitrine Pública (Fase 1): seção visível somente para gerente/developer.
                      Campos controlam a personalização da vitrine /empresa/:slug. */}
                  {isGerente && (
                    <TabsContent value="vitrine" className="mt-0">
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <Label>Imagem de capa (hero)</Label>
                          <input
                            ref={coverInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              void handleCoverUpload(file);
                              event.currentTarget.value = '';
                            }}
                          />
                          {form.cover_image_url && (
                            <div className="mt-1 rounded-md border overflow-hidden" style={{ aspectRatio: '2000/900' }}>
                              <img
                                src={form.cover_image_url}
                                alt="Preview da capa"
                                className="h-full w-full object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            </div>
                          )}
                          <div className="flex gap-2 flex-wrap">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-full sm:w-fit"
                              onClick={() => coverInputRef.current?.click()}
                              disabled={coverUploading}
                            >
                              {coverUploading ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              ) : null}
                              {form.cover_image_url ? 'Alterar imagem' : 'Enviar imagem de capa'}
                            </Button>
                            {form.cover_image_url && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleRemoveCover}
                                className="text-destructive"
                              >
                                Remover imagem
                              </Button>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Tamanho recomendado: 2000 × 900 pixels. Formatos aceitos: JPG, PNG ou WEBP — Máximo: 5MB.
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Dica: Use uma imagem horizontal representando sua empresa ou frota. O centro da imagem será priorizado em telas menores.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="intro_text">
                            Texto de apresentação
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({(form.intro_text || '').length}/400)
                            </span>
                          </Label>
                          <Textarea
                            id="intro_text"
                            value={form.intro_text}
                            onChange={(e) => {
                              if (e.target.value.length <= 400) {
                                setForm({ ...form, intro_text: e.target.value });
                              }
                            }}
                            rows={3}
                            placeholder="Breve apresentação da sua empresa para os clientes..."
                          />
                          <p className="text-xs text-muted-foreground">
                            Exibido abaixo do hero na vitrine pública. Máximo 400 caracteres.
                          </p>
                        </div>

                        {/* Estilo de fundo: enum fechado com 3 opções controladas (evita customização excessiva no MVP). */}
                        <div className="space-y-2">
                          <Label>Estilo de fundo da vitrine</Label>
                          <Select
                            value={form.background_style}
                            onValueChange={(value: 'solid' | 'subtle_gradient' | 'cover_overlay') =>
                              setForm({ ...form, background_style: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o estilo" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="solid">Sólido (cor primária)</SelectItem>
                              <SelectItem value="subtle_gradient">Gradiente suave</SelectItem>
                              <SelectItem value="cover_overlay">Capa com overlay</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            Controla como o hero/topo da vitrine é renderizado. "Capa com overlay" funciona melhor com imagem de capa.
                          </p>
                        </div>
                      </div>
                    </TabsContent>
                  )}
                </Tabs>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={resetForm}>
                Cancelar
              </Button>
              {/* Hardening Fase 1: operador não pode salvar (read-only), alinhado com RLS */}
              <Button type="submit" disabled={saving || (!isGerente && !isDeveloper)}>
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </AdminLayout>
  );
}
