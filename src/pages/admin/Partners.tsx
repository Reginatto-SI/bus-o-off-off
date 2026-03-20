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
import { Handshake, Plus, Loader2, Pencil, Code2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function Partners() {
  const { isDeveloper, activeCompanyId } = useAuth();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    asaas_wallet_id: '',
    status: 'ativo' as PartnerStatus,
    notes: '',
  });

  const fetchPartners = async () => {
    if (!activeCompanyId) {
      setPartners([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('partners')
      .select('*')
      // Fase 1 do saneamento: `partners` continua legado no nome,
      // mas agora precisa respeitar escopo multiempresa por company_id.
      .eq('company_id', activeCompanyId)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Erro ao carregar sócios');
    } else {
      setPartners((data ?? []) as Partner[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPartners();
  }, [activeCompanyId]);

  const openNew = () => {
    setEditingId(null);
    setForm({ name: '', asaas_wallet_id: '', status: 'ativo', notes: '' });
    setModalOpen(true);
  };

  const openEdit = (p: Partner) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      asaas_wallet_id: p.asaas_wallet_id ?? '',
      status: p.status as PartnerStatus,
      notes: p.notes ?? '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Informe o nome do sócio');
      return;
    }

    if (!activeCompanyId) {
      toast.error('Selecione uma empresa ativa antes de gerenciar sócios');
      return;
    }

    // Regra: no máximo 1 sócio ativo. Se tentando salvar como ativo, verificar conflito.
    if (form.status === 'ativo') {
      const existingActive = partners.find(
        (p) => p.status === 'ativo' && p.id !== editingId
      );
      if (existingActive) {
        toast.error(
          `Já existe um sócio ativo: "${existingActive.name}". Inative-o antes de ativar outro.`
        );
        return;
      }
    }

    setSaving(true);
    const payload = {
      company_id: activeCompanyId,
      name: form.name.trim(),
      asaas_wallet_id: form.asaas_wallet_id.trim() || null,
      status: form.status,
      notes: form.notes.trim() || null,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase
        .from('partners')
        .update(payload)
        .eq('id', editingId)
        .eq('company_id', activeCompanyId));
    } else {
      ({ error } = await supabase.from('partners').insert([payload]));
    }

    if (error) {
      toast.error('Erro ao salvar sócio');
    } else {
      toast.success(editingId ? 'Sócio atualizado' : 'Sócio cadastrado');
      setModalOpen(false);
      fetchPartners();
    }
    setSaving(false);
  };

  // Proteção de rota: página exclusiva para perfil developer.
  if (!isDeveloper) {
    return <Navigate to="/admin/eventos" replace />;
  }

  return (
    <AdminLayout>
      <div className="page-container">
        <PageHeader
          title="Sócios da Plataforma"
          metadata={
            <div className="space-y-2">
              <Badge variant="secondary" className="inline-flex items-center gap-1.5 border border-violet-300 bg-violet-100 text-violet-800 hover:bg-violet-100">
                <Code2 className="h-3.5 w-3.5" />
                Área do Desenvolvedor
              </Badge>
              <p className="text-xs text-muted-foreground">
                Cadastro técnico dos sócios da plataforma. O percentual de repasse é configurado individualmente por empresa na aba Pagamentos.
              </p>
            </div>
          }
          description="Gerencie os sócios que recebem parte da comissão da plataforma via split direto no Asaas."
          actions={
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Sócio
            </Button>
          }
        />

        {!activeCompanyId && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Selecione uma empresa ativa para visualizar ou cadastrar o sócio financeiro responsável pelo split.
            </AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : partners.length === 0 ? (
          <EmptyState
            icon={<Handshake className="h-8 w-8 text-muted-foreground" />}
            title="Nenhum sócio cadastrado"
            description="Cadastre um sócio para dividir a comissão da plataforma automaticamente via split Asaas."
            action={
              <Button onClick={openNew}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Sócio
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
                    <TableHead>Asaas Wallet ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[60px]">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partners.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">
                        {p.asaas_wallet_id || '—'}
                      </TableCell>
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

        {/* Modal de cadastro/edição */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar Sócio' : 'Novo Sócio'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Nome do sócio"
                />
              </div>
              <div className="space-y-2">
                <Label>Asaas Wallet ID</Label>
                <Input
                  value={form.asaas_wallet_id}
                  onChange={(e) => setForm({ ...form, asaas_wallet_id: e.target.value })}
                  placeholder="Ex: 5f7e3b2a-..."
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Identificador da carteira do sócio no Asaas. Usado para receber o split direto no pagamento.
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

              {/* Alerta: validação de 1 sócio ativo */}
              {form.status === 'ativo' && partners.some((p) => p.status === 'ativo' && p.id !== editingId) && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Já existe um sócio ativo. Apenas 1 sócio pode estar ativo por vez. Inative o atual antes.
                  </AlertDescription>
                </Alert>
              )}

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
