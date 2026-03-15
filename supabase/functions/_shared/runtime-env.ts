/**
 * Fonte única de verdade para resolver ambiente de pagamento por host.
 *
 * Regra oficial do projeto:
 * - Produção somente para smartbusbr.com.br e www.smartbusbr.com.br
 * - Qualquer outro host opera em Sandbox (inclui localhost, lovable.dev e previews)
 */

export type PaymentEnvironment = "production" | "sandbox";

const PRODUCTION_HOST_ALLOWLIST = new Set(["smartbusbr.com.br", "www.smartbusbr.com.br"]);

function normalizeHost(rawValue: string): string {
  const trimmed = rawValue.trim().toLowerCase();

  // Header pode vir com múltiplos hosts separados por vírgula (proxy chain).
  const firstValue = trimmed.split(",")[0]?.trim() ?? "";

  if (!firstValue) return "";

  // Se vier URL completa, usamos URL parser para extrair hostname.
  if (firstValue.includes("://")) {
    try {
      return new URL(firstValue).hostname.toLowerCase();
    } catch {
      // fallback abaixo
    }
  }

  // Remove porta quando vier como host:port
  return firstValue.replace(/:\d+$/, "");
}

function extractRequestHost(req: Request): string {
  const headerCandidates = [
    req.headers.get("x-forwarded-host"),
    req.headers.get("host"),
    req.headers.get("origin"),
    req.headers.get("referer"),
  ];

  for (const candidate of headerCandidates) {
    if (!candidate) continue;
    const normalized = normalizeHost(candidate);
    if (normalized) return normalized;
  }

  return "unknown";
}

export function resolvePaymentEnvironment(req: Request): {
  resolved_env: PaymentEnvironment;
  isProduction: boolean;
  host: string;
} {
  const host = extractRequestHost(req);
  const isProduction = PRODUCTION_HOST_ALLOWLIST.has(host);

  return {
    resolved_env: isProduction ? "production" : "sandbox",
    isProduction,
    host,
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
