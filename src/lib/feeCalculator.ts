export interface EventFeeInput {
  name: string;
  fee_type: 'fixed' | 'percent';
  value: number;
  is_active: boolean;
}

export interface FeeLineItem {
  name: string;
  amount: number;
}

export interface FeeBreakdown {
  fees: FeeLineItem[];
  totalFees: number;
  unitPriceWithFees: number;
}

export interface PlatformFeeConfig {
  passToCustomer: boolean;
}

export function resolvePlatformFeePercentByTicketPrice(unitPrice: number): number {
  if (unitPrice <= 100) return 6;
  if (unitPrice <= 300) return 5;
  if (unitPrice <= 600) return 4;
  return 3;
}

export function calculatePlatformFee(unitPrice: number): number {
  const percent = resolvePlatformFeePercentByTicketPrice(unitPrice);
  const uncapped = Math.round(unitPrice * (percent / 100) * 100) / 100;
  return Math.min(uncapped, 25);
}

/**
 * Calcula as taxas adicionais de um evento sobre o preço unitário da passagem.
 * - Taxa fixa: valor direto
 * - Taxa percentual: incide sobre o preço unitário
 * - Apenas taxas ativas entram no cálculo
 * - Arredondamento padrão monetário (2 casas decimais)
 */
export function calculateFees(
  unitPrice: number,
  fees: EventFeeInput[],
  platformFeeConfig?: PlatformFeeConfig,
): FeeBreakdown {
  const activeFees = fees.filter((f) => f.is_active);

  const feeLines: FeeLineItem[] = activeFees.map((f) => ({
    name: f.name,
    amount:
      f.fee_type === 'percent'
        ? Math.round(unitPrice * (f.value / 100) * 100) / 100
        : Math.round(f.value * 100) / 100,
  }));

  // IMPORTANTE (blindagem PRD 07):
  // este cálculo no frontend é apenas estimativa visual de checkout.
  // A fonte oficial financeira é o snapshot calculado no backend (create-asaas-payment).
  if (platformFeeConfig?.passToCustomer) {
    const resolvedPercent = resolvePlatformFeePercentByTicketPrice(unitPrice);

    feeLines.unshift({
      name: `Taxa da plataforma (${resolvedPercent}% | máx. R$ 25)`,
      amount: calculatePlatformFee(unitPrice),
    });
  }

  const totalFees = Math.round(feeLines.reduce((sum, fl) => sum + fl.amount, 0) * 100) / 100;

  return {
    fees: feeLines,
    totalFees,
    unitPriceWithFees: Math.round((unitPrice + totalFees) * 100) / 100,
  };
}

/**
 * Informação de preço de um assento individual para cálculo unificado.
 */
export interface SeatPriceInput {
  seatId: string;
  category: string;
}

/**
 * Calcula o valor total de um conjunto de assentos selecionados,
 * aplicando preço por categoria quando disponível, fallback para preço base,
 * e somando taxas (event fees + plataforma se repassada).
 *
 * Garante que o resultado seja exatamente o valor a ser cobrado no gateway.
 */
export function calculateSeatsTotal(
  seats: SeatPriceInput[],
  unitPrice: number,
  categoryPricesMap: Map<string, number>,
  fees: EventFeeInput[],
  platformFeeConfig?: PlatformFeeConfig,
): {
  seatsSubtotal: number;
  feesTotal: number;
  grossTotal: number;
  avgUnitPrice: number;
  feeBreakdown: FeeBreakdown;
} {
  const quantity = seats.length;
  if (quantity === 0) {
    const feeBreakdown = calculateFees(unitPrice, fees, platformFeeConfig);
    return { seatsSubtotal: 0, feesTotal: 0, grossTotal: 0, avgUnitPrice: unitPrice, feeBreakdown };
  }

  // Preço individual por assento (categoria ou fallback base)
  const seatsSubtotal = seats.reduce((sum, s) => {
    const catPrice = categoryPricesMap.get(s.category);
    return sum + (catPrice != null && catPrice > 0 ? catPrice : unitPrice);
  }, 0);

  const avgUnitPrice = Math.round((seatsSubtotal / quantity) * 100) / 100;

  // Taxas calculadas sobre o preço médio (por passageiro)
  const feeBreakdown = calculateFees(avgUnitPrice, fees, platformFeeConfig);
  const feesTotal = Math.round(feeBreakdown.totalFees * quantity * 100) / 100;
  const grossTotal = Math.round((seatsSubtotal + feesTotal) * 100) / 100;

  return { seatsSubtotal, feesTotal, grossTotal, avgUnitPrice, feeBreakdown };
}
