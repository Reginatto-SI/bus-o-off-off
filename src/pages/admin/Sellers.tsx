import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Seller } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { UserCheck, Plus, Loader2, Pencil, Trash2, Percent } from 'lucide-react';
import { toast } from 'sonner';
import { buildDebugToastMessage, logSupabaseError } from '@/lib/errorDebug';

export default function Sellers() {
  const { activeCompanyId, user } = useAuth();
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    commission_percent: '10',
    status: 'ativo' as Seller['status'],
  });

  const fetchSellers = async () => {
    const { data, error } = await supabase
      .from('sellers')
      .select('*')
      .order('name');

    if (error) {
      logSupabaseError({
        label: 'Erro ao carregar vendedores (sellers.select)',
        error,
        context: { action: 'select', table: 'sellers', companyId: activeCompanyId, userId: user?.id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao carregar vendedores',
          error,
          context: { action: 'select', table: 'sellers', companyId: activeCompanyId, userId: user?.id },
        })
      );
    } else {
      setSellers(data as Seller[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSellers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    if (!activeCompanyId) {
      const context = { action: editingId ? 'update' : 'insert', table: 'sellers', companyId: null, userId: user?.id };
      // Comentário: mantém mensagem amigável; detalhes completos apenas em DEBUG_ERRORS.
      console.error('Nenhuma empresa ativa ao salvar vendedor.', context);
      toast.error(
        buildDebugToastMessage({
          title: 'Nenhuma empresa ativa',
          context,
        })
      );
      setSaving(false);
      return;
    }

    const data = {
      name: form.name,
      commission_percent: parseFloat(form.commission_percent),
      status: form.status,
      company_id: activeCompanyId,
    };

    let error;
    if (editingId) {
      // Não atualiza company_id na edição
      const { company_id, ...updateData } = data;
      ({ error } = await supabase.from('sellers').update(updateData).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('sellers').insert([data]));
    }

    if (error) {
      logSupabaseError({
        label: 'Erro ao salvar vendedor (sellers.insert/update)',
        error,
        context: {
          action: editingId ? 'update' : 'insert',
          table: 'sellers',
          companyId: activeCompanyId,
          userId: user?.id,
          editingId,
          payload: data,
        },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao salvar vendedor',
          error,
          context: {
            action: editingId ? 'update' : 'insert',
            table: 'sellers',
            companyId: activeCompanyId,
            userId: user?.id,
            editingId,
          },
        })
      );
    } else {
      toast.success(editingId ? 'Vendedor atualizado' : 'Vendedor cadastrado');
      setDialogOpen(false);
      resetForm();
      fetchSellers();
    }
    setSaving(false);
  };

  const handleEdit = (seller: Seller) => {
    setEditingId(seller.id);
    setForm({
      name: seller.name,
      commission_percent: seller.commission_percent.toString(),
      status: seller.status,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('sellers').delete().eq('id', id);
    if (error) {
      logSupabaseError({
        label: 'Erro ao excluir vendedor (sellers.delete)',
        error,
        context: { action: 'delete', table: 'sellers', companyId: activeCompanyId, userId: user?.id, sellerId: id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao excluir vendedor',
          error,
          context: { action: 'delete', table: 'sellers', companyId: activeCompanyId, userId: user?.id, sellerId: id },
        })
      );
    } else {
      toast.success('Vendedor excluído');
      fetchSellers();
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({ name: '', commission_percent: '10', status: 'ativo' });
  };

  return (
    <AdminLayout>
      <div className="page-container">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Vendedores</h1>
            <p className="text-muted-foreground">Gerencie os vendedores e comissões</p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Vendedor
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? 'Editar' : 'Novo'} Vendedor</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commission">Comissão (%)</Label>
                  <Input
                    id="commission"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={form.commission_percent}
                    onChange={(e) => setForm({ ...form, commission_percent: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(value: Seller['status']) => setForm({ ...form, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : sellers.length === 0 ? (
          <EmptyState
            icon={<UserCheck className="h-8 w-8 text-muted-foreground" />}
            title="Nenhum vendedor cadastrado"
            description="Adicione vendedores para rastrear comissões"
            action={
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Vendedor
              </Button>
            }
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Comissão</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sellers.map((seller) => (
                    <TableRow key={seller.id}>
                      <TableCell className="font-medium">{seller.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Percent className="h-4 w-4 text-muted-foreground" />
                          {seller.commission_percent}%
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={seller.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(seller)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(seller.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
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
