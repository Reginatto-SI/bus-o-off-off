import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

type PaymentEnvironment = 'production' | 'sandbox';

type RuntimePaymentEnvironmentResponse = {
  payment_environment?: PaymentEnvironment;
};

/**
 * Lê o ambiente operacional real do backend (mesma regra oficial do fluxo Asaas).
 *
 * Importante: não replica heurística no frontend.
 * A decisão continua centralizada na API via resolveEnvironmentFromHost.
 */
export function useRuntimePaymentEnvironment() {
  const [environment, setEnvironment] = useState<PaymentEnvironment | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadEnvironment = async () => {
      const { data, error } = await supabase.functions.invoke<RuntimePaymentEnvironmentResponse>(
        'get-runtime-payment-environment',
      );

      if (error) {
        console.debug('[useRuntimePaymentEnvironment] fallback para produção em caso de falha', error);
        if (isMounted) setEnvironment('production');
        return;
      }

      const resolvedEnvironment =
        data?.payment_environment === 'sandbox' || data?.payment_environment === 'production'
          ? data.payment_environment
          : 'production';

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
