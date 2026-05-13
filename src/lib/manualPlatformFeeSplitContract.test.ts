import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calculateFees, calculatePlatformFeeTotal } from './feeCalculator';

function distributeFee(totalFee: number, representativeEligible: boolean) {
  const totalCents = Math.round(totalFee * 100);
  if (representativeEligible) {
    const third = Math.floor(totalCents / 3);
    return {
      marketplace: (totalCents - third - third) / 100,
      socio: third / 100,
      representative: third / 100,
    };
  }
  const socio = Math.floor(totalCents / 2);
  return {
    marketplace: (totalCents - socio) / 100,
    socio: socio / 100,
    representative: 0,
  };
}

describe('manual platform fee split contract', () => {
  it('cobre cálculo backend esperado para venda manual com piso, teto e taxas adicionais fora da base', () => {
    expect(calculatePlatformFeeTotal([100])).toBe(6);
    expect(calculatePlatformFeeTotal([30])).toBe(5);
    expect(calculatePlatformFeeTotal([1000])).toBe(25);

    const additionalCompanyFee = calculateFees(100, [
      { name: 'Taxa adicional da empresa', fee_type: 'fixed', value: 6, is_active: true },
    ]).totalFees;

    expect(additionalCompanyFee).toBe(6);
    expect(calculatePlatformFeeTotal([100])).toBe(6);
    expect(calculatePlatformFeeTotal([106])).not.toBe(6);
  });

  it('cobre divisão oficial em cobrança separada da taxa manual', () => {
    expect(distributeFee(6, false)).toEqual({ marketplace: 3, socio: 3, representative: 0 });
    expect(distributeFee(5, false)).toEqual({ marketplace: 2.5, socio: 2.5, representative: 0 });
    expect(distributeFee(6, true)).toEqual({ marketplace: 2, socio: 2, representative: 2 });
    expect(distributeFee(25, true)).toEqual({ marketplace: 8.34, socio: 8.33, representative: 8.33 });

    const withRepresentativeAndInactiveSocio = {
      ...distributeFee(6, true),
      marketplace: 4,
      socio: 0,
    };
    expect(withRepresentativeAndInactiveSocio).toEqual({ marketplace: 4, socio: 0, representative: 2 });
  });

  it('garante contrato estático da edge function manual: motor oficial, resolvedor, split no payload e snapshot', () => {
    const source = readFileSync('supabase/functions/create-platform-fee-checkout/index.ts', 'utf8');

    expect(source).toContain('computeProgressiveFeeForPassengers');
    expect(source).toContain('resolveAsaasSplitRecipients');
    expect(source).toContain('distributePlatformFee');
    expect(source).toContain('split: splitArray');
    expect(source).toContain('split_snapshot_source: "create-platform-fee-checkout"');
    expect(source).toContain('platform_fee_checkout_blocked_amount_mismatch_existing_payment');
    expect(source).toContain('legacy_pending_platform_fee_without_split_snapshot');
  });

  it('garante que confirmação manual processa ledger apenas quando há snapshot manual de split', () => {
    const source = readFileSync('supabase/functions/verify-payment-status/index.ts', 'utf8');

    expect(source).toContain('upsert_representative_commission_for_sale');
    expect(source).toContain('canUseManualSplitSnapshotForCommission');
    expect(source).toContain('skipped_missing_manual_split_snapshot');
  });
});
