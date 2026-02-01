import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { UserRole, Profile, UserRoleRecord } from '@/types/database';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  userRole: UserRole | null;
  sellerId: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Fetch profile and role
          setTimeout(async () => {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();

            if (profileData) {
              setProfile(profileData as Profile);
            }

            const { data: roleData } = await supabase
              .from('user_roles')
              .select('*')
              .eq('user_id', session.user.id)
              .single();

            if (roleData) {
              const typedRoleData = roleData as UserRoleRecord;
              setUserRole(typedRoleData.role);
              setSellerId(typedRoleData.seller_id);
            }
          }, 0);
        } else {
          setProfile(null);
          setUserRole(null);
          setSellerId(null);
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
        loading,
        signIn,
        signOut,
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
