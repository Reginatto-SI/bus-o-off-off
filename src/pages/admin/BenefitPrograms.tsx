import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Gift, BadgePercent, CircleDollarSign, Users, Search, FileSpreadsheet, FileText, Calendar, List, Power, User } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatsCard } from '@/components/admin/StatsCard';
import { FilterCard } from '@/components/admin/FilterCard';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ActionsDropdown, type ActionItem } from '@/components/admin/ActionsDropdown';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ExportExcelModal, type ExportColumn } from '@/components/admin/ExportExcelModal';
import { ExportPDFModal } from '@/components/admin/ExportPDFModal';
import { BenefitProgram, BenefitProgramEligibleCpf, BenefitProgramStatus, BenefitType } from '@/types/database';
import { buildDebugToastMessage, logSupabaseError } from '@/lib/errorDebug';

interface BenefitProgramFilters {
  search: string;
  status: 'all' | BenefitProgramStatus;
  benefitType: 'all' | BenefitType;
  scope: 'all' | 'all_events' | 'specific_events';
}

interface BenefitProgramWithRelations extends BenefitProgram {
  event_links: Array<{ event_id: string; event?: { name: string | null } | null }>;
  eligible_cpf: BenefitProgramEligibleCpf[];
}

const initialFilters: BenefitProgramFilters = {
  search: '',
  status: 'all',
  benefitType: 'all',
  scope: 'all',
};

const benefitTypeLabel: Record<BenefitType, string> = {
  percentual: 'Percentual',
  valor_fixo: 'Valor fixo',
  preco_final: 'Preço final',
};

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatBenefitValue = (program: Pick<BenefitProgram, 'benefit_type' | 'benefit_value'>) => {
  if (program.benefit_type === 'percentual') return `${program.benefit_value}%`;
  if (program.benefit_type === 'valor_fixo') return formatCurrency(program.benefit_value);
  return `${formatCurrency(program.benefit_value)} (preço final)`;
};

