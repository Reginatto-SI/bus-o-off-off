import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  computeProgressiveFeeForPassengers,
  distributePlatformFee,
  amountToGrossPercent,
  resolveTierPercent,
} from '../../supabase/functions/_shared/platform-fee-engine';
import {
  resolveSocioWalletByEnvironment,
  validateFinancialSocioForSplit,
} from '../../supabase/functions/_shared/payment-context-resolver';

describe('contrato oficial da taxa total', () => {
  it.each([
    [100, 6], [100.01, 5], [300, 5], [300.01, 4],
    [600, 4], [600.01, 3],
  ])('protege a faixa de R$ %s em %s%%', (price, percent) => {
    expect(resolveTierPercent(price)).toBe(percent);
  });

  it('aplica mínimo após a soma e teto por item', () => {
    expect(computeProgressiveFeeForPassengers([30]).totalFee).toBe(5);
    expect(computeProgressiveFeeForPassengers([30, 30]).totalFee).toBe(5);
    expect(computeProgressiveFeeForPassengers([30, 30, 30]).totalFee).toBe(5.4);
    expect(computeProgressiveFeeForPassengers([1_000]).totalFee).toBe(25);
    expect(computeProgressiveFeeForPassengers([1_000, 1_000]).totalFee).toBe(50);
  });

  it.each([
    [[100], 6],
    [[100, 100], 12],
    [[100, 100, 100, 100, 100], 30],
    [[600], 24],
    [[100, 100, 100, 100, 100, 100], 36],
    [[1_000], 25],
    [[1_000, 1_000], 50],
    [[100, 1_000], 31],
  ])('soma taxas individuais de %j em R$ %s', (unitPrices, expectedFee) => {
    expect(computeProgressiveFeeForPassengers(unitPrices).totalFee).toBe(expectedFee);
  });

  it('seis passagens de R$ 100 não viram um item de R$ 600', () => {
    const result = computeProgressiveFeeForPassengers([100, 100, 100, 100, 100, 100]);
    expect(result.totalFee).toBe(36);
    expect(result.passengerBreakdown).toHaveLength(6);
    expect(result.passengerBreakdown.every((item) => item.percent === 6 && item.cappedFee === 6)).toBe(true);
    expect(result.totalFee).not.toBe(computeProgressiveFeeForPassengers([600]).totalFee);
  });

  it('taxa adicional só altera a conversão técnica do Asaas', () => {
    const commercialFeeTotal = computeProgressiveFeeForPassengers([100, 100, 100, 100, 100, 100]).totalFee;
    const grossAmountForAsaasConversion = 660;
    expect(commercialFeeTotal).toBe(36);
    expect(amountToGrossPercent(commercialFeeTotal, grossAmountForAsaasConversion)).toBe(5.45);
  });
});

describe('quatro cenários oficiais de divisão', () => {
  it.each([
    [true, true, 6, 6, 6, 'all_present'],
    [true, false, 9, 9, 0, 'socio_only'],
    [false, true, 12, 0, 6, 'representative_only'],
    [false, false, 18, 0, 0, 'platform_only'],
  ] as const)(
    'sócio=%s representante=%s',
    (socioEligible, representativeEligible, platform, socio, representative, mode) => {
      expect(distributePlatformFee({ totalFee: 18, socioEligible, representativeEligible })).toEqual({
        platformAmount: platform,
        socioAmount: socio,
        representativeAmount: representative,
        mode,
      });
    },
  );
});

describe('divisão ocorre depois da taxa comercial absoluta', () => {
  it.each([
    [true, true, 12, 12, 12],
    [true, false, 18, 18, 0],
    [false, true, 24, 0, 12],
    [false, false, 36, 0, 0],
  ])('divide R$ 36,00 para sócio=%s representante=%s', (socioEligible, representativeEligible, platform, socio, representative) => {
    expect(distributePlatformFee({ totalFee: 36, socioEligible, representativeEligible })).toMatchObject({
      platformAmount: platform,
      socioAmount: socio,
      representativeAmount: representative,
    });
  });
});

describe('wallet global por ambiente', () => {
  const socio = {
    id: 'socio-global',
    status: 'inativo',
    asaas_wallet_id: 'legado-producao',
    asaas_wallet_id_production: 'wallet-producao',
    asaas_wallet_id_sandbox: null,
  };

  it('não deixa status legado impedir wallet válida de produção', () => {
    expect(validateFinancialSocioForSplit({ socios: [socio], provider: 'asaas', environment: 'production' }).ok)
      .toBe(true);
  });

  it('não preenche sandbox com wallet de produção ou legada', () => {
    expect(resolveSocioWalletByEnvironment(socio, 'sandbox')).toBeNull();
    expect(validateFinancialSocioForSplit({ socios: [socio], provider: 'asaas', environment: 'sandbox' })).toMatchObject({
      ok: false,
      code: 'split_socio_wallet_missing',
    });
  });
});

describe('contrato de isolamento do resolvedor', () => {
  const source = readFileSync(
    `${process.cwd()}/supabase/functions/_shared/split-recipients-resolver.ts`,
    'utf8',
  );

  it('não filtra o sócio global por empresa nem adiciona consulta restritiva nova', () => {
    const socioQuery = source.slice(source.indexOf('.from("socios_split")'), source.indexOf('if (socioError)'));
    expect(socioQuery).not.toContain('.eq("company_id"');
    expect(source).toContain('.from("representative_company_links")');
    expect(source).toContain('.eq("company_id", params.companyId)');
    expect(source).toContain('.eq("id", params.representativeId)');
  });
});

describe('contrato estático da base individual', () => {
  const publicFlow = readFileSync(`${process.cwd()}/supabase/functions/create-asaas-payment/index.ts`, 'utf8');
  const manualFlow = readFileSync(`${process.cwd()}/supabase/functions/create-platform-fee-checkout/index.ts`, 'utf8');
  const engine = readFileSync(`${process.cwd()}/supabase/functions/_shared/platform-fee-engine.ts`, 'utf8');

  it('fluxos público e manual entregam passengerUnitPrices ao mesmo motor', () => {
    expect(publicFlow).toContain('computeProgressiveFeeForPassengers(passengerUnitPrices)');
    expect(manualFlow).toContain('computeProgressiveFeeForPassengers(passengerUnitPrices)');
    expect(publicFlow).not.toContain('resolveTierPercent(grossAmount)');
    expect(manualFlow).not.toContain('resolveTierPercent(grossAmount)');
  });

  it('aplica teto dentro do map individual e soma somente depois', () => {
    expect(engine.indexOf('unitPrices.map')).toBeLessThan(engine.indexOf('Math.min(uncappedFeeCents'));
    expect(engine.indexOf('Math.min(uncappedFeeCents')).toBeLessThan(engine.indexOf('passengerBreakdown.reduce'));
  });
});
