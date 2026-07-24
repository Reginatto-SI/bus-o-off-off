import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { BoardingLocation } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AdminMobileBottomNav } from '@/components/layout/AdminMobileBottomNav';
import { AdminMobileHeader } from '@/components/layout/AdminMobileHeader';
import { AdminMobileMoreMenu } from '@/components/layout/AdminMobileMoreMenu';
import { adminMobileBottomNavItems } from '@/components/layout/adminMobileBottomNavItems';
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
  const [mobileMoreMenuOpen, setMobileMoreMenuOpen] = useState(false);
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
      <div className="min-h-screen bg-slate-50 pb-24 lg:bg-transparent lg:pb-0">
        <div className="lg:hidden">
          <AdminMobileHeader title="Locais de Embarque" subtitle="Pontos de embarque dos eventos" showMenuButton={false} />
        </div>

        <div className="mx-auto w-full max-w-md px-3 py-4 sm:px-6 lg:max-w-7xl lg:px-8 lg:py-6">
          <div className="hidden lg:block">
            <PageHeader
              title="Locais de Embarque"
              description="Gerencie os pontos de embarque"
              actions={
                <div className="flex w-full items-center gap-2 sm:w-auto">
                  <Button onClick={() => setDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Local
                  </Button>

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
          </div>

          <div className="mb-4 flex items-center gap-2 lg:hidden">
            <Button className="h-11 flex-1 rounded-xl px-3 text-sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4 shrink-0" />
              <span className="truncate">Adicionar local</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-xl bg-white" aria-label="Exportar locais de embarque">
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
                  Adicionar local
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
            <>
              <div className="space-y-3 lg:hidden">
                {filteredLocations.map((location) => {
                  const cityLabel = formatCityLabel(location.city, location.state);

                  return (
                    <Card key={location.id} className="overflow-hidden rounded-2xl border border-border/70 shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-2">
                            <p className="truncate text-base font-semibold text-foreground">{location.name}</p>
                            <StatusBadge status={location.status} />
                          </div>
                          <div className="shrink-0">
                            <ActionsDropdown actions={getLocationActions(location)} />
                          </div>
                        </div>

                        <div className="mt-4 rounded-xl bg-muted/40 p-3">
                          <div className="flex min-w-0 items-start gap-2">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <p className="line-clamp-3 min-w-0 break-words text-sm font-medium leading-relaxed text-foreground">
                              {location.address}
                            </p>
                          </div>
                        </div>

                        {cityLabel ? (
                          <div className="mt-3 flex min-w-0">
                            <span className="inline-flex max-w-full items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                              <span className="truncate">{cityLabel}</span>
                            </span>
                          </div>
                        ) : null}

                        {location.maps_url ? (
                          <a
                            href={location.maps_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-4 inline-flex max-w-full items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:text-primary/80"
                          >
                            <ExternalLink className="h-4 w-4 shrink-0" />
                            <span className="truncate">Abrir no Google Maps</span>
                          </a>
                        ) : null}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <Card className="hidden lg:block">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="admin-table-header">
                        <TableHead>Local</TableHead>
                        <TableHead>Endereço</TableHead>
                        <TableHead>Cidade/UF</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[80px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLocations.map((location) => (
                        <TableRow key={location.id} className="align-top">
                          <TableCell className="py-3 sm:py-4">
                            <div className="space-y-1.5">
                              <p className="font-semibold leading-tight">{location.name}</p>
                            </div>
                          </TableCell>
                          <TableCell>
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
                          <TableCell>
                            {location.city && location.state ? (
                              <span className="text-sm">{formatCityLabel(location.city, location.state)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-3 sm:py-4">
                            <StatusBadge status={location.status} />
                          </TableCell>
                          <TableCell className="py-3 sm:py-4">
                            <div className="flex items-center justify-end gap-1.5">
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
            </>
          )}

          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogContent className="admin-modal flex h-[92dvh] max-h-[92dvh] w-[calc(100vw-1rem)] max-w-md flex-col gap-0 overflow-hidden p-0 sm:h-auto sm:max-h-[90vh] sm:w-[95vw]">
              <DialogHeader className="admin-modal__header px-4 py-4 sm:px-6">
                <DialogTitle>{editingId ? 'Editar' : 'Novo'} Local</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
                <div className="admin-modal__body min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 scroll-pb-28 sm:px-6">
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
                </div>
                <div className="admin-modal__footer px-4 py-4 sm:px-6">
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <DialogClose asChild>
                      <Button type="button" variant="outline" className="w-full sm:w-auto">
                        Cancelar
                      </Button>
                    </DialogClose>
                    <Button type="submit" className="w-full sm:w-auto" disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                    </Button>
                  </div>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="lg:hidden">
          <AdminMobileBottomNav items={adminMobileBottomNavItems} onMoreClick={() => setMobileMoreMenuOpen(true)} />
          <AdminMobileMoreMenu open={mobileMoreMenuOpen} onOpenChange={setMobileMoreMenuOpen} />
        </div>
      </div>

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
    </AdminLayout>
  );
}
