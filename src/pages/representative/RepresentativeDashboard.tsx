import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  RepresentativeCompanyLink,
  RepresentativeCommission,
  RepresentativeCommissionStatus,
} from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, LogOut, Copy, Link as LinkIcon, Building2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatCurrencyBRL } from '@/lib/currency';

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
    };
  }, [commissions, companyLinks]);

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

    return messages;
  }, [companyLinks.length, kpis.blockedCount, representativeProfile]);

  const copyOfficialLink = async () => {
    if (!officialLink) return;

    try {
      await navigator.clipboard.writeText(officialLink);
      toast.success('Link oficial copiado com sucesso.');
    } catch (error) {
      console.error('clipboard.writeText failed', error);
      toast.error('Não foi possível copiar o link neste dispositivo.');
    }
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
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm text-muted-foreground">Painel do Representante</p>
            <h1 className="text-xl font-semibold">Olá, {representativeProfile.name}</h1>
          </div>
          <Button variant="outline" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl gap-6 px-6 py-6">
        <section className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Identidade</CardDescription>
              <CardTitle className="text-base">Dados do representante</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Nome</span>
                <span className="font-medium text-right">{representativeProfile.name}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={representativeProfile.status === 'ativo' ? 'default' : 'secondary'}>
                  {representativeProfile.status}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Código oficial</span>
                <span className="font-semibold">{representativeProfile.representative_code}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardDescription>Link oficial de indicação</CardDescription>
              <CardTitle className="text-base">Compartilhamento comercial</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                <LinkIcon className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{officialLink || 'Link oficial não disponível'}</span>
              </div>
              <Button onClick={copyOfficialLink} disabled={!officialLink}>
                <Copy className="mr-2 h-4 w-4" />
                Copiar link
              </Button>
            </CardContent>
          </Card>
        </section>

        {alerts.length > 0 && (
          <section className="grid gap-3">
            {alerts.map((item, index) => (
              <Alert key={`${item.title}-${index}`}>
                {item.icon === 'wallet' && <Wallet className="h-4 w-4" />}
                {item.icon === 'company' && <Building2 className="h-4 w-4" />}
                {item.icon === 'status' && <Building2 className="h-4 w-4" />}
                <AlertTitle>{item.title}</AlertTitle>
                <AlertDescription>{item.description}</AlertDescription>
              </Alert>
            ))}
          </section>
        )}

        <section className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Empresas</CardDescription>
              <CardTitle className="text-2xl">{kpis.totalCompanies}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">Total vinculadas</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Empresas ativas</CardDescription>
              <CardTitle className="text-2xl">{kpis.activeCompanies}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">Com status ativo</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Comissão gerada</CardDescription>
              <CardTitle className="text-xl">{formatCurrencyBRL(kpis.commissionGenerated)}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">Somatório do ledger</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Comissão paga</CardDescription>
              <CardTitle className="text-xl">{formatCurrencyBRL(kpis.commissionPaid)}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">Status paga</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pendente / bloqueada</CardDescription>
              <CardTitle className="text-xl">{formatCurrencyBRL(kpis.commissionPendingOrBlocked)}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">Aguardando tratativa</CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Empresas vinculadas</CardTitle>
              <CardDescription>Vínculos oficiais em representative_company_links</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Vínculo</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companyLinks.map((link) => (
                    <TableRow key={link.id}>
                      <TableCell>{link.company?.trade_name || link.company?.name || 'Empresa'}</TableCell>
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
                      <TableCell colSpan={3} className="text-muted-foreground">
                        Nenhuma empresa vinculada até o momento.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ledger de comissões</CardTitle>
              <CardDescription>Últimos lançamentos em representative_commissions</CardDescription>
            </CardHeader>
            <CardContent>
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
                  {commissions.map((item) => (
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
                  {commissions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-muted-foreground">
                        Sem lançamentos de comissão até o momento.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
