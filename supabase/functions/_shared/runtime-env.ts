/**
 * Fonte única de verdade para resolver ambiente de pagamento (Asaas).
 *
 * Modelo híbrido:
 * 1. ASAAS_ENV (secret) = fonte primária de verdade ("sandbox" | "production")
 * 2. Host da requisição = validação de segurança adicional
 *    - production: somente smartbusbr.com.br / www.smartbusbr.com.br
 *    - sandbox: qualquer host é aceito
 * 3. Se ASAAS_ENV ausente ou inválido → erro explícito (nunca fallback)
 */

export type PaymentEnvironment = "production" | "sandbox";

export interface EnvironmentResolution {
  resolved_env: PaymentEnvironment;
  isProduction: boolean;
  host: string;
  blocked: boolean;
  blockReason?: string;
  /** true quando ASAAS_ENV era production mas o host forçou downgrade para sandbox */
  downgraded: boolean;
}

const PRODUCTION_HOST_ALLOWLIST = new Set([
  "smartbusbr.com.br",
  "www.smartbusbr.com.br",
]);

function normalizeHost(rawValue: string): string {
  const trimmed = rawValue.trim().toLowerCase();
  const firstValue = trimmed.split(",")[0]?.trim() ?? "";
  if (!firstValue) return "";

  if (firstValue.includes("://")) {
    try {
      return new URL(firstValue).hostname.toLowerCase();
    } catch {
      // fallback abaixo
    }
  }

  return firstValue.replace(/:\d+$/, "");
}

function extractRequestHost(req: Request): string {
  // IMPORTANT: In Supabase Edge Functions the "host" header is always
  // "edge-runtime.supabase.com" (the runtime itself), NOT the client origin.
  // We must prioritise origin/referer which carry the actual client domain.
  const headerCandidates = [
    req.headers.get("origin"),
    req.headers.get("referer"),
    req.headers.get("x-forwarded-host"),
    // "host" is intentionally last — it reflects the Edge Function runtime,
    // not the calling client, and would cause false-positive blocks.
    req.headers.get("host"),
  ];

  for (const candidate of headerCandidates) {
    if (!candidate) continue;
    const normalized = normalizeHost(candidate);
    if (normalized && normalized !== "edge-runtime.supabase.com") return normalized;
  }

  return "unknown";
}

export function resolvePaymentEnvironment(req: Request): EnvironmentResolution {
  const rawEnv = (Deno.env.get("ASAAS_ENV") ?? "").trim().toLowerCase();
  const host = extractRequestHost(req);

  // ASAAS_ENV ausente ou inválido → bloqueio explícito
  if (rawEnv !== "sandbox" && rawEnv !== "production") {
    console.error("[runtime-env] ASAAS_ENV ausente ou inválido", { rawEnv, host });
    return {
      resolved_env: "sandbox",
      isProduction: false,
      host,
      blocked: true,
      blockReason: `ASAAS_ENV não configurado ou inválido (valor: "${rawEnv}"). Configure como "sandbox" ou "production".`,
      downgraded: false,
    };
  }

  const isProduction = rawEnv === "production";

  // Guard de segurança: produção só é permitida em hosts oficiais.
  // Se o host não pertence à allowlist, rebaixa automaticamente para sandbox.
  if (isProduction && !PRODUCTION_HOST_ALLOWLIST.has(host)) {
    console.warn("[runtime-env] Downgrade automático para sandbox: host fora da allowlist", {
      asaas_env: rawEnv,
      host,
      allowed_hosts: [...PRODUCTION_HOST_ALLOWLIST],
    });
    return {
      resolved_env: "sandbox",
      isProduction: false,
      host,
      blocked: false,
      downgraded: true,
    };
  }

  console.log("[runtime-env] Ambiente resolvido", {
    asaas_env: rawEnv,
    resolved_env: rawEnv,
    host,
    blocked: false,
  });

  return {
    resolved_env: rawEnv as PaymentEnvironment,
    isProduction,
    host,
    blocked: false,
    downgraded: false,
  };
}

export function getAsaasBaseUrl(resolvedEnv: PaymentEnvironment): string {
  return resolvedEnv === "production"
    ? "https://api.asaas.com/v3"
    : "https://sandbox.asaas.com/api/v3";
}

export function getAsaasPlatformApiKeySecretName(resolvedEnv: PaymentEnvironment): string {
  return resolvedEnv === "production" ? "ASAAS_API_KEY" : "ASAAS_API_KEY_SANDBOX";
}

export function getAsaasPlatformWalletSecretName(resolvedEnv: PaymentEnvironment): string {
  return resolvedEnv === "production" ? "ASAAS_WALLET_ID" : "ASAAS_WALLET_ID_SANDBOX";
}

export function getAsaasWebhookTokenSecretName(resolvedEnv: PaymentEnvironment): string {
  return resolvedEnv === "production" ? "ASAAS_WEBHOOK_TOKEN" : "ASAAS_WEBHOOK_TOKEN_SANDBOX";
}
