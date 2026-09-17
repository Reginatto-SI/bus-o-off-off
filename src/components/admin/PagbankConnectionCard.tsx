import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { AlertTriangle, CheckCircle2, CreditCard, FlaskConical, Loader2, RefreshCw, Settings } from 'lucide-react';
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
    split_ready?: boolean;
    capabilities_verified_at?: string | null;
    last_validated_at: string | null;
    last_error: string | null;
    connected_at: string | null;
  } | null;
  marketplace_configured?: boolean;
  capabilities?: {
    account_role: string;
    environment: string;
    auth: 'proven' | 'unproven';
    auth_verified_at: string | null;
    order: 'proven' | 'unproven';
    pix: 'proven' | 'unproven';
    card: 'proven' | 'unproven';
    split: 'proven' | 'unproven';
    capabilities_verified_at: string | null;
    marketplace_account_configured: boolean;
  } | null;
  platform_ready: {
    connect: boolean;
    split: boolean;
    webhook: boolean;
    encryption: boolean;
    missing_secret_names: string[];
  };
};

function formatDateTimeBR(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
}

function CapabilityRow({ label, proven, hint }: { label: string; proven: boolean; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b last:border-b-0">
      <div>
        <p className="text-sm">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Badge variant={proven ? 'default' : 'secondary'} className="shrink-0">
        {proven ? 'Comprovado' : 'Ainda não testado'}
      </Badge>
    </div>
  );
}

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

type Gateway = 'asaas' | 'pagbank';
type Props = {
  companyId: string;
  canEdit: boolean;
  isDeveloper: boolean;
  environment: 'sandbox' | 'production' | null;
  environmentNotice?: boolean;
  asaasStatus?: { label: string; className: string } | null;
  asaasConnected: boolean;
  asaasPixReady: boolean;
  children: ReactNode;
  developerContent: ReactNode;
};

