import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Eye, FileText, Info, Loader2, Pencil, ShieldCheck } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export type EventTermSelectionMode = 'company_current_at_publish' | 'specific_version';
export type EventTermType =
  | 'termos_servico'
  | 'politica_cancelamento'
  | 'politica_reembolso'
  | 'regras_embarque'
  | 'regras_evento'
  | 'personalizado';

type CompanyTerm = {
  id: string;
  company_id: string;
  title: string;
  term_type: EventTermType;
  status: string;
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
  term_type: EventTermType;
  content: string;
  summary: string | null;
  status: 'published';
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type PublishedTerm = CompanyTerm & {
  versions: CompanyTermVersion[];
};

type EventTermLink = {
  id: string;
  company_id: string;
  event_id: string;
  term_id: string;
  term_version_id: string;
  selection_mode: EventTermSelectionMode;
  acceptance_required: boolean;
  created_at: string;
  updated_at: string;
  term?: CompanyTerm;
  version?: CompanyTermVersion;
};

type LinkFormState = {
  termId: string;
  selectionMode: EventTermSelectionMode;
  versionId: string;
  acceptanceRequired: boolean;
  editingLinkId: string | null;
};

interface EventTermsTabProps {
  eventId: string | null;
  companyId: string | null;
  isReadOnly: boolean;
  onLinksCountChange?: (count: number) => void;
}

const initialLinkForm: LinkFormState = {
  termId: '',
  selectionMode: 'company_current_at_publish',
  versionId: '',
  acceptanceRequired: false,
  editingLinkId: null,
};

const termTypeLabels: Record<EventTermType, string> = {
  termos_servico: 'Termos de Serviço',
  politica_cancelamento: 'Política de Cancelamento',
  politica_reembolso: 'Política de Reembolso',
  regras_embarque: 'Regras de Embarque',
  regras_evento: 'Regras do Evento',
  personalizado: 'Personalizado',
};

const selectionModeLabels: Record<EventTermSelectionMode, string> = {
  company_current_at_publish: 'Usar versão vigente da empresa',
  specific_version: 'Selecionar versão específica',
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
};

const getFriendlyLinkErrorMessage = (error: unknown) => {
  const message = typeof error === 'object' && error && 'message' in error ? String((error as { message?: string }).message) : '';
  const normalized = message.toLowerCase();

  if (normalized.includes('only published term versions can be linked')) {
    return 'Não é possível vincular versões em rascunho, inativas ou inválidas. Selecione uma versão publicada.';
  }

  if (normalized.includes('term version does not belong') || normalized.includes('foreign key')) {
    return 'Não foi possível salvar o vínculo. Verifique se o termo pertence à empresa do evento.';
  }

  if (normalized.includes('duplicate') || normalized.includes('unique')) {
    return 'Este termo já está vinculado ao evento. Edite o vínculo existente para trocar a versão.';
  }

  if (normalized.includes('row-level security') || normalized.includes('permission denied')) {
    return 'Não foi possível concluir a ação. Verifique se o termo pertence à empresa ativa e se seu perfil tem permissão.';
  }

  return 'Não foi possível salvar o vínculo. Verifique se o termo pertence à empresa do evento.';
};

export function EventTermsTab({ eventId, companyId, isReadOnly, onLinksCountChange }: EventTermsTabProps) {
  const { user, isGerente, isDeveloper } = useAuth();
  const canManage = (isGerente || isDeveloper) && !isReadOnly;
  // A migration da Fase 1 ainda não foi refletida nos tipos gerados; mantemos o acesso isolado neste componente.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  const [publishedTerms, setPublishedTerms] = useState<PublishedTerm[]>([]);
  const [links, setLinks] = useState<EventTermLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<LinkFormState>(initialLinkForm);
  const [contentDialog, setContentDialog] = useState<{ term: CompanyTerm; version: CompanyTermVersion } | null>(null);

  const selectedTerm = useMemo(
    () => publishedTerms.find((term) => term.id === form.termId) ?? null,
    [publishedTerms, form.termId],
  );

  const resolvedVersion = useMemo(() => {
    if (!selectedTerm) return null;
    if (form.selectionMode === 'company_current_at_publish') {
      return selectedTerm.versions.find((version) => version.id === selectedTerm.current_version_id) ?? null;
    }
    return selectedTerm.versions.find((version) => version.id === form.versionId) ?? null;
  }, [form.selectionMode, form.versionId, selectedTerm]);

  const fetchEventTerms = useCallback(async () => {
    if (!companyId || !eventId) {
      setPublishedTerms([]);
      setLinks([]);
      onLinksCountChange?.(0);
      return;
    }

    setLoading(true);

    const { data: termRows, error: termsError } = await supabaseAny
      .from('company_terms')
      .select('*')
      .eq('company_id', companyId)
      .order('title', { ascending: true });

    if (termsError) {
      logSupabaseError({
        label: 'Erro ao listar termos publicados para evento (company_terms.select)',
        error: termsError,
        context: { action: 'select', table: 'company_terms', companyId, eventId, userId: user?.id },
      });
      toast.error(buildDebugToastMessage({ title: 'Erro ao carregar termos publicados', error: termsError }));
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
        .eq('status', 'published')
        .in('term_id', termIds)
        .order('version_number', { ascending: false });

      if (versionsError) {
        logSupabaseError({
          label: 'Erro ao listar versões publicadas para evento (company_term_versions.select)',
          error: versionsError,
          context: { action: 'select', table: 'company_term_versions', companyId, eventId, userId: user?.id },
        });
        toast.error(buildDebugToastMessage({ title: 'Erro ao carregar versões publicadas', error: versionsError }));
      } else {
        versionRows = versionsData ?? [];
      }
    }

    const termsWithPublishedVersions = (termRows ?? [])
      .map((term: CompanyTerm) => ({
        ...term,
        versions: versionRows.filter((version) => version.term_id === term.id),
      }))
      .filter((term: PublishedTerm) => term.versions.length > 0);

    const { data: linkRows, error: linksError } = await supabaseAny
      .from('event_term_links')
      .select('*')
      .eq('company_id', companyId)
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });

    if (linksError) {
      logSupabaseError({
        label: 'Erro ao listar vínculos de termos do evento (event_term_links.select)',
        error: linksError,
        context: { action: 'select', table: 'event_term_links', companyId, eventId, userId: user?.id },
      });
      toast.error(buildDebugToastMessage({ title: 'Erro ao carregar vínculos do evento', error: linksError }));
    }

    const eventTermLinks = (linkRows ?? []) as EventTermLink[];
    const allLinkedTermIds = Array.from(new Set(eventTermLinks.map((link) => link.term_id)));
    const allLinkedVersionIds = Array.from(new Set(eventTermLinks.map((link) => link.term_version_id)));

    const linkedTermsById = new Map<string, CompanyTerm>();
    const linkedVersionsById = new Map<string, CompanyTermVersion>();

    termsWithPublishedVersions.forEach((term: PublishedTerm) => {
      linkedTermsById.set(term.id, term);
      term.versions.forEach((version) => linkedVersionsById.set(version.id, version));
    });

    if (allLinkedTermIds.length > 0) {
      const missingTermIds = allLinkedTermIds.filter((termId) => !linkedTermsById.has(termId));
      if (missingTermIds.length > 0) {
        const { data: linkedTermsData } = await supabaseAny
          .from('company_terms')
          .select('*')
          .eq('company_id', companyId)
          .in('id', missingTermIds);
        (linkedTermsData ?? []).forEach((term: CompanyTerm) => linkedTermsById.set(term.id, term));
      }
    }

    if (allLinkedVersionIds.length > 0) {
      const missingVersionIds = allLinkedVersionIds.filter((versionId) => !linkedVersionsById.has(versionId));
      if (missingVersionIds.length > 0) {
        const { data: linkedVersionsData } = await supabaseAny
          .from('company_term_versions')
          .select('*')
          .eq('company_id', companyId)
          .in('id', missingVersionIds);
        (linkedVersionsData ?? []).forEach((version: CompanyTermVersion) => linkedVersionsById.set(version.id, version));
      }
    }

    const mergedLinks = eventTermLinks.map((link) => ({
      ...link,
      term: linkedTermsById.get(link.term_id),
      version: linkedVersionsById.get(link.term_version_id),
    }));

    setPublishedTerms(termsWithPublishedVersions);
    setLinks(mergedLinks);
    onLinksCountChange?.(mergedLinks.length);
    setLoading(false);
  }, [companyId, eventId, onLinksCountChange, supabaseAny, user?.id]);

  useEffect(() => {
    fetchEventTerms();
  }, [fetchEventTerms]);

  useEffect(() => {
    if (!selectedTerm) return;
    if (form.selectionMode === 'company_current_at_publish') {
      setForm((prev) => ({ ...prev, versionId: selectedTerm.current_version_id ?? '' }));
      return;
    }

    const selectedVersionBelongsToTerm = selectedTerm.versions.some((version) => version.id === form.versionId);
    if (!selectedVersionBelongsToTerm) {
      setForm((prev) => ({ ...prev, versionId: selectedTerm.versions[0]?.id ?? '' }));
    }
  }, [form.selectionMode, form.versionId, selectedTerm]);

  const addAuditLog = async ({
    termId,
    versionId,
    action,
    description,
    metadata,
  }: {
    termId: string;
    versionId: string;
    action: string;
    description: string;
    metadata?: Record<string, unknown>;
  }) => {
    if (!companyId || !eventId) return;

    const { error } = await supabaseAny.from('company_term_audit_logs').insert({
      company_id: companyId,
      term_id: termId,
      term_version_id: versionId,
      event_id: eventId,
      action,
      description,
      performed_by: user?.id ?? null,
      metadata: metadata ?? null,
    });

    if (error) {
      logSupabaseError({
        label: 'Erro ao registrar auditoria de vínculo de termo (company_term_audit_logs.insert)',
        error,
        context: { action: 'insert', table: 'company_term_audit_logs', companyId, eventId, termId, versionId, userId: user?.id },
      });
      toast.warning('O vínculo foi salvo, mas o registro de auditoria não pôde ser salvo agora.');
    }
  };

  const resetLinkForm = () => {
    setForm(initialLinkForm);
  };

  const handleEditLink = (link: EventTermLink) => {
    setForm({
      termId: link.term_id,
      selectionMode: link.selection_mode,
      versionId: link.term_version_id,
      acceptanceRequired: link.acceptance_required,
      editingLinkId: link.id,
    });
  };

  const validateLinkForm = () => {
    if (!companyId || !eventId) {
      toast.error('Salve o evento na aba Geral antes de vincular termos.');
      return false;
    }

    if (!selectedTerm) {
      toast.error('Selecione um termo publicado da empresa.');
      return false;
    }

    if (selectedTerm.company_id !== companyId) {
      toast.error('Não foi possível salvar o vínculo. Verifique se o termo pertence à empresa do evento.');
      return false;
    }

    if (form.selectionMode === 'company_current_at_publish' && !resolvedVersion) {
      toast.error('Este termo ainda não possui versão vigente publicada.');
      return false;
    }

    if (form.selectionMode === 'specific_version' && !resolvedVersion) {
      toast.error('Para exigir aceite no checkout, selecione uma versão publicada dos termos.');
      return false;
    }

    if (form.acceptanceRequired && !resolvedVersion) {
      toast.error('Para exigir aceite no checkout, selecione uma versão publicada dos termos.');
      return false;
    }

    if (resolvedVersion.status !== 'published' || resolvedVersion.company_id !== companyId || resolvedVersion.term_id !== selectedTerm.id) {
      toast.error('Não é possível vincular versões em rascunho, inativas ou inválidas. Selecione uma versão publicada.');
      return false;
    }

    const duplicatedTermLink = links.find((link) => link.term_id === selectedTerm.id && link.id !== form.editingLinkId);
    if (duplicatedTermLink) {
      toast.error('Este termo já está vinculado ao evento. Edite o vínculo existente para trocar a versão.');
      return false;
    }

    return true;
  };

  const handleSaveLink = async () => {
    if (!canManage) {
      toast.error('Somente gerentes podem criar ou alterar vínculos de termos do evento.');
      return;
    }

    if (!validateLinkForm() || !selectedTerm || !resolvedVersion || !companyId || !eventId) return;

    setSaving(true);

    const payload = {
      company_id: companyId,
      event_id: eventId,
      term_id: selectedTerm.id,
      term_version_id: resolvedVersion.id,
      selection_mode: form.selectionMode,
      acceptance_required: form.acceptanceRequired,
      linked_by: user?.id ?? null,
    };

    try {
      const existingLink = links.find((link) => link.id === form.editingLinkId || link.term_id === selectedTerm.id) ?? null;
      const { error } = existingLink
        ? await supabaseAny.from('event_term_links').update(payload).eq('id', existingLink.id).eq('company_id', companyId).eq('event_id', eventId)
        : await supabaseAny.from('event_term_links').insert(payload);

      if (error) throw error;

      await addAuditLog({
        termId: selectedTerm.id,
        versionId: resolvedVersion.id,
        action: existingLink ? 'event_term_link_updated' : 'event_term_link_created',
        description: existingLink
          ? `Vínculo do termo “${selectedTerm.title}” atualizado para a versão ${resolvedVersion.version_number}.`
          : `Termo “${selectedTerm.title}” vinculado ao evento com a versão ${resolvedVersion.version_number}.`,
        metadata: {
          selection_mode: form.selectionMode,
          acceptance_required: form.acceptanceRequired,
          previous_version_id: existingLink?.term_version_id ?? null,
          previous_selection_mode: existingLink?.selection_mode ?? null,
        },
      });

      toast.success(existingLink ? 'Vínculo de termo atualizado.' : 'Termo vinculado ao evento.');
      resetLinkForm();
      await fetchEventTerms();
    } catch (error) {
      logSupabaseError({
        label: 'Erro ao salvar vínculo de termo do evento (event_term_links.insert/update)',
        error,
        context: { action: form.editingLinkId ? 'update' : 'insert', table: 'event_term_links', companyId, eventId, termId: selectedTerm.id, versionId: resolvedVersion.id, userId: user?.id },
      });
      toast.error(getFriendlyLinkErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const buildActions = (link: EventTermLink): ActionItem[] => [
    {
      label: 'Visualizar conteúdo',
      icon: Eye,
      disabled: !link.term || !link.version,
      onClick: () => link.term && link.version && setContentDialog({ term: link.term, version: link.version }),
    },
    {
      label: 'Editar vínculo',
      icon: Pencil,
      disabled: !canManage,
      onClick: () => handleEditLink(link),
    },
  ];

  if (!eventId) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<FileText className="h-8 w-8 text-muted-foreground" />}
          title="Salve o evento primeiro"
          description="A aba Termos e Políticas fica disponível depois que o evento existir na empresa ativa."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <div>
        <h3 className="text-lg font-semibold">Termos e Políticas do Evento</h3>
        <p className="text-sm text-muted-foreground">
          Defina quais termos da empresa serão aplicados a este evento. O aceite do comprador será exigido no checkout nas próximas etapas.
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          O evento guarda a versão efetiva selecionada. Se a empresa publicar novos termos depois, este evento não será alterado automaticamente.
          Nesta fase, vínculos existentes podem ser editados; a remoção/desvinculação segura ficará para fase futura porque depende de decisão de modelagem/RLS.
        </AlertDescription>
      </Alert>

      {!canManage && !isReadOnly && (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            Seu perfil pode visualizar os vínculos do evento, mas apenas gerentes podem criar ou alterar termos e políticas.
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando termos publicados...
          </CardContent>
        </Card>
      ) : publishedTerms.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8 text-muted-foreground" />}
          title="Nenhum termo publicado encontrado para esta empresa."
          description="Cadastre e publique termos na aba Termos e Políticas da empresa antes de vinculá-los ao evento."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{form.editingLinkId ? 'Editar vínculo de termo' : 'Adicionar termo ao evento'}</CardTitle>
            <CardDescription>
              Selecione somente versões publicadas da empresa ativa. Rascunhos e versões inativas não aparecem nesta etapa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Termo publicado</Label>
                <Select
                  value={form.termId || undefined}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, termId: value, versionId: '' }))}
                  disabled={!canManage || saving || Boolean(form.editingLinkId)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um termo publicado da empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {publishedTerms.map((term) => (
                      <SelectItem key={term.id} value={term.id}>
                        {term.title} • {termTypeLabels[term.term_type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Modo de seleção</Label>
                <Select
                  value={form.selectionMode}
                  onValueChange={(value: EventTermSelectionMode) => setForm((prev) => ({ ...prev, selectionMode: value, versionId: '' }))}
                  disabled={!canManage || saving || !selectedTerm}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company_current_at_publish">Usar versão vigente da empresa</SelectItem>
                    <SelectItem value="specific_version">Selecionar versão específica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedTerm && form.selectionMode === 'specific_version' && (
              <div className="space-y-2">
                <Label>Versão publicada</Label>
                <Select
                  value={form.versionId || undefined}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, versionId: value }))}
                  disabled={!canManage || saving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma versão publicada" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedTerm.versions.map((version) => (
                      <SelectItem key={version.id} value={version.id}>
                        v{version.version_number} • publicada em {formatDateTime(version.published_at)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedTerm && form.selectionMode === 'company_current_at_publish' && !resolvedVersion && (
              <Alert variant="destructive">
                <AlertDescription>Este termo ainda não possui versão vigente publicada.</AlertDescription>
              </Alert>
            )}

            <div className="flex items-start justify-between gap-4 rounded-md border p-3">
              <div className="space-y-1">
                <Label>Exigir aceite dos termos no checkout</Label>
                <p className="text-sm text-muted-foreground">
                  Nesta fase a configuração fica salva no evento; o checkbox público do checkout será implementado na Fase 4.
                </p>
              </div>
              <Switch
                checked={form.acceptanceRequired}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, acceptanceRequired: checked }))}
                disabled={!canManage || saving}
              />
            </div>

            {selectedTerm && resolvedVersion && (
              <Card className="bg-muted/30">
                <CardContent className="space-y-3 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{selectedTerm.title}</span>
                    <Badge variant="secondary">{termTypeLabels[selectedTerm.term_type]}</Badge>
                    <Badge>v{resolvedVersion.version_number}</Badge>
                    <Badge variant="outline">Publicado</Badge>
                    {selectedTerm.current_version_id === resolvedVersion.id && <Badge variant="secondary">Vigente</Badge>}
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div><span className="text-muted-foreground">Publicada em:</span> {formatDateTime(resolvedVersion.published_at)}</div>
                    <div><span className="text-muted-foreground">Modo:</span> {selectionModeLabels[form.selectionMode]}</div>
                  </div>
                  {resolvedVersion.summary && (
                    <div className="rounded-md border bg-background p-3">
                      <span className="font-medium">Resumo:</span> {resolvedVersion.summary}
                    </div>
                  )}
                  <p className="text-muted-foreground">
                    Esta versão será usada como referência do evento. Alterações futuras nos termos da empresa não alteram automaticamente este vínculo.
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={() => setContentDialog({ term: selectedTerm, version: resolvedVersion })}>
                    <Eye className="mr-2 h-4 w-4" /> Visualizar conteúdo completo
                  </Button>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end gap-2">
              {form.editingLinkId && (
                <Button type="button" variant="outline" onClick={resetLinkForm} disabled={saving}>
                  Cancelar edição
                </Button>
              )}
              <Button type="button" onClick={handleSaveLink} disabled={!canManage || saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar vínculo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Vínculos atuais</CardTitle>
          <CardDescription>Termos e políticas já definidos para este evento. Use Editar vínculo para trocar a versão; remoção segura fica para fase futura.</CardDescription>
        </CardHeader>
        <CardContent>
          {links.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum termo vinculado ao evento. O evento pode continuar sem termos se o aceite obrigatório não estiver configurado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Termo</TableHead>
                  <TableHead>Versão</TableHead>
                  <TableHead>Modo</TableHead>
                  <TableHead>Aceite</TableHead>
                  <TableHead>Atualizado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell>
                      <div className="font-medium">{link.term?.title ?? 'Termo não encontrado'}</div>
                      <div className="text-xs text-muted-foreground">{link.term ? termTypeLabels[link.term.term_type] : 'Verifique RLS/empresa ativa'}</div>
                    </TableCell>
                    <TableCell>
                      {link.version ? (
                        <div className="space-y-1">
                          <div>v{link.version.version_number}</div>
                          <div className="text-xs text-muted-foreground">{formatDateTime(link.version.published_at)}</div>
                        </div>
                      ) : '—'}
                    </TableCell>
                    <TableCell>{selectionModeLabels[link.selection_mode]}</TableCell>
                    <TableCell>
                      <Badge variant={link.acceptance_required ? 'default' : 'secondary'}>
                        {link.acceptance_required ? 'Obrigatório' : 'Não obrigatório'}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(link.updated_at)}</TableCell>
                    <TableCell className="text-right">
                      <ActionsDropdown actions={buildActions(link)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(contentDialog)} onOpenChange={(open) => !open && setContentDialog(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{contentDialog?.version.title}</DialogTitle>
            <DialogDescription>
              {contentDialog ? `${termTypeLabels[contentDialog.term.term_type]} • versão ${contentDialog.version.version_number}` : ''}
            </DialogDescription>
          </DialogHeader>

          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertDescription>
              Esta é a versão vinculada ou selecionada para o evento em modo leitura. O aceite público será tratado apenas na Fase 4.
            </AlertDescription>
          </Alert>

          {contentDialog?.version.summary && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <strong>Resumo:</strong> {contentDialog.version.summary}
            </div>
          )}

          <div className="whitespace-pre-wrap rounded-md border p-4 text-sm leading-relaxed">
            {contentDialog?.version.content}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setContentDialog(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