export default function BenefitPrograms() {
  const navigate = useNavigate();
  const { isGerente, isDeveloper, user, activeCompanyId, activeCompany } = useAuth();

  const [programs, setPrograms] = useState<BenefitProgramWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<BenefitProgramFilters>(initialFilters);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);

  const canAccess = isGerente || isDeveloper;

  const filteredPrograms = useMemo(() => {
    return programs.filter((program) => {
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        if (!program.name.toLowerCase().includes(searchLower)) return false;
      }
      if (filters.status !== 'all' && program.status !== filters.status) return false;
      if (filters.benefitType !== 'all' && program.benefit_type !== filters.benefitType) return false;
      if (filters.scope === 'all_events' && !program.applies_to_all_events) return false;
      if (filters.scope === 'specific_events' && program.applies_to_all_events) return false;
      return true;
    });
  }, [filters, programs]);

  const stats = useMemo(() => {
    const total = filteredPrograms.length;
    const ativos = filteredPrograms.filter((program) => program.status === 'ativo').length;
    const inativos = filteredPrograms.filter((program) => program.status === 'inativo').length;
    const cpfsAtivos = filteredPrograms.reduce((acc, program) => {
      const count = program.eligible_cpf.filter((cpf) => cpf.status === 'ativo').length;
      return acc + count;
    }, 0);
    return { total, ativos, inativos, cpfsAtivos };
  }, [filteredPrograms]);

  const hasActiveFilters = useMemo(() => {
    return (
      filters.search !== '' ||
      filters.status !== 'all' ||
      filters.benefitType !== 'all' ||
      filters.scope !== 'all'
    );
  }, [filters]);

  const exportColumns: ExportColumn[] = useMemo(
    () => [
      { key: 'name', label: 'Programa' },
      { key: 'benefit_type_label', label: 'Tipo' },
      { key: 'benefit_value_label', label: 'Valor' },
      { key: 'scope_label', label: 'Abrangência' },
      { key: 'status_label', label: 'Status' },
      { key: 'eligible_cpf_count', label: 'CPFs elegíveis' },
      { key: 'validity_label', label: 'Vigência' },
    ],
    []
  );

  const exportData = useMemo(() => {
    return filteredPrograms.map((program) => ({
      name: program.name,
      benefit_type_label: benefitTypeLabel[program.benefit_type],
      benefit_value_label: formatBenefitValue(program),
      scope_label: program.applies_to_all_events
        ? 'Todos os eventos'
        : `${program.event_links.length} evento(s)`,
      status_label: program.status === 'ativo' ? 'Ativo' : 'Inativo',
      eligible_cpf_count: program.eligible_cpf.length,
      validity_label:
        program.valid_from || program.valid_until
          ? `${program.valid_from ? new Date(program.valid_from).toLocaleDateString('pt-BR') : '—'} até ${program.valid_until ? new Date(program.valid_until).toLocaleDateString('pt-BR') : '—'}`
          : 'Sem vigência definida',
    }));
  }, [filteredPrograms]);

  const fetchPrograms = async () => {
    if (!activeCompanyId) return;
    setLoading(true);

    // Comentário: listagem continua como hub administrativo com leitura escopada por company_id.
    const { data, error } = await supabase
      .from('benefit_programs')
      .select(
        `
        *,
        -- Comentário: desambiguação explícita dos FKs evita erro PGRST201 quando existem múltiplas relações possíveis.
        event_links:benefit_program_event_links!benefit_program_event_links_benefit_program_id_fkey(
          event_id,
          event:events!benefit_program_event_links_event_id_fkey(name)
        ),
        eligible_cpf:benefit_program_eligible_cpf!benefit_program_eligible_cpf_benefit_program_id_fkey(*)
      `
      )
      .eq('company_id', activeCompanyId)
      .order('created_at', { ascending: false });

    if (error) {
      logSupabaseError({
        label: 'Erro ao carregar programas de benefício',
        error,
        context: { action: 'select', table: 'benefit_programs', companyId: activeCompanyId, userId: user?.id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Não foi possível carregar os programas de benefício.',
          error,
          context: { action: 'select', table: 'benefit_programs', companyId: activeCompanyId, userId: user?.id },
        })
      );
    } else {
      setPrograms((data ?? []) as BenefitProgramWithRelations[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (activeCompanyId) {
      void fetchPrograms();
    }
  }, [activeCompanyId]);

  const navigateToEditor = (programId: string, tab?: 'dados' | 'eventos' | 'cpfs') => {
    // Comentário: fluxo principal saiu do modal e agora navega para tela dedicada com foco por query param.
    const suffix = tab ? `?tab=${tab}` : '';
    navigate(`/admin/programas-beneficio/${programId}${suffix}`);
  };

  const handleToggleStatus = async (program: BenefitProgramWithRelations) => {
    const nextStatus: BenefitProgramStatus = program.status === 'ativo' ? 'inativo' : 'ativo';
    const { error } = await supabase
      .from('benefit_programs')
      .update({ status: nextStatus })
      .eq('id', program.id)
      .eq('company_id', activeCompanyId!);

    if (error) {
      toast.error('Não foi possível atualizar o status do programa.');
      return;
    }

    toast.success(nextStatus === 'ativo' ? 'Programa ativado.' : 'Programa inativado.');
    void fetchPrograms();
  };

  const getProgramActions = (program: BenefitProgramWithRelations): ActionItem[] => [
    { label: 'Editar', icon: User, onClick: () => navigateToEditor(program.id, 'dados') },
    {
      label: program.status === 'ativo' ? 'Inativar' : 'Ativar',
      icon: Power,
      onClick: () => void handleToggleStatus(program),
      variant: program.status === 'ativo' ? 'destructive' : 'default',
    },
    { label: 'Gerenciar CPFs elegíveis', icon: Users, onClick: () => navigateToEditor(program.id, 'cpfs') },
    { label: 'Gerenciar eventos vinculados', icon: Calendar, onClick: () => navigateToEditor(program.id, 'eventos') },
    { label: 'Visualizar detalhes', icon: List, onClick: () => navigateToEditor(program.id, 'dados') },
  ];

  if (!canAccess) return <Navigate to="/admin/eventos" replace />;

  return (
    <AdminLayout>
      <div className="page-container">
        <PageHeader
          title="Programas de Benefício"
          description="Gerencie programas, regras de desconto e passageiros elegíveis por CPF"
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => setExportModalOpen(true)}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPdfModalOpen(true)}>
                <FileText className="h-4 w-4 mr-2" />
                PDF
              </Button>
              <Button onClick={() => navigate('/admin/programas-beneficio/novo')}>
                Adicionar Programa
              </Button>
            </>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatsCard label="Total de programas" value={stats.total} icon={Gift} />
          <StatsCard label="Programas ativos" value={stats.ativos} icon={BadgePercent} variant="success" />
          <StatsCard label="Programas inativos" value={stats.inativos} icon={CircleDollarSign} variant="destructive" />
          <StatsCard label="CPFs elegíveis ativos" value={stats.cpfsAtivos} icon={Users} variant="warning" />
        </div>

        <FilterCard
          className="mb-6"
          searchValue={filters.search}
          onSearchChange={(value) => setFilters({ ...filters, search: value })}
          searchPlaceholder="Buscar por nome do programa..."
          searchIcon={Search}
          selects={[
            {
              id: 'status',
              label: 'Status',
              placeholder: 'Status',
              value: filters.status,
              onChange: (value) => setFilters({ ...filters, status: value as BenefitProgramFilters['status'] }),
              options: [
                { value: 'all', label: 'Todos' },
                { value: 'ativo', label: 'Ativo' },
                { value: 'inativo', label: 'Inativo' },
              ],
            },
            {
              id: 'benefitType',
              label: 'Tipo de benefício',
              placeholder: 'Tipo',
              value: filters.benefitType,
              onChange: (value) => setFilters({ ...filters, benefitType: value as BenefitProgramFilters['benefitType'] }),
              options: [
                { value: 'all', label: 'Todos' },
                { value: 'percentual', label: 'Percentual' },
                { value: 'valor_fixo', label: 'Valor fixo' },
                { value: 'preco_final', label: 'Preço final' },
              ],
            },
            {
              id: 'scope',
              label: 'Abrangência',
              placeholder: 'Abrangência',
              value: filters.scope,
              onChange: (value) => setFilters({ ...filters, scope: value as BenefitProgramFilters['scope'] }),
              options: [
                { value: 'all', label: 'Todos' },
                { value: 'all_events', label: 'Todos os eventos' },
                { value: 'specific_events', label: 'Eventos específicos' },
              ],
            },
          ]}
          onClearFilters={() => setFilters(initialFilters)}
          hasActiveFilters={hasActiveFilters}
        />

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 text-sm text-muted-foreground">Carregando programas de benefício...</div>
            ) : filteredPrograms.length === 0 ? (
              <EmptyState
                icon={<Gift className="w-8 h-8 text-muted-foreground" />}
                title="Nenhum programa de benefício encontrado"
                description="Crie o primeiro programa para começar a vincular benefícios por CPF."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Programa</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Abrangência</TableHead>
                    <TableHead>Vigência</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>CPFs elegíveis</TableHead>
                    <TableHead className="w-[80px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPrograms.map((program) => (
                    <TableRow key={program.id}>
                      <TableCell>
                        <p className="font-medium">{program.name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{program.description || 'Sem descrição'}</p>
                      </TableCell>
                      <TableCell>{benefitTypeLabel[program.benefit_type]}</TableCell>
                      <TableCell>{formatBenefitValue(program)}</TableCell>
                      <TableCell>{program.applies_to_all_events ? 'Todos os eventos' : `${program.event_links.length} evento(s)`}</TableCell>
                      <TableCell>
                        {program.valid_from || program.valid_until
                          ? `${program.valid_from ? new Date(program.valid_from).toLocaleDateString('pt-BR') : '—'} até ${program.valid_until ? new Date(program.valid_until).toLocaleDateString('pt-BR') : '—'}`
                          : 'Sem vigência'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={program.status === 'ativo' ? 'ativo' : 'inativo'} />
                      </TableCell>
                      <TableCell>{program.eligible_cpf.length}</TableCell>
                      <TableCell>
                        <ActionsDropdown actions={getProgramActions(program)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <ExportExcelModal
        open={exportModalOpen}
        onOpenChange={setExportModalOpen}
        columns={exportColumns}
        data={exportData}
        storageKey="benefit_programs"
        fileName="programas-beneficio"
      />

      <ExportPDFModal
        open={pdfModalOpen}
        onOpenChange={setPdfModalOpen}
        columns={exportColumns}
        data={exportData}
        storageKey="benefit_programs"
        fileName="programas-beneficio"
        title="Programas de Benefício"
        company={activeCompany}
        totalRecords={filteredPrograms.length}
      />
    </AdminLayout>
  );
}
