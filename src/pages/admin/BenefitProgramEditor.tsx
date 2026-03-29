import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { PageHeader } from '@/components/admin/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ActionsDropdown, type ActionItem } from '@/components/admin/ActionsDropdown';
import {
  BenefitProgram,
  BenefitProgramEligibleCpf,
  BenefitProgramStatus,
  BenefitType,
  Event,
} from '@/types/database';
import { isValidCpfDigits, normalizeCpfDigits } from '@/lib/benefitEligibility';
import { ArrowLeft, Calendar, FileSpreadsheet, FileUp, Loader2, Pencil, Plus, Power, Save, Trash2, Users } from 'lucide-react';

interface BenefitProgramWithRelations extends BenefitProgram {
  event_links: Array<{ event_id: string; event?: { name: string | null } | null }>;
  eligible_cpf: BenefitProgramEligibleCpf[];
}

type EligibleCpfDraft = Pick<
  BenefitProgramEligibleCpf,
  'cpf' | 'full_name' | 'status' | 'valid_from' | 'valid_until' | 'notes'
>;

type ImportSummary = {
  totalLidas: number;
  validas: number;
  invalidas: number;
  duplicadasNoArquivo: number;
  jaExistentesNoPrograma: number;
  importadasComSucesso: number;
  erros: string[];
};

const IMPORT_EXPECTED_COLUMNS = ['CPF', 'Nome', 'Status', 'VigenciaInicial', 'VigenciaFinal', 'Observacao'] as const;

const normalizeHeader = (header: string) =>
  header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');

const toIsoDateFromParts = (year: number, month: number, day: number): string => {
  // Comentário: valida calendário para impedir datas inválidas (ex.: 31/02/2026) na importação.
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() + 1 !== month ||
    candidate.getUTCDate() !== day
  ) {
    return '';
  }
  const normalizedMonth = String(month).padStart(2, '0');
  const normalizedDay = String(day).padStart(2, '0');
  return `${year}-${normalizedMonth}-${normalizedDay}`;
};

const toIsoDateOrEmpty = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return '';
    return toIsoDateFromParts(parsed.y, parsed.m, parsed.d);
  }
  const text = String(value).trim();
  if (!text) return '';
  const isoLike = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoLike) {
    return toIsoDateFromParts(Number(isoLike[1]), Number(isoLike[2]), Number(isoLike[3]));
  }
  const brLike = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (brLike) {
    // Comentário: no formato com ano no final, assumimos padrão brasileiro (DD/MM/AAAA).
    return toIsoDateFromParts(Number(brLike[3]), Number(brLike[2]), Number(brLike[1]));
  }
  return '';
};

const normalizeStatus = (value: unknown): BenefitProgramStatus => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  return normalized === 'inativo' ? 'inativo' : 'ativo';
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

const benefitTypeHint: Record<BenefitType, string> = {
  percentual: 'Percentual = desconto sobre o valor da passagem.',
  valor_fixo: 'Valor fixo = desconto em reais.',
  preco_final: 'Preço final = valor final da passagem para elegíveis.',
};

