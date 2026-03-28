import { createContext, useContext, useEffect, useState, ReactNode, useRef, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { UserRole, Profile, Company } from '@/types/database';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  userRole: UserRole | null;
  sellerId: string | null;
  activeCompanyId: string | null;
  activeCompany: Company | null;
  userCompanies: Company[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  switchCompany: (companyId: string) => void;
  updateActiveCompany: (company: Company) => void;
  isGerente: boolean;
  isOperador: boolean;
  isVendedor: boolean;
  isDeveloper: boolean;
  canAccessTemplatesLayout: boolean;
  canViewFinancials: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Usuário multiempresa com permissão especial: deve permanecer developer em qualquer empresa ativa.
  const FORCED_DEVELOPER_USER_ID = '27add21e-ade9-436a-9ec2-185a3d7819cc';
  // Exceção operacional: usuário sócio com acesso técnico total APENAS à tela de templates de layout.
  const TEMPLATES_LAYOUT_EXCEPTION_USER_ID = 'f1ba5ea7-2d3d-4171-b651-c1917655e5b1';

  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [userCompanies, setUserCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const resolveEffectiveRole = (userId: string, role: UserRole): UserRole => {
    // Regra de negócio obrigatória: este usuário nunca pode assumir gerente/operador.
    if (userId === FORCED_DEVELOPER_USER_ID) return 'developer';
    return role;
  };

  const fetchUserData = useCallback(async (userId: string) => {
    try {
      // Fetch profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('Erro ao carregar profile (profiles.select)', {
          code: profileError.code,
          message: profileError.message,
          details: profileError.details,
          hint: profileError.hint,
        });
      }

      if (profileData) {
        setProfile(profileData as Profile);
      }

      // Fetch user roles and companies
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', userId);

      if (rolesError) {
        console.error('Erro ao carregar roles (user_roles.select)', {
          code: rolesError.code,
          message: rolesError.message,
          details: rolesError.details,
          hint: rolesError.hint,
        });
      }

      if (!rolesData || rolesData.length === 0) {
        // Sem vínculos — limpa estado e finaliza
        setUserCompanies([]);
        setActiveCompanyId(null);
        setActiveCompany(null);
        setUserRole(null);
        setSellerId(null);
        return; // finally → setLoading(false)
      }

      const companyIds = rolesData.map((role: any) => role.company_id).filter(Boolean);

      if (companyIds.length === 0) {
        console.warn('[AuthContext] Nenhum company_id válido encontrado em user_roles. Usando fallback.');
        const firstRole = rolesData[0];
        if (firstRole) {
          setUserRole(resolveEffectiveRole(userId, firstRole.role as UserRole));
          setSellerId(firstRole.seller_id);
        }
        setUserCompanies([]);
        setActiveCompanyId(null);
        setActiveCompany(null);
        return;
      }

      // Developer cross-company: buscar TODAS as empresas ativas
      const isDev = rolesData.some((r: any) => r.role === 'developer');

      const companiesQuery = isDev
        ? supabase.from('companies').select('*').eq('is_active', true)
        : supabase.from('companies').select('*').in('id', companyIds);

      const { data: companiesData, error: companiesError } = await companiesQuery;

      if (companiesError) {
        console.error('[AuthContext] Erro ao carregar empresas (companies.select)', {
          code: companiesError.code,
          message: companiesError.message,
          details: companiesError.details,
          hint: companiesError.hint,
        });
        const firstRole = rolesData[0];
        if (firstRole) {
          setUserRole(resolveEffectiveRole(userId, firstRole.role as UserRole));
          setSellerId(firstRole.seller_id);
        }
        setUserCompanies([]);
        setActiveCompanyId(null);
        setActiveCompany(null);
        return;
      }

      const activeCompanies = ((companiesData ?? []) as Company[]).filter(
        (company) => company.is_active === true
      );

      const uniqueCompanies = activeCompanies.filter(
        (company: Company, index: number, self: Company[]) =>
          index === self.findIndex((c) => c.id === company.id)
      );

      setUserCompanies(uniqueCompanies);

      // --- Resolver empresa ativa ---
      const savedCompanyId = localStorage.getItem(`activeCompany_${userId}`);

      // Bug fix: limpar localStorage se empresa salva não existe mais na lista ativa
      const isSavedCompanyValid = savedCompanyId && uniqueCompanies.some(c => c.id === savedCompanyId);
      if (savedCompanyId && !isSavedCompanyValid) {
        console.warn('[AuthContext] Empresa salva no localStorage não encontrada nas empresas ativas. Limpando.');
        localStorage.removeItem(`activeCompany_${userId}`);
      }

      // Correção multiempresa: profiles.company_id já foi contaminado por legado
      // da empresa padrão. A empresa ativa precisa vir dos vínculos oficiais em
      // user_roles, nunca do profile como fonte de verdade.
      const firstRoleCompanyId =
        companyIds.find((companyId) => uniqueCompanies.some((company) => company.id === companyId)) ?? null;

      // Prioridade: localStorage válido > primeiro vínculo real em user_roles > primeira empresa ativa
      const validCompanyId = isSavedCompanyValid
        ? savedCompanyId
        : (firstRoleCompanyId ?? uniqueCompanies[0]?.id ?? null);

      if (validCompanyId) {
        setActiveCompanyId(validCompanyId);
        setActiveCompany(uniqueCompanies.find((c: Company) => c.id === validCompanyId) || null);
        localStorage.setItem(`activeCompany_${userId}`, validCompanyId);

        const roleForCompany = rolesData.find((r: any) => r.company_id === validCompanyId);
        if (roleForCompany) {
          setUserRole(resolveEffectiveRole(userId, roleForCompany.role as UserRole));
          setSellerId(roleForCompany.seller_id);
        } else if (isDev) {
          // Bug fix: developer cross-company pode não ter user_roles para a empresa selecionada.
          // Garantir que o role nunca fica null nesse caso.
          setUserRole('developer');
          setSellerId(null);
        } else {
          // Fallback: usar role do primeiro registro
          const firstRole = rolesData[0];
          if (firstRole) {
            setUserRole(resolveEffectiveRole(userId, firstRole.role as UserRole));
            setSellerId(firstRole.seller_id);
          }
        }
      } else {
        console.warn('[AuthContext] Nenhuma empresa ativa disponível. Usando role do primeiro vínculo.');
        const firstRole = rolesData[0];
        if (firstRole) {
          setUserRole(resolveEffectiveRole(userId, firstRole.role as UserRole));
          setSellerId(firstRole.seller_id);
        }
        setActiveCompanyId(null);
        setActiveCompany(null);
      }
    } catch (error) {
      console.error('[AuthContext] Erro inesperado ao resolver dados do usuário:', error);
      setUserCompanies([]);
      setActiveCompanyId(null);
      setActiveCompany(null);
      setUserRole(null);
      setSellerId(null);
    } finally {
      // Bug fix: loading só é false DEPOIS que todos os dados foram resolvidos.
      // Isso evita que AdminLayout veja userRole=null enquanto fetchUserData ainda roda.
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Bug fix: NÃO setar loading=false aqui. fetchUserData faz isso no finally.
          // Usar setTimeout para evitar deadlock do Supabase no onAuthStateChange.
          setTimeout(() => fetchUserData(session.user.id), 0);
        } else {
          setProfile(null);
          setUserRole(null);
          setSellerId(null);
          setActiveCompanyId(null);
          setActiveCompany(null);
          setUserCompanies([]);
          setLoading(false);
        }
      }
    );

    // Checar sessão existente — se não houver, desligar loading
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchUserData]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const switchCompany = (companyId: string) => {
    const company = userCompanies.find((c) => c.id === companyId);
    if (company && user) {
      setActiveCompanyId(companyId);
      setActiveCompany(company);
      localStorage.setItem(`activeCompany_${user.id}`, companyId);

      // Update role for the new company
      supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user.id)
        .eq('company_id', companyId)
        .single()
        .then(({ data }) => {
          if (data) {
            setUserRole(resolveEffectiveRole(user.id, data.role as UserRole));
            setSellerId(data.seller_id);
          } else if (userRole === 'developer' || user.id === FORCED_DEVELOPER_USER_ID) {
            // Developer sem vínculo específico para esta empresa — manter role developer
            setUserRole('developer');
            setSellerId(null);
          }
        });
    }
  };

  const updateActiveCompany = (company: Company) => {
    setActiveCompany((prev) => (prev?.id === company.id ? company : prev));
    setUserCompanies((prevCompanies) =>
      prevCompanies.map((existingCompany) =>
        existingCompany.id === company.id ? company : existingCompany
      )
    );
  };

  // Developer herda acesso de gerente automaticamente
  const isDeveloper = userRole === 'developer';
  // Exceção pontual sem trocar role técnica: mantém escopo limitado à rota /admin/templates-layout.
  const canAccessTemplatesLayout = isDeveloper || user?.id === TEMPLATES_LAYOUT_EXCEPTION_USER_ID;
  const isGerente = userRole === 'gerente' || isDeveloper;
  const isOperador = userRole === 'operador';
  const isVendedor = userRole === 'vendedor';
  const canViewFinancials = userRole === 'gerente' || isDeveloper;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        userRole,
        sellerId,
        activeCompanyId,
        activeCompany,
        userCompanies,
        loading,
        signIn,
        signOut,
        switchCompany,
        updateActiveCompany,
        isGerente,
        isOperador,
        isVendedor,
        isDeveloper,
        canAccessTemplatesLayout,
        canViewFinancials,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
