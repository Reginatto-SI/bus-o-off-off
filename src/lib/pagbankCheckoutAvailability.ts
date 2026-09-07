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