export default function BenefitProgramEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isGerente, isDeveloper, activeCompanyId } = useAuth();

  const [loadingProgram, setLoadingProgram] = useState(!isNew);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cpfSaving, setCpfSaving] = useState(false);
  const [importingCpfFile, setImportingCpfFile] = useState(false);

  const [program, setProgram] = useState<BenefitProgramWithRelations | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [activeTab, setActiveTab] = useState<'dados' | 'eventos' | 'cpfs'>(() => {
    const tab = searchParams.get('tab');
    return tab === 'eventos' || tab === 'cpfs' ? tab : 'dados';
  });

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
  const [editingCpfId, setEditingCpfId] = useState<string | null>(null);
  const [bulkCpfText, setBulkCpfText] = useState('');
  const [cpfListSearch, setCpfListSearch] = useState('');
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [pendingCpfs, setPendingCpfs] = useState<EligibleCpfDraft[]>([]);
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [manualCpfModalOpen, setManualCpfModalOpen] = useState(false);
  const [bulkImportModalOpen, setBulkImportModalOpen] = useState(false);

  const eventsRef = useRef<HTMLDivElement | null>(null);
  const cpfsRef = useRef<HTMLDivElement | null>(null);

  const canAccess = isGerente || isDeveloper;

  const eligibleCpfRows = useMemo(() => {
    if (!isNew) return program?.eligible_cpf ?? [];
    return pendingCpfs.map((item, index) => ({
      id: `pending-${index}`,
      company_id: activeCompanyId ?? '',
      benefit_program_id: id ?? '',
      cpf: item.cpf,
      full_name: item.full_name,
      status: item.status,
      valid_from: item.valid_from,
      valid_until: item.valid_until,
      notes: item.notes,
      created_at: '',
      updated_at: '',
    }));
  }, [activeCompanyId, id, isNew, pendingCpfs, program?.eligible_cpf]);

  const filteredEligibleCpfRows = useMemo(() => {
    const term = cpfListSearch.trim().toLowerCase();
    if (!term) return eligibleCpfRows;
    return eligibleCpfRows.filter((record) => {
      const maskedCpf = formatCpfMask(record.cpf);
      return (
        record.cpf.includes(term.replace(/\D/g, '')) ||
        maskedCpf.toLowerCase().includes(term) ||
        (record.full_name ?? '').toLowerCase().includes(term)
      );
    });
  }, [cpfListSearch, eligibleCpfRows]);

  const cpfStats = useMemo(() => {
    const total = eligibleCpfRows.length;
    const ativos = eligibleCpfRows.filter((record) => record.status === 'ativo').length;
    return { total, ativos, inativos: total - ativos };
  }, [eligibleCpfRows]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'eventos' || tab === 'cpfs' || tab === 'dados') {
      setActiveTab(tab);
      return;
    }
    if (tab) {
      // Comentário: mantém navegação previsível mesmo com query param inválido vindo de link externo/bookmark.
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        params.set('tab', 'dados');
        return params;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    // Comentário: foco contextual da navegação dedicada; substitui o comportamento anterior de abrir aba em modal.
    if (activeTab === 'eventos' && eventsRef.current) {
      eventsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (activeTab === 'cpfs' && cpfsRef.current) {
      cpfsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeTab]);

  const fetchEvents = async () => {
    if (!activeCompanyId) return;
    setLoadingEvents(true);

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('company_id', activeCompanyId)
      .order('date', { ascending: false })
      .limit(300);

    if (error) {
      toast.error('Não foi possível carregar eventos da empresa.');
    } else {
      setEvents((data ?? []) as Event[]);
    }

    setLoadingEvents(false);
  };

  const fetchProgram = async () => {
    if (!activeCompanyId || isNew || !id) return;
    setLoadingProgram(true);

    // Comentário: leitura sempre escopada por company_id para manter isolamento multiempresa.
    const { data, error } = await supabase
      .from('benefit_programs')
      .select(`
        *,
        event_links:benefit_program_event_links!benefit_program_event_links_benefit_program_id_fkey(
          event_id,
          event:events!benefit_program_event_links_event_id_fkey(name)
        ),
        eligible_cpf:benefit_program_eligible_cpf!benefit_program_eligible_cpf_benefit_program_id_fkey(*)
      `)
      .eq('id', id)
      .eq('company_id', activeCompanyId)
      .maybeSingle();

    if (error || !data) {
      toast.error('Não foi possível carregar o programa de benefício.');
      navigate('/admin/programas-beneficio', { replace: true });
      return;
    }

    const resolved = data as BenefitProgramWithRelations;
    setProgram(resolved);
    setForm({
      name: resolved.name,
      description: resolved.description ?? '',
      status: resolved.status,
      benefit_type: resolved.benefit_type,
      benefit_value: String(resolved.benefit_value),
      valid_from: resolved.valid_from ?? '',
      valid_until: resolved.valid_until ?? '',
      applies_to_all_events: resolved.applies_to_all_events,
    });
    setSelectedEventIds(resolved.event_links.map((link) => link.event_id));
    setLoadingProgram(false);
  };

  useEffect(() => {
    if (activeCompanyId) {
      void fetchEvents();
      void fetchProgram();
    }
  }, [activeCompanyId, id]);

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

  const submitProgram = async () => {
    if (!activeCompanyId) return;
    if (!validateProgramForm()) return;

    setSaveFeedback(null);
    setSaving(true);

    // Comentário: payload preserva regras existentes; migração é apenas de UX/navegação, não de regra de negócio.
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

    let programId = id ?? null;

    if (isNew) {
      const { data, error } = await supabase
        .from('benefit_programs')
        .insert([payload])
        .select('id')
        .single();

      if (error || !data) {
        toast.error('Não foi possível salvar o programa de benefício.');
        // Comentário: reforça feedback persistente no topo para dar sensação de controle após tentativa de salvamento.
        setSaveFeedback({ type: 'error', message: 'Falha ao salvar. Revise os dados e tente novamente.' });
        setSaving(false);
        return;
      }

      programId = data.id;
    } else {
      const { company_id, ...updatePayload } = payload;
      const { error } = await supabase
        .from('benefit_programs')
        .update(updatePayload)
        .eq('id', id)
        .eq('company_id', activeCompanyId);

      if (error) {
        toast.error('Não foi possível salvar o programa de benefício.');
        // Comentário: mantém o erro visível além do toast para reduzir incerteza operacional no desktop.
        setSaveFeedback({ type: 'error', message: 'Falha ao salvar. Revise os dados e tente novamente.' });
        setSaving(false);
        return;
      }
    }

    const { error: eventLinkError } = await syncProgramEvents(programId!);
    if (eventLinkError) {
      toast.error('Não foi possível atualizar os eventos vinculados do programa.');
      setSaveFeedback({ type: 'error', message: 'Programa salvo parcialmente. Não foi possível atualizar os eventos vinculados.' });
      setSaving(false);
      return;
    }

    if (isNew && pendingCpfs.length > 0) {
      const cpfPayload = pendingCpfs.map((cpfRecord) => ({
        company_id: activeCompanyId,
        benefit_program_id: programId,
        cpf: cpfRecord.cpf,
        full_name: cpfRecord.full_name || null,
        status: cpfRecord.status,
        valid_from: cpfRecord.valid_from || null,
        valid_until: cpfRecord.valid_until || null,
        notes: cpfRecord.notes || null,
      }));
      const { error: cpfInsertError } = await supabase.from('benefit_program_eligible_cpf').insert(cpfPayload);
      if (cpfInsertError) {
        toast.error('Programa salvo, mas houve falha ao inserir parte dos CPFs pendentes.');
      }
    }

    toast.success(isNew ? 'Programa criado com sucesso.' : 'Programa atualizado com sucesso.');
    // Comentário: confirmação visual fixa no contexto da tela dedicada para complementar o toast efêmero.
    setSaveFeedback({ type: 'success', message: isNew ? 'Programa criado com sucesso.' : 'Alterações salvas com sucesso.' });
    setSaving(false);

    // Comentário: após criar, o fluxo segue na rota dedicada de edição para evitar retorno ao modal antigo.
    if (isNew && programId) {
      navigate(`/admin/programas-beneficio/${programId}`, { replace: true });
      return;
    }

    await fetchProgram();
  };

  const handleToggleProgramStatus = async () => {
    if (!id || !activeCompanyId || !program) return;
    const nextStatus: BenefitProgramStatus = program.status === 'ativo' ? 'inativo' : 'ativo';
    const { error } = await supabase
      .from('benefit_programs')
      .update({ status: nextStatus })
      .eq('id', id)
      .eq('company_id', activeCompanyId);

    if (error) {
      toast.error('Não foi possível atualizar o status do programa.');
      return;
    }

    toast.success(nextStatus === 'ativo' ? 'Programa ativado.' : 'Programa inativado.');
    await fetchProgram();
  };

  const handleEditCpfRecord = (record: BenefitProgramEligibleCpf) => {
    setCpfForm({
      cpf: formatCpfMask(record.cpf),
      full_name: record.full_name ?? '',
      status: record.status,
      valid_from: record.valid_from ?? '',
      valid_until: record.valid_until ?? '',
      notes: record.notes ?? '',
    });
    setEditingCpfId(record.id);
    // Comentário: ao editar pela tabela, abrimos o mesmo formulário já existente no modal para evitar duplicação de fluxo.
    setManualCpfModalOpen(true);
  };

  const resetCpfFormState = () => {
    setEditingCpfId(null);
    setCpfForm({ cpf: '', full_name: '', status: 'ativo', valid_from: '', valid_until: '', notes: '' });
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

    if (isNew || !id) {
      if (pendingCpfs.some((pendingItem) => pendingItem.cpf === normalizedCpf)) {
        toast.error('Este CPF já foi adicionado na lista pendente.');
        return;
      }
      setPendingCpfs((prev) => [
        ...prev,
        {
          cpf: normalizedCpf,
          full_name: cpfForm.full_name.trim() || null,
          status: cpfForm.status,
          valid_from: cpfForm.valid_from || null,
          valid_until: cpfForm.valid_until || null,
          notes: cpfForm.notes.trim() || null,
        },
      ]);
      resetCpfFormState();
      toast.success('CPF adicionado na lista pendente.');
      return;
    }

    setCpfSaving(true);
    const payload = {
      company_id: activeCompanyId,
      benefit_program_id: id,
      cpf: normalizedCpf,
      full_name: cpfForm.full_name.trim() || null,
      status: cpfForm.status,
      valid_from: cpfForm.valid_from || null,
      valid_until: cpfForm.valid_until || null,
      notes: cpfForm.notes.trim() || null,
    };

    const { error } = editingCpfId
      ? await supabase
          .from('benefit_program_eligible_cpf')
          .update(payload)
          .eq('id', editingCpfId)
          .eq('company_id', activeCompanyId)
      : await supabase.from('benefit_program_eligible_cpf').insert([payload]);

    setCpfSaving(false);

    if (error) {
      const duplicate = error.message.includes('uq_benefit_program_eligible_cpf_program_cpf');
      toast.error(duplicate ? 'Este CPF já está vinculado a este programa.' : 'Não foi possível salvar o CPF elegível.');
      return;
    }

    resetCpfFormState();
    toast.success(editingCpfId ? 'CPF elegível atualizado com sucesso.' : 'CPF elegível adicionado com sucesso.');
    await fetchProgram();
  };

  const handleRemoveCpfRecord = async (record: BenefitProgramEligibleCpf) => {
    if (!activeCompanyId) return;

    if (isNew || !id) {
      setPendingCpfs((prev) => prev.filter((item) => item.cpf !== record.cpf));
      toast.success('CPF removido da lista pendente.');
      return;
    }

    const { error } = await supabase
      .from('benefit_program_eligible_cpf')
      .delete()
      .eq('id', record.id)
      .eq('company_id', activeCompanyId);

    if (error) {
      toast.error('Não foi possível remover o CPF elegível.');
      return;
    }

    toast.success('CPF elegível removido.');
    await fetchProgram();
  };

  const handleToggleCpfStatus = async (record: BenefitProgramEligibleCpf) => {
    if (!activeCompanyId || isNew) return;
    const nextStatus: BenefitProgramStatus = record.status === 'ativo' ? 'inativo' : 'ativo';
    const { error } = await supabase
      .from('benefit_program_eligible_cpf')
      .update({ status: nextStatus })
      .eq('id', record.id)
      .eq('company_id', activeCompanyId);

    if (error) {
      toast.error('Não foi possível atualizar o status do CPF elegível.');
      return;
    }

    toast.success(nextStatus === 'ativo' ? 'CPF ativado.' : 'CPF inativado.');
    await fetchProgram();
  };

  const handleBulkCpfAdd = async () => {
    if (!bulkCpfText.trim()) return;

    const cpfs = parseBulkCpfs(bulkCpfText);
    if (cpfs.length === 0) {
      toast.error('Nenhum CPF válido encontrado na lista informada.');
      return;
    }

    if (isNew || !id) {
      const pendingCpfSet = new Set(pendingCpfs.map((item) => item.cpf));
      const next = [...pendingCpfs];
      cpfs.forEach((cpf) => {
        if (!pendingCpfSet.has(cpf)) {
          next.push({
            cpf,
            full_name: null,
            status: 'ativo',
            valid_from: null,
            valid_until: null,
            notes: null,
          });
          pendingCpfSet.add(cpf);
        }
      });
      setPendingCpfs(next);
      setBulkCpfText('');
      toast.success(`${cpfs.length} CPF(s) adicionados na lista pendente.`);
      return;
    }

    const payload = cpfs.map((cpf) => ({
      company_id: activeCompanyId!,
      benefit_program_id: id,
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
    await fetchProgram();
  };

  const handleDownloadCpfTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      [...IMPORT_EXPECTED_COLUMNS],
      // Comentário: exemplo no padrão brasileiro para guiar o preenchimento no Excel (DD/MM/AAAA).
      ['12345678909', 'Nome opcional', 'ativo', '28/03/2026', '31/12/2026', 'Observação opcional'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ModeloCPFs');
    XLSX.writeFile(wb, 'modelo-cpfs-elegiveis.xlsx');
  };

  const applyImportedCpfRows = async (rows: EligibleCpfDraft[], summary: ImportSummary) => {
    if (rows.length === 0) {
      setImportSummary(summary);
      toast.error('Nenhum CPF válido para importar.');
      return;
    }

    if (isNew || !id) {
      const pendingSet = new Set(pendingCpfs.map((item) => item.cpf));
      let imported = 0;
      const next = [...pendingCpfs];
      rows.forEach((row) => {
        if (!pendingSet.has(row.cpf)) {
          next.push(row);
          pendingSet.add(row.cpf);
          imported += 1;
        } else {
          summary.jaExistentesNoPrograma += 1;
        }
      });
      summary.importadasComSucesso = imported;
      setPendingCpfs(next);
      setImportSummary(summary);
      toast.success(`${imported} CPF(s) adicionados na lista pendente.`);
      return;
    }

    const payload = rows.map((row) => ({
      company_id: activeCompanyId!,
      benefit_program_id: id,
      cpf: row.cpf,
      full_name: row.full_name || null,
      status: row.status,
      valid_from: row.valid_from || null,
      valid_until: row.valid_until || null,
      notes: row.notes || null,
    }));

    const { error } = await supabase
      .from('benefit_program_eligible_cpf')
      .upsert(payload, { onConflict: 'benefit_program_id,cpf', ignoreDuplicates: true });

    if (error) {
      toast.error('Não foi possível importar o arquivo de CPFs.');
      return;
    }

    summary.importadasComSucesso = rows.length;
    setImportSummary(summary);
    toast.success(`${rows.length} CPF(s) importados com sucesso.`);
    await fetchProgram();
  };

  const handleCpfFileImport = async (file: File | null) => {
    if (!file || !activeCompanyId) return;

    setImportingCpfFile(true);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        toast.error('Arquivo sem conteúdo válido.');
        setImportingCpfFile(false);
        return;
      }

      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' });
      if (rawRows.length === 0) {
        toast.error('Arquivo sem linhas para importação.');
        setImportingCpfFile(false);
        return;
      }

      const firstRowHeaders = Object.keys(rawRows[0]);
      const headerMap = new Map(firstRowHeaders.map((key) => [normalizeHeader(key), key]));
      const cpfKey = headerMap.get(normalizeHeader('CPF'));
      if (!cpfKey) {
        toast.error('Coluna CPF obrigatória não encontrada no arquivo.');
        setImportingCpfFile(false);
        return;
      }

      const summary: ImportSummary = {
        totalLidas: rawRows.length,
        validas: 0,
        invalidas: 0,
        duplicadasNoArquivo: 0,
        jaExistentesNoPrograma: 0,
        importadasComSucesso: 0,
        erros: [],
      };

      const existingCpfSet = new Set(eligibleCpfRows.map((item) => item.cpf));
      const seenFileCpf = new Set<string>();
      const parsedRows: EligibleCpfDraft[] = [];

      rawRows.forEach((row, index) => {
        const rowNumber = index + 2;
        const cpfRaw = String(row[cpfKey] ?? '').trim();
        const normalizedCpf = normalizeCpfDigits(cpfRaw);
        const nameKey = headerMap.get(normalizeHeader('Nome'));
        const statusKey = headerMap.get(normalizeHeader('Status'));
        const startKey = headerMap.get(normalizeHeader('VigenciaInicial'));
        const endKey = headerMap.get(normalizeHeader('VigenciaFinal'));
        const notesKey = headerMap.get(normalizeHeader('Observacao'));

        const fullName = String((nameKey ? row[nameKey] : '') ?? '').trim();
        const validFrom = toIsoDateOrEmpty(startKey ? row[startKey] : '');
        const validUntil = toIsoDateOrEmpty(endKey ? row[endKey] : '');
        const notes = String((notesKey ? row[notesKey] : '') ?? '').trim();
        const hasAnyValue =
          cpfRaw || fullName || String(statusKey ? row[statusKey] : '').trim() || validFrom || validUntil || notes;

        if (!hasAnyValue) {
          summary.totalLidas -= 1;
          return;
        }

        if (!isValidCpfDigits(normalizedCpf)) {
          summary.invalidas += 1;
          summary.erros.push(`Linha ${rowNumber}: CPF inválido.`);
          return;
        }

        if (validFrom && validUntil && validUntil < validFrom) {
          summary.invalidas += 1;
          summary.erros.push(`Linha ${rowNumber}: Vigência final menor que inicial.`);
          return;
        }

        if (seenFileCpf.has(normalizedCpf)) {
          summary.duplicadasNoArquivo += 1;
          return;
        }
        seenFileCpf.add(normalizedCpf);

        if (existingCpfSet.has(normalizedCpf)) {
          summary.jaExistentesNoPrograma += 1;
          return;
        }

        parsedRows.push({
          cpf: normalizedCpf,
          full_name: fullName || null,
          status: normalizeStatus(statusKey ? row[statusKey] : ''),
          valid_from: validFrom || null,
          valid_until: validUntil || null,
          notes: notes || null,
        });
        summary.validas += 1;
      });

      await applyImportedCpfRows(parsedRows, summary);
    } catch {
      toast.error('Falha ao ler o arquivo. Verifique se está em formato CSV ou XLSX.');
    } finally {
      setImportingCpfFile(false);
    }
  };

  const cpfRowActions = (record: BenefitProgramEligibleCpf): ActionItem[] => {
    const actions: ActionItem[] = [
      { label: 'Editar', icon: Pencil, onClick: () => handleEditCpfRecord(record) },
      {
        label: record.status === 'ativo' ? 'Inativar' : 'Ativar',
        icon: Power,
        onClick: () => void handleToggleCpfStatus(record),
        variant: record.status === 'ativo' ? 'destructive' : 'default',
      },
      {
        label: 'Remover',
        icon: Trash2,
        onClick: () => void handleRemoveCpfRecord(record),
        variant: 'destructive',
      },
    ];

    if (isNew) {
      actions.splice(1, 1);
    }

    return actions;
  };

  if (!canAccess) return <Navigate to="/admin/eventos" replace />;

  if (!activeCompanyId) {
    return (
      <AdminLayout>
        <div className="page-container">Selecione uma empresa ativa para gerenciar programas de benefício.</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="page-container space-y-6">
        <PageHeader
          title={isNew ? 'Novo Programa de Benefício' : program?.name || 'Editar Programa de Benefício'}
          description={isNew ? 'Criação de programa: defina regras, eventos e elegibilidade por CPF.' : 'Edição de programa: ajuste dados, eventos e elegibilidade com controle centralizado.'}
          actions={
            <>
              <Button asChild variant="outline" size="sm">
                <Link to="/admin/programas-beneficio">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Link>
              </Button>
              {!isNew && program && (
                <Button size="sm" variant={program.status === 'ativo' ? 'destructive' : 'outline'} onClick={handleToggleProgramStatus}>
                  <Power className="mr-2 h-4 w-4" />
                  {program.status === 'ativo' ? 'Inativar' : 'Ativar'}
                </Button>
              )}
              <Button size="sm" onClick={() => void submitProgram()} disabled={saving || loadingProgram}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </>
          }
        />
        {/* Comentário: bloco compacto de contexto para reforçar modo (criação/edição), status e confiança no salvamento. */}
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Modo:</span>
              <span className="font-medium">{isNew ? 'Criação' : 'Edição'}</span>
              {!isNew && program && (
                <>
                  <span className="text-muted-foreground">• Status:</span>
                  <StatusBadge status={program.status === 'ativo' ? 'ativo' : 'inativo'} />
                </>
              )}
              {!isNew && program?.updated_at && (
                <span className="text-muted-foreground">
                  • Última atualização: {new Date(program.updated_at).toLocaleString('pt-BR')}
                </span>
              )}
            </div>
            {saveFeedback && (
              <p className={`text-xs font-medium ${saveFeedback.type === 'success' ? 'text-emerald-600' : 'text-destructive'}`}>
                {saveFeedback.message}
              </p>
            )}
          </CardContent>
        </Card>

        {(loadingProgram && !isNew) ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">Carregando programa...</CardContent>
          </Card>
        ) : (
          // Comentário: estrutura dedicada substitui o modal gigante, mantendo os mesmos blocos funcionais.
          <Tabs value={activeTab} onValueChange={(value) => {
            const next = value as 'dados' | 'eventos' | 'cpfs';
            setActiveTab(next);
            setSearchParams((prev) => {
              const params = new URLSearchParams(prev);
              params.set('tab', next);
              return params;
            }, { replace: true });
          }} className="space-y-4">
            {/* Comentário: tabs com tratamento de container de página (sem estética de modal) para reforçar hierarquia da tela dedicada. */}
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-lg border bg-muted/20 p-2">
              {/* Comentário: contraste e espaçamento das tabs ajustados para leitura rápida no desktop administrativo. */}
              <TabsTrigger value="dados" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Dados do programa</TabsTrigger>
              <TabsTrigger value="eventos" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Eventos</TabsTrigger>
              <TabsTrigger value="cpfs" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">CPFs elegíveis</TabsTrigger>
            </TabsList>

            <TabsContent value="dados" className="space-y-4 mt-0">
              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Dados do programa</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Nome do programa</Label>
                      <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Descrição</Label>
                      <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Configuração do benefício</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={form.status} onValueChange={(value: BenefitProgramStatus) => setForm({ ...form, status: value })}>
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
                      <Select value={form.benefit_type} onValueChange={(value: BenefitType) => setForm({ ...form, benefit_type: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentual">Percentual</SelectItem>
                          <SelectItem value="valor_fixo">Valor fixo</SelectItem>
                          <SelectItem value="preco_final">Preço final</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">{benefitTypeHint[form.benefit_type]}</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Valor do benefício</Label>
                      <Input type="number" min="0" step="0.01" value={form.benefit_value} onChange={(e) => setForm({ ...form, benefit_value: e.target.value })} required />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Vigência</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Vigência inicial</Label>
                      <Input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Vigência final</Label>
                      <Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Aplicação</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Label>Aplicar para todos os eventos?</Label>
                    <div className="flex min-h-10 items-center rounded-md border px-3 py-2">
                      <Checkbox checked={form.applies_to_all_events} onCheckedChange={(checked) => setForm({ ...form, applies_to_all_events: Boolean(checked) })} />
                      <span className="ml-3 text-sm text-muted-foreground">Deixe esta opção marcada para aplicar o benefício em todos os eventos.</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="eventos" className="mt-0" ref={eventsRef}>
              <Card>
                <CardHeader>
                  <CardTitle>Eventos vinculados</CardTitle>
                </CardHeader>
                <CardContent>
                  {form.applies_to_all_events ? (
                    <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                      Este programa está configurado para todos os eventos. Desmarque a opção na aba “Dados do programa” para selecionar eventos específicos.
                    </div>
                  ) : (
                    <div className="grid gap-4 xl:grid-cols-2">
                      <div className="rounded-md border p-4 space-y-3">
                        <p className="text-sm font-medium">Selecionar eventos da empresa</p>
                        <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                          {loadingEvents ? (
                            <p className="text-sm text-muted-foreground">Carregando eventos...</p>
                          ) : events.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nenhum evento encontrado para a empresa.</p>
                          ) : events.map((item) => {
                            const checked = selectedEventIds.includes(item.id);
                            return (
                              <label key={item.id} className="flex items-start gap-2 rounded border p-2 text-sm">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(status) => {
                                    if (status) {
                                      setSelectedEventIds((prev) => [...prev, item.id]);
                                    } else {
                                      setSelectedEventIds((prev) => prev.filter((eventId) => eventId !== item.id));
                                    }
                                  }}
                                />
                                <div>
                                  <p className="font-medium">{item.name}</p>
                                  <p className="text-xs text-muted-foreground">{new Date(item.date).toLocaleDateString('pt-BR')}</p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div className="rounded-md border p-4 space-y-3">
                        <p className="text-sm font-medium">Resumo de vínculos</p>
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
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="cpfs" className="space-y-4 mt-0" ref={cpfsRef}>
              <Card>
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>CPFs elegíveis</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Total: {cpfStats.total} • Ativos: {cpfStats.ativos} • Inativos: {cpfStats.inativos}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={handleDownloadCpfTemplate}>
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      Baixar modelo
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Comentário: micro-resumo operacional para orientar rapidamente manutenção manual, importação e consulta. */}
                  <div className="grid gap-2 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground md:grid-cols-3">
                    <p><strong className="text-foreground">Cadastro manual:</strong> use para incluir ou editar um CPF individual.</p>
                    <p><strong className="text-foreground">Importação:</strong> use CSV/XLSX ou colagem rápida para lote.</p>
                    <p><strong className="text-foreground">Consulta:</strong> pesquise por CPF/nome e gerencie status na tabela.</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {/* Comentário: ação dedicada para abrir o formulário manual em modal, mantendo a listagem como foco principal da aba. */}
                    <Button type="button" variant="outline" onClick={() => setManualCpfModalOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Cadastrar CPF manualmente
                    </Button>
                    {/* Comentário: ação dedicada para abrir o fluxo existente de importação em um modal separado. */}
                    <Button type="button" variant="outline" onClick={() => setBulkImportModalOpen(true)}>
                      <FileUp className="h-4 w-4 mr-2" />
                      Importar CPFs
                    </Button>
                  </div>

                  <div className="space-y-3 rounded-md border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{isNew ? 'CPFs pendentes para salvar no programa' : 'CPFs cadastrados no programa'}</p>
                      <Input className="w-full sm:w-72" placeholder="Buscar por CPF ou nome..." value={cpfListSearch} onChange={(e) => setCpfListSearch(e.target.value)} />
                    </div>
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>CPF</TableHead>
                            <TableHead>Nome</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Vigência</TableHead>
                            <TableHead>Observação</TableHead>
                            <TableHead className="w-[80px]">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredEligibleCpfRows.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Nenhum CPF encontrado para os filtros informados.</TableCell>
                            </TableRow>
                          ) : (
                            filteredEligibleCpfRows.map((record) => (
                              <TableRow key={record.id}>
                                <TableCell>{formatCpfMask(record.cpf)}</TableCell>
                                <TableCell>{record.full_name ?? '—'}</TableCell>
                                <TableCell><StatusBadge status={record.status === 'ativo' ? 'ativo' : 'inativo'} /></TableCell>
                                <TableCell>
                                  {record.valid_from || record.valid_until
                                    ? `${record.valid_from ? new Date(record.valid_from).toLocaleDateString('pt-BR') : '—'} até ${record.valid_until ? new Date(record.valid_until).toLocaleDateString('pt-BR') : '—'}`
                                    : 'Sem vigência'}
                                </TableCell>
                                <TableCell className="max-w-[260px] truncate">{record.notes?.trim() ? record.notes : '—'}</TableCell>
                                <TableCell><ActionsDropdown actions={cpfRowActions(record)} /></TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <Dialog
                    open={manualCpfModalOpen}
                    onOpenChange={(open) => {
                      setManualCpfModalOpen(open);
                      if (!open && !cpfSaving) resetCpfFormState();
                    }}
                  >
                    <DialogContent className="sm:max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>{editingCpfId ? 'Editar CPF elegível' : 'Cadastro manual de CPF'}</DialogTitle>
                        <DialogDescription>
                          Reaproveita o mesmo formulário e validações existentes da aba de CPFs elegíveis.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3">
                        {/* Comentário: grade em 6 colunas para manter Status + Vigência inicial + Vigência final na mesma linha em telas com espaço. */}
                        <div className="grid gap-3 sm:grid-cols-6">
                          <div className="space-y-1 sm:col-span-3">
                            <Label>CPF</Label>
                            <Input placeholder="000.000.000-00" value={cpfForm.cpf} onChange={(e) => setCpfForm({ ...cpfForm, cpf: e.target.value })} />
                            <p className="text-xs text-muted-foreground">Aceita CPF com ou sem pontos/traço. Ex.: 123.456.789-09 ou 12345678909.</p>
                          </div>
                          <div className="space-y-1 sm:col-span-3">
                            <Label>Nome (opcional)</Label>
                            <Input value={cpfForm.full_name} onChange={(e) => setCpfForm({ ...cpfForm, full_name: e.target.value })} />
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label>Status</Label>
                            <Select value={cpfForm.status} onValueChange={(value: BenefitProgramStatus) => setCpfForm({ ...cpfForm, status: value })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ativo">Ativo</SelectItem>
                                <SelectItem value="inativo">Inativo</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label>Vigência inicial</Label>
                            <Input type="date" value={cpfForm.valid_from} onChange={(e) => setCpfForm({ ...cpfForm, valid_from: e.target.value })} />
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label>Vigência final</Label>
                            <Input type="date" value={cpfForm.valid_until} onChange={(e) => setCpfForm({ ...cpfForm, valid_until: e.target.value })} />
                          </div>
                          <div className="space-y-1 sm:col-span-6">
                            <Label>Observação</Label>
                            <Textarea rows={2} value={cpfForm.notes} onChange={(e) => setCpfForm({ ...cpfForm, notes: e.target.value })} />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" onClick={() => void handleAddCpf()} disabled={cpfSaving}>
                            {cpfSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : editingCpfId ? <Pencil className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                            {editingCpfId ? 'Salvar edição do CPF' : 'Adicionar CPF'}
                          </Button>
                          {editingCpfId && (
                            <Button type="button" variant="outline" onClick={resetCpfFormState}>
                              Cancelar edição
                            </Button>
                          )}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={bulkImportModalOpen} onOpenChange={setBulkImportModalOpen}>
                    <DialogContent className="sm:max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Importação em massa (CSV/XLSX)</DialogTitle>
                        <DialogDescription>
                          Reaproveita o fluxo atual de arquivo e colagem rápida sem alterar regras de importação.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">Baixe o modelo padrão, preencha no Excel e importe. O sistema aceita CPF com ou sem máscara, normaliza para 11 dígitos e valida vigência/duplicidades.</p>
                        <Input
                          type="file"
                          accept=".csv,.xlsx"
                          disabled={importingCpfFile}
                          onChange={(event) => {
                            const selectedFile = event.target.files?.[0] ?? null;
                            void handleCpfFileImport(selectedFile);
                            event.currentTarget.value = '';
                          }}
                          className="max-w-sm"
                        />
                        {importingCpfFile && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                        <div className="rounded-md border p-3">
                          <p className="text-xs font-medium mb-2">Colagem rápida</p>
                          <Textarea rows={4} value={bulkCpfText} onChange={(e) => setBulkCpfText(e.target.value)} placeholder={'00000000000\n11111111111'} />
                          <p className="mt-2 text-xs text-muted-foreground">Você pode colar CPFs com pontuação (.) e (-); o sistema remove a máscara automaticamente.</p>
                          <Button type="button" variant="outline" className="mt-2" onClick={handleBulkCpfAdd}>
                            <FileUp className="h-4 w-4 mr-2" />
                            Importar por colagem
                          </Button>
                        </div>
                        {importSummary && (
                          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
                            <p className="font-medium">Resumo da importação</p>
                            <p>Total de linhas lidas: {importSummary.totalLidas}</p>
                            <p>Válidas: {importSummary.validas}</p>
                            <p>Inválidas: {importSummary.invalidas}</p>
                            <p>Duplicadas no arquivo: {importSummary.duplicadasNoArquivo}</p>
                            <p>Já existentes no programa: {importSummary.jaExistentesNoPrograma}</p>
                            <p>Importadas com sucesso: {importSummary.importadasComSucesso}</p>
                            {importSummary.erros.length > 0 && (
                              <p className="text-destructive">Exemplo de erro: {importSummary.erros[0]}{importSummary.erros.length > 1 ? ` (+${importSummary.erros.length - 1})` : ''}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AdminLayout>
  );
}
