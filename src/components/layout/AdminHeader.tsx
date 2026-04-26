import { useMemo, useState } from 'react';
import { Bell, Building2, ChevronDown, LogOut, User, Check, AlertTriangle, CheckCircle2, Info, Siren } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { VersionIndicator } from '@/components/system/VersionIndicator';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useAdminNotifications, type AdminNotificationSeverity } from '@/hooks/use-admin-notifications';
import { useRuntimePaymentEnvironment } from '@/hooks/use-runtime-payment-environment';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Company } from '@/types/database';

export function AdminHeader() {
  const { profile, userRole, signOut, activeCompany, userCompanies, switchCompany } = useAuth();
  const hasMultipleCompanies = userCompanies.length > 1;
  const [companySelectorOpen, setCompanySelectorOpen] = useState(false);
  const [companySearch, setCompanySearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectorCompanies, setSelectorCompanies] = useState<Company[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    companyId: string;
    companyName: string;
    nextIsActive: boolean;
  } | null>(null);
  const canAccessAdminNotifications = userRole === 'gerente' || userRole === 'operador' || userRole === 'developer';
  const { isSandbox } = useRuntimePaymentEnvironment();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useAdminNotifications({
    activeCompanyId: activeCompany?.id ?? null,
    canAccessAdminNotifications,
  });

  // Tempo relativo leve para leitura operacional rápida no dropdown.
  const formatTimeAgo = (isoDate: string) => {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Agora';
    if (diffMins < 60) return `${diffMins}min atrás`;
    if (diffHours < 24) return `${diffHours}h atrás`;
    return `${diffDays}d atrás`;
  };

  const getSeverityStyles = (severity: AdminNotificationSeverity) => {
    switch (severity) {
      case 'success':
        return {
          icon: CheckCircle2,
          iconClassName: 'text-emerald-600',
          dotClassName: 'bg-emerald-600',
        };
      case 'warning':
        return {
          icon: AlertTriangle,
          iconClassName: 'text-amber-600',
          dotClassName: 'bg-amber-600',
        };
      case 'critical':
        return {
          icon: Siren,
          iconClassName: 'text-destructive',
          dotClassName: 'bg-destructive',
        };
      case 'info':
      default:
        return {
          icon: Info,
          iconClassName: 'text-primary',
          dotClassName: 'bg-primary',
        };
    }
  };

  const filteredCompanies = useMemo(() => {
    const normalizedSearch = companySearch.trim().toLowerCase();

    return selectorCompanies.filter((company) => {
      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'active'
            ? company.is_active
            : !company.is_active;

      if (!matchesStatus) return false;
      if (!normalizedSearch) return true;

      const companyName = (company.name ?? '').toLowerCase();
      const tradeName = (company.trade_name ?? '').toLowerCase();
      const legalName = (company.legal_name ?? '').toLowerCase();
      const document = (company.document_number ?? company.cnpj ?? company.document ?? '').toLowerCase();

      return (
        companyName.includes(normalizedSearch)
        || tradeName.includes(normalizedSearch)
        || legalName.includes(normalizedSearch)
        || document.includes(normalizedSearch)
      );
    });
  }, [companySearch, statusFilter, selectorCompanies]);

  const isDeveloper = userRole === 'developer';

  const loadSelectorCompanies = async () => {
    // Fase 2: preservamos comportamento para perfis não-developer usando a mesma lista já resolvida no AuthContext.
    if (!isDeveloper) {
      setSelectorCompanies(userCompanies);
      return;
    }

    setLoadingCompanies(true);
    const { data, error } = await supabase
      .from('companies')
      // Otimização Fase 2: carregar apenas colunas usadas no modal do header.
      .select('id, name, trade_name, legal_name, document_number, cnpj, is_active')
      .order('name', { ascending: true })
      .limit(100);


    if (error) {
      toast.error('Não foi possível carregar a lista completa de empresas.');
      setSelectorCompanies(userCompanies);
      setLoadingCompanies(false);
      return;
    }

    setSelectorCompanies((data as Company[]) ?? []);
    setLoadingCompanies(false);
  };

  const handleCompanySelectorOpenChange = (open: boolean) => {
    setCompanySelectorOpen(open);

    if (!open) return;

    // Fase 2: sempre resetamos busca/filtro ao abrir para evitar estado antigo no modal.
    setCompanySearch('');
    setStatusFilter('all');
    void loadSelectorCompanies();
  };

  const handleConfirmStatusChange = async () => {
    if (!pendingStatusChange) return;

    const target = pendingStatusChange;
    const { error } = await supabase
      .from('companies')
      .update({ is_active: target.nextIsActive })
      .eq('id', target.companyId);

    if (error) {
      toast.error(target.nextIsActive ? 'Erro ao ativar empresa.' : 'Erro ao inativar empresa.');
      return;
    }

    toast.success(target.nextIsActive ? 'Empresa ativada com sucesso.' : 'Empresa inativada com sucesso.');
    setPendingStatusChange(null);
    await loadSelectorCompanies();
  };

  return (
    <header className="hidden lg:flex h-16 items-center justify-between gap-4 border-b border-border bg-card px-6">
      {/* Company Selector / Indicator */}
      <div className="flex items-center gap-2">
        {hasMultipleCompanies ? (
          <Dialog open={companySelectorOpen} onOpenChange={handleCompanySelectorOpenChange}>
            <DialogTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 h-auto py-1.5 px-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-foreground">{activeCompany?.name || 'Selecionar empresa'}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>Seletor avançado de empresas</DialogTitle>
              </DialogHeader>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  value={companySearch}
                  onChange={(event) => setCompanySearch(event.target.value)}
                  placeholder="Buscar por nome ou CPF/CNPJ"
                  className="sm:flex-1"
                />
                <Select value={statusFilter} onValueChange={(value: 'all' | 'active' | 'inactive') => setStatusFilter(value)}>
                  <SelectTrigger className="sm:w-44">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="active">Ativas</SelectItem>
                    <SelectItem value="inactive">Inativas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="max-h-[55vh] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[120px] text-right">Ação</TableHead>
                      {isDeveloper && <TableHead className="w-[120px] text-right">Status</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingCompanies ? (
                      <TableRow>
                        <TableCell colSpan={isDeveloper ? 5 : 4} className="py-8 text-center text-sm text-muted-foreground">
                          Carregando empresas...
                        </TableCell>
                      </TableRow>
                    ) : filteredCompanies.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={isDeveloper ? 5 : 4} className="py-8 text-center text-sm text-muted-foreground">
                          Nenhuma empresa encontrada para os filtros aplicados.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredCompanies.map((company) => {
                        const document = company.document_number || company.cnpj || company.document || '—';
                        const isCurrent = company.id === activeCompany?.id;
                        const canSelectCompany = company.is_active;
                        const canToggleStatus = isDeveloper;

                        return (
                          <TableRow
                            key={company.id}
                            className={cn(!company.is_active && 'opacity-60')}
                          >
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <span>{company.name}</span>
                                {isCurrent && <Check className="h-4 w-4 text-primary" />}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{document}</TableCell>
                            <TableCell>
                              <Badge variant={company.is_active ? 'default' : 'secondary'}>
                                {company.is_active ? 'Ativa' : 'Inativa'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={!canSelectCompany}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (!canSelectCompany) return;
                                  switchCompany(company.id);
                                  setCompanySelectorOpen(false);
                                }}
                              >
                                Selecionar
                              </Button>
                            </TableCell>
                            {canToggleStatus && (
                              <TableCell className="text-right">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={company.is_active ? 'destructive' : 'secondary'}
                                  onClick={() => {
                                    if (company.is_active && isCurrent) {
                                      toast.warning('Não é possível inativar a empresa atualmente selecionada. Troque para outra empresa antes.');
                                      return;
                                    }

                                    setPendingStatusChange({
                                      companyId: company.id,
                                      companyName: company.name,
                                      nextIsActive: !company.is_active,
                                    });
                                  }}
                                >
                                  {company.is_active ? 'Inativar' : 'Ativar'}
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </DialogContent>
          </Dialog>
        ) : activeCompany ? (
          <div className="flex items-center gap-2 px-3 py-1.5">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-foreground">{activeCompany.name}</span>
          </div>
        ) : null}

        {/*
          Badge operacional: aparece somente quando a API oficial resolve sandbox.
          Não há regra paralela no frontend; o valor vem da mesma lógica de decisão do backend.
        */}
        {isSandbox && (
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-50">
            Sandbox
          </Badge>
        )}
      </div>

      <AlertDialog open={!!pendingStatusChange} onOpenChange={(open) => !open && setPendingStatusChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingStatusChange?.nextIsActive ? 'Reativar empresa?' : 'Inativar empresa?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStatusChange?.nextIsActive
                ? 'Tem certeza que deseja reativar esta empresa? Ela voltará a aparecer como empresa ativa para seleção operacional.'
                : 'Tem certeza que deseja inativar esta empresa? Ela deixará de aparecer no seletor rápido e não deverá ser usada operacionalmente até ser reativada. O histórico será preservado.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmStatusChange}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex items-center gap-2 xl:gap-4">
      {/* CTA "Indique e Ganhe" ocultado no header global por decisão de produto. */}

      {/* Version indicator */}
      <VersionIndicator />

      {/* Notifications */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5 text-muted-foreground" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h4 className="font-semibold text-foreground">Notificações</h4>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={markAllAsRead}
              >
                Marcar todas como lidas
              </Button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma notificação
              </div>
            ) : (
              notifications.map((notification) => {
                const severityStyles = getSeverityStyles(notification.severity);
                const SeverityIcon = severityStyles.icon;

                return (
                  <div
                    key={notification.id}
                    className={cn(
                      'border-b border-border px-4 py-3 last:border-0',
                      !notification.is_read && 'bg-muted/50'
                    )}
                    onClick={() => markAsRead(notification.id)}
                  >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-1 items-start gap-2">
                      <SeverityIcon className={cn('mt-0.5 h-4 w-4 shrink-0', severityStyles.iconClassName)} />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {notification.title}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {notification.message}
                        </p>
                        {notification.action_link && (
                          <Link
                            to={notification.action_link}
                            className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
                            onClick={(event) => event.stopPropagation()}
                          >
                            Ver detalhes →
                          </Link>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatTimeAgo(notification.created_at)}
                    </span>
                  </div>
                  {!notification.is_read && (
                    <div className="mt-1 flex justify-end">
                      <div className={cn('h-2 w-2 rounded-full', severityStyles.dotClassName)} />
                    </div>
                  )}
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* User Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="hidden text-left md:block">
              <p className="text-sm font-medium text-foreground truncate max-w-[120px]">
                {profile?.name}
              </p>
              <p className="text-xs text-muted-foreground capitalize">
                {userRole}
              </p>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div>
              <p className="font-medium">{profile?.name}</p>
              <p className="text-xs text-muted-foreground">{profile?.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive cursor-pointer"
            onClick={signOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </div>
    </header>
  );
}
