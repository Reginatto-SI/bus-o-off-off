import type { SaleStatus } from '@/types/database';

/**
 * Centraliza as regras de exibição de "Compra em" e "Origem da compra"
 * para manter o ticket único e consistente em todos os fluxos (público/admin/PDF/imagem).
 */
export function resolveTicketPurchaseConfirmedAt(params: {
  saleStatus: SaleStatus;
  paymentConfirmedAt?: string | null;
  platformFeePaidAt?: string | null;
  asaasPaymentId?: string | null;
}): string | null {
  const { saleStatus, paymentConfirmedAt, platformFeePaidAt, asaasPaymentId } = params;

  // Não exibimos data em reservas/canceladas para evitar data falsa ao usuário.
  if (saleStatus !== 'pago') return null;
  if (paymentConfirmedAt) return paymentConfirmedAt;

  // Compatibilidade com vendas manuais antigas: quando não havia payment_confirmed_at,
  // usamos platform_fee_paid_at apenas em venda sem cobrança principal Asaas.
  if (!asaasPaymentId && platformFeePaidAt) return platformFeePaidAt;

  return null;
}

/**
 * Regra de negócio de origem para linguagem humana no ticket.
 * - online_checkout => Aplicativo Smartbus
 * - admin/seller manual => Venda manual pela empresa
 * - legado/ambíguo => omitimos linha (fallback seguro: não inventar origem)
 */
export function resolveTicketPurchaseOriginLabel(saleOrigin?: string | null): string | null {
  if (!saleOrigin) return null;

  if (saleOrigin === 'online_checkout') {
    return 'Aplicativo Smartbus';
  }

  if (['admin_manual', 'admin_reservation_conversion', 'seller_manual'].includes(saleOrigin)) {
    return 'Venda manual pela empresa';
  }

  return null;
}
