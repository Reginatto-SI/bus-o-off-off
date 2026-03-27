import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  BenefitProgram,
  BenefitProgramEligibleCpf,
  BenefitProgramStatus,
  BenefitType,
  Event,
} from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatsCard } from '@/components/admin/StatsCard';
import { FilterCard } from '@/components/admin/FilterCard';
import { ActionsDropdown, ActionItem } from '@/components/admin/ActionsDropdown';
import { ExportExcelModal, ExportColumn } from '@/components/admin/ExportExcelModal';
import { ExportPDFModal } from '@/components/admin/ExportPDFModal';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  BadgePercent,
  Calendar,
  CircleDollarSign,
  FileSpreadsheet,
  FileText,
  Gift,
  List,
  Loader2,
  Plus,
  Power,
  Search,
  User,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { buildDebugToastMessage, logSupabaseError } from '@/lib/errorDebug';
import { isValidCpfDigits, normalizeCpfDigits } from '@/lib/benefitEligibility';

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

const formatCpfMask = (digits: string) =>
  digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

function parseBulkCpfs(text: string): string[] {
  const parsed = text
    .split(/[\n,;\t ]+/)
    .map((chunk) => normalizeCpfDigits(chunk))
    .filter((chunk) => chunk.length === 11 && isValidCpfDigits(chunk));
  return Array.from(new Set(parsed));
}