/** Presentation only: existing connection endpoints and Asaas actions remain unchanged. */
export function PagbankConnectionCard({ companyId, canEdit, isDeveloper, environment, environmentNotice, asaasStatus: asaasStatusProp, asaasConnected, asaasPixReady, children, developerContent }: Props) {
  // Presentation guard: a missing badge must not break the payments tab.
  const asaasStatus = asaasStatusProp ?? { label: 'Não conectado', className: '' };
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [managedGateway, setManagedGateway] = useState<Gateway | null>(null);
  const [pendingGateway, setPendingGateway] = useState<Gateway | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [sandboxToken, setSandboxToken] = useState('');
  const [sandboxAccountId, setSandboxAccountId] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, errorMessage } = await callConnection<ConnectionStatus>({ action: 'status', company_id: companyId });
      if (data) setStatus(data);
      else setLoadError(errorMessage ?? 'Não foi possível consultar os provedores.');
    } catch {
      setLoadError('Não foi possível consultar os provedores. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const result = searchParams.get('pagbank');
    if (!result) return;
    setManagedGateway('pagbank');
    if (result === 'connected') toast.success('Conta PagBank conectada.');
    else if (result === 'connected_without_account') toast.warning('Conta conectada, mas sua identificação ainda precisa ser validada.');
    else if (result === 'denied') toast.error('Autorização PagBank não concluída.');
    else toast.error('Não foi possível conectar o PagBank. Tente novamente ou contate o suporte.');
    const next = new URLSearchParams(searchParams);
    next.delete('pagbank');
    next.delete('detail');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const run = async (action: string, extra: Record<string, unknown> = {}, successMessage?: string) => {
    if (!canEdit) return false;
    setBusy(action);
    try {
      const { data, errorMessage } = await callConnection<{ authorize_url?: string }>({ action, company_id: companyId, ...extra });
      if (errorMessage) {
        toast.error(isDeveloper ? errorMessage : 'Não foi possível concluir a operação. Tente novamente ou contate o suporte.');
        return false;
      }
      if (action === 'connect_start' && data?.authorize_url) {
        window.location.assign(data.authorize_url);
        return;
      }
      if (successMessage) toast.success(successMessage);
      if (action === 'save_sandbox_token') setSandboxToken('');
      // Configuration is saved by the existing endpoint, never by the company form.
      await refresh();
      return true;
    } catch {
      toast.error('Não foi possível concluir a operação. Tente novamente.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const connection = status?.connection ?? null;
  const isConnected = connection?.status === 'connected';
  const gateway = loadError ? null : status?.company_gateway ?? null;
  const envIsSandbox = status?.company_environment === 'sandbox';
  const unavailable = loading || busy !== null || Boolean(loadError) || !status;
  const pagbankLabel = !status || loadError ? 'Status indisponível'
    : connection?.status === 'error' ? 'Conexão precisa de atenção'
    : isConnected ? 'Conta conectada' : 'Não conectada';
  const canSelectPagbank = !unavailable && isConnected && envIsSandbox;
  const hasPlatformPending = status && (!status.platform_ready.split || !status.platform_ready.webhook || !status.platform_ready.encryption);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-lg">Recebimentos online</h3>
          <p className="text-sm text-muted-foreground">Gerencie suas contas e escolha o provedor das novas vendas.</p>
        </div>
        <Badge variant="outline" className="gap-1.5">
          {environment === 'sandbox' && <FlaskConical className="h-3.5 w-3.5" />}
          {environment === 'sandbox' ? 'Sandbox · testes' : environment === 'production' ? 'Produção' : 'Ambiente não identificado'}
        </Badge>
      </div>

      {environmentNotice && (
        <p className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
          Neste endereço de pré-visualização, as operações usam Sandbox. A configuração de produção da empresa permanece preservada.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-4">
        <div>
          <p className="text-xs text-muted-foreground">Provedor das novas vendas</p>
          <p className="font-semibold">{loading ? 'Consultando…' : gateway === 'asaas' ? 'Asaas' : gateway === 'pagbank' ? 'PagBank' : 'Não foi possível confirmar'}</p>
          <p className="text-xs text-muted-foreground mt-1">Vendas já criadas continuam no provedor original.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={loading || busy !== null}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Atualizar situação
        </Button>
      </div>
      {loadError && (
        <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>
          Não foi possível atualizar a escolha do provedor e a conta PagBank. Tente novamente em “Atualizar situação”. A configuração Asaas continua acessível abaixo.
        </AlertDescription></Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className={gateway === 'asaas' ? 'border-primary shadow-none' : 'shadow-none'}>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4" /> Asaas</CardTitle>
              {gateway === 'asaas' && <Badge variant="outline">Selecionado</Badge>}
            </div>
            <CardDescription>Pix e cartão</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="min-h-16 space-y-2">
              <Badge variant="outline" className={asaasStatus.className}>{asaasStatus.label}</Badge>
              <p className="text-sm text-muted-foreground">{!asaasConnected ? 'Conecte ou revise sua conta para receber online.' : asaasStatus.label === 'Com erro' ? 'A última verificação encontrou uma pendência. Revise a conta.' : asaasPixReady ? 'Conta vinculada. Pix habilitado na configuração atual.' : 'Conta vinculada. O Pix ainda precisa de configuração.'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" aria-expanded={managedGateway === 'asaas'} aria-controls="asaas-account-settings" onClick={() => setManagedGateway(managedGateway === 'asaas' ? null : 'asaas')}>
                {asaasConnected ? 'Gerenciar Asaas' : 'Configurar Asaas'}
              </Button>
              {canEdit && gateway && gateway !== 'asaas' && (
                <Button type="button" size="sm" variant="secondary" disabled={unavailable} onClick={() => setPendingGateway('asaas')}>Usar nas novas vendas</Button>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className={gateway === 'pagbank' ? 'border-primary shadow-none' : 'shadow-none'}>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4" /> PagBank</CardTitle>
              <Badge variant="outline">{gateway === 'pagbank' ? 'Selecionado' : 'Em testes'}</Badge>
            </div>
            <CardDescription>Pix · disponível apenas em Sandbox</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="min-h-16 space-y-2">
              <Badge variant="secondary">{loading ? 'Consultando…' : pagbankLabel}</Badge>
              <p className="text-sm text-muted-foreground">{!status || loadError ? 'Consulte a situação antes de configurar esta conta.' : !isConnected ? 'Conecte uma conta de testes para começar.' : hasPlatformPending ? 'Há configurações da plataforma pendentes para o teste completo.' : connection?.pix_ready && connection?.split_ready ? 'Pix e divisão verificados em cobrança de teste.' : 'Conexão validada. O teste de pagamento ainda precisa ser concluído.'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" aria-expanded={managedGateway === 'pagbank'} aria-controls="pagbank-account-settings" onClick={() => setManagedGateway(managedGateway === 'pagbank' ? null : 'pagbank')}>
                {isConnected ? 'Gerenciar PagBank' : 'Configurar PagBank'}
              </Button>
              {canEdit && gateway && gateway !== 'pagbank' && (
                <Button type="button" size="sm" variant="secondary" disabled={!canSelectPagbank} onClick={() => setPendingGateway('pagbank')}>Usar nas novas vendas</Button>
              )}
            </div>
            {status && !envIsSandbox && <p className="text-xs text-muted-foreground">A ativação em produção ainda não está disponível.</p>}
            {status && envIsSandbox && !isConnected && <p className="text-xs text-muted-foreground">Conecte a conta antes de selecionar este provedor.</p>}
          </CardContent>
        </Card>
      </div>

      {/* Keep both configuration sections mounted so opening another card never clears inputs. */}
      <section id="asaas-account-settings" hidden={managedGateway !== 'asaas'} className="rounded-lg border p-5 space-y-4">{children}</section>
      <section id="pagbank-account-settings" hidden={managedGateway !== 'pagbank'} className="rounded-lg border p-5 space-y-4">
        <div><h4 className="font-medium">Conta PagBank</h4><p className="text-sm text-muted-foreground">Conexão da empresa vendedora · Sandbox</p></div>
        {!status || loadError ? <p className="text-sm text-muted-foreground">Atualize a situação para consultar a conta.</p> : <>
          {isConnected ? (
            <div className="space-y-3">
              <p className="text-sm flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Conta conectada: <span className="font-mono">{connection?.account_masked ?? 'Identificação pendente'}</span></p>
              <p className="text-sm text-muted-foreground">Última validação da conexão: {formatDateTimeBR(connection?.last_validated_at)}</p>
              <p className="text-sm text-muted-foreground">{connection?.pix_ready && connection?.split_ready ? 'Pix e divisão verificados em teste. Produção permanece indisponível.' : 'Validar a conexão confirma o acesso à conta. Pix e divisão são verificados na cobrança de teste.'}</p>
              {canEdit && <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={unavailable} onClick={() => void run('validate', {}, 'Conexão PagBank validada.')}>
                  {busy === 'validate' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Verificar conexão
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={unavailable} onClick={() => setDisconnectOpen(true)}>Desvincular conta</Button>
              </div>}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Autorize o SmartBus a conectar sua conta no PagBank Sandbox. Essa conexão não muda o provedor das novas vendas.</p>
              {connection?.status === 'error' && <p className="text-sm text-amber-700">A conexão precisa ser renovada. Autorize a conta novamente.</p>}
              {canEdit && <Button type="button" size="sm" disabled={unavailable || !status.platform_ready.connect || !status.platform_ready.encryption} onClick={() => void run('connect_start')}>
                {busy === 'connect_start' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Conectar com PagBank
              </Button>}
              {!status.platform_ready.connect && <p className="text-sm text-muted-foreground">A autorização está aguardando configuração pela equipe SmartBus.{isDeveloper ? ' A alternativa por token está na área do desenvolvedor.' : ' Entre em contato com o suporte.'}</p>}
            </div>
          )}
          {hasPlatformPending && <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>Existem configurações da plataforma pendentes para concluir os testes.{isDeveloper ? ' Consulte os detalhes na área do desenvolvedor.' : ' A equipe SmartBus precisa concluir essa preparação.'}</AlertDescription></Alert>}
          {!envIsSandbox && <p className="text-sm text-muted-foreground">Esta conta é exclusiva de testes. Conectá-la não altera o ambiente da empresa nem libera PagBank em produção.</p>}
        </>}
      </section>

      {isDeveloper && (
        <details className="rounded-lg border border-dashed bg-muted/20">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Área do desenvolvedor <span className="ml-2 font-normal text-muted-foreground">Diagnósticos e configurações internas</span></summary>
          <div className="p-4 pt-0 space-y-4">
            <div className="rounded-lg border bg-background p-4 space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2"><Settings className="h-4 w-4" /> Diagnóstico PagBank · Sandbox</h4>
              {status?.capabilities && !loadError ? <>
                <p className="text-xs text-muted-foreground">Autenticação e teste de pagamento são verificações distintas. “Ainda não testado” não significa falha.</p>
                <CapabilityRow label="Autenticação" proven={status.capabilities.auth === 'proven'} hint={`Última validação: ${formatDateTimeBR(status.capabilities.auth_verified_at)}`} />
                <CapabilityRow label="Criação do pedido" proven={status.capabilities.order === 'proven'} />
                <CapabilityRow label="Pix" proven={status.capabilities.pix === 'proven'} />
                <CapabilityRow label="Divisão do pagamento" proven={status.capabilities.split === 'proven'} />
                <p className="text-xs text-muted-foreground">Cartão PagBank: fora da fase atual.</p>
                <p className="text-xs text-muted-foreground">Recebedor SmartBus: {status.capabilities.marketplace_account_configured ? 'configurado' : 'pendente'} · Webhook: {status.platform_ready.webhook ? 'configurado (não comprova entrega)' : 'pendente'}</p>
              </> : <p className="text-sm text-muted-foreground">{loadError ?? 'Aguardando consulta da conexão.'}</p>}
              {connection?.last_error && <p className="text-xs text-destructive">Último erro: {connection.last_error}</p>}
              {connection && <p className="text-xs text-muted-foreground">Modo: {connection.credential_mode === 'connect_oauth' ? 'Autorização PagBank' : 'Token Sandbox manual'}</p>}
              {status && !status.platform_ready.split && <p className="text-xs text-muted-foreground">Recebedor da plataforma: configurar PAGBANK_MARKETPLACE_ACCOUNT_ID_SANDBOX.</p>}
              {status && !status.platform_ready.webhook && <p className="text-xs text-muted-foreground">Webhook: configurar PAGBANK_WEBHOOK_TOKEN_SANDBOX no cofre de segredos.</p>}
              {status && !status.platform_ready.encryption && <p className="text-xs text-destructive">Proteção das credenciais ainda não configurada no servidor.</p>}
              {canEdit && isConnected && <Button type="button" variant="outline" size="sm" disabled={unavailable || !status?.platform_ready.connect || !status?.platform_ready.encryption} onClick={() => void run('connect_start')}>Renovar autorização PagBank</Button>}
            </div>
            {canEdit && <details className="rounded-lg border bg-background">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Alternativa de teste: token manual PagBank</summary>
              <div className="px-4 pb-4 space-y-3">
                <p className="text-sm text-muted-foreground">Use somente a conta Sandbox da empresa vendedora. Salvar não altera o provedor nem o ambiente das vendas.</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1"><Label htmlFor="pagbank-sandbox-token">Token Sandbox</Label><Input id="pagbank-sandbox-token" type="password" autoComplete="off" value={sandboxToken} onChange={e => setSandboxToken(e.target.value)} placeholder="Token da empresa vendedora" /></div>
                  <div className="space-y-1"><Label htmlFor="pagbank-sandbox-account">ID da conta vendedora</Label><Input id="pagbank-sandbox-account" autoComplete="off" value={sandboxAccountId} onChange={e => setSandboxAccountId(e.target.value)} placeholder="ACCO_…" aria-describedby="pagbank-account-help" aria-invalid={sandboxAccountId.trim().length > 0 && !/^ACCO_[A-Za-z0-9-]+$/.test(sandboxAccountId.trim())} /></div>
                </div>
                <p id="pagbank-account-help" className="text-xs text-muted-foreground">O ID começa com ACCO_ e deve corresponder ao token. Não use e-mail nem a conta da plataforma SmartBus.</p>
                <Button type="button" size="sm" variant="secondary" disabled={unavailable || !status?.platform_ready.encryption || sandboxToken.trim().length < 20 || !/^ACCO_[A-Za-z0-9-]+$/.test(sandboxAccountId.trim())} onClick={() => void run('save_sandbox_token', { token: sandboxToken.trim(), account_id: sandboxAccountId.trim() }, 'Token Sandbox validado e salvo. O teste de pagamento continua separado.')}>
                  {busy === 'save_sandbox_token' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Validar e salvar token
                </Button>
              </div>
            </details>}
            {developerContent}
          </div>
        </details>
      )}

      <AlertDialog open={pendingGateway !== null} onOpenChange={open => { if (!open && !busy) setPendingGateway(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Usar {pendingGateway === 'pagbank' ? 'PagBank' : 'Asaas'} nas novas vendas?</AlertDialogTitle><AlertDialogDescription>
            A troca será salva imediatamente ao confirmar. Vendas já criadas continuam no provedor original. Conectar uma conta, por si só, não realiza essa troca.
            {pendingGateway === 'pagbank' && ' PagBank continua restrito a testes Sandbox; conta conectada não comprova o fluxo completo de pagamento.'}
          </AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={busy !== null}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={!canEdit || unavailable || (pendingGateway === 'pagbank' && !canSelectPagbank)} onClick={async event => {
            event.preventDefault();
            if (!pendingGateway) return;
            if (await run('set_gateway', { gateway: pendingGateway }, 'Provedor das novas vendas atualizado.')) setPendingGateway(null);
          }}>{busy === 'set_gateway' ? 'Salvando…' : 'Confirmar troca'}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Desvincular a conta PagBank de testes?</AlertDialogTitle><AlertDialogDescription>A conexão Sandbox desta empresa será revogada. Se PagBank estiver selecionado, o sistema voltará a selecionar Asaas para novas vendas; confira a configuração Asaas antes de continuar. O histórico de vendas será preservado.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={busy !== null}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={!canEdit || unavailable} onClick={async event => { event.preventDefault(); if (await run('disconnect', {}, 'Conta PagBank desvinculada.')) setDisconnectOpen(false); }}>Confirmar desvinculação</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
