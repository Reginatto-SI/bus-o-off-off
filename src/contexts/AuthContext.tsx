import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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
  isGerente: boolean;
  isOperador: boolean;
  isVendedor: boolean;
  canViewFinancials: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [userCompanies, setUserCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUserData = async (userId: string) => {
    // Fetch profile
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError) {
      // Comentário: visibilidade de falhas ao carregar perfil (necessário para resolver empresa ativa).
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
      // Comentário: diagnóstico de falhas ao carregar vínculos do usuário com empresas.
      console.error('Erro ao carregar roles (user_roles.select)', {
        code: rolesError.code,
        message: rolesError.message,
        details: rolesError.details,
        hint: rolesError.hint,
      });
    }

    if (rolesData && rolesData.length > 0) {
      const companyIds = rolesData.map((role: any) => role.company_id).filter(Boolean);

      const { data: companiesData, error: companiesError } = await supabase
        .from('companies')
        .select('*')
        .in('id', companyIds)
        .eq('is_active', true);

      if (companiesError) {
        // Comentário: diagnóstico de falhas ao carregar empresas ativas vinculadas ao usuário.
        console.error('Erro ao carregar empresas (companies.select)', {
          code: companiesError.code,
          message: companiesError.message,
          details: companiesError.details,
          hint: companiesError.hint,
        });
      }

      const companies = (companiesData ?? []) as Company[];
      const uniqueCompanies = companies.filter(
        (company: Company, index: number, self: Company[]) =>
          index === self.findIndex((c) => c.id === company.id)
      );

      setUserCompanies(uniqueCompanies);

      const profileCompanyId = profileData?.company_id ?? null;
      const profileActiveCompanyId =
        uniqueCompanies.find((company) => company.id === profileCompanyId)?.id ?? null;

      // Comentário: se o profile estiver inválido/inativo, usa a primeira empresa ativa vinculada.
      const validCompanyId = profileActiveCompanyId ?? uniqueCompanies[0]?.id ?? null;

      if (validCompanyId) {
        setActiveCompanyId(validCompanyId);
        setActiveCompany(uniqueCompanies.find((c: Company) => c.id === validCompanyId) || null);
        localStorage.setItem(`activeCompany_${userId}`, validCompanyId);

        const roleForCompany = rolesData.find((r: any) => r.company_id === validCompanyId);
        if (roleForCompany) {
          setUserRole(roleForCompany.role as UserRole);
          setSellerId(roleForCompany.seller_id);
        }
      } else {
        // Comentário: garante estado limpo quando não há empresa ativa disponível.
        setActiveCompanyId(null);
        setActiveCompany(null);
        setUserRole(null);
        setSellerId(null);
      }
    } else {
      // Comentário: evita resíduos de estado quando o usuário não possui vínculos.
      setUserCompanies([]);
      setActiveCompanyId(null);
      setActiveCompany(null);
      setUserRole(null);
      setSellerId(null);
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Defer data fetching to avoid Supabase deadlock
          setTimeout(() => fetchUserData(session.user.id), 0);
        } else {
          setProfile(null);
          setUserRole(null);
          setSellerId(null);
          setActiveCompanyId(null);
          setActiveCompany(null);
          setUserCompanies([]);
        }

        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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
            setUserRole(data.role as UserRole);
            setSellerId(data.seller_id);
          }
        });
    }
  };

  const isGerente = userRole === 'gerente';
  const isOperador = userRole === 'operador';
  const isVendedor = userRole === 'vendedor';
  const canViewFinancials = isGerente;

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
        isGerente,
        isOperador,
        isVendedor,
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
