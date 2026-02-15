/**
 * Redirecionamento de link curto do vendedor.
 *
 * Rota pública: /v/:code
 *
 * Fluxo:
 * 1. Extrai o :code da URL
 * 2. Chama a RPC `resolve_seller_short_code(code)` que retorna o seller_id
 *    (função SECURITY DEFINER — não expõe a tabela sellers)
 * 3. Se encontrado, redireciona para /eventos?ref={sellerId}
 * 4. Se não encontrado, exibe mensagem de erro (link inválido)
 */
import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

export default function SellerRedirect() {
  const { code } = useParams<{ code: string }>();
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const resolve = async () => {
      const { data, error } = await supabase.rpc('resolve_seller_short_code', {
        code: code.toUpperCase(),
      });

      if (error || !data) {
        setNotFound(true);
      } else {
        setSellerId(data as string);
      }
      setLoading(false);
    };

    resolve();
  }, [code]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (sellerId) {
    return <Navigate to={`/eventos?ref=${sellerId}`} replace />;
  }

  // Link inválido ou vendedor inativo
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold text-foreground">Link inválido</h1>
      <p className="text-muted-foreground">
        Este link de vendedor não existe ou está inativo.
      </p>
      <a href="/eventos" className="text-primary underline">
        Ver eventos disponíveis
      </a>
    </div>
  );
}
