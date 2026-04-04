import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { BoardingLocation } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatsCard } from '@/components/admin/StatsCard';
import { FilterCard } from '@/components/admin/FilterCard';
import { ActionsDropdown, ActionItem } from '@/components/admin/ActionsDropdown';
import { ExportExcelModal, ExportColumn } from '@/components/admin/ExportExcelModal';
import { ExportPDFModal } from '@/components/admin/ExportPDFModal';
import { CityAutocomplete } from '@/components/ui/city-autocomplete';
import { formatCityLabel } from '@/lib/cityUtils';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  MapPin,
  Plus,
  Loader2,
  Pencil,
  Power,
  CheckCircle,
  XCircle,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Ellipsis,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { buildDebugToastMessage, logSupabaseError } from '@/lib/errorDebug';

// Types
interface LocationFilters {
  search: string;
  status: 'all' | 'ativo' | 'inativo';
}

const initialFilters: LocationFilters = {
  search: '',
  status: 'all',
};

export default function BoardingLocations() {
  const { activeCompanyId, activeCompany, user, isGerente, isOperador } = useAuth();
  const [locations, setLocations] = useState<BoardingLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<LocationFilters>(initialFilters);
  // Autofill inteligente: última cidade usada
  const [lastUsedCity, setLastUsedCity] = useState<{ city: string; state: string } | null>(null);
  const [form, setForm] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    maps_url: '',
    notes: '',
  });

  // Export columns configuration
  const exportColumns: ExportColumn[] = [
    { key: 'name', label: 'Nome' },
    { key: 'address', label: 'Endereço' },
    { key: 'cityState', label: 'Cidade/UF' },
    { key: 'maps_url', label: 'Link Google Maps' },
    { key: 'notes', label: 'Observações' },
    { key: 'status', label: 'Status', format: (v) => (v === 'ativo' ? 'Ativo' : 'Inativo') },
  ];

  // Stats calculations
  const stats = useMemo(() => {
    const total = locations.length;
    const ativos = locations.filter((l) => l.status === 'ativo').length;
    const inativos = locations.filter((l) => l.status === 'inativo').length;
    return { total, ativos, inativos };
  }, [locations]);

  // Filtered locations
  const filteredLocations = useMemo(() => {
    return locations.filter((location) => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          location.name.toLowerCase().includes(searchLower) ||
          location.address.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Status filter
      if (filters.status !== 'all' && location.status !== filters.status) {
        return false;
      }

      return true;
    });
  }, [locations, filters]);

  // Dados para exportação com campo cityState formatado
  const exportData = useMemo(() => {
    return filteredLocations.map(location => ({
      ...location,
      cityState: formatCityLabel(location.city, location.state) || '—',
    }));
  }, [filteredLocations]);

  const hasActiveFilters = useMemo(() => {
    return filters.search !== '' || filters.status !== 'all';
  }, [filters]);

  // Guard: não buscar sem empresa ativa (isolamento multi-tenant obrigatório)
  const fetchLocations = async () => {
    if (!activeCompanyId) return;
    const { data, error } = await supabase
      .from('boarding_locations')
      .select('*')
      .eq('company_id', activeCompanyId)
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

  // Recarrega ao trocar empresa ativa (isolamento multi-tenant)
  useEffect(() => {
    if (activeCompanyId) fetchLocations();
  }, [activeCompanyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    if (!activeCompanyId) {
      const context = { action: editingId ? 'update' : 'insert', table: 'boarding_locations', companyId: null, userId: user?.id };
      console.error('active_company_id ausente ao salvar local de embarque.', context);
      toast.error(
        buildDebugToastMessage({
          title: 'active_company_id ausente',
          context,
        })
      );
      setSaving(false);
      return;
    }

    const isAdmin = isGerente || isOperador;
    if (!isAdmin) {
      console.warn('Permissão insuficiente ao salvar local: usuário não-admin.');
      toast.error('Você não tem permissão para salvar locais');
      setSaving(false);
      return;
    }

    const data = {
      name: form.name.trim(),
      address: form.address.trim(),
      city: form.city.trim() || null,
      state: form.state.trim().toUpperCase() || null,
      maps_url: form.maps_url.trim() || null,
      notes: form.notes.trim() || null,
      company_id: activeCompanyId,
    };

    let error;
    if (editingId) {
      const { company_id: _companyId, ...updateData } = data;
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
      // Salva a última cidade usada para autofill
      if (form.city || form.state) {
        setLastUsedCity({ city: form.city, state: form.state });
      }
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
      city: location.city || '',
      state: location.state || '',
      maps_url: location.maps_url || '',
      notes: location.notes || '',
    });
    setDialogOpen(true);
  };

  const handleToggleStatus = async (location: BoardingLocation) => {
    const nextStatus = location.status === 'ativo' ? 'inativo' : 'ativo';
    const { error } = await supabase
      .from('boarding_locations')
      .update({ status: nextStatus })
      .eq('id', location.id);

    if (error) {
      logSupabaseError({
        label: 'Erro ao atualizar status do local (boarding_locations.update)',
        error,
        context: { action: 'update', table: 'boarding_locations', companyId: activeCompanyId, userId: user?.id, locationId: location.id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao atualizar status',
          error,
          context: { action: 'update', table: 'boarding_locations', companyId: activeCompanyId, userId: user?.id, locationId: location.id },
        })
      );
    } else {
      toast.success(`Local ${nextStatus === 'ativo' ? 'ativado' : 'desativado'}`);
      fetchLocations();
    }
  };

  const resetForm = () => {
    setEditingId(null);
    // Autofill: mantém a última cidade usada para cadastros em sequência
    setForm({
      name: '',
      address: '',
      city: lastUsedCity?.city || '',
      state: lastUsedCity?.state || '',
      maps_url: '',
      notes: '',
    });
  };

  const getLocationActions = (location: BoardingLocation): ActionItem[] => [
    {
      label: 'Editar',
      icon: Pencil,
      onClick: () => handleEdit(location),
    },
    {
      label: location.status === 'ativo' ? 'Desativar' : 'Ativar',
      icon: Power,
      onClick: () => handleToggleStatus(location),
      variant: location.status === 'ativo' ? 'destructive' : 'default',
    },
  ];

  const handleExportExcel = () => {
    setExportModalOpen(true);
  };

  const handleExportPDF = () => {
    setPdfModalOpen(true);
  };

  return (
    <AdminLayout>
      <div className="page-container">
        {/* Header */}
        <PageHeader
          title="Locais de Embarque"
          description="Gerencie os pontos de embarque"
          actions={
            <div className="flex w-full items-center gap-2 sm:w-auto">
              {/* Mobile: priorizamos a ação principal e recolhemos exportações em menu secundário. */}
              <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button className="flex-1 sm:flex-none">
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Local
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  {/* Comentário: no mobile, priorizamos leitura vertical e ações empilhadas no formulário. */}
                  <DialogHeader>
                    <DialogTitle>{editingId ? 'Editar' : 'Novo'} Local</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome *</Label>
                      <Input
                        id="name"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="Terminal Rodoviário"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address">Endereço *</Label>
                      <Input
                        id="address"
                        value={form.address}
                        onChange={(e) => setForm({ ...form, address: e.target.value })}
                        placeholder="Av. Brasil, 1000 - Centro"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Cidade *</Label>
                      <CityAutocomplete
                        value={{ city: form.city, state: form.state }}
                        onChange={({ city, state }) => setForm({ ...form, city, state })}
                        placeholder="Selecione a cidade..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="maps_url">Link Google Maps</Label>
                      <Input
                        id="maps_url"
                        type="url"
                        value={form.maps_url}
                        onChange={(e) => setForm({ ...form, maps_url: e.target.value })}
                        placeholder="https://maps.google.com/..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notes">Observações</Label>
                      <Textarea
                        id="notes"
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        placeholder="Informações adicionais sobre o local..."
                        rows={3}
                      />
                    </div>
                    <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
                      <DialogClose asChild>
                        <Button type="button" variant="outline">
                          Cancelar
                        </Button>
                      </DialogClose>
                      <Button type="submit" disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>

              <div className="sm:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" aria-label="Mais ações">
                      <Ellipsis className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleExportExcel}>
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Exportar Excel
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportPDF}>
                      <FileText className="h-4 w-4 mr-2" />
                      Exportar PDF
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="hidden sm:flex sm:items-center sm:gap-2">
                <Button variant="outline" size="sm" onClick={handleExportExcel}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Excel
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportPDF}>
                  <FileText className="h-4 w-4 mr-2" />
                  PDF
                </Button>
              </div>
            </div>
          }
        />

        {/* Stats Cards */}
        {/* Mobile: reduzimos altura dos KPIs e priorizamos 2 colunas para economizar dobra inicial. */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:mb-6 sm:grid-cols-3 sm:gap-4">
          <StatsCard
            label="Total de Locais"
            value={stats.total}
            icon={MapPin}
            variant="default"
            className="col-span-2 min-h-0 p-3 sm:col-span-1 sm:p-4"
          />
          <StatsCard
            label="Locais Ativos"
            value={stats.ativos}
            icon={CheckCircle}
            variant="success"
            className="min-h-0 p-3 sm:p-4"
          />
          <StatsCard
            label="Locais Inativos"
            value={stats.inativos}
            icon={XCircle}
            variant="destructive"
            className="min-h-0 p-3 sm:p-4"
          />
        </div>

        {/* Filter Card */}
        <FilterCard
          searchValue={filters.search}
          onSearchChange={(value) => setFilters({ ...filters, search: value })}
          searchPlaceholder="Pesquisar por nome ou endereço..."
          selects={[
            {
              id: 'status',
              label: 'Status',
              placeholder: 'Status',
              value: filters.status,
              onChange: (value) => setFilters({ ...filters, status: value as LocationFilters['status'] }),
              options: [
                { value: 'all', label: 'Todos' },
                { value: 'ativo', label: 'Ativo' },
                { value: 'inativo', label: 'Inativo' },
              ],
            },
          ]}
          onClearFilters={() => setFilters(initialFilters)}
          hasActiveFilters={hasActiveFilters}
          className="mb-6"
        />

        {/* Content */}
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
        ) : filteredLocations.length === 0 ? (
          <EmptyState
            icon={<MapPin className="h-8 w-8 text-muted-foreground" />}
            title="Nenhum local encontrado"
            description="Ajuste os filtros para encontrar locais"
            action={
              <Button variant="outline" onClick={() => setFilters(initialFilters)}>
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="admin-table-header">
                    <TableHead>Local</TableHead>
                    <TableHead className="hidden md:table-cell">Endereço</TableHead>
                    <TableHead className="hidden lg:table-cell">Cidade/UF</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                  <TableBody>
                  {filteredLocations.map((location) => (
                    <TableRow key={location.id} className="align-top">
                      <TableCell className="py-3 sm:py-4">
                        {/* Comentário Fase 3: no mobile, agrupamos nome + contexto para reduzir salto visual entre colunas. */}
                        <div className="space-y-1.5">
                          <p className="font-semibold leading-tight">{location.name}</p>
                          <p className="text-sm text-muted-foreground md:hidden">{location.address}</p>
                          {location.city && location.state ? (
                            <p className="text-xs text-muted-foreground lg:hidden">{formatCityLabel(location.city, location.state)}</p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          <span className="truncate max-w-[300px]">{location.address}</span>
                          {location.maps_url && (
                            <a
                              href={location.maps_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:text-primary/80"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {location.city && location.state ? (
                          <span className="text-sm">{formatCityLabel(location.city, location.state)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-3 sm:py-4">
                        {/* Comentário Fase 3: mantemos status isolado para escaneabilidade rápida de ativo/inativo. */}
                        <StatusBadge status={location.status} />
                      </TableCell>
                      <TableCell className="py-3 sm:py-4">
                        {/* Mobile: reforçamos affordance das ações sem adicionar botões extras na linha. */}
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-[11px] font-medium text-muted-foreground md:hidden">Ações</span>
                          <div className="rounded-md border border-border/60 bg-muted/30">
                            <ActionsDropdown actions={getLocationActions(location)} />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Export Modals */}
        <ExportExcelModal
          open={exportModalOpen}
          onOpenChange={setExportModalOpen}
          data={exportData}
          columns={exportColumns}
          fileName="locais-embarque"
          storageKey="export-locations-columns"
        />

        <ExportPDFModal
          open={pdfModalOpen}
          onOpenChange={setPdfModalOpen}
          data={exportData}
          columns={exportColumns}
          fileName="locais-embarque"
          title="Locais de Embarque"
          storageKey="export-locations-pdf-columns"
          company={activeCompany}
        />
      </div>
    </AdminLayout>
  );
}
