import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sponsor, EventSponsor } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
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
import { Plus, Trash2, Star, Loader2, Pencil, ChevronsUpDown, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// --- Tier system ---

type SponsorTier = 'bronze' | 'prata' | 'ouro';

const SPONSOR_TIERS: { value: SponsorTier; label: string; emoji: string; description: string; locations: string[] }[] = [
  { value: 'bronze', label: 'Bronze', emoji: '🥉', description: 'Visibilidade básica no evento.', locations: ['Página do evento'] },
  { value: 'prata', label: 'Prata', emoji: '🥈', description: 'Maior visibilidade para o patrocinador.', locations: ['Página do evento', 'Vitrine pública'] },
  { value: 'ouro', label: 'Ouro', emoji: '🥇', description: 'Máxima visibilidade dentro do sistema.', locations: ['Página do evento', 'Vitrine pública', 'Passagem'] },
];

const TIER_VISIBILITY: Record<SponsorTier, { show_on_event_page: boolean; show_on_showcase: boolean; show_on_ticket: boolean }> = {
  bronze: { show_on_event_page: true, show_on_showcase: false, show_on_ticket: false },
  prata:  { show_on_event_page: true, show_on_showcase: true,  show_on_ticket: false },
  ouro:   { show_on_event_page: true, show_on_showcase: true,  show_on_ticket: true },
};

function inferTier(flags: { show_on_event_page: boolean; show_on_showcase: boolean; show_on_ticket: boolean }): SponsorTier {
  if (flags.show_on_ticket) return 'ouro';
  if (flags.show_on_showcase) return 'prata';
  return 'bronze';
}

function getTierInfo(tier: SponsorTier) {
  return SPONSOR_TIERS.find((t) => t.value === tier)!;
}

// --- Component ---

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
  const [sponsorPopoverOpen, setSponsorPopoverOpen] = useState(false);

  const [form, setForm] = useState({
    sponsor_id: '',
    sponsor_tier: 'bronze' as SponsorTier,
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

  const selectedSponsorName = unlinkedSponsors.find((s) => s.id === form.sponsor_id)?.name;

  const resetForm = () => {
    setEditingLink(null);
    setForm({
      sponsor_id: '',
      sponsor_tier: 'bronze',
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
      sponsor_tier: inferTier(link),
      display_order: String(link.display_order),
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    setSaving(true);

    const orderValue = parseInt(form.display_order, 10) || 1;
    const visibility = TIER_VISIBILITY[form.sponsor_tier];

    if (editingLink) {
      const { error } = await supabase
        .from('event_sponsors')
        .update({
          ...visibility,
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
          ...visibility,
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
          <Button type="button" size="sm" onClick={handleOpenAdd} disabled={unlinkedSponsors.length === 0}>
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
          {eventSponsors.map((link) => {
            const tier = inferTier(link);
            const tierInfo = getTierInfo(tier);
            return (
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
                      <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                        {tierInfo.emoji} {tierInfo.label}
                      </span>
                    </div>
                  </div>
                  {!isReadOnly && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEdit(link)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(link)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
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
                <Popover open={sponsorPopoverOpen} onOpenChange={setSponsorPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={sponsorPopoverOpen}
                      className="w-full justify-between font-normal"
                    >
                      {selectedSponsorName || 'Selecione um patrocinador...'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Pesquisar patrocinador..." />
                      <CommandList>
                        <CommandEmpty>Nenhum patrocinador encontrado.</CommandEmpty>
                        <CommandGroup>
                          {unlinkedSponsors.map((s) => (
                            <CommandItem
                              key={s.id}
                              value={s.name}
                              onSelect={() => {
                                setForm({ ...form, sponsor_id: s.id });
                                setSponsorPopoverOpen(false);
                              }}
                            >
                              <Check className={cn('mr-2 h-4 w-4', form.sponsor_id === s.id ? 'opacity-100' : 'opacity-0')} />
                              {s.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* Tier selection cards */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Nível do patrocínio</Label>
              <div className="grid grid-cols-3 gap-3">
                {SPONSOR_TIERS.map((tier) => (
                  <button
                    key={tier.value}
                    type="button"
                    onClick={() => setForm({ ...form, sponsor_tier: tier.value })}
                    className={cn(
                      'flex flex-col items-center text-center rounded-lg border p-3 transition-all cursor-pointer',
                      form.sponsor_tier === tier.value
                        ? 'ring-2 ring-primary bg-primary/5 border-primary'
                        : 'border-border hover:border-primary/40'
                    )}
                  >
                    <span className="text-2xl mb-1">{tier.emoji}</span>
                    <span className="text-sm font-semibold">{tier.label}</span>
                    <span className="text-[10px] text-muted-foreground mt-1 leading-tight">{tier.description}</span>
                    <ul className="mt-2 space-y-0.5">
                      {tier.locations.map((loc) => (
                        <li key={loc} className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Check className="h-3 w-3 text-primary shrink-0" />
                          {loc}
                        </li>
                      ))}
                    </ul>
                  </button>
                ))}
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
            <Button type="button" onClick={handleSubmit} disabled={saving}>
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
