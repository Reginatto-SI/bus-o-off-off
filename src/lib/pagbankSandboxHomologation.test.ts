import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  buildCheckoutFinancialIntegritySnapshot,
  type CheckoutPassengerSnapshotInput,
} from '../../supabase/functions/_shared/checkout-financial-integrity';
import {
  reconcilePagbankSplit,
} from '../../supabase/functions/_shared/pagbank/core';
import {
  resolvePagbankRetryDecision,
} from '../../supabase/functions/_shared/pagbank/attempt-policy';
import {
  computeProgressiveFeeForPassengers,
  distributePlatformFee,
} from '../../supabase/functions/_shared/platform-fee-engine';
import { buildPagbankFixedSplitPlan } from '../../supabase/functions/_shared/pagbank/split-plan';

const accounts = {
  company: 'ACCO_COMPANY',
  marketplace: 'ACCO_SMARTBUS',
  socio: 'ACCO_SOCIO',
  representative: 'ACCO_REPRESENTATIVE',
};

function passenger(finalPrice = 100): CheckoutPassengerSnapshotInput {
  return {
    trip_id: 'trip-1',
    final_price: finalPrice,
    original_price: finalPrice,
    discount_amount: 0,
    benefit_applied: false,
    ticket_type_id: 'ticket-type-1',
    ticket_type_name: 'Passagem',
    ticket_type_price: finalPrice,
  };
}

function financialSnapshot(passPlatformFeeToCustomer: boolean, additionalFee = 10) {
  return buildCheckoutFinancialIntegritySnapshot({
    saleTripId: 'trip-1',
    grossAmount: 100 + additionalFee + (passPlatformFeeToCustomer ? 6 : 0),
    passengerSnapshots: [passenger()],
    eventFees: additionalFee > 0 ? [{ fee_type: 'fixed', value: additionalFee, is_active: true }] : [],
    passPlatformFeeToCustomer,
    progressivePlatformFeeTotal: 6,
  });
}

describe('homologação local do contrato financeiro PIX PagBank Sandbox', () => {
  it('calcula seis passagens de R$ 100 individualmente e totaliza R$ 36', () => {
    const result = computeProgressiveFeeForPassengers(Array(6).fill(100));

    expect(result.passengerBreakdown).toHaveLength(6);
    expect(result.passengerBreakdown.every(({ percent, cappedFee }) => percent === 6 && cappedFee === 6)).toBe(true);
    expect(result.totalFee).toBe(36);
  });

  it.each([
    [true, 116, 110],
    [false, 110, 104],
  ])(
    'mantém a taxa SmartBus em R$ 6 com repasse=%s, bruto=R$ %s e líquido econômico da empresa=R$ %s',
    (passPlatformFeeToCustomer, grossAmount, companyEconomicAmount) => {
      const fee = computeProgressiveFeeForPassengers([100]);
      const snapshot = financialSnapshot(passPlatformFeeToCustomer);
      const distribution = distributePlatformFee({
        totalFee: fee.totalFee,
        socioEligible: false,
        representativeEligible: false,
      });
      const plan = buildPagbankFixedSplitPlan({
        grossAmount,
        distribution,
        accounts: { ...accounts, socio: null, representative: null },
      });

      expect(fee.totalFee).toBe(6);
      expect(snapshot.expectedGrossFromSnapshot).toBe(grossAmount);
      expect(plan.companyNetCents).toBe(companyEconomicAmount * 100);
      expect(plan.receivers.reduce((sum, receiver) => sum + receiver.amountCents, 0)).toBe(grossAmount * 100);
    },
  );

  it.each([
    [true, 106, 100],
    [false, 100, 94],
  ])(
    'sem taxa adicional, repasse=%s cobra R$ %s e preserva R$ %s para a empresa',
    (passPlatformFeeToCustomer, grossAmount, companyEconomicAmount) => {
      const distribution = distributePlatformFee({
        totalFee: computeProgressiveFeeForPassengers([100]).totalFee,
        socioEligible: false,
        representativeEligible: false,
      });
      const snapshot = financialSnapshot(passPlatformFeeToCustomer, 0);
      const plan = buildPagbankFixedSplitPlan({
        grossAmount,
        distribution,
        accounts: { ...accounts, socio: null, representative: null },
      });

      expect(snapshot.expectedGrossFromSnapshot).toBe(grossAmount);
      expect(plan.feeCents).toBe(600);
      expect(plan.companyNetCents).toBe(companyEconomicAmount * 100);
    },
  );

  it.each([
    ['A', true, true, 200, 200, 200],
    ['B', true, false, 300, 300, 0],
    ['C', false, true, 400, 0, 200],
    ['D', false, false, 600, 0, 0],
  ] as const)(
    'cenário %s conserva os centavos e destina 6 reais conforme a decisão econômica',
    (_scenario, socioEligible, representativeEligible, smartBusCents, socioCents, representativeCents) => {
      const distribution = distributePlatformFee({ totalFee: 6, socioEligible, representativeEligible });
      const plan = buildPagbankFixedSplitPlan({
        grossAmount: 106,
        distribution,
        accounts: {
          ...accounts,
          socio: socioEligible ? accounts.socio : null,
          representative: representativeEligible ? accounts.representative : null,
        },
      });
      const byKind = Object.fromEntries(plan.receivers.map(({ kind, amountCents }) => [kind, amountCents]));

      expect(byKind.company).toBe(10_000);
      expect(byKind.marketplace).toBe(smartBusCents);
      expect(byKind.socio ?? 0).toBe(socioCents);
      expect(byKind.representative ?? 0).toBe(representativeCents);
      expect(plan.receivers.reduce((sum, receiver) => sum + receiver.amountCents, 0)).toBe(10_600);
    },
  );

  it('atribui o resíduo de arredondamento à SmartBus sem criar ou perder centavos', () => {
    const distribution = distributePlatformFee({
      totalFee: 5,
      socioEligible: true,
      representativeEligible: true,
    });

    expect(distribution).toEqual({
      platformAmount: 1.68,
      socioAmount: 1.66,
      representativeAmount: 1.66,
      mode: 'all_present',
    });
  });
});

