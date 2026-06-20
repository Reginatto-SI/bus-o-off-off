import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, Building2, Bus, CalendarClock, CheckCircle2, Loader2, PlugZap, Search, Users } from 'lucide-react';
import { toast } from 'sonner';

import { AdminLayout } from '@/components/layout/AdminLayout';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatsCard } from '@/components/admin/StatsCard';
import { FilterCard } from '@/components/admin/FilterCard';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

type ActivationStatus = 'ativa' | 'em_implantacao' | 'travada' | 'abandonada' | 'sem_configuracao';
type TriStateFilter = 'all' | 'yes' | 'no';
type AsaasStatus = 'production_connected' | 'sandbox_connected' | 'partial' | 'not_registered';

interface CompanyActivationReportRpcRow {
  id: string;
  name: string;
  legal_name: string | null;
  trade_name: string | null;
  cnpj: string | null;
  document: string | null;
  document_number: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  city: string | null;
  state: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  asaas_account_id_production: string | null;
  asaas_wallet_id_production: string | null;
  asaas_onboarding_complete_production: boolean;
  asaas_pix_ready_production: boolean;
  asaas_pix_last_checked_at_production: string | null;
  asaas_account_id_sandbox: string | null;
  asaas_wallet_id_sandbox: string | null;
  asaas_onboarding_complete_sandbox: boolean;
  asaas_pix_ready_sandbox: boolean;
  asaas_pix_last_checked_at_sandbox: string | null;
  event_count: number;
  sale_count: number;
  paid_sale_count: number;
  vehicle_count: number;
  driver_count: number;
  last_activity_at: string | null;
}

interface CompanyActivationRow extends Omit<CompanyActivationReportRpcRow, 'event_count' | 'sale_count' | 'paid_sale_count' | 'vehicle_count' | 'driver_count' | 'last_activity_at'> {
  eventCount: number;
  saleCount: number;
  paidSaleCount: number;
  vehicleCount: number;
  driverCount: number;
  lastActivityAt: string | null;
  hasAsaas: boolean;
  asaasStatus: AsaasStatus;
  activationStatus: ActivationStatus;
  suggestedAction: string;
}

interface Filters {
  search: string;
  status: ActivationStatus | 'all';
  asaas: TriStateFilter;
  events: TriStateFilter;
  fleet: TriStateFilter;
  drivers: TriStateFilter;
  createdFrom: string;
  createdTo: string;
  activityFrom: string;
  activityTo: string;
}

const defaultFilters: Filters = {
  search: '',
  status: 'all',
  asaas: 'all',
  events: 'all',
  fleet: 'all',
  drivers: 'all',
  createdFrom: '',
  createdTo: '',
  activityFrom: '',
  activityTo: '',
};

const statusLabels: Record<ActivationStatus, string> = {
  ativa: 'Ativa',
  em_implantacao: 'Em implantação',
  travada: 'Travada',
  abandonada: 'Abandonada',
  sem_configuracao: 'Sem configuração',
};

const statusStyles: Record<ActivationStatus, string> = {
  ativa: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  em_implantacao: 'bg-blue-100 text-blue-800 border-blue-200',
  travada: 'bg-amber-100 text-amber-800 border-amber-200',
  abandonada: 'bg-red-100 text-red-800 border-red-200',
  sem_configuracao: 'bg-slate-100 text-slate-800 border-slate-200',
};

const asaasLabels: Record<AsaasStatus, string> = {
  production_connected: 'Produção conectado',
  sandbox_connected: 'Sandbox conectado',
  partial: 'Parcial/incompleto',
  not_registered: 'Não cadastrado',
};

const asaasStyles: Record<AsaasStatus, string> = {
  production_connected: 'border-emerald-200 text-emerald-700',
  sandbox_connected: 'border-blue-200 text-blue-700',
  partial: 'border-amber-200 text-amber-700',
  not_registered: 'border-slate-200 text-slate-700',
};

