/**
 * Rota pública oficial do MVP de indicação por link.
 *
 * Fluxo:
 * 1. Extrai o :code da URL curta /i/:code.
 * 2. Resolve o código via RPC pública `resolve_company_referral_code`.
 * 3. Se válido, redireciona para /cadastro?ref=CODE.
 * 4. Se inválido, redireciona para /cadastro sem travar o onboarding público.
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Navigate, useParams } from 'react-router-dom';

import { supabase } from '@/integrations/supabase/client';
import { normalizeCompanyReferralCode } from '@/lib/companyReferral';

export default function CompanyReferralRedirect() {
  const { code } = useParams<{ code: string }>();
  const [resolvedCode, setResolvedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const normalizedCode = normalizeCompanyReferralCode(code);
    if (!normalizedCode) {
      setResolvedCode(null);
      setLoading(false);
      return;
    }

    const resolve = async () => {
      const { data, error } = await supabase.rpc('resolve_company_referral_code', {
        code: normalizedCode,
      });

      // Comentário de manutenção: link inválido nunca pode bloquear o cadastro da empresa.
      // Validamos aqui apenas para evitar persistir um código claramente inconsistente na sessão.
      if (error || !data) {
        setResolvedCode(null);
      } else {
        setResolvedCode(normalizedCode);
      }
      setLoading(false);
    };

    void resolve();
  }, [code]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <Navigate to={resolvedCode ? `/cadastro?ref=${resolvedCode}` : '/cadastro'} replace />;
}
