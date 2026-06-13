import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Clock, Copy, Eye, FileText, History, Loader2, Pencil, Plus, Send, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { buildDebugToastMessage, logSupabaseError } from '@/lib/errorDebug';
import { ActionsDropdown, type ActionItem } from '@/components/admin/ActionsDropdown';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

export type CompanyTermType =
  | 'termos_servico'
  | 'politica_cancelamento'
  | 'politica_reembolso'
  | 'regras_embarque'
  | 'regras_evento'
  | 'personalizado';

export type CompanyTermStatus = 'rascunho' | 'vigente' | 'substituido' | 'inativo';
export type CompanyTermVersionStatus = 'draft' | 'published' | 'superseded' | 'inactive';

type CompanyTerm = {
  id: string;
  company_id: string;
  title: string;
  term_type: CompanyTermType;
  status: CompanyTermStatus;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
};

type CompanyTermVersion = {
  id: string;
  company_id: string;
  term_id: string;
  version_number: number;
  title: string;
  term_type: CompanyTermType;
  content: string;
  summary: string | null;
  status: CompanyTermVersionStatus;
  published_at: string | null;
  published_by: string | null;
  internal_note: string | null;
  created_at: string;
  updated_at: string;
};

type CompanyTermWithVersions = CompanyTerm & {
  versions: CompanyTermVersion[];
};

const TERMS_UNSAVED_MESSAGE = 'Há alterações não salvas em Termos e Políticas. Deseja descartar o conteúdo digitado?';
const getTermDraftKey = (companyId: string, termId?: string | null) => `company_terms_draft:${companyId}:${termId || 'new'}`;

type TermFormState = {
  title: string;
  term_type: CompanyTermType;
  content: string;
  summary: string;
  internal_note: string;
};

type FormMode =
  | { type: 'create' }
  | { type: 'edit'; term: CompanyTermWithVersions; version: CompanyTermVersion }
  | { type: 'recover'; term: CompanyTermWithVersions };

type ContentDialogState = {
  term: CompanyTermWithVersions;
  version: CompanyTermVersion;
};

type HistoryDialogState = {
  term: CompanyTermWithVersions;
};

interface CompanyTermsTabProps {
  companyId: string | null;
}

const initialForm: TermFormState = {
  title: '',
  term_type: 'termos_servico',
  content: '',
  summary: '',
  internal_note: '',
};

const termTypeLabels: Record<CompanyTermType, string> = {
  termos_servico: 'Termos de Serviço',
  politica_cancelamento: 'Política de Cancelamento',
  politica_reembolso: 'Política de Reembolso',
  regras_embarque: 'Regras de Embarque',
  regras_evento: 'Regras do Evento',
  personalizado: 'Personalizado',
};

const termStatusLabels: Record<CompanyTermStatus, string> = {
  rascunho: 'Rascunho',
  vigente: 'Vigente',
  substituido: 'Substituído',
  inativo: 'Inativo',
};

const versionStatusLabels: Record<CompanyTermVersionStatus, string> = {
  draft: 'Rascunho',
  published: 'Publicado',
  superseded: 'Substituído',
  inactive: 'Inativo',
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
};

const getFriendlyErrorMessage = (error: unknown, fallback: string) => {
  const message = typeof error === 'object' && error && 'message' in error ? String((error as { message?: string }).message) : '';
  const normalized = message.toLowerCase();

  if (normalized.includes('duplicate') || normalized.includes('unique')) {
    return 'Já existe um termo com este título e tipo para esta empresa. Abra o termo existente para editar ou criar uma nova versão.';
  }

  if (normalized.includes('published term versions are immutable')) {
    return 'Esta versão já foi publicada e não pode ser editada. Crie uma nova versão para alterar o conteúdo.';
  }

  if (normalized.includes('term already has an initial version')) {
    return 'Este termo já foi recuperado em outra tentativa. Atualize a página para ver a versão criada.';
  }

  if (normalized.includes('term is not eligible for draft recovery')) {
    return 'Este termo não está elegível para recuperação. Atualize a página e verifique se ele ainda é um rascunho sem versões.';
  }

  if (normalized.includes('term content is required') || normalized.includes('content_not_blank')) {
    return 'Informe o conteúdo do termo antes de salvar.';
  }

  if (normalized.includes('current version must be published') || normalized.includes('current_version_required')) {
    return 'Não é possível marcar como vigente uma versão que ainda não foi publicada.';
  }

  if (normalized.includes('row-level security') || normalized.includes('permission denied')) {
    return 'Não foi possível concluir a ação. Verifique se o termo pertence à empresa ativa e se seu perfil tem permissão.';
  }

  return fallback;
};

