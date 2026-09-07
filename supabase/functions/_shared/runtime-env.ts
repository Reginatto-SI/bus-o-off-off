/**
 * Utilidades Asaas de ambiente + compatibilidade legada de resolução por host.
 *
 * A decisão de ambiente é centralizada em `payment-environment-policy.ts`:
 * a origem só REBAIXA para sandbox; nunca promove Produção.
 */
import {
  classifyRequestOrigin,
  OFFICIAL_PRODUCTION_HOSTS,
} from "./payment-environment-policy.ts";

export type PaymentEnvironment = "production" | "sandbox";

export { OFFICIAL_PRODUCTION_HOSTS };

/**
 * Compatibilidade legada (apoio a suporte/diagnóstico). Não é fonte primária
 * do fluxo de pagamento: usa a lista oficial única de domínios de Produção.
 */
export function resolveEnvironmentFromHost(req: Request): {
  env: PaymentEnvironment;
  host: string;
} {
  const { host, originClass } = classifyRequestOrigin(req);
  const env: PaymentEnvironment =
    originClass === "official_production" ? "production" : "sandbox";

  console.log("[runtime-env] Ambiente resolvido por host", {
    host_detected: host || "unknown",
    origin_class: originClass,
    environment_selected: env,
  });

  return { env, host: host || "unknown" };
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

export function getAsaasWebhookTokenSecretName(
  env: PaymentEnvironment,
): string {
  return env === "production"
    ? "ASAAS_WEBHOOK_TOKEN"
    : "ASAAS_WEBHOOK_TOKEN_SANDBOX";
}
