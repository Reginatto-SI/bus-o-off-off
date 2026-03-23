export type PaymentOwnerType = "company" | "platform" | "unknown";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type PaymentTraceLevel = "info" | "warn" | "error";
export type PaymentFlowResult =
  | "started"
  | "success"
  | "ignored"
  | "partial_failure"
  | "rejected"
  | "duplicate"
  | "warning"
  | "error"
  | "healthy"
  | "payment_confirmed"
  | "inconsistent_paid_without_ticket";

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
  supabaseAdmin: ReturnType<typeof createClient<any>>;
  saleId?: string | null;
  companyId?: string | null;
  action: string;
  source: string;
  result: PaymentFlowResult;
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

  if (!params.saleId || !params.companyId) {
    // Etapa 3: falha de correlação não pode apagar o incidente; deixamos rastro estruturado fora do banco.
    logPaymentTrace("warn", "payment-observability", "sale_log_skipped_missing_reference", {
      sale_id: params.saleId ?? null,
      company_id: params.companyId ?? null,
      action: params.action,
      source: params.source,
      result: params.result,
      payment_environment: params.paymentEnvironment ?? null,
      error_code: params.errorCode ?? null,
      detail: params.detail ?? null,
    });
    return;
  }

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

export async function logSaleIntegrationEvent(params: {
  supabaseAdmin: ReturnType<typeof createClient<any>>;
  saleId?: string | null;
  companyId?: string | null;
  paymentEnvironment?: string | null;
  environmentDecisionSource?: string | null;
  environmentHostDetected?: string | null;
  // Contrato alinhado ao runtime oficial atual: apenas Asaas e fluxo manual administrativo.
  provider: "asaas" | "manual";
  direction: "incoming_webhook" | "outgoing_request" | "manual_sync";
  eventType?: string | null;
  paymentId?: string | null;
  externalReference?: string | null;
  asaasEventId?: string | null;
  httpStatus?: number | null;
  processingStatus: "received" | "requested" | "success" | "ignored" | "partial_failure" | "failed" | "unauthorized" | "warning" | "rejected" | "duplicate";
  resultCategory?: PaymentFlowResult | null;
  incidentCode?: string | null;
  warningCode?: string | null;
  durationMs?: number | null;
  message: string;
  payloadJson?: unknown;
  responseJson?: unknown;
}) {
  try {
    await params.supabaseAdmin.from("sale_integration_logs").insert({
      sale_id: params.saleId ?? null,
      company_id: params.companyId ?? null,
      payment_environment: params.paymentEnvironment ?? null,
      environment_decision_source: params.environmentDecisionSource ?? null,
      environment_host_detected: params.environmentHostDetected ?? null,
      provider: params.provider,
      direction: params.direction,
      event_type: params.eventType ?? null,
      payment_id: params.paymentId ?? null,
      external_reference: params.externalReference ?? null,
      asaas_event_id: params.asaasEventId ?? null,
      http_status: params.httpStatus ?? null,
      processing_status: params.processingStatus,
      result_category: params.resultCategory ?? null,
      incident_code: params.incidentCode ?? null,
      warning_code: params.warningCode ?? null,
      duration_ms: params.durationMs ?? null,
      message: params.message,
      payload_json: params.payloadJson ?? null,
      response_json: params.responseJson ?? null,
    });
  } catch (error) {
    logPaymentTrace("error", "payment-observability", "integration_log_insert_failed", {
      sale_id: params.saleId ?? null,
      company_id: params.companyId ?? null,
      provider: params.provider,
      direction: params.direction,
      event_type: params.eventType ?? null,
      payment_id: params.paymentId ?? null,
      asaas_event_id: params.asaasEventId ?? null,
      processing_status: params.processingStatus,
      result_category: params.resultCategory ?? null,
      error_message: error instanceof Error ? error.message : String(error),
    });
  }
}
