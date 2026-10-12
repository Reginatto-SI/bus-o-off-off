import { amountToGrossPercent } from "./platform-fee-rules.ts";
export * from "./platform-fee-rules.ts";
import type { PlatformFeeEngineResult, PlatformFeeDistribution } from "./platform-fee-rules.ts";
import { logPaymentTrace } from "./payment-observability.ts";
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
    gross_amount_usage: "asaas_conversion_and_integrity_only",
    passenger_count: params.engine.passengerBreakdown.length,
    passenger_unit_prices: params.engine.passengerBreakdown.map((item) => item.unitPrice),
    passenger_fee_breakdown: params.engine.passengerBreakdown.map((item) => ({
      unit_price: item.unitPrice,
      commercial_tier_percent: item.percent,
      fee_before_cap: item.uncappedFee,
      fee_after_individual_cap: item.cappedFee,
      individual_cap_applied: item.capApplied,
    })),
    representative_eligible: params.representativeEligible,
    total_fee: params.engine.totalFee,
    commercial_fee_total: params.engine.totalFee,
    audit_percent_over_gross_not_sent_to_split: amountToGrossPercent(
      params.engine.totalFee,
      params.grossAmount,
    ),
    total_uncapped_fee: params.engine.totalUncappedFee,
    cap_hits: params.engine.capHits,
    distribution_mode: params.distribution.mode,
    distribution_platform: params.distribution.platformAmount,
    distribution_socio: params.distribution.socioAmount,
    distribution_representative: params.distribution.representativeAmount,
  });
}
