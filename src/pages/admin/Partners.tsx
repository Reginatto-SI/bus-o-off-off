import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Partner, PartnerStatus } from '@/types/database';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/admin/PageHeader';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Handshake, Plus, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';

export default function Partners() {
  const { isDeveloper } = useAuth();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    stripe_account_id: '',
    status: 'ativo' as PartnerStatus,
    split_percent: '50',
    notes: '',
  });

  const fetchPartners = async () => {
    const { data, error } = await supabase
      .from('partners')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Erro ao carregar parceiros');
    } else {
      setPartners((data ?? []) as Partner[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPartners();
  }, []);

  const openNew = () => {
    setEditingId(null);
    setForm({ name: '', stripe_account_id: '', status: 'ativo', split_percent: '50', notes: '' });
    setModalOpen(true);
  };

  const openEdit = (p: Partner) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      stripe_account_id: p.stripe_account_id ?? '',
      status: p.status as PartnerStatus,
      split_percent: String(p.split_percent),
      notes: p.notes ?? '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Informe o nome do parceiro');
      return;
    }
    const splitNum = parseFloat(form.split_percent);
    if (isNaN(splitNum) || splitNum < 0 || splitNum > 100) {
      toast.error('Percentual de split inválido (0-100)');
      return;
    }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      stripe_account_id: form.stripe_account_id.trim() || null,
      status: form.status,
      split_percent: splitNum,
      notes: form.notes.trim() || null,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from('partners').update(payload).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('partners').insert([payload]));
    }

    if (error) {
      toast.error('Erro ao salvar parceiro');
    } else {
      toast.success(editingId ? 'Parceiro atualizado' : 'Parceiro cadastrado');
      setModalOpen(false);
      fetchPartners();
    }
    setSaving(false);
  };

  // Proteção de rota no front-end: página de parceiros é exclusiva para perfil developer.
  if (!isDeveloper) {
    return <Navigate to="/admin/eventos" replace />;
  }

  return (
    <AdminLayout>
      <div className="page-container">
        <PageHeader
          title="Parceiros"
          description="Gerencie os parceiros da plataforma e seus percentuais de comissão"
          actions={
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Parceiro
            </Button>
          }
        />

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : partners.length === 0 ? (
          <EmptyState
            icon={<Handshake className="h-8 w-8 text-muted-foreground" />}
            title="Nenhum parceiro cadastrado"
            description="Cadastre um parceiro para dividir a comissão da plataforma automaticamente"
            action={
              <Button onClick={openNew}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Parceiro
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
                    <TableHead>Stripe Account</TableHead>
                    <TableHead>Split (%)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[60px]">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partners.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.stripe_account_id || '—'}
                      </TableCell>
                      <TableCell>{p.split_percent}%</TableCell>
                      <TableCell>
                        <StatusBadge status={p.status} />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Modal */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar Parceiro' : 'Novo Parceiro'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Nome do parceiro"
                />
              </div>
              <div className="space-y-2">
                <Label>Stripe Account ID</Label>
                <Input
                  value={form.stripe_account_id}
                  onChange={(e) => setForm({ ...form, stripe_account_id: e.target.value })}
                  placeholder="acct_..."
                />
                <p className="text-xs text-muted-foreground">
                  ID da conta Stripe Connect do parceiro para recebimento automático
                </p>
              </div>
              <div className="space-y-2">
                <Label>Split (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={form.split_percent}
                  onChange={(e) => setForm({ ...form, split_percent: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Referência global. O valor efetivo é configurado por empresa.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as PartnerStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notas</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
