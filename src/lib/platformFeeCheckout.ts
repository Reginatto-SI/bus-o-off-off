import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';

interface StartPlatformFeeCheckoutParams {
  saleId: string;
  mode?: 'create_or_reuse' | 'consult_only';
  onWaived?: () => void | Promise<void>;
  onCheckoutOpened?: (url: string) => void | Promise<void>;
  onMissingReusablePayment?: () => void | Promise<void>;
}

export type PlatformFeeCheckoutResult =
  | { status: 'opened'; url: string }
  | { status: 'waived' }
  | { status: 'already_paid' }
  | { status: 'error' };

/**
 * Reutiliza o mesmo fluxo já existente de cobrança da taxa da plataforma.
 * Mantemos o toast e a abertura em nova aba centralizados aqui para evitar
 * comportamento divergente entre a listagem de vendas e o comprovante final.
 */
export async function startPlatformFeeCheckout({
  saleId,
  mode = 'create_or_reuse',
  onWaived,
  onCheckoutOpened,
  onMissingReusablePayment,
}: StartPlatformFeeCheckoutParams): Promise<PlatformFeeCheckoutResult> {
  try {
    const { data, error } = await supabase.functions.invoke('create-platform-fee-checkout', {
      body: {
        sale_id: saleId,
        consult_only: mode === 'consult_only',
      },
    });

    if (error) {
      if (data?.error_code === 'consult_only_without_reusable_payment') {
        toast.info(data?.error || 'Não existe cobrança reutilizável para consulta desta taxa.');
        await onMissingReusablePayment?.();
      } else if (data?.error_code === 'existing_platform_fee_terminal_requires_admin_action') {
        // Regra de segurança: se já existe cobrança vinculada em status terminal,
        // o operador não pode gerar nova cobrança automaticamente neste fluxo.
        toast.warning(data?.error || 'Cobrança vinculada em status terminal. É necessária ação administrativa explícita para nova cobrança.');
      } else {
        toast.error(data?.error || 'Erro ao criar checkout da taxa');
      }
      return { status: 'error' };
    }

    if (data?.waived) {
      toast.success('Taxa da plataforma dispensada explicitamente (valor abaixo do mínimo do gateway). A venda permanece reservada até quitação válida.');
      await onWaived?.();
      return { status: 'waived' };
    }

    // Blindagem de compatibilidade: backend pode retornar convergência idempotente
    // sem necessidade de gerar nova cobrança (ex.: já paga no Asaas).
    if (data?.already_paid) {
      toast.success(data?.message || 'Taxa da plataforma já estava paga e foi convergida.');
      await onWaived?.();
      return { status: 'already_paid' };
    }

    // Reuso explícito de cobrança existente: mantém o mesmo comportamento de abrir URL
    // quando disponível e evita tratar como erro de criação.
    if (data?.reused_existing_payment && data?.url) {
      window.open(data.url, '_blank');
      toast.info('Cobrança existente da taxa reutilizada. Após o pagamento, atualize a listagem.');
      await onCheckoutOpened?.(data.url);
      return { status: 'opened', url: data.url };
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
