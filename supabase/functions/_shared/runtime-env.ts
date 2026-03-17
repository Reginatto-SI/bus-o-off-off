/**
 * Contrato operacional vigente (Step 1):
 * 1) create-asaas-payment resolve por host
 * 2) persiste em sales.payment_environment
 * 3) verify/webhook/platform-fee leem da venda (não recalculam host)
 *
 * Zona cinzenta mapeada: host ainda é o gatilho inicial da decisão.
 * Candidato de centralização para Step 2 (resolvedor único de contexto).
 */
/**
 * Resolução de ambiente de pagamento Asaas — baseada exclusivamente no host.
 *
 * Regra única:
 * - smartbusbr.com.br / www.smartbusbr.com.br → production
 * - Qualquer outro host → sandbox
 *
 * O ambiente é decidido UMA VEZ no create-asaas-payment e salvo em
 * sales.payment_environment. Todas as outras funções leem da venda.
 */

export type PaymentEnvironment = "production" | "sandbox";

const PRODUCTION_HOSTS = new Set([
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

/**
 * Extrai o host real do cliente a partir dos headers da requisição.
 * Prioriza origin/referer (que contêm o domínio do cliente),
 * pois o header "host" em Edge Functions é sempre o runtime.
 */
function extractRequestHost(req: Request): string {
  const headerCandidates = [
    req.headers.get("origin"),
    req.headers.get("referer"),
    req.headers.get("x-forwarded-host"),
    req.headers.get("host"),
  ];

  for (const candidate of headerCandidates) {
    if (!candidate) continue;
    const normalized = normalizeHost(candidate);
    if (normalized && normalized !== "edge-runtime.supabase.com") return normalized;
  }

  return "unknown";
}

/**
 * Resolve o ambiente de pagamento com base no host da requisição.
 * Usada APENAS em create-asaas-payment (ponto único de decisão).
 */
export function resolveEnvironmentFromHost(req: Request): { env: PaymentEnvironment; host: string } {
  const host = extractRequestHost(req);
  const env: PaymentEnvironment = PRODUCTION_HOSTS.has(host) ? "production" : "sandbox";

  console.log("[runtime-env] Ambiente resolvido por host", {
    host_detected: host,
    environment_selected: env,
  });

  return { env, host };
}

export function getAsaasBaseUrl(env: PaymentEnvironment): string {
  return env === "production"
    ? "https://api.asaas.com/v3"
    : "https://sandbox.asaas.com/api/v3";
}

export function getAsaasApiKeySecretName(env: PaymentEnvironment): string {
  return env === "production" ? "ASAAS_API_KEY" : "ASAAS_API_KEY_SANDBOX";
}

export function getAsaasWalletSecretName(env: PaymentEnvironment): string {
  return env === "production" ? "ASAAS_WALLET_ID" : "ASAAS_WALLET_ID_SANDBOX";
}

export function getAsaasWebhookTokenSecretName(env: PaymentEnvironment): string {
  return env === "production" ? "ASAAS_WEBHOOK_TOKEN" : "ASAAS_WEBHOOK_TOKEN_SANDBOX";
}
