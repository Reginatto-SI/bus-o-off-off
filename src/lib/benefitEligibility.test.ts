import { describe, expect, it } from 'vitest';
import { applyBenefitToPrice, resolveBestBenefitForPassengerPrice } from './benefitEligibility';
import type { Database } from '@/integrations/supabase/types';

type RpcRow = Database['public']['Functions']['get_benefit_eligibility_matches']['Returns'][number];
type ExpectedRpcKey = 'program_id' | 'program_name' | 'benefit_type' | 'benefit_value';
type SameKeys<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// Falha em type-check/build se a tipagem gerada voltar a expor campos além dos quatro mínimos.
const rpcTypeUsesOnlyMinimalFields: SameKeys<keyof RpcRow, ExpectedRpcKey> = true;

const match = (id: string, type: 'percentual' | 'valor_fixo' | 'preco_final', value: number) => ({
  program: { id, name: `Programa ${id}`, benefit_type: type, benefit_value: value },
});

describe('cálculo existente de Programas de Benefício por CPF', () => {
  it('mantém a RPC tipada restrita aos quatro campos públicos', () => {
    expect(rpcTypeUsesOnlyMinimalFields).toBe(true);
  });

  it.each([
    ['percentual', 10, 100, 10, 90],
    ['valor_fixo', 15, 100, 15, 85],
    ['preco_final', 70, 100, 30, 70],
  ] as const)('preserva a fórmula de %s', (type, value, original, discount, finalPrice) => {
    expect(applyBenefitToPrice(original, type, value)).toEqual({ discountAmount: discount, finalPrice });
  });

  it('escolhe deterministicamente o menor preço final sem acumular programas', () => {
    const result = resolveBestBenefitForPassengerPrice(100, [
      match('b', 'percentual', 10),
      match('a', 'valor_fixo', 20),
      match('c', 'preco_final', 85),
    ]);

    expect(result.benefitProgramId).toBe('a');
    expect(result.originalPrice).toBe(100);
    expect(result.discountAmount).toBe(20);
    expect(result.finalPrice).toBe(80);
  });

  it('mantém o preço original quando não há CPF elegível', () => {
    expect(resolveBestBenefitForPassengerPrice(100, [])).toMatchObject({
      benefitApplied: false,
      originalPrice: 100,
      discountAmount: 0,
      finalPrice: 100,
    });
  });
});
