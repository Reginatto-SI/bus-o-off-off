import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { CheckCircle2, AlertTriangle, Loader2, Link2, Unlink, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

type ConnectionStatus = {
  company_gateway: 'asaas' | 'pagbank';
  company_environment: string | null;
  allowed_environments: string[];
  connection: {
    id: string;
    environment: string;
    status: string;
    credential_mode: string | null;
    account_masked: string | null;
    pix_ready: boolean;
    last_validated_at: string | null;
    last_error: string | null;
    connected_at: string | null;
  } | null;
  platform_ready: {
    connect: boolean;
    split: boolean;
    webhook: boolean;
    encryption: boolean;
    missing_secret_names: string[];
  };
};

async function callConnection<T = unknown>(body: Record<string, unknown>): Promise<{ data: T | null; errorMessage: string | null; errorCode: string | null }> {
  const { data, error } = await supabase.functions.invoke('pagbank-connection', { body });
  if (!error) return { data: data as T, errorMessage: null, errorCode: null };
  let parsed: { error?: string; error_code?: string } | null = null;
  try {
    parsed = await (error as { context?: { json?: () => Promise<{ error?: string; error_code?: string }> } }).context?.json?.() ?? null;
  } catch {
    /* ignore */
  }
  return { data: null, errorMessage: parsed?.error ?? 'Não foi possível concluir a operação.', errorCode: parsed?.error_code ?? null };
}

/**
 * Card de gateway da empresa: escolha Asaas/PagBank para NOVAS vendas e
 * conexão PagBank (Sandbox). Nunca exibe tokens; apenas status e conta mascarada.
 */
export function PagbankConnectionCard({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [sandboxToken, setSandboxToken] = useState('');
  const [sandboxAccountId, setSandboxAccountId] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, errorMessage } = await callConnection<ConnectionStatus>({ action: 'status', company_id: companyId });
    if (data) setStatus(data);
    else if (errorMessage) toast.error(errorMessage);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Retorno do Connect OAuth (?pagbank=connected|denied|error)
  useEffect(() => {
    const result = searchParams.get('pagbank');
    if (!result) return;
    if (result === 'connected') toast.success('Conta PagBank conectada.');
    else if (result === 'connected_without_account') toast.warning('Conta conectada, mas o PagBank não informou o identificador da conta. O PIX ficará indisponível até validação.');
    else if (result === 'denied') toast.error('Autorização PagBank não concluída.');
    else toast.error(`Falha ao conectar PagBank (${searchParams.get('detail') ?? 'erro'}).`);
    const next = new URLSearchParams(searchParams);
    next.delete('pagbank');
    next.delete('detail');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const run = async (action: string, extra: Record<string, unknown> = {}, successMessage?: string) => {
    setBusy(action);
    const { data, errorMessage } = await callConnection<{ authorize_url?: string }>({ action, company_id: companyId, ...extra });
    setBusy(null);
    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }
    if (action === 'connect_start' && data?.authorize_url) {
      window.location.assign(data.authorize_url);
      return;
    }
    if (successMessage) toast.success(successMessage);
    setSandboxToken('');
    await refresh();
  };

  const connection = status?.connection ?? null;
  const isConnected = connection?.status === 'connected';
  const gateway = status?.company_gateway ?? 'asaas';
  const envIsSandbox = status?.company_environment === 'sandbox';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Gateway de pagamento das novas vendas</CardTitle>
            <CardDescription>
              Escolha por onde as próximas vendas online serão cobradas. Vendas já criadas continuam no gateway original.
            </CardDescription>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => void refresh()} disabled={loading} aria-label="Atualizar status PagBank">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading && !status ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
        ) : (
          <>
            <RadioGroup
              value={gateway}
              onValueChange={(value) => {
                if (!canEdit || value === gateway) return;
                void run('set_gateway', { gateway: value }, value === 'pagbank' ? 'PagBank ativado para novas vendas.' : 'Asaas ativado para novas vendas.');
              }}
              className="grid gap-3 md:grid-cols-2"
            >
              <label className="flex items-start gap-3 p-4 rounded-lg border bg-card cursor-pointer has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary/20">
                <RadioGroupItem value="asaas" className="mt-1" disabled={!canEdit || busy !== null} />
                <div>
                  <p className="font-semibold">Asaas</p>
                  <p className="text-sm text-muted-foreground">PIX e cartão. Gateway atual em operação.</p>
                </div>
              </label>
              <label className="flex items-start gap-3 p-4 rounded-lg border bg-card cursor-pointer has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary/20">
                <RadioGroupItem value="pagbank" className="mt-1" disabled={!canEdit || busy !== null} />
                <div>
                  <p className="font-semibold flex items-center gap-2">PagBank <Badge variant="outline">Sandbox</Badge></p>
                  <p className="text-sm text-muted-foreground">Somente PIX nesta fase. Requer conta conectada e validada.</p>
                </div>
              </label>
            </RadioGroup>

            <div className="rounded-lg border p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="font-medium">Conta PagBank (Sandbox)</p>
                  {isConnected ? (
                    <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Conectada</Badge>
                  ) : (
                    <Badge variant="secondary">Não conectada</Badge>
                  )}
                  {isConnected && (
                    <Badge variant={connection?.pix_ready ? 'default' : 'destructive'}>
                      {connection?.pix_ready ? 'PIX pronto' : 'PIX indisponível'}
                    </Badge>
                  )}
                </div>
                {isConnected && canEdit && (
                  <Button type="button" variant="outline" size="sm" onClick={() => void run('disconnect', {}, 'Conta PagBank desvinculada.')} disabled={busy !== null}>
                    <Unlink className="h-4 w-4 mr-2" /> Desvincular
                  </Button>
                )}
              </div>

              {isConnected && connection && (
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Conta: <span className="font-mono">{connection.account_masked ?? '—'}</span></p>
                  <p>Modo: {connection.credential_mode === 'connect_oauth' ? 'Autorização PagBank Connect' : 'Token Sandbox manual'}</p>
                  {connection.last_error && <p className="text-destructive">Último erro: {connection.last_error}</p>}
                </div>
              )}

              {!envIsSandbox && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    O PagBank está liberado apenas em Sandbox nesta fase. A empresa está em {status?.company_environment === 'production' ? 'Produção' : 'ambiente não definido'}; para testar, ajuste o ambiente de pagamento para Sandbox.
                  </AlertDescription>
                </Alert>
              )}

              {status && !status.platform_ready.encryption && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>Plataforma sem chave de proteção de credenciais configurada. Contate o suporte SmartBus.</AlertDescription>
                </Alert>
              )}

              {canEdit && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 rounded-md border p-3">
                    <p className="text-sm font-medium flex items-center gap-2"><Link2 className="h-4 w-4" /> Conectar com autorização PagBank</p>
                    <p className="text-xs text-muted-foreground">Você será levado ao PagBank para autorizar o SmartBus a criar cobranças na sua conta.</p>
                    <Button type="button" size="sm" onClick={() => void run('connect_start')} disabled={busy !== null || !status?.platform_ready.connect || !envIsSandbox}>
                      {busy === 'connect_start' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Autorizar no PagBank
                    </Button>
                    {status && !status.platform_ready.connect && (
                      <p className="text-xs text-muted-foreground">Autorização ainda não habilitada na plataforma.</p>
                    )}
                  </div>
                  <div className="space-y-2 rounded-md border p-3">
                    <p className="text-sm font-medium">Token Sandbox (testes)</p>
                    <div className="space-y-1">
                      <Label htmlFor="pagbank-sandbox-token" className="text-xs">Token da conta Sandbox</Label>
                      <Input id="pagbank-sandbox-token" type="password" autoComplete="off" value={sandboxToken} onChange={(e) => setSandboxToken(e.target.value)} placeholder="Cole o token de Sandbox" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pagbank-sandbox-account" className="text-xs">ID da conta (recebedor)</Label>
                      <Input id="pagbank-sandbox-account" autoComplete="off" value={sandboxAccountId} onChange={(e) => setSandboxAccountId(e.target.value)} placeholder="ACCO_..." />
                    </div>
                    <Button type="button" size="sm" variant="secondary" onClick={() => void run('save_sandbox_token', { token: sandboxToken, account_id: sandboxAccountId }, 'Token Sandbox validado e salvo.')} disabled={busy !== null || sandboxToken.trim().length < 20 || !sandboxAccountId.trim() || !envIsSandbox}>
                      {busy === 'save_sandbox_token' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Validar e salvar
                    </Button>
                    <p className="text-xs text-muted-foreground">O token é validado no PagBank e guardado protegido no backend. Ele nunca é exibido novamente.</p>
                  </div>
                </div>
              )}

              {status && status.platform_ready.missing_secret_names.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Pendências de configuração da plataforma: {status.platform_ready.missing_secret_names.join(', ')}.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
