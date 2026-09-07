// Disponibilidade do PagBank no checkout público.
//
// Regra vigente: `pix_ready` e `split_ready` são EVIDÊNCIA de capacidade já
// comprovada por cobrança real — nunca pré-requisito da primeira cobrança.
// Exigi-los antes da primeira venda cria bloqueio circular.

export type PagbankConnectionSnapshot = {
  status?: string | null;
  is_current?: boolean | null;
  pix_ready?: boolean | null;
  split_ready?: boolean | null;
} | null;

export type PagbankCheckoutAvailability = {
  allowed: boolean;
  reason:
    | "ok"
    | "environment_not_allowed"
    | "connection_missing"
    | "connection_not_current"
    | "connection_not_connected"
    | "platform_fee_missing";
  /** Capacidade já comprovada por cobrança real (apenas informativo). */
  pixProven: boolean;
  splitProven: boolean;
};

export function resolvePagbankCheckoutAvailability(params: {
  environment: string | null | undefined;
  connection: PagbankConnectionSnapshot;
  platformFeePercent: number | null | undefined;
}): PagbankCheckoutAvailability {
  const { connection } = params;
  const pixProven = Boolean(connection?.pix_ready);
  const splitProven = Boolean(connection?.split_ready);
  const base = { pixProven, splitProven };

  // Produção PagBank permanece bloqueada nesta fase (também por backend/banco).
  if (params.environment !== "sandbox") {
    return { allowed: false, reason: "environment_not_allowed", ...base };
  }
  if (!connection) return { allowed: false, reason: "connection_missing", ...base };
  if (connection.is_current === false) {
    return { allowed: false, reason: "connection_not_current", ...base };
  }
  if (connection.status !== "connected") {
    return { allowed: false, reason: "connection_not_connected", ...base };
  }
  const fee = Number(params.platformFeePercent ?? 0);
  if (!Number.isFinite(fee) || fee <= 0) {
    return { allowed: false, reason: "platform_fee_missing", ...base };
  }
  return { allowed: true, reason: "ok", ...base };
}

/**
 * Espelho no frontend da política de rollback do backend
 * (`supabase/functions/_shared/pagbank/attempt-policy.ts`).
 * O checkout só pode apagar a venda quando é certo que o PagBank não criou
 * nenhum Order. Em qualquer sinal de cobrança externa, a venda é preservada
 * para consulta/reconciliação.
 */
export const PAGBANK_ORDER_MAY_EXIST_CODES: readonly string[] = [
  "pagbank_indeterminate",
  "pagbank_idempotency_conflict",
  "pagbank_split_not_confirmed",
  "pagbank_pix_artifact_missing",
  "pagbank_order_needs_reconciliation",
];

export function pagbankFailureAllowsSaleRollback(params: {
  errorCode?: string | null;
  orderId?: string | null;
  chargeId?: string | null;
}): boolean {
  if (params.orderId || params.chargeId) return false;
  const code = params.errorCode ?? "";
  if (!code) return false;
  return !PAGBANK_ORDER_MAY_EXIST_CODES.includes(code);
}
