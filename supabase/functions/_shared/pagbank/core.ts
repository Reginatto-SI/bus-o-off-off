// @ts-nocheck — arquivo Deno (edge function): tipos resolvidos pelo runtime Deno, não pelo tsc do app.
/* eslint-disable @typescript-eslint/no-explicit-any */
// Núcleo puro do adapter PagBank (sem rede, sem Supabase, sem Deno.env):
// URLs por ambiente, chave idempotente, status normalizado, extração do QR PIX
// e assinatura de webhook. Tudo aqui é testável no Vitest.

export type PagbankEnvironment = "sandbox" | "production";
export type PagbankGateway = "pagbank";

/** Nesta fase o PagBank opera SOMENTE em Sandbox. Produção falha fechado. */
export const PAGBANK_ALLOWED_ENVIRONMENTS: readonly PagbankEnvironment[] = ["sandbox"];

export const PAGBANK_API_BASE_URLS: Record<PagbankEnvironment, string> = {
  sandbox: "https://sandbox.api.pagseguro.com",
  production: "https://api.pagseguro.com",
};

export const PAGBANK_CONNECT_AUTHORIZE_URLS: Record<PagbankEnvironment, string> = {
  sandbox: "https://connect.sandbox.pagbank.com.br/oauth2/authorize",
  production: "https://connect.pagbank.com.br/oauth2/authorize",
};

/** Scopes mínimos: sem checkout.* (checkout hospedado está fora do escopo). */
export const PAGBANK_CONNECT_SCOPES = [
  "payments.read",
  "payments.create",
  "accounts.read",
] as const;

export const PAGBANK_PIX_EXPIRATION_MINUTES = 30;

export type PagbankErrorCode =
  | "pagbank_environment_not_allowed"
  | "pagbank_configuration_missing"
  | "pagbank_connection_missing"
  | "pagbank_connection_not_operational"
  | "pagbank_auth_failed"
  | "pagbank_validation_rejected"
  | "pagbank_declined"
  | "pagbank_indeterminate"
  | "pagbank_idempotency_conflict"
  | "pagbank_signature_invalid"
  | "pagbank_tenant_mismatch"
  | "pagbank_split_recipient_missing"
  | "pagbank_split_sum_mismatch"
  | "pagbank_split_not_confirmed"
  | "pagbank_pix_artifact_missing"
  | "pagbank_order_response_incomplete"
  | "pagbank_order_needs_reconciliation"
  | "pagbank_transient_error";

export class PagbankError extends Error {
  code: PagbankErrorCode;
  httpStatus: number;
  publicMessage: string;
  detail?: Record<string, unknown>;
  constructor(code: PagbankErrorCode, publicMessage: string, httpStatus = 400, detail?: Record<string, unknown>) {
    super(`${code}: ${publicMessage}`);
    this.code = code;
    this.httpStatus = httpStatus;
    this.publicMessage = publicMessage;
    this.detail = detail;
  }
}

export function assertPagbankEnvironmentAllowed(environment: string | null | undefined): PagbankEnvironment {
  if (environment !== "sandbox" && environment !== "production") {
    throw new PagbankError("pagbank_environment_not_allowed", "Ambiente de pagamento inválido.", 409, { environment });
  }
  if (!PAGBANK_ALLOWED_ENVIRONMENTS.includes(environment)) {
    throw new PagbankError(
      "pagbank_environment_not_allowed",
      "PagBank ainda não está habilitado em Produção nesta fase.",
      409,
      { environment },
    );
  }
  return environment;
}

/**
 * Chave estável por operação lógica: empresa + venda + gateway + ambiente + operação.
 * Retry reutiliza exatamente a mesma chave. Nunca inclui timestamp ou aleatoriedade.
 */
export function buildPagbankIdempotencyKey(params: {
  companyId: string;
  saleId: string;
  environment: PagbankEnvironment;
  operation: "create_pix";
}): string {
  // O PagBank aceita somente caracteres de palavra e hífen neste header.
  return `pagbank_${params.companyId}_${params.saleId}_${params.environment}_${params.operation}`;
}

