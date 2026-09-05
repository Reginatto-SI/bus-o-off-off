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
  return `pagbank:${params.companyId}:${params.saleId}:${params.environment}:${params.operation}`;
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
 * Tolerante a variações documentadas: `qr_codes[]` e `charges[]`.
 */
export function extractPagbankPixArtifacts(order: any): PagbankPixArtifacts {
  const qr = Array.isArray(order?.qr_codes) ? order.qr_codes[0] : null;
  const charge = Array.isArray(order?.charges) ? order.charges[0] : null;
  const links: any[] = Array.isArray(qr?.links) ? qr.links : [];
  const imageLink = links.find((l) => typeof l?.media === "string" && l.media.startsWith("image/"));
  const qrText = typeof qr?.text === "string"
    ? qr.text
    : typeof charge?.payment_method?.pix?.qr_code?.text === "string"
      ? charge.payment_method.pix.qr_code.text
      : null;
  const rawStatus = typeof charge?.status === "string"
    ? charge.status
    : typeof order?.status === "string"
      ? order.status
      : null;
  return {
    orderId: typeof order?.id === "string" ? order.id : null,
    chargeId: typeof charge?.id === "string" ? charge.id : null,
    qrCodeId: typeof qr?.id === "string" ? qr.id : null,
    qrText,
    qrImageUrl: typeof imageLink?.href === "string" ? imageLink.href : null,
    expiresAt: typeof qr?.expiration_date === "string"
      ? qr.expiration_date
      : typeof charge?.payment_method?.pix?.expiration_date === "string"
        ? charge.payment_method.pix.expiration_date
        : null,
    rawStatus,
  };
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
