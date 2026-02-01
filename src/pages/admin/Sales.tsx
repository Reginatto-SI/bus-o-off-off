import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sale } from '@/types/database';
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
import { ShoppingCart, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuthContext } from '@/contexts/AuthContext';

export default function Sales() {
  const { canViewFinancials } = useAuthContext();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSales = async () => {
    const { data, error } = await supabase
      .from('sales')
      .select('*, event:events(*), boarding_location:boarding_locations(*), seller:sellers(*)')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Erro ao carregar vendas');
    } else {
      setSales(data as Sale[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSales();
  }, []);

  const handleMarkAsPaid = async (saleId: string) => {
    const { error } = await supabase
      .from('sales')
      .update({ status: 'pago' })
      .eq('id', saleId);

    if (error) {
      toast.error('Erro ao atualizar status');
    } else {
      toast.success('Venda marcada como paga');
      fetchSales();
    }
  };

  const totalSales = sales.reduce((sum, sale) => sum + sale.quantity * sale.unit_price, 0);

  return (
    <AdminLayout>
      <div className="page-container">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Vendas</h1>
            <p className="text-muted-foreground">Todas as vendas realizadas</p>
          </div>

          {canViewFinancials && sales.length > 0 && (
            <Card className="w-full sm:w-auto">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Total em Vendas</p>
                <p className="text-2xl font-bold text-primary">
                  R$ {totalSales.toFixed(2)}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : sales.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart className="h-8 w-8 text-muted-foreground" />}
            title="Nenhuma venda realizada"
            description="As vendas aparecerão aqui quando forem feitas pelo portal"
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Qtd</TableHead>
                    {canViewFinancials && <TableHead>Valor</TableHead>}
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell className="text-sm">
                        {format(new Date(sale.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{sale.customer_name}</p>
                          <p className="text-sm text-muted-foreground">{sale.customer_phone}</p>
                        </div>
                      </TableCell>
                      <TableCell>{sale.event?.name}</TableCell>
                      <TableCell>{sale.quantity}</TableCell>
                      {canViewFinancials && (
                        <TableCell className="font-medium">
                          R$ {(sale.quantity * sale.unit_price).toFixed(2)}
                        </TableCell>
                      )}
                      <TableCell>{sale.seller?.name || '-'}</TableCell>
                      <TableCell>
                        <StatusBadge status={sale.status} />
                      </TableCell>
                      <TableCell>
                        {sale.status === 'reservado' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleMarkAsPaid(sale.id)}
                            title="Marcar como pago"
                          >
                            <CheckCircle className="h-4 w-4 text-success" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
