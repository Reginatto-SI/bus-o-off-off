import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { BoardingLocation } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MapPin, Plus, Loader2, Pencil, Trash2, Clock, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { buildDebugToastMessage, logSupabaseError } from '@/lib/errorDebug';

export default function BoardingLocations() {
  const { activeCompanyId, user } = useAuth();
  const [locations, setLocations] = useState<BoardingLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', address: '', time: '', maps_url: '' });

  const fetchLocations = async () => {
    const { data, error } = await supabase
      .from('boarding_locations')
      .select('*')
      .order('name');

    if (error) {
      logSupabaseError({
        label: 'Erro ao carregar locais (boarding_locations.select)',
        error,
        context: { action: 'select', table: 'boarding_locations', companyId: activeCompanyId, userId: user?.id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao carregar locais',
          error,
          context: { action: 'select', table: 'boarding_locations', companyId: activeCompanyId, userId: user?.id },
        })
      );
    } else {
      setLocations(data as BoardingLocation[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    if (!activeCompanyId) {
      const context = { action: editingId ? 'update' : 'insert', table: 'boarding_locations', companyId: null, userId: user?.id };
      // Comentário: mantém toast amigável, com contexto adicional apenas no modo debug.
      console.error('Nenhuma empresa ativa ao salvar local de embarque.', context);
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
      address: form.address,
      time: form.time,
      maps_url: form.maps_url || null,
      company_id: activeCompanyId,
    };

    let error;
    if (editingId) {
      // Não atualiza company_id na edição
      const { company_id, ...updateData } = data;
      ({ error } = await supabase.from('boarding_locations').update(updateData).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('boarding_locations').insert([data]));
    }

    if (error) {
      logSupabaseError({
        label: 'Erro ao salvar local (boarding_locations.insert/update)',
        error,
        context: {
          action: editingId ? 'update' : 'insert',
          table: 'boarding_locations',
          companyId: activeCompanyId,
          userId: user?.id,
          editingId,
          payload: data,
        },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao salvar local',
          error,
          context: {
            action: editingId ? 'update' : 'insert',
            table: 'boarding_locations',
            companyId: activeCompanyId,
            userId: user?.id,
            editingId,
          },
        })
      );
    } else {
      toast.success(editingId ? 'Local atualizado' : 'Local cadastrado');
      setDialogOpen(false);
      resetForm();
      fetchLocations();
    }
    setSaving(false);
  };

  const handleEdit = (location: BoardingLocation) => {
    setEditingId(location.id);
    setForm({
      name: location.name,
      address: location.address,
      time: location.time,
      maps_url: location.maps_url || '',
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('boarding_locations').delete().eq('id', id);
    if (error) {
      logSupabaseError({
        label: 'Erro ao excluir local (boarding_locations.delete)',
        error,
        context: { action: 'delete', table: 'boarding_locations', companyId: activeCompanyId, userId: user?.id, locationId: id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao excluir local',
          error,
          context: { action: 'delete', table: 'boarding_locations', companyId: activeCompanyId, userId: user?.id, locationId: id },
        })
      );
    } else {
      toast.success('Local excluído');
      fetchLocations();
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({ name: '', address: '', time: '', maps_url: '' });
  };

  return (
    <AdminLayout>
      <div className="page-container">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Locais de Embarque</h1>
            <p className="text-muted-foreground">Gerencie os pontos de embarque</p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Local
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? 'Editar' : 'Novo'} Local</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Terminal Rodoviário"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Endereço</Label>
                  <Input
                    id="address"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Av. Brasil, 1000 - Centro"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">Horário Padrão</Label>
                  <Input
                    id="time"
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maps_url">Link Google Maps (opcional)</Label>
                  <Input
                    id="maps_url"
                    type="url"
                    value={form.maps_url}
                    onChange={(e) => setForm({ ...form, maps_url: e.target.value })}
                    placeholder="https://maps.google.com/..."
                  />
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
        ) : locations.length === 0 ? (
          <EmptyState
            icon={<MapPin className="h-8 w-8 text-muted-foreground" />}
            title="Nenhum local cadastrado"
            description="Adicione pontos de embarque para seus eventos"
            action={
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Local
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
                    <TableHead>Endereço</TableHead>
                    <TableHead>Horário</TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {locations.map((location) => (
                    <TableRow key={location.id}>
                      <TableCell className="font-medium">{location.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {location.address}
                          {location.maps_url && (
                            <a href={location.maps_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4 text-primary" />
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          {location.time.slice(0, 5)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(location)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(location.id)}>
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