export type PagbankNormalizedStatus = "pending" | "paid" | "failed" | "canceled" | "unknown";

/** Mapeamento conservador: somente PAID finaliza. */
export function normalizePagbankStatus(raw: string | null | undefined): PagbankNormalizedStatus {
  switch ((raw ?? "").toUpperCase()) {
    case "WAITING":
    case "AUTHORIZED":
    case "IN_ANALYSIS":
      return "pending";
    case "PAID":
      return "paid";
    case "DECLINED":
      return "failed";
    case "CANCELED":
      return "canceled";
    default:
      return "unknown";
  }
}

export type PagbankPixArtifacts = {
  orderId: string | null;
  chargeId: string | null;
  qrCodeId: string | null;
  qrText: string | null;
  qrImageUrl: string | null;
  expiresAt: string | null;
  rawStatus: string | null;
};

/**
 * Extrai IDs, status e artefatos PIX de um objeto Order (criação, consulta ou webhook).
 * Tolerante às duas formas documentadas: `qr_codes[]` (pedido com QR Code) e
 * `charges[].payment_method.pix` (pedido com divisão de pagamento com PIX).
 */
export function extractPagbankPixArtifacts(order: any): PagbankPixArtifacts {
  const qr = Array.isArray(order?.qr_codes) ? order.qr_codes[0] : null;
  const charge = Array.isArray(order?.charges) ? order.charges[0] : null;
  const chargePix = charge?.payment_method?.pix ?? null;
  const chargeQr = chargePix?.qr_code ?? chargePix ?? null;
  const links: any[] = Array.isArray(qr?.links)
    ? qr.links
    : Array.isArray(chargeQr?.links)
      ? chargeQr.links
      : Array.isArray(charge?.links)
        ? charge.links
        : [];
  const imageLink = links.find((l) => typeof l?.media === "string" && l.media.startsWith("image/"));
  const qrText = typeof qr?.text === "string"
    ? qr.text
    : typeof chargeQr?.text === "string"
      ? chargeQr.text
      : typeof chargePix?.emv === "string"
        ? chargePix.emv
        : null;
  const rawStatus = typeof charge?.status === "string"
    ? charge.status
    : typeof order?.status === "string"
      ? order.status
      : null;
  return {
    orderId: typeof order?.id === "string" ? order.id : null,
    chargeId: typeof charge?.id === "string" ? charge.id : null,
    qrCodeId: typeof qr?.id === "string" ? qr.id : typeof chargeQr?.id === "string" ? chargeQr.id : null,
    qrText,
    qrImageUrl: typeof imageLink?.href === "string" ? imageLink.href : null,
    expiresAt: typeof qr?.expiration_date === "string"
      ? qr.expiration_date
      : typeof chargePix?.expiration_date === "string"
        ? chargePix.expiration_date
        : null,
    rawStatus,
  };
}

export type PagbankSplitEcho = Array<{ accountId: string | null; amountCents: number | null }>;

/** Lê a divisão efetivamente registrada pelo PagBank na resposta do pedido. */
export function extractPagbankSplitReceivers(order: any): PagbankSplitEcho {
  const buckets: any[] = [
    ...(Array.isArray(order?.charges) ? order.charges : []),
    ...(Array.isArray(order?.qr_codes) ? order.qr_codes : []),
  ];
  const out: PagbankSplitEcho = [];
  for (const bucket of buckets) {
    const receivers = bucket?.splits?.receivers;
    if (!Array.isArray(receivers)) continue;
    for (const r of receivers) {
      out.push({
        accountId: typeof r?.account?.id === "string" ? r.account.id : null,
        amountCents: typeof r?.amount?.value === "number" ? r.amount.value : null,
      });
    }
  }
  return out;
}

export type PagbankSplitReconciliation =
  | { ok: true; reason: "not_expected" | "confirmed"; echoed: PagbankSplitEcho; echoedTotalCents: number }
  | {
    ok: false;
    reason: PagbankSplitMismatchReason;
    issues: PagbankSplitMismatchReason[];
    echoed: PagbankSplitEcho;
    echoedTotalCents: number | null;
  };