export default function BenefitPrograms() {
  const { isGerente, isDeveloper, user, activeCompanyId, activeCompany } = useAuth();

  const [programs, setPrograms] = useState<BenefitProgramWithRelations[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dados');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<BenefitProgramFilters>(initialFilters);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [cpfSaving, setCpfSaving] = useState(false);
  const [bulkCpfText, setBulkCpfText] = useState('');
  const [pendingCpfs, setPendingCpfs] = useState<string[]>([]);

  const [form, setForm] = useState({
    name: '',
    description: '',
    status: 'ativo' as BenefitProgramStatus,
    benefit_type: 'percentual' as BenefitType,
    benefit_value: '',
    valid_from: '',
    valid_until: '',
    applies_to_all_events: true,
  });

  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [cpfForm, setCpfForm] = useState({
    cpf: '',
    full_name: '',
    status: 'ativo' as BenefitProgramStatus,
    valid_from: '',
    valid_until: '',
    notes: '',
  });

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

    const { data, error } = await supabase
      .from('benefit_programs')
      .select(
        `
        *,
        event_links:benefit_program_event_links(event_id, event:events(name)),
        eligible_cpf:benefit_program_eligible_cpf(*)
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

  const fetchEvents = async () => {
    if (!activeCompanyId) return;

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('company_id', activeCompanyId)
      .order('date', { ascending: false })
      .limit(300);

    if (error) {
      toast.error('Não foi possível carregar eventos da empresa.');
      return;
    }
    setEvents((data ?? []) as Event[]);
  };

  useEffect(() => {
    if (activeCompanyId) {
      fetchPrograms();
      fetchEvents();
    }
  }, [activeCompanyId]);

  const resetForm = () => {
    setEditingId(null);
    setActiveTab('dados');
    setForm({
      name: '',
      description: '',
      status: 'ativo',
      benefit_type: 'percentual',
      benefit_value: '',
      valid_from: '',
      valid_until: '',
      applies_to_all_events: true,
    });
    setSelectedEventIds([]);
    setCpfForm({ cpf: '', full_name: '', status: 'ativo', valid_from: '', valid_until: '', notes: '' });
    setBulkCpfText('');
    setPendingCpfs([]);
  };

  const handleEdit = (program: BenefitProgramWithRelations, tab: string = 'dados') => {
    setEditingId(program.id);
    setActiveTab(tab);
    setForm({
      name: program.name,
      description: program.description ?? '',
      status: program.status,
      benefit_type: program.benefit_type,
      benefit_value: String(program.benefit_value),
      valid_from: program.valid_from ?? '',
      valid_until: program.valid_until ?? '',
      applies_to_all_events: program.applies_to_all_events,
    });
    setSelectedEventIds(program.event_links.map((link) => link.event_id));
    setDialogOpen(true);
  };

  const validateProgramForm = () => {
    if (!form.name.trim()) {
      toast.error('Nome do programa é obrigatório.');
      return false;
    }

    if (!form.benefit_value || Number(form.benefit_value) < 0) {
      toast.error('Valor do benefício é obrigatório.');
      return false;
    }

    if (form.valid_from && form.valid_until && form.valid_until < form.valid_from) {
      toast.error('A data final não pode ser menor que a data inicial.');
      return false;
    }

    if (!form.applies_to_all_events && selectedEventIds.length === 0) {
      toast.error('Selecione ao menos um evento ou marque a opção para todos os eventos.');
      return false;
    }

    return true;
  };

  const syncProgramEvents = async (programId: string) => {
    if (!activeCompanyId) return { error: null };

    const { error: deleteError } = await supabase
      .from('benefit_program_event_links')
      .delete()
      .eq('benefit_program_id', programId)
      .eq('company_id', activeCompanyId);

    if (deleteError) return { error: deleteError };

    if (form.applies_to_all_events || selectedEventIds.length === 0) {
      return { error: null };
    }

    const payload = selectedEventIds.map((eventId) => ({
      company_id: activeCompanyId,
      benefit_program_id: programId,
      event_id: eventId,
    }));

    const { error: insertError } = await supabase.from('benefit_program_event_links').insert(payload);
    return { error: insertError };
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeCompanyId) return;

    if (!validateProgramForm()) return;

    setSaving(true);

    const payload = {
      company_id: activeCompanyId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      status: form.status,
      benefit_type: form.benefit_type,
      benefit_value: Number(form.benefit_value),
      valid_from: form.valid_from || null,
      valid_until: form.valid_until || null,
      applies_to_all_events: form.applies_to_all_events,
    };

    let programId = editingId;

    if (editingId) {
      const { company_id, ...updatePayload } = payload;
      const { error } = await supabase
        .from('benefit_programs')
        .update(updatePayload)
        .eq('id', editingId)
        .eq('company_id', activeCompanyId);

      if (error) {
        toast.error('Não foi possível salvar o programa de benefício.');
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from('benefit_programs')
        .insert([payload])
        .select('id')
        .single();

      if (error || !data) {
        toast.error('Não foi possível salvar o programa de benefício.');
        setSaving(false);
        return;
      }

      programId = data.id;
    }

    const { error: eventLinkError } = await syncProgramEvents(programId!);
    if (eventLinkError) {
      toast.error('Não foi possível atualizar os eventos vinculados do programa.');
      setSaving(false);
      return;
    }

    // No cadastro inicial, permitimos montar uma fila de CPFs antes do primeiro save.
    // Após obter o programId, persistimos em lote para manter fluxo simples e auditável.
    if (!editingId && pendingCpfs.length > 0) {
      const cpfPayload = pendingCpfs.map((cpf) => ({
        company_id: activeCompanyId,
        benefit_program_id: programId,
        cpf,
        status: 'ativo' as BenefitProgramStatus,
      }));
      const { error: cpfInsertError } = await supabase.from('benefit_program_eligible_cpf').insert(cpfPayload);
      if (cpfInsertError) {
        toast.error('Programa salvo, mas houve falha ao inserir parte dos CPFs pendentes.');
      }
    }

    toast.success(editingId ? 'Programa atualizado com sucesso.' : 'Programa criado com sucesso.');
    setSaving(false);
    setDialogOpen(false);
    resetForm();
    fetchPrograms();
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
    fetchPrograms();
  };

  const handleAddCpf = async () => {
    if (!activeCompanyId) return;

    const normalizedCpf = normalizeCpfDigits(cpfForm.cpf);
    if (!isValidCpfDigits(normalizedCpf)) {
      toast.error('CPF inválido.');
      return;
    }

    if (cpfForm.valid_from && cpfForm.valid_until && cpfForm.valid_until < cpfForm.valid_from) {
      toast.error('A data final não pode ser menor que a data inicial.');
      return;
    }

    if (!editingId) {
      if (pendingCpfs.includes(normalizedCpf)) {
        toast.error('Este CPF já foi adicionado na lista pendente.');
        return;
      }
      setPendingCpfs((prev) => [...prev, normalizedCpf]);
      setCpfForm({ ...cpfForm, cpf: '' });
      return;
    }

    setCpfSaving(true);
    const { error } = await supabase.from('benefit_program_eligible_cpf').insert([
      {
        company_id: activeCompanyId,
        benefit_program_id: editingId,
        cpf: normalizedCpf,
        full_name: cpfForm.full_name.trim() || null,
        status: cpfForm.status,
        valid_from: cpfForm.valid_from || null,
        valid_until: cpfForm.valid_until || null,
        notes: cpfForm.notes.trim() || null,
      },
    ]);

    setCpfSaving(false);

    if (error) {
      const duplicate = error.message.includes('uq_benefit_program_eligible_cpf_program_cpf');
      toast.error(duplicate ? 'Este CPF já está vinculado a este programa.' : 'Não foi possível salvar o CPF elegível.');
      return;
    }

    setCpfForm({ cpf: '', full_name: '', status: 'ativo', valid_from: '', valid_until: '', notes: '' });
    toast.success('CPF elegível adicionado com sucesso.');
    fetchPrograms();
  };

  const handleBulkCpfAdd = async () => {
    if (!bulkCpfText.trim()) return;

    const cpfs = parseBulkCpfs(bulkCpfText);
    if (cpfs.length === 0) {
      toast.error('Nenhum CPF válido encontrado na lista informada.');
      return;
    }

    if (!editingId) {
      const next = Array.from(new Set([...pendingCpfs, ...cpfs]));
      setPendingCpfs(next);
      setBulkCpfText('');
      toast.success(`${cpfs.length} CPF(s) adicionados na lista pendente.`);
      return;
    }

    const payload = cpfs.map((cpf) => ({
      company_id: activeCompanyId!,
      benefit_program_id: editingId,
      cpf,
      status: 'ativo' as BenefitProgramStatus,
    }));

    const { error } = await supabase
      .from('benefit_program_eligible_cpf')
      .upsert(payload, { onConflict: 'benefit_program_id,cpf', ignoreDuplicates: true });

    if (error) {
      toast.error('Não foi possível importar a lista de CPFs.');
      return;
    }

    setBulkCpfText('');
    toast.success('Lista de CPFs importada com sucesso.');
    fetchPrograms();
  };

  const handleToggleCpfStatus = async (record: BenefitProgramEligibleCpf) => {
    const nextStatus: BenefitProgramStatus = record.status === 'ativo' ? 'inativo' : 'ativo';
    const { error } = await supabase
      .from('benefit_program_eligible_cpf')
      .update({ status: nextStatus })
      .eq('id', record.id)
      .eq('company_id', activeCompanyId!);

    if (error) {
      toast.error('Não foi possível atualizar o status do CPF elegível.');
      return;
    }

    toast.success(nextStatus === 'ativo' ? 'CPF ativado.' : 'CPF inativado.');
    fetchPrograms();
  };

  const getProgramActions = (program: BenefitProgramWithRelations): ActionItem[] => [
    { label: 'Editar', icon: User, onClick: () => handleEdit(program, 'dados') },
    {
      label: program.status === 'ativo' ? 'Inativar' : 'Ativar',
      icon: Power,
      onClick: () => handleToggleStatus(program),
      variant: program.status === 'ativo' ? 'destructive' : 'default',
    },
    { label: 'Gerenciar CPFs elegíveis', icon: Users, onClick: () => handleEdit(program, 'cpfs') },
    { label: 'Gerenciar eventos vinculados', icon: Calendar, onClick: () => handleEdit(program, 'eventos') },
    { label: 'Visualizar detalhes', icon: List, onClick: () => handleEdit(program, 'dados') },
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
              <Dialog
                open={dialogOpen}
                onOpenChange={(open) => {
                  setDialogOpen(open);
                  if (!open) resetForm();
                }}
              >
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Programa
                  </Button>
                </DialogTrigger>
                <DialogContent className="admin-modal flex h-[90vh] max-h-[90vh] w-[95vw] max-w-6xl flex-col gap-0 p-0">
                  <DialogHeader className="admin-modal__header px-6 py-4">
                    <DialogTitle>{editingId ? 'Editar' : 'Novo'} Programa de Benefício</DialogTitle>
                  </DialogHeader>

                  <form onSubmit={handleSubmit} className="flex h-full flex-col">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
                      <TabsList className="admin-modal__tabs flex h-auto w-full flex-wrap justify-start gap-1 px-6 py-2">
                        <TabsTrigger value="dados">Dados do programa</TabsTrigger>
                        <TabsTrigger value="eventos">Eventos</TabsTrigger>
                        <TabsTrigger value="cpfs">CPFs elegíveis</TabsTrigger>
                      </TabsList>

                      <div className="admin-modal__body flex-1 overflow-y-auto px-6 py-4">
                        <TabsContent value="dados" className="mt-0">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2 sm:col-span-2">
                              <Label>Nome do programa</Label>
                              <Input
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                required
                              />
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                              <Label>Descrição</Label>
                              <Textarea
                                value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                                rows={3}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Status</Label>
                              <Select
                                value={form.status}
                                onValueChange={(value: BenefitProgramStatus) =>
                                  setForm({ ...form, status: value })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="ativo">Ativo</SelectItem>
                                  <SelectItem value="inativo">Inativo</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Tipo de benefício</Label>
                              <Select
                                value={form.benefit_type}
                                onValueChange={(value: BenefitType) =>
                                  setForm({ ...form, benefit_type: value })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Tipo" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="percentual">Percentual</SelectItem>
                                  <SelectItem value="valor_fixo">Valor fixo</SelectItem>
                                  <SelectItem value="preco_final">Preço final</SelectItem>
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-muted-foreground">
                                {form.benefit_type === 'percentual' && 'Percentual = desconto sobre o valor da passagem.'}
                                {form.benefit_type === 'valor_fixo' && 'Valor fixo = desconto em reais.'}
                                {form.benefit_type === 'preco_final' && 'Preço final = valor final da passagem para elegíveis.'}
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label>Valor do benefício</Label>
                              <Input
                                type="number"
                                step={form.benefit_type === 'percentual' ? '0.01' : '0.01'}
                                min="0"
                                value={form.benefit_value}
                                onChange={(e) => setForm({ ...form, benefit_value: e.target.value })}
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Aplicar para todos os eventos?</Label>
                              <div className="flex h-10 items-center rounded-md border px-3">
                                <Checkbox
                                  checked={form.applies_to_all_events}
                                  onCheckedChange={(checked) =>
                                    setForm({ ...form, applies_to_all_events: Boolean(checked) })
                                  }
                                />
                                <span className="ml-3 text-sm text-muted-foreground">
                                  Marque para não exigir vínculos específicos por evento.
                                </span>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>Vigência inicial</Label>
                              <Input
                                type="date"
                                value={form.valid_from}
                                onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Vigência final</Label>
                              <Input
                                type="date"
                                value={form.valid_until}
                                onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
                              />
                            </div>
                          </div>
                        </TabsContent>

                        <TabsContent value="eventos" className="mt-0 space-y-4">
                          {form.applies_to_all_events ? (
                            <Card>
                              <CardContent className="p-4 text-sm text-muted-foreground">
                                Este programa está configurado para todos os eventos. Desmarque a opção na aba
                                "Dados do programa" para selecionar eventos específicos.
                              </CardContent>
                            </Card>
                          ) : (
                            <div className="grid gap-4 lg:grid-cols-2">
                              <Card>
                                <CardContent className="p-4 space-y-3">
                                  <p className="text-sm font-medium">Selecionar eventos da empresa</p>
                                  <div className="max-h-72 overflow-auto space-y-2">
                                    {events.map((item) => {
                                      const checked = selectedEventIds.includes(item.id);
                                      return (
                                        <label key={item.id} className="flex items-start gap-2 rounded border p-2 text-sm">
                                          <Checkbox
                                            checked={checked}
                                            onCheckedChange={(status) => {
                                              if (status) {
                                                setSelectedEventIds((prev) => [...prev, item.id]);
                                              } else {
                                                setSelectedEventIds((prev) =>
                                                  prev.filter((eventId) => eventId !== item.id)
                                                );
                                              }
                                            }}
                                          />
                                          <div>
                                            <p className="font-medium">{item.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                              {new Date(item.date).toLocaleDateString('pt-BR')}
                                            </p>
                                          </div>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </CardContent>
                              </Card>
                              <Card>
                                <CardContent className="p-4 space-y-3">
                                  <p className="text-sm font-medium">Eventos vinculados</p>
                                  {selectedEventIds.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">Nenhum evento selecionado.</p>
                                  ) : (
                                    <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                                      {selectedEventIds.map((eventId) => {
                                        const foundEvent = events.find((item) => item.id === eventId);
                                        return <li key={eventId}>{foundEvent?.name ?? eventId}</li>;
                                      })}
                                    </ul>
                                  )}
                                </CardContent>
                              </Card>
                            </div>
                          )}
                        </TabsContent>

                        <TabsContent value="cpfs" className="mt-0 space-y-4">
                          <Card>
                            <CardContent className="p-4 space-y-4">
                              <p className="text-sm font-medium">Adicionar CPF elegível</p>
                              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                <div className="space-y-1">
                                  <Label>CPF</Label>
                                  <Input
                                    placeholder="000.000.000-00"
                                    value={cpfForm.cpf}
                                    onChange={(e) => setCpfForm({ ...cpfForm, cpf: e.target.value })}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>Nome (opcional)</Label>
                                  <Input
                                    value={cpfForm.full_name}
                                    onChange={(e) => setCpfForm({ ...cpfForm, full_name: e.target.value })}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>Status</Label>
                                  <Select
                                    value={cpfForm.status}
                                    onValueChange={(value: BenefitProgramStatus) =>
                                      setCpfForm({ ...cpfForm, status: value })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="ativo">Ativo</SelectItem>
                                      <SelectItem value="inativo">Inativo</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label>Vigência inicial</Label>
                                  <Input
                                    type="date"
                                    value={cpfForm.valid_from}
                                    onChange={(e) => setCpfForm({ ...cpfForm, valid_from: e.target.value })}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>Vigência final</Label>
                                  <Input
                                    type="date"
                                    value={cpfForm.valid_until}
                                    onChange={(e) => setCpfForm({ ...cpfForm, valid_until: e.target.value })}
                                  />
                                </div>
                                <div className="space-y-1 lg:col-span-3">
                                  <Label>Observação</Label>
                                  <Textarea
                                    rows={2}
                                    value={cpfForm.notes}
                                    onChange={(e) => setCpfForm({ ...cpfForm, notes: e.target.value })}
                                  />
                                </div>
                              </div>
                              <Button type="button" onClick={handleAddCpf} disabled={cpfSaving}>
                                {cpfSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                                Adicionar CPF
                              </Button>
                            </CardContent>
                          </Card>

                          <Card>
                            <CardContent className="p-4 space-y-3">
                              <p className="text-sm font-medium">Importação rápida por colagem (CSV futuro)</p>
                              <p className="text-xs text-muted-foreground">
                                Cole uma lista de CPFs separados por quebra de linha, vírgula ou ponto e vírgula.
                                Nesta primeira etapa, a importação por arquivo CSV fica preparada para evolução futura.
                              </p>
                              <Textarea
                                rows={4}
                                value={bulkCpfText}
                                onChange={(e) => setBulkCpfText(e.target.value)}
                                placeholder={'00000000000\n11111111111'}
                              />
                              <Button type="button" variant="outline" onClick={handleBulkCpfAdd}>
                                Importar lista de CPFs
                              </Button>
                            </CardContent>
                          </Card>

                          {!editingId && pendingCpfs.length > 0 && (
                            <Card>
                              <CardContent className="p-4 space-y-2">
                                <p className="text-sm font-medium">CPFs pendentes (serão salvos ao criar o programa)</p>
                                <div className="flex flex-wrap gap-2">
                                  {pendingCpfs.map((cpf) => (
                                    <span key={cpf} className="rounded-full border px-2 py-1 text-xs">
                                      {formatCpfMask(cpf)}
                                    </span>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          )}

                          {editingId && (
                            <Card>
                              <CardContent className="p-4">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>CPF</TableHead>
                                      <TableHead>Nome</TableHead>
                                      <TableHead>Vigência</TableHead>
                                      <TableHead>Status</TableHead>
                                      <TableHead className="w-[80px]">Ações</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {(programs.find((program) => program.id === editingId)?.eligible_cpf ?? []).map((record) => (
                                      <TableRow key={record.id}>
                                        <TableCell>{formatCpfMask(record.cpf)}</TableCell>
                                        <TableCell>{record.full_name ?? '—'}</TableCell>
                                        <TableCell>
                                          {record.valid_from || record.valid_until
                                            ? `${record.valid_from ? new Date(record.valid_from).toLocaleDateString('pt-BR') : '—'} até ${record.valid_until ? new Date(record.valid_until).toLocaleDateString('pt-BR') : '—'}`
                                            : 'Sem vigência'}
                                        </TableCell>
                                        <TableCell>
                                          <StatusBadge
                                            status={record.status === 'ativo' ? 'active' : 'inactive'}
                                            customLabel={record.status === 'ativo' ? 'Ativo' : 'Inativo'}
                                          />
                                        </TableCell>
                                        <TableCell>
                                          <ActionsDropdown
                                            actions={[
                                              {
                                                label: record.status === 'ativo' ? 'Inativar' : 'Ativar',
                                                icon: Power,
                                                onClick: () => handleToggleCpfStatus(record),
                                                variant: record.status === 'ativo' ? 'destructive' : 'default',
                                              },
                                            ]}
                                          />
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </CardContent>
                            </Card>
                          )}
                        </TabsContent>
                      </div>
                    </Tabs>

                    <div className="admin-modal__footer px-6 py-4">
                      <div className="flex justify-end gap-3">
                        <DialogClose asChild>
                          <Button type="button" variant="outline">
                            Cancelar
                          </Button>
                        </DialogClose>
                        <Button type="submit" disabled={saving}>
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                        </Button>
                      </div>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
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
                icon={Gift}
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
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {program.description || 'Sem descrição'}
                        </p>
                      </TableCell>
                      <TableCell>{benefitTypeLabel[program.benefit_type]}</TableCell>
                      <TableCell>{formatBenefitValue(program)}</TableCell>
                      <TableCell>
                        {program.applies_to_all_events
                          ? 'Todos os eventos'
                          : `${program.event_links.length} evento(s)`}
                      </TableCell>
                      <TableCell>
                        {program.valid_from || program.valid_until
                          ? `${program.valid_from ? new Date(program.valid_from).toLocaleDateString('pt-BR') : '—'} até ${program.valid_until ? new Date(program.valid_until).toLocaleDateString('pt-BR') : '—'}`
                          : 'Sem vigência'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={program.status === 'ativo' ? 'active' : 'inactive'}
                          customLabel={program.status === 'ativo' ? 'Ativo' : 'Inativo'}
                        />
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
