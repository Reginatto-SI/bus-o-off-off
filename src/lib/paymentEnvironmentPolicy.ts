/**
 * Política central de ambiente de pagamento do SmartBus.
 *
 * Camadas (nesta ordem):
 * 1. Venda existente: `sales.payment_environment` é imutável e nunca recalculado.
 * 2. Empresa: `companies.payment_environment` é a intenção configurada.
 * 3. Origem: só uma origem oficialmente reconhecida MANTÉM Produção. Qualquer
 *    outra origem (preview Lovable, editor, localhost, desconhecida) REBAIXA o
 *    ambiente efetivo para Sandbox.
 *
 * A origem só pode rebaixar, nunca promover: nenhum hostname enviado pelo
 * cliente é capaz de liberar Produção.
 *
 * Espelho backend: supabase/functions/_shared/payment-environment-policy.ts
 * (mantenha as duas listas idênticas).
 */

export type PaymentEnvironment = "production" | "sandbox";
export type PaymentOriginClass =
  | "official_production"
  | "development"
  | "unknown";

/** Domínios web oficiais de Produção do SmartBus. */
export const OFFICIAL_PRODUCTION_HOSTS = [
  "smartbus.com.br",
  "www.smartbus.com.br",
  "smartbusbr.com.br",
  "www.smartbusbr.com.br",
  "smartbusbr.lovable.app",
] as const;

/** Sufixos/hosts sempre tratados como desenvolvimento (nunca Produção). */
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
      /* segue para o tratamento simples abaixo */
    }
  }
  return firstValue.replace(/:\d+$/, "");
}

export function classifyOrigin(rawHost?: string | null): PaymentOriginClass {
  const host = normalizeHost(rawHost);
  if (!host) return "unknown";
  if ((OFFICIAL_PRODUCTION_HOSTS as readonly string[]).includes(host)) {
    return "official_production";
  }
  if (DEVELOPMENT_HOSTS.includes(host)) return "development";
  if (DEVELOPMENT_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return "development";
  }
  return "unknown";
}

/**
 * Aplica o rebaixamento por origem sobre o ambiente configurado.
 * Sandbox configurado nunca é promovido a Produção.
 */
export function resolveEffectivePaymentEnvironment(params: {
  configured: PaymentEnvironment | null;
  originClass: PaymentOriginClass;
}): {
  environment: PaymentEnvironment | null;
  downgradedByOrigin: boolean;
} {
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

/** Host do navegador atual (vazio fora do browser). */
export function currentBrowserHost(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname.toLowerCase();
}
