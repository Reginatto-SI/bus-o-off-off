// Validação pura: uma Order PAID só pode finalizar a venda se identificar exatamente
// a cobrança registrada nela. Qualquer divergência falha fechado.
export type OrderIntegrityExpectation = {
  saleId: string;
  saleEnvironment: string;
  saleConnectionId: string | null;
  credentialEnvironment: string;
  attempt: {
    external_order_id: string | null;
    amount_cents: number | null;
    environment: string;
    connection_id: string | null;
  };
};

export type OrderIntegrityResult = { ok: true } | { ok: false; reason: string };

// deno-lint-ignore no-explicit-any
export function validatePagbankOrderIntegrity(order: any, exp: OrderIntegrityExpectation): OrderIntegrityResult {
  const charge = Array.isArray(order?.charges) ? order.charges[0] : null;
  const amount = charge?.amount ?? null;
  if (!exp.attempt.external_order_id || order?.id !== exp.attempt.external_order_id) return { ok: false, reason: "order_id_mismatch" };
  if (order?.reference_id !== exp.saleId) return { ok: false, reason: "reference_id_mismatch" };
  if (!Number.isInteger(exp.attempt.amount_cents) || amount?.value !== exp.attempt.amount_cents) return { ok: false, reason: "amount_mismatch" };
  if (amount?.currency !== "BRL") return { ok: false, reason: "currency_mismatch" };
  if (exp.attempt.environment !== exp.saleEnvironment || exp.credentialEnvironment !== exp.saleEnvironment) return { ok: false, reason: "environment_mismatch" };
  if (!exp.saleConnectionId || exp.attempt.connection_id !== exp.saleConnectionId) return { ok: false, reason: "connection_mismatch" };
  return { ok: true };
}
