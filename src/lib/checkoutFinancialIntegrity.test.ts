import { describe, expect, it } from 'vitest';
import {
  buildCheckoutFinancialIntegritySnapshot,
  resolvePassengerFinancialUnitPrice,
  type CheckoutPassengerSnapshotInput,
} from '../../supabase/functions/_shared/checkout-financial-integrity';

const tripId = 'trip-ida';

function passenger(params: Partial<CheckoutPassengerSnapshotInput> & { ticketTypePrice?: number }): CheckoutPassengerSnapshotInput {
  const ticketTypePrice = params.ticketTypePrice ?? Number(params.ticket_type_price ?? params.final_price ?? 0);
  return {
    trip_id: params.trip_id ?? tripId,
    final_price: params.final_price ?? ticketTypePrice,
    original_price: params.original_price ?? ticketTypePrice,
    discount_amount: params.discount_amount ?? 0,
    benefit_applied: params.benefit_applied ?? false,
    ticket_type_id: params.ticket_type_id ?? 'type-id',
    ticket_type_name: params.ticket_type_name ?? 'Tipo selecionado',
    ticket_type_price: params.ticket_type_price ?? ticketTypePrice,
  };
}

function validateScenario(params: {
  eventBasePrice: number;
  selectedTypePrice: number;
  grossAmount: number;
  platformFee: number;
  passengerFinalPrice?: number;
}) {
  const snapshot = buildCheckoutFinancialIntegritySnapshot({
    saleTripId: tripId,
    grossAmount: params.grossAmount,
    passengerSnapshots: [
      passenger({
        final_price: params.passengerFinalPrice ?? params.selectedTypePrice,
        original_price: params.eventBasePrice,
        ticket_type_price: params.selectedTypePrice,
        ticket_type_name: 'PACOTE 01 PESSOAS - QUARTO SINGLE',
      }),
    ],
    eventFees: [],
    passPlatformFeeToCustomer: true,
    progressivePlatformFeeTotal: params.platformFee,
  });

  return {
    ...snapshot,
    isValid:
      Math.abs(snapshot.saleFeesFromGross - snapshot.feesTotal) <= 0.01 &&
      Math.abs(params.grossAmount - snapshot.expectedGrossFromSnapshot) <= 0.01,
  };
}

describe('checkout financial integrity with ticket type packages', () => {
  it('usa ticket_type_price de R$ 700 em vez do preço base do evento de R$ 520', () => {
    const result = validateScenario({
      eventBasePrice: 520,
      selectedTypePrice: 700,
      // Simula snapshot legado/incorreto vindo do preço base; a validação deve considerar o tipo selecionado.
      passengerFinalPrice: 520,
      platformFee: 21,
      grossAmount: 721,
    });

    expect(result.passengerFinalSum).toBe(700);
    expect(result.feesTotal).toBe(21);
    expect(result.expectedGrossFromSnapshot).toBe(721);
    expect(result.isValid).toBe(true);
  });

  it('bloqueia quando o total foi salvo como preço base R$ 520 + taxa, apesar do tipo selecionado de R$ 700', () => {
    const result = validateScenario({
      eventBasePrice: 520,
      selectedTypePrice: 700,
      passengerFinalPrice: 520,
      platformFee: 21,
      grossAmount: 540.8,
    });

    expect(result.passengerFinalSum).toBe(700);
    expect(result.expectedGrossFromSnapshot).toBe(721);
    expect(result.isValid).toBe(false);
  });

  it('valida pacote compartilhado de R$ 520 com taxa progressiva atual de R$ 20,80', () => {
    const result = validateScenario({
      eventBasePrice: 520,
      selectedTypePrice: 520,
      platformFee: 20.8,
      grossAmount: 540.8,
    });

    expect(result.passengerFinalSum).toBe(520);
    expect(result.feesTotal).toBe(20.8);
    expect(result.expectedGrossFromSnapshot).toBe(540.8);
    expect(result.isValid).toBe(true);
  });

  it('valida pacote casal de R$ 580 com taxa progressiva atual de R$ 23,20', () => {
    const result = validateScenario({
      eventBasePrice: 520,
      selectedTypePrice: 580,
      platformFee: 23.2,
      grossAmount: 603.2,
    });

    expect(result.passengerFinalSum).toBe(580);
    expect(result.feesTotal).toBe(23.2);
    expect(result.expectedGrossFromSnapshot).toBe(603.2);
    expect(result.isValid).toBe(true);
  });

  it('preserva final_price quando há benefício/desconto, mesmo com ticket_type_price maior', () => {
    const unitPrice = resolvePassengerFinancialUnitPrice({
      trip_id: tripId,
      final_price: 650,
      original_price: 700,
      discount_amount: 50,
      benefit_applied: true,
      ticket_type_id: 'type-id',
      ticket_type_name: 'PACOTE 01 PESSOAS - QUARTO SINGLE',
      ticket_type_price: 700,
    });

    expect(unitPrice).toBe(650);
  });

  it('preserva final_price quando há desconto registrado mesmo se benefit_applied estiver falso', () => {
    const unitPrice = resolvePassengerFinancialUnitPrice({
      trip_id: tripId,
      final_price: 650,
      original_price: 700,
      discount_amount: 50,
      benefit_applied: false,
      ticket_type_id: 'type-id',
      ticket_type_name: 'PACOTE 01 PESSOAS - QUARTO SINGLE',
      ticket_type_price: 700,
    });

    expect(unitPrice).toBe(650);
  });

  it('mantém evento legado sem múltiplos tipos usando final_price quando não há ticket_type_price', () => {
    const unitPrice = resolvePassengerFinancialUnitPrice({
      trip_id: tripId,
      final_price: 150,
      original_price: 150,
      discount_amount: 0,
      benefit_applied: false,
      ticket_type_id: null,
      ticket_type_name: null,
      ticket_type_price: null,
    });

    expect(unitPrice).toBe(150);
  });

  it('respeita preço de tipo em evento de outra empresa com múltiplos tipos', () => {
    const result = validateScenario({
      eventBasePrice: 100,
      selectedTypePrice: 200,
      platformFee: 10,
      grossAmount: 210,
    });

    expect(result.passengerFinalSum).toBe(200);
    expect(result.expectedGrossFromSnapshot).toBe(210);
    expect(result.isValid).toBe(true);
  });
});
