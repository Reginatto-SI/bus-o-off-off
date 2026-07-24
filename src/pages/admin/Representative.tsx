import { useEffect, useMemo, useState } from 'react';
// Comentário: Navigate removido — o acesso é aberto a todos os perfis autenticados do painel admin.
import { AlertTriangle, ArrowRight, Building2, ChevronDown, ClipboardList, Copy, Loader2, QrCode, Wallet, Youtube } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { AdminLayout } from '@/components/layout/AdminLayout';
import { AdminMobileBottomNav } from '@/components/layout/AdminMobileBottomNav';
import { AdminMobileHeader } from '@/components/layout/AdminMobileHeader';
import { AdminMobileMoreMenu } from '@/components/layout/AdminMobileMoreMenu';
import { adminMobileBottomNavItems } from '@/components/layout/adminMobileBottomNavItems';
import { SellerQRCodeModal } from '@/components/admin/SellerQRCodeModal';
import { AsaasTutorialVideoDialog } from '@/components/admin/AsaasTutorialVideoDialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useRuntimePaymentEnvironment } from '@/hooks/use-runtime-payment-environment';
import { formatCurrencyBRL } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

type RepresentativeStatus = 'ativo' | 'inativo' | 'bloqueado' | 'pendente_validacao';
type CommissionStatus = 'pendente' | 'disponivel' | 'bloqueada' | 'paga';

type RepresentativeDashboardRow = {
  id: string;
  company_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: RepresentativeStatus;
  representative_code: string;
  referral_link: string | null;
  asaas_wallet_id_production: string | null;
  asaas_wallet_id_sandbox: string | null;
  commission_percent: number;
  linked_companies_count: number;
  active_linked_companies_count: number;
  commission_total: number;
  commission_paid: number;
  commission_pending: number;
  commission_blocked: number;
  blocked_count: number;
};

type RepresentativeLinkRow = {
  id: string;
  company_id: string;
  company_name: string;
  company_trade_name: string | null;
  company_is_active: boolean;
  linked_at: string;
  source_code: string;
  link_source: 'url_ref' | 'codigo_manual' | 'admin_ajuste';
  sales_count: number;
  commission_total: number;
};

type RepresentativeCommissionRow = {
  id: string;
  company_id: string;
  company_name: string;
  company_trade_name: string | null;
  sale_id: string;
  payment_environment: string;
  base_amount: number;
  commission_percent: number;
  commission_amount: number;
  status: CommissionStatus;
  available_at: string | null;
  paid_at: string | null;
  blocked_reason: string | null;
  created_at: string;
};

function resolveOfficialLink(referralLink: string | null) {
  if (!referralLink) return '';
  if (referralLink.startsWith('http')) return referralLink;
  return `${window.location.origin}${referralLink}`;
}

function getCommissionStatusLabel(status: CommissionStatus) {
  if (status === 'paga') return 'Paga';
  if (status === 'disponivel') return 'Disponível';
  if (status === 'pendente') return 'Pendente';
  return 'Bloqueada';
}

function getCommissionStatusVariant(status: CommissionStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'paga') return 'default';
  if (status === 'disponivel') return 'secondary';
  if (status === 'pendente') return 'outline';
  return 'destructive';
}

function getRepresentativeStatusLabel(status: RepresentativeStatus) {
  if (status === 'ativo') return 'Ativo';
  if (status === 'inativo') return 'Inativo';
  if (status === 'bloqueado') return 'Bloqueado';
  return 'Pendente de validação';
}

function formatOptionalDateBR(dateValue: string | null | undefined) {
  if (!dateValue) return '—';

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '—';

  return format(date, 'dd/MM/yyyy', { locale: ptBR });
}

