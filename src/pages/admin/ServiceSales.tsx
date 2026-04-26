import { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { PageHeader } from '@/components/admin/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  CircleDollarSign,
  ClipboardList,
  Loader2,
  Package,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrencyBRL } from '@/lib/currency';
import { toast } from 'sonner';
import { formatDateOnlyBR } from '@/lib/date';
import { useRuntimePaymentEnvironment } from '@/hooks/use-runtime-payment-environment';
import { buildEventOperationalEndMap, filterOperationallyVisibleEvents } from '@/lib/eventOperationalWindow';

type WizardStep = 'selecionar' | 'quantidade' | 'pagamento';
type ServiceUnitType = 'pessoa' | 'veiculo' | 'unitario';
type PaymentMethod = 'dinheiro' | 'pix' | 'link';

interface EventOption {
  id: string;
  name: string;
  date: string;
  city: string | null;
}

interface EventServiceOption {
  id: string;
  event_id: string;
  service_id: string;
  base_price: number;
  total_capacity: number;
  sold_quantity: number;
  service: {
    id: string;
    name: string;
    unit_type: ServiceUnitType;
    control_type: 'validacao_obrigatoria' | 'sem_validacao';
    status: string;
  } | null;
}

interface EventBoardingWindowRow {
  event_id: string;
  departure_date: string | null;
  departure_time: string | null;
}

const UNIT_LABELS: Record<ServiceUnitType, string> = {
  pessoa: 'Pessoas',
  veiculo: 'Veículos',
  unitario: 'Quantidade',
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  link: 'Link',
};

const STEP_DETAILS: Array<{ value: WizardStep; label: string; icon: typeof Sparkles }> = [
  { value: 'selecionar', label: 'Escolher evento', icon: CalendarDays },
  { value: 'quantidade', label: 'Definir quantidade', icon: ClipboardList },
  { value: 'pagamento', label: 'Confirmar venda', icon: CircleDollarSign },
];

