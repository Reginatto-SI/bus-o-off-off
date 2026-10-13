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
  | { status: 'pix' }
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
    const { data: responseData, error } = await supabase.functions.invoke('create-platform-fee-checkout', {
      body: {
        sale_id: saleId,
        consult_only: mode === 'consult_only',
      },
    });

    let data=responseData;
    if(error&&!data){try{data=await (error as {context?:{json?:()=>Promise<unknown>}}).context?.json?.();}catch{/* preserve safe generic feedback */}}
    if (error) {
      const code=data?.error_code??data?.error;
      if(code==='manual_issuance_incomplete') {toast.info('Taxa confirmada. As passagens estão em recuperação; não é necessário pagar novamente.');}
      else if(['manual_fee_create_unresolved','manual_fee_query_failed','manual_fee_persistence_failed'].includes(code)) {toast.info('Cobrança em verificação. A reserva está preservada; não gere outra cobrança.');}
      else if(code==='manual_fee_order_id_required') {toast.warning('Cobrança sem identificador recuperável. Solicite conciliação; a reserva está preservada. Não gere outra cobrança.');}
      else if(code==='manual_fee_create_rejected') {toast.warning('O PagBank recusou a criação da taxa. Solicite revisão antes de tentar gerar outra cobrança.');}
      else if(code==='manual_late_payment_review') {toast.warning('Pagamento recebido após cancelamento. Solicite conciliação antes de liberar passagens.');}
      else if (data?.error_code === 'consult_only_without_reusable_payment') {
        toast.info(data?.error || 'Não existe cobrança reutilizável para consulta desta taxa.');
        await onMissingReusablePayment?.();
      } else if (data?.error_code === 'existing_platform_fee_terminal_requires_admin_action') {
        // Regra de segurança: se já existe cobrança vinculada em status terminal,
        // o operador não pode gerar nova cobrança automaticamente neste fluxo.
        toast.warning(data?.error || 'Cobrança vinculada em status terminal. É necessária ação administrativa explícita para nova cobrança.');
      } else if (data?.error_code === 'disallowed_billing_type') {
        toast.warning(data?.error || 'Esta cobrança antiga possui uma forma de pagamento não permitida. Cancele a cobrança anterior e gere uma nova cobrança em Pix ou Cartão de crédito.');
      } else {
        toast.error(data?.error || 'Erro ao criar checkout da taxa');
      }
      return { status: 'error' };
    }

    if (data?.waived) {
      toast.success(data?.message || 'Taxa da plataforma dispensada para esta venda.');
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

    if (data?.pix?.qr_text) {
      window.dispatchEvent(new CustomEvent('smartbus:manual-fee-pix', {detail:{saleId,pix:data.pix}}));
      return { status: 'pix' };
    }

    if (data?.pix && data?.payment_id) {
      toast.info('Cobrança vinculada. O código Pix ainda não está disponível; consulte novamente. Não gere outra cobrança.');
      return { status: 'error' };
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