function formatDateTime(value?: string | null) {
  if (!value) return 'Não informado';
  try {
    return format(parseISO(value), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return 'Não informado';
  }
}

function normalize(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isOlderThanDays(value: string | null, days: number) {
  if (!value) return true;
  return Date.now() - new Date(value).getTime() > days * 24 * 60 * 60 * 1000;
}

function getAsaasStatus(company: CompanyActivationReportRpcRow): AsaasStatus {
  const productionConnected = Boolean(
    company.asaas_onboarding_complete_production &&
    company.asaas_pix_ready_production &&
    company.asaas_account_id_production &&
    company.asaas_wallet_id_production
  );
  const sandboxConnected = Boolean(
    company.asaas_onboarding_complete_sandbox &&
    company.asaas_pix_ready_sandbox &&
    company.asaas_account_id_sandbox &&
    company.asaas_wallet_id_sandbox
  );
  const hasAnyAsaasSetup = Boolean(
    company.asaas_onboarding_complete_production ||
    company.asaas_pix_ready_production ||
    company.asaas_account_id_production ||
    company.asaas_wallet_id_production ||
    company.asaas_onboarding_complete_sandbox ||
    company.asaas_pix_ready_sandbox ||
    company.asaas_account_id_sandbox ||
    company.asaas_wallet_id_sandbox
  );

  if (productionConnected) return 'production_connected';
  if (sandboxConnected) return 'sandbox_connected';
  return hasAnyAsaasSetup ? 'partial' : 'not_registered';
}

function resolveActivation(row: Omit<CompanyActivationRow, 'activationStatus' | 'suggestedAction'>): Pick<CompanyActivationRow, 'activationStatus' | 'suggestedAction'> {
  const hasEvents = row.eventCount > 0;
  const hasSales = row.saleCount > 0;
  const hasFleet = row.vehicleCount > 0;
  const hasDrivers = row.driverCount > 0;
  const configuredSteps = [row.hasAsaas, hasEvents, hasFleet, hasDrivers].filter(Boolean).length;
  const hasRecentConfiguration = !isOlderThanDays(row.lastActivityAt, 15);
  const inactiveUsage = isOlderThanDays(row.lastActivityAt, 60);

  // Classificação previsível e local à tela: não altera regra de negócio nem status persistido da empresa.
  if (!row.is_active) return { activationStatus: 'abandonada', suggestedAction: 'Reativar cliente parado' };
  if (configuredSteps === 0) return { activationStatus: hasRecentConfiguration ? 'sem_configuracao' : 'abandonada', suggestedAction: hasRecentConfiguration ? 'Entrar em contato para onboarding' : 'Reativar cliente parado' };
  if (inactiveUsage && !hasSales && configuredSteps <= 1) return { activationStatus: 'abandonada', suggestedAction: 'Reativar cliente parado' };
  if (row.asaasStatus === 'partial') return { activationStatus: hasRecentConfiguration ? 'em_implantacao' : 'travada', suggestedAction: 'Ajudar a configurar Asaas' };
  if (!row.hasAsaas) return { activationStatus: hasRecentConfiguration ? 'em_implantacao' : 'travada', suggestedAction: 'Ajudar a configurar Asaas' };
  if (!hasEvents) return { activationStatus: 'travada', suggestedAction: 'Ajudar a criar primeiro evento' };
  if (!hasFleet) return { activationStatus: 'travada', suggestedAction: 'Ajudar a cadastrar frota' };
  if (!hasDrivers) return { activationStatus: 'travada', suggestedAction: 'Ajudar a cadastrar motoristas' };
  if (hasSales && !inactiveUsage && row.is_active) return { activationStatus: 'ativa', suggestedAction: 'Cliente ativo' };
  if (!hasSales) return { activationStatus: 'em_implantacao', suggestedAction: 'Entrar em contato para onboarding' };
  if (inactiveUsage) return { activationStatus: 'abandonada', suggestedAction: 'Reativar cliente parado' };
  return { activationStatus: 'em_implantacao', suggestedAction: 'Entrar em contato para onboarding' };
}


export default function CompanyActivationReport() {
  const { isDeveloper, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<CompanyActivationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(defaultFilters);

  useEffect(() => {
    if (authLoading || !isDeveloper) return;

    const loadReport = async () => {
      setLoading(true);
      try {
        // A RPC agrega no banco e valida is_developer(auth.uid()), evitando carregar linhas brutas multiempresa no frontend.
        const { data, error } = await supabase.rpc('get_company_activation_report');
        if (error) throw error;

        const nextRows = ((data ?? []) as CompanyActivationReportRpcRow[]).map((company) => {
          const asaasStatus = getAsaasStatus(company);
          const base = {
            ...company,
            eventCount: Number(company.event_count ?? 0),
            saleCount: Number(company.sale_count ?? 0),
            paidSaleCount: Number(company.paid_sale_count ?? 0),
            vehicleCount: Number(company.vehicle_count ?? 0),
            driverCount: Number(company.driver_count ?? 0),
            lastActivityAt: company.last_activity_at ?? company.updated_at ?? company.created_at,
            hasAsaas: asaasStatus === 'production_connected' || asaasStatus === 'sandbox_connected',
            asaasStatus,
          };
          return { ...base, ...resolveActivation(base) };
        });

        setRows(nextRows);
      } catch (error) {
        console.error('[CompanyActivationReport] erro ao carregar relatório interno', error);
        toast.error('Não foi possível carregar o relatório de empresas e ativação.');
      } finally {
        setLoading(false);
      }
    };

    void loadReport();
  }, [authLoading, isDeveloper]);

  const filteredRows = useMemo(() => {
    const term = normalize(filters.search.trim());
    return rows.filter((row) => {
      const searchable = normalize([row.name, row.legal_name, row.trade_name, row.cnpj, row.document, row.document_number, row.email, row.phone, row.whatsapp].filter(Boolean).join(' '));
      const createdAt = row.created_at.slice(0, 10);
      const activityAt = row.lastActivityAt?.slice(0, 10) ?? '';
      return (!term || searchable.includes(term))
        && (filters.status === 'all' || row.activationStatus === filters.status)
        && (filters.asaas === 'all' || (filters.asaas === 'yes' ? row.hasAsaas : !row.hasAsaas))
        && (filters.events === 'all' || (filters.events === 'yes' ? row.eventCount > 0 : row.eventCount === 0))
        && (filters.fleet === 'all' || (filters.fleet === 'yes' ? row.vehicleCount > 0 : row.vehicleCount === 0))
        && (filters.drivers === 'all' || (filters.drivers === 'yes' ? row.driverCount > 0 : row.driverCount === 0))
        && (!filters.createdFrom || createdAt >= filters.createdFrom)
        && (!filters.createdTo || createdAt <= filters.createdTo)
        && (!filters.activityFrom || activityAt >= filters.activityFrom)
        && (!filters.activityTo || activityAt <= filters.activityTo);
    });
  }, [filters, rows]);

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter((row) => row.activationStatus === 'ativa').length,
    withoutEvents: rows.filter((row) => row.eventCount === 0).length,
    withoutAsaas: rows.filter((row) => !row.hasAsaas).length,
    withoutFleet: rows.filter((row) => row.vehicleCount === 0).length,
    withoutDrivers: rows.filter((row) => row.driverCount === 0).length,
    abandoned: rows.filter((row) => row.activationStatus === 'abandonada').length,
  }), [rows]);

  if (!authLoading && !isDeveloper) return <Navigate to="/admin/dashboard" replace />;

  return (
    <AdminLayout>
      <div className="admin-page-container space-y-5">
        <PageHeader
          title="Empresas e Ativação"
          description="Relatório interno para acompanhar onboarding, uso inicial e oportunidades de contato comercial."
          metadata={<Badge variant="outline">Acesso exclusivo: Perfil Desenvolvedor</Badge>}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-7">
          <StatsCard label="Total de empresas" value={stats.total} icon={Building2} />
          <StatsCard label="Empresas ativas" value={stats.active} icon={CheckCircle2} variant="success" />
          <StatsCard label="Sem evento" value={stats.withoutEvents} icon={CalendarClock} variant="warning" />
          <StatsCard label="Sem Asaas" value={stats.withoutAsaas} icon={PlugZap} variant="warning" />
          <StatsCard label="Sem frota" value={stats.withoutFleet} icon={Bus} variant="warning" />
          <StatsCard label="Sem motoristas" value={stats.withoutDrivers} icon={Users} variant="warning" />
          <StatsCard label="Abandonadas" value={stats.abandoned} icon={AlertTriangle} variant="destructive" />
        </div>

        <FilterCard
          searchLabel="Busca"
          searchIcon={Search}
          searchValue={filters.search}
          onSearchChange={(search) => setFilters((prev) => ({ ...prev, search }))}
          searchPlaceholder="Nome, razão social, CNPJ, responsável, e-mail ou WhatsApp"
          selects={[
            { id: 'status', label: 'Status de ativação', placeholder: 'Todos', value: filters.status, onChange: (status) => setFilters((prev) => ({ ...prev, status: status as Filters['status'] })), options: [{ value: 'all', label: 'Todos' }, ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))] },
            { id: 'asaas', label: 'Asaas', placeholder: 'Todos', value: filters.asaas, onChange: (asaas) => setFilters((prev) => ({ ...prev, asaas: asaas as TriStateFilter })), options: [{ value: 'all', label: 'Todos' }, { value: 'yes', label: 'Com Asaas' }, { value: 'no', label: 'Sem Asaas' }] },
            { id: 'events', label: 'Eventos', placeholder: 'Todos', value: filters.events, onChange: (events) => setFilters((prev) => ({ ...prev, events: events as TriStateFilter })), options: [{ value: 'all', label: 'Todos' }, { value: 'yes', label: 'Com eventos' }, { value: 'no', label: 'Sem eventos' }] },
          ]}
          advancedFilters={
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
              {(['fleet', 'drivers'] as const).map((key) => (
                <div className="space-y-1.5" key={key}>
                  <label className="text-sm font-medium text-muted-foreground">{key === 'fleet' ? 'Frota' : 'Motoristas'}</label>
                  <Select value={filters[key]} onValueChange={(value) => setFilters((prev) => ({ ...prev, [key]: value as TriStateFilter }))}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="yes">Com cadastro</SelectItem>
                      <SelectItem value="no">Sem cadastro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <div className="space-y-1.5"><label className="text-sm font-medium text-muted-foreground">Cadastro inicial</label><Input type="date" value={filters.createdFrom} onChange={(e) => setFilters((prev) => ({ ...prev, createdFrom: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="text-sm font-medium text-muted-foreground">Cadastro final</label><Input type="date" value={filters.createdTo} onChange={(e) => setFilters((prev) => ({ ...prev, createdTo: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="text-sm font-medium text-muted-foreground">Atividade inicial</label><Input type="date" value={filters.activityFrom} onChange={(e) => setFilters((prev) => ({ ...prev, activityFrom: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="text-sm font-medium text-muted-foreground">Atividade final</label><Input type="date" value={filters.activityTo} onChange={(e) => setFilters((prev) => ({ ...prev, activityTo: e.target.value }))} /></div>
            </div>
          }
          onClearFilters={() => setFilters(defaultFilters)}
          hasActiveFilters={JSON.stringify(filters) !== JSON.stringify(defaultFilters)}
        />

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex h-56 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : filteredRows.length === 0 ? (
              <div className="p-6"><EmptyState title="Nenhuma empresa encontrada" description="Ajuste os filtros para visualizar empresas cadastradas." icon={<Building2 className="h-6 w-6 text-muted-foreground" />} /></div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead><TableHead>Contato</TableHead><TableHead>Cidade/UF</TableHead><TableHead>Cadastro</TableHead><TableHead>Última atividade</TableHead><TableHead className="text-right">Eventos</TableHead><TableHead className="text-right">Vendas</TableHead><TableHead>Asaas</TableHead><TableHead>Frota</TableHead><TableHead>Motoristas</TableHead><TableHead>Status</TableHead><TableHead>Ação sugerida</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="min-w-[240px]"><div className="font-medium">{row.name || 'Não informado'}</div><div className="text-xs text-muted-foreground">Razão social: {row.legal_name || 'Não informado'}</div><div className="text-xs text-muted-foreground">CNPJ: {row.cnpj || row.document || row.document_number || 'Não informado'}</div></TableCell>
                        <TableCell className="min-w-[230px]"><div className="font-medium">Contato disponível</div><div className="text-xs text-muted-foreground">Base: {row.trade_name || row.legal_name || row.name || 'Não informado'}</div><div className="text-xs text-muted-foreground">WhatsApp: {row.whatsapp || row.phone || 'Não informado'}</div><div className="text-xs text-muted-foreground">E-mail: {row.email || 'Não informado'}</div></TableCell>
                        <TableCell>{[row.city, row.state].filter(Boolean).join('/') || 'Não informado'}</TableCell>
                        <TableCell>{formatDateTime(row.created_at)}</TableCell>
                        <TableCell>{formatDateTime(row.lastActivityAt)}</TableCell>
                        <TableCell className="text-right">{row.eventCount}</TableCell>
                        <TableCell className="text-right">{row.saleCount}</TableCell>
                        <TableCell><Badge variant="outline" className={cn(asaasStyles[row.asaasStatus])}>{asaasLabels[row.asaasStatus]}</Badge></TableCell>
                        <TableCell>{row.vehicleCount > 0 ? 'Sim' : 'Não cadastrado'}</TableCell>
                        <TableCell>{row.driverCount > 0 ? 'Sim' : 'Não cadastrado'}</TableCell>
                        <TableCell><Badge variant="outline" className={statusStyles[row.activationStatus]}>{statusLabels[row.activationStatus]}</Badge></TableCell>
                        <TableCell className="min-w-[190px] font-medium">{row.suggestedAction}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
