import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

type PaymentEnvironment = 'production' | 'sandbox';

type RuntimePaymentEnvironmentResponse = {
  payment_environment?: PaymentEnvironment;
};

// Mantém os mesmos hosts oficiais definidos no backend (runtime-env.ts).
const PRODUCTION_HOSTS = new Set(['smartbusbr.com.br', 'www.smartbusbr.com.br']);

function resolveEnvironmentFromHostname(hostname: string): PaymentEnvironment {
  return PRODUCTION_HOSTS.has(hostname.toLowerCase()) ? 'production' : 'sandbox';
}

/**
 * Lê o ambiente operacional real do backend (mesma regra oficial do fluxo Asaas).
 *
 * Importante para suporte:
 * - Caminho principal: Edge Function `get-runtime-payment-environment`.
 * - Fallback: mesma regra por host no browser, útil quando a function ainda não foi publicada
 *   no projeto remoto (ex.: preview Lovable apontando para Supabase sem deploy recente).
 */
export function useRuntimePaymentEnvironment() {
  const [environment, setEnvironment] = useState<PaymentEnvironment | null>(null);

  useEffect(() => {
    let isMounted = true;

    const browserResolvedEnvironment = resolveEnvironmentFromHostname(window.location.hostname);

    const loadEnvironment = async () => {
      const { data, error } = await supabase.functions.invoke<RuntimePaymentEnvironmentResponse>(
        'get-runtime-payment-environment',
      );

      if (error) {
        console.debug(
          '[useRuntimePaymentEnvironment] usando fallback por host local (function indisponível)',
          error,
        );
        if (isMounted) setEnvironment(browserResolvedEnvironment);
        return;
      }

      const resolvedEnvironment =
        data?.payment_environment === 'sandbox' || data?.payment_environment === 'production'
          ? data.payment_environment
          : browserResolvedEnvironment;

      if (isMounted) setEnvironment(resolvedEnvironment);
    };

    void loadEnvironment();

    return () => {
      isMounted = false;
    };
  }, []);

  return {
    environment,
    isSandbox: environment === 'sandbox',
  };
}
