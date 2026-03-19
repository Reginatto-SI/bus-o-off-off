import { useEffect, useState } from "react";

type PaymentEnvironment = "production" | "sandbox";

// Mantém os mesmos hosts oficiais definidos no backend (runtime-env.ts).
const PRODUCTION_HOSTS = new Set([
  "smartbusbr.com.br",
  "www.smartbusbr.com.br",
]);

export function resolveEnvironmentFromHostname(
  hostname: string,
): PaymentEnvironment {
  return PRODUCTION_HOSTS.has(hostname.toLowerCase())
    ? "production"
    : "sandbox";
}

/**
 * Etapa 2:
 * para o fluxo Asaas, preferimos decidir pelo origin/hostname real do app no browser
 * em vez de depender de headers encaminhados até a Edge Function.
 *
 * Se um `VITE_PAYMENT_ENVIRONMENT` explícito existir no build, ele prevalece.
 */
export function resolvePaymentEnvironmentFromAppOrigin(
  origin: string,
  explicitEnvironment?: string | null,
): PaymentEnvironment {
  if (
    explicitEnvironment === "production" ||
    explicitEnvironment === "sandbox"
  ) {
    return explicitEnvironment;
  }

  try {
    return resolveEnvironmentFromHostname(new URL(origin).hostname);
  } catch {
    return "sandbox";
  }
}

/**
 * Expõe no frontend o mesmo ambiente operacional explícito usado pelo checkout.
 *
 * Etapa 2:
 * - prioriza `VITE_PAYMENT_ENVIRONMENT` quando existir;
 * - caso contrário, usa a origem real carregada no browser;
 * - evita depender de headers encaminhados até o backend para fins visuais.
 */
export function useRuntimePaymentEnvironment() {
  const [environment, setEnvironment] = useState<PaymentEnvironment | null>(
    null,
  );

  useEffect(() => {
    const browserResolvedEnvironment = resolvePaymentEnvironmentFromAppOrigin(
      window.location.origin,
      import.meta.env.VITE_PAYMENT_ENVIRONMENT,
    );
    setEnvironment(browserResolvedEnvironment);
  }, []);

  return {
    environment,
    isSandbox: environment === "sandbox",
  };
}
