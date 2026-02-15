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
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
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
  Clock,
  Share2,
  Check,
  Filter,
  ChevronDown,
  LinkIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function SellerDashboard() {
  const { user, loading: authLoading, sellerId, profile, signOut, isVendedor, isDeveloper } = useAuth();

  const [sales, setSales] = useState<Sale[]>([]);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Filters
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
      setLoading(false);
    };

    fetchData();
  }, [sellerId]);

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      if (statusFilter !== 'todos' && sale.status !== statusFilter) return false;
      if (dateFrom && sale.created_at < dateFrom) return false;
      if (dateTo) {
        const endOfDay = dateTo + 'T23:59:59';
        if (sale.created_at > endOfDay) return false;
      }
      return true;
    });
  }, [sales, statusFilter, dateFrom, dateTo]);

  // KPIs
  const totalSold = filteredSales.reduce((sum, s) => sum + s.quantity, 0);
  const totalValue = filteredSales.reduce((sum, s) => sum + s.quantity * s.unit_price, 0);
  const paidSales = filteredSales.filter((s) => s.status === 'pago');
  const reservedSales = filteredSales.filter((s) => s.status === 'reservado');
  const paidValue = paidSales.reduce((sum, s) => sum + s.quantity * s.unit_price, 0);
  const reservedValue = reservedSales.reduce((sum, s) => sum + s.quantity * s.unit_price, 0);

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
                      <p className="text-xs text-muted-foreground">Total</p>
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
                    <Clock className="h-4 w-4 text-warning shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Reservadas</p>
                      <p className="text-lg font-bold">R$ {reservedValue.toFixed(2)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="mb-4">
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    Filtros
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
                description="Compartilhe seu link de venda para começar"
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
