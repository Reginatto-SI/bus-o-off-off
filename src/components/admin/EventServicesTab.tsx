import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { EventService, Service } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { ActionsDropdown, ActionItem } from '@/components/admin/ActionsDropdown';
import { Loader2, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrencyBRL } from '@/lib/currency';
import { buildDebugToastMessage, logSupabaseError } from '@/lib/errorDebug';

// =====================================================================
// Aba "Serviços" do EventDetail.
// Permite vincular serviços (do cadastro base /admin/servicos) ao evento
// com preço base e capacidade. NÃO implementa venda nesta etapa.
// =====================================================================

const UNIT_TYPE_LABELS: Record<string, string> = {
  pessoa: 'Pessoa',
  veiculo: 'Veículo',
  unitario: 'Unitário',
};

interface EventServicesTabProps {
  eventId: string;
  companyId: string;
}

interface FormState {
  service_id: string;
  base_price: string;
  total_capacity: string;
  allow_checkout: boolean;
  allow_standalone_sale: boolean;
  is_active: boolean;
}

const emptyForm: FormState = {
  service_id: '',
  base_price: '0',
  total_capacity: '0',
  allow_checkout: false,
  allow_standalone_sale: false,
  is_active: true,
};

export function EventServicesTab({ eventId, companyId }: EventServicesTabProps) {
  const { user } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [eventServices, setEventServices] = useState<EventService[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const [servicesRes, eventServicesRes] = await Promise.all([
      supabase
        .from('services')
        .select('*')
        .eq('company_id', companyId)
        .eq('status', 'ativo')
        .order('name', { ascending: true }),
      supabase
        .from('event_services')
        .select('*, service:services(*)')
        .eq('event_id', eventId)
        .eq('company_id', companyId)
        .order('created_at', { ascending: true }),
    ]);

    if (servicesRes.error) {
      logSupabaseError({
        label: 'Erro ao carregar catálogo de serviços',
        error: servicesRes.error,
        context: { action: 'select', table: 'services', userId: user?.id },
      });
    } else {
      setServices((servicesRes.data ?? []) as Service[]);
    }

    if (eventServicesRes.error) {
      logSupabaseError({
        label: 'Erro ao carregar serviços do evento',
        error: eventServicesRes.error,
        context: { action: 'select', table: 'event_services', userId: user?.id },
      });
    } else {
      setEventServices(((eventServicesRes.data ?? []) as unknown) as EventService[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, companyId]);

  // Serviços do catálogo que ainda não foram vinculados (apenas no modo "novo").
  const linkableServices = useMemo(() => {
    if (editingId) return services;
    const linkedIds = new Set(eventServices.map((es) => es.service_id));
    return services.filter((s) => !linkedIds.has(s.id));
  }, [services, eventServices, editingId]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (es: EventService) => {
    setEditingId(es.id);
    setForm({
      service_id: es.service_id,
      base_price: String(es.base_price ?? 0),
      total_capacity: String(es.total_capacity ?? 0),
      allow_checkout: es.allow_checkout,
      allow_standalone_sale: es.allow_standalone_sale,
      is_active: es.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.service_id) {
      toast.error('Selecione um serviço.');
      return;
    }
    const basePrice = Number(form.base_price.replace(',', '.'));
    const totalCapacity = Number.parseInt(form.total_capacity, 10);
    if (Number.isNaN(basePrice) || basePrice < 0) {
      toast.error('Informe um valor base válido.');
      return;
    }
    if (Number.isNaN(totalCapacity) || totalCapacity < 0) {
      toast.error('Informe uma capacidade válida.');
      return;
    }

    setSaving(true);
    const payload = {
      event_id: eventId,
      service_id: form.service_id,
      company_id: companyId,
      base_price: basePrice,
      total_capacity: totalCapacity,
      allow_checkout: form.allow_checkout,
      allow_standalone_sale: form.allow_standalone_sale,
      is_active: form.is_active,
    };

    if (editingId) {
      const { error } = await supabase
        .from('event_services')
        .update(payload)
        .eq('id', editingId)
        .eq('company_id', companyId);

      if (error) {
        logSupabaseError({
          label: 'Erro ao atualizar serviço do evento',
          error,
          context: { action: 'update', table: 'event_services', recordId: editingId },
        });
        toast.error(
          buildDebugToastMessage({
            title: 'Erro ao atualizar vínculo',
            error,
            context: { action: 'update', table: 'event_services' },
          }),
        );
      } else {
        toast.success('Vínculo atualizado.');
        setDialogOpen(false);
        await fetchData();
      }
    } else {
      const { error } = await supabase.from('event_services').insert(payload);
      if (error) {
        logSupabaseError({
          label: 'Erro ao vincular serviço ao evento',
          error,
          context: { action: 'insert', table: 'event_services' },
        });
        toast.error(
          buildDebugToastMessage({
            title: 'Erro ao vincular serviço',
            error,
            context: { action: 'insert', table: 'event_services' },
          }),
        );
      } else {
        toast.success('Serviço vinculado ao evento.');
        setDialogOpen(false);
        await fetchData();
      }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    const { error } = await supabase
      .from('event_services')
      .delete()
      .eq('id', confirmDeleteId)
      .eq('company_id', companyId);

    if (error) {
      logSupabaseError({
        label: 'Erro ao remover vínculo de serviço',
        error,
        context: { action: 'delete', table: 'event_services', recordId: confirmDeleteId },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Não foi possível remover',
          error,
          context: { action: 'delete', table: 'event_services' },
        }),
      );
    } else {
      toast.success('Vínculo removido.');
      fetchData();
    }
    setConfirmDeleteId(null);
  };

  const noCatalog = !loading && services.length === 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Serviços do evento</CardTitle>
        <Button
          size="sm"
          onClick={openCreate}
          disabled={noCatalog || (linkableServices.length === 0 && !editingId)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Vincular serviço
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : noCatalog ? (
          <EmptyState
            icon={<Sparkles className="h-6 w-6 text-muted-foreground" />}
            title="Nenhum serviço cadastrado"
            description="Cadastre serviços em /admin/servicos para vinculá-los a este evento."
            className="py-8"
          />
        ) : eventServices.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-6 w-6 text-muted-foreground" />}
            title="Nenhum serviço vinculado"
            description="Vincule serviços do seu catálogo a este evento e defina preço e capacidade."
            className="py-8"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serviço</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor base</TableHead>
                <TableHead className="text-right">Capacidade</TableHead>
                <TableHead className="text-right">Vendidos</TableHead>
                <TableHead className="text-right">Disponível</TableHead>
                <TableHead>Checkout</TableHead>
                <TableHead>Avulsa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[60px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eventServices.map((es) => {
                const available = Math.max(
                  (es.total_capacity ?? 0) - (es.sold_quantity ?? 0),
                  0,
                );
                const actions: ActionItem[] = [
                  { label: 'Editar', icon: Pencil, onClick: () => openEdit(es) },
                  {
                    label: 'Remover',
                    icon: Trash2,
                    variant: 'destructive',
                    onClick: () => setConfirmDeleteId(es.id),
                  },
                ];
                return (
                  <TableRow key={es.id}>
                    <TableCell>
                      <div className="font-medium">
                        {es.service?.name ?? 'Serviço'}
                      </div>
                      {es.service?.description && (
                        <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {es.service.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {es.service ? UNIT_TYPE_LABELS[es.service.unit_type] : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrencyBRL(Number(es.base_price ?? 0))}
                    </TableCell>
                    <TableCell className="text-right">{es.total_capacity ?? 0}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {es.sold_quantity ?? 0}
                    </TableCell>
                    <TableCell className="text-right font-medium">{available}</TableCell>
                    <TableCell>{es.allow_checkout ? 'Sim' : 'Não'}</TableCell>
                    <TableCell>{es.allow_standalone_sale ? 'Sim' : 'Não'}</TableCell>
                    <TableCell>
                      <span
                        className={
                          es.is_active
                            ? 'text-xs font-medium text-emerald-700'
                            : 'text-xs font-medium text-muted-foreground'
                        }
                      >
                        {es.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <ActionsDropdown actions={actions} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Modal vínculo / edição */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Editar vínculo do serviço' : 'Vincular serviço ao evento'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Serviço</Label>
              <Select
                value={form.service_id}
                onValueChange={(v) => setForm((f) => ({ ...f, service_id: v }))}
                disabled={Boolean(editingId)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um serviço" />
                </SelectTrigger>
                <SelectContent>
                  {linkableServices.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      Nenhum serviço disponível para vincular.
                    </div>
                  ) : (
                    linkableServices.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} · {UNIT_TYPE_LABELS[s.unit_type]}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {editingId && (
                <p className="text-xs text-muted-foreground">
                  O serviço não pode ser trocado depois de vinculado. Para isso, remova e
                  vincule outro.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="base_price">Valor base (R$)</Label>
                <Input
                  id="base_price"
                  inputMode="decimal"
                  value={form.base_price}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, base_price: e.target.value }))
                  }
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="total_capacity">Capacidade total</Label>
                <Input
                  id="total_capacity"
                  inputMode="numeric"
                  value={form.total_capacity}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, total_capacity: e.target.value }))
                  }
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div className="pr-3">
                  <Label className="text-sm">Permitir venda no checkout</Label>
                  <p className="text-xs text-muted-foreground">
                    Aparece junto da passagem (configuração; venda virá depois).
                  </p>
                </div>
                <Switch
                  checked={form.allow_checkout}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, allow_checkout: v }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="pr-3">
                  <Label className="text-sm">Permitir venda avulsa</Label>
                  <p className="text-xs text-muted-foreground">
                    Vendido sem passagem (configuração; venda virá depois).
                  </p>
                </div>
                <Switch
                  checked={form.allow_standalone_sale}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, allow_standalone_sale: v }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="pr-3">
                  <Label className="text-sm">Ativo</Label>
                  <p className="text-xs text-muted-foreground">
                    Quando inativo, o vínculo fica oculto da operação.
                  </p>
                </div>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                />
              </div>
            </div>
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? 'Salvar alterações' : 'Vincular serviço'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(confirmDeleteId)}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover vínculo?</AlertDialogTitle>
            <AlertDialogDescription>
              O serviço continua no seu catálogo, mas deixa de fazer parte deste evento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
