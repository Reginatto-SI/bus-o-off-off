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

type AsaasIntegrationCheckResponse = {
  status: 'ok' | 'error';
  integration_status:
    | 'valid'
    | 'invalid'
    | 'incomplete'
    | 'not_found'
    | 'pending'
    | 'communication_error';
  environment: PaymentEnvironment;
  diagnostic_stage:
    | 'input_validation'
    | 'company_lookup'
    | 'credentials_validation'
    | 'asaas_request';
  details: {
    has_api_key: boolean;
    has_account_id: boolean;
    has_wallet_id: boolean;
    missing_fields: string[];
    asaas_request_attempted: boolean;
    asaas_account_found: boolean;
    wallet_found: boolean;
    account_id_matches: boolean;
    wallet_id_matches: boolean;
    onboarding_complete: boolean;
    local_pix_ready?: boolean;
    gateway_pix_ready?: boolean;
    pix_readiness_divergent?: boolean;
    pix_ready: boolean;
    pix_readiness_action?: string;
    pix_last_checked_at?: string;
    pix_last_error?: string | null;
    pix_total_keys?: number;
    pix_active_keys?: number;
    pix_key_statuses?: string[];
    pix_key_types?: string[];
    account_status?: string | null;
    account_substatus?: {
      commercial: string | null;
      bank: string | null;
      documentation: string | null;
      general: string | null;
    } | null;
    local_metadata_warning?: string | null;
    api_key_fingerprint?: string | null;
    checked_at?: string;
    gateway_wallet_id?: string | null;
    gateway_account_id?: string | null;
    asaas_http_status?: number;
    error_type?: string;
  };
  message: string;
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
  checkResponse: AsaasIntegrationCheckResponse | null;
};

interface AsaasDiagnosticPanelProps {
  company: Company | null;
  runtimeEnvironment: PaymentEnvironment | null;
  runtimeSource: string | null;
  asaasStatus: AsaasIntegrationStatus;
  editingId: string | null;
  asaasSnapshot: ReturnType<typeof import('@/lib/asaasIntegrationStatus').getAsaasIntegrationSnapshot> | null;
  lastAsaasCheck: AsaasIntegrationCheckResponse | null;
  persistedPixReady: boolean;
  persistedPixLastError: string | null;
}

function formatList(values?: string[]) {
  if (!values || values.length === 0) return '—';
  return values.join(', ');
}

function getPixOperationalMessage(params: {
  hasQueryError: boolean;
  hasGatewayPixDiagnosis: boolean;
  gatewayPixReady?: boolean;
  accountApproved: boolean;
  localMetadataWarning: string | null;
  divergent: boolean;
}) {
  if (params.hasQueryError) return 'Pix indisponível: erro ao consultar Asaas';
  if (!params.hasGatewayPixDiagnosis) {
    return params.localMetadataWarning
      ? 'Pendência cadastral local impede consolidação completa'
      : 'Diagnóstico Pix incompleto: falta consolidar dados do gateway';
  }
  if (!params.gatewayPixReady) return 'Pix indisponível: sem chave ACTIVE';
  if (!params.accountApproved) return 'Pix indisponível: conta não aprovada';
  if (params.divergent) return 'Pix indisponível: divergência entre estado local e gateway';
  return 'Pix operacional neste ambiente';
}