export function CompanyTermsTab({ companyId }: CompanyTermsTabProps) {
  const { user, isGerente, isDeveloper } = useAuth();
  const canManage = isGerente || isDeveloper;
  // A migration da Fase 1 ainda não foi refletida no arquivo gerado do Supabase; mantemos o acesso isolado nesta aba.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  const [terms, setTerms] = useState<CompanyTermWithVersions[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [form, setForm] = useState<TermFormState>(initialForm);
  const [historyDialog, setHistoryDialog] = useState<HistoryDialogState | null>(null);
  const [contentDialog, setContentDialog] = useState<ContentDialogState | null>(null);
  const [detailTerm, setDetailTerm] = useState<CompanyTermWithVersions | null>(null);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const draftHydratedRef = useRef(false);

  const currentDraftKey = companyId && formMode
    ? getTermDraftKey(companyId, formMode.type === 'edit' ? formMode.version.id : null)
    : null;

  const updateForm = (updater: (prev: TermFormState) => TermFormState) => {
    setForm((prev) => updater(prev));
    setIsFormDirty(true);
  };

  const closeFormSafely = () => {
    if (isFormDirty && !window.confirm(TERMS_UNSAVED_MESSAGE)) return;
    setFormMode(null);
    setIsFormDirty(false);
  };

  const fetchTerms = useCallback(async () => {
    if (!companyId) {
      setTerms([]);
      return;
    }

    setLoading(true);

    const { data: termRows, error: termsError } = await supabaseAny
      .from('company_terms')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (termsError) {
      logSupabaseError({
        label: 'Erro ao listar termos da empresa (company_terms.select)',
        error: termsError,
        context: { action: 'select', table: 'company_terms', companyId, userId: user?.id },
      });
      toast.error(buildDebugToastMessage({ title: 'Erro ao carregar termos', error: termsError }));
      setLoading(false);
      return;
    }

    const termIds = (termRows ?? []).map((term: CompanyTerm) => term.id);
    let versionRows: CompanyTermVersion[] = [];

    if (termIds.length > 0) {
      const { data: versionsData, error: versionsError } = await supabaseAny
        .from('company_term_versions')
        .select('*')
        .eq('company_id', companyId)
        .in('term_id', termIds)
        .order('version_number', { ascending: false });

      if (versionsError) {
        logSupabaseError({
          label: 'Erro ao listar versões de termos (company_term_versions.select)',
          error: versionsError,
          context: { action: 'select', table: 'company_term_versions', companyId, userId: user?.id },
        });
        toast.error(buildDebugToastMessage({ title: 'Erro ao carregar versões', error: versionsError }));
      } else {
        versionRows = versionsData ?? [];
      }
    }

    const merged = (termRows ?? []).map((term: CompanyTerm) => ({
      ...term,
      versions: versionRows
        .filter((version) => version.term_id === term.id)
        .sort((a, b) => b.version_number - a.version_number),
    }));

    setTerms(merged);
    setLoading(false);
  }, [companyId, supabaseAny, user?.id]);

  useEffect(() => {
    fetchTerms();
  }, [fetchTerms]);

  const addAuditLog = async ({
    termId,
    versionId,
    action,
    description,
    metadata,
  }: {
    termId?: string | null;
    versionId?: string | null;
    action: string;
    description: string;
    metadata?: Record<string, unknown>;
  }) => {
    if (!companyId) return;

    const { error } = await supabaseAny.from('company_term_audit_logs').insert({
      company_id: companyId,
      term_id: termId ?? null,
      term_version_id: versionId ?? null,
      action,
      description,
      performed_by: user?.id ?? null,
      metadata: metadata ?? null,
    });

    if (error) {
      logSupabaseError({
        label: 'Erro ao registrar auditoria de termo (company_term_audit_logs.insert)',
        error,
        context: { action: 'insert', table: 'company_term_audit_logs', companyId, termId, versionId, userId: user?.id },
      });
      toast.warning('A ação foi concluída, mas o registro de auditoria não pôde ser salvo agora.');
    }
  };

  const openCreateDialog = () => {
    setForm(initialForm);
    setIsFormDirty(false);
    draftHydratedRef.current = false;
    setFormMode({ type: 'create' });
  };

  const openRecoverDialog = (term: CompanyTermWithVersions) => {
    setForm({
      title: term.title,
      term_type: term.term_type,
      content: '',
      summary: '',
      internal_note: '',
    });
    setFormMode({ type: 'recover', term });
  };

  const openEditDialog = (term: CompanyTermWithVersions, version: CompanyTermVersion) => {
    if (version.status !== 'draft') {
      toast.error('Esta versão já foi publicada e não pode ser editada. Crie uma nova versão para alterar o conteúdo.');
      return;
    }

    setForm({
      title: version.title,
      term_type: version.term_type,
      content: version.content,
      summary: version.summary ?? '',
      internal_note: version.internal_note ?? '',
    });
    setIsFormDirty(false);
    draftHydratedRef.current = false;
    setFormMode({ type: 'edit', term, version });
  };



  useEffect(() => {
    if (!currentDraftKey || draftHydratedRef.current) return;

    draftHydratedRef.current = true;
    const storedDraft = sessionStorage.getItem(currentDraftKey);
    if (!storedDraft) return;

    try {
      const parsed = JSON.parse(storedDraft) as Partial<TermFormState>;
      setForm((prev) => ({
        ...prev,
        title: parsed.title ?? prev.title,
        term_type: parsed.term_type ?? prev.term_type,
        content: parsed.content ?? prev.content,
        summary: parsed.summary ?? prev.summary,
        internal_note: parsed.internal_note ?? prev.internal_note,
      }));
      setIsFormDirty(true);
      toast.info('Rascunho local restaurado para evitar perda de conteúdo.');
    } catch {
      sessionStorage.removeItem(currentDraftKey);
    }
  }, [currentDraftKey]);

  useEffect(() => {
    if (!currentDraftKey || !isFormDirty) return;

    // Comentário de manutenção: rascunho temporário isolado por empresa e termo para suportar reload acidental.
    sessionStorage.setItem(currentDraftKey, JSON.stringify(form));
  }, [currentDraftKey, form, isFormDirty]);

  useEffect(() => {
    if (!isFormDirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const handleRefreshRequest = (event: Event) => {
      if (!window.confirm(TERMS_UNSAVED_MESSAGE)) {
        event.preventDefault();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('smartbus:request-refresh', handleRefreshRequest);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('smartbus:request-refresh', handleRefreshRequest);
    };
  }, [isFormDirty]);

  const validateForm = () => {
    if (!companyId) {
      toast.error('Não foi possível identificar a empresa ativa.');
      return false;
    }
    if (!form.title.trim()) {
      toast.error('Informe um título para o termo.');
      return false;
    }
    if (!form.term_type) {
      toast.error('Informe o tipo do termo.');
      return false;
    }
    if (!form.content.trim()) {
      toast.error('Informe o conteúdo antes de salvar.');
      return false;
    }
    return true;
  };

  const handleSaveDraft = async () => {
    if (!canManage) {
      toast.error('Somente gerentes podem gerenciar termos e políticas.');
      return;
    }

    if (!validateForm()) return;

    setSaving(true);

    try {
      if (formMode?.type === 'create') {
        const { data: createdDraft, error: createError } = await supabaseAny.rpc('create_company_term_with_initial_version', {
          p_company_id: companyId,
          p_title: form.title.trim(),
          p_term_type: form.term_type,
          p_content: form.content.trim(),
          p_summary: form.summary.trim() || null,
          p_internal_note: form.internal_note.trim() || null,
        });

        if (createError) throw createError;

        const draftRow = Array.isArray(createdDraft) ? createdDraft[0] : createdDraft;
        const term = { id: draftRow.term_id };
        const version = { id: draftRow.version_id };

        await addAuditLog({
          termId: term.id,
          versionId: version.id,
          action: 'term_created',
          description: `Termo "${form.title.trim()}" criado em rascunho.`,
          metadata: { term_type: form.term_type, version_number: 1 },
        });
        await addAuditLog({
          termId: term.id,
          versionId: version.id,
          action: 'version_created',
          description: 'Primeira versão criada em rascunho.',
          metadata: { version_number: 1 },
        });

        toast.success('Rascunho criado com sucesso.');
      }

      if (formMode?.type === 'recover') {
        const { term } = formMode;

        // Pré-checagem: se já existir versão (criada por outra aba/tentativa anterior), orienta o usuário.
        const { data: existingVersion } = await supabaseAny
          .from('company_term_versions')
          .select('id')
          .eq('company_id', companyId)
          .eq('term_id', term.id)
          .limit(1)
          .maybeSingle();

        if (existingVersion?.id) {
          toast.info('Este termo já foi recuperado em outra tentativa. Atualize a página para ver a versão criada.');
          setIsFormDirty(false);
          setFormMode(null);
          await fetchTerms();
          return;
        }

        let versionId: string | null = null;

        const { data: recoveredDraft, error: recoverError } = await supabaseAny.rpc('recover_company_term_initial_version', {
          p_company_id: companyId,
          p_term_id: term.id,
          p_content: form.content.trim(),
          p_summary: form.summary.trim() || null,
          p_internal_note: form.internal_note.trim() || null,
        });

        if (recoverError) {
          // Fallback resiliente: a RPC pode estar indisponível (cache do PostgREST, schema antigo, hash etc.).
          // Como a RLS de gerente permite inserir em company_term_versions, criamos a versão inicial diretamente.
          logSupabaseError({
            label: 'RPC recover_company_term_initial_version falhou; aplicando fallback client-side',
            error: recoverError,
            context: { action: 'rpc_recover_fallback', companyId, termId: term.id, userId: user?.id },
          });

          const { data: insertedVersion, error: insertError } = await supabaseAny
            .from('company_term_versions')
            .insert({
              company_id: companyId,
              term_id: term.id,
              version_number: 1,
              title: term.title,
              term_type: term.term_type,
              content: form.content.trim(),
              summary: form.summary.trim() || null,
              internal_note: form.internal_note.trim() || null,
              status: 'draft',
              created_by: user?.id ?? null,
              updated_by: user?.id ?? null,
            })
            .select('id')
            .single();

          if (insertError) throw insertError;
          versionId = insertedVersion?.id ?? null;

          // Mantém updated_by/updated_at do termo coerentes com a recuperação.
          await supabaseAny
            .from('company_terms')
            .update({ updated_by: user?.id ?? null })
            .eq('id', term.id)
            .eq('company_id', companyId);
        } else {
          const draftRow = Array.isArray(recoveredDraft) ? recoveredDraft[0] : recoveredDraft;
          versionId = draftRow?.version_id ?? null;
        }

        await addAuditLog({
          termId: term.id,
          versionId,
          action: 'draft_version_recovered',
          description: 'Versão inicial criada para termo em rascunho sem conteúdo vinculado.',
          metadata: { version_number: 1 },
        });

        toast.success('Rascunho recuperado com sucesso.');
      }

      if (formMode?.type === 'edit') {
        const { term, version } = formMode;

        if (version.status !== 'draft') {
          toast.error('Esta versão já foi publicada e não pode ser editada. Crie uma nova versão para alterar o conteúdo.');
          setSaving(false);
          return;
        }

        const { error: termError } = await supabaseAny
          .from('company_terms')
          .update({
            title: form.title.trim(),
            term_type: form.term_type,
            updated_by: user?.id ?? null,
          })
          .eq('id', term.id)
          .eq('company_id', companyId);

        if (termError) throw termError;

        const { error: versionError } = await supabaseAny
          .from('company_term_versions')
          .update({
            title: form.title.trim(),
            term_type: form.term_type,
            content: form.content.trim(),
            summary: form.summary.trim() || null,
            internal_note: form.internal_note.trim() || null,
            updated_by: user?.id ?? null,
          })
          .eq('id', version.id)
          .eq('term_id', term.id)
          .eq('company_id', companyId)
          .eq('status', 'draft');

        if (versionError) throw versionError;

        toast.success('Rascunho atualizado com sucesso.');
      }

      if (currentDraftKey) sessionStorage.removeItem(currentDraftKey);
      setIsFormDirty(false);
      setFormMode(null);
      await fetchTerms();
    } catch (error) {
      logSupabaseError({
        label: 'Erro ao salvar termo/versão em rascunho',
        error,
        context: { action: formMode?.type ?? 'unknown', companyId, userId: user?.id },
      });
      const fallback = formMode?.type === 'recover'
        ? 'Não foi possível recuperar o rascunho. Verifique se o termo pertence à empresa ativa e tente novamente.'
        : 'Não foi possível salvar o rascunho. Verifique se o termo pertence à empresa ativa.';
      toast.error(getFriendlyErrorMessage(error, fallback));
    } finally {
      setSaving(false);
    }
  };

  const markVersionAsCurrent = async (term: CompanyTermWithVersions, version: CompanyTermVersion) => {
    const { error } = await supabaseAny
      .from('company_terms')
      .update({
        current_version_id: version.id,
        status: 'vigente',
        updated_by: user?.id ?? null,
      })
      .eq('id', term.id)
      .eq('company_id', companyId);

    if (error) throw error;

    await addAuditLog({
      termId: term.id,
      versionId: version.id,
      action: 'current_version_changed',
      description: `Versão ${version.version_number} marcada como vigente.`,
      metadata: { version_number: version.version_number },
    });
  };

  const publishVersion = async (term: CompanyTermWithVersions, version: CompanyTermVersion, markCurrentAfterPublish = false) => {
    if (!canManage) {
      toast.error('Somente gerentes podem publicar termos.');
      return;
    }

    if (version.status !== 'draft') {
      toast.error('Somente versões em rascunho podem ser publicadas.');
      return;
    }

    if (!version.content.trim()) {
      toast.error('Informe o conteúdo antes de publicar.');
      return;
    }

    const hasPublishedVersion = term.versions.some((item) => item.status === 'published' && item.id !== version.id);
    if (!markCurrentAfterPublish && hasPublishedVersion) {
      toast.error('Este termo já possui uma versão publicada. Use “Publicar e marcar vigente” para publicar a nova versão com segurança.');
      return;
    }

    const confirmed = window.confirm(
      markCurrentAfterPublish
        ? 'Após publicar, esta versão ficará protegida para auditoria e será marcada como vigente para uso futuro. Para alterar o conteúdo depois, será necessário criar uma nova versão.'
        : 'Após publicar, esta versão ficará protegida para auditoria, mas ainda não será vigente. Para torná-la a versão atual, use “Marcar como vigente”.'
    );

    if (!confirmed) return;

    setSaving(true);

    try {
      const publishedVersions = term.versions.filter((item) => item.status === 'published' && item.id !== version.id);
      for (const publishedVersion of publishedVersions) {
        const { error } = await supabaseAny
          .from('company_term_versions')
          .update({ status: 'superseded', updated_by: user?.id ?? null })
          .eq('id', publishedVersion.id)
          .eq('term_id', term.id)
          .eq('company_id', companyId);

        if (error) throw error;
      }

      const { error: publishError } = await supabaseAny
        .from('company_term_versions')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          published_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        })
        .eq('id', version.id)
        .eq('term_id', term.id)
        .eq('company_id', companyId)
        .eq('status', 'draft');

      if (publishError) throw publishError;

      await addAuditLog({
        termId: term.id,
        versionId: version.id,
        action: 'version_published',
        description: `Versão ${version.version_number} publicada.`,
        metadata: { version_number: version.version_number, marked_current_after_publish: markCurrentAfterPublish },
      });

      if (markCurrentAfterPublish) {
        await markVersionAsCurrent(term, { ...version, status: 'published' });
        toast.success('Versão publicada e marcada como vigente.');
      } else {
        toast.success('Versão publicada, mas ainda não vigente. Use “Marcar como vigente” para torná-la a versão atual.');
      }

      await fetchTerms();
    } catch (error) {
      logSupabaseError({
        label: 'Erro ao publicar versão de termo',
        error,
        context: { action: 'update', table: 'company_term_versions', companyId, termId: term.id, versionId: version.id, userId: user?.id, markCurrentAfterPublish },
      });
      toast.error(getFriendlyErrorMessage(error, 'Não foi possível publicar esta versão. Verifique se ela pertence à empresa ativa.'));
    } finally {
      setSaving(false);
    }
  };

  const createNewVersion = async (term: CompanyTermWithVersions) => {
    if (!canManage) {
      toast.error('Somente gerentes podem criar novas versões.');
      return;
    }

    const existingDraft = term.versions.find((version) => version.status === 'draft');
    if (existingDraft) {
      toast.error('Este termo já possui um rascunho. Edite ou publique o rascunho antes de criar outra versão.');
      return;
    }

    const sourceVersion =
      term.versions.find((version) => version.id === term.current_version_id)
      ?? term.versions.find((version) => version.status === 'published')
      ?? term.versions.find((version) => version.status === 'superseded');

    if (!sourceVersion) {
      toast.error('Publique uma versão antes de criar uma nova versão.');
      return;
    }

    setSaving(true);

    try {
      const nextVersionNumber = Math.max(...term.versions.map((version) => version.version_number), 0) + 1;
      const { data: version, error } = await supabaseAny
        .from('company_term_versions')
        .insert({
          company_id: companyId,
          term_id: term.id,
          version_number: nextVersionNumber,
          title: term.title,
          term_type: term.term_type,
          content: sourceVersion.content,
          summary: sourceVersion.summary,
          internal_note: sourceVersion.internal_note,
          status: 'draft',
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        })
        .select('*')
        .single();

      if (error) throw error;

      await addAuditLog({
        termId: term.id,
        versionId: version.id,
        action: 'new_version_created',
        description: `Nova versão ${nextVersionNumber} criada a partir da versão ${sourceVersion.version_number}.`,
        metadata: { version_number: nextVersionNumber, source_version_id: sourceVersion.id, source_version_number: sourceVersion.version_number },
      });

      toast.success('Nova versão criada em rascunho.');
      await fetchTerms();
    } catch (error) {
      logSupabaseError({
        label: 'Erro ao criar nova versão de termo',
        error,
        context: { action: 'insert', table: 'company_term_versions', companyId, termId: term.id, userId: user?.id },
      });
      toast.error(getFriendlyErrorMessage(error, 'Não foi possível criar a nova versão.'));
    } finally {
      setSaving(false);
    }
  };

  const markAsCurrent = async (term: CompanyTermWithVersions, version: CompanyTermVersion) => {
    if (!canManage) {
      toast.error('Somente gerentes podem marcar a versão vigente.');
      return;
    }

    if (version.status !== 'published') {
      toast.error('Não é possível marcar um rascunho como vigente. Publique a versão antes.');
      return;
    }

    setSaving(true);

    try {
      await markVersionAsCurrent(term, version);
      toast.success('Versão marcada como vigente.');
      await fetchTerms();
    } catch (error) {
      logSupabaseError({
        label: 'Erro ao marcar versão vigente',
        error,
        context: { action: 'update', table: 'company_terms', companyId, termId: term.id, versionId: version.id, userId: user?.id },
      });
      toast.error(getFriendlyErrorMessage(error, 'Não foi possível marcar esta versão como vigente.'));
    } finally {
      setSaving(false);
    }
  };

  const getCurrentVersion = (term: CompanyTermWithVersions) =>
    term.versions.find((version) => version.id === term.current_version_id) ?? null;

  const getEditableDraft = (term: CompanyTermWithVersions) =>
    term.versions.find((version) => version.status === 'draft') ?? null;

  const getPrimaryVersion = (term: CompanyTermWithVersions) =>
    getCurrentVersion(term) ?? term.versions.find((version) => version.status === 'published') ?? term.versions[0] ?? null;

  const isDraftWithoutVersion = (term: CompanyTermWithVersions) =>
    term.status === 'rascunho' && term.versions.length === 0;

  const stats = useMemo(() => {
    return {
      total: terms.length,
      vigentes: terms.filter((term) => term.status === 'vigente').length,
      rascunhos: terms.filter((term) => term.status === 'rascunho' || term.versions.some((version) => version.status === 'draft')).length,
    };
  }, [terms]);

  const buildActions = (term: CompanyTermWithVersions): ActionItem[] => {
    const draft = getEditableDraft(term);
    const draftWithoutVersion = isDraftWithoutVersion(term);
    const primary = getPrimaryVersion(term);
    const publishedToMark = term.versions.find((version) => version.status === 'published' && version.id !== term.current_version_id);
    const hasPublishedVersion = term.versions.some((version) => version.status === 'published');

    return [
      {
        label: 'Ver detalhes',
        icon: Eye,
        onClick: () => setDetailTerm(term),
      },
      {
        label: 'Editar rascunho',
        icon: Pencil,
        disabled: (!draft && !draftWithoutVersion) || !canManage,
        onClick: () => draft ? openEditDialog(term, draft) : draftWithoutVersion && openRecoverDialog(term),
      },
      {
        label: hasPublishedVersion ? 'Publicar versão (use vigente)' : 'Publicar versão',
        icon: Send,
        disabled: !draft || !canManage || hasPublishedVersion,
        onClick: () => draft && publishVersion(term, draft),
      },
      {
        label: 'Publicar e marcar vigente',
        icon: ShieldCheck,
        disabled: !draft || !canManage,
        onClick: () => draft && publishVersion(term, draft, true),
      },
      {
        label: 'Criar nova versão',
        icon: Copy,
        disabled: !canManage || Boolean(draft) || !term.versions.some((version) => version.status === 'published' || version.status === 'superseded'),
        onClick: () => createNewVersion(term),
      },
      {
        label: 'Marcar como vigente',
        icon: ShieldCheck,
        disabled: !publishedToMark || !canManage,
        onClick: () => publishedToMark && markAsCurrent(term, publishedToMark),
      },
      {
        label: 'Ver histórico',
        icon: History,
        onClick: () => setHistoryDialog({ term }),
      },
      {
        label: 'Visualizar conteúdo',
        icon: FileText,
        disabled: !primary,
        onClick: () => primary && setContentDialog({ term, version: primary }),
      },
    ];
  };

  if (!companyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Termos e Políticas</CardTitle>
          <CardDescription>Salve ou selecione uma empresa ativa para gerenciar os termos.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Termos e Políticas</h3>
          <p className="text-sm text-muted-foreground">
            Cadastre e gerencie os termos, políticas de cancelamento e regras de embarque da empresa. Os termos publicados poderão ser vinculados aos eventos nas próximas etapas.
          </p>
        </div>
        <Button type="button" onClick={openCreateDialog} disabled={!canManage || saving}>
          <Plus className="mr-2 h-4 w-4" />
          Novo termo
        </Button>
      </div>

      {!canManage && (
        <Alert>
          <AlertDescription>
            Seu perfil pode visualizar os termos da empresa ativa, mas apenas gerentes podem criar, publicar ou alterar versões.
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <AlertDescription className="space-y-2 text-sm">
          <p><strong>Entenda os status:</strong> rascunho pode ser editado; publicado fica protegido para auditoria, mas ainda não é vigente; vigente é a versão atual da empresa; substituído permanece apenas no histórico.</p>
          <p>Se quiser tornar a versão atual imediatamente, use <strong>Publicar e marcar vigente</strong>. Se publicar sem marcar vigente, use depois a ação <strong>Marcar como vigente</strong>.</p>
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total cadastrado</CardDescription>
            <CardTitle>{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Vigentes</CardDescription>
            <CardTitle>{stats.vigentes}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Com rascunho</CardDescription>
            <CardTitle>{stats.rascunhos}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Termos da empresa ativa</CardTitle>
          <CardDescription>Somente registros vinculados à empresa ativa são carregados nesta listagem.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : terms.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-8 w-8 text-muted-foreground" />}
              title="Nenhum termo cadastrado"
              description="Crie o primeiro termo em rascunho para preparar a publicação nas próximas etapas."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Versão vigente</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead>Atualizado em</TableHead>
                    <TableHead className="w-12 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {terms.map((term) => {
                    const currentVersion = getCurrentVersion(term);
                    const draft = getEditableDraft(term);

                    return (
                      <TableRow key={term.id}>
                        <TableCell>
                          <div className="font-medium">{term.title}</div>
                          {draft && <div className="text-xs text-muted-foreground">Rascunho v{draft.version_number} em edição</div>}
                          {!draft && term.versions.some((version) => version.status === 'published' && version.id !== term.current_version_id) && (
                            <div className="text-xs text-amber-700">Há versão publicada ainda não vigente</div>
                          )}
                        </TableCell>
                        <TableCell>{termTypeLabels[term.term_type]}</TableCell>
                        <TableCell>
                          <Badge variant={term.status === 'vigente' ? 'default' : 'secondary'}>{termStatusLabels[term.status]}</Badge>
                        </TableCell>
                        <TableCell>{currentVersion ? `v${currentVersion.version_number}` : '—'}</TableCell>
                        <TableCell>{formatDateTime(term.created_at)}</TableCell>
                        <TableCell>{formatDateTime(term.updated_at)}</TableCell>
                        <TableCell className="text-right">
                          <ActionsDropdown actions={buildActions(term)} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(formMode)} onOpenChange={(open) => !open && closeFormSafely()}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{formMode?.type === 'create' ? 'Novo termo' : 'Editar rascunho'}</DialogTitle>
            <DialogDescription>
              {formMode?.type === 'recover' ? 'Este termo não possui versão de conteúdo vinculada. Salve o conteúdo para recuperar o rascunho.' : 'Versões em rascunho podem ser editadas. Depois de publicar, o conteúdo fica protegido para auditoria.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="term-title">Título</Label>
                <Input
                  id="term-title"
                  value={form.title}
                  onChange={(event) => updateForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Ex.: Termos gerais da empresa"
                  disabled={formMode?.type === 'recover'}
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.term_type} onValueChange={(value) => setForm((prev) => ({ ...prev, term_type: value as CompanyTermType }))} disabled={formMode?.type === 'recover'}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(termTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="term-summary">Resumo opcional</Label>
              <Textarea
                id="term-summary"
                value={form.summary}
                onChange={(event) => updateForm((prev) => ({ ...prev, summary: event.target.value }))}
                placeholder="Resumo curto para orientar a equipe administrativa"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="term-content">Conteúdo completo</Label>
              <Textarea
                id="term-content"
                value={form.content}
                onChange={(event) => updateForm((prev) => ({ ...prev, content: event.target.value }))}
                placeholder="Digite o conteúdo completo do termo ou política"
                rows={12}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="term-internal-note">Observação interna opcional</Label>
              <Textarea
                id="term-internal-note"
                value={form.internal_note}
                onChange={(event) => updateForm((prev) => ({ ...prev, internal_note: event.target.value }))}
                placeholder="Observação visível apenas para administração"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeFormSafely} disabled={saving}>Cancelar</Button>
            <Button type="button" onClick={handleSaveDraft} disabled={saving || !canManage}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar rascunho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(historyDialog)} onOpenChange={(open) => !open && setHistoryDialog(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico de versões</DialogTitle>
            <DialogDescription>{historyDialog?.term.title}</DialogDescription>
          </DialogHeader>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Versão</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criada em</TableHead>
                <TableHead>Publicada em</TableHead>
                <TableHead>Publicador</TableHead>
                <TableHead>Resumo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyDialog?.term.versions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    Este termo foi criado como rascunho, mas não possui conteúdo vinculado. Clique em "Editar rascunho" para informar o conteúdo e recuperar o termo.
                  </TableCell>
                </TableRow>
              )}
              {historyDialog?.term.versions.map((version) => (
                <TableRow key={version.id}>
                  <TableCell>v{version.version_number}</TableCell>
                  <TableCell><Badge variant="secondary">{versionStatusLabels[version.status]}</Badge></TableCell>
                  <TableCell>{formatDateTime(version.created_at)}</TableCell>
                  <TableCell>{formatDateTime(version.published_at)}</TableCell>
                  <TableCell>{version.published_by ? 'Registrado' : '—'}</TableCell>
                  <TableCell className="max-w-xs truncate">{version.summary || '—'}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => historyDialog && setContentDialog({ term: historyDialog.term, version })}
                    >
                      Ver conteúdo
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(contentDialog)} onOpenChange={(open) => !open && setContentDialog(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{contentDialog?.version.title}</DialogTitle>
            <DialogDescription>
              {contentDialog ? `${termTypeLabels[contentDialog.version.term_type]} • versão ${contentDialog.version.version_number}` : ''}
            </DialogDescription>
          </DialogHeader>

          {contentDialog?.version.status === 'published' && (
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>
                Esta versão está publicada e protegida para auditoria. Vendas futuras ou eventos vinculados podem usar esta versão conforme configuração.
              </AlertDescription>
            </Alert>
          )}

          {contentDialog?.version.status === 'superseded' && (
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription>Esta versão permanece disponível apenas para histórico e auditoria.</AlertDescription>
            </Alert>
          )}

          {contentDialog?.version.summary && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <strong>Resumo:</strong> {contentDialog.version.summary}
            </div>
          )}

          <div className="whitespace-pre-wrap rounded-md border p-4 text-sm leading-relaxed">
            {contentDialog?.version.content}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detailTerm)} onOpenChange={(open) => !open && setDetailTerm(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do termo</DialogTitle>
            <DialogDescription>{detailTerm?.title}</DialogDescription>
          </DialogHeader>

          {detailTerm && (
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div><span className="text-muted-foreground">Tipo:</span> {termTypeLabels[detailTerm.term_type]}</div>
              <div><span className="text-muted-foreground">Status:</span> {termStatusLabels[detailTerm.status]}</div>
              <div><span className="text-muted-foreground">Versão vigente:</span> {getCurrentVersion(detailTerm) ? `v${getCurrentVersion(detailTerm)?.version_number}` : '—'}</div>
              <div><span className="text-muted-foreground">Total de versões:</span> {detailTerm.versions.length}</div>
              <div><span className="text-muted-foreground">Criado em:</span> {formatDateTime(detailTerm.created_at)}</div>
              <div><span className="text-muted-foreground">Atualizado em:</span> {formatDateTime(detailTerm.updated_at)}</div>
              {isDraftWithoutVersion(detailTerm) && (
                <Alert className="sm:col-span-2">
                  <AlertDescription>
                    Este termo foi criado como rascunho, mas não possui conteúdo vinculado. Clique em "Editar rascunho" para informar o conteúdo e recuperar o termo.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