export type PagbankSplitMismatchReason =
  | "missing"
  | "incomplete"
  | "count_mismatch"
  | "unexpected_receiver"
  | "missing_receiver"
  | "duplicate_receiver"
  | "invalid_receiver"
  | "invalid_amount"
  | "amount_mismatch"
  | "sum_mismatch";

/**
 * Confere a divisão enviada contra a divisão retornada. Nunca aceitar cobrança em
 * que o SmartBus esperava split e o PagBank não registrou a divisão.
 */
export function reconcilePagbankSplit(
  order: any,
  expected: Array<{ accountId: string; amountCents: number }>,
  expectedTotalCents?: number,
): PagbankSplitReconciliation {
  const echoed = extractPagbankSplitReceivers(order);
  const splitBuckets = [
    ...(Array.isArray(order?.charges) ? order.charges : []),
    ...(Array.isArray(order?.qr_codes) ? order.qr_codes : []),
  ].filter((bucket: any) => bucket?.splits != null);

  if (expected.length === 0 && echoed.length === 0) {
    return { ok: true, reason: "not_expected", echoed, echoedTotalCents: 0 };
  }
  if (splitBuckets.length === 0) {
    return { ok: false, reason: "missing", issues: ["missing"], echoed, echoedTotalCents: 0 };
  }
  if (echoed.length === 0) {
    return { ok: false, reason: "incomplete", issues: ["incomplete"], echoed, echoedTotalCents: 0 };
  }

  const issues = new Set<PagbankSplitMismatchReason>();
  if (echoed.length !== expected.length) issues.add("count_mismatch");

  const validEchoed = echoed.filter((receiver) => {
    if (typeof receiver.accountId !== "string" || receiver.accountId.trim().length === 0) {
      issues.add("invalid_receiver");
      return false;
    }
    if (!Number.isInteger(receiver.amountCents) || (receiver.amountCents as number) <= 0) {
      issues.add("invalid_amount");
      return false;
    }
    return true;
  }) as Array<{ accountId: string; amountCents: number }>;

  const echoedCounts = new Map<string, number>();
  for (const receiver of validEchoed) {
    echoedCounts.set(receiver.accountId, (echoedCounts.get(receiver.accountId) ?? 0) + 1);
  }
  if ([...echoedCounts.values()].some((count) => count > 1)) issues.add("duplicate_receiver");

  const expectedByAccount = new Map(expected.map((receiver) => [receiver.accountId, receiver.amountCents]));
  for (const receiver of validEchoed) {
    if (!expectedByAccount.has(receiver.accountId)) issues.add("unexpected_receiver");
  }
  for (const receiver of expected) {
    const matches = validEchoed.filter((echo) => echo.accountId === receiver.accountId);
    if (matches.length === 0) {
      issues.add("missing_receiver");
    } else if (matches.length === 1 && matches[0].amountCents !== receiver.amountCents) {
      issues.add("amount_mismatch");
    }
  }

  const hasInvalidAmount = echoed.some((receiver) => !Number.isInteger(receiver.amountCents) || (receiver.amountCents as number) <= 0);
  const echoedTotalCents = hasInvalidAmount
    ? null
    : echoed.reduce((sum, receiver) => sum + (receiver.amountCents as number), 0);
  const expectedSum = expected.reduce((sum, receiver) => sum + receiver.amountCents, 0);
  const requiredTotal = expectedTotalCents ?? expectedSum;
  if (echoedTotalCents == null || echoedTotalCents !== requiredTotal || expectedSum !== requiredTotal) {
    issues.add("sum_mismatch");
  }

  if (issues.size > 0) {
    const orderedIssues = [...issues];
    const priority: PagbankSplitMismatchReason[] = [
      "missing", "incomplete", "invalid_receiver", "invalid_amount", "duplicate_receiver",
      "unexpected_receiver", "missing_receiver", "count_mismatch", "amount_mismatch", "sum_mismatch",
    ];
    const reason = priority.find((candidate) => issues.has(candidate)) ?? orderedIssues[0];
    return { ok: false, reason, issues: orderedIssues, echoed, echoedTotalCents };
  }

  return { ok: true, reason: "confirmed", echoed, echoedTotalCents: echoedTotalCents as number };
}

