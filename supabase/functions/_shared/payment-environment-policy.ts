// @ts-nocheck — arquivo Deno (edge function).
/**
 * Espelho backend da política central de ambiente de pagamento.
 * Fonte equivalente no frontend: src/lib/paymentEnvironmentPolicy.ts
 *
 * Regra: a origem da requisição só pode REBAIXAR o ambiente para Sandbox.
 * Nenhum hostname enviado pelo cliente promove Produção.
 */

export type PaymentEnvironment = "production" | "sandbox";
export type PaymentOriginClass =
  | "official_production"
  | "development"
  | "unknown";

export const OFFICIAL_PRODUCTION_HOSTS = [
  "smartbus.com.br",
  "www.smartbus.com.br",
  "smartbusbr.com.br",
  "www.smartbusbr.com.br",
  "smartbusbr.lovable.app",
];

const DEVELOPMENT_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]"];
const DEVELOPMENT_SUFFIXES = [
  ".lovable.app",
  ".lovableproject.com",
  ".lovable.dev",
  "lovable.dev",
  ".localhost",
  ".local",
  ".ngrok.io",
  ".ngrok-free.app",
];

export function normalizeHost(rawValue?: string | null): string {
  if (!rawValue) return "";
  const trimmed = rawValue.trim().toLowerCase();
  const firstValue = trimmed.split(",")[0]?.trim() ?? "";
  if (!firstValue) return "";
  if (firstValue.includes("://")) {
    try {
      return new URL(firstValue).hostname.toLowerCase();
    } catch {
      /* segue abaixo */
    }
  }
  return firstValue.replace(/:\d+$/, "");
}

export function classifyOrigin(rawHost?: string | null): PaymentOriginClass {
  const host = normalizeHost(rawHost);
  if (!host) return "unknown";
  if (OFFICIAL_PRODUCTION_HOSTS.includes(host)) return "official_production";
  if (DEVELOPMENT_HOSTS.includes(host)) return "development";
  if (DEVELOPMENT_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return "development";
  }
  return "unknown";
}

/**
 * Extrai o host do NAVEGADOR a partir dos headers. O header `host` em Edge
 * Functions é sempre o runtime Supabase, por isso ele nunca é considerado.
 */
export function extractBrowserHost(req: Request): string {
  const candidates = [
    req.headers.get("origin"),
    req.headers.get("referer"),
    req.headers.get("x-forwarded-host"),
  ];
  for (const candidate of candidates) {
    const normalized = normalizeHost(candidate);
    if (normalized && normalized !== "edge-runtime.supabase.com") {
      return normalized;
    }
  }
  return "";
}

export function classifyRequestOrigin(req?: Request | null): {
  host: string;
  originClass: PaymentOriginClass;
} {
  if (!req) return { host: "", originClass: "unknown" };
  const host = extractBrowserHost(req);
  return { host, originClass: classifyOrigin(host) };
}

export function resolveEffectivePaymentEnvironment(params: {
  configured: PaymentEnvironment | null;
  originClass: PaymentOriginClass;
}): { environment: PaymentEnvironment | null; downgradedByOrigin: boolean } {
  const { configured, originClass } = params;
  if (configured === null) {
    return { environment: null, downgradedByOrigin: false };
  }
  if (configured === "sandbox") {
    return { environment: "sandbox", downgradedByOrigin: false };
  }
  if (originClass === "official_production") {
    return { environment: "production", downgradedByOrigin: false };
  }
  return { environment: "sandbox", downgradedByOrigin: true };
}
