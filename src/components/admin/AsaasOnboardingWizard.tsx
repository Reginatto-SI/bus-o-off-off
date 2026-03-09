import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, Loader2, AlertTriangle, Building2, Mail, ShieldCheck, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

type AsaasWizardStep = 1 | 2 | 3 | 4;

export interface AsaasOnboardingCompanyData {
  companyId: string;
  companyName: string;
  legalType: 'PF' | 'PJ';
  documentNumber: string;
  email: string;
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
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setSubmitting(false);
    }
  }, [open]);

  const missingFields = useMemo(() => {
    if (!companyData) return ['dados da empresa'];

    const missing: string[] = [];
    if (!companyData.companyName.trim()) missing.push('nome da empresa');
    if (!onlyDigits(companyData.documentNumber)) missing.push(companyData.legalType === 'PF' ? 'CPF' : 'CNPJ');
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

    // Comentário de manutenção: a criação da conta só acontece no último passo, após confirmação explícita.
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-asaas-account', {
        body: { company_id: companyData.companyId, mode: 'create' },
      });

      if (error) {
        throw new Error((data as { error?: string } | null)?.error || error.message);
      }

      toast.success(data?.already_complete ? 'Conta Asaas já estava conectada.' : 'Conta Asaas conectada com sucesso.');
      await onSuccess?.();
      setStep(4);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Não foi possível conectar sua conta Asaas.';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conectar pagamentos com Asaas</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map((currentStep) => (
            <Badge key={currentStep} variant={step === currentStep ? 'default' : 'secondary'}>
              Etapa {currentStep}
            </Badge>
          ))}
        </div>

        {step === 1 && (
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
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Veja o que acontece ao concluir a conexão:</p>
            <div className="space-y-3 rounded-lg border p-4 text-sm">
              <p className="flex items-start gap-2"><Building2 className="mt-0.5 h-4 w-4 text-primary" />A conta Asaas será criada e vinculada automaticamente à sua empresa.</p>
              <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />Recebimentos via Pix e cartão passam a ser destinados para a conta da empresa.</p>
              <p className="flex items-start gap-2"><ArrowRight className="mt-0.5 h-4 w-4 text-primary" />A plataforma aplicará somente a comissão configurada para sua operação.</p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Orientação de acesso após a criação:</p>
            <div className="space-y-2 rounded-lg border p-4 text-sm">
              <p className="flex items-start gap-2"><Mail className="mt-0.5 h-4 w-4 text-primary" />O e-mail <strong>{companyData?.email}</strong> será a referência principal da conta criada.</p>
              <p>Depois da vinculação, acesse o ambiente do Asaas para gerenciar a conta e os recebimentos.</p>
              <p>Se for necessário definir senha, completar cadastro ou validar dados, essa etapa acontece diretamente no Asaas.</p>
              <p className="font-medium">Você poderá gerenciar sua conta de pagamentos diretamente no Asaas após a criação.</p>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="flex items-center gap-2 font-medium text-emerald-800">
              <CheckCircle2 className="h-5 w-5" />
              Conta Asaas conectada com sucesso
            </p>
            <p className="text-sm text-emerald-900">
              A conexão foi concluída para a empresa <strong>{companyData?.companyName}</strong> com o e-mail <strong>{companyData?.email}</strong>.
            </p>
            <p className="text-sm text-emerald-900">
              Próximo passo: acompanhe e conclua configurações complementares diretamente no Asaas, quando necessário.
            </p>
          </div>
        )}

        <Separator />

        <DialogFooter>
          {step < 4 ? (
            <>
              <Button type="button" variant="ghost" onClick={() => (step === 1 ? onOpenChange(false) : setStep((prev) => (prev - 1) as AsaasWizardStep))}>
                {step === 1 ? 'Cancelar' : 'Voltar'}
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
          ) : (
            <Button type="button" onClick={() => onOpenChange(false)}>Concluir</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

