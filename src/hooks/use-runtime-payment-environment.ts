import { useAuth } from "@/contexts/AuthContext";

export type PaymentEnvironment = "production" | "sandbox";
type EnvironmentSource = "company" | "active_company";

export const DEFAULT_PAYMENT_ENVIRONMENT: PaymentEnvironment = "production";

/**
 * Fonte única de verdade do ambiente de pagamento.
 *
 * Regra oficial do projeto: o ambiente vem da configuração da empresa
 * (`companies.payment_environment`). Nunca de domínio, hostname, usuário
 * conectado ou fallback silencioso.
 */
export function normalizePaymentEnvironment(
  value?: string | null,
): PaymentEnvironment | null {
  if (value === "production" || value === "sandbox") return value;
  return null;
}

/**
 * Expõe o ambiente operacional da empresa em contexto.
 *
 * @param companyEnvironment ambiente explícito da empresa relevante para a tela
 * (ex.: empresa do evento no checkout público). Quando omitido, usa a empresa
 * ativa do painel administrativo.
 */
export function useRuntimePaymentEnvironment(
  companyEnvironment?: string | null,
) {
  const { activeCompany } = useAuth();

  const explicit = normalizePaymentEnvironment(companyEnvironment);
  const fromActiveCompany = normalizePaymentEnvironment(
    (activeCompany as { payment_environment?: string | null } | null)
      ?.payment_environment,
  );

  const environment: PaymentEnvironment | null =
    explicit ?? fromActiveCompany ?? null;
  const source: EnvironmentSource | null = explicit
    ? "company"
    : fromActiveCompany
      ? "active_company"
      : null;

  return {
    environment,
    source,
    isSandbox: environment === "sandbox",
    isProduction: environment === "production",
    isReady: environment !== null,
  };
}
