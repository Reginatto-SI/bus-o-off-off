import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatsCard } from '@/components/admin/StatsCard';
import { FilterCard } from '@/components/admin/FilterCard';
import { ActionsDropdown, ActionItem } from '@/components/admin/ActionsDropdown';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { buildCompanyReferralLink, resolveCompanyReferralOrigin } from '@/lib/companyReferral';
import { buildDebugToastMessage, logSupabaseError } from '@/lib/errorDebug';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Copy,
  Gift,
  Link2,
  Loader2,
  Rocket,
  SearchX,
  Share2,
} from 'lucide-react';

type ReferralStatus = 'pendente' | 'em_progresso' | 'elegivel' | 'paga' | 'cancelada';

type ReferralFilters = {
  search: string;
  status: 'all' | ReferralStatus;
  eligibility: 'all' | 'elegivel' | 'nao_elegivel';
};

type CompanySummary = {
  id: string;
  name: string;
  trade_name: string | null;
  referral_code: string;
};

type ReferralRow = {
  id: string;
  status: ReferralStatus;
  referral_code: string;
  progress_platform_fee_amount: number;
  target_platform_fee_amount: number;
  reward_amount: number;
  created_at: string;
  activated_at: string;
  eligible_at: string | null;
  referred_company: {
    id: string;
    name: string;
    trade_name: string | null;
  } | null;
};

