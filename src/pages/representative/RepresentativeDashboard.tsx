import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/Logo';
import { SellerQRCodeModal } from '@/components/admin/SellerQRCodeModal';
import {
  RepresentativeCompanyLink,
  RepresentativeCommission,
  RepresentativeCommissionStatus,
} from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Loader2,
  LogOut,
  Copy,
  Link as LinkIcon,
  Building2,
  Wallet,
  Download,
  ClipboardList,
  Megaphone,
  TrendingUp,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatCurrencyBRL } from '@/lib/currency';
import { cn } from '@/lib/utils';

type LedgerStatusFilter = 'todos' | 'pendente' | 'bloqueada' | 'paga';
type LedgerPeriodFilter = '30' | '90' | 'all';

export default function RepresentativeDashboard() {
  const {
    user,
    loading: authLoading,
    representativeProfile,
    isRepresentative,
    signOut,
  } = useAuth();

  const [loading, setLoading] = useState(true);
  const [companyLinks, setCompanyLinks] = useState<RepresentativeCompanyLink[]>([]);
  const [commissions, setCommissions] = useState<RepresentativeCommission[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [messageCopied, setMessageCopied] = useState(false);
  const [statusFilter, setStatusFilter] = useState<LedgerStatusFilter>('todos');
  const [periodFilter, setPeriodFilter] = useState<LedgerPeriodFilter>('30');
  const [pageSize, setPageSize] = useState<10 | 20 | 50>(10);
  const [page, setPage] = useState(1);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [alertsExpanded, setAlertsExpanded] = useState(false);
  const [checklistExpanded, setChecklistExpanded] = useState(false);
  const [indicatorsExpanded, setIndicatorsExpanded] = useState(false);

  useEffect(() => {
    if (!representativeProfile?.id) {
      setLoading(false);
      return;
    }

    const loadDashboardData = async () => {
      setLoading(true);

      /**
       * Isolamento obrigatório: toda leitura usa representative_id do usuário autenticado.
       * Não aceitamos representative_id via URL para evitar vazamento entre representantes.
       */
      const [linksResponse, commissionsResponse] = await Promise.all([
        supabase
          .from('representative_company_links' as never)
          .select('id, company_id, representative_id, link_source, source_code, source_context, linked_at, locked, created_at, updated_at, company:companies(id, name, trade_name, is_active)')
          .eq('representative_id', representativeProfile.id)
          .order('linked_at', { ascending: false }),
        supabase
          .from('representative_commissions' as never)
          .select('id, company_id, representative_id, sale_id, payment_environment, base_amount, commission_percent, commission_amount, status, available_at, paid_at, blocked_reason, created_at, updated_at, company:companies(id, name, trade_name), sale:sales(id)')
          .eq('representative_id', representativeProfile.id)
          .order('created_at', { ascending: false })
          .limit(100),
      ]);

      if (linksResponse.error) {
        toast.error('Não foi possível carregar as empresas vinculadas.');
        console.error('representative_company_links.select failed', linksResponse.error);
      } else {
        setCompanyLinks((linksResponse.data as RepresentativeCompanyLink[] | null) ?? []);
      }

      if (commissionsResponse.error) {
        toast.error('Não foi possível carregar o ledger de comissões.');
        console.error('representative_commissions.select failed', commissionsResponse.error);
      } else {
        setCommissions((commissionsResponse.data as RepresentativeCommission[] | null) ?? []);
      }

      setLoading(false);
    };

    loadDashboardData();
  }, [representativeProfile?.id]);

  const officialLink = useMemo(() => {
    if (!representativeProfile?.referral_link) return '';
    if (representativeProfile.referral_link.startsWith('http')) return representativeProfile.referral_link;
    return `${window.location.origin}${representativeProfile.referral_link}`;
  }, [representativeProfile?.referral_link]);

  const kpis = useMemo(() => {
    /**
     * KPIs financeiros são leitura direta do ledger persistido (`representative_commissions`).
     * Não recalculamos regra de split/comissão no frontend para manter previsibilidade auditável.
     */
    const totalsByStatus = commissions.reduce(
      (acc, item) => {
        acc.total += item.commission_amount;
        if (item.status === 'paga') acc.paid += item.commission_amount;
        if (item.status === 'bloqueada') acc.blocked += item.commission_amount;
        if (item.status === 'pendente' || item.status === 'disponivel') acc.pending += item.commission_amount;
        return acc;
      },
      { total: 0, paid: 0, pending: 0, blocked: 0 }
    );

    const totalCompanies = companyLinks.length;
    const activeCompanies = companyLinks.filter((link) => link.company?.is_active === true).length;

    return {
      totalCompanies,
      activeCompanies,
      commissionGenerated: totalsByStatus.total,
      commissionPaid: totalsByStatus.paid,
      commissionPendingOrBlocked: totalsByStatus.pending + totalsByStatus.blocked,
      blockedCount: commissions.filter((item) => item.status === 'bloqueada').length,
      totalSalesAssociated: commissions.length,
    };
  }, [commissions, companyLinks]);

  const conversionIndicators = useMemo(() => {
    /**
     * Indicadores de conversão usam apenas contagens/somas sobre os dados já carregados
     * (company_links + representative_commissions), sem qualquer tracking novo.
     */
    const now = new Date();
    const cutoff30 = new Date(now);
    cutoff30.setDate(cutoff30.getDate() - 30);

    const linksLast30Days = companyLinks.filter((link) => new Date(link.linked_at) >= cutoff30).length;
    const commissionLast30Days = commissions
      .filter((item) => new Date(item.created_at) >= cutoff30)
      .reduce((acc, item) => acc + item.commission_amount, 0);
    const ledgerRecentCount = commissions.filter((item) => new Date(item.created_at) >= cutoff30).length;

    return {
      linksLast30Days,
      commissionLast30Days,
      ledgerRecentCount,
    };
  }, [commissions, companyLinks]);

  /**
   * Filtros do ledger: aplicamos apenas recorte de status/período sobre os registros já persistidos
   * em `representative_commissions`, sem recalcular comissão no frontend.
   */
  const filteredCommissions = useMemo(() => {
    const now = new Date();

    return commissions.filter((item) => {
      if (statusFilter === 'pendente' && item.status !== 'pendente' && item.status !== 'disponivel') return false;
      if (statusFilter === 'bloqueada' && item.status !== 'bloqueada') return false;
      if (statusFilter === 'paga' && item.status !== 'paga') return false;

      if (periodFilter !== 'all') {
        const days = Number(periodFilter);
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - days);
        if (new Date(item.created_at) < cutoff) return false;
      }

      return true;
    });
  }, [commissions, statusFilter, periodFilter]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, periodFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredCommissions.length / pageSize));
  const paginatedCommissions = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredCommissions.slice(start, start + pageSize);
  }, [filteredCommissions, page, pageSize]);

  const alerts = useMemo(() => {
    const messages: { title: string; description: string; icon: 'wallet' | 'company' | 'status' }[] = [];

    const walletMissing = !representativeProfile?.asaas_wallet_id_sandbox && !representativeProfile?.asaas_wallet_id_production;
    if (walletMissing) {
      messages.push({
        title: 'Carteira de recebimento não cadastrada',
        description: 'Há comissões que podem ficar bloqueadas até o cadastro da wallet de recebimento.',
        icon: 'wallet',
      });
    }

    if (companyLinks.length === 0) {
      messages.push({
        title: 'Nenhuma empresa vinculada ainda',
        description: 'Compartilhe seu link oficial para iniciar novos vínculos comerciais.',
        icon: 'company',
      });
    }

    if (representativeProfile && representativeProfile.status !== 'ativo') {
      messages.push({
        title: 'Cadastro com status não ativo',
        description: 'Seu status operacional não está ativo. Procure o suporte para regularização.',
        icon: 'status',
      });
    }

    if (kpis.blockedCount > 0) {
      messages.push({
        title: 'Comissões bloqueadas encontradas',
        description: `Existem ${kpis.blockedCount} lançamento(s) bloqueado(s) no seu ledger de comissão.`,
        icon: 'wallet',
      });
    }

    if (commissions.length > 0 && filteredCommissions.length === 0) {
      messages.push({
        title: 'Nenhum resultado com os filtros atuais',
        description: 'Ajuste os filtros do ledger para visualizar outros lançamentos de comissão.',
        icon: 'status',
      });
    }

    return messages;
  }, [commissions.length, companyLinks.length, filteredCommissions.length, kpis.blockedCount, representativeProfile]);

  const prioritizedAlerts = useMemo(() => {
    const priorityByIcon: Record<'wallet' | 'company' | 'status', number> = {
      wallet: 0,
      status: 1,
      company: 2,
    };

    return [...alerts].sort((a, b) => priorityByIcon[a.icon] - priorityByIcon[b.icon]);
  }, [alerts]);

  const mobileVisibleAlerts = prioritizedAlerts.slice(0, 2);
  const mobileHiddenAlerts = prioritizedAlerts.slice(2);


  const companyCommissionById = useMemo(() => {
    // Origem dos indicadores por empresa: soma direta de `representative_commissions` já carregado no painel.
    return commissions.reduce<Record<string, { sales: number; commission: number }>>((acc, item) => {
      const current = acc[item.company_id] ?? { sales: 0, commission: 0 };
      current.sales += 1;
      current.commission += item.commission_amount;
      acc[item.company_id] = current;
      return acc;
    }, {});
  }, [commissions]);

  const companiesSorted = useMemo(() => {
    /**
     * Refino leve de conversão: listamos primeiro empresas com maior comissão gerada
     * para facilitar leitura de retorno comercial sem criar ranking complexo.
     */
    return [...companyLinks].sort((a, b) => {
      const commissionA = companyCommissionById[a.company_id]?.commission ?? 0;
      const commissionB = companyCommissionById[b.company_id]?.commission ?? 0;
      if (commissionA !== commissionB) return commissionB - commissionA;
      return new Date(b.linked_at).getTime() - new Date(a.linked_at).getTime();
    });
  }, [companyCommissionById, companyLinks]);

  const activationChecklist = useMemo(() => {
    /**
     * Checklist operacional com regras explícitas da Fase 6:
     * - wallet: presença de wallet sandbox ou produção no perfil
     * - empresas vinculadas: existência em representative_company_links
     * - comissões bloqueadas: leitura direta do status no ledger
     * - link oficial: existência de referral_link resolvido no perfil
     */
    const walletConfigured = Boolean(representativeProfile?.asaas_wallet_id_sandbox || representativeProfile?.asaas_wallet_id_production);
    const hasLinkedCompanies = companyLinks.length > 0;
    const hasBlockedCommissions = commissions.some((item) => item.status === 'bloqueada');
    const hasOfficialLink = Boolean(officialLink);

    return [
      {
        label: 'Link oficial disponível',
        done: hasOfficialLink,
        helpText: hasOfficialLink ? 'Pronto para divulgação.' : 'Valide com o suporte se o link não aparecer.',
      },
      {
        label: 'Carteira de recebimento cadastrada',
        done: walletConfigured,
        helpText: walletConfigured ? 'Wallet encontrada no cadastro.' : 'Cadastre a wallet para evitar bloqueios.',
      },
      {
        label: 'Primeira empresa vinculada',
        done: hasLinkedCompanies,
        helpText: hasLinkedCompanies
          ? 'Você já possui vínculo(s) ativo(s) para comissão.'
          : 'Compartilhe seu link oficial para trazer sua primeira empresa.',
      },
      {
        label: 'Sem comissões bloqueadas',
        done: !hasBlockedCommissions,
        helpText: hasBlockedCommissions ? 'Há comissões bloqueadas aguardando tratativa.' : 'Nenhum bloqueio encontrado no ledger.',
      },
    ];
  }, [commissions, companyLinks.length, officialLink, representativeProfile?.asaas_wallet_id_production, representativeProfile?.asaas_wallet_id_sandbox]);

  /**
   * Mensagem pronta curta e comercial para WhatsApp.
   * Mantemos o texto no frontend para facilitar evolução de copy sem alterar backend.
   */
  const readyToShareMessage = useMemo(() => {
    if (!officialLink) return '';
    return `Olá! Sou representante da Smartbus BR.\nA plataforma ajuda empresas de transporte a vender passagens e organizar operações com mais controle.\nSe fizer sentido para você, conheça por este link oficial: ${officialLink}`;
  }, [officialLink]);

  const copyOfficialLink = async () => {
    if (!officialLink) return;

    try {
      await navigator.clipboard.writeText(officialLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1800);
      toast.success('Link oficial copiado com sucesso.');
    } catch (error) {
      console.error('clipboard.writeText failed', error);
      toast.error('Não foi possível copiar o link neste dispositivo.');
    }
  };

  const copyRepresentativeCode = async () => {
    if (!representativeProfile?.representative_code) return;

    try {
      await navigator.clipboard.writeText(representativeProfile.representative_code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1800);
      toast.success('Código do representante copiado com sucesso.');
    } catch (error) {
      console.error('clipboard.writeText failed for representative code', error);
      toast.error('Não foi possível copiar o código neste dispositivo.');
    }
  };

  const copyReadyMessage = async () => {
    if (!readyToShareMessage) return;

    try {
      await navigator.clipboard.writeText(readyToShareMessage);
      setMessageCopied(true);
      setTimeout(() => setMessageCopied(false), 1800);
      toast.success('Mensagem pronta copiada com sucesso.');
    } catch (error) {
      console.error('clipboard.writeText failed for ready message', error);
      toast.error('Não foi possível copiar a mensagem neste dispositivo.');
    }
  };

  // Fluxo substituído: botão de QR abre modal padrão (preview grande + download SVG/PNG), igual ao vendedor.
  const openQrModal = () => {
    if (!officialLink) {
      toast.error('Link oficial indisponível para gerar QR Code.');
      return;
    }
    setQrModalOpen(true);
  };

  const getStatusLabel = (status: RepresentativeCommissionStatus) => {
    if (status === 'paga') return 'Paga';
    if (status === 'disponivel') return 'Disponível';
    if (status === 'pendente') return 'Pendente';
    return 'Bloqueada';
  };

  const getStatusVariant = (status: RepresentativeCommissionStatus): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (status === 'paga') return 'default';
    if (status === 'disponivel') return 'secondary';
    if (status === 'pendente') return 'outline';
    return 'destructive';
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isRepresentative || !representativeProfile) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return (
    <div className="min-h-screen w-full max-w-full bg-background">
      {/* Header mobile-first: no mobile quebramos em 2 linhas para evitar compressão entre marca, título e ação. */}
      <header className="sticky top-0 z-30 border-b bg-card px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="mx-auto w-full max-w-7xl">
          {/* Linha 1 (mobile): marca à esquerda e sair à direita; desktop mantém composição horizontal original. */}
          <div className="flex items-center justify-between sm:hidden">
            <Logo size="sm" className="max-w-[108px]" />
            <Button variant="ghost" size="sm" onClick={signOut} className="h-9 gap-1.5 px-2.5">
              <LogOut className="h-4 w-4 shrink-0" />
              <span className="text-xs">Sair</span>
            </Button>
          </div>
          {/* Linha 2 (mobile): contexto textual com melhor leitura e sem disputa de espaço. */}
          <div className="mt-1.5 min-w-0 sm:hidden">
            <p className="text-xs text-muted-foreground">Painel do Representante</p>
            <h1 className="truncate text-lg font-semibold leading-tight">{representativeProfile.name}</h1>
          </div>

          <div className="hidden min-w-0 items-center justify-between sm:flex">
            <div className="flex min-w-0 items-center gap-3">
              <Logo size="sm" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Painel do Representante</p>
                <h1 className="truncate text-base font-semibold sm:text-lg">{representativeProfile.name}</h1>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={signOut} className="h-10 px-3">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Sair</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full min-w-0 max-w-7xl gap-4 overflow-hidden px-4 py-5 md:gap-5">
        {/* Hierarquia visual reorganizada: bloco principal de compartilhamento sobe para o topo com destaque. */}
        <section className="order-1 min-w-0 grid gap-4 lg:grid-cols-3">
          {/* Reaproveita card e botões existentes, fortalecendo o CTA central de indicação comercial. */}
          <Card className="min-w-0 overflow-hidden lg:col-span-2 border-primary/30 shadow-sm">
            <CardHeader className="pb-3">
              <CardDescription>Link oficial de indicação</CardDescription>
              <CardTitle className="text-lg">Compartilhamento comercial</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                <p className="text-sm font-semibold">Sua ação principal é compartilhar seu link oficial.</p>
                <p className="text-xs text-muted-foreground">
                  Use o link, código e mensagem pronta para iniciar novas indicações de empresas.
                </p>
              </div>
              <div className="grid min-w-0 gap-3">
                <div className="rounded-lg border bg-background p-3">
                  <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-xs uppercase tracking-wide text-muted-foreground">Código do representante</span>
                    <Badge variant="secondary" className="shrink-0 font-mono">
                      {representativeProfile.representative_code}
                    </Badge>
                  </div>
                  <div className="flex min-w-0 items-center gap-2 overflow-hidden rounded-md border bg-muted/40 px-3 py-2 text-sm">
                    <LinkIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate font-medium">{officialLink || 'Link oficial não disponível'}</span>
                  </div>
                </div>
              </div>

              {/* Mobile-first: CTA principal em largura total para reduzir competição com ações secundárias. */}
              <div className="space-y-2">
                <Button onClick={copyOfficialLink} disabled={!officialLink} className="h-11 w-full sm:w-auto sm:min-w-48">
                  <Copy className="mr-2 h-4 w-4" />
                  {linkCopied ? 'Copiado!' : 'Copiar link oficial'}
                </Button>
                <div className="grid gap-2 sm:flex sm:flex-wrap">
                  <Button variant="outline" onClick={copyRepresentativeCode} className="h-10 w-full sm:w-auto">
                    <Copy className="mr-2 h-4 w-4" />
                    {codeCopied ? 'Código copiado!' : 'Copiar código'}
                  </Button>
                  <Button variant="outline" onClick={copyReadyMessage} disabled={!readyToShareMessage} className="h-10 w-full sm:w-auto">
                    <Megaphone className="mr-2 h-4 w-4" />
                    {messageCopied ? 'Mensagem copiada!' : 'Copiar mensagem pronta'}
                  </Button>
                  <Button variant="outline" onClick={openQrModal} disabled={!officialLink} className="h-10 w-full sm:w-auto">
                    <Download className="mr-2 h-4 w-4" />
                    Ver QR Code
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="min-w-0 overflow-hidden">
            <CardHeader>
              <CardDescription>Identidade</CardDescription>
              <CardTitle className="text-base">Resumo do representante</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Nome</span>
                <span className="min-w-0 truncate font-medium text-right">{representativeProfile.name}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={representativeProfile.status === 'ativo' ? 'default' : 'secondary'}>
                  {representativeProfile.status}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Código oficial</span>
                <span className="font-semibold font-mono">{representativeProfile.representative_code}</span>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="order-2 min-w-0 grid gap-4">
          <Card>
            <CardHeader>
              <CardDescription>Performance comercial</CardDescription>
              <CardTitle className="text-base">Visão consolidada do seu resultado</CardTitle>
            </CardHeader>
            {/* KPI mais compacto no mobile para reduzir sensação de mural de mini-cards. */}
            <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
              <div className="rounded-md border bg-background p-3 sm:p-4">
                <p className="text-xs text-muted-foreground">Empresas vinculadas</p>
                <p className="mt-1 text-xl font-semibold leading-none sm:text-2xl">{kpis.totalCompanies}</p>
              </div>
              <div className="rounded-md border bg-background p-3 sm:p-4">
                <p className="text-xs text-muted-foreground">Empresas ativas</p>
                <p className="mt-1 text-xl font-semibold leading-none sm:text-2xl">{kpis.activeCompanies}</p>
              </div>
              <div className="rounded-md border bg-background p-3 sm:p-4">
                <p className="text-xs text-muted-foreground">Comissão gerada</p>
                <p className="mt-1 text-lg font-semibold leading-none sm:text-xl">{formatCurrencyBRL(kpis.commissionGenerated)}</p>
              </div>
              <div className="rounded-md border bg-background p-3 sm:p-4">
                <p className="text-xs text-muted-foreground">Comissão paga</p>
                <p className="mt-1 text-lg font-semibold leading-none sm:text-xl">{formatCurrencyBRL(kpis.commissionPaid)}</p>
              </div>
              <div className="rounded-md border bg-background p-3 sm:p-4">
                <p className="text-xs text-muted-foreground">Pendente / bloqueada</p>
                <p className="mt-1 text-lg font-semibold leading-none sm:text-xl">{formatCurrencyBRL(kpis.commissionPendingOrBlocked)}</p>
              </div>
              <div className="rounded-md border bg-background p-3 sm:p-4">
                <p className="text-xs text-muted-foreground">Vendas associadas</p>
                <p className="mt-1 text-xl font-semibold leading-none sm:text-2xl">{kpis.totalSalesAssociated}</p>
              </div>
            </CardContent>
          </Card>
        </section>

        {alerts.length > 0 && (
          <section className="order-3 grid gap-2 sm:gap-3">
            {/* Compactação mobile: exibimos alertas prioritários primeiro e permitimos expandir os demais. */}
            {mobileVisibleAlerts.map((item, index) => (
              <Alert key={`${item.title}-${index}`}>
                {item.icon === 'wallet' && <Wallet className="h-4 w-4" />}
                {item.icon === 'company' && <Building2 className="h-4 w-4" />}
                {item.icon === 'status' && <Building2 className="h-4 w-4" />}
                <AlertTitle>{item.title}</AlertTitle>
                <AlertDescription>{item.description}</AlertDescription>
              </Alert>
            ))}
            {mobileHiddenAlerts.length > 0 && (
              <>
                <div className="md:hidden">
                  <Collapsible open={alertsExpanded} onOpenChange={setAlertsExpanded}>
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 w-full justify-between">
                        <span className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          {alertsExpanded ? 'Ocultar alertas adicionais' : `Ver ${mobileHiddenAlerts.length} alerta(s) adicional(is)`}
                        </span>
                        <ChevronDown className={cn('h-4 w-4 transition-transform', alertsExpanded && 'rotate-180')} />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 space-y-2">
                      {mobileHiddenAlerts.map((item, index) => (
                        <Alert key={`${item.title}-mobile-${index}`}>
                          {item.icon === 'wallet' && <Wallet className="h-4 w-4" />}
                          {item.icon === 'company' && <Building2 className="h-4 w-4" />}
                          {item.icon === 'status' && <Building2 className="h-4 w-4" />}
                          <AlertTitle>{item.title}</AlertTitle>
                          <AlertDescription>{item.description}</AlertDescription>
                        </Alert>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                </div>
                <div className="hidden md:grid md:gap-3">
                  {mobileHiddenAlerts.map((item, index) => (
                    <Alert key={`${item.title}-desktop-${index}`}>
                      {item.icon === 'wallet' && <Wallet className="h-4 w-4" />}
                      {item.icon === 'company' && <Building2 className="h-4 w-4" />}
                      {item.icon === 'status' && <Building2 className="h-4 w-4" />}
                      <AlertTitle>{item.title}</AlertTitle>
                      <AlertDescription>{item.description}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        <section className="order-6 min-w-0 grid gap-4 lg:order-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardDescription>Ativação operacional</CardDescription>
              <CardTitle className="text-base">Checklist rápido do representante</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Checklist com progresso explícito para facilitar leitura de pendências e bloqueios sem alterar regra. */}
              <div className="rounded-md border bg-muted/40 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  {activationChecklist.filter((item) => item.done).length} de {activationChecklist.length} etapas concluídas
                </p>
              </div>
              {/* Compactação mobile: checklist expansível para reduzir altura sem perder conteúdo. */}
              <div className="md:hidden">
                <Collapsible open={checklistExpanded} onOpenChange={setChecklistExpanded}>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 w-full justify-between">
                      <span>{checklistExpanded ? 'Ocultar checklist' : 'Ver checklist completo'}</span>
                      <ChevronDown className={cn('h-4 w-4 transition-transform', checklistExpanded && 'rotate-180')} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3 space-y-3">
                    {activationChecklist.map((item) => (
                      <div key={`mobile-${item.label}`} className="flex items-start justify-between gap-3 rounded-md border bg-background p-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">{item.label}</p>
                          <p className="text-xs text-muted-foreground">{item.helpText}</p>
                        </div>
                        <Badge variant={item.done ? 'default' : 'secondary'}>{item.done ? 'OK' : 'Pendente'}</Badge>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              </div>
              <div className="hidden space-y-3 md:block">
                {activationChecklist.map((item) => (
                  <div key={item.label} className="flex items-start justify-between gap-3 rounded-md border bg-background p-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.helpText}</p>
                    </div>
                    <Badge variant={item.done ? 'default' : 'secondary'}>{item.done ? 'OK' : 'Pendente'}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Indicadores simples de conversão (30 dias)</CardDescription>
              <CardTitle className="text-base">Acompanhamento recente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Compactação mobile: indicadores em expansão opcional; desktop mantém visual direto. */}
              <div className="md:hidden">
                <Collapsible open={indicatorsExpanded} onOpenChange={setIndicatorsExpanded}>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 w-full justify-between">
                      <span>{indicatorsExpanded ? 'Ocultar indicadores' : 'Ver indicadores dos últimos 30 dias'}</span>
                      <ChevronDown className={cn('h-4 w-4 transition-transform', indicatorsExpanded && 'rotate-180')} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3 grid gap-2">
                    <div className="rounded-md border bg-background p-3">
                      <p className="text-xs text-muted-foreground">Empresas vinculadas</p>
                      <p className="text-xl font-semibold">{conversionIndicators.linksLast30Days}</p>
                    </div>
                    <div className="rounded-md border bg-background p-3">
                      <p className="text-xs text-muted-foreground">Comissões no período</p>
                      <p className="text-lg font-semibold">{formatCurrencyBRL(conversionIndicators.commissionLast30Days)}</p>
                    </div>
                    <div className="rounded-md border bg-background p-3">
                      <p className="text-xs text-muted-foreground">Lançamentos no ledger</p>
                      <p className="text-xl font-semibold">{conversionIndicators.ledgerRecentCount}</p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
              <div className="hidden grid-cols-3 gap-3 md:grid">
                <div className="rounded-md border bg-background p-3">
                  <p className="text-xs text-muted-foreground">Empresas vinculadas</p>
                  <p className="text-xl font-semibold">{conversionIndicators.linksLast30Days}</p>
                </div>
                <div className="rounded-md border bg-background p-3">
                  <p className="text-xs text-muted-foreground">Comissões no período</p>
                  <p className="text-lg font-semibold">{formatCurrencyBRL(conversionIndicators.commissionLast30Days)}</p>
                </div>
                <div className="rounded-md border bg-background p-3">
                  <p className="text-xs text-muted-foreground">Lançamentos no ledger</p>
                  <p className="text-xl font-semibold">{conversionIndicators.ledgerRecentCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="order-4 grid gap-4 lg:grid-cols-2 lg:order-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Empresas vinculadas</CardTitle>
              <CardDescription>Vínculos oficiais em representative_company_links</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Mobile-first: lista em cards para evitar rolagem horizontal e leitura fragmentada. */}
              <div className="space-y-3 md:hidden">
                {companiesSorted.map((link) => (
                  <div key={`mobile-company-${link.id}`} className="rounded-md border bg-background p-3">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-sm font-medium">{link.company?.trade_name || link.company?.name || 'Empresa'}</p>
                        <p className="text-xs text-muted-foreground">
                          {companyCommissionById[link.company_id]?.sales ?? 0} venda(s) · {formatCurrencyBRL(companyCommissionById[link.company_id]?.commission ?? 0)} em comissão
                        </p>
                      </div>
                      <Badge variant={link.company?.is_active ? 'default' : 'secondary'}>
                        {link.company?.is_active ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Vínculo: {format(new Date(link.linked_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                ))}
                {companyLinks.length === 0 && (
                  <div className="rounded-md border bg-muted/20 p-3 text-muted-foreground">
                    <div className="flex items-start gap-2">
                      <TrendingUp className="mt-0.5 h-4 w-4" />
                      <div>
                        <p className="font-medium">Nenhuma empresa vinculada até o momento.</p>
                        <p className="text-xs">Compartilhe seu link oficial para trazer sua primeira empresa.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Vínculo</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {companiesSorted.map((link) => (
                      <TableRow key={link.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium">{link.company?.trade_name || link.company?.name || 'Empresa'}</p>
                            <p className="text-xs text-muted-foreground">
                              {companyCommissionById[link.company_id]?.sales ?? 0} venda(s) ·{' '}
                              {formatCurrencyBRL(companyCommissionById[link.company_id]?.commission ?? 0)} em comissão
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {format(new Date(link.linked_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={link.company?.is_active ? 'default' : 'secondary'}>
                            {link.company?.is_active ? 'Ativa' : 'Inativa'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {companyLinks.length === 0 && (
                      <TableRow>
                        {/* Estado vazio mais orientado à ação comercial para evitar aparência de tela "fria". */}
                        <TableCell colSpan={3} className="text-muted-foreground py-6">
                          <div className="flex items-start gap-2">
                            <TrendingUp className="mt-0.5 h-4 w-4" />
                            <div>
                              <p className="font-medium">Nenhuma empresa vinculada até o momento.</p>
                              <p className="text-xs">Compartilhe seu link oficial para trazer sua primeira empresa.</p>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ledger de comissões</CardTitle>
              <CardDescription>Últimos lançamentos em representative_commissions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filtros mantidos com mesma lógica; apenas distribuição mais confortável para toque no mobile. */}
              <div className="grid gap-2 sm:gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as LedgerStatusFilter)}>
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="bloqueada">Bloqueada</SelectItem>
                      <SelectItem value="paga">Paga</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Período</p>
                  <Select value={periodFilter} onValueChange={(value) => setPeriodFilter(value as LedgerPeriodFilter)}>
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">Últimos 30 dias</SelectItem>
                      <SelectItem value="90">Últimos 90 dias</SelectItem>
                      <SelectItem value="all">Todo período</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Itens por página</p>
                  <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value) as 10 | 20 | 50)}>
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Mobile-first: lançamentos em cards para leitura vertical com foco em comissão/status/data. */}
              <div className="space-y-3 md:hidden">
                {paginatedCommissions.map((item) => (
                  <div key={`mobile-ledger-${item.id}`} className="rounded-md border bg-background p-3">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Comissão</p>
                        <p className="text-lg font-semibold">{formatCurrencyBRL(item.commission_amount)}</p>
                      </div>
                      <Badge variant={getStatusVariant(item.status)}>{getStatusLabel(item.status)}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {format(new Date(item.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                    <div className="mt-2 min-w-0 space-y-1 text-sm">
                      <p className="truncate font-medium">{item.company?.trade_name || item.company?.name || 'Empresa'}</p>
                      <p className="truncate text-xs text-muted-foreground">Venda: <span className="font-mono">{item.sale?.id || item.sale_id}</span></p>
                      <p className="text-xs text-muted-foreground">
                        Base: {formatCurrencyBRL(item.base_amount)} · Percentual: {item.commission_percent}%
                      </p>
                    </div>
                  </div>
                ))}
                {filteredCommissions.length === 0 && (
                  <div className="rounded-md border bg-muted/20 p-3 text-muted-foreground">
                    {commissions.length === 0 ? (
                      <div className="flex items-start gap-2">
                        <ClipboardList className="mt-0.5 h-4 w-4" />
                        <div>
                          <p className="font-medium">Você ainda não possui comissões registradas.</p>
                          <p className="text-xs">Assim que suas empresas começarem a vender, suas comissões aparecerão aqui.</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm">Nenhum lançamento encontrado com os filtros selecionados.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Venda</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Base</TableHead>
                      <TableHead>%</TableHead>
                      <TableHead>Comissão</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedCommissions.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs">{item.sale?.id || item.sale_id}</TableCell>
                        <TableCell>{item.company?.trade_name || item.company?.name || 'Empresa'}</TableCell>
                        <TableCell>{formatCurrencyBRL(item.base_amount)}</TableCell>
                        <TableCell>{item.commission_percent}%</TableCell>
                        <TableCell>{formatCurrencyBRL(item.commission_amount)}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(item.status)}>{getStatusLabel(item.status)}</Badge>
                        </TableCell>
                        <TableCell>{format(new Date(item.created_at), 'dd/MM/yyyy', { locale: ptBR })}</TableCell>
                      </TableRow>
                    ))}
                    {filteredCommissions.length === 0 && (
                      <TableRow>
                        {/* Estado vazio melhorado: mantém contexto de negócio e indica próximo passo. */}
                        <TableCell colSpan={7} className="text-muted-foreground py-6">
                          {commissions.length === 0 ? (
                            <div className="flex items-start gap-2">
                              <ClipboardList className="mt-0.5 h-4 w-4" />
                              <div>
                                <p className="font-medium">Você ainda não possui comissões registradas.</p>
                                <p className="text-xs">Assim que suas empresas começarem a vender, suas comissões aparecerão aqui.</p>
                              </div>
                            </div>
                          ) : (
                            'Nenhum lançamento encontrado com os filtros selecionados.'
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <p className="text-xs text-muted-foreground">
                  {filteredCommissions.length} resultado(s) · página {Math.min(page, totalPages)} de {totalPages}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <Button variant="outline" size="sm" className="h-9" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={page >= totalPages}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      {/* Reaproveitamento direto do modal do vendedor para manter o mesmo comportamento de preview e download. */}
      {/* Qualidade do download corrigida por herdar o fluxo SVG + PNG em alta resolução (canvas escalado) do padrão existente. */}
      <SellerQRCodeModal
        sellerName={representativeProfile.name}
        qrLinkOverride={officialLink}
        open={qrModalOpen}
        onOpenChange={setQrModalOpen}
      />
    </div>
  );
}
