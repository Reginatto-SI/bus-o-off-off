export interface CheckoutPassengerSnapshotInput {
  trip_id: string | null;
  final_price: number | null;
  original_price: number | null;
  discount_amount: number | null;
  benefit_applied?: boolean | null;
  ticket_type_id?: string | null;
  ticket_type_name?: string | null;
  ticket_type_price?: number | null;
}

export interface CheckoutEventFeeInput {
  fee_type: string;
  value: number;
  is_active: boolean;
}

export interface CheckoutFinancialIntegrityParams {
  saleTripId: string;
  grossAmount: number;
  eventFees: CheckoutEventFeeInput[];
  passengerSnapshots: CheckoutPassengerSnapshotInput[];
  passPlatformFeeToCustomer: boolean;
  progressivePlatformFeeTotal: number;
}

export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeMoney(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? roundCurrency(numeric) : 0;
}

function hasPositiveMoney(value: unknown): boolean {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) && numeric > 0;
}

export function resolvePassengerFinancialUnitPrice(
  passenger: CheckoutPassengerSnapshotInput,
): number {
  const finalPrice = normalizeMoney(passenger.final_price);
  const ticketTypePrice = normalizeMoney(passenger.ticket_type_price);
  const discountAmount = normalizeMoney(passenger.discount_amount);
  const benefitApplied = Boolean(passenger.benefit_applied) || discountAmount > 0;

  // Regra de integridade do checkout público: quando não há benefício aplicado,
  // o pacote/tipo selecionado é a fonte de verdade financeira do passageiro.
  // Isso impede que o preço base do evento substitua um pacote com preço próprio.
  if (hasPositiveMoney(passenger.ticket_type_price) && !benefitApplied) {
    return ticketTypePrice;
  }

  if (hasPositiveMoney(passenger.final_price)) {
    return finalPrice;
  }

  return ticketTypePrice;
}

export function calculateFeesTotal(params: {
  passengerUnitPrices: number[];
  eventFees: CheckoutEventFeeInput[];
  passPlatformFeeToCustomer: boolean;
  progressivePlatformFeeTotal: number;
}) {
  const activeFees = params.eventFees.filter((fee) => fee.is_active);
  const feesPerPassenger = params.passengerUnitPrices.map((unitPrice) => activeFees.reduce((sum, fee) => {
    if (fee.fee_type === "percent") {
      return sum + roundCurrency(unitPrice * (Number(fee.value) / 100));
    }
    return sum + roundCurrency(Number(fee.value) || 0);
  }, 0));

  const fixedAndPercentTotal = roundCurrency(
    feesPerPassenger.reduce((sum, passengerFee) => sum + passengerFee, 0),
  );

  const platformFee = params.passPlatformFeeToCustomer
    ? roundCurrency(params.progressivePlatformFeeTotal)
    : 0;
  return roundCurrency(fixedAndPercentTotal + platformFee);
}

export function buildCheckoutFinancialIntegritySnapshot(
  params: CheckoutFinancialIntegrityParams,
) {
  const primaryPassengers = params.passengerSnapshots.filter(
    (passenger) => passenger.trip_id === params.saleTripId,
  );
  const passengerUnitPrices = primaryPassengers.map(resolvePassengerFinancialUnitPrice);
  const passengerFinalSum = roundCurrency(
    passengerUnitPrices.reduce((sum, unitPrice) => sum + unitPrice, 0),
  );
  const passengerDiscountSum = roundCurrency(
    primaryPassengers.reduce(
      (sum, passenger) => sum + normalizeMoney(passenger.discount_amount),
      0,
    ),
  );
  const feesTotal = calculateFeesTotal({
    passengerUnitPrices,
    eventFees: params.eventFees,
    passPlatformFeeToCustomer: params.passPlatformFeeToCustomer,
    progressivePlatformFeeTotal: params.progressivePlatformFeeTotal,
  });
  const saleFeesFromGross = roundCurrency(roundCurrency(params.grossAmount) - passengerFinalSum);
  const expectedGrossFromSnapshot = roundCurrency(passengerFinalSum + feesTotal);

  return {
    primaryPassengers,
    quantityFromSnapshot: primaryPassengers.length,
    passengerUnitPrices,
    passengerFinalSum,
    passengerDiscountSum,
    feesTotal,
    saleFeesFromGross,
    expectedGrossFromSnapshot,
  };
}