const initialFilters: ReferralFilters = {
  search: '',
  status: 'all',
  eligibility: 'all',
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

const statusConfig: Record<ReferralStatus, { label: string; className: string }> = {
  pendente: {
    label: 'Pendente',
    className: 'bg-muted text-muted-foreground border-transparent',
  },
  em_progresso: {
    label: 'Em progresso',
    className: 'bg-warning/15 text-warning border-warning/30',
  },
  elegivel: {
    label: 'Elegível',
    className: 'bg-success/15 text-success border-success/30',
  },
  paga: {
    label: 'Paga',
    className: 'bg-primary/10 text-primary border-primary/20',
  },
  cancelada: {
    label: 'Cancelada',
    className: 'bg-destructive/10 text-destructive border-destructive/20',
  },
};

const getReferralCompanyName = (referral: ReferralRow) => {
  return referral.referred_company?.trade_name?.trim()
    || referral.referred_company?.name?.trim()
    || 'Empresa não encontrada';
};

const formatCurrency = (value: number) => currencyFormatter.format(Number(value || 0));
const formatDateTime = (value: string | null) => (value ? dateFormatter.format(new Date(value)) : '-');

export default function Referrals() {
  const { activeCompanyId, activeCompany, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ReferralFilters>(initialFilters);
  const [companySummary, setCompanySummary] = useState<CompanySummary | null>(null);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [selectedReferral, setSelectedReferral] = useState<ReferralRow | null>(null);

  const referralOrigin = resolveCompanyReferralOrigin();
  // Comentário de manutenção: o link oficial pertence à empresa ativa e reutiliza a rota pública `/i/:code`.
  // Usamos um resolvedor central para não espalhar domínio hardcoded em telas administrativas diferentes.
  const referralLink = companySummary?.referral_code
    ? buildCompanyReferralLink(referralOrigin, companySummary.referral_code)
    : '';

  useEffect(() => {
    if (!activeCompanyId) {
      setCompanySummary(null);
      setReferrals([]);
      setLoading(false);
      return;
    }

    const fetchReferralData = async () => {
      setLoading(true);

      try {
        // Comentário de manutenção: a tela lê a empresa ativa explicitamente para montar o link oficial
        // da empresa logada com o `referral_code` atual e evitar depender de estado antigo em memória.
        const companyQuery = supabase
          .from('companies')
          .select('id, name, trade_name, referral_code')
          .eq('id', activeCompanyId)
          .maybeSingle();

        // Comentário de manutenção: a listagem lê apenas os campos usados na UI e faz join mínimo
        // com a empresa indicada. O filtro por `company_id` preserva o escopo multiempresa/RLS.
        const referralsQuery = supabase
          .from('company_referrals')
          .select(`
            id,
            status,
            referral_code,
            progress_platform_fee_amount,
            target_platform_fee_amount,
            reward_amount,
            created_at,
            activated_at,
            eligible_at,
            referred_company:companies!company_referrals_referred_company_id_fkey(
              id,
              name,
              trade_name
            )
          `)
          .eq('company_id', activeCompanyId)
          .order('created_at', { ascending: false });

        const [{ data: companyData, error: companyError }, { data: referralsData, error: referralsError }] = await Promise.all([
          companyQuery,
          referralsQuery,
        ]);

        if (companyError) {
          logSupabaseError('Erro ao carregar link oficial de indicação', companyError, {
            context: { action: 'select', table: 'companies', companyId: activeCompanyId, userId: user?.id },
          });
          toast.error(buildDebugToastMessage('Não foi possível carregar o link de indicação.', companyError));
          setCompanySummary(null);
        } else {
          setCompanySummary((companyData as CompanySummary | null) ?? null);
        }

        if (referralsError) {
          logSupabaseError('Erro ao carregar indicações da empresa', referralsError, {
            context: { action: 'select', table: 'company_referrals', companyId: activeCompanyId, userId: user?.id },
          });
          toast.error(buildDebugToastMessage('Não foi possível carregar as indicações.', referralsError));
          setReferrals([]);
        } else {
          setReferrals((referralsData as ReferralRow[] | null) ?? []);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchReferralData();
  }, [activeCompanyId, user?.id]);

  const filteredReferrals = useMemo(() => {
    const normalizedSearch = filters.search.trim().toLowerCase();

    return referrals.filter((referral) => {
      const companyName = getReferralCompanyName(referral).toLowerCase();
      const matchesSearch = normalizedSearch.length === 0
        || companyName.includes(normalizedSearch)
        || referral.referral_code.toLowerCase().includes(normalizedSearch);
      const matchesStatus = filters.status === 'all' || referral.status === filters.status;
      // Comentário de manutenção: o filtro de elegibilidade não recalcula financeiro.
      // Ele apenas reaproveita o status/progresso já persistidos pelo backend.
      const isEligible = referral.status === 'elegivel' || referral.status === 'paga';
      const matchesEligibility = filters.eligibility === 'all'
        || (filters.eligibility === 'elegivel' ? isEligible : !isEligible);

      return matchesSearch && matchesStatus && matchesEligibility;
    });
  }, [filters, referrals]);

  const hasActiveFilters = filters.search.trim().length > 0 || filters.status !== 'all' || filters.eligibility !== 'all';

  const stats = useMemo(() => {
    return referrals.reduce(
      (acc, referral) => {
        acc.total += 1;
        if (referral.status === 'em_progresso') acc.emProgresso += 1;
        if (referral.status === 'elegivel') acc.elegiveis += 1;
        if (referral.status === 'paga') acc.pagas += 1;
        return acc;
      },
      { total: 0, emProgresso: 0, elegiveis: 0, pagas: 0 },
    );
  }, [referrals]);

  const handleCopyReferralLink = async () => {
    if (!referralLink) {
      toast.error('Link de indicação indisponível no momento.');
      return;
    }

    try {
      await navigator.clipboard.writeText(referralLink);
      toast.success('Link de indicação copiado!');
    } catch {
      toast.error('Não foi possível copiar o link.');
    }
  };

  const handleCopyReferralCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Código de indicação copiado!');
    } catch {
      toast.error('Não foi possível copiar o código.');
    }
  };

  const getProgressPercentage = (referral: ReferralRow) => {
    if (!referral.target_platform_fee_amount || referral.target_platform_fee_amount <= 0) return 0;
    return Math.min((referral.progress_platform_fee_amount / referral.target_platform_fee_amount) * 100, 100);
  };

  const getReferralActions = (referral: ReferralRow): ActionItem[] => [
    {
      label: 'Ver detalhes',
      icon: SearchX,
      onClick: () => setSelectedReferral(referral),
    },
    {
      label: 'Copiar código',
      icon: Copy,
      onClick: () => handleCopyReferralCode(referral.referral_code),
    },
  ];

  return (
    <AdminLayout>
      <div className="page-container">
      <PageHeader
        title="Indicações"
        description="Acompanhe empresas indicadas e o progresso da recompensa da sua empresa."
        metadata={activeCompany ? <p className="text-sm text-muted-foreground">Empresa ativa: <strong>{activeCompany.name}</strong></p> : null}
        actions={
          <Button variant="outline" onClick={handleCopyReferralLink} disabled={!referralLink}>
            <Copy className="mr-2 h-4 w-4" />
            Copiar link
          </Button>
        }
      />

      <div className="space-y-8">
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Share2 className="h-5 w-5 text-primary" />
                Link oficial de indicação
              </CardTitle>
              <CardDescription>
                Compartilhe este link com outras empresas. A recompensa é liberada quando a empresa indicada atingir a meta definida.
              </CardDescription>
            </div>
            {companySummary?.referral_code && (
              <Badge variant="outline" className="w-fit text-xs">
                Código: {companySummary.referral_code}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border bg-muted/20 p-4">
              <div className="flex items-start gap-3">
                <Link2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div className="space-y-1">
                  <p className="font-medium break-all">{referralLink || 'Link indisponível para a empresa ativa.'}</p>
                  <p className="text-sm text-muted-foreground">
                    Base pública usada: {referralOrigin}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleCopyReferralLink} disabled={!referralLink}>
                <Copy className="mr-2 h-4 w-4" />
                Copiar link de indicação
              </Button>
              <Button
                variant="outline"
                disabled={!companySummary?.referral_code}
                onClick={() => companySummary?.referral_code && handleCopyReferralCode(companySummary.referral_code)}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copiar código
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatsCard label="Total de indicações" value={stats.total} icon={Share2} />
          <StatsCard label="Em progresso" value={stats.emProgresso} icon={Rocket} variant="warning" />
          <StatsCard label="Elegíveis" value={stats.elegiveis} icon={CheckCircle2} variant="success" />
          <StatsCard label="Pagas" value={stats.pagas} icon={Gift} />
        </div>

        <FilterCard
          searchValue={filters.search}
          onSearchChange={(value) => setFilters((current) => ({ ...current, search: value }))}
          searchPlaceholder="Pesquisar por empresa indicada ou código..."
          selects={[
            {
              id: 'status',
              label: 'Status',
              placeholder: 'Status',
              value: filters.status,
              onChange: (value) => setFilters((current) => ({ ...current, status: value as ReferralFilters['status'] })),
              options: [
                { value: 'all', label: 'Todos' },
                { value: 'pendente', label: 'Pendente' },
                { value: 'em_progresso', label: 'Em progresso' },
                { value: 'elegivel', label: 'Elegível' },
                { value: 'paga', label: 'Paga' },
                { value: 'cancelada', label: 'Cancelada' },
              ],
            },
            {
              id: 'eligibility',
              label: 'Elegibilidade',
              placeholder: 'Elegibilidade',
              value: filters.eligibility,
              onChange: (value) => setFilters((current) => ({ ...current, eligibility: value as ReferralFilters['eligibility'] })),
              options: [
                { value: 'all', label: 'Todos' },
                { value: 'elegivel', label: 'Elegíveis' },
                { value: 'nao_elegivel', label: 'Não elegíveis' },
              ],
            },
          ]}
          onClearFilters={() => setFilters(initialFilters)}
          hasActiveFilters={hasActiveFilters}
        />

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : referrals.length === 0 ? (
          <EmptyState
            icon={<Share2 className="h-8 w-8 text-muted-foreground" />}
            title="Nenhuma indicação registrada"
            description="Quando uma empresa concluir o cadastro usando o seu link, ela aparecerá aqui para acompanhamento do progresso."
            action={
              <Button onClick={handleCopyReferralLink} disabled={!referralLink}>
                <Copy className="mr-2 h-4 w-4" />
                Copiar meu link de indicação
              </Button>
            }
          />
        ) : filteredReferrals.length === 0 ? (
          <EmptyState
            icon={<SearchX className="h-8 w-8 text-muted-foreground" />}
            title="Nenhuma indicação encontrada"
            description="Ajuste os filtros para localizar as indicações da sua empresa."
            action={
              <Button variant="outline" onClick={() => setFilters(initialFilters)}>
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa indicada</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Progresso</TableHead>
                    <TableHead>Meta</TableHead>
                    <TableHead>Recompensa</TableHead>
                    <TableHead>Data da indicação</TableHead>
                    <TableHead>Elegível em</TableHead>
                    <TableHead className="w-[60px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReferrals.map((referral) => {
                    const progressPercentage = getProgressPercentage(referral);
                    const statusVisual = statusConfig[referral.status];

                    return (
                      <TableRow key={referral.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium">{getReferralCompanyName(referral)}</p>
                            <p className="text-xs text-muted-foreground">Código usado: {referral.referral_code}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusVisual.className}>
                            {statusVisual.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="min-w-[220px]">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className="font-medium">{formatCurrency(referral.progress_platform_fee_amount)}</span>
                              <span className="text-muted-foreground">{progressPercentage.toFixed(0)}%</span>
                            </div>
                            {/* Comentário de manutenção: o progresso exibido usa apenas o valor já calculado e persistido no backend.
                                A tela não recalcula financeiro para evitar divergência com a regra oficial de elegibilidade. */}
                            <Progress value={progressPercentage} className="h-2" />
                          </div>
                        </TableCell>
                        <TableCell>{formatCurrency(referral.target_platform_fee_amount)}</TableCell>
                        <TableCell>{formatCurrency(referral.reward_amount)}</TableCell>
                        <TableCell>{formatDateTime(referral.created_at)}</TableCell>
                        <TableCell>{formatDateTime(referral.eligible_at)}</TableCell>
                        <TableCell>
                          <ActionsDropdown actions={getReferralActions(referral)} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={Boolean(selectedReferral)} onOpenChange={(open) => !open && setSelectedReferral(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhes da indicação</DialogTitle>
            <DialogDescription>
              Resumo operacional da indicação selecionada, sem editar o vínculo oficial.
            </DialogDescription>
          </DialogHeader>

          {selectedReferral && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-muted-foreground">Empresa indicada</p>
                  <p className="font-medium">{getReferralCompanyName(selectedReferral)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Status</p>
                  <Badge variant="outline" className={statusConfig[selectedReferral.status].className}>
                    {statusConfig[selectedReferral.status].label}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Progresso atual</p>
                  <p className="font-medium">{formatCurrency(selectedReferral.progress_platform_fee_amount)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Meta de taxa</p>
                  <p className="font-medium">{formatCurrency(selectedReferral.target_platform_fee_amount)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Recompensa prevista</p>
                  <p className="font-medium">{formatCurrency(selectedReferral.reward_amount)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Elegível em</p>
                  <p className="font-medium">{formatDateTime(selectedReferral.eligible_at)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Criada em</p>
                  <p className="font-medium">{formatDateTime(selectedReferral.created_at)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Ativada em</p>
                  <p className="font-medium">{formatDateTime(selectedReferral.activated_at)}</p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedReferral(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
