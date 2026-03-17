export type PaymentOwnerType = "company" | "platform" | "unknown";

export type PaymentTraceLevel = "info" | "warn" | "error";

/**
 * Comentário de suporte (Step 1):
 * Padroniza logs estruturados do fluxo Asaas para correlação por sale_id/company_id.
 * Não altera regra de negócio; apenas reduz ambiguidade operacional.
 */
export function logPaymentTrace(
  level: PaymentTraceLevel,
  functionName: string,
  event: string,
  context: Record<string, unknown>,
) {
  const payload = {
    source: "payment-observability",
    function: functionName,
    event,
    timestamp: new Date().toISOString(),
    ...context,
  };

  const message = JSON.stringify(payload);
  if (level === "error") {
    console.error(message);
    return;
  }

  if (level === "warn") {
    console.warn(message);
    return;
  }

  console.info(message);
}

export function inferPaymentOwnerType(params: {
  environment: "production" | "sandbox";
  isPlatformFeeFlow?: boolean;
}): PaymentOwnerType {
  if (params.isPlatformFeeFlow) return "platform";
  return params.environment === "production" ? "company" : "platform";
}