export default function ServiceSales() {
  const { activeCompanyId, user } = useAuth();
  const { environment: runtimePaymentEnvironment } = useRuntimePaymentEnvironment();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [step, setStep] = useState<WizardStep>('selecionar');
  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventServices, setEventServices] = useState<EventServiceOption[]>([]);

  const [eventPopoverOpen, setEventPopoverOpen] = useState(false);
  const [eventSearch, setEventSearch] = useState('');

  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedEventServiceId, setSelectedEventServiceId] = useState('');

  const [quantity, setQuantity] = useState(1);
  const [personNames, setPersonNames] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [buyerName, setBuyerName] = useState('');

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId),
    [events, selectedEventId],
  );

  const availableEventServices = useMemo(
    () => eventServices.filter((service) => service.event_id === selectedEventId && service.service?.status === 'ativo'),
    [eventServices, selectedEventId],
  );

  const selectedEventService = useMemo(
    () => availableEventServices.find((service) => service.id === selectedEventServiceId),
    [availableEventServices, selectedEventServiceId],
  );

  const availableQuantity = useMemo(() => {
    if (!selectedEventService) return 0;
    return Math.max((selectedEventService.total_capacity ?? 0) - (selectedEventService.sold_quantity ?? 0), 0);
  }, [selectedEventService]);

  const totalAmount = useMemo(
    () => (selectedEventService?.base_price ?? 0) * quantity,
    [selectedEventService, quantity],
  );

  const filteredEvents = useMemo(() => {
    const term = eventSearch.trim().toLowerCase();
    if (!term) return events;

    return events.filter((event) => {
      const composed = `${event.name} ${event.city ?? ''} ${formatDateOnlyBR(event.date)}`.toLowerCase();
      return composed.includes(term);
    });
  }, [events, eventSearch]);

  useEffect(() => {
    async function loadData() {
      if (!activeCompanyId) return;
      setLoading(true);

      try {
        const [{ data: eventsData, error: eventsError }, { data: eventServicesData, error: servicesError }] = await Promise.all([
          supabase
            .from('events')
            .select('id, name, date, city')
            .eq('company_id', activeCompanyId)
            .neq('status', 'encerrado')
            .eq('is_archived', false)
            .order('date', { ascending: true }),
          supabase
            .from('event_services')
            .select('id, event_id, service_id, base_price, total_capacity, sold_quantity, service:services!inner(id, name, unit_type, control_type, status)')
            .eq('company_id', activeCompanyId)
            .eq('is_active', true)
            .eq('service.status', 'ativo'),
        ]);

        if (eventsError) throw eventsError;
        if (servicesError) throw servicesError;

        const baseEventRows = eventsData ?? [];
        if (baseEventRows.length > 0) {
          const { data: boardingsData } = await supabase
            .from('event_boarding_locations')
            .select('event_id, departure_date, departure_time')
            .in('event_id', baseEventRows.map((event) => event.id))
            .eq('company_id', activeCompanyId)
            .not('departure_date', 'is', null);

          const operationalEndMap = buildEventOperationalEndMap(
            baseEventRows,
            ((boardingsData ?? []) as EventBoardingWindowRow[]),
          );
          setEvents(filterOperationallyVisibleEvents(baseEventRows, operationalEndMap));
        } else {
          setEvents([]);
        }
        setEventServices((eventServicesData as EventServiceOption[]) ?? []);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro ao carregar dados da venda de serviços.';
        toast.error(message);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [activeCompanyId]);

  const selectedEventLabel = selectedEvent
    ? `${formatDateOnlyBR(selectedEvent.date)} — ${selectedEvent.name}${selectedEvent.city ? ` (${selectedEvent.city})` : ''}`
    : 'Selecione o evento';

  const canAdvanceToQuantity = Boolean(selectedEventId && selectedEventServiceId);
  const canAdvanceToPayment = Boolean(quantity > 0 && quantity <= availableQuantity);
  const safeBuyerName = buyerName.trim() || 'Cliente não informado (venda de serviço)';
  const currentStepIndex = STEP_DETAILS.findIndex((stepItem) => stepItem.value === step);

  // Estado visual do card lateral para orientar a operação sem alterar o fluxo funcional.
  const summaryState: 'incompleto' | 'preenchendo' | 'pronto' = !canAdvanceToQuantity
    ? 'incompleto'
    : (step === 'pagamento' && canAdvanceToPayment ? 'pronto' : 'preenchendo');

  const summaryStateClasses = {
    incompleto: 'border-border/70 bg-card',
    preenchendo: 'border-primary/30 bg-primary/5',
    pronto: 'border-emerald-200 bg-emerald-50/70',
  } as const;

  function resetWizard(options?: { keepEvent?: boolean }) {
    // Reset centralizado para reduzir risco de inconsistência entre estados ao concluir venda.
    setStep('selecionar');
    if (!options?.keepEvent) setSelectedEventId('');
    setSelectedEventServiceId('');
    setQuantity(1);
    setPersonNames('');
    setPaymentMethod('pix');
    setBuyerName('');
  }

  async function handleConfirmSale() {
    if (!activeCompanyId || !selectedEvent || !selectedEventService || !selectedEventService.service) {
      toast.error('Preencha os dados da venda antes de confirmar.');
      return;
    }

    if (quantity <= 0 || quantity > availableQuantity) {
      toast.error('Quantidade inválida para a capacidade disponível.');
      return;
    }

    setSaving(true);

    try {
      // Revalidação mínima no banco para reduzir risco de corrida entre operadores.
      const { data: latestEventService, error: latestEventServiceError } = await supabase
        .from('event_services')
        .select('sold_quantity, total_capacity')
        .eq('id', selectedEventService.id)
        .eq('company_id', activeCompanyId)
        .maybeSingle();

      if (latestEventServiceError) throw latestEventServiceError;
      if (!latestEventService) throw new Error('Serviço do evento não encontrado para validar capacidade.');

      const latestSoldQuantity = Number(latestEventService.sold_quantity ?? 0);
      const latestTotalCapacity = Number(latestEventService.total_capacity ?? 0);
      const latestAvailableQuantity = Math.max(latestTotalCapacity - latestSoldQuantity, 0);
      if (quantity > latestAvailableQuantity) {
        throw new Error(`Capacidade indisponível no momento. Restam ${latestAvailableQuantity} vaga(s).`);
      }

      // PRD: dinheiro => pendente_taxa | pix/link => pendente.
      // Compatibilização mínima aplicada via migration de enum para não mapear silenciosamente.
      const saleStatus = paymentMethod === 'dinheiro' ? 'pendente_taxa' : 'pendente';

      if (!runtimePaymentEnvironment) {
        throw new Error('Ambiente de pagamento ainda não foi resolvido. Tente novamente em alguns segundos.');
      }

      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert({
          event_id: selectedEvent.id,
          // Venda avulsa de serviço não depende operacionalmente de viagem/embarque.
          trip_id: null,
          boarding_location_id: null,
          customer_name: safeBuyerName,
          customer_cpf: null,
          customer_phone: null,
          quantity,
          unit_price: selectedEventService.base_price,
          gross_amount: totalAmount,
          status: saleStatus,
          payment_method: paymentMethod,
          company_id: activeCompanyId,
          seller_id: null,
          sale_origin: 'admin_manual',
          payment_environment: runtimePaymentEnvironment,
          service_qr_code_token: serviceQrCodeToken,
        } as never)
        .select('id')
        .single();

      if (saleError) throw saleError;

      // Base estruturada do item de serviço: deixa de depender de sale_logs como fonte principal.
      const { error: serviceItemError } = await supabase
        .from('sale_service_items')
        .insert({
          sale_id: saleData.id,
          company_id: activeCompanyId,
          event_id: selectedEvent.id,
          service_id: selectedEventService.service.id,
          event_service_id: selectedEventService.id,
          service_name: selectedEventService.service.name,
          unit_type: selectedEventService.service.unit_type,
          control_type: selectedEventService.service.control_type,
          quantity_total: quantity,
          quantity_used: 0,
          unit_price: selectedEventService.base_price,
          total_price: totalAmount,
          status: 'ativo',
        } as never);

      if (serviceItemError) {
        await supabase.from('sales').delete().eq('id', saleData.id).eq('company_id', activeCompanyId);
        throw serviceItemError;
      }

      const { data: capacityUpdateRows, error: capacityError } = await supabase
        .from('event_services')
        .update({ sold_quantity: latestSoldQuantity + quantity })
        .eq('id', selectedEventService.id)
        // Guardrail de concorrência: só atualiza se ninguém alterou sold_quantity desde a reconsulta.
        .eq('sold_quantity', latestSoldQuantity)
        .eq('company_id', activeCompanyId)
        .select('id');

      if (capacityError) throw capacityError;

      // Se a atualização não encontrar linha (concorrência), revertimos a venda recém-criada.
      // Mantém consistência mínima sem exigir transação/RPC nesta etapa.
      const capacityUpdated = Array.isArray(capacityUpdateRows) && capacityUpdateRows.length > 0;
      if (!capacityUpdated) {
        await supabase.from('sales').delete().eq('id', saleData.id).eq('company_id', activeCompanyId);
        throw new Error('Não foi possível reservar capacidade do serviço. Tente novamente.');
      }

      const itemDescription = {
        event_service_id: selectedEventService.id,
        service_id: selectedEventService.service_id,
        service_name: selectedEventService.service.name,
        unit_type: selectedEventService.service.unit_type,
        quantity,
        unit_price: selectedEventService.base_price,
        total_amount: totalAmount,
        service_qr_code_token: serviceQrCodeToken,
        names: selectedEventService.service.unit_type === 'pessoa'
          ? personNames.split('\n').map((name) => name.trim()).filter(Boolean)
          : [],
      };

      // Trilhas operacionais continuam em sale_logs, mas a fonte principal do item fica em sale_service_items.
      const { error: saleLogError } = await supabase
        .from('sale_logs')
        .insert({
          sale_id: saleData.id,
          action: 'service_item_registered',
          description: `Item de serviço registrado: ${selectedEventService.service.name}`,
          new_value: JSON.stringify(itemDescription),
          old_value: null,
          company_id: activeCompanyId,
          performed_by: user?.id ?? null,
        });

      if (saleLogError) throw saleLogError;

      toast.success('Venda de serviço registrada com sucesso.');

      resetWizard({ keepEvent: true });

      setEventServices((prev) => prev.map((item) => {
        if (item.id !== selectedEventService.id) return item;
        return { ...item, sold_quantity: latestSoldQuantity + quantity };
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Não foi possível confirmar a venda.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout>
      <div className="page-container space-y-4 lg:space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <PageHeader
            title="Venda de Serviços"
            description="Fluxo guiado e rápido para registrar vendas vinculadas ao evento"
          />
          <Badge variant="secondary" className="w-fit gap-1 px-3 py-1 text-xs font-medium">
            <Sparkles className="h-3.5 w-3.5" />
            Fluxo rápido
          </Badge>
        </div>

        <Card className="border-border/70">
          <CardContent className="p-4 lg:p-5">
            {/* Layout UX em duas colunas para reduzir rolagem e manter resumo visível no desktop. */}
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                {/* Stepper visual com destaque ativo e ícones para leitura operacional mais rápida. */}
                <Tabs value={step} onValueChange={(value) => setStep(value as WizardStep)}>
                  <p className="mb-2 text-right text-xs font-medium text-muted-foreground">
                    Progresso: {currentStepIndex + 1}/{STEP_DETAILS.length}
                  </p>
                  <TabsList className="grid h-14 w-full grid-cols-3 gap-2 bg-muted/40 p-1">
                    {STEP_DETAILS.map((stepItem, index) => {
                      const StepIcon = stepItem.icon;
                      const isCompleted = index < currentStepIndex;
                      const isDisabled =
                        (stepItem.value === 'quantidade' && !canAdvanceToQuantity)
                        || (stepItem.value === 'pagamento' && (!canAdvanceToPayment || !canAdvanceToQuantity));

                      return (
                        <TabsTrigger
                          key={stepItem.value}
                          value={stepItem.value}
                          disabled={isDisabled}
                          className={cn(
                            'group h-full gap-2 rounded-md border border-transparent px-2',
                            'data-[state=active]:border-primary/40 data-[state=active]:bg-background data-[state=active]:shadow-sm',
                            isCompleted && 'border-emerald-200 bg-emerald-50/70 text-emerald-700',
                          )}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <StepIcon className="h-4 w-4 text-muted-foreground transition-colors group-data-[state=active]:text-primary" />
                          )}
                          <span className="hidden text-xs font-medium md:inline">{index + 1}. {stepItem.label}</span>
                          <span className="text-xs font-medium md:hidden">{index + 1}</span>
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                </Tabs>

                {loading ? (
                  <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando dados...
                  </div>
                ) : (
                  <div className="rounded-lg border bg-card p-4 lg:p-5 transition-all duration-200">
                    {step === 'selecionar' && (
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2 md:col-span-2">
                          <Label>Evento</Label>
                          <Popover open={eventPopoverOpen} onOpenChange={setEventPopoverOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" role="combobox" className="h-10 w-full justify-between hover:border-primary/40">
                                <span className="truncate">{selectedEventLabel}</span>
                                <ChevronsUpDown className="h-4 w-4 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[420px] p-0" align="start">
                              <Command>
                                <CommandInput
                                  placeholder="Buscar evento..."
                                  value={eventSearch}
                                  onValueChange={setEventSearch}
                                />
                                <CommandList>
                                  <CommandEmpty>Nenhum evento encontrado.</CommandEmpty>
                                  <CommandGroup>
                                    {filteredEvents.map((event) => {
                                      const label = `${formatDateOnlyBR(event.date)} — ${event.name}${event.city ? ` (${event.city})` : ''}`;
                                      return (
                                        <CommandItem
                                          key={event.id}
                                          value={label}
                                          onSelect={() => {
                                            setSelectedEventId(event.id);
                                            setSelectedEventServiceId('');
                                            setEventPopoverOpen(false);
                                          }}
                                        >
                                          <Check className={cn('mr-2 h-4 w-4', selectedEventId === event.id ? 'opacity-100' : 'opacity-0')} />
                                          {label}
                                        </CommandItem>
                                      );
                                    })}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>

                        <div className="space-y-2 md:col-span-2">
                          <Label>Serviço</Label>
                          <Select value={selectedEventServiceId} onValueChange={setSelectedEventServiceId}>
                            <SelectTrigger className="h-10">
                              <SelectValue placeholder="Selecione o serviço" />
                            </SelectTrigger>
                            <SelectContent>
                              {!selectedEventId ? (
                                <div className="px-3 py-2 text-sm text-muted-foreground">
                                  Selecione um evento para carregar os serviços.
                                </div>
                              ) : availableEventServices.length === 0 ? (
                                <div className="px-3 py-2 text-sm text-muted-foreground">
                                  Nenhum serviço vinculado ao evento selecionado. Faça o vínculo na aba Serviços do evento.
                                </div>
                              ) : (
                                availableEventServices.map((service) => (
                                  <SelectItem key={service.id} value={service.id}>
                                    {service.service?.name} · {UNIT_LABELS[service.service?.unit_type ?? 'unitario']}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="rounded-md border bg-muted/20 p-3">
                          <p className="text-xs text-muted-foreground">Valor do serviço</p>
                          <p className="text-xl font-semibold">{formatCurrencyBRL(selectedEventService?.base_price ?? 0)}</p>
                        </div>

                        <div className="rounded-md border bg-muted/20 p-3">
                          <p className="text-xs text-muted-foreground">Vagas disponíveis</p>
                          <p className="text-xl font-semibold">{availableQuantity}</p>
                        </div>

                        <div className="flex justify-end md:col-span-2">
                          <Button disabled={!canAdvanceToQuantity} onClick={() => setStep('quantidade')} className="h-10 px-6">
                            Continuar
                          </Button>
                        </div>
                      </div>
                    )}

                    {step === 'quantidade' && selectedEventService?.service && (
                      <div className="space-y-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2 md:col-span-2">
                            <Label>Comprador/Responsável (opcional)</Label>
                            <Input
                              value={buyerName}
                              onChange={(event) => setBuyerName(event.target.value)}
                              placeholder="Ex: Maria da Silva"
                              className="h-10"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>
                              Quantidade de {UNIT_LABELS[selectedEventService.service.unit_type].toLowerCase()}
                            </Label>
                            <Input
                              type="number"
                              min={1}
                              max={Math.max(availableQuantity, 1)}
                              value={quantity}
                              onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                              className="h-10"
                            />
                          </div>

                          <div className="rounded-md border bg-muted/20 p-3">
                            <p className="text-xs text-muted-foreground">Unidade</p>
                            <p className="text-xl font-semibold">{formatCurrencyBRL(selectedEventService.base_price)}</p>
                          </div>

                          <div className="rounded-md border bg-muted/20 p-3 md:col-span-2">
                            <p className="text-xs text-muted-foreground">Total estimado</p>
                            <p className="text-2xl font-semibold">{formatCurrencyBRL(totalAmount)}</p>
                          </div>
                        </div>

                        {selectedEventService.service.unit_type === 'pessoa' && (
                          <div className="space-y-2">
                            <Label>Nomes (opcional, um por linha)</Label>
                            <Textarea
                              value={personNames}
                              onChange={(event) => setPersonNames(event.target.value)}
                              placeholder="Ex: Maria\nJoão"
                              className="min-h-20"
                            />
                          </div>
                        )}

                        <div className="flex justify-between gap-2">
                          <Button variant="outline" className="h-10 px-6" onClick={() => setStep('selecionar')}>
                            Voltar
                          </Button>
                          <Button disabled={!canAdvanceToPayment} className="h-10 px-6" onClick={() => setStep('pagamento')}>
                            Continuar
                          </Button>
                        </div>
                      </div>
                    )}

                    {step === 'pagamento' && selectedEventService?.service && selectedEvent && (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label>Forma de pagamento</Label>
                          <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}>
                            <SelectTrigger className="h-10">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="dinheiro">Dinheiro</SelectItem>
                              <SelectItem value="pix">Pix</SelectItem>
                              <SelectItem value="link">Link</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Microcopy para reforçar revisão final antes da ação irreversível de confirmação. */}
                        <p className="text-sm text-muted-foreground">
                          Revise os dados antes de confirmar a venda.
                        </p>

                        <div className="flex justify-between gap-2">
                          <Button variant="outline" className="h-10 px-6" onClick={() => setStep('quantidade')}>
                            Voltar
                          </Button>
                          <Button className="h-10 px-6" disabled={saving} onClick={handleConfirmSale}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirmar venda
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Card lateral de contexto rápido com status visual para apoiar operação sem sair da etapa atual. */}
              <Card className={cn('h-fit xl:sticky xl:top-24', summaryStateClasses[summaryState])}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Resumo da venda</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <CalendarDays className="h-4 w-4" />
                      Evento
                    </p>
                    <p className="font-medium leading-snug">{selectedEventLabel}</p>
                  </div>

                  <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Package className="h-4 w-4" />
                      Serviço
                    </p>
                    <p className="font-medium leading-snug">{selectedEventService?.service?.name ?? 'Selecione um serviço'}</p>
                    <p className="text-xs text-muted-foreground">
                      Unidade: {UNIT_LABELS[selectedEventService?.service?.unit_type ?? 'unitario']}
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">Valor unitário</p>
                      <p className="text-base font-semibold">{formatCurrencyBRL(selectedEventService?.base_price ?? 0)}</p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">Vagas disponíveis</p>
                      <p className="text-base font-semibold">{availableQuantity}</p>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">Quantidade</p>
                      <p className="text-base font-semibold">{quantity}</p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">Pagamento</p>
                      <p className="text-base font-semibold">{PAYMENT_LABELS[paymentMethod]}</p>
                    </div>
                  </div>

                  {/* Total com maior prioridade visual para apoiar decisão em tempo real ao selecionar evento/serviço. */}
                  <div className="rounded-md border border-primary/30 bg-primary/10 p-3">
                    <p className="text-xs text-muted-foreground">Total estimado</p>
                    <p className="text-3xl font-bold text-primary">{formatCurrencyBRL(totalAmount)}</p>
                  </div>

                  <div className="rounded-md border p-3">
                    <p className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <UserRound className="h-4 w-4" />
                      Comprador
                    </p>
                    <p className="font-medium">{safeBuyerName}</p>
                  </div>

                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Status operacional</p>
                    <p className={cn(
                      'mt-1 inline-flex items-center rounded-full px-2 py-1 text-xs font-medium',
                      summaryState === 'pronto' && 'bg-emerald-100 text-emerald-700',
                      summaryState === 'preenchendo' && 'bg-primary/15 text-primary',
                      summaryState === 'incompleto' && 'bg-muted text-muted-foreground',
                    )}>
                      {summaryState === 'pronto' ? 'Pronto para confirmar' : summaryState === 'preenchendo' ? 'Preenchendo dados' : 'Aguardando seleção'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
