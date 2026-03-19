import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type PaymentEnvironment = "production" | "sandbox";
type EnvironmentSource = "build" | "edge" | "browser_fallback";

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
 * Etapa final de hardening:
 * quando a configuração explícita não existe, restringimos a heurística local
 * ao último fallback do frontend. A decisão preferencial passa a vir do edge,
 * onde o host efetivo chega pelos headers da requisição e fica rastreável.
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
 * Expõe no frontend o ambiente operacional usado pelo checkout.
 *
 * Ordem de prioridade deliberada:
 * 1) `VITE_PAYMENT_ENVIRONMENT` explícito do build;
 * 2) edge function `get-runtime-payment-environment`;
 * 3) fallback local por hostname apenas se o edge falhar.
 */
export function useRuntimePaymentEnvironment() {
  const [environment, setEnvironment] = useState<PaymentEnvironment | null>(
    null,
  );
  const [source, setSource] = useState<EnvironmentSource | null>(null);

  useEffect(() => {
    let cancelled = false;

    const explicitEnvironment = import.meta.env.VITE_PAYMENT_ENVIRONMENT;
    if (
      explicitEnvironment === "production" ||
      explicitEnvironment === "sandbox"
    ) {
      setEnvironment(explicitEnvironment);
      setSource("build");
      return;
    }

    const resolveFromEdge = async () => {
      try {
        const { data, error } = await supabase.functions.invoke(
          "get-runtime-payment-environment",
        );

        if (error) throw error;

        if (
          !cancelled &&
          (data?.payment_environment === "production" ||
            data?.payment_environment === "sandbox")
        ) {
          setEnvironment(data.payment_environment);
          setSource("edge");
          return;
        }

        throw new Error("runtime_payment_environment_missing_from_edge");
      } catch (error) {
        const fallbackEnvironment = resolvePaymentEnvironmentFromAppOrigin(
          window.location.origin,
          null,
        );

        if (!cancelled) {
          // Comentário de suporte: mantemos fallback para não bloquear compra por oscilação do edge,
          // mas registramos aviso explícito porque a fonte preferencial agora é configuração/edge.
          console.warn("[payment-environment] falling back to browser hostname", {
            error: error instanceof Error ? error.message : String(error),
            fallback_environment: fallbackEnvironment,
            origin: window.location.origin,
          });
          setEnvironment(fallbackEnvironment);
          setSource("browser_fallback");
        }
      }
    };

    resolveFromEdge();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    environment,
    source,
    isSandbox: environment === "sandbox",
    isReady: environment !== null,
  };
}