export function AsaasDiagnosticPanel({
  company,
  runtimeEnvironment,
  runtimeSource,
  asaasStatus,
  editingId,
  asaasSnapshot,
  lastAsaasCheck,
  persistedPixReady,
  persistedPixLastError,
}: AsaasDiagnosticPanelProps) {
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [repairingWebhook, setRepairingWebhook] = useState(false);
  const [result, setResult] = useState<DiagnosticResult | null>(null);

  const currentCheck = result?.checkResponse ?? lastAsaasCheck;
  const details = currentCheck?.details;
  const localPixReady = details?.local_pix_ready ?? persistedPixReady;
  const gatewayPixReady = details?.gateway_pix_ready;
  const divergent = details?.pix_readiness_divergent ?? false;
  const localMetadataWarning = details?.local_metadata_warning ?? null;
  const hasGatewayPixDiagnosis = typeof details?.gateway_pix_ready === 'boolean'
    && typeof details?.pix_total_keys === 'number'
    && typeof details?.pix_active_keys === 'number';
  const accountStatus = (details?.account_status ?? '').toUpperCase();
  const accountApproved = Boolean(details?.onboarding_complete) && accountStatus !== 'PENDING' && accountStatus !== 'REJECTED';
  const hasQueryError = currentCheck?.integration_status === 'communication_error' || currentCheck?.status === 'error' && currentCheck?.details.error_type === 'asaas_diagnostic_query_failed';
  const finalMessage = getPixOperationalMessage({
    hasQueryError,
    hasGatewayPixDiagnosis,
    gatewayPixReady,
    accountApproved,
    localMetadataWarning,
    divergent,
  });

  const handleTestConnection = async () => {
    if (!editingId || !runtimeEnvironment) {
      toast.error('Empresa ou ambiente não identificado.');
      return;
    }

    setTesting(true);
    const steps: DiagnosticStep[] = [
      { label: 'Identificar empresa', status: 'success', detail: editingId },
      { label: 'Resolver ambiente', status: 'success', detail: `${runtimeEnvironment} (${runtimeSource})` },
      { label: 'Consultar edge function check-asaas-integration', status: 'running' },
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
      checkResponse: null,
    });

    try {
      const { data, error } = await supabase.functions.invoke('check-asaas-integration', {
        body: {
          company_id: editingId,
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

        steps[2] = { label: 'Consultar edge function check-asaas-integration', status: 'error', detail: errorMessage };
        setResult({
          timestamp: new Date().toISOString(),
          environment: runtimeEnvironment,
          environmentSource: runtimeSource,
          companyId: editingId,
          integrationStatus: asaasStatus,
          steps: [...steps],
          rawResponse: data ?? errorBody,
          rawError: errorMessage,
          checkResponse: null,
        });
        return;
      }

      const response = data as AsaasIntegrationCheckResponse;
      steps[2] = { label: 'Consultar edge function check-asaas-integration', status: 'success', detail: 'Resposta recebida' };
      steps.push({
        label: 'Consolidar diagnóstico Pix',
        status: response.status === 'ok' ? 'success' : 'skipped',
        detail: response.message,
      });

      setResult({
        timestamp: new Date().toISOString(),
        environment: runtimeEnvironment,
        environmentSource: runtimeSource,
        companyId: editingId,
        integrationStatus: asaasStatus,
        steps: [...steps],
        rawResponse: response,
        rawError: null,
        checkResponse: response,
      });

      if (response.status === 'ok') {
        toast.success(response.message);
      } else {
        toast.warning(response.message);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      steps[2] = { label: 'Consultar edge function check-asaas-integration', status: 'error', detail: message };
      setResult({
        timestamp: new Date().toISOString(),
        environment: runtimeEnvironment,
        environmentSource: runtimeSource,
        companyId: editingId,
        integrationStatus: asaasStatus,
        steps: [...steps],
        rawResponse: null,
        rawError: message,
        checkResponse: null,
      });
      toast.error(message);
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
      checkResponse: null,
    });

    try {
      // Comentário de manutenção: restauramos a ação operacional pré-existente do card
      // para não reduzir capacidade de suporte, mantendo a nova verificação Pix separada.
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
          checkResponse: null,
        });
        toast.error(errorMessage);
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
        checkResponse: null,
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
        checkResponse: null,
      });
      toast.error(message);
    } finally {
      setRepairingWebhook(false);
    }
  };

  const handleCopyDiagnostic = () => {
    const copyPayload = {
      companyName: company?.name ?? null,
      companyId: editingId,
      environment: runtimeEnvironment,
      environmentSource: runtimeSource,
      integrationStatus: asaasStatus,
      persisted_pix: {
        ready: persistedPixReady,
        last_error: persistedPixLastError,
      },
      gateway_pix: currentCheck ? {
        status: currentCheck.status,
        integration_status: currentCheck.integration_status,
        message: currentCheck.message,
        details: currentCheck.details,
      } : null,
      final_message: finalMessage,
      execution: result,
      asaasSnapshot: asaasSnapshot ? {
        status: asaasSnapshot.status,
        environment: asaasSnapshot.environment,
        current: {
          apiKey: asaasSnapshot.current.apiKey ? '***set***' : null,
          walletId: asaasSnapshot.current.walletId ? `${asaasSnapshot.current.walletId.slice(0, 8)}...` : null,
          accountId: asaasSnapshot.current.accountId ? `${asaasSnapshot.current.accountId.slice(0, 8)}...` : null,
          onboardingComplete: asaasSnapshot.current.onboardingComplete,
        },
      } : null,
    };

    navigator.clipboard.writeText(JSON.stringify(copyPayload, null, 2));
    toast.success('Diagnóstico Pix copiado para a área de transferência.');
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
            <span className="text-muted-foreground">API Key fingerprint: </span>
            <span className="font-mono">{details?.api_key_fingerprint ?? '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Account ID (gateway): </span>
            <span className="font-mono">{details?.gateway_account_id ?? asaasSnapshot?.current.accountId ?? '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Wallet ID (gateway): </span>
            <span className="font-mono">{details?.gateway_wallet_id ?? asaasSnapshot?.current.walletId ?? '—'}</span>
          </div>
        </div>

        <div className="rounded border bg-background p-3 text-xs space-y-2">
          <p className="font-medium">Diagnóstico Pix</p>
          <div className="grid gap-1 sm:grid-cols-2">
            <p>Total de chaves: <strong>{details?.pix_total_keys ?? 0}</strong></p>
            <p>Chaves ACTIVE: <strong>{details?.pix_active_keys ?? 0}</strong></p>
            <p>Status encontrados: <strong>{formatList(details?.pix_key_statuses)}</strong></p>
            <p>Tipos de chave: <strong>{formatList(details?.pix_key_types)}</strong></p>
            <p>Última checagem: <strong>{details?.checked_at ?? details?.pix_last_checked_at ?? '—'}</strong></p>
            <p>Último erro: <strong>{details?.pix_last_error ?? persistedPixLastError ?? '—'}</strong></p>
          </div>
        </div>

        <div className="rounded border bg-background p-3 text-xs space-y-1">
          <p className="font-medium">Conta Asaas</p>
          <p>Status da conta: <strong>{details?.account_status ?? '—'}</strong></p>
          <p>Substatus comercial: <strong>{details?.account_substatus?.commercial ?? '—'}</strong></p>
          <p>Substatus banco: <strong>{details?.account_substatus?.bank ?? '—'}</strong></p>
          <p>Substatus documentação: <strong>{details?.account_substatus?.documentation ?? '—'}</strong></p>
          <p>Substatus geral: <strong>{details?.account_substatus?.general ?? '—'}</strong></p>
        </div>

        <div className="rounded border bg-background p-3 text-xs space-y-1">
          <p className="font-medium">Comparativo de readiness (local x gateway)</p>
          <p>Readiness local persistido: <strong>{localPixReady ? 'Pronto' : 'Pendente'}</strong></p>
          <p>Readiness consultado no gateway: <strong>{typeof gatewayPixReady === 'boolean' ? (gatewayPixReady ? 'Pronto' : 'Pendente') : 'Não consolidado'}</strong></p>
          <p>Divergência detectada: <strong>{divergent ? 'Sim' : 'Não'}</strong></p>
        </div>

        {localMetadataWarning && (
          <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <span className="font-medium">Pendência cadastral local: </span>
            <span>{localMetadataWarning}</span>
          </div>
        )}

        <div className="rounded border border-primary/30 bg-primary/5 p-3 text-sm">
          <span className="font-medium">Conclusão operacional: </span>
          <span>{finalMessage}</span>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTestConnection}
            disabled={testing || !editingId || !runtimeEnvironment}
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Verificar Pix agora
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
          {(result || lastAsaasCheck) && (
            <Button type="button" variant="ghost" size="sm" onClick={handleCopyDiagnostic}>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copiar diagnóstico Pix
            </Button>
          )}
        </div>

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
