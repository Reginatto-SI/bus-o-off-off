// @ts-nocheck — módulo compartilhado Deno (também usado nos testes do app).
/* eslint-disable @typescript-eslint/no-explicit-any */
// Política pura de tentativa PagBank: separa "requisição rejeitada antes da
// criação" de "Order possivelmente/comprovadamente criado". Nenhuma venda pode
// ser apagada quando existir a menor evidência de cobrança externa.

/**
 * Códigos em que o Order pode já existir no PagBank. A venda local, os
 * passageiros e a tentativa devem ser preservados; nunca criar outro Order
 * automaticamente e nunca dizer ao comprador que "a cobrança foi recusada".
 */
export const PAGBANK_ORDER_MAY_EXIST_CODES: readonly string[] = [
  "pagbank_indeterminate",
  "pagbank_idempotency_conflict",
  "pagbank_split_not_confirmed",
  "pagbank_pix_artifact_missing",
  "pagbank_order_needs_reconciliation",
];

export type PagbankFailureClassification =
  | "rejected_before_creation"
  | "order_may_exist";

/**
 * Classifica uma falha de criação. `orderId` presente (ou código de risco)
 * significa Order possivelmente criado. Rollback só é permitido quando há
 * certeza de que nada foi criado externamente.
 */
export function classifyPagbankCreateFailure(params: {
  errorCode?: string | null;
  orderId?: string | null;
  chargeId?: string | null;
}): PagbankFailureClassification {
  if (params.orderId || params.chargeId) return "order_may_exist";
  const code = params.errorCode ?? "";
  if (!code) return "order_may_exist"; // desconhecido = tratar como risco
  return PAGBANK_ORDER_MAY_EXIST_CODES.includes(code)
    ? "order_may_exist"
    : "rejected_before_creation";
}

/** Só apagar a venda quando comprovadamente nada foi criado no PagBank. */
export function pagbankFailureAllowsSaleRollback(params: {
  errorCode?: string | null;
  orderId?: string | null;
  chargeId?: string | null;
}): boolean {
  return classifyPagbankCreateFailure(params) === "rejected_before_creation";
}

export type PagbankRetryDecision =
  | "reuse_order"
  | "recover_by_reference"
  | "wait_in_flight"
  | "needs_reconciliation"
  | "create";

/**
 * Decide o que fazer numa nova tentativa da MESMA venda (mesma chave de
 * idempotência). Tentativa falha que já carrega `external_order_id` nunca
 * autoriza um segundo Order: exige consulta/reconciliação do Order existente.
 */
export function resolvePagbankRetryDecision(attempt: {
  state?: string | null;
  external_order_id?: string | null;
} | null | undefined): PagbankRetryDecision {
  if (!attempt) return "create";
  if (attempt.external_order_id) {
    return attempt.state === "succeeded" ? "reuse_order" : "needs_reconciliation";
  }
  if (attempt.state === "indeterminate") return "recover_by_reference";
  if (attempt.state === "pending") return "wait_in_flight";
  return "create";
}
