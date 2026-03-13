import { useEffect, useMemo, useState } from 'react';
import { AsaasAddressModal, AsaasAddressData } from './AsaasAddressModal';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Loader2, AlertTriangle, Building2, Mail, ShieldCheck, ArrowRight, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { extractAsaasErrorMessage } from '@/lib/asaasError';

type AsaasWizardStep = 1 | 2 | 3 | 4;
type AsaasWizardMode = 'create' | 'link';

export interface AsaasOnboardingCompanyData {
  companyId: string;
  companyName: string;
  legalType: 'PF' | 'PJ';
  documentNumber: string;
  email: string;
  address: string;
  addressNumber: string;
  province: string;
  postalCode: string;
  city: string;
  state: string;
}

interface AsaasOnboardingWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyData: AsaasOnboardingCompanyData | null;
  onSuccess?: () => Promise<void> | void;
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const onlyDigits = (value: string) => (value ?? '').replace(/\D/g, '');

const maskCpf = (value: string) => {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

const maskCnpj = (value: string) => {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
};

export function AsaasOnboardingWizard({ open, onOpenChange, companyData, onSuccess }: AsaasOnboardingWizardProps) {
  const [step, setStep] = useState<AsaasWizardStep>(1);
  const [mode, setMode] = useState<AsaasWizardMode | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');

  useEffect(() => {
    if (!open) {
      setStep(1);
      setMode(null);
      setSubmitting(false);
      setApiKeyInput('');
    }
  }, [open]);

  const missingFields = useMemo(() => {
    if (!companyData) return ['dados da empresa'];
    const missing: string[] = [];
    if (!companyData.companyName.trim()) missing.push('nome da empresa');
    const documentDigits = onlyDigits(companyData.documentNumber);
    if (companyData.legalType === 'PF' && documentDigits.length !== 11) missing.push('CPF válido (11 dígitos)');
    if (companyData.legalType === 'PJ' && documentDigits.length !== 14) missing.push('CNPJ válido (14 dígitos)');
    if (!companyData.email.trim()) missing.push('e-mail');
    else if (!emailRegex.test(companyData.email.trim())) missing.push('e-mail válido');
    return missing;
  }, [companyData]);

  const canProceed = missingFields.length === 0;
  const maskedDocument = companyData?.legalType === 'PF'
    ? maskCpf(companyData.documentNumber)
    : maskCnpj(companyData?.documentNumber ?? '');

  const handleCreateAsaasAccount = async () => {
    if (!companyData?.companyId) {
      toast.error('Empresa não encontrada para conectar pagamentos.');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-asaas-account', {
        body: { company_id: companyData.companyId, mode: 'create' },
      });

      // Comentário de suporte: quando a edge function falha, tentamos priorizar a mensagem real
      // retornada pelo Asaas (se segura para UI), sem expor detalhes internos do runtime.
      if (error) {
        const { message, statusCode } = await extractAsaasErrorMessage({
          data,
          error,
          fallbackMessage: 'Não foi possível conectar sua conta Asaas.',
        });
        const statusSuffix = statusCode ? ` (HTTP ${statusCode})` : '';
        throw new Error(`${message}${statusSuffix}`);
      }

      toast.success(data?.already_complete ? 'Conta Asaas já estava conectada.' : 'Conta Asaas conectada com sucesso.');
      await onSuccess?.();
      setStep(4);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Não foi possível conectar sua conta Asaas.';
      // Se e-mail já está em uso, redirecionar automaticamente para vincular conta existente
      if (message.includes('Vincular conta existente') || message.includes('já possui uma conta')) {
        toast.error(message);
        setMode('link');
        setStep(2);
      } else {
        toast.error(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleLinkExistingAccount = async () => {
    if (!companyData?.companyId) {
      toast.error('Empresa não encontrada.');
      return;
    }
    if (!apiKeyInput.trim()) {
      toast.error('Informe sua API Key do Asaas.');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-asaas-account', {
        body: { company_id: companyData.companyId, mode: 'link_existing', api_key: apiKeyInput.trim() },
      });
      if (error) {
        // Comentário de suporte: reaproveita o mesmo parser para cobrir os formatos de erro
        // mais comuns (error/message/errors[0].description) sem mudar o fluxo de sucesso.
        const { message, statusCode } = await extractAsaasErrorMessage({
          data,
          error,
          fallbackMessage: 'Erro ao vincular conta Asaas.',
        });
        const statusSuffix = statusCode ? ` (HTTP ${statusCode})` : '';
        throw new Error(`${message}${statusSuffix}`);
      }

      toast.success('Conta Asaas vinculada com sucesso!');
      await onSuccess?.();
      setStep(4);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao vincular conta Asaas.';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  // Mode selection screen (step 1 when no mode chosen)
  const renderModeSelection = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Escolha como deseja conectar os pagamentos da sua empresa:
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          className="rounded-lg border p-4 text-left space-y-2 hover:border-primary transition-colors"
          onClick={() => { setMode('create'); setStep(1); }}
        >
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <span className="font-medium">Criar nova conta</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Cria automaticamente uma subconta Asaas vinculada à sua empresa.
          </p>
        </button>
        <button
          type="button"
          className="rounded-lg border p-4 text-left space-y-2 hover:border-primary transition-colors"
          onClick={() => { setMode('link'); setStep(2); }}
        >
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            <span className="font-medium">Vincular conta existente</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Já tem conta no Asaas? Informe sua API Key para vincular.
          </p>
        </button>
      </div>
    </div>
  );

  // Create flow steps
  const renderCreateStep1 = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Revise os dados abaixo. Eles serão usados para criar sua conta Asaas em nome da empresa.
      </p>
      {!canProceed && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Faltam dados obrigatórios ({missingFields.join(', ')}). Atualize as informações em <strong>/admin/empresa</strong> antes de continuar.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
        <div className="space-y-1">
          <span className="text-muted-foreground">Empresa</span>
          <p className="font-medium">{companyData?.companyName || 'Não informado'}</p>
        </div>
        <div className="space-y-1">
          <span className="text-muted-foreground">Tipo de cadastro</span>
          <p className="font-medium">{companyData?.legalType === 'PF' ? 'Pessoa Física (PF)' : 'Pessoa Jurídica (PJ)'}</p>
        </div>
        <div className="space-y-1">
          <span className="text-muted-foreground">{companyData?.legalType === 'PF' ? 'CPF' : 'CNPJ'}</span>
          <p className="font-medium">{maskedDocument || 'Não informado'}</p>
        </div>
        <div className="space-y-1">
          <span className="text-muted-foreground">E-mail da conta Asaas</span>
          <p className="font-medium">{companyData?.email || 'Não informado'}</p>
        </div>
      </div>
    </div>
  );

  const renderCreateStep2 = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Veja o que acontece ao concluir a conexão:</p>
      <div className="space-y-3 rounded-lg border p-4 text-sm">
        <p className="flex items-start gap-2"><Building2 className="mt-0.5 h-4 w-4 text-primary" />A conta Asaas será criada e vinculada automaticamente à sua empresa.</p>
        <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />Recebimentos via Pix e cartão passam a ser destinados para a conta da empresa.</p>
        <p className="flex items-start gap-2"><ArrowRight className="mt-0.5 h-4 w-4 text-primary" />A plataforma aplicará somente a comissão configurada para sua operação.</p>
      </div>
    </div>
  );

  const renderCreateStep3 = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Orientação de acesso após a criação:</p>
      <div className="space-y-2 rounded-lg border p-4 text-sm">
        <p className="flex items-start gap-2"><Mail className="mt-0.5 h-4 w-4 text-primary" />O e-mail <strong>{companyData?.email}</strong> será a referência principal da conta criada.</p>
        <p>Depois da vinculação, acesse o ambiente do Asaas para gerenciar a conta e os recebimentos.</p>
        <p className="text-muted-foreground">Enquanto a operação estiver em testes, a conexão será criada no ambiente Sandbox do Asaas.</p>
        <p className="font-medium">Você poderá gerenciar sua conta de pagamentos diretamente no Asaas após a criação.</p>
      </div>
    </div>
  );

  // Link flow step
  const renderLinkStep = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Informe a API Key da sua conta Asaas para vincular automaticamente. Você encontra a chave no painel do Asaas em <strong>Configurações &gt; Integrações</strong>.
      </p>
      <div className="space-y-2">
        <Label htmlFor="asaas-api-key">API Key do Asaas</Label>
        <Input
          id="asaas-api-key"
          type="password"
          placeholder="Cole sua API Key aqui"
          value={apiKeyInput}
          onChange={(e) => setApiKeyInput(e.target.value)}
          autoFocus
        />
      </div>
      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertDescription>
          A chave será usada apenas para validar e vincular sua conta. Ela é armazenada de forma segura.
        </AlertDescription>
      </Alert>
    </div>
  );

  // Success screen
  const renderSuccess = () => (
    <div className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <p className="flex items-center gap-2 font-medium text-emerald-800">
        <CheckCircle2 className="h-5 w-5" />
        Conta Asaas conectada com sucesso
      </p>
      <p className="text-sm text-emerald-900">
        A conexão foi concluída para a empresa <strong>{companyData?.companyName}</strong> com o e-mail <strong>{companyData?.email}</strong>.
      </p>
    </div>
  );

  const renderContent = () => {
    if (step === 4) return renderSuccess();
    if (!mode) return renderModeSelection();

    if (mode === 'link') return renderLinkStep();

    // Create flow
    if (step === 1) return renderCreateStep1();
    if (step === 2) return renderCreateStep2();
    if (step === 3) return renderCreateStep3();
    return null;
  };

  const renderFooter = () => {
    if (step === 4) {
      return <Button type="button" onClick={() => onOpenChange(false)}>Concluir</Button>;
    }

    if (!mode) return null;

    if (mode === 'link') {
      return (
        <>
          <Button type="button" variant="ghost" onClick={() => { setMode(null); setApiKeyInput(''); }}>Voltar</Button>
          <Button type="button" onClick={handleLinkExistingAccount} disabled={submitting || !apiKeyInput.trim()}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Vincular conta
          </Button>
        </>
      );
    }

    // Create flow
    return (
      <>
        <Button type="button" variant="ghost" onClick={() => (step === 1 ? setMode(null) : setStep((prev) => (prev - 1) as AsaasWizardStep))}>
          Voltar
        </Button>
        {step < 3 ? (
          <Button type="button" disabled={step === 1 && !canProceed} onClick={() => setStep((prev) => (prev + 1) as AsaasWizardStep)}>
            Continuar
          </Button>
        ) : (
          <Button type="button" onClick={handleCreateAsaasAccount} disabled={submitting || !canProceed}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirmar e criar conta Asaas
          </Button>
        )}
      </>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conectar pagamentos com Asaas</DialogTitle>
        </DialogHeader>

        {mode === 'create' && step < 4 && (
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <Badge key={s} variant={step === s ? 'default' : 'secondary'}>Etapa {s}</Badge>
            ))}
          </div>
        )}

        {renderContent()}

        <Separator />

        <DialogFooter>
          {renderFooter()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