describe('homologação local da política de retentativa PIX PagBank', () => {
  it.each([
    [null, 'create'],
    [{ state: 'pending', external_order_id: null }, 'wait_in_flight'],
    [{ state: 'indeterminate', external_order_id: null }, 'recover_by_reference'],
    [{ state: 'succeeded', external_order_id: 'ORDE_1' }, 'reuse_order'],
    [{ state: 'failed', external_order_id: 'ORDE_1' }, 'needs_reconciliation'],
  ] as const)('decide %s como %s', (attempt, expected) => {
    expect(resolvePagbankRetryDecision(attempt)).toBe(expected);
  });

  it('submete criação normal e recuperação por referência ao mesmo gate de Order', () => {
    const source = readFileSync(
      `${process.cwd()}/supabase/functions/create-pagbank-payment/index.ts`,
      'utf8',
    );

    expect(source).toContain('const art = await requireUsableOrder(recoveredOrder, existing.id)');
    expect(source).toContain('const art = await requireUsableOrder(res.data, attemptId)');
  });
});

describe('caracterização de lacuna da conciliação devolvida pelo PagBank', () => {
  it('rejeita um recebedor extra e a soma ecoada divergente', () => {
    const expected = [
      { accountId: accounts.company, amountCents: 10_000 },
      { accountId: accounts.marketplace, amountCents: 600 },
    ];
    const responseWithUnexpectedReceiver = {
      charges: [{
        splits: {
          receivers: [
            { account: { id: accounts.company }, amount: { value: 10_000 } },
            { account: { id: accounts.marketplace }, amount: { value: 600 } },
            { account: { id: 'ACCO_UNEXPECTED' }, amount: { value: 1 } },
          ],
        },
      }],
    };

    const result = reconcilePagbankSplit(responseWithUnexpectedReceiver, expected, 10_600);
    expect(result).toMatchObject({
      ok: false,
      reason: 'unexpected_receiver',
      echoedTotalCents: 10_601,
      issues: expect.arrayContaining(['count_mismatch', 'unexpected_receiver', 'sum_mismatch']),
    });
  });
});
