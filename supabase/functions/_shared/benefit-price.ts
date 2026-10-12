export const BENEFIT_PRICING_RULE_VERSION = 'beneficio_checkout_v1';
export interface EligibleBenefitMatch { program: {id:string;name:string;benefit_type:'percentual'|'valor_fixo'|'preco_final';benefit_value:number} }
export interface BenefitPriceResolution {
  benefitApplied: boolean;
  benefitProgramId: string | null;
  benefitProgramName: string | null;
  benefitType: 'percentual'|'valor_fixo'|'preco_final' | null;
  benefitValue: number | null;
  originalPrice: number;
  discountAmount: number;
  finalPrice: number;
  pricingRuleVersion: string;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Aplica o benefício em um preço base usando a regra oficial da fase 1.
 * Ordem obrigatória: preço bruto -> benefício -> preço final.
 */
export function applyBenefitToPrice(
  originalPrice: number,
  benefitType: 'percentual'|'valor_fixo'|'preco_final',
  benefitValue: number,
): { discountAmount: number; finalPrice: number } {
  const base = roundCurrency(Math.max(0, Number(originalPrice) || 0));
  const normalizedBenefitValue = Math.max(0, Number(benefitValue) || 0);

  let finalPrice = base;

  if (benefitType === 'percentual') {
    const percentDiscount = roundCurrency(base * (normalizedBenefitValue / 100));
    finalPrice = roundCurrency(base - percentDiscount);
  } else if (benefitType === 'valor_fixo') {
    finalPrice = roundCurrency(base - normalizedBenefitValue);
  } else {
    finalPrice = roundCurrency(normalizedBenefitValue);
  }

  finalPrice = Math.max(0, finalPrice);
  const discountAmount = roundCurrency(base - finalPrice);

  return {
    discountAmount,
    finalPrice,
  };
}

/**
 * Resolve de forma determinística o benefício vencedor (mais vantajoso) para UM passageiro.
 */
export function resolveBestBenefitForPassengerPrice(
  originalPrice: number,
  matches: EligibleBenefitMatch[],
): BenefitPriceResolution {
  const safeOriginal = roundCurrency(Math.max(0, Number(originalPrice) || 0));

  if (!matches.length) {
    return {
      benefitApplied: false,
      benefitProgramId: null,
      benefitProgramName: null,
      benefitType: null,
      benefitValue: null,
      originalPrice: safeOriginal,
      discountAmount: 0,
      finalPrice: safeOriginal,
      pricingRuleVersion: BENEFIT_PRICING_RULE_VERSION,
    };
  }

  const scored = matches.map((match) => {
    const price = applyBenefitToPrice(
      safeOriginal,
      match.program.benefit_type,
      Number(match.program.benefit_value),
    );
    return {
      match,
      ...price,
    };
  });

  scored.sort((a, b) => {
    // 1) menor preço final = mais vantajoso para o passageiro
    if (a.finalPrice !== b.finalPrice) return a.finalPrice - b.finalPrice;
    // 2) maior desconto absoluto
    if (a.discountAmount !== b.discountAmount) return b.discountAmount - a.discountAmount;
    // 3) desempate estável por id do programa
    return a.match.program.id.localeCompare(b.match.program.id);
  });

  const winner = scored[0];

  return {
    benefitApplied: true,
    benefitProgramId: winner.match.program.id,
    benefitProgramName: winner.match.program.name,
    benefitType: winner.match.program.benefit_type,
    benefitValue: Number(winner.match.program.benefit_value),
    originalPrice: safeOriginal,
    discountAmount: roundCurrency(winner.discountAmount),
    finalPrice: roundCurrency(winner.finalPrice),
    pricingRuleVersion: BENEFIT_PRICING_RULE_VERSION,
  };
}
