import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Bus, CalendarCheck2, Loader2, QrCode, ShieldCheck, WalletCards } from 'lucide-react';
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

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return digits
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}

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

  // Comentário: conteúdo institucional fixo para reforçar credibilidade sem alterar fluxo do cadastro.
  const benefits = [
    { icon: Bus, text: 'Controle de frota por veículo' },
    { icon: CalendarCheck2, text: 'Gestão de eventos e viagens' },
    { icon: QrCode, text: 'Controle de embarque via QR Code' },
    { icon: ShieldCheck, text: 'Comissão automática para vendedores' },
    { icon: WalletCards, text: 'Estrutura pronta para pagamentos online' },
  ];

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
          phone: phone.replace(/\D/g, ''),
          password,
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
      <div className="py-4 px-4 md:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 lg:gap-5 items-stretch">
            <aside className="hidden md:flex md:col-span-4 lg:col-span-4 rounded-2xl border border-border/60 bg-muted/20 p-4 lg:p-5">
              <div className="flex h-full flex-col justify-between gap-4">
                <div className="space-y-2">
                  <h1 className="text-xl lg:text-2xl font-semibold leading-tight text-foreground/95">
                    Venda passagens com total controle da sua operação.
                  </h1>
                  <p className="text-xs lg:text-sm text-muted-foreground/90">
                    Plataforma completa para gestão de eventos, frota e embarque.
                  </p>
                </div>

                <ul className="space-y-2.5">
                  {benefits.map(({ icon: Icon, text }) => (
                    <li key={text} className="flex items-start gap-2.5">
                      <span className="mt-0.5 rounded-md border border-border/50 bg-background/80 p-1 text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-sm text-foreground/80">{text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>

            {/* Comentário: card principal recebe maior destaque visual para manter foco no formulário (65%). */}
            <Card className="md:col-span-8 lg:col-span-8 w-full rounded-2xl border-border/80 bg-background shadow-[0_8px_24px_-20px_rgba(2,6,23,0.45)]">
              <CardHeader className="space-y-1 px-6 pt-5 md:px-8 md:pt-5">
                <div className="mx-auto bg-primary/10 rounded-full p-3 w-fit md:hidden">
                  <Building2 className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-xl md:text-2xl leading-tight">Comece a vender passagens em minutos</CardTitle>
                <CardDescription className="text-sm md:text-base text-muted-foreground/85">
                  Configure sua empresa e publique suas primeiras viagens rapidamente.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-6 pb-5 md:px-8 md:pb-5">
                {error && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                {/* Comentário: mantém o mesmo padrão visual e adiciona apenas os campos mínimos para PF/PJ. */}
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Tipo de cadastro *</Label>
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
                      className="grid grid-cols-1 md:grid-cols-2 gap-3"
                    >
                      <div className="flex items-center space-x-2 rounded-md border p-3">
                        <RadioGroupItem value="PJ" id="register_legal_type_pj" />
                        <Label htmlFor="register_legal_type_pj" className="cursor-pointer">Pessoa Jurídica (CNPJ)</Label>
                      </div>
                      <div className="flex items-center space-x-2 rounded-md border p-3">
                        <RadioGroupItem value="PF" id="register_legal_type_pf" />
                        <Label htmlFor="register_legal_type_pf" className="cursor-pointer">Pessoa Física (CPF)</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="companyName">Nome de exibição *</Label>
                      <Input
                        id="companyName"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="Ex: Viação Rápida"
                        maxLength={100}
                        className="h-9"
                      />
                    </div>
                    {legalType === 'PJ' ? (
                      <div className="space-y-1.5">
                        <Label htmlFor="cnpj">CNPJ *</Label>
                        <Input
                          id="cnpj"
                          value={cnpj}
                          onChange={(e) => setCnpj(formatCNPJ(e.target.value))}
                          placeholder="00.000.000/0000-00"
                          maxLength={18}
                          className="h-9"
                        />
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <Label htmlFor="cpf">CPF *</Label>
                        <Input
                          id="cpf"
                          value={cpf}
                          onChange={(e) => setCpf(formatCPF(e.target.value))}
                          placeholder="000.000.000-00"
                          maxLength={14}
                          className="h-9"
                        />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label htmlFor="responsibleName">Nome do responsável *</Label>
                      <Input
                        id="responsibleName"
                        value={responsibleName}
                        onChange={(e) => setResponsibleName(e.target.value)}
                        placeholder="Seu nome completo"
                        maxLength={100}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="phone">Telefone *</Label>
                      <Input
                        id="phone"
                        value={phone}
                        onChange={(e) => setPhone(formatPhone(e.target.value))}
                        placeholder="(00) 00000-0000"
                        maxLength={15}
                        className="h-9"
                      />
                    </div>
                  </div>

                  {legalType === 'PJ' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="legalName">Razão Social *</Label>
                        <Input
                          id="legalName"
                          value={legalName}
                          onChange={(e) => setLegalName(e.target.value)}
                          placeholder="Empresa Exemplo LTDA"
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="tradeName">Nome Fantasia *</Label>
                        <Input
                          id="tradeName"
                          value={tradeName}
                          onChange={(e) => setTradeName(e.target.value)}
                          placeholder="Empresa Exemplo"
                          className="h-9"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label htmlFor="tradeName">Nome público/Apelido (opcional)</Label>
                      <Input
                        id="tradeName"
                        value={tradeName}
                        onChange={(e) => setTradeName(e.target.value)}
                        placeholder="Como deseja aparecer na vitrine"
                        className="h-9"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email@suaempresa.com"
                      maxLength={255}
                      className="h-9"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="password">Senha *</Label>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        maxLength={72}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="confirmPassword">Confirmar senha *</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repita a senha"
                        maxLength={72}
                        className="h-9"
                      />
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground/90 text-center md:text-left">Leva menos de 1 minuto para começar.</p>
                  <Button
                    type="submit"
                    className="w-full rounded-xl transition-all duration-200 hover:opacity-95"
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
                  <p className="text-xs text-muted-foreground text-center">
                    Sem cartão de crédito · Sem cobrança · Seus dados protegidos
                  </p>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
