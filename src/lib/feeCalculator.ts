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
