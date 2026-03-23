import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';

interface StartPlatformFeeCheckoutParams {
  saleId: string;
  onWaived?: () => void | Promise<void>;
  onCheckoutOpened?: (url: string) => void | Promise<void>;
}

export type PlatformFeeCheckoutResult =
  | { status: 'opened'; url: string }
  | { status: 'waived' }
  | { status: 'error' };

/**
 * Reutiliza o mesmo fluxo já existente de cobrança da taxa da plataforma.
 * Mantemos o toast e a abertura em nova aba centralizados aqui para evitar
 * comportamento divergente entre a listagem de vendas e o comprovante final.
 */
export async function startPlatformFeeCheckout({
  saleId,
  onWaived,
  onCheckoutOpened,
}: StartPlatformFeeCheckoutParams): Promise<PlatformFeeCheckoutResult> {
  try {
    const { data, error } = await supabase.functions.invoke('create-platform-fee-checkout', {
      body: { sale_id: saleId },
    });

    if (error) {
      toast.error(data?.error || 'Erro ao criar checkout da taxa');
      return { status: 'error' };
    }

    if (data?.waived) {
      toast.success('Taxa da plataforma dispensada explicitamente (valor abaixo do mínimo do gateway). A venda permanece reservada até quitação válida.');
      await onWaived?.();
      return { status: 'waived' };
    }

    if (!data?.url) {
      toast.error(data?.error || 'Erro ao criar checkout da taxa');
      return { status: 'error' };
    }

    window.open(data.url, '_blank');
    toast.info('Checkout da taxa aberto em nova aba. Após o pagamento, atualize a listagem.');
    await onCheckoutOpened?.(data.url);
    return { status: 'opened', url: data.url };
  } catch (error) {
    toast.error('Erro ao iniciar pagamento da taxa');
    return { status: 'error' };
  }
}
