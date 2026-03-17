export type PaymentOwnerType = "company" | "platform" | "unknown";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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


export async function logSaleOperationalEvent(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  saleId: string;
  companyId: string;
  action: string;
  source: string;
  result: string;
  paymentEnvironment?: string | null;
  errorCode?: string | null;
  detail?: string | null;
}) {
  const descriptionParts = [
    `source=${params.source}`,
    `result=${params.result}`,
    params.paymentEnvironment ? `env=${params.paymentEnvironment}` : null,
    params.errorCode ? `error_code=${params.errorCode}` : null,
    params.detail ? `detail=${params.detail}` : null,
  ].filter(Boolean);

  try {
    await params.supabaseAdmin.from("sale_logs").insert({
      sale_id: params.saleId,
      company_id: params.companyId,
      action: params.action,
      description: `[payment_ops] ${descriptionParts.join(" | ")}`,
    });
  } catch (error) {
    logPaymentTrace("error", "payment-observability", "sale_log_insert_failed", {
      sale_id: params.saleId,
      company_id: params.companyId,
      source: params.source,
      result: params.result,
      payment_environment: params.paymentEnvironment ?? null,
      error_message: error instanceof Error ? error.message : String(error),
    });
  }
}
