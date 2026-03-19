import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatPhoneBR, normalizePhoneForStorage } from '@/lib/phone';
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
import { FileText, IdCard, Loader2, MapPin, Phone, CreditCard, CheckCircle2, AlertCircle, Eye, Palette, Link2, Copy, Download, QrCode, Store, Share2, AlertTriangle, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BrandIdentityTab } from '@/components/admin/BrandIdentityTab';
import { AsaasOnboardingWizard, AsaasOnboardingCompanyData } from '@/components/admin/AsaasOnboardingWizard';
import { toast } from 'sonner';
import { buildDebugToastMessage, logSupabaseError } from '@/lib/errorDebug';
import { Navigate } from 'react-router-dom';
import { CityAutocomplete } from '@/components/ui/city-autocomplete';
import { isReservedPublicSlug, normalizePublicSlug } from '@/lib/publicSlug';
import { downloadShowcaseQrPng, downloadShowcaseQrSvg } from '@/lib/showcaseShare';
import { QRCodeSVG } from 'qrcode.react';
import { extractAsaasErrorMessage } from '@/lib/asaasError';
import { useRuntimePaymentEnvironment } from '@/hooks/use-runtime-payment-environment';

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
// Comentário de suporte: este link é apenas um atalho para o painel oficial do Asaas
// e não participa da autenticação nem da integração via API do sistema.
const DEFAULT_ASAAS_DASHBOARD_URL = 'https://www.asaas.com';


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
  const { environment: runtimePaymentEnvironment } = useRuntimePaymentEnvironment();
  
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  // stripeConnecting removed — replaced by asaasConnecting
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
    address_number: '',
    province: '',
    postal_code: '',
    city: '',
    state: '',
    notes: '',
    logo_url: '',
    public_slug: '',
    // Vitrine pública (Fase 1)
    cover_image_url: '',
    intro_text: '',
    background_style: 'solid' as 'solid' | 'subtle_gradient' | 'cover_overlay',
    // Redes sociais
    social_instagram: '',
    social_facebook: '',
    social_tiktok: '',
    social_youtube: '',
    social_telegram: '',
    social_twitter: '',
    social_website: '',
    // Padrão para novas empresas: comissão inicial de 3% + 3%.
    platform_fee_percent: '3',
    partner_split_percent: '3',
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
      phone: formatPhoneBR(data?.phone ?? ''),
      whatsapp: formatPhoneBR(data?.whatsapp ?? ''),
      website: data?.website ?? '',
      address: data?.address ?? '',
      address_number: data?.address_number ?? '',
      province: data?.province ?? '',
      postal_code: data?.postal_code ?? '',
      city: data?.city ?? '',
      state: (data?.state ?? '').toUpperCase(),
      notes: data?.notes ?? '',
      logo_url: data?.logo_url ?? '',
      public_slug: data?.public_slug ?? '',
      // Vitrine pública (Fase 1): hydrate dos novos campos
      cover_image_url: data?.cover_image_url ?? '',
      intro_text: data?.intro_text ?? '',
      background_style: data?.background_style ?? 'solid',
      // Redes sociais
      social_instagram: data?.social_instagram ?? '',
      social_facebook: data?.social_facebook ?? '',
      social_tiktok: data?.social_tiktok ?? '',
      social_youtube: data?.social_youtube ?? '',
      social_telegram: data?.social_telegram ?? '',
      social_twitter: data?.social_twitter ?? '',
      social_website: data?.social_website ?? '',
      // Comentário: taxas ficam no estado local do formulário para evitar autosave no onChange
      // e impedir perda de foco durante a digitação de decimais.
      platform_fee_percent: String(data?.platform_fee_percent ?? 3),
      partner_split_percent: String(data?.partner_split_percent ?? 3),
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
  useEffect(() => {
    fetchCompany();
  }, [activeCompanyId]);

  // Slug availability check with debounce
  useEffect(() => {
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


  const [asaasConnecting, setAsaasConnecting] = useState(false);
  const [asaasRevalidating, setAsaasRevalidating] = useState(false);
  const [asaasApiKeyInput, setAsaasApiKeyInput] = useState('');
  const [asaasOnboardingMode, setAsaasOnboardingMode] = useState<'create' | 'link' | null>(null);

  const [asaasWizardOpen, setAsaasWizardOpen] = useState(false);

  const getAsaasWizardCompanyData = (): AsaasOnboardingCompanyData | null => {
    if (!editingId) return null;

    const documentDigits = form.document_number.replace(/\D/g, '');
    return {
      companyId: editingId,
      companyName: form.trade_name.trim() || form.legal_name.trim() || form.full_name.trim(),
      legalType: form.legal_type,
      documentNumber: documentDigits,
      email: form.email.trim(),
      address: form.address.trim(),
      addressNumber: form.address_number.trim(),
      province: form.province.trim(),
      postalCode: (form.postal_code || '').replace(/\D/g, ''),
      city: form.city.trim(),
      state: (form.state || '').trim(),
    };
  };

  const handleConnectAsaasLink = async () => {
    if (!editingId) {
      toast.error('Salve a empresa antes de conectar o Asaas');
      return;
    }

    setAsaasConnecting(true);
    try {
      if (!asaasApiKeyInput.trim()) {
        toast.error('Informe sua API Key do Asaas');
        setAsaasConnecting(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-asaas-account', {
        body: {
          company_id: editingId,
          mode: 'link_existing',
          api_key: asaasApiKeyInput.trim(),
          // Comentário de suporte: mantemos o mesmo contrato explícito de ambiente
          // usado na revalidação para evitar validação/vínculo no endpoint errado.
          target_environment: runtimePaymentEnvironment,
        },
      });
      if (error) {
        // Comentário de suporte: prioriza mensagem retornada pelo Asaas para dar autonomia
        // no autoatendimento, mas filtra mensagens técnicas internas para fallback seguro.
        const { message, statusCode } = await extractAsaasErrorMessage({
          data,
          error,
          fallbackMessage: 'Erro ao conectar Asaas. Tente novamente.',
        });
        const statusSuffix = statusCode ? ` (HTTP ${statusCode})` : '';
        throw new Error(`${message}${statusSuffix}`);
      }

      if (data?.already_complete) {
        toast.success('Conta Asaas já conectada!');
      } else {
        toast.success('Conta Asaas vinculada com sucesso!');
      }

      setAsaasOnboardingMode(null);
      setAsaasApiKeyInput('');
      fetchCompany();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao conectar Asaas. Tente novamente.';
      toast.error(errorMessage);
    } finally {
      setAsaasConnecting(false);
    }
  };

  const handleRevalidateAsaasIntegration = async () => {
    if (!editingId) {
      toast.error('Empresa não identificada para validar integração');
      return;
    }

    setAsaasRevalidating(true);
    try {
      // Comentário de suporte: reutiliza a mesma edge function para validar novamente
      // os dados da conta conectada sem alterar o layout atual do card.
      // Enviamos o ambiente operacional explícito para impedir que preview/produção
      // recalculados por host acabem validando a credencial errada.
      const { data, error } = await supabase.functions.invoke('create-asaas-account', {
        body: {
          company_id: editingId,
          mode: 'revalidate',
          target_environment: runtimePaymentEnvironment,
        },
      });

      if (error) {
        // Comentário de suporte: na revalidação, exibimos a causa retornada pela edge function
        // para evitar mensagem genérica de API Key quando o problema real for outro.
        const { message, statusCode } = await extractAsaasErrorMessage({
          data,
          error,
          fallbackMessage: 'Não foi possível validar a integração com o Asaas. Tente novamente.',
        });
        const statusSuffix = statusCode ? ` (HTTP ${statusCode})` : '';
        throw new Error(`${message}${statusSuffix}`);
      }

      await fetchCompany();
      toast.success('Integração verificada com sucesso');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error
        ? err.message
        : 'Não foi possível validar a integração com o Asaas. Tente novamente.';
      toast.error(errorMessage);
    } finally {
      setAsaasRevalidating(false);
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
      address_number: '',
      province: '',
      postal_code: '',
      city: '',
      state: '',
      notes: '',
      logo_url: '',
      public_slug: '',
      cover_image_url: '',
      intro_text: '',
      background_style: 'solid',
      social_instagram: '',
      social_facebook: '',
      social_tiktok: '',
      social_youtube: '',
      social_telegram: '',
      social_twitter: '',
      social_website: '',
      platform_fee_percent: '3',
      partner_split_percent: '3',
    });
  };

  const normalizePercentInput = (value: string) => value.replace(',', '.').trim();

  const parsePercentInput = (value: string) => {
    const normalized = normalizePercentInput(value);
    if (!normalized) return null;
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return NaN;
    return parsed;
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

    const platformFeePercent = parsePercentInput(form.platform_fee_percent);
    const partnerSplitPercent = parsePercentInput(form.partner_split_percent);

    if (platformFeePercent === null || Number.isNaN(platformFeePercent) || platformFeePercent < 0 || platformFeePercent > 100) {
      toast.error('Taxa da Plataforma deve estar entre 0 e 100');
      setSaving(false);
      return;
    }

    if (partnerSplitPercent === null || Number.isNaN(partnerSplitPercent) || partnerSplitPercent < 0 || partnerSplitPercent > 100) {
      toast.error('Taxa do Sócio deve estar entre 0 e 100');
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
      phone: normalizePhoneForStorage(form.phone) || null,
      whatsapp: normalizePhoneForStorage(form.whatsapp) || null,
      website: form.website.trim() || null,
      address: form.address.trim() || null,
      // Comentário: campos de endereço adicionais exigidos pela API do Asaas.
      address_number: form.address_number.trim() || null,
      province: form.province.trim() || null,
      postal_code: form.postal_code.trim() || null,
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
      // Redes sociais
      social_instagram: form.social_instagram?.trim() || null,
      social_facebook: form.social_facebook?.trim() || null,
      social_tiktok: form.social_tiktok?.trim() || null,
      social_youtube: form.social_youtube?.trim() || null,
      social_telegram: form.social_telegram?.trim() || null,
      social_twitter: form.social_twitter?.trim() || null,
      social_website: form.social_website?.trim() || null,
      // Comentário: persistência das taxas acontece somente no submit (Salvar Empresa)
      // para evitar re-render prematuro e perda de foco nos campos de comissão.
      platform_fee_percent: platformFeePercent,
      partner_split_percent: partnerSplitPercent,
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
                      value="redes"
                      className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap"
                    >
                      <Share2 className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 truncate">Redes Sociais</span>
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
                          placeholder="Rua Exemplo"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="address_number">Número</Label>
                        <Input
                          id="address_number"
                          value={form.address_number}
                          onChange={(e) => setForm({ ...form, address_number: e.target.value })}
                          placeholder="123"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="province">Bairro</Label>
                        <Input
                          id="province"
                          value={form.province}
                          onChange={(e) => setForm({ ...form, province: e.target.value })}
                          placeholder="Centro"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="postal_code">CEP</Label>
                        <Input
                          id="postal_code"
                          value={form.postal_code}
                          onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
                          placeholder="00000-000"
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
                          onChange={(e) => setForm({ ...form, phone: formatPhoneBR(e.target.value) })}
                          placeholder="(00) 00000-0000"
                          maxLength={15}
                          inputMode="tel"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="whatsapp">WhatsApp</Label>
                        <Input
                          id="whatsapp"
                          value={form.whatsapp}
                          onChange={(e) => setForm({ ...form, whatsapp: formatPhoneBR(e.target.value) })}
                          placeholder="(00) 00000-0000"
                          maxLength={15}
                          inputMode="tel"
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

                  <TabsContent value="redes" className="mt-0">
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Adicione os links das redes sociais da sua empresa. Eles serão exibidos na vitrine pública.
                      </p>
                      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="social_instagram">Instagram</Label>
                          <Input
                            id="social_instagram"
                            value={form.social_instagram}
                            onChange={(e) => setForm({ ...form, social_instagram: e.target.value })}
                            placeholder="https://instagram.com/suaempresa"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="social_facebook">Facebook</Label>
                          <Input
                            id="social_facebook"
                            value={form.social_facebook}
                            onChange={(e) => setForm({ ...form, social_facebook: e.target.value })}
                            placeholder="https://facebook.com/suaempresa"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="social_tiktok">TikTok</Label>
                          <Input
                            id="social_tiktok"
                            value={form.social_tiktok}
                            onChange={(e) => setForm({ ...form, social_tiktok: e.target.value })}
                            placeholder="https://tiktok.com/@suaempresa"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="social_youtube">YouTube</Label>
                          <Input
                            id="social_youtube"
                            value={form.social_youtube}
                            onChange={(e) => setForm({ ...form, social_youtube: e.target.value })}
                            placeholder="https://youtube.com/@suaempresa"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="social_telegram">Telegram</Label>
                          <Input
                            id="social_telegram"
                            value={form.social_telegram}
                            onChange={(e) => setForm({ ...form, social_telegram: e.target.value })}
                            placeholder="https://t.me/suaempresa"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="social_twitter">X / Twitter</Label>
                          <Input
                            id="social_twitter"
                            value={form.social_twitter}
                            onChange={(e) => setForm({ ...form, social_twitter: e.target.value })}
                            placeholder="https://x.com/suaempresa"
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label htmlFor="social_website">Site oficial</Label>
                          <Input
                            id="social_website"
                            value={form.social_website}
                            onChange={(e) => setForm({ ...form, social_website: e.target.value })}
                            placeholder="https://www.suaempresa.com.br"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Todos os campos são opcionais. Insira a URL completa (ex: https://instagram.com/suaempresa).
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="pagamentos" className="mt-0">
                    <div className="space-y-6">
                      {/* Comissionamento da Plataforma — Developer Only */}
                      {isDeveloper && (() => {
                        // Comentário de manutenção:
                        // Estes campos usam estado local controlado para permitir digitação fluida
                        // (incluindo decimais com ponto/vírgula) sem disparar salvamento automático.
                        // A persistência ocorre somente no botão "Salvar Empresa" (handleSubmit).
                        const platformFee = parsePercentInput(form.platform_fee_percent) ?? 0;
                        const partnerFee = parsePercentInput(form.partner_split_percent) ?? 0;
                        const totalFee = platformFee + partnerFee;
                        const companyShare = 100 - totalFee;
                        const sumExceeds100 = totalFee > 100;

                        return (
                        <div className="rounded-lg border p-4 space-y-4">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-medium">Comissionamento da Plataforma</h3>
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Eye className="h-3.5 w-3.5" />
                              Developer Only
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Configure a taxa da plataforma e a taxa do sócio para esta empresa. A empresa recebe o restante via split direto no Asaas.
                          </p>
                          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="platform_fee_percent">Taxa da Plataforma (%)</Label>
                              <Input
                                id="platform_fee_percent"
                                type="text"
                                inputMode="decimal"
                                min="0"
                                max="100"
                                step="any"
                                value={form.platform_fee_percent}
                                onChange={(e) => {
                                  const rawValue = e.target.value;
                                  const normalizedValue = rawValue.replace(',', '.');

                                  // Aceita vazio durante edição e números com decimal (ex: 3,5 -> 3.5).
                                  if (/^\d*(\.\d*)?$/.test(normalizedValue)) {
                                    setForm((prev) => ({ ...prev, platform_fee_percent: normalizedValue }));
                                  }
                                }}
                              />
                              <p className="text-xs text-muted-foreground">
                                Comissão retida pela plataforma sobre cada venda online.
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="partner_split_percent">Taxa do Sócio (%)</Label>
                              <Input
                                id="partner_split_percent"
                                type="text"
                                inputMode="decimal"
                                min="0"
                                max="100"
                                step="any"
                                value={form.partner_split_percent}
                                onChange={(e) => {
                                  const rawValue = e.target.value;
                                  const normalizedValue = rawValue.replace(',', '.');

                                  // Mantém edição local para evitar perda de foco causada por autosave.
                                  if (/^\d*(\.\d*)?$/.test(normalizedValue)) {
                                    setForm((prev) => ({ ...prev, partner_split_percent: normalizedValue }));
                                  }
                                }}
                              />
                              <p className="text-xs text-muted-foreground">
                                Percentual enviado diretamente ao sócio ativo via split Asaas. Se zero ou sem sócio ativo, será ignorado.
                              </p>
                            </div>
                          </div>

                          {/* Resumo calculado automaticamente */}
                          <div className="rounded-md bg-muted/50 p-3 space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Taxa total da plataforma:</span>
                              <span className={`font-medium ${sumExceeds100 ? 'text-destructive' : ''}`}>
                                {totalFee.toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Empresa receberá:</span>
                              <span className={`font-medium ${sumExceeds100 ? 'text-destructive' : 'text-green-700'}`}>
                                {companyShare.toFixed(1)}%
                              </span>
                            </div>
                          </div>

                          {sumExceeds100 && (
                            <Alert variant="destructive">
                              <AlertTriangle className="h-4 w-4" />
                              <AlertDescription>
                                A soma das taxas excede 100%. Corrija os valores antes de continuar.
                              </AlertDescription>
                            </Alert>
                          )}
                        </div>
                        );
                      })()}

                      {/* Integração Asaas */}
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium">Integração de Pagamentos</h3>
                          <p className="text-sm text-muted-foreground">
                            Conecte sua conta Asaas para receber pagamentos online via Pix e Cartão.
                          </p>
                        </div>
                        {company?.asaas_onboarding_complete ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Conectado
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Não conectado</Badge>
                        )}
                      </div>

                      {company?.asaas_onboarding_complete ? (
                        <div className="space-y-3">
                          <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-2">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                                <p className="font-medium text-green-800">Pagamentos ativos</p>
                              </div>
                              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => void handleRevalidateAsaasIntegration()}
                                  disabled={asaasRevalidating}
                                  className="w-full sm:w-auto"
                                >
                                  {asaasRevalidating ? (
                                    <>
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      Verificando...
                                    </>
                                  ) : (
                                    'Verificar integração'
                                  )}
                                </Button>
                                <Button asChild size="sm" variant="secondary" className="w-full sm:w-auto">
                                  <a
                                    href={DEFAULT_ASAAS_DASHBOARD_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Abrir painel Asaas
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                </Button>
                              </div>
                            </div>
                            <p className="text-sm text-green-700">
                              Sua conta está conectada e pronta para receber pagamentos via Pix e Cartão.
                              {/* Comentário de regra de negócio: o desconto total exibido ao usuário
                                  soma taxa da plataforma + taxa do sócio (split Asaas). */}
                              A plataforma retém automaticamente <strong>{((company?.platform_fee_percent ?? 3) + (company?.partner_split_percent ?? 3)).toFixed(1)}%</strong> de comissão sobre cada venda online.
                            </p>
                            <p className="text-xs text-green-700">
                              {/* Comentário de suporte: exibimos fallback explícito quando o e-mail
                                  ainda não foi retornado/salvo na vinculação da conta Asaas. */}
                              Conta Asaas conectada: {company.asaas_account_email || 'Não identificado'}
                            </p>
                            {runtimePaymentEnvironment && (
                              <p className="text-xs text-green-700">
                                Ambiente operacional atual: <strong>{runtimePaymentEnvironment === 'production' ? 'Produção' : 'Sandbox'}</strong>
                              </p>
                            )}
                            {company.asaas_wallet_id && (
                              <p className="text-xs text-green-600 font-mono">
                                Wallet: {company.asaas_wallet_id}
                              </p>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Repasse via Pix: D+1 após confirmação do pagamento.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {!asaasOnboardingMode ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => setAsaasOnboardingMode('create')}>
                                <CardContent className="p-4 space-y-2">
                                  <div className="flex items-center gap-2">
                                    <CreditCard className="h-5 w-5 text-primary" />
                                    <h4 className="font-medium">Criar conta Asaas</h4>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    Não tenho conta no Asaas. Criar uma subconta automaticamente vinculada à plataforma.
                                  </p>
                                </CardContent>
                              </Card>
                              <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => setAsaasOnboardingMode('link')}>
                                <CardContent className="p-4 space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Link2 className="h-5 w-5 text-primary" />
                                    <h4 className="font-medium">Já tenho conta Asaas</h4>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    Já possuo uma conta Asaas e quero vinculá-la à plataforma usando minha API Key.
                                  </p>
                                </CardContent>
                              </Card>
                            </div>
                          ) : asaasOnboardingMode === 'create' ? (
                            <div className="rounded-lg border p-4 space-y-4">
                              <h4 className="font-medium">Criar subconta Asaas</h4>
                              <p className="text-sm text-muted-foreground">
                                Vamos criar uma conta Asaas automaticamente usando os dados cadastrados da sua empresa
                                ({form.legal_type === 'PF' ? 'CPF' : 'CNPJ'}, e-mail e nome).
                              </p>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  onClick={() => setAsaasWizardOpen(true)}
                                >
                                  <CreditCard className="h-4 w-4 mr-2" />
                                  Iniciar conexão guiada
                                </Button>
                                <Button type="button" variant="ghost" onClick={() => setAsaasOnboardingMode(null)}>
                                  Voltar
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-lg border p-4 space-y-4">
                              <h4 className="font-medium">Vincular conta Asaas existente</h4>
                              <p className="text-sm text-muted-foreground">
                                Informe sua API Key do Asaas para vincular sua conta. Encontre sua API Key em: 
                                Asaas → Integrações → API.
                              </p>
                              <div className="space-y-2">
                                <Label htmlFor="asaas_api_key">API Key do Asaas</Label>
                                <Input
                                  id="asaas_api_key"
                                  type="password"
                                  value={asaasApiKeyInput}
                                  onChange={(e) => setAsaasApiKeyInput(e.target.value)}
                                  placeholder="$aact_..."
                                />
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  onClick={handleConnectAsaasLink}
                                  disabled={asaasConnecting || !asaasApiKeyInput.trim()}
                                >
                                  {asaasConnecting ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  ) : (
                                    <Link2 className="h-4 w-4 mr-2" />
                                  )}
                                  Vincular conta
                                </Button>
                                <Button type="button" variant="ghost" onClick={() => { setAsaasOnboardingMode(null); setAsaasApiKeyInput(''); }}>
                                  Voltar
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </TabsContent>


                    {/* Comentário de manutenção: wizard reutilizável para evitar criação automática sem confirmação explícita. */}
                    <AsaasOnboardingWizard
                      open={asaasWizardOpen}
                      onOpenChange={setAsaasWizardOpen}
                      companyData={getAsaasWizardCompanyData()}
                      onSuccess={async () => {
                        setAsaasOnboardingMode(null);
                        await fetchCompany();
                      }}
                    />

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