export type PagbankPixOrderValidation =
  | {
    ok: true;
    artifacts: PagbankPixArtifacts;
    split: PagbankSplitReconciliation;
  }
  | {
    ok: false;
    errorCode: "pagbank_split_not_confirmed" | "pagbank_pix_artifact_missing" | "pagbank_order_response_incomplete";
    reason: string;
    artifacts: PagbankPixArtifacts;
    split: PagbankSplitReconciliation | null;
  };

/**
 * Gate único de utilizabilidade do Order PIX. Criação e recuperação precisam
 * comprovar a mesma referência, IDs mínimos, split integral e artefato PIX antes
 * de persistir a tentativa como `succeeded`.
 */
export function validatePagbankPixOrder(params: {
  order: any;
  expectedReferenceId: string;
  expectedReceivers: Array<{ accountId: string; amountCents: number }>;
  expectedTotalCents: number;
}): PagbankPixOrderValidation {
  const artifacts = extractPagbankPixArtifacts(params.order);
  const referenceId = typeof params.order?.reference_id === "string" ? params.order.reference_id : null;
  if (!artifacts.orderId || referenceId !== params.expectedReferenceId) {
    return {
      ok: false,
      errorCode: "pagbank_order_response_incomplete",
      reason: !artifacts.orderId ? "order_id_missing" : referenceId == null ? "reference_id_missing" : "reference_id_mismatch",
      artifacts,
      split: null,
    };
  }
  if (params.expectedReceivers.length > 0 && !artifacts.chargeId) {
    return {
      ok: false,
      errorCode: "pagbank_order_response_incomplete",
      reason: "charge_id_missing",
      artifacts,
      split: null,
    };
  }

  const split = reconcilePagbankSplit(params.order, params.expectedReceivers, params.expectedTotalCents);
  if (!split.ok) {
    return {
      ok: false,
      errorCode: "pagbank_split_not_confirmed",
      reason: split.reason,
      artifacts,
      split,
    };
  }
  if (!artifacts.qrText) {
    return {
      ok: false,
      errorCode: "pagbank_pix_artifact_missing",
      reason: "pix_qr_text_missing",
      artifacts,
      split,
    };
  }
  return { ok: true, artifacts, split };
}


/** Identificador do evento para dedup: charge id + status (PagBank não envia event id próprio no Order). */
export function buildPagbankWebhookEventKey(order: any): string | null {
  const art = extractPagbankPixArtifacts(order);
  const anchor = art.chargeId ?? art.orderId;
  if (!anchor || !art.rawStatus) return null;
  return `${anchor}:${art.rawStatus.toUpperCase()}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Assinatura oficial: SHA-256 de `{token}-{payload_bruto}` comparada com `x-authenticity-token`.
 * O corpo bruto NUNCA deve ser reformatado antes deste cálculo.
 */
export async function verifyPagbankWebhookSignature(params: {
  rawBody: string;
  token: string | null | undefined;
  receivedSignature: string | null | undefined;
}): Promise<{ valid: boolean; reason: "ok" | "missing_token" | "missing_signature" | "mismatch" }> {
  if (!params.token) return { valid: false, reason: "missing_token" };
  if (!params.receivedSignature) return { valid: false, reason: "missing_signature" };
  const expected = await sha256Hex(`${params.token}-${params.rawBody}`);
  const received = params.receivedSignature.trim().toLowerCase();
  return timingSafeEqualHex(expected, received)
    ? { valid: true, reason: "ok" }
    : { valid: false, reason: "mismatch" };
}

/** Mascara conta/e-mail para exibição administrativa sem expor identificadores completos. */
export function maskIdentifier(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.includes("@")) {
    const [user, domain] = value.split("@");
    return `${user.slice(0, 2)}***@${domain}`;
  }
  if (value.length <= 6) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 5)}…${value.slice(-3)}`;
}
