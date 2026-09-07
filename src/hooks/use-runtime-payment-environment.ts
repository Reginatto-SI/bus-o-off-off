import { useAuth } from "@/contexts/AuthContext";
import {
  classifyOrigin,
  currentBrowserHost,
  resolveEffectivePaymentEnvironment,
  type PaymentEnvironment,
} from "@/lib/paymentEnvironmentPolicy";

export type { PaymentEnvironment };
type EnvironmentSource = "company" | "active_company";

export const DEFAULT_PAYMENT_ENVIRONMENT: PaymentEnvironment = "production";

/**
 * Ambiente de pagamento em duas camadas:
 * - configurado: `companies.payment_environment` (intenção da empresa);
 * - efetivo: o configurado, rebaixado para Sandbox quando a origem atual não é
 *   um domínio oficial de Produção (preview Lovable, editor, localhost,
 *   origem desconhecida).
 *
 * A origem nunca promove Produção — apenas rebaixa.
 */
export function normalizePaymentEnvironment(
  value?: string | null,
): PaymentEnvironment | null {
  if (value === "production" || value === "sandbox") return value;
  return null;
}

/**
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

  const configuredEnvironment: PaymentEnvironment | null =
    explicit ?? fromActiveCompany ?? null;
  const source: EnvironmentSource | null = explicit
    ? "company"
    : fromActiveCompany
      ? "active_company"
      : null;

  const originClass = classifyOrigin(currentBrowserHost());
  const { environment, downgradedByOrigin } = resolveEffectivePaymentEnvironment(
    { configured: configuredEnvironment, originClass },
  );

  return {
    environment,
    configuredEnvironment,
    originClass,
    isDowngradedByOrigin: downgradedByOrigin,
    source,
    isSandbox: environment === "sandbox",
    isProduction: environment === "production",
    isReady: environment !== null,
  };
}
