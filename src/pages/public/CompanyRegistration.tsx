import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BadgeCheck,
  Bus,
  CalendarCheck2,
  CheckCircle2,
  Loader2,
  LockKeyhole,
  QrCode,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { formatPhoneBR, normalizePhoneForStorage } from '@/lib/phone';
import {
  clearCompanyReferralTracking,
  normalizeCompanyReferralCode,
  persistCompanyReferralTracking,
  readCompanyReferralTracking,
} from '@/lib/companyReferral';

function formatCNPJ(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function formatCPF(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

// Comentário: formatPhone substituído por formatPhoneBR de @/lib/phone.ts (fonte única de verdade).

const getCpfDigits = (value: string) => value.replace(/\D/g, '').slice(0, 11);
const getCnpjDigits = (value: string) => value.replace(/\D/g, '').slice(0, 14);

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

export default function CompanyRegistration() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [legalType, setLegalType] = useState<'PF' | 'PJ'>('PJ');
  const [companyName, setCompanyName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [cpf, setCpf] = useState('');
  const [responsibleName, setResponsibleName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [referralTrackingCode, setReferralTrackingCode] = useState<string | null>(null);
  const [representativeTrackingCode, setRepresentativeTrackingCode] = useState<string | null>(null);

  // Comentário: bloco institucional reforçado para aproximar o visual do cadastro à linguagem comercial da landing.
  const benefits = [
    {
      icon: Bus,
      title: 'Controle de frota por veículo',
      description: 'Visualize embarques e operação com mais previsibilidade.',
    },
    {
      icon: CalendarCheck2,
      title: 'Gestão de eventos e viagens',
      description: 'Organize saídas, responsáveis e pontos em um fluxo único.',
    },
    {
      icon: QrCode,
      title: 'Controle de embarque via QR Code',
      description: 'Valide presença com mais agilidade e menos filas na saída.',
    },
    {
      icon: ShieldCheck,
      title: 'Comissão automática para vendedores',
      description: 'Acompanhe desempenho comercial sem planilhas paralelas.',
    },
    {
      icon: WalletCards,
      title: 'Estrutura pronta para pagamentos online',
      description: 'Venda com segurança sem alterar sua operação atual.',
    },
  ];

  const referralCodeFromUrl = useMemo(
    () => normalizeCompanyReferralCode(searchParams.get('ref')),
    [searchParams]
  );
  const representativeCodeFromUrl = useMemo(
    () => normalizeCompanyReferralCode(searchParams.get('representative_code')),
    [searchParams]
  );

  useEffect(() => {
    // Garantia complementar: representative_code é semântica própria e prioriza o vínculo com representante.
    // Não compartilhamos storage com referral entre empresas para evitar ambiguidade operacional.
    if (representativeCodeFromUrl) {
      setRepresentativeTrackingCode(representativeCodeFromUrl);
    }

    // Comentário de manutenção: regra adotada para conflito de links no MVP.
    // O primeiro link válido da sessão é preservado, mas uma nova entrada explícita
    // com `?ref=` substitui conscientemente o tracking ativo porque houve nova ação do usuário.
    if (referralCodeFromUrl) {
      persistCompanyReferralTracking(referralCodeFromUrl);
      setReferralTrackingCode(referralCodeFromUrl);
      return;
    }

    const existingTracking = readCompanyReferralTracking();
    setReferralTrackingCode(existingTracking?.code ?? null);
  }, [referralCodeFromUrl, representativeCodeFromUrl]);

  const validate = () => {
    const hasBaseRequired = companyName && responsibleName && email && phone && password && confirmPassword;
    if (!hasBaseRequired) {
      return 'Preencha todos os campos obrigatórios.';
    }

    if (legalType === 'PJ') {
      if (!legalName || !tradeName || !cnpj) {
        return 'Para Pessoa Jurídica, preencha Razão Social, Nome Fantasia e CNPJ.';
      }
      if (!isValidCnpj(cnpj)) return 'CNPJ inválido.';
    }

    if (legalType === 'PF') {
      if (!cpf) return 'Para Pessoa Física, preencha o CPF.';
      if (!isValidCpf(cpf)) return 'CPF inválido.';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return 'Email inválido.';
    if (password.length < 6) return 'Senha deve ter pelo menos 6 caracteres.';
    if (password !== confirmPassword) return 'As senhas não coincidem.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      // Comentário de manutenção: enviamos CPF/CNPJ já normalizado (somente dígitos)
      // para manter consistência com o cadastro interno e com validações no backend.
      const normalizedDocument = legalType === 'PJ' ? getCnpjDigits(cnpj) : getCpfDigits(cpf);

      const { data, error: fnError } = await supabase.functions.invoke('register-company', {
        body: {
          legal_type: legalType,
          company_name: companyName,
          legal_name: legalType === 'PJ' ? legalName : null,
          trade_name: tradeName || null,
          document_number: normalizedDocument,
          responsible_name: responsibleName,
          email,
          phone: normalizePhoneForStorage(phone),
          password,
          referral_code: referralTrackingCode,
          representative_code: representativeTrackingCode,
        },
      });

      if (fnError || !data?.success) {
        setError(data?.error || fnError?.message || 'Erro ao criar conta. Tente novamente.');
        setLoading(false);
        return;
      }

      // Auto sign-in
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError('Conta criada, mas houve erro ao fazer login. Faça login manualmente.');
        setLoading(false);
        return;
      }

      // Comentário de manutenção: o tracking temporário já cumpriu seu papel
      // quando o backend conclui a criação da empresa e decide se ativa ou não o vínculo oficial.
      clearCompanyReferralTracking();

      toast({
        title: 'Bem-vindo! 🎉',
        description: 'Sua empresa foi cadastrada com sucesso. Comece criando seu primeiro evento!',
      });
      // Após cadastro + login automático, priorizar visão executiva inicial do Admin.
      navigate('/admin/dashboard');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erro inesperado. Tente novamente.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicLayout>
      {/* Comentário visual: fundo e composição com contraste suave para aumentar percepção premium sem alterar fluxo. */}
      <section className="relative overflow-hidden bg-gradient-to-b from-background to-muted/25 py-6 md:py-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-52 bg-[radial-gradient(circle_at_top,hsla(var(--primary),0.14),transparent_62%)]" />

        <div className="relative mx-auto w-full max-w-7xl px-4 md:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-12 lg:gap-6">
            {/* Comentário visual: card institucional ganha hierarquia comercial semelhante à landing e ocupa melhor a lateral. */}
            <aside className="order-2 rounded-3xl border border-border/70 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 p-6 text-slate-100 shadow-[0_26px_70px_-40px_rgba(15,23,42,0.95)] lg:order-1 lg:col-span-5 lg:p-7">
              <div className="flex h-full flex-col gap-6">
                <div className="space-y-4">
                  <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium tracking-wide text-white/95">
                    SmartBus BR para empresas e vendedores
                  </span>
                  <div className="space-y-3">
                    <h1 className="text-2xl font-semibold leading-tight text-white md:text-[2rem]">
                      Venda passagens com total controle da sua operação.
                    </h1>
                    <p className="text-sm leading-relaxed text-slate-200/90 md:text-base">
                      Estrutura completa para gestão de viagens, embarque e comercial. Configure sua conta e comece a operar em minutos.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {benefits.map(({ icon: Icon, title, description }) => (
                    <div
                      key={title}
                      className="rounded-2xl border border-white/10 bg-white/[0.05] p-3.5 backdrop-blur-sm transition-colors duration-200 hover:bg-white/[0.09]"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 rounded-lg bg-white/10 p-2 text-primary-foreground">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-white">{title}</p>
                          <p className="text-xs leading-relaxed text-slate-200/80">{description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-primary/40 bg-primary/10 p-3.5 text-sm text-primary-foreground/95">
                  <p className="font-medium">Cadastro gratuito e sem burocracia para começar</p>
                  <p className="mt-1 text-xs text-slate-100/80">Sem mensalidade, sem cartão e com ativação rápida para publicar as primeiras viagens.</p>
                </div>
              </div>
            </aside>

            {/* Comentário: card principal recebe destaque visual com respiro e seções para reduzir sensação de formulário cru. */}
            <Card className="order-1 w-full rounded-3xl border-border/70 bg-background/95 shadow-[0_28px_60px_-45px_rgba(15,23,42,0.75)] backdrop-blur-sm lg:order-2 lg:col-span-7">
              <CardHeader className="space-y-4 border-b border-border/70 px-5 pb-5 pt-6 md:px-8">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    Cadastro gratuito
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs text-muted-foreground">
                    <LockKeyhole className="h-3.5 w-3.5" />
                    Ambiente seguro
                  </span>
                </div>
                <div className="space-y-2">
                  <CardTitle className="text-2xl leading-tight md:text-[2rem]">Comece a vender passagens em minutos</CardTitle>
                  <CardDescription className="text-sm leading-relaxed text-muted-foreground md:text-base">
                    Cadastre sua empresa ou atue como vendedor com uma operação pronta para gestão de eventos, pagamentos e embarque.
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="space-y-5 px-5 pb-6 pt-5 md:px-8 md:pb-8">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {referralTrackingCode && (
                  <Alert>
                    <AlertDescription>
                      Você está criando sua conta por um link oficial de indicação. O código será validado no cadastro, sem bloquear sua criação de conta caso esteja inválido.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Comentário: mantém o mesmo padrão funcional e adiciona agrupamentos visuais para facilitar leitura dos campos. */}
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <Label className="text-foreground">Tipo de cadastro *</Label>
                    <RadioGroup
                      value={legalType}
                      onValueChange={(value: 'PF' | 'PJ') => {
                        // Comentário de manutenção: limpeza explícita evita vazamento de campos
                        // entre os tipos no payload do onboarding público.
                        setLegalType(value);
                        if (value === 'PF') {
                          setLegalName('');
                          setCnpj('');
                        } else {
                          setCpf('');
                        }
                      }}
                      className="grid grid-cols-1 gap-3 md:grid-cols-2"
                    >
                      <div
                        className={`flex items-center space-x-2 rounded-xl border p-3 transition-colors ${
                          legalType === 'PJ'
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-border bg-background text-foreground'
                        }`}
                      >
                        <RadioGroupItem value="PJ" id="register_legal_type_pj" />
                        <Label htmlFor="register_legal_type_pj" className="cursor-pointer">
                          Pessoa Jurídica (CNPJ)
                        </Label>
                      </div>
                      <div
                        className={`flex items-center space-x-2 rounded-xl border p-3 transition-colors ${
                          legalType === 'PF'
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-border bg-background text-foreground'
                        }`}
                      >
                        <RadioGroupItem value="PF" id="register_legal_type_pf" />
                        <Label htmlFor="register_legal_type_pf" className="cursor-pointer">
                          Pessoa Física (CPF)
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="companyName">Nome de exibição *</Label>
                      <Input
                        id="companyName"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="Ex: Viação Rápida"
                        maxLength={100}
                        className="h-10"
                      />
                    </div>
                    {legalType === 'PJ' ? (
                      <div className="space-y-2">
                        <Label htmlFor="cnpj">CNPJ *</Label>
                        <Input
                          id="cnpj"
                          value={cnpj}
                          onChange={(e) => setCnpj(formatCNPJ(e.target.value))}
                          placeholder="00.000.000/0000-00"
                          maxLength={18}
                          className="h-10"
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label htmlFor="cpf">CPF *</Label>
                        <Input
                          id="cpf"
                          value={cpf}
                          onChange={(e) => setCpf(formatCPF(e.target.value))}
                          placeholder="000.000.000-00"
                          maxLength={14}
                          className="h-10"
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="responsibleName">Nome do responsável *</Label>
                      <Input
                        id="responsibleName"
                        value={responsibleName}
                        onChange={(e) => setResponsibleName(e.target.value)}
                        placeholder="Seu nome completo"
                        maxLength={100}
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefone *</Label>
                      <Input
                        id="phone"
                        value={phone}
                        onChange={(e) => setPhone(formatPhoneBR(e.target.value))}
                        placeholder="(00) 00000-0000"
                        maxLength={15}
                        className="h-10"
                      />
                    </div>
                  </div>

                  {legalType === 'PJ' ? (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="legalName">Razão Social *</Label>
                        <Input
                          id="legalName"
                          value={legalName}
                          onChange={(e) => setLegalName(e.target.value)}
                          placeholder="Empresa Exemplo LTDA"
                          className="h-10"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tradeName">Nome Fantasia *</Label>
                        <Input
                          id="tradeName"
                          value={tradeName}
                          onChange={(e) => setTradeName(e.target.value)}
                          placeholder="Empresa Exemplo"
                          className="h-10"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="tradeName">Nome público/Apelido (opcional)</Label>
                      <Input
                        id="tradeName"
                        value={tradeName}
                        onChange={(e) => setTradeName(e.target.value)}
                        placeholder="Como deseja aparecer na vitrine"
                        className="h-10"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email@suaempresa.com"
                      maxLength={255}
                      className="h-10"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="password">Senha *</Label>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        maxLength={72}
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirmar senha *</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repita a senha"
                        maxLength={72}
                        className="h-10"
                      />
                    </div>
                  </div>

                  {/* Comentário visual: bloco de confiança melhora destaque do CTA e reduz percepção de burocracia. */}
                  <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                    <p className="text-sm text-muted-foreground">Leva menos de 1 minuto para criar sua conta e acessar o painel da empresa.</p>
                    <Button
                      type="submit"
                      className="h-11 w-full rounded-xl text-base font-medium shadow-[0_12px_24px_-14px_hsla(var(--primary),0.9)] transition-all duration-200 hover:-translate-y-0.5 hover:opacity-95"
                      size="lg"
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Criando sua conta...
                        </>
                      ) : (
                        'Criar conta gratuita'
                      )}
                    </Button>
                    <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground md:justify-start">
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        Sem cartão de crédito
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        Sem cobrança inicial
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        Seus dados protegidos
                      </span>
                    </div>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
