import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sale, Seller } from '@/types/database';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LinkIcon, ShoppingCart, Loader2, Copy, Check, DollarSign, Ticket } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';

export default function MySales() {
  const { sellerId } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchData = async () => {
    if (!sellerId) {
      setLoading(false);
      return;
    }

    const [salesRes, sellerRes] = await Promise.all([
      supabase
        .from('sales')
        .select('*, event:events(*), boarding_location:boarding_locations(*)')
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false }),
      supabase.from('sellers').select('*').eq('id', sellerId).single(),
    ]);

    if (salesRes.data) setSales(salesRes.data as Sale[]);
    if (sellerRes.data) setSeller(sellerRes.data as Seller);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [sellerId]);

  const generateLink = () => {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/eventos?ref=${sellerId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success('Link copiado!');
    setTimeout(() => setCopied(false), 2000);
  };

  const totalSold = sales.reduce((sum, sale) => sum + sale.quantity, 0);
  const totalValue = sales.reduce((sum, sale) => sum + sale.quantity * sale.unit_price, 0);
  const estimatedCommission = seller ? totalValue * (seller.commission_percent / 100) : 0;

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  if (!sellerId) {
    return (
      <AdminLayout>
        <div className="page-container">
          <EmptyState
            icon={<LinkIcon className="h-8 w-8 text-muted-foreground" />}
            title="Conta não vinculada"
            description="Sua conta não está vinculada a um vendedor. Entre em contato com o administrador."
          />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="page-container">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Minhas Vendas</h1>
            <p className="text-muted-foreground">Acompanhe suas vendas e comissões</p>
          </div>

          <Button onClick={generateLink}>
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Copiado!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Gerar Link de Venda
              </>
            )}
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Ticket className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Passagens Vendidas</p>
                  <p className="text-2xl font-bold">{totalSold}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-success/10 rounded-lg">
                  <ShoppingCart className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Vendido</p>
                  <p className="text-2xl font-bold">R$ {totalValue.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-warning/10 rounded-lg">
                  <DollarSign className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Comissão Estimada ({seller?.commission_percent}%)
                  </p>
                  <p className="text-2xl font-bold">R$ {estimatedCommission.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {sales.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart className="h-8 w-8 text-muted-foreground" />}
            title="Nenhuma venda realizada"
            description="Compartilhe seu link de venda para começar a vender"
            action={
              <Button onClick={generateLink}>
                <Copy className="h-4 w-4 mr-2" />
                Gerar Link de Venda
              </Button>
            }
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Histórico de Vendas</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Qtd</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Comissão</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((sale) => {
                    const saleValue = sale.quantity * sale.unit_price;
                    const commission = seller ? saleValue * (seller.commission_percent / 100) : 0;
                    return (
                      <TableRow key={sale.id}>
                        <TableCell className="text-sm">
                          {format(new Date(sale.created_at), "dd/MM/yy", { locale: ptBR })}
                        </TableCell>
                        <TableCell>{sale.customer_name}</TableCell>
                        <TableCell>{sale.event?.name}</TableCell>
                        <TableCell>{sale.quantity}</TableCell>
                        <TableCell>R$ {saleValue.toFixed(2)}</TableCell>
                        <TableCell className="text-success font-medium">
                          R$ {commission.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={sale.status} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
