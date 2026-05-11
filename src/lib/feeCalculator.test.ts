import { describe, expect, it } from 'vitest';
import {
  calculateFees,
  calculatePlatformFee,
  resolvePlatformFeePercentByTicketPrice,
} from './feeCalculator';

describe('feeCalculator progressive platform fee engine (PRD 07)', () => {
  it('aplica 6% para passagem de R$ 80', () => {
    expect(resolvePlatformFeePercentByTicketPrice(80)).toBe(6);
    expect(calculatePlatformFee(80)).toBe(4.8);
  });

  it('aplica 5% para passagem de R$ 200', () => {
    expect(resolvePlatformFeePercentByTicketPrice(200)).toBe(5);
    expect(calculatePlatformFee(200)).toBe(10);
  });

  it('aplica 4% para passagem de R$ 500', () => {
    expect(resolvePlatformFeePercentByTicketPrice(500)).toBe(4);
    expect(calculatePlatformFee(500)).toBe(20);
  });

  it('aplica 4% para passagem de R$ 520 (cenário VKL quarto compartilhado)', () => {
    expect(resolvePlatformFeePercentByTicketPrice(520)).toBe(4);
    expect(calculatePlatformFee(520)).toBe(20.8);
  });

  it('aplica 4% para passagem de R$ 580 (cenário VKL casal privativo)', () => {
    expect(resolvePlatformFeePercentByTicketPrice(580)).toBe(4);
    expect(calculatePlatformFee(580)).toBe(23.2);
  });

  it('aplica 3% para passagem de R$ 800', () => {
    expect(resolvePlatformFeePercentByTicketPrice(800)).toBe(3);
    expect(calculatePlatformFee(800)).toBe(24);
  });

  it('aplica teto de R$ 25 para passagem de R$ 1.000', () => {
    expect(resolvePlatformFeePercentByTicketPrice(1000)).toBe(3);
    expect(calculatePlatformFee(1000)).toBe(25);
  });

  it('calcula taxa no checkout quando repasse ao cliente está ativo', () => {
    const breakdown = calculateFees(1000, [], { passToCustomer: true });
    expect(breakdown.totalFees).toBe(25);
    expect(breakdown.unitPriceWithFees).toBe(1025);
  });

  it('mantém o cenário VKL Turismo separado entre subtotal de R$ 700, taxa de R$ 21 e total de R$ 721', () => {
    const subtotalPassageiro = 700;
    const breakdown = calculateFees(subtotalPassageiro, [], { passToCustomer: true });

    expect(resolvePlatformFeePercentByTicketPrice(subtotalPassageiro)).toBe(3);
    expect(breakdown.totalFees).toBe(21);
    expect(breakdown.unitPriceWithFees).toBe(721);
    expect(subtotalPassageiro + breakdown.totalFees).toBe(721);
  });
});