export default function RepresentativeAdmin() {
  const { loading: authLoading, activeCompanyId, activeCompany } = useAuth();
  const { environment: paymentEnvironment, isReady: paymentEnvironmentReady } = useRuntimePaymentEnvironment();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<RepresentativeDashboardRow | null>(null);
  const [links, setLinks] = useState<RepresentativeLinkRow[]>([]);
  const [commissions, setCommissions] = useState<RepresentativeCommissionRow[]>([]);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [walletTutorialModalOpen, setWalletTutorialModalOpen] = useState(false);
  const [walletInput, setWalletInput] = useState('');
  const [walletSaving, setWalletSaving] = useState(false);
  const [walletTextHelpOpen, setWalletTextHelpOpen] = useState(false);
  const [mobileMoreMenuOpen, setMobileMoreMenuOpen] = useState(false);


  useEffect(() => {
    if (!walletModalOpen) {
      // Comentário de manutenção: o tutorial é complementar ao modal da carteira;
      // se o modal principal fechar por qualquer caminho, o vídeo não deve ficar aberto sozinho.
      setWalletTutorialModalOpen(false);
      setWalletTextHelpOpen(false);
    }
  }, [walletModalOpen]);

  useEffect(() => {
    // Comentário de manutenção: em troca de empresa/contexto, evita manter um tutorial
    // associado à carteira anterior sem interferir no valor digitado enquanto o modal segue aberto.
    setWalletTutorialModalOpen(false);
    setWalletTextHelpOpen(false);
  }, [activeCompanyId]);

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;
    setLoading(true);
    setDashboard(null);
    setLinks([]);
    setCommissions([]);
    setWalletInput('');

    if (!activeCompanyId) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const loadRepresentativePanel = async () => {
      // RPCs security definer validam empresa ativa/papel e evitam queries abertas de financeiro no frontend.
      const [dashboardResponse, linksResponse, commissionsResponse] = await Promise.all([
        supabase.rpc('get_company_representative_dashboard', { p_company_id: activeCompanyId }),
        supabase.rpc('get_company_representative_links', { p_company_id: activeCompanyId }),
        supabase.rpc('get_company_representative_commissions', { p_company_id: activeCompanyId }),
      ]);

      if (cancelled) return;

      if (dashboardResponse.error) {
        console.error('[admin/representante] dashboard RPC failed', dashboardResponse.error);
        toast.error('Não foi possível carregar o painel de representante.');
        setDashboard(null);
      } else {
        const row = Array.isArray(dashboardResponse.data) ? dashboardResponse.data[0] : dashboardResponse.data;
        setDashboard((row ?? null) as RepresentativeDashboardRow | null);
      }

      if (linksResponse.error) {
        console.error('[admin/representante] links RPC failed', linksResponse.error);
        toast.error('Não foi possível carregar as empresas indicadas.');
        setLinks([]);
      } else {
        setLinks((linksResponse.data ?? []) as RepresentativeLinkRow[]);
      }

      if (commissionsResponse.error) {
        console.error('[admin/representante] commissions RPC failed', commissionsResponse.error);
        toast.error('Não foi possível carregar o ledger de comissões.');
        setCommissions([]);
      } else {
        setCommissions((commissionsResponse.data ?? []) as RepresentativeCommissionRow[]);
      }

      setLoading(false);
    };

    void loadRepresentativePanel();

    return () => {
      cancelled = true;
    };
  }, [activeCompanyId, authLoading]);

  const officialLink = useMemo(() => resolveOfficialLink(dashboard?.referral_link ?? null), [dashboard?.referral_link]);
  const walletId = paymentEnvironment === 'production'
    ? dashboard?.asaas_wallet_id_production ?? ''
    : paymentEnvironment === 'sandbox'
      ? dashboard?.asaas_wallet_id_sandbox ?? ''
      : '';
  const paymentEnvironmentLabel = paymentEnvironment === 'production'
    ? 'Produção'
    : paymentEnvironment === 'sandbox'
      ? 'Sandbox'
      : 'Não resolvido';
  const walletActionLabel = walletId ? 'Alterar carteira' : 'Configurar carteira';
  const walletSummaryStatus = !paymentEnvironmentReady
    ? 'Ambiente indisponível'
    : walletId
      ? 'Configurada'
      : 'Não configurada';

  const copyOfficialLink = async () => {
    if (!officialLink) {
      toast.error('Link oficial indisponível.');
      return;
    }

    await navigator.clipboard.writeText(officialLink);
    toast.success('Link de representante copiado.');
  };

  const openWalletModal = () => {
    setWalletInput(walletId);
    setWalletModalOpen(true);
  };

  const saveWallet = async () => {
    if (!dashboard?.id || !paymentEnvironmentReady) return;

    const normalizedWallet = walletInput.trim();
    const isProduction = paymentEnvironment === 'production';
    const isSandbox = paymentEnvironment === 'sandbox';

    if (!isProduction && !isSandbox) {
      toast.error('Ambiente de pagamento não resolvido.');
      return;
    }

    setWalletSaving(true);

    // Enviamos NULL para o outro ambiente para a RPC preservar o valor existente.
    const { data, error } = await supabase.rpc('update_representative_wallet', {
      p_representative_id: dashboard.id,
      p_asaas_wallet_id_production: isProduction ? normalizedWallet : null,
      p_asaas_wallet_id_sandbox: isSandbox ? normalizedWallet : null,
    });

    setWalletSaving(false);

    if (error) {
      console.error('[admin/representante] update wallet RPC failed', error);
      toast.error('Não foi possível salvar a wallet do representante.');
      return;
    }

    const updatedRepresentative = data as Pick<RepresentativeDashboardRow, 'asaas_wallet_id_production' | 'asaas_wallet_id_sandbox'> | null;
    setDashboard((current) => current
      ? {
          ...current,
          asaas_wallet_id_production: updatedRepresentative
            ? updatedRepresentative.asaas_wallet_id_production
            : current.asaas_wallet_id_production,
          asaas_wallet_id_sandbox: updatedRepresentative
            ? updatedRepresentative.asaas_wallet_id_sandbox
            : current.asaas_wallet_id_sandbox,
        }
      : current);
    setWalletModalOpen(false);
    toast.success('Wallet do representante atualizada.');
  };

  if (authLoading || loading) {
    return (
      <AdminLayout>
        <div className="min-h-screen bg-slate-50 pb-24 lg:bg-transparent lg:pb-0">
          <div className="lg:hidden">
            <AdminMobileHeader
              title="Representante"
              subtitle="Indicações, empresas e comissões"
              showMenuButton={false}
            />
          </div>
          <div className="flex min-h-[50vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
          <div className="lg:hidden">
            <AdminMobileBottomNav
              items={adminMobileBottomNavItems}
              onMoreClick={() => setMobileMoreMenuOpen(true)}
            />
            <AdminMobileMoreMenu open={mobileMoreMenuOpen} onOpenChange={setMobileMoreMenuOpen} />
          </div>
        </div>
      </AdminLayout>
    );
  }

  // Acesso liberado para todos os perfis autenticados do painel admin:
  // qualquer empresa pode atuar como representante e indicar novas empresas.
  // O isolamento por empresa continua garantido pelo activeCompanyId + RLS.



  if (!activeCompanyId) {
    return (
      <AdminLayout>
        <div className="min-h-screen bg-slate-50 pb-24 lg:bg-transparent lg:pb-0">
          <div className="lg:hidden">
            <AdminMobileHeader
              title="Representante"
              subtitle="Indicações, empresas e comissões"
              showMenuButton={false}
            />
          </div>
          <div className="page-container max-w-md px-3 py-4 sm:px-6 md:max-w-3xl lg:max-w-7xl lg:px-8 lg:py-6">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Empresa ativa não encontrada</AlertTitle>
              <AlertDescription>Selecione uma empresa ativa para acessar o painel de representante.</AlertDescription>
            </Alert>
          </div>
          <div className="lg:hidden">
            <AdminMobileBottomNav
              items={adminMobileBottomNavItems}
              onMoreClick={() => setMobileMoreMenuOpen(true)}
            />
            <AdminMobileMoreMenu open={mobileMoreMenuOpen} onOpenChange={setMobileMoreMenuOpen} />
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      {/* Mobile usa chrome próprio; em lg+ a hierarquia desktop do painel permanece preservada. */}
      <div className="min-h-screen bg-slate-50 pb-24 lg:bg-transparent lg:pb-0">
        <div className="lg:hidden">
          <AdminMobileHeader
            title="Representante"
            subtitle="Indicações, empresas e comissões"
            showMenuButton={false}
          />
        </div>

      <div className="page-container max-w-md space-y-4 px-3 py-4 sm:px-6 md:max-w-3xl lg:max-w-7xl lg:space-y-6 lg:px-8 lg:py-6">
        <div className="hidden flex-col gap-3 lg:flex lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Representante Comercial</h1>
            <p className="text-muted-foreground">
              Link próprio da empresa {activeCompany?.trade_name || activeCompany?.name || 'ativa'} para indicar novas empresas.
            </p>
          </div>
          {dashboard && (
            <Badge variant={dashboard.status === 'ativo' ? 'default' : 'secondary'} className="w-fit">
              {getRepresentativeStatusLabel(dashboard.status)}
            </Badge>
          )}
        </div>

        {dashboard && (
          <Card className="rounded-3xl border-slate-200/70 bg-white shadow-sm lg:hidden">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Representante</p>
                  <h1 className="line-clamp-2 break-words text-lg font-bold leading-tight text-slate-950">
                    {dashboard.name}
                  </h1>
                </div>
                <Badge variant={dashboard.status === 'ativo' ? 'default' : 'secondary'} className="shrink-0">
                  {getRepresentativeStatusLabel(dashboard.status)}
                </Badge>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div className="min-w-0 rounded-2xl border bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Empresas indicadas</p>
                  <p className="font-semibold text-slate-900">
                    {dashboard.linked_companies_count ?? 0}
                  </p>
                </div>
                <div className="min-w-0 rounded-2xl border bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Carteira</p>
                  <p className="font-semibold text-slate-900">
                    {walletSummaryStatus}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!paymentEnvironmentReady && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Ambiente de pagamento não resolvido</AlertTitle>
            <AlertDescription>
              Não foi possível determinar o ambiente operacional para exibir a carteira correta do representante.
            </AlertDescription>
          </Alert>
        )}

        {paymentEnvironmentReady && !walletId && (
          <Alert>
            <Wallet className="h-4 w-4" />
            <AlertTitle>Carteira de recebimento ausente</AlertTitle>
            <AlertDescription>
              Seu link já está ativo. Para receber comissões automaticamente, configure sua carteira de recebimento.
            </AlertDescription>
          </Alert>
        )}

        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="rounded-3xl border-slate-200/70 bg-white shadow-sm lg:col-span-2 lg:rounded-lg">
            <CardHeader className="px-4 py-4 sm:px-6">
              <CardTitle>Link oficial da empresa</CardTitle>
              <CardDescription>Código e link público usados para cadastrar empresas indicadas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-4 pb-4 sm:px-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="min-w-0 rounded-2xl border bg-muted/20 p-3 lg:rounded-lg">
                  <p className="text-xs text-muted-foreground">Código oficial</p>
                  <p className="mt-1 break-all font-mono text-lg font-semibold">{dashboard?.representative_code || '—'}</p>
                </div>
                <div className="min-w-0 rounded-2xl border bg-muted/20 p-3 lg:rounded-lg">
                  <p className="text-xs text-muted-foreground">Carteira de recebimento</p>
                  <p className="mt-1 text-sm font-semibold">{walletSummaryStatus}</p>
                  {walletId && (
                    <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{walletId}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">Ambiente: {paymentEnvironmentLabel}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full sm:w-auto"
                    onClick={openWalletModal}
                    disabled={!dashboard?.id || !paymentEnvironmentReady}
                  >
                    <Wallet className="mr-2 h-4 w-4" />
                    {walletActionLabel}
                  </Button>
                </div>
              </div>
              <div className="min-w-0 rounded-2xl border p-3 lg:rounded-lg">
                <p className="text-xs text-muted-foreground">Link público</p>
                <p className="mt-1 break-all font-mono text-sm">{officialLink || 'Link indisponível'}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="w-full sm:w-auto" onClick={copyOfficialLink} disabled={!officialLink}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar link
                </Button>
                <Button className="w-full sm:w-auto" variant="outline" onClick={() => setQrModalOpen(true)} disabled={!officialLink}>
                  <QrCode className="mr-2 h-4 w-4" />
                  Ver QR Code
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-slate-200/70 bg-white shadow-sm lg:rounded-lg">
            <CardHeader className="px-4 py-4 sm:px-6">
              <CardTitle>Resumo</CardTitle>
              <CardDescription>Indicadores diretos deste representante.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 px-4 pb-4 sm:grid-cols-2 sm:px-6 lg:block lg:space-y-3">
              <div className="flex min-w-0 flex-col gap-1 rounded-2xl border bg-muted/20 p-3 lg:flex-row lg:items-center lg:justify-between lg:rounded-none lg:border-x-0 lg:border-t-0 lg:bg-transparent lg:p-0 lg:pb-2">
                <span className="text-sm text-muted-foreground">Empresas indicadas</span>
                <strong>{dashboard?.linked_companies_count ?? 0}</strong>
              </div>
              <div className="flex min-w-0 flex-col gap-1 rounded-2xl border bg-muted/20 p-3 lg:flex-row lg:items-center lg:justify-between lg:rounded-none lg:border-x-0 lg:border-t-0 lg:bg-transparent lg:p-0 lg:pb-2">
                <span className="text-sm text-muted-foreground">Empresas ativas</span>
                <strong>{dashboard?.active_linked_companies_count ?? 0}</strong>
              </div>
              <div className="flex min-w-0 flex-col gap-1 rounded-2xl border bg-muted/20 p-3 sm:col-span-2 lg:flex-row lg:items-center lg:justify-between lg:rounded-none lg:border-x-0 lg:border-t-0 lg:bg-transparent lg:p-0 lg:pb-2">
                <span className="text-sm text-muted-foreground">Comissão paga</span>
                <strong className="break-words">{formatCurrencyBRL(Number(dashboard?.commission_paid ?? 0))}</strong>
              </div>
              <div className="flex min-w-0 flex-col gap-1 rounded-2xl border bg-muted/20 p-3 lg:flex-row lg:items-center lg:justify-between lg:rounded-none lg:border-x-0 lg:border-t-0 lg:bg-transparent lg:p-0 lg:pb-2">
                <span className="text-sm text-muted-foreground">Pendente</span>
                <strong className="break-words">{formatCurrencyBRL(Number(dashboard?.commission_pending ?? 0))}</strong>
              </div>
              <div className="flex min-w-0 flex-col gap-1 rounded-2xl border bg-muted/20 p-3 lg:flex-row lg:items-center lg:justify-between lg:border-0 lg:bg-transparent lg:p-0">
                <span className="text-sm text-muted-foreground">Bloqueada</span>
                <strong className="break-words">{formatCurrencyBRL(Number(dashboard?.commission_blocked ?? 0))}</strong>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Card className="rounded-3xl border-slate-200/70 bg-white shadow-sm lg:rounded-lg">
            <CardHeader className="px-4 py-4 sm:px-6">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4" />
                Empresas indicadas
              </CardTitle>
              <CardDescription>Empresas cadastradas pelo link deste representante.</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4 sm:px-6">
              <div className="grid gap-3 md:grid-cols-2 lg:hidden">
                {links.map((link) => (
                  <div key={link.id} className="rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="line-clamp-2 break-words font-semibold text-slate-950">
                          {link.company_trade_name || link.company_name}
                        </h3>
                        {link.company_trade_name && (
                          <p className="line-clamp-2 break-words text-sm text-muted-foreground">
                            {link.company_name}
                          </p>
                        )}
                      </div>
                      <Badge variant={link.company_is_active ? 'default' : 'secondary'} className="shrink-0">
                        {link.company_is_active ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      <div className="rounded-xl bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">Vínculo</p>
                        <p className="font-medium">{formatOptionalDateBR(link.linked_at)}</p>
                      </div>
                      <div className="rounded-xl bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">Comissão</p>
                        <p className="break-words font-semibold">{formatCurrencyBRL(Number(link.commission_total ?? 0))}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {links.length === 0 && (
                  <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground md:col-span-2">
                    Nenhuma empresa indicada por este link até o momento.
                  </div>
                )}
              </div>

              <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Vínculo</TableHead>
                    <TableHead className="text-right">Comissão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {links.map((link) => (
                    <TableRow key={link.id}>
                      <TableCell>{link.company_trade_name || link.company_name}</TableCell>
                      <TableCell>
                        <Badge variant={link.company_is_active ? 'default' : 'secondary'}>
                          {link.company_is_active ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatOptionalDateBR(link.linked_at)}</TableCell>
                      <TableCell className="text-right">{formatCurrencyBRL(Number(link.commission_total ?? 0))}</TableCell>
                    </TableRow>
                  ))}
                  {links.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-muted-foreground">
                        Nenhuma empresa indicada por este link até o momento.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-slate-200/70 bg-white shadow-sm lg:rounded-lg">
            <CardHeader className="px-4 py-4 sm:px-6">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="h-4 w-4" />
                Ledger de comissões
              </CardTitle>
              <CardDescription>Últimos lançamentos diretos deste representante.</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4 sm:px-6">
              <div className="grid gap-3 md:grid-cols-2 lg:hidden">
                {commissions.map((commission) => (
                  <div key={commission.id} className="rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="line-clamp-2 break-words font-semibold text-slate-950">
                          {commission.company_trade_name || commission.company_name}
                        </h3>
                        <p className="break-all text-xs text-muted-foreground">Venda: {commission.sale_id}</p>
                      </div>
                      <Badge variant={getCommissionStatusVariant(commission.status)} className="shrink-0">
                        {getCommissionStatusLabel(commission.status)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      <div className="rounded-xl bg-muted/30 p-3 sm:col-span-2">
                        <p className="text-xs text-muted-foreground">Comissão</p>
                        <p className="break-words text-base font-semibold">{formatCurrencyBRL(Number(commission.commission_amount ?? 0))}</p>
                      </div>
                      <div className="rounded-xl bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">Percentual</p>
                        <p className="font-medium">{Number(commission.commission_percent ?? 0).toFixed(2)}%</p>
                      </div>
                      <div className="rounded-xl bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">Data</p>
                        <p className="font-medium">{formatOptionalDateBR(commission.created_at)}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {commissions.length === 0 && (
                  <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground md:col-span-2">
                    Nenhum lançamento de comissão encontrado.
                  </div>
                )}
              </div>

              <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Comissão</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissions.map((commission) => (
                    <TableRow key={commission.id}>
                      <TableCell>{commission.company_trade_name || commission.company_name}</TableCell>
                      <TableCell>{formatCurrencyBRL(Number(commission.commission_amount ?? 0))}</TableCell>
                      <TableCell>
                        <Badge variant={getCommissionStatusVariant(commission.status)}>
                          {getCommissionStatusLabel(commission.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatOptionalDateBR(commission.created_at)}</TableCell>
                    </TableRow>
                  ))}
                  {commissions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-muted-foreground">
                        Nenhum lançamento de comissão encontrado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>

      <SellerQRCodeModal
        sellerName={dashboard?.name || activeCompany?.name || 'representante'}
        qrLinkOverride={officialLink}
        open={qrModalOpen}
        onOpenChange={setQrModalOpen}
      />

      <Dialog open={walletModalOpen} onOpenChange={setWalletModalOpen}>
        <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-lg flex-col overflow-hidden rounded-2xl p-0 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="px-4 pt-4 sm:px-6 sm:pt-6">Configurar carteira de recebimento</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-2 sm:px-6">
            <div className="rounded-lg border bg-muted/20 p-3 text-sm">
              <p className="text-muted-foreground">Ambiente atual</p>
              <p className="font-medium">{paymentEnvironmentLabel}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="representative-wallet-id">ID da carteira no Asaas (Wallet ID)</Label>
              <Input
                id="representative-wallet-id"
                value={walletInput}
                onChange={(event) => setWalletInput(event.target.value)}
                placeholder="Ex.: wallet_0000000000000000"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Este é o código que identifica a carteira do Asaas que receberá suas comissões.
                A configuração será salva somente no ambiente {paymentEnvironmentLabel.toLowerCase()}.
                Deixe em branco apenas se precisar limpar a carteira deste ambiente.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWalletTutorialModalOpen(true)}
              className="group relative block w-full rounded-lg border border-dashed bg-muted/20 p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Abrir tutorial em vídeo para localizar o ID da carteira no Asaas"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-md bg-destructive/10 transition-colors group-hover:bg-destructive/20">
                  <Youtube className="h-7 w-7 text-destructive" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Não sabe onde encontrar o ID da carteira?</p>
                  <p className="text-xs text-muted-foreground">
                    Assista ao tutorial rápido para localizar sua carteira de recebimento no Asaas.
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>
            <Collapsible open={walletTextHelpOpen} onOpenChange={setWalletTextHelpOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span>Prefere seguir por texto? Veja o passo a passo</span>
                  <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', walletTextHelpOpen && 'rotate-180')} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="space-y-3 rounded-lg border bg-muted/10 p-3 text-sm">
                  <div className="space-y-2">
                    <p className="font-medium">Como encontrar sua Wallet ID</p>
                    <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                      <li>Acesse sua conta no <strong className="text-foreground">Asaas</strong>.</li>
                      <li>No menu principal, entre em <strong className="text-foreground">Integrações</strong>.</li>
                      <li>Localize o campo <strong className="text-foreground">Wallet ID</strong> ou <strong className="text-foreground">Identificador da carteira</strong>.</li>
                      <li>Copie o código completo e cole no campo acima.</li>
                    </ol>
                  </div>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900">
                      Confira se você está acessando a conta Asaas do mesmo ambiente indicado neste formulário: <strong>{paymentEnvironmentLabel}</strong>.
                    </p>
                    <p className="rounded-md border border-destructive/20 bg-destructive/5 p-2 text-destructive">
                      Não informe sua chave de API, senha ou chave Pix. Para esta configuração, precisamos apenas da Wallet ID.
                    </p>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
          <DialogFooter className="gap-2 border-t px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-6">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setWalletModalOpen(false)} disabled={walletSaving}>
              Cancelar
            </Button>
            <Button type="button" className="w-full sm:w-auto" onClick={saveWallet} disabled={walletSaving || !paymentEnvironmentReady}>
              {walletSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar carteira
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AsaasTutorialVideoDialog
        open={walletTutorialModalOpen}
        onOpenChange={setWalletTutorialModalOpen}
        title="Como encontrar o ID da carteira no Asaas"
        videoUrl="https://www.youtube.com/embed/BrZxrenzjAE"
        iframeTitle="Tutorial para encontrar o ID da carteira no Asaas"
        description="O vídeo inicia sem som quando o navegador permitir. Use os controles do player para ativar o áudio."
        autoplay
      />

        <div className="lg:hidden">
          <AdminMobileBottomNav
            items={adminMobileBottomNavItems}
            onMoreClick={() => setMobileMoreMenuOpen(true)}
          />
          <AdminMobileMoreMenu open={mobileMoreMenuOpen} onOpenChange={setMobileMoreMenuOpen} />
        </div>
      </div>
    </AdminLayout>
  );
}
