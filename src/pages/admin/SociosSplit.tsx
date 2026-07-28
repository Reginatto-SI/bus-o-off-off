import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SocioSplit, SocioSplitStatus } from '@/types/database';
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
import { Handshake, Plus, Loader2, Pencil, Code2, AlertTriangle, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

/** Exibe apenas os últimos caracteres da wallet — nunca o identificador completo. */
function maskWallet(value?: string | null): string {
  if (!value) return '—';
  const trimmed = value.trim();
  if (trimmed.length <= 4) return '••••';
  return `••••${trimmed.slice(-4)}`;
}

export default function SociosSplit() {
  const { isDeveloper } = useAuth();
  const [socios, setSocios] = useState<SocioSplit[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    asaas_wallet_id_production: '',
    asaas_wallet_id_sandbox: '',
    status: 'ativo' as SocioSplitStatus,
    notes: '',
  });

  const activeSocio = socios.find((item) => item.status === 'ativo') ?? null;

  /**
   * Configuração GLOBAL da plataforma: a consulta não filtra nem envia company_id,
   * portanto o conteúdo não muda ao trocar a empresa ativa no painel.
   */
  const fetchSocios = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('socios_split')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[SociosSplit] Falha ao carregar sócio global', { code: error.code });
      toast.error('Não foi possível carregar a configuração do sócio da plataforma.');
      setSocios([]);
    } else {
      setSocios((data ?? []) as SocioSplit[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSocios();
    // Sem dependência de empresa ativa: configuração global.
  }, []);

  const openNew = () => {
    setEditingId(null);
    setForm({
      name: '',
      asaas_wallet_id_production: '',
      asaas_wallet_id_sandbox: '',
      status: 'ativo',
      notes: '',
    });
    setModalOpen(true);
  };

  const openEdit = (p: SocioSplit) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      asaas_wallet_id_production: p.asaas_wallet_id_production ?? '',
      asaas_wallet_id_sandbox: p.asaas_wallet_id_sandbox ?? '',
      status: p.status as SocioSplitStatus,
      notes: p.notes ?? '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (saving) return; // trava contra clique duplo

    if (!form.name.trim()) {
      toast.error('Informe o nome do sócio');
      return;
    }

    // Regra: no máximo 1 sócio global ativo (o banco também garante via índice único).
    if (form.status === 'ativo' && activeSocio && activeSocio.id !== editingId) {
      toast.error(
        `Já existe um sócio global ativo: "${activeSocio.name}". Inative-o antes de ativar outro.`,
      );
      return;
    }

    setSaving(true);
    // company_id não é enviado: o sócio é global da plataforma.
    const payload = {
      name: form.name.trim(),
      asaas_wallet_id_production: form.asaas_wallet_id_production.trim() || null,
      asaas_wallet_id_sandbox: form.asaas_wallet_id_sandbox.trim() || null,
      status: form.status,
      notes: form.notes.trim() || null,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from('socios_split').update(payload).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('socios_split').insert([payload]));
    }

    if (error) {
      console.error('[SociosSplit] Falha ao salvar sócio global', { code: error.code });
      if (error.code === '23505') {
        toast.error('Já existe um sócio global ativo. Inative o atual antes de ativar outro.');
      } else if (error.code === '42501') {
        toast.error('Você não tem permissão para alterar a configuração global da plataforma.');
      } else {
        toast.error('Não foi possível salvar a configuração do sócio.');
      }
    } else {
      toast.success(editingId ? 'Sócio global atualizado' : 'Sócio global cadastrado');
      setModalOpen(false);
      fetchSocios();
    }
    setSaving(false);
  };

  // Proteção de rota: página exclusiva para perfil developer (RLS é a proteção real).
  if (!isDeveloper) {
    return <Navigate to="/admin/eventos" replace />;
  }

  return (
    <AdminLayout>
      <div className="page-container">
        <PageHeader
          title="Sócio Global da Plataforma"
          metadata={
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="inline-flex items-center gap-1.5 border border-violet-300 bg-violet-100 text-violet-800 hover:bg-violet-100">
                  <Code2 className="h-3.5 w-3.5" />
                  Área do Desenvolvedor
                </Badge>
                <Badge variant="secondary" className="inline-flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" />
                  Configuração global
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Esta configuração é da plataforma SmartBus BR e não pertence a nenhuma empresa cliente.
                Trocar a empresa ativa no painel não altera o que é exibido aqui.
              </p>
            </div>
          }
          description="Sócio da plataforma que recebe parte da taxa em vendas de todas as empresas, via split direto no Asaas."
          actions={
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Sócio
            </Button>
          }
        />

        {!loading && activeSocio && !activeSocio.asaas_wallet_id_production && !activeSocio.asaas_wallet_id_sandbox && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              O sócio global ativo não possui carteira de produção nem de sandbox configurada.
              {activeSocio.asaas_wallet_id
                ? ' Há apenas a carteira legada preenchida — informe a carteira do ambiente correspondente.'
                : ' O split de sócio será ignorado até que uma carteira seja informada.'}
            </AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : socios.length === 0 ? (
          <EmptyState
            icon={<Handshake className="h-8 w-8 text-muted-foreground" />}
            title="Nenhum sócio global cadastrado"
            description="Cadastre o sócio da plataforma para dividir a taxa automaticamente via split Asaas."
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
                    <TableHead>Carteira produção</TableHead>
                    <TableHead>Carteira sandbox</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[60px]">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {socios.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">
                        {maskWallet(p.asaas_wallet_id_production)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">
                        {maskWallet(p.asaas_wallet_id_sandbox)}
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
              <DialogTitle>{editingId ? 'Editar Sócio Global' : 'Novo Sócio Global'}</DialogTitle>
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
                <Label>Carteira de recebimento — Produção</Label>
                <Input
                  value={form.asaas_wallet_id_production}
                  onChange={(e) => setForm({ ...form, asaas_wallet_id_production: e.target.value })}
                  placeholder="Wallet ID do ambiente de produção"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Usada somente em vendas de produção.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Carteira de recebimento — Sandbox</Label>
                <Input
                  value={form.asaas_wallet_id_sandbox}
                  onChange={(e) => setForm({ ...form, asaas_wallet_id_sandbox: e.target.value })}
                  placeholder="Wallet ID do ambiente de sandbox"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Usada somente em vendas de sandbox. As carteiras nunca são copiadas entre ambientes.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as SocioSplitStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Alerta: validação de 1 sócio global ativo */}
              {form.status === 'ativo' && activeSocio && activeSocio.id !== editingId && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Já existe um sócio global ativo. Apenas 1 pode estar ativo por vez. Inative o atual antes.
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
