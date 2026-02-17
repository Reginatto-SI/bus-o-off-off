/**
 * Tela do vendedor: apenas visualização de vendas rastreadas via ref.
 * Sem integração com Stripe. Comissão de vendedor é apurada manualmente pelo gerente.
 *
 * Mobile-first: cards empilháveis, filtros colapsáveis, botão fixo de compartilhar.
 */
import { useState, useEffect, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Sale, Seller } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Loader2,
  LogOut,
  Ticket,
  ShoppingCart,
  DollarSign,
  CheckCircle2,
  Share2,
  Check,
  Filter,
  ChevronDown,
  ChevronsUpDown,
  LinkIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface EventOption {
  id: string;
  name: string;
  city: string;
  date: string;
  status: string;
}

const EVENT_STORAGE_KEY = 'seller-dashboard-selected-event';

export default function SellerDashboard() {
  const { user, loading: authLoading, sellerId, profile, signOut, isVendedor, isDeveloper } = useAuth();

  const [sales, setSales] = useState<Sale[]>([]);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);

  // Filters
  const [eventSearch, setEventSearch] = useState('');
  const [eventOptions, setEventOptions] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    if (!sellerId) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      const [salesRes, sellerRes] = await Promise.all([
        supabase
          .from('sales')
          .select('*, event:events(*)')
          .eq('seller_id', sellerId)
          .order('created_at', { ascending: false }),
        supabase.from('sellers').select('*').eq('id', sellerId).single(),
      ]);

      if (salesRes.data) setSales(salesRes.data as Sale[]);
      if (sellerRes.data) setSeller(sellerRes.data as Seller);

      // A lista de eventos vem apenas das vendas do vendedor para manter o recorte de segurança e performance.
      if (salesRes.data) {
        const uniqueEvents = new Map<string, EventOption>();

        (salesRes.data as Sale[]).forEach((sale) => {
          if (!sale.event) return;
          if (!uniqueEvents.has(sale.event.id)) {
            uniqueEvents.set(sale.event.id, {
              id: sale.event.id,
              name: sale.event.name,
              city: sale.event.city,
              date: sale.event.date,
              status: sale.event.status,
            });
          }
        });

        const sortedEvents = Array.from(uniqueEvents.values()).sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        setEventOptions(sortedEvents);
      }
      setLoading(false);
    };

    fetchData();
  }, [sellerId]);

  useEffect(() => {
    if (!eventOptions.length) {
      setSelectedEventId('');
      return;
    }

    // Mantém o evento salvo anteriormente quando o vendedor retorna para a tela.
    const savedEventId = localStorage.getItem(`${EVENT_STORAGE_KEY}-${sellerId}`);
    const savedEvent = eventOptions.find((event) => event.id === savedEventId);
    if (savedEvent) {
      setSelectedEventId(savedEvent.id);
      return;
    }

    // Preferência de seleção inicial: evento mais recente em venda; fallback para o mais recente vendido.
    const activeEvent = eventOptions.find((event) => event.status === 'a_venda');
    const defaultEventId = activeEvent?.id ?? eventOptions[0].id;
    setSelectedEventId(defaultEventId);
  }, [eventOptions, sellerId]);

  useEffect(() => {
    if (!sellerId || !selectedEventId) return;
    localStorage.setItem(`${EVENT_STORAGE_KEY}-${sellerId}`, selectedEventId);
  }, [selectedEventId, sellerId]);

  const filteredEventOptions = useMemo(() => {
    if (!eventSearch.trim()) return eventOptions;
    const normalizedSearch = eventSearch.toLowerCase();

    return eventOptions.filter((event) => {
      const searchableText = `${event.name} ${event.city} ${event.date}`.toLowerCase();
      return searchableText.includes(normalizedSearch);
    });
  }, [eventOptions, eventSearch]);

  const selectedEventLabel = useMemo(() => {
    const selectedEvent = eventOptions.find((event) => event.id === selectedEventId);
    if (!selectedEvent) return '';

    return `${selectedEvent.name} • ${selectedEvent.city} • ${format(new Date(selectedEvent.date), 'dd/MM/yyyy')}`;
  }, [eventOptions, selectedEventId]);

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      if (selectedEventId && sale.event_id !== selectedEventId) return false;
      if (statusFilter !== 'todos' && sale.status !== statusFilter) return false;
      if (dateFrom && sale.created_at < dateFrom) return false;
      if (dateTo) {
        const endOfDay = dateTo + 'T23:59:59';
        if (sale.created_at > endOfDay) return false;
      }
      return true;
    });
  }, [sales, selectedEventId, statusFilter, dateFrom, dateTo]);

  const advancedFiltersCount = useMemo(() => {
    let count = 0;
    if (statusFilter !== 'todos') count += 1;
    if (dateFrom) count += 1;
    if (dateTo) count += 1;
    return count;
  }, [statusFilter, dateFrom, dateTo]);

  // KPIs
  const totalSold = filteredSales.reduce((sum, s) => sum + s.quantity, 0);
  const totalValue = filteredSales.reduce((sum, s) => sum + s.quantity * s.unit_price, 0);
  const paidSales = filteredSales.filter((s) => s.status === 'pago');
  const paidValue = paidSales.reduce((sum, s) => sum + s.quantity * s.unit_price, 0);
  // Comissão agregada usa apenas vendas pagas e o percentual já configurado para o vendedor.
  const sellerCommission = seller ? paidValue * (seller.commission_percent / 100) : 0;

  const shareLink = () => {
    const link = `${window.location.origin}/eventos?ref=${sellerId}`;

    if (navigator.share) {
      navigator.share({
        title: 'Compre sua passagem!',
        text: 'Garanta sua passagem para o próximo evento:',
        url: link,
      }).catch(() => {
        // fallback to copy
        copyLink(link);
      });
    } else {
      copyLink(link);
    }
  };

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success('Link copiado!');
    setTimeout(() => setCopied(false), 2000);
  };

  // Auth guard
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isVendedor && !isDeveloper) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="bg-card border-b px-4 py-3 flex items-center justify-between">
          <Logo size="sm" />
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </header>
        <div className="flex-1 flex items-center justify-center p-4">
          <EmptyState
            icon={<LinkIcon className="h-8 w-8 text-muted-foreground" />}
            title="Acesso restrito"
            description="Esta área é exclusiva para vendedores. Seu perfil não possui acesso."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header mobile-first */}
      <header className="bg-card border-b px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <Logo size="sm" />
          <span className="text-sm font-medium text-muted-foreground truncate max-w-[150px]">
            {profile?.name}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline">Sair</span>
        </Button>
      </header>

      <main className="flex-1 p-4 pb-24 max-w-2xl mx-auto w-full">
        <h1 className="text-xl font-bold text-foreground mb-1">Minhas Vendas</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Acompanhe suas vendas rastreadas via link
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !sellerId ? (
          <EmptyState
            icon={<LinkIcon className="h-8 w-8 text-muted-foreground" />}
            title="Conta não vinculada"
            description="Sua conta não está vinculada a um vendedor. Entre em contato com o administrador."
          />
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <Ticket className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Passagens</p>
                      <p className="text-lg font-bold">{totalSold}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Total Vendido</p>
                      <p className="text-lg font-bold">R$ {totalValue.toFixed(2)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Pagas</p>
                      <p className="text-lg font-bold">R$ {paidValue.toFixed(2)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-warning shrink-0" />
                    <div className="min-w-0">
                      {/* Exibe o KPI financeiro principal sem alterar a regra já existente de comissão. */}
                      <p className="text-xs text-muted-foreground">Comissão a Receber</p>
                      <p className="text-lg font-bold">R$ {sellerCommission.toFixed(2)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Filtro principal: evento sempre visível para contexto imediato da análise. */}
            <div className="space-y-2 mb-4">
              <Label className="text-xs">Evento</Label>
              <Popover open={eventOpen} onOpenChange={setEventOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={eventOpen}
                    className={cn('w-full justify-between font-normal', !selectedEventLabel && 'text-muted-foreground')}
                  >
                    <span className="truncate">{selectedEventLabel || 'Selecione um evento'}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Buscar evento..."
                      value={eventSearch}
                      onValueChange={setEventSearch}
                    />
                    <CommandList>
                      <CommandEmpty>Nenhum evento encontrado.</CommandEmpty>
                      <CommandGroup>
                        {filteredEventOptions.map((event) => {
                          const optionLabel = `${event.name} • ${event.city} • ${format(new Date(event.date), 'dd/MM/yyyy')}`;
                          return (
                            <CommandItem
                              key={event.id}
                              value={optionLabel}
                              onSelect={() => {
                                setSelectedEventId(event.id);
                                setEventOpen(false);
                                setEventSearch('');
                              }}
                            >
                              <Check
                                className={cn('mr-2 h-4 w-4', selectedEventId === event.id ? 'opacity-100' : 'opacity-0')}
                              />
                              <span className="truncate">{optionLabel}</span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Filtros secundários ficam colapsados para reduzir ruído visual no mobile. */}
            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="mb-4">
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    Filtros avançados
                    {advancedFiltersCount > 0 && <Badge variant="secondary">{advancedFiltersCount}</Badge>}
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3 space-y-3">
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="pago">Pago</SelectItem>
                      <SelectItem value="reservado">Reservado</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">De</Label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Até</Label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
                {(statusFilter !== 'todos' || dateFrom || dateTo) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setStatusFilter('todos');
                      setDateFrom('');
                      setDateTo('');
                    }}
                  >
                    Limpar filtros
                  </Button>
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* Sales list (cards, not table) */}
            {filteredSales.length === 0 ? (
              <EmptyState
                icon={<ShoppingCart className="h-8 w-8 text-muted-foreground" />}
                title="Nenhuma venda encontrada"
                description={selectedEventId ? 'Ajuste os filtros ou selecione outro evento.' : 'Selecione um evento para visualizar suas vendas.'}
              />
            ) : (
              <div className="space-y-3">
                {filteredSales.map((sale) => {
                  const saleValue = sale.quantity * sale.unit_price;
                  return (
                    <Card key={sale.id}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{sale.event?.name || 'Evento'}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(sale.created_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {sale.customer_name} · {sale.quantity} passagem{sale.quantity > 1 ? 'ns' : ''}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold text-sm">R$ {saleValue.toFixed(2)}</p>
                            <StatusBadge status={sale.status} className="mt-1" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* Fixed share button */}
      {sellerId && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-card border-t z-30">
          <Button onClick={shareLink} className="w-full" size="lg">
            {copied ? (
              <>
                <Check className="h-5 w-5 mr-2" />
                Link Copiado!
              </>
            ) : (
              <>
                <Share2 className="h-5 w-5 mr-2" />
                Compartilhar Link de Venda
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
