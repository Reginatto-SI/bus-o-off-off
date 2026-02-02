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
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileData) {
      setProfile(profileData as Profile);
    }

    // Fetch user roles and companies
    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('*, companies(*)')
      .eq('user_id', userId);

    if (rolesData && rolesData.length > 0) {
      // Extract unique companies
      const companies = rolesData
        .map((r: any) => r.companies)
        .filter((c: Company | null): c is Company => c !== null);
      
      // Remove duplicates based on id
      const uniqueCompanies = companies.filter(
        (company: Company, index: number, self: Company[]) =>
          index === self.findIndex((c) => c.id === company.id)
      );
      
      setUserCompanies(uniqueCompanies);

      // Get stored company preference or use first one
      const storedCompanyId = localStorage.getItem(`activeCompany_${userId}`);
      const validCompanyId = uniqueCompanies.find((c: Company) => c.id === storedCompanyId)?.id 
        || uniqueCompanies[0]?.id;

      if (validCompanyId) {
        setActiveCompanyId(validCompanyId);
        setActiveCompany(uniqueCompanies.find((c: Company) => c.id === validCompanyId) || null);
        localStorage.setItem(`activeCompany_${userId}`, validCompanyId);

        // Find role for active company
        const roleForCompany = rolesData.find((r: any) => r.company_id === validCompanyId);
        if (roleForCompany) {
          setUserRole(roleForCompany.role as UserRole);
          setSellerId(roleForCompany.seller_id);
        }
      }
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
