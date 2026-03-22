import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Copy, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { Company } from '@/types/database';
import type { PaymentEnvironment, AsaasIntegrationStatus } from '@/lib/asaasIntegrationStatus';

type DiagnosticStep = {
  label: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
  detail?: string;
};

type DiagnosticResult = {
  timestamp: string;
  environment: PaymentEnvironment;
  environmentSource: string | null;
  companyId: string | null;
  integrationStatus: AsaasIntegrationStatus;
  steps: DiagnosticStep[];
  rawResponse: unknown;
  rawError: string | null;
};

interface AsaasDiagnosticPanelProps {
  company: Company | null;
  runtimeEnvironment: PaymentEnvironment | null;
  runtimeSource: string | null;
  asaasStatus: AsaasIntegrationStatus;
  editingId: string | null;
  asaasSnapshot: ReturnType<typeof import('@/lib/asaasIntegrationStatus').getAsaasIntegrationSnapshot> | null;
}

export function AsaasDiagnosticPanel({
  company,
  runtimeEnvironment,
  runtimeSource,
  asaasStatus,
  editingId,
  asaasSnapshot,
}: AsaasDiagnosticPanelProps) {
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [repairingWebhook, setRepairingWebhook] = useState(false);
  const [result, setResult] = useState<DiagnosticResult | null>(null);

  const handleTestConnection = async () => {
    if (!editingId || !runtimeEnvironment) {
      toast.error('Empresa ou ambiente não identificado.');
      return;
    }

    setTesting(true);
    const steps: DiagnosticStep[] = [
      { label: 'Identificar empresa', status: 'success', detail: editingId },
      { label: 'Resolver ambiente', status: 'success', detail: `${runtimeEnvironment} (${runtimeSource})` },
      { label: 'Chamar edge function (revalidate)', status: 'running' },
    ];

    setResult({
      timestamp: new Date().toISOString(),
      environment: runtimeEnvironment,
      environmentSource: runtimeSource,
      companyId: editingId,
      integrationStatus: asaasStatus,
      steps: [...steps],
      rawResponse: null,
      rawError: null,
    });

    try {
      const { data, error } = await supabase.functions.invoke('create-asaas-account', {
        body: {
          company_id: editingId,
          mode: 'revalidate',
          target_environment: runtimeEnvironment,
        },
      });

      if (error) {
        // Try to extract body from FunctionsHttpError
        let errorBody: unknown = null;
        try {
          if (error && typeof error === 'object' && 'context' in error) {
            const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
            errorBody = await ctx?.json?.();
          }
        } catch { /* ignore */ }

        const errorMessage = (errorBody as { error?: string })?.error
          || (data as { error?: string })?.error
          || error.message
          || 'Erro desconhecido';

        steps[2] = { label: 'Chamar edge function (revalidate)', status: 'error', detail: errorMessage };
        setResult({
          timestamp: new Date().toISOString(),
          environment: runtimeEnvironment,
          environmentSource: runtimeSource,
          companyId: editingId,
          integrationStatus: asaasStatus,
          steps: [...steps],
          rawResponse: data ?? errorBody,
          rawError: errorMessage,
        });
      } else {
        steps[2] = { label: 'Chamar edge function (revalidate)', status: 'success', detail: 'Resposta recebida' };

        const revalidateSuccess = data?.success === true;
        const partial = data?.partial === true;
        const walletId = data?.wallet_id;
        const accountId = data?.account_id;
        const accountIdSource = data?.account_id_source;

        steps.push({
          label: 'Validar resposta',
          status: revalidateSuccess ? 'success' : 'error',
          detail: revalidateSuccess
            ? (
              partial
                ? `Parcial — sem walletId${accountId ? `, accountId via ${accountIdSource ?? 'fonte não informada'}` : ', sem accountId'}`
                : `walletId: ${walletId ? walletId.slice(0, 8) + '...' : 'N/A'} · accountId: ${accountId ? `${String(accountId).slice(0, 8)}... via ${accountIdSource ?? 'fonte não informada'}` : 'N/A'}`
            )
            : (data?.error || 'Resposta sem sucesso'),
        });

        setResult({
          timestamp: new Date().toISOString(),
          environment: runtimeEnvironment,
          environmentSource: runtimeSource,
          companyId: editingId,
          integrationStatus: asaasStatus,
          steps: [...steps],
          rawResponse: data,
          rawError: revalidateSuccess ? null : (data?.error || null),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      steps[2] = { label: 'Chamar edge function (revalidate)', status: 'error', detail: message };
      setResult({
        timestamp: new Date().toISOString(),
        environment: runtimeEnvironment,
        environmentSource: runtimeSource,
        companyId: editingId,
        integrationStatus: asaasStatus,
        steps: [...steps],
        rawResponse: null,
        rawError: message,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleRepairWebhook = async () => {
    if (!editingId || !runtimeEnvironment) {
      toast.error('Empresa ou ambiente não identificado.');
      return;
    }

    setRepairingWebhook(true);
    const steps: DiagnosticStep[] = [
      { label: 'Identificar empresa', status: 'success', detail: editingId },
      { label: 'Resolver ambiente', status: 'success', detail: `${runtimeEnvironment} (${runtimeSource})` },
      { label: 'Reconfigurar webhook Asaas', status: 'running' },
    ];

    setResult({
      timestamp: new Date().toISOString(),
      environment: runtimeEnvironment,
      environmentSource: runtimeSource,
      companyId: editingId,
      integrationStatus: asaasStatus,
      steps: [...steps],
      rawResponse: null,
      rawError: null,
    });

    try {
      const { data, error } = await supabase.functions.invoke('create-asaas-account', {
        body: {
          company_id: editingId,
          mode: 'ensure_webhook',
          target_environment: runtimeEnvironment,
        },
      });

      if (error) {
        let errorBody: unknown = null;
        try {
          if (error && typeof error === 'object' && 'context' in error) {
            const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
            errorBody = await ctx?.json?.();
          }
        } catch { /* ignore */ }

        const errorMessage = (errorBody as { error?: string })?.error
          || (data as { error?: string })?.error
          || error.message
          || 'Erro desconhecido';

        steps[2] = { label: 'Reconfigurar webhook Asaas', status: 'error', detail: errorMessage };
        setResult({
          timestamp: new Date().toISOString(),
          environment: runtimeEnvironment,
          environmentSource: runtimeSource,
          companyId: editingId,
          integrationStatus: asaasStatus,
          steps: [...steps],
          rawResponse: data ?? errorBody,
          rawError: errorMessage,
        });
        return;
      }

      const action = typeof data?.action === 'string' ? data.action : 'desconhecida';
      const detail = data?.message || `Ação executada: ${action}`;
      steps[2] = {
        label: 'Reconfigurar webhook Asaas',
        status: data?.success === true ? 'success' : 'skipped',
        detail,
      };

      setResult({
        timestamp: new Date().toISOString(),
        environment: runtimeEnvironment,
        environmentSource: runtimeSource,
        companyId: editingId,
        integrationStatus: asaasStatus,
        steps: [...steps],
        rawResponse: data,
        rawError: null,
      });

      if (data?.success === true) {
        toast.success(detail);
      } else {
        toast.warning(detail);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      steps[2] = { label: 'Reconfigurar webhook Asaas', status: 'error', detail: message };
      setResult({
        timestamp: new Date().toISOString(),
        environment: runtimeEnvironment,
        environmentSource: runtimeSource,
        companyId: editingId,
        integrationStatus: asaasStatus,
        steps: [...steps],
        rawResponse: null,
        rawError: message,
      });
      toast.error(message);
    } finally {
      setRepairingWebhook(false);
    }
  };

  const handleCopyDiagnostic = () => {
    const diagnosticPayload = {
      ...result,
      asaasSnapshot: asaasSnapshot ? {
        status: asaasSnapshot.status,
        environment: asaasSnapshot.environment,
        current: {
          apiKey: asaasSnapshot.current.apiKey ? '***set***' : null,
          walletId: asaasSnapshot.current.walletId ? asaasSnapshot.current.walletId.slice(0, 8) + '...' : null,
          accountId: asaasSnapshot.current.accountId ? asaasSnapshot.current.accountId.slice(0, 8) + '...' : null,
          accountEmail: asaasSnapshot.current.accountEmail,
          onboardingComplete: asaasSnapshot.current.onboardingComplete,
        },
        reasons: asaasSnapshot.reasons,
      } : null,
      companyName: company?.name ?? null,
    };

    navigator.clipboard.writeText(JSON.stringify(diagnosticPayload, null, 2));
    toast.success('Diagnóstico copiado para a área de transferência.');
  };

  const statusIcon = (status: DiagnosticStep['status']) => {
    switch (status) {
      case 'success': return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
      case 'error': return <XCircle className="h-3.5 w-3.5 text-destructive" />;
      case 'running': return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
      case 'skipped': return <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />;
      default: return <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground" />;
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20">
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span>🔧 Diagnóstico Asaas (developer)</span>
          <Badge variant="outline" className="ml-auto text-xs">
            {runtimeEnvironment ?? 'N/A'}
          </Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 space-y-3">
        {/* Status snapshot */}
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Ambiente: </span>
            <span className="font-mono font-medium">{runtimeEnvironment ?? '—'}</span>
            <span className="text-muted-foreground"> ({runtimeSource ?? '?'})</span>
          </div>
          <div>
            <span className="text-muted-foreground">Status integração: </span>
            <Badge variant={asaasStatus === 'connected' ? 'default' : asaasStatus === 'inconsistent' ? 'destructive' : 'secondary'} className="text-xs">
              {asaasStatus}
            </Badge>
          </div>
          <div>
            <span className="text-muted-foreground">Company ID: </span>
            <span className="font-mono">{editingId ? `${editingId.slice(0, 12)}...` : '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Onboarding completo: </span>
            <span className="font-mono">{asaasSnapshot?.current.onboardingComplete ? 'sim' : 'não'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">API Key: </span>
            <span className="font-mono">{asaasSnapshot?.current.apiKey ? '***set***' : '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Wallet ID: </span>
            <span className="font-mono">{asaasSnapshot?.current.walletId ? `${asaasSnapshot.current.walletId.slice(0, 12)}...` : '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Account ID: </span>
            <span className="font-mono">{asaasSnapshot?.current.accountId ? `${asaasSnapshot.current.accountId.slice(0, 12)}...` : '—'}</span>
          </div>
        </div>

        {asaasSnapshot && asaasSnapshot.reasons.length > 0 && (
          <div className="text-xs space-y-1">
            <span className="text-muted-foreground font-medium">Alertas:</span>
            <ul className="list-disc pl-5 text-muted-foreground">
              {asaasSnapshot.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
        )}

        {/* Test connection */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTestConnection}
            disabled={testing || !editingId || !runtimeEnvironment}
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Testar conexão
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRepairWebhook}
            disabled={repairingWebhook || !editingId || !runtimeEnvironment}
          >
            {repairingWebhook ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Reconfigurar webhook
          </Button>
          {result && (
            <Button type="button" variant="ghost" size="sm" onClick={handleCopyDiagnostic}>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copiar diagnóstico
            </Button>
          )}
        </div>

        {/* Steps trace */}
        {result && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">
              Execução em {new Date(result.timestamp).toLocaleTimeString('pt-BR')}:
            </p>
            <div className="space-y-1.5">
              {result.steps.map((step, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  {statusIcon(step.status)}
                  <div>
                    <span className="font-medium">{step.label}</span>
                    {step.detail && (
                      <span className="text-muted-foreground ml-1.5">— {step.detail}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {result.rawError && (
              <div className="rounded border border-destructive/20 bg-destructive/5 p-2 text-xs">
                <span className="font-medium text-destructive">Erro técnico: </span>
                <span className="text-destructive/80">{result.rawError}</span>
              </div>
            )}

            {result.rawResponse && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Resposta bruta (JSON)
                </summary>
                <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 font-mono text-[10px]">
                  {JSON.stringify(result.rawResponse, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
