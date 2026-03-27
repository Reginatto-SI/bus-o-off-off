import { useState, useEffect, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { UserRole, UserWithRole, Seller, Driver, ProfileStatus } from '@/types/database';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  Car,
  CheckCircle,
  FileSpreadsheet,
  FileText,
  Key,
  Link2,
  Loader2,
  Mail,
  MessageSquare,
  Pencil,
  Plus,
  Power,
  Settings,
  Shield,
  UserCheck,
  Users as UsersIcon,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { logSupabaseError } from '@/lib/errorDebug';
import { cn } from '@/lib/utils';

// Types
interface UserFilters {
  search: string;
  status: 'all' | 'ativo' | 'inativo';
  role: 'all' | UserRole;
}

interface CreateUserFunctionResponse {
  success?: boolean;
  error?: string;
  message?: string;
  user_id?: string;
  result?: 'created' | 'linked_existing';
  warnings?: string[];
  runtime_version?: string;
}

const initialFilters: UserFilters = {
  search: '',
  status: 'all',
  role: 'all',
};

const getCreateUserSuccessMessage = (response: CreateUserFunctionResponse): string => {
  if (response.result === 'linked_existing') {
    return 'Usuário existente vinculado à empresa atual com sucesso.';
  }

  if (response.result === 'created') {
    return 'Novo usuário criado e vinculado à empresa atual com sucesso.';
  }

  return response.message || 'Usuário salvo com sucesso.';
};

type MotoristaOperationalRole = 'motorista' | 'auxiliar_embarque';
type AccessProfileOption = UserRole | 'auxiliar_embarque';

const motoristaOperationalRoleConfig: Record<MotoristaOperationalRole, string> = {
  motorista: 'Motorista',
  auxiliar_embarque: 'Auxiliar de Embarque',
};

const getOperationalLabel = (role?: UserRole, operationalRole?: string | null): string => {
  if (role !== 'motorista') {
    return role ? roleConfig[role]?.label ?? role : '-';
  }

  // Compatibilidade retroativa: registros antigos sem o campo explícito
  // continuam sendo tratados visualmente como "Motorista".
  const resolvedOperationalRole: MotoristaOperationalRole =
    operationalRole === 'auxiliar_embarque' ? 'auxiliar_embarque' : 'motorista';
  return motoristaOperationalRoleConfig[resolvedOperationalRole];
};

const getAccessProfileOption = (role: UserRole, operationalRole: MotoristaOperationalRole): AccessProfileOption => {
  if (role !== 'motorista') return role;
  return operationalRole === 'auxiliar_embarque' ? 'auxiliar_embarque' : 'motorista';
};

// Role configuration for display
const roleConfig: Record<UserRole, { label: string; bgColor: string; textColor: string }> = {
  gerente: { label: 'Gerente', bgColor: 'bg-purple-100', textColor: 'text-purple-800' },
  operador: { label: 'Operador', bgColor: 'bg-blue-100', textColor: 'text-blue-800' },
  vendedor: { label: 'Vendedor', bgColor: 'bg-green-100', textColor: 'text-green-800' },
  motorista: { label: 'Motorista', bgColor: 'bg-orange-100', textColor: 'text-orange-800' },
  developer: { label: 'Developer', bgColor: 'bg-red-100', textColor: 'text-red-800' },
};

export default function UsersPage() {
  const { isGerente, activeCompanyId, activeCompany, user } = useAuth();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingUserRoleId, setEditingUserRoleId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'acesso' | 'vinculos' | 'observacoes'>('acesso');
  const [filters, setFilters] = useState<UserFilters>(initialFilters);

  // seller_id e driver_id conectam o usuário ao cadastro gerencial de vendedor/motorista
  // para controle interno de comissão e operação. Não tem relação com Stripe ou pagamento.
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'operador' as UserRole,
    status: 'ativo' as ProfileStatus,
    seller_id: '',
    driver_id: '',
    operational_role: 'motorista' as MotoristaOperationalRole,
    notes: '',
  });

  const handleAccessProfileChange = (value: AccessProfileOption) => {
    // O select exibe "Auxiliar de Embarque", mas a role técnica permanece motorista.
    if (value === 'auxiliar_embarque') {
      setForm({
        ...form,
        role: 'motorista',
        seller_id: '',
        driver_id: '',
        operational_role: 'auxiliar_embarque',
      });
      return;
    }

    setForm({
      ...form,
      role: value,
      seller_id: '',
      driver_id: '',
      operational_role: 'motorista',
    });
  };

  // Export columns configuration - must be before any conditional returns
  const exportColumns: ExportColumn[] = useMemo(() => [
    { key: 'name', label: 'Nome' },
    { key: 'email', label: 'E-mail' },
    { key: 'role', label: 'Perfil', format: (v) => roleConfig[v as UserRole]?.label ?? v },
    { key: 'status', label: 'Status', format: (v) => (v === 'ativo' ? 'Ativo' : 'Inativo') },
    { key: 'notes', label: 'Observações' },
  ], []);

  // Stats calculations - must be before any conditional returns
  const stats = useMemo(() => {
    const total = users.length;
    const ativos = users.filter((u) => u.status === 'ativo').length;
    const inativos = users.filter((u) => u.status === 'inativo').length;
    const gerentes = users.filter((u) => u.role === 'gerente').length;
    const operadores = users.filter((u) => u.role === 'operador').length;
    const vendedores = users.filter((u) => u.role === 'vendedor').length;
    const motoristas = users.filter((u) => u.role === 'motorista').length;
    return { total, ativos, inativos, gerentes, operadores, vendedores, motoristas };
  }, [users]);

  // Filtered users - must be before any conditional returns
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          u.name.toLowerCase().includes(searchLower) ||
          u.email.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Status filter
      if (filters.status !== 'all' && u.status !== filters.status) {
        return false;
      }

      // Role filter
      if (filters.role !== 'all' && u.role !== filters.role) {
        return false;
      }

      return true;
    });
  }, [users, filters]);

  const hasActiveFilters = useMemo(() => {
    return (
      filters.search !== '' ||
      filters.status !== 'all' ||
      filters.role !== 'all'
    );
  }, [filters]);

  const fetchUsers = async () => {
    if (!activeCompanyId) return;

    // Fetch all profiles with their roles for this company
    const { data: rolesData, error: rolesError } = await supabase
      .from('user_roles')
      .select(`
        id,
        user_id,
        role,
        seller_id,
        driver_id,
        operational_role,
        company_id
      `)
      .eq('company_id', activeCompanyId);

    if (rolesError) {
      logSupabaseError({
        label: 'Erro ao carregar roles (user_roles.select)',
        error: rolesError,
        context: { action: 'select', table: 'user_roles', companyId: activeCompanyId, userId: user?.id },
      });
      toast.error('Erro ao carregar usuários');
      setLoading(false);
      return;
    }

    if (!rolesData || rolesData.length === 0) {
      setUsers([]);
      setLoading(false);
      return;
    }

    // Fetch profiles for these users
    const userIds = rolesData.map((r) => r.user_id);
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .in('id', userIds);

    if (profilesError) {
      logSupabaseError({
        label: 'Erro ao carregar profiles (profiles.select)',
        error: profilesError,
        context: { action: 'select', table: 'profiles', companyId: activeCompanyId, userId: user?.id },
      });
      toast.error('Erro ao carregar perfis');
      setLoading(false);
      return;
    }

    // Fetch sellers for vendor users
    const sellerIds = rolesData.filter((r) => r.seller_id).map((r) => r.seller_id);
    let sellersMap: Record<string, Seller> = {};
    if (sellerIds.length > 0) {
      const { data: sellersData } = await supabase
        .from('sellers')
        .select('*')
        .in('id', sellerIds);
      if (sellersData) {
        sellersMap = sellersData.reduce((acc, s) => ({ ...acc, [s.id]: s }), {});
      }
    }

    // Fetch drivers for driver users
    const driverIds = rolesData.filter((r) => r.driver_id).map((r) => r.driver_id);
    let driversMap: Record<string, Driver> = {};
    if (driverIds.length > 0) {
      const { data: driversData } = await supabase
        .from('drivers')
        .select('*')
        .in('id', driverIds);
      if (driversData) {
        driversMap = driversData.reduce((acc, d) => ({ ...acc, [d.id]: d }), {});
      }
    }

    // Combine data
    const usersWithRoles: UserWithRole[] = rolesData.map((role) => {
      const profile = profilesData?.find((p) => p.id === role.user_id);
      return {
        id: profile?.id ?? role.user_id,
        name: profile?.name ?? 'Sem nome',
        email: profile?.email ?? '',
        status: (profile?.status as ProfileStatus) ?? 'ativo',
        notes: profile?.notes ?? null,
        company_id: profile?.company_id ?? null,
        created_at: profile?.created_at ?? '',
        updated_at: profile?.updated_at ?? '',
        role: role.role as UserRole,
        seller_id: role.seller_id,
        driver_id: role.driver_id,
        operational_role: role.operational_role,
        seller: role.seller_id ? sellersMap[role.seller_id] : null,
        driver: role.driver_id ? driversMap[role.driver_id] : null,
        user_role_id: role.id,
      };
    });

    setUsers(usersWithRoles);
    setLoading(false);
  };

  const fetchSellersAndDrivers = async () => {
    if (!activeCompanyId) return;

    // Fetch active sellers
    const { data: sellersData } = await supabase
      .from('sellers')
      .select('*')
      .eq('company_id', activeCompanyId)
      .eq('status', 'ativo')
      .order('name');

    if (sellersData) {
      setSellers(sellersData as Seller[]);
    }

    // Fetch active drivers
    const { data: driversData } = await supabase
      .from('drivers')
      .select('*')
      .eq('company_id', activeCompanyId)
      .eq('status', 'ativo')
      .order('name');

    if (driversData) {
      setDrivers(driversData as Driver[]);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchSellersAndDrivers();
  }, [activeCompanyId]);

  const availableDriversForOperationalRole = useMemo(() => {
    if (form.operational_role === 'auxiliar_embarque') {
      return drivers.filter((driver) => driver.operational_role === 'auxiliar_embarque');
    }
    return drivers.filter((driver) => driver.operational_role !== 'auxiliar_embarque');
  }, [drivers, form.operational_role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    if (!activeCompanyId) {
      toast.error('Empresa ativa não encontrada');
      setSaving(false);
      return;
    }

    // Validate required fields
    if (!form.name.trim()) {
      toast.error('Informe o nome do usuário');
      setSaving(false);
      return;
    }

    if (!form.email.trim()) {
      toast.error('Informe o e-mail do usuário');
      setSaving(false);
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email)) {
      toast.error('E-mail inválido');
      setSaving(false);
      return;
    }

    // Validate link for vendedor/motorista
    if (form.role === 'vendedor' && !form.seller_id) {
      // UX: direciona para a aba correta quando faltar vínculo obrigatório.
      setActiveTab('vinculos');
      toast.error('Selecione um vendedor para vincular');
      setSaving(false);
      return;
    }

    if (form.role === 'motorista' && !form.driver_id) {
      // Mensagem contextual: mantém regra técnica idêntica, muda apenas o texto exibido.
      const roleLabel = form.operational_role === 'auxiliar_embarque' ? 'auxiliar de embarque' : 'motorista';
      setActiveTab('vinculos');
      toast.error(`Selecione um ${roleLabel} para vincular`);
      setSaving(false);
      return;
    }

    try {
      if (editingId) {
        // Update existing user
        // Update profile
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            name: form.name.trim(),
            status: form.status,
            notes: form.notes || null,
          })
          .eq('id', editingId);

        if (profileError) {
          throw profileError;
        }

        // Update user_role
        if (editingUserRoleId) {
          // Ajuste do erro reportado: `.single()` no retorno de update pode falhar
          // com "cannot coerce ... single JSON object" em cenários de 0/múltiplas linhas.
          // Fazemos update e validação em 2 passos para manter robustez sem mudar o layout/fluxo.
          const { error: roleUpdateError } = await supabase
            .from('user_roles')
            .update({
              role: form.role,
              seller_id: form.role === 'vendedor' ? form.seller_id : null,
              driver_id: form.role === 'motorista' ? form.driver_id : null,
              // Mantém uma identificação operacional separada sem criar nova role técnica.
              operational_role: form.role === 'motorista' ? form.operational_role : null,
            })
            .eq('id', editingUserRoleId);

          if (roleUpdateError) {
            throw roleUpdateError;
          }

          const { data: updatedRole, error: roleFetchError } = await supabase
            .from('user_roles')
            .select('seller_id, driver_id, role, operational_role')
            .eq('id', editingUserRoleId)
            .maybeSingle();

          if (roleFetchError) {
            throw roleFetchError;
          }

          if (!updatedRole) {
            throw new Error('Não foi possível confirmar o vínculo salvo. Tente novamente.');
          }

          if (
            updatedRole.role !== form.role ||
            (form.role === 'vendedor' && updatedRole.seller_id !== form.seller_id) ||
            (form.role === 'motorista' && updatedRole.driver_id !== form.driver_id) ||
            (form.role === 'motorista' && updatedRole.operational_role !== form.operational_role)
          ) {
            throw new Error('Não foi possível confirmar o vínculo salvo. Tente novamente.');
          }

          if (
            updatedRole.role !== form.role ||
            (form.role === 'vendedor' && updatedRole.seller_id !== form.seller_id) ||
            (form.role === 'motorista' && updatedRole.driver_id !== form.driver_id) ||
            (form.role === 'motorista' && updatedRole.operational_role !== form.operational_role)
          ) {
            throw new Error('Não foi possível confirmar o vínculo salvo. Tente novamente.');
          }
        }

        // Causa raiz: o modal podia ser reaberto antes do refresh da lista e hidratar
        // com estado antigo. Esperamos o fetch terminar antes de fechar para garantir
        // que a próxima abertura já carregue o vínculo persistido.
        await fetchUsers();
        toast.success('Usuário atualizado com sucesso');
      } else {
        // Create new user via edge function
        const { data, error } = await supabase.functions.invoke<CreateUserFunctionResponse>('create-user', {
          body: {
            email: form.email.trim().toLowerCase(),
            name: form.name.trim(),
            role: form.role,
            status: form.status,
            notes: form.notes || null,
            seller_id: form.role === 'vendedor' ? form.seller_id : null,
            driver_id: form.role === 'motorista' ? form.driver_id : null,
            // A role técnica continua "motorista"; este campo só diferencia a identificação exibida.
            operational_role: form.role === 'motorista' ? form.operational_role : null,
            company_id: activeCompanyId,
          },
        });

        if (error) {
          throw error;
        }

        if (data?.error) {
          throw new Error(data.error);
        }

        // Correção: verificação defensiva pós-criação.
        // Mesmo que a edge function retorne sucesso, confirmamos que o vínculo
        // em user_roles realmente existe antes de declarar sucesso ao usuário.
        // Isso protege contra cenários de runtime desatualizado ou falha silenciosa.
        if (data?.user_id && activeCompanyId) {
          const { data: roleCheck, error: roleCheckError } = await supabase
            .from('user_roles')
            .select('id')
            .eq('user_id', data.user_id)
            .eq('company_id', activeCompanyId)
            .maybeSingle();

          if (roleCheckError || !roleCheck) {
            console.error('[UsersPage] Vínculo user_roles não encontrado após criação.', {
              user_id: data.user_id,
              company_id: activeCompanyId,
              roleCheckError,
            });
            throw new Error(
              'O usuário foi criado no sistema de autenticação, mas o vínculo com a empresa não foi confirmado. ' +
              'Verifique se a edge function create-user está atualizada e tente novamente.'
            );
          }
        }

        await fetchUsers();

        toast.success(getCreateUserSuccessMessage(data ?? {}));

        // Se o runtime publicado não devolver a assinatura mínima esperada,
        // registramos aviso porque isso indica deploy antigo e risco de legado.
        if (!data?.runtime_version) {
          console.warn('[UsersPage] Runtime do create-user sem versão auditável. Verifique deploy da edge function.');
          toast.warning('Ambiente de cadastro sem assinatura de versão. Verifique se a edge function create-user foi publicada.');
        }

        if (data?.warnings?.length) {
          toast.warning(data.warnings.join(' '));
        }
      }

      setDialogOpen(false);
      resetForm();
    } catch (error: unknown) {
      console.error('Erro ao salvar usuário:', error);
      const message = error instanceof Error ? error.message : 'Erro ao salvar usuário';
      toast.error(message);
    }

    setSaving(false);
  };

  const handleEdit = async (userToEdit: UserWithRole) => {
    const baseForm = {
      name: userToEdit.name,
      email: userToEdit.email,
      role: userToEdit.role ?? 'operador',
      status: userToEdit.status,
      seller_id: userToEdit.seller_id ?? '',
      driver_id: userToEdit.driver_id ?? '',
      operational_role:
        userToEdit.role === 'motorista' && userToEdit.operational_role === 'auxiliar_embarque'
          ? 'auxiliar_embarque'
          : 'motorista',
      notes: userToEdit.notes ?? '',
    };

    // Reidratação defensiva: busca vínculo mais recente no banco ao abrir o modal,
    // evitando mostrar vazio quando o relacionamento já foi salvo.
    if (userToEdit.user_role_id) {
      const { data: roleData, error } = await supabase
        .from('user_roles')
        .select('role, seller_id, driver_id, operational_role')
        .eq('id', userToEdit.user_role_id)
        .maybeSingle();

      if (error) {
        toast.error('Erro ao carregar vínculos do usuário');
        return;
      }

      if (!roleData) {
        toast.error('Vínculo do usuário não encontrado para edição');
        return;
      }

      baseForm.role = (roleData.role as UserRole) ?? baseForm.role;
      baseForm.seller_id = roleData.seller_id ?? '';
      baseForm.driver_id = roleData.driver_id ?? '';
      baseForm.operational_role =
        roleData.role === 'motorista' && roleData.operational_role === 'auxiliar_embarque'
          ? 'auxiliar_embarque'
          : 'motorista';
    }

    setEditingId(userToEdit.id);
    setEditingUserRoleId(userToEdit.user_role_id ?? null);
    setForm(baseForm);
    setActiveTab('acesso');
    setDialogOpen(true);
  };

  const handleToggleStatus = async (userToToggle: UserWithRole) => {
    const nextStatus = userToToggle.status === 'ativo' ? 'inativo' : 'ativo';
    const { error } = await supabase
      .from('profiles')
      .update({ status: nextStatus })
      .eq('id', userToToggle.id);

    if (error) {
      logSupabaseError({
        label: 'Erro ao atualizar status do usuário',
        error,
        context: { action: 'update', table: 'profiles', userId: userToToggle.id },
      });
      toast.error('Erro ao atualizar status');
    } else {
      toast.success(`Usuário ${nextStatus === 'ativo' ? 'ativado' : 'desativado'}`);
      fetchUsers();
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setEditingUserRoleId(null);
    setActiveTab('acesso');
    setForm({
      name: '',
      email: '',
      role: 'operador',
      status: 'ativo',
      seller_id: '',
      driver_id: '',
      operational_role: 'motorista',
      notes: '',
    });
  };

  const motoristaVinculoLabel = form.operational_role === 'auxiliar_embarque' ? 'Auxiliar de Embarque' : 'Motorista';
  const motoristaVinculoLabelLower = form.operational_role === 'auxiliar_embarque' ? 'auxiliar de embarque' : 'motorista';

  const getUserActions = (u: UserWithRole): ActionItem[] => [
    {
      label: 'Editar',
      icon: Pencil,
      onClick: () => handleEdit(u),
    },
    {
      label: u.status === 'ativo' ? 'Desativar' : 'Ativar',
      icon: Power,
      onClick: () => handleToggleStatus(u),
      variant: u.status === 'ativo' ? 'destructive' : 'default',
    },
  ];

  const getVinculo = (u: UserWithRole): string => {
    if (u.role === 'vendedor' && u.seller) return u.seller.name;
    if (u.role === 'motorista' && u.driver) return u.driver.name;
    return '-';
  };

  // Access control - only gerentes can access this page (after all hooks)
  if (!isGerente) {
    return <Navigate to="/admin/eventos" replace />;
  }

  return (
    <AdminLayout>
      <div className="page-container">
        {/* Header */}
        <PageHeader
          title="Usuários"
          description="Gerencie os usuários e acessos do sistema"
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => setExportModalOpen(true)}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPdfModalOpen(true)}>
                <FileText className="h-4 w-4 mr-2" />
                PDF
              </Button>
              <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Usuário
                  </Button>
                </DialogTrigger>
                <DialogContent className="admin-modal flex h-[90vh] max-h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 p-0">
                  <DialogHeader className="admin-modal__header px-6 py-4">
                    <DialogTitle>{editingId ? 'Editar' : 'Novo'} Usuário</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="flex h-full flex-col">
                    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'acesso' | 'vinculos' | 'observacoes')} className="flex h-full flex-col">
                      <TabsList className="admin-modal__tabs flex h-auto w-full flex-wrap justify-start gap-1 px-6 py-2">
                        <TabsTrigger
                          value="acesso"
                          className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80"
                        >
                          <Key className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 truncate">Acesso</span>
                        </TabsTrigger>
                        <TabsTrigger
                          value="vinculos"
                          className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80"
                        >
                          <Link2 className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 truncate">Vínculos</span>
                        </TabsTrigger>
                        <TabsTrigger
                          value="observacoes"
                          className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground/80"
                        >
                          <MessageSquare className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 truncate">Observações</span>
                        </TabsTrigger>
                      </TabsList>

                      <div className="admin-modal__body flex-1 overflow-y-auto px-6 py-4">
                        {/* Tab: Acesso */}
                        <TabsContent value="acesso" className="mt-0">
                          <div className="mb-4 rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
                            {/* Texto discreto para reduzir ambiguidade operacional sem inventar novo onboarding. */}
                            Este cadastro cria ou vincula o acesso do usuário à empresa atual. Para perfis de vendedor e motorista, o vínculo com o cadastro correspondente é obrigatório. Se o e-mail já existir, o sistema tentará vincular o acesso à empresa atual.
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="name">Nome completo</Label>
                              <Input
                                id="name"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder="João da Silva"
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="email">E-mail</Label>
                              <Input
                                id="email"
                                type="email"
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                placeholder="email@exemplo.com"
                                required
                                disabled={!!editingId}
                              />
                              {editingId && (
                                <p className="text-xs text-muted-foreground">
                                  O e-mail não pode ser alterado após a criação.
                                </p>
                              )}
                            </div>
                            <div className="space-y-2">
                              <Label>Perfil de acesso</Label>
                              <Select
                                value={getAccessProfileOption(form.role, form.operational_role)}
                                onValueChange={(value: AccessProfileOption) => handleAccessProfileChange(value)}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="gerente">Gerente</SelectItem>
                                  <SelectItem value="operador">Operador</SelectItem>
                                  <SelectItem value="vendedor">Vendedor</SelectItem>
                                  <SelectItem value="motorista">Motorista</SelectItem>
                                  <SelectItem value="auxiliar_embarque">Auxiliar de Embarque</SelectItem>
                                </SelectContent>
                              </Select>
                              {form.role === 'motorista' && (
                                <p className="text-xs text-muted-foreground">
                                  A role técnica permanece <strong>motorista</strong>; o perfil escolhido acima define a identificação exibida no sistema.
                                </p>
                              )}
                            </div>
                            <div className="space-y-2">
                              <Label>Status</Label>
                              <Select
                                value={form.status}
                                onValueChange={(value: ProfileStatus) => setForm({ ...form, status: value })}
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
                          </div>
                        </TabsContent>

                        {/* Tab: Vínculos */}
                        <TabsContent value="vinculos" className="mt-0">
                          {form.role === 'vendedor' ? (
                            <div className="space-y-4">
                              <div className="rounded-lg border p-4">
                                <h4 className="mb-4 font-medium">Vincular Vendedor</h4>
                                <div className="space-y-2">
                                  <Label>Selecione um vendedor</Label>
                                  <Select
                                    value={form.seller_id}
                                    onValueChange={(value) => setForm({ ...form, seller_id: value })}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Selecione um vendedor..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {sellers.map((seller) => (
                                        <SelectItem key={seller.id} value={seller.id}>
                                          {seller.name} ({seller.commission_percent}% comissão)
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {sellers.length === 0 && (
                                    <p className="text-sm text-muted-foreground">
                                      Nenhum vendedor cadastrado. Cadastre vendedores na tela de Vendedores.
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : form.role === 'motorista' ? (
                            <div className="space-y-4">
                              <div className="rounded-lg border p-4">
                                <h4 className="mb-4 font-medium">Vincular {motoristaVinculoLabel}</h4>
                                <div className="space-y-2">
                                  <Label>Selecione um {motoristaVinculoLabelLower}</Label>
                                  <Select
                                    value={form.driver_id}
                                    onValueChange={(value) => setForm({ ...form, driver_id: value })}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder={`Selecione um ${motoristaVinculoLabelLower}...`} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {availableDriversForOperationalRole.map((driver) => (
                                        <SelectItem key={driver.id} value={driver.id}>
                                          {driver.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {availableDriversForOperationalRole.length === 0 && (
                                    <p className="text-sm text-muted-foreground">
                                      Nenhum {motoristaVinculoLabelLower} cadastrado. Cadastre {form.operational_role === 'auxiliar_embarque' ? 'auxiliares' : 'motoristas'} na tela de Motoristas.
                                    </p>
                                  )}
                                </div>
                                <div className="mt-4 space-y-2">
                                  <Label>Identificação operacional</Label>
                                  <Select
                                    value={form.operational_role}
                                    onValueChange={(value: MotoristaOperationalRole) => setForm({ ...form, operational_role: value })}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="motorista">Motorista</SelectItem>
                                      <SelectItem value="auxiliar_embarque">Auxiliar de Embarque</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <p className="text-xs text-muted-foreground">
                                    Essa escolha não altera permissões, RLS ou acesso ao app operacional.
                                  </p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-lg border border-dashed p-6 text-center">
                              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                                <Link2 className="h-6 w-6 text-muted-foreground" />
                              </div>
                              <h4 className="mb-1 font-medium">Nenhum vínculo necessário</h4>
                              <p className="text-sm text-muted-foreground">
                                O perfil de {roleConfig[form.role]?.label?.toLowerCase() || form.role} não requer vínculo com cadastros.
                              </p>
                            </div>
                          )}
                        </TabsContent>

                        {/* Tab: Observações */}
                        <TabsContent value="observacoes" className="mt-0">
                          <div className="space-y-2">
                            <Label htmlFor="notes">Observações internas</Label>
                            <Textarea
                              id="notes"
                              value={form.notes}
                              onChange={(e) => setForm({ ...form, notes: e.target.value })}
                              placeholder="Observações sobre este usuário..."
                              rows={6}
                            />
                            <p className="text-xs text-muted-foreground">
                              Estas observações são visíveis apenas para gerentes.
                            </p>
                          </div>
                        </TabsContent>
                      </div>
                    </Tabs>
                    <div className="admin-modal__footer px-6 py-4">
                      <div className="flex flex-wrap justify-end gap-3">
                        <DialogClose asChild>
                          <Button type="button" variant="outline">
                            Cancelar
                          </Button>
                        </DialogClose>
                        <Button type="submit" disabled={saving}>
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                        </Button>
                      </div>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          }
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
          <StatsCard
            label="Total de usuários"
            value={stats.total}
            icon={UsersIcon}
          />
          <StatsCard
            label="Usuários ativos"
            value={stats.ativos}
            icon={CheckCircle}
            variant="success"
          />
          <StatsCard
            label="Usuários inativos"
            value={stats.inativos}
            icon={XCircle}
            variant="destructive"
          />
          <StatsCard
            label="Gerentes"
            value={stats.gerentes}
            icon={Shield}
          />
          <StatsCard
            label="Operadores"
            value={stats.operadores}
            icon={Settings}
          />
          <StatsCard
            label="Vendedores"
            value={stats.vendedores}
            icon={UserCheck}
          />
          <StatsCard
            label="Motoristas"
            value={stats.motoristas}
            icon={Car}
          />
        </div>

        {/* Filters */}
        <FilterCard
          className="mb-6"
          searchValue={filters.search}
          onSearchChange={(value) => setFilters({ ...filters, search: value })}
          searchPlaceholder="Pesquisar por nome ou e-mail..."
          selects={[
            {
              id: 'status',
              label: 'Status',
              placeholder: 'Status',
              value: filters.status,
              onChange: (value) => setFilters({ ...filters, status: value as UserFilters['status'] }),
              options: [
                { value: 'all', label: 'Todos' },
                { value: 'ativo', label: 'Ativo' },
                { value: 'inativo', label: 'Inativo' },
              ],
            },
            {
              id: 'role',
              label: 'Perfil',
              placeholder: 'Perfil',
              value: filters.role,
              onChange: (value) => setFilters({ ...filters, role: value as UserFilters['role'] }),
              options: [
                { value: 'all', label: 'Todos' },
                { value: 'gerente', label: 'Gerente' },
                { value: 'operador', label: 'Operador' },
                { value: 'vendedor', label: 'Vendedor' },
                { value: 'motorista', label: 'Motorista' },
              ],
            },
          ]}
          onClearFilters={() => setFilters(initialFilters)}
          hasActiveFilters={hasActiveFilters}
        />

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : users.length === 0 ? (
          <EmptyState
            icon={<UsersIcon className="h-8 w-8 text-muted-foreground" />}
            title="Nenhum usuário cadastrado"
            description="Adicione usuários para gerenciar acessos ao sistema"
            action={
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Usuário
              </Button>
            }
          />
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            icon={<UsersIcon className="h-8 w-8 text-muted-foreground" />}
            title="Nenhum usuário encontrado"
            description="Ajuste os filtros para encontrar usuários"
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
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Vínculo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[60px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          {u.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        {u.role && (
                          <span className={cn(
                            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                            roleConfig[u.role]?.bgColor,
                            roleConfig[u.role]?.textColor
                          )}>
                            {getOperationalLabel(u.role, u.operational_role)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{getVinculo(u)}</TableCell>
                      <TableCell>
                        <StatusBadge status={u.status} />
                      </TableCell>
                      <TableCell>
                        <ActionsDropdown actions={getUserActions(u)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Export Excel Modal */}
        <ExportExcelModal
          open={exportModalOpen}
          onOpenChange={setExportModalOpen}
          columns={exportColumns}
          data={filteredUsers}
          storageKey="usuarios"
          fileName="usuarios"
          sheetName="Usuários"
        />

        {/* Export PDF Modal */}
        <ExportPDFModal
          open={pdfModalOpen}
          onOpenChange={setPdfModalOpen}
          columns={exportColumns}
          data={filteredUsers}
          storageKey="usuarios"
          fileName="usuarios"
          title="Usuários do Sistema"
          company={activeCompany}
        />
      </div>
    </AdminLayout>
  );
}
