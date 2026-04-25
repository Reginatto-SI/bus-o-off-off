import { logPaymentTrace } from "./payment-observability.ts";

export type PassengerFeeTier = {
  maxUnitPrice: number | null;
  percent: number;
};

export type PassengerFeeBreakdown = {
  unitPrice: number;
  percent: number;
  uncappedFee: number;
  cappedFee: number;
  capApplied: boolean;
};

export type PlatformFeeEngineResult = {
  passengerBreakdown: PassengerFeeBreakdown[];
  totalFee: number;
  totalUncappedFee: number;
  capHits: number;
};

export type PlatformFeeDistribution = {
  platformAmount: number;
  socioAmount: number;
  representativeAmount: number;
  mode: "one_third" | "half_half";
};

const TIERS: PassengerFeeTier[] = [
  { maxUnitPrice: 100, percent: 6 },
  { maxUnitPrice: 300, percent: 5 },
  { maxUnitPrice: 600, percent: 4 },
  { maxUnitPrice: null, percent: 3 },
];

export const PASSENGER_FEE_CAP_BRL = 25;

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function toCents(value: number): number {
  return Math.round(Number(value || 0) * 100);
}

export function resolveTierPercent(unitPrice: number): number {
  for (const tier of TIERS) {
    if (tier.maxUnitPrice == null || unitPrice <= tier.maxUnitPrice) {
      return tier.percent;
    }
  }
  return 3;
}

/**
 * Motor financeiro oficial do PRD 07:
 * - cálculo por passageiro;
 * - percentual por faixa de preço unitário;
 * - teto de R$ 25 por passageiro.
 */
export function computeProgressiveFeeForPassengers(
  unitPrices: number[],
): PlatformFeeEngineResult {
  const passengerBreakdown = unitPrices.map((rawUnitPrice) => {
    const unitPrice = roundCurrency(Number(rawUnitPrice || 0));
    const unitPriceCents = toCents(unitPrice);
    const percent = resolveTierPercent(unitPrice);
    const uncappedFeeCents = Math.round(unitPriceCents * (percent / 100));
    const cappedFeeCents = Math.min(uncappedFeeCents, toCents(PASSENGER_FEE_CAP_BRL));

    return {
      unitPrice,
      percent,
      uncappedFee: roundCurrency(uncappedFeeCents / 100),
      cappedFee: roundCurrency(cappedFeeCents / 100),
      capApplied: cappedFeeCents < uncappedFeeCents,
    } satisfies PassengerFeeBreakdown;
  });

  const totalUncappedFee = roundCurrency(
    passengerBreakdown.reduce((sum, item) => sum + item.uncappedFee, 0),
  );
  const totalFee = roundCurrency(
    passengerBreakdown.reduce((sum, item) => sum + item.cappedFee, 0),
  );

  return {
    passengerBreakdown,
    totalFee,
    totalUncappedFee,
    capHits: passengerBreakdown.filter((item) => item.capApplied).length,
  };
}

/**
 * Distribuição oficial do PRD 07:
 * - com representante elegível: 1/3 para cada parte;
 * - sem representante elegível: 50/50 plataforma/sócio.
 */
export function distributePlatformFee(params: {
  totalFee: number;
  representativeEligible: boolean;
}): PlatformFeeDistribution {
  const totalFeeCents = toCents(params.totalFee);
  if (totalFeeCents <= 0) {
    return {
      platformAmount: 0,
      socioAmount: 0,
      representativeAmount: 0,
      mode: params.representativeEligible ? "one_third" : "half_half",
    };
  }

  if (params.representativeEligible) {
    const baseThirdCents = Math.floor(totalFeeCents / 3);
    const representativeAmountCents = baseThirdCents;
    const socioAmountCents = baseThirdCents;
    const platformAmountCents = totalFeeCents - representativeAmountCents - socioAmountCents;
    return {
      platformAmount: roundCurrency(platformAmountCents / 100),
      socioAmount: roundCurrency(socioAmountCents / 100),
      representativeAmount: roundCurrency(representativeAmountCents / 100),
      mode: "one_third",
    };
  }

  const socioAmountCents = Math.floor(totalFeeCents / 2);
  const platformAmountCents = totalFeeCents - socioAmountCents;

  return {
    platformAmount: roundCurrency(platformAmountCents / 100),
    socioAmount: roundCurrency(socioAmountCents / 100),
    representativeAmount: 0,
    mode: "half_half",
  };
}

export function amountToGrossPercent(amount: number, grossAmount: number): number {
  const gross = Number(grossAmount || 0);
  if (!Number.isFinite(gross) || gross <= 0) return 0;
  return roundCurrency((Number(amount || 0) / gross) * 100);
}

export function logFeeEngineTrace(params: {
  source: string;
  saleId: string;
  companyId: string;
  grossAmount: number;
  representativeEligible: boolean;
  engine: PlatformFeeEngineResult;
  distribution: PlatformFeeDistribution;
}) {
  logPaymentTrace("info", params.source, "platform_fee_engine_computed", {
    sale_id: params.saleId,
    company_id: params.companyId,
    gross_amount: params.grossAmount,
    representative_eligible: params.representativeEligible,
    total_fee: params.engine.totalFee,
    total_uncapped_fee: params.engine.totalUncappedFee,
    cap_hits: params.engine.capHits,
    distribution_mode: params.distribution.mode,
    distribution_platform: params.distribution.platformAmount,
    distribution_socio: params.distribution.socioAmount,
    distribution_representative: params.distribution.representativeAmount,
  });
}
