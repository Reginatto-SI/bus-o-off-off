import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Ticket } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { isReservedPublicSlug, normalizePublicSlug } from '@/lib/publicSlug';

export default function PublicCompanyShortLink() {
  const { nick = '' } = useParams();
  const [exists, setExists] = useState<boolean | null>(null);

  const normalizedNick = useMemo(() => normalizePublicSlug(nick), [nick]);

  useEffect(() => {
    const checkSlug = async () => {
      if (!normalizedNick || normalizedNick !== nick || isReservedPublicSlug(normalizedNick)) {
        setExists(false);
        return;
      }

      const { data } = await supabase
        .from('companies')
        .select('id')
        .eq('public_slug', normalizedNick)
        .maybeSingle();

      setExists(Boolean(data));
    };

    void checkSlug();
  }, [nick, normalizedNick]);

  if (exists) {
    return <Navigate to={`/empresa/${normalizedNick}`} replace />;
  }

  if (exists === null) {
    return null;
  }

  return (
    <PublicLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <EmptyState
          icon={<Ticket className="h-8 w-8 text-muted-foreground" />}
          title="Página não encontrada"
          description="Não encontramos uma empresa com esse link curto."
          action={
            <Button asChild>
              <Link to="/eventos">Ver vitrine geral</Link>
            </Button>
          }
        />
      </div>
    </PublicLayout>
  );
}
