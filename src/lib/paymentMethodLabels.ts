const paymentMethodLabels: Record<string, string> = {
  pix: 'Pix',
  credit_card: 'Cartão de crédito',
  dinheiro: 'Dinheiro',
  cash: 'Dinheiro',
  cartao: 'Cartão externo/maquininha',
  external_card: 'Cartão externo/maquininha',
  link: 'Link de pagamento',
  manual: 'Manual',
  outro: 'Outro',
};

export function formatPaymentMethodLabel(value?: string | null): string | null {
  if (!value) return null;
  return paymentMethodLabels[value] ?? 'Forma de pagamento não identificada';
}
