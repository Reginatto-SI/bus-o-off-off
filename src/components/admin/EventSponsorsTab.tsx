import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sponsor, EventSponsor } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/EmptyState';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Trash2, Star, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

interface EventSponsorsTabProps {
  eventId: string;
  companyId: string;
  isReadOnly?: boolean;
}

export function EventSponsorsTab({ eventId, companyId, isReadOnly }: EventSponsorsTabProps) {
  const [eventSponsors, setEventSponsors] = useState<EventSponsor[]>([]);
  const [availableSponsors, setAvailableSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<EventSponsor | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EventSponsor | null>(null);

  const [form, setForm] = useState({
    sponsor_id: '',
    show_on_event_page: true,
    show_on_showcase: false,
    show_on_ticket: false,
    display_order: '1',
  });

  const fetchData = async () => {
    setLoading(true);
    const [linksRes, sponsorsRes] = await Promise.all([
      supabase
        .from('event_sponsors')
        .select('*, sponsor:sponsors(id, name, banner_url, status)')
        .eq('event_id', eventId)
        .eq('company_id', companyId)
        .order('display_order', { ascending: true }),
      supabase
        .from('sponsors')
        .select('*')
        .eq('company_id', companyId)
        .eq('status', 'ativo')
        .order('name'),
    ]);

    if (linksRes.data) setEventSponsors(linksRes.data as unknown as EventSponsor[]);
    if (sponsorsRes.data) setAvailableSponsors(sponsorsRes.data as Sponsor[]);
    setLoading(false);
  };

  useEffect(() => {
    if (eventId && companyId) fetchData();
  }, [eventId, companyId]);

  const linkedSponsorIds = new Set(eventSponsors.map((es) => es.sponsor_id));
  const unlinkedSponsors = availableSponsors.filter((s) => !linkedSponsorIds.has(s.id));

  const resetForm = () => {
    setEditingLink(null);
    setForm({
      sponsor_id: '',
      show_on_event_page: true,
      show_on_showcase: false,
      show_on_ticket: false,
      display_order: '1',
    });
  };

  const handleOpenAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const handleOpenEdit = (link: EventSponsor) => {
    setEditingLink(link);
    setForm({
      sponsor_id: link.sponsor_id,
      show_on_event_page: link.show_on_event_page,
      show_on_showcase: link.show_on_showcase,
      show_on_ticket: link.show_on_ticket,
      display_order: String(link.display_order),
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    setSaving(true);

    const orderValue = parseInt(form.display_order, 10) || 1;

    if (editingLink) {
      const { error } = await supabase
        .from('event_sponsors')
        .update({
          show_on_event_page: form.show_on_event_page,
          show_on_showcase: form.show_on_showcase,
          show_on_ticket: form.show_on_ticket,
          display_order: orderValue,
        })
        .eq('id', editingLink.id)
        .eq('company_id', companyId);

      if (error) {
        toast.error('Erro ao atualizar vínculo');
      } else {
        toast.success('Vínculo atualizado');
        setDialogOpen(false);
        resetForm();
        fetchData();
      }
    } else {
      if (!form.sponsor_id) {
        toast.error('Selecione um patrocinador');
        setSaving(false);
        return;
      }

      const { error } = await supabase
        .from('event_sponsors')
        .insert({
          event_id: eventId,
          sponsor_id: form.sponsor_id,
          company_id: companyId,
          show_on_event_page: form.show_on_event_page,
          show_on_showcase: form.show_on_showcase,
          show_on_ticket: form.show_on_ticket,
          display_order: orderValue,
        });

      if (error) {
        if (error.code === '23505') {
          toast.error('Este patrocinador já está vinculado ao evento');
        } else {
          toast.error('Erro ao vincular patrocinador');
        }
      } else {
        toast.success('Patrocinador vinculado ao evento');
        setDialogOpen(false);
        resetForm();
        fetchData();
      }
    }

    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    const { error } = await supabase
      .from('event_sponsors')
      .delete()
      .eq('id', deleteTarget.id)
      .eq('company_id', companyId);

    if (error) {
      toast.error('Erro ao remover vínculo');
    } else {
      toast.success('Patrocinador removido do evento');
      fetchData();
    }
    setDeleteTarget(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Vincule patrocinadores cadastrados a este evento e defina onde cada um será exibido.
          </p>
        </div>
        {!isReadOnly && (
          <Button size="sm" onClick={handleOpenAdd} disabled={unlinkedSponsors.length === 0}>
            <Plus className="h-4 w-4 mr-1" />
            Adicionar
          </Button>
        )}
      </div>

      {unlinkedSponsors.length === 0 && eventSponsors.length === 0 && (
        <EmptyState
          icon={<Star className="h-6 w-6 text-muted-foreground" />}
          title="Nenhum patrocinador disponível"
          description="Cadastre patrocinadores em Patrocinadores antes de vincular a eventos."
        />
      )}

      {eventSponsors.length === 0 && unlinkedSponsors.length > 0 && (
        <EmptyState
          icon={<Star className="h-6 w-6 text-muted-foreground" />}
          title="Nenhum patrocinador vinculado"
          description="Use o botão Adicionar para vincular patrocinadores a este evento."
        />
      )}

      {eventSponsors.length > 0 && (
        <div className="space-y-2">
          {eventSponsors.map((link) => (
            <Card key={link.id}>
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {link.sponsor?.banner_url ? (
                    <img
                      src={link.sponsor.banner_url}
                      alt={link.sponsor?.name || ''}
                      className="h-10 w-16 rounded object-contain bg-muted"
                    />
                  ) : (
                    <div className="h-10 w-16 rounded bg-muted flex items-center justify-center">
                      <Star className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{link.sponsor?.name || 'Patrocinador'}</p>
                    <div className="flex flex-wrap gap-1.5 mt-0.5">
                      {link.show_on_event_page && (
                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">Página do evento</span>
                      )}
                      {link.show_on_showcase && (
                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">Vitrine</span>
                      )}
                      {link.show_on_ticket && (
                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">Passagem</span>
                      )}
                    </div>
                  </div>
                </div>
                {!isReadOnly && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEdit(link)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(link)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog para adicionar/editar vínculo */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingLink ? 'Editar vínculo' : 'Adicionar patrocinador ao evento'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!editingLink && (
              <div className="space-y-2">
                <Label>Patrocinador *</Label>
                <Select value={form.sponsor_id} onValueChange={(v) => setForm({ ...form, sponsor_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um patrocinador" />
                  </SelectTrigger>
                  <SelectContent>
                    {unlinkedSponsors.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-3">
              <Label className="text-sm font-medium">Onde exibir</Label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={form.show_on_event_page}
                    onCheckedChange={(v) => setForm({ ...form, show_on_event_page: Boolean(v) })}
                  />
                  <span className="text-sm">Mostrar na página do evento</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={form.show_on_showcase}
                    onCheckedChange={(v) => setForm({ ...form, show_on_showcase: Boolean(v) })}
                  />
                  <span className="text-sm">Mostrar na vitrine pública</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={form.show_on_ticket}
                    onCheckedChange={(v) => setForm({ ...form, show_on_ticket: Boolean(v) })}
                  />
                  <span className="text-sm">Mostrar na passagem</span>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Ordem de exibição</Label>
              <Input
                type="number"
                min="1"
                value={form.display_order}
                onChange={(e) => setForm({ ...form, display_order: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Menor número aparece primeiro.</p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingLink ? 'Salvar' : 'Vincular'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover patrocinador do evento?</AlertDialogTitle>
            <AlertDialogDescription>
              O patrocinador será desvinculado deste evento. O cadastro base não será afetado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
