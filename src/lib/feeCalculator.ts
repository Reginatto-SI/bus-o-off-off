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
  feePercent?: number;
}

export function calculatePlatformFee(unitPrice: number, feePercent: number): number {
  return Math.round(unitPrice * (feePercent / 100) * 100) / 100;
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

  // Suporte: somente adiciona taxa da plataforma ao cliente quando o repasse do evento está ativo.
  // Importante: o percentual deve vir da empresa (fonte de verdade), sem fallback silencioso.
  if (platformFeeConfig?.passToCustomer) {
    if (platformFeeConfig.feePercent == null || Number.isNaN(Number(platformFeeConfig.feePercent))) {
      throw new Error('platform_fee_percent indisponível para cálculo de taxa da plataforma');
    }

    feeLines.unshift({
      name: `Taxa da plataforma (${platformFeeConfig.feePercent}%)`,
      amount: calculatePlatformFee(unitPrice, platformFeeConfig.feePercent),
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
