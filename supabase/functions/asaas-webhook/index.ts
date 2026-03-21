import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getAsaasWebhookTokenSecretName,
  type PaymentEnvironment,
} from "../_shared/runtime-env.ts";
import {
  logPaymentTrace,
  logSaleIntegrationEvent,
  logSaleOperationalEvent,
} from "../_shared/payment-observability.ts";
import {
  isWebhookTokenValidForContext,
  resolvePaymentContext,
  validateFinancialSocioForSplit,
} from "../_shared/payment-context-resolver.ts";
import { finalizeConfirmedPayment } from "../_shared/payment-finalization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type ProcessingStatus =
  | "received"
  | "ignored"
  | "success"
  | "partial_failure"
  | "failed"
  | "unauthorized"
  | "rejected"
  | "duplicate"
  | "warning";
type ResultCategory =
  | "success"
  | "ignored"
  | "partial_failure"
  | "rejected"
  | "duplicate"
  | "warning"
  | "error";
type ProcessingResult = {
  status: ProcessingStatus;
  resultCategory: ResultCategory;
  httpStatus: number;
  message: string;
  responseBody: Record<string, unknown>;
  saleId?: string | null;
  companyId?: string | null;
  eventType?: string | null;
  paymentId?: string | null;
  externalReference?: string | null;
  paymentEnvironment?: PaymentEnvironment | null;
  environmentDecisionSource?: "sale" | "request" | "host" | null;
  environmentHostDetected?: string | null;
  asaasEventId?: string | null;
  incidentCode?: string | null;
  warningCode?: string | null;
  durationMs?: number | null;
};

function normalizeAsaasConfirmationTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  const parsed = new Date(trimmed);
  if (
    !Number.isNaN(parsed.getTime()) &&
    (trimmed.includes("T") || trimmed.includes(":"))
  ) {
    return parsed.toISOString();
  }
  return null;
}

function resolveAsaasConfirmedAt(
  payment: any,
  webhookCreatedAt?: string | null,
): string {
  const candidates = [
    payment?.clientPaymentDate,
    payment?.confirmedDate,
    payment?.paymentDate,
    payment?.dateCreated,
    webhookCreatedAt,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeAsaasConfirmationTimestamp(candidate);
    if (normalized) return normalized;
  }

  return new Date().toISOString();
}

/**
 * Busca o payment_environment da venda no banco.
 * Hardening Step 5: sem ambiente persistido, o webhook não processa o evento.
 */
async function getSaleEnvironment(
  supabaseAdmin: ReturnType<typeof createClient<any>>,
  saleId: string,
): Promise<PaymentEnvironment | null> {
  const { data } = await supabaseAdmin
    .from("sales")
    .select("payment_environment")
    .eq("id", saleId)
    .maybeSingle();

  if (data?.payment_environment === "production") return "production";
  if (data?.payment_environment === "sandbox") return "sandbox";
  return null;
}


async function registerWebhookEvent(params: {
  supabaseAdmin: ReturnType<typeof createClient<any>>;
  asaasEventId?: string | null;
  eventType?: string | null;
  paymentId?: string | null;
  externalReference?: string | null;
  saleId?: string | null;
  paymentEnvironment?: PaymentEnvironment | null;
  payload: unknown;
}) {
  if (!params.asaasEventId) {
    return { isDuplicate: false };
  }

  const payloadRecord = params.payload && typeof params.payload === "object"
    ? params.payload as Record<string, unknown>
    : null;

  const { error } = await params.supabaseAdmin
    .from("asaas_webhook_event_dedup")
    .insert({
      asaas_event_id: params.asaasEventId,
      event_type: params.eventType ?? null,
      payment_id: params.paymentId ?? null,
      external_reference: params.externalReference ?? null,
      sale_id: params.saleId ?? null,
      payment_environment: params.paymentEnvironment ?? null,
      payload_json: payloadRecord,
    });

  if (!error) return { isDuplicate: false };

  if (error.code === "23505") {
    await params.supabaseAdmin.rpc("mark_asaas_webhook_event_duplicate", {
      p_asaas_event_id: params.asaasEventId,
      p_sale_id: params.saleId ?? null,
      p_payment_environment: params.paymentEnvironment ?? null,
      p_payload_json: payloadRecord,
    });
    return { isDuplicate: true };
  }

  throw new Error(`asaas_webhook_event_dedup_insert_failed: ${error.message}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let requestPayload: any = null;
  try {
    requestPayload = await req.json();
  } catch {
    requestPayload = null;
  }

  const startedAt = Date.now();
  const eventType = requestPayload?.event ?? null;
  const asaasEventId = requestPayload?.id ?? requestPayload?.eventId ?? null;
  const payment = requestPayload?.payment ?? null;
  const paymentId = payment?.id ?? null;
  const externalReference = payment?.externalReference ?? null;

  console.log(
    JSON.stringify({
      source: "asaas-webhook",
      stage: "received",
      eventType,
      paymentId,
      paymentStatus: payment?.status ?? null,
      billingType: payment?.billingType ?? null,
      externalReference,
      asaasEventId,
    }),
  );

  try {
    // Determinar o saleId real (pode ser platform_fee_<uuid>)
    const rawSaleId = String(externalReference ?? "");
    const isPlatformFee = rawSaleId.startsWith("platform_fee_");
    const actualSaleId = isPlatformFee
      ? rawSaleId.replace("platform_fee_", "")
      : rawSaleId;

    // Pré-Step 5: webhook só segue quando o ambiente da venda foi determinado de forma explícita.
    let saleEnv: PaymentEnvironment | null = null;
    if (actualSaleId && /^[0-9a-fA-F-]{36}$/.test(actualSaleId)) {
      saleEnv = await getSaleEnvironment(supabaseAdmin, actualSaleId);
    }

    if (!saleEnv) {
      const unresolvedContextResult: ProcessingResult = {
        asaasEventId,
        durationMs: Date.now() - startedAt,
        status: "rejected",
        resultCategory: "rejected",
        httpStatus: 400,
        message: "Ambiente da venda não determinado; webhook rejeitado",
        responseBody: {
          error: "Sale environment unresolved",
          external_reference: externalReference,
        },
        saleId: actualSaleId || null,
        eventType,
        paymentId,
        externalReference,
      };

      await persistIntegrationLog(supabaseAdmin, {
        ...unresolvedContextResult,
        payload: requestPayload,
      });

      return jsonResponse(
        unresolvedContextResult.httpStatus,
        unresolvedContextResult.responseBody,
      );
    }

    const paymentContext = resolvePaymentContext({
      mode: "webhook",
      sale: { payment_environment: saleEnv },
      isPlatformFeeFlow: isPlatformFee,
    });

    const expectedTokenSecretName = getAsaasWebhookTokenSecretName(
      paymentContext.environment,
    );
    const hasExpectedToken = paymentContext.webhookTokenCandidates.length > 0;
    const tokenValid = isWebhookTokenValidForContext(req, paymentContext);

    logPaymentTrace("info", "asaas-webhook", "webhook_received", {
      sale_id: actualSaleId || null,
      payment_environment: paymentContext.environment,
      payment_owner_type: paymentContext.ownerType,
      event_type: eventType,
      asaas_payment_id: paymentId,
      external_reference: externalReference,
      api_key_source: paymentContext.apiKeySource,
      asaas_base_url: paymentContext.baseUrl,
      split_policy: paymentContext.splitPolicy.type,
      decision_trace: paymentContext.decisionTrace,
      token_validation_mode: "single_environment_token",
      expected_token_secret: expectedTokenSecretName,
      token_validation_result: tokenValid ? "valid" : "invalid",
    });

    if (!hasExpectedToken) {
      const missingSecretResult: ProcessingResult = {
        asaasEventId,
        durationMs: Date.now() - startedAt,
        status: "failed",
        resultCategory: "error",
        httpStatus: 500,
        message: `Secret de webhook ausente para ambiente ${paymentContext.environment}`,
        responseBody: {
          error: "Webhook secret not configured",
          expected_secret: expectedTokenSecretName,
        },
        saleId: actualSaleId || null,
        eventType,
        paymentId,
        externalReference,
        paymentEnvironment: paymentContext.environment,
        environmentDecisionSource:
          paymentContext.decisionTrace.environmentSource,
        environmentHostDetected: paymentContext.decisionTrace.hostDetected,
      };

      await persistIntegrationLog(supabaseAdmin, {
        ...missingSecretResult,
        payload: requestPayload,
      });

      return jsonResponse(
        missingSecretResult.httpStatus,
        missingSecretResult.responseBody,
      );
    }

    if (!tokenValid) {
      const unauthorizedResult: ProcessingResult = {
        asaasEventId,
        durationMs: Date.now() - startedAt,
        status: "unauthorized",
        resultCategory: "rejected",
        httpStatus: 401,
        message: "Token de webhook inválido",
        responseBody: { error: "Invalid token" },
        saleId: actualSaleId || null,
        eventType,
        paymentId,
        externalReference,
        paymentEnvironment: paymentContext.environment,
        environmentDecisionSource:
          paymentContext.decisionTrace.environmentSource,
        environmentHostDetected: paymentContext.decisionTrace.hostDetected,
      };

      await persistIntegrationLog(supabaseAdmin, {
        ...unauthorizedResult,
        payload: requestPayload,
      });

      return jsonResponse(
        unauthorizedResult.httpStatus,
        unauthorizedResult.responseBody,
      );
    }

    console.log("[asaas-webhook] Token validado", {
      sale_id: actualSaleId || null,
      sale_environment: saleEnv,
      external_reference: externalReference,
      expected_token_secret: expectedTokenSecretName,
      validation_result: "valid",
      is_platform_fee: isPlatformFee,
    });

    if (!eventType || !payment) {
      const invalidPayloadResult: ProcessingResult = {
        asaasEventId,
        durationMs: Date.now() - startedAt,
        status: "rejected",
        resultCategory: "rejected",
        httpStatus: 400,
        message: "Payload inválido: event/payment ausente",
        responseBody: { error: "Invalid payload" },
        eventType,
        paymentId,
        externalReference,
      };

      await persistIntegrationLog(supabaseAdmin, {
        ...invalidPayloadResult,
        payload: requestPayload,
      });

      return jsonResponse(
        invalidPayloadResult.httpStatus,
        invalidPayloadResult.responseBody,
      );
    }

    const saleId = externalReference;
    const supportedEvents = [
      "PAYMENT_CONFIRMED",
      "PAYMENT_RECEIVED",
      "PAYMENT_OVERDUE",
      "PAYMENT_DELETED",
      "PAYMENT_REFUNDED",
    ];

    if (!supportedEvents.includes(eventType)) {
      const ignoredEventResult: ProcessingResult = {
        asaasEventId,
        durationMs: Date.now() - startedAt,
        status: "ignored",
        resultCategory: "ignored",
        httpStatus: 200,
        message: `Evento ignorado: ${eventType}`,
        responseBody: {
          received: true,
          ignored: true,
          reason: "unsupported_event",
        },
        eventType,
        paymentId,
        externalReference,
      };

      await persistIntegrationLog(supabaseAdmin, {
        ...ignoredEventResult,
        payload: requestPayload,
      });

      return jsonResponse(
        ignoredEventResult.httpStatus,
        ignoredEventResult.responseBody,
      );
    }

    // Etapa 3: deduplicação formal por event.id do Asaas com tabela mínima e auditável.
    const dedupRegistration = await registerWebhookEvent({
      supabaseAdmin,
      asaasEventId,
      eventType,
      paymentId,
      externalReference,
      saleId: actualSaleId || null,
      paymentEnvironment: paymentContext.environment,
      payload: requestPayload,
    });

    if (dedupRegistration.isDuplicate) {
      const duplicateResult: ProcessingResult = {
        status: "duplicate",
        resultCategory: "duplicate",
        httpStatus: 200,
        message: `Evento Asaas duplicado ignorado: ${asaasEventId}`,
        responseBody: {
          received: true,
          duplicate: true,
          ignored: true,
          reason: "duplicate_event_id",
          asaas_event_id: asaasEventId,
        },
        saleId: actualSaleId || null,
        eventType,
        paymentId,
        externalReference,
        paymentEnvironment: paymentContext.environment,
        environmentDecisionSource:
          paymentContext.decisionTrace.environmentSource,
        environmentHostDetected: paymentContext.decisionTrace.hostDetected,
        asaasEventId,
        warningCode: "duplicate_event_id",
        durationMs: Date.now() - startedAt,
      };

      await persistIntegrationLog(supabaseAdmin, {
        ...duplicateResult,
        payload: requestPayload,
      });

      return jsonResponse(
        duplicateResult.httpStatus,
        duplicateResult.responseBody,
      );
    }

    if (!saleId) {
      const missingReferenceResult: ProcessingResult = {
        asaasEventId,
        durationMs: Date.now() - startedAt,
        status: "ignored",
        resultCategory: "ignored",
        httpStatus: 200,
        message: "externalReference ausente; webhook sem vínculo de venda",
        responseBody: {
          received: true,
          ignored: true,
          reason: "missing_external_reference",
        },
        eventType,
        paymentId,
        externalReference,
      };

      await persistIntegrationLog(supabaseAdmin, {
        ...missingReferenceResult,
        payload: requestPayload,
      });

      return jsonResponse(
        missingReferenceResult.httpStatus,
        missingReferenceResult.responseBody,
      );
    }

    // Fluxo dedicado: cobrança da taxa da plataforma
    if (isPlatformFee) {
      const platformFeeResult = await processPlatformFeeWebhook(
        supabaseAdmin,
        saleId,
        payment,
        eventType,
        requestPayload?.dateCreated ?? null,
      );
      platformFeeResult.eventType = eventType;
      platformFeeResult.paymentId = paymentId;
      platformFeeResult.externalReference = externalReference;

      platformFeeResult.resultCategory ??= platformFeeResult.status === "partial_failure" ? "partial_failure" : platformFeeResult.status === "ignored" ? "ignored" : platformFeeResult.status === "failed" ? "error" : "success";
      platformFeeResult.asaasEventId = asaasEventId;
      platformFeeResult.paymentEnvironment = paymentContext.environment;
      platformFeeResult.environmentDecisionSource = paymentContext.decisionTrace.environmentSource;
      platformFeeResult.environmentHostDetected = paymentContext.decisionTrace.hostDetected;
      platformFeeResult.durationMs = Date.now() - startedAt;

      await persistIntegrationLog(supabaseAdmin, {
        ...platformFeeResult,
        payload: requestPayload,
      });

      return jsonResponse(
        platformFeeResult.httpStatus,
        platformFeeResult.responseBody,
      );
    }

    const { data: sale, error: saleError } = await supabaseAdmin
      .from("sales")
      .select(
        "id, company_id, status, unit_price, quantity, gross_amount, payment_environment",
      )
      .eq("id", saleId)
      .maybeSingle();

    if (saleError || !sale) {
      const saleNotFoundResult: ProcessingResult = {
        asaasEventId,
        durationMs: Date.now() - startedAt,
        status: "ignored",
        resultCategory: "ignored",
        httpStatus: 200,
        message: `Venda não localizada para externalReference=${saleId}; retry do Asaas não trará novo contexto`,
        responseBody: {
          received: true,
          ignored: true,
          reason: "sale_not_found",
          sale_id: saleId,
        },
        saleId,
        eventType,
        paymentId,
        externalReference,
      };

      await persistIntegrationLog(supabaseAdmin, {
        ...saleNotFoundResult,
        payload: requestPayload,
      });

      return jsonResponse(
        saleNotFoundResult.httpStatus,
        saleNotFoundResult.responseBody,
      );
    }

    let result: ProcessingResult;

    if (eventType === "PAYMENT_CONFIRMED" || eventType === "PAYMENT_RECEIVED") {
      result = await processPaymentConfirmed(
        supabaseAdmin,
        sale,
        payment,
        eventType,
        requestPayload?.dateCreated ?? null,
      );
    } else {
      result = await processPaymentFailed(
        supabaseAdmin,
        sale,
        payment,
        eventType,
      );
    }

    result.eventType = eventType;
    result.paymentId = paymentId;
    result.externalReference = externalReference;
    result.paymentEnvironment = paymentContext.environment;
    result.environmentDecisionSource =
      paymentContext.decisionTrace.environmentSource;
    result.environmentHostDetected = paymentContext.decisionTrace.hostDetected;
    result.asaasEventId = asaasEventId;
    result.durationMs = Date.now() - startedAt;

    await persistIntegrationLog(supabaseAdmin, {
      ...result,
      payload: requestPayload,
    });

    console.log(
      JSON.stringify({
        source: "asaas-webhook",
        stage: "finished",
        eventType,
        paymentId,
        externalReference,
        saleId: result.saleId,
        processingStatus: result.status,
      }),
    );

    return jsonResponse(result.httpStatus, result.responseBody);
  } catch (error) {
    logPaymentTrace("error", "asaas-webhook", "unexpected_error", {
      event_type: eventType,
      asaas_payment_id: paymentId,
      external_reference: externalReference,
      error_message: error instanceof Error ? error.message : String(error),
    });
    const fallbackResult: ProcessingResult = {
      asaasEventId,
      durationMs: Date.now() - startedAt,
      status: "failed",
      resultCategory: "error",
      httpStatus: 500,
      message: `Erro inesperado: ${error instanceof Error ? error.message : "unknown_error"}`,
      responseBody: { error: "Webhook processing failed" },
      eventType,
      paymentId,
      externalReference,
    };

    await persistIntegrationLog(supabaseAdmin, {
      ...fallbackResult,
      payload: requestPayload,
    });

    console.error("Asaas webhook error:", error);
    return jsonResponse(fallbackResult.httpStatus, fallbackResult.responseBody);
  }
});

async function processPlatformFeeWebhook(
  supabaseAdmin: ReturnType<typeof createClient<any>>,
  externalReference: string,
  payment: any,
  eventType: string,
  webhookCreatedAt?: string | null,
): Promise<ProcessingResult> {
  const saleId = externalReference.replace("platform_fee_", "");

  const { data: sale, error: saleError } = await supabaseAdmin
    .from("sales")
    .select("id, company_id, status, platform_fee_status")
    .eq("id", saleId)
    .maybeSingle();

  if (saleError || !sale) {
    return {
      status: "ignored",
      resultCategory: "ignored",
      httpStatus: 200,
      message: `Venda da taxa da plataforma não localizada: ${saleId}; retry não mudará o resultado`,
      responseBody: {
        received: true,
        ignored: true,
        reason: "sale_not_found",
        sale_id: saleId,
        flow: "platform_fee",
      },
      saleId,
    };
  }

  const confirmedAt = resolveAsaasConfirmedAt(payment, webhookCreatedAt);

  if (eventType === "PAYMENT_CONFIRMED" || eventType === "PAYMENT_RECEIVED") {
    const { error: updateError } = await supabaseAdmin
      .from("sales")
      .update({
        platform_fee_status: "paid",
        platform_fee_paid_at: confirmedAt,
        platform_fee_payment_id: payment.id,
        status: sale.status === "reservado" ? "pago" : sale.status,
        payment_confirmed_at: confirmedAt,
      })
      .eq("id", saleId)
      .in("platform_fee_status", ["pending", "failed"]);

    if (updateError) {
      return {
        status: "failed",
        resultCategory: "error" as ResultCategory,
        httpStatus: 500,
        message: `Falha ao confirmar taxa da plataforma da venda ${saleId}`,
        responseBody: { error: "Platform fee update failed", sale_id: saleId },
        saleId,
        companyId: sale.company_id,
      };
    }

    await logSaleOperationalEvent({
      supabaseAdmin,
      saleId,
      companyId: sale.company_id,
      action: "platform_fee_paid",
      source: "asaas-webhook",
      result: "success",
      detail: `${eventType}|payment=${payment.id}`,
    });

    return {
      status: "success",
      resultCategory: "success",
      httpStatus: 200,
      message: `Taxa da plataforma confirmada para venda ${saleId}`,
      responseBody: {
        received: true,
        processed: true,
        sale_id: saleId,
        flow: "platform_fee",
      },
      saleId,
      companyId: sale.company_id,
    };
  }

  const { error: failUpdateError } = await supabaseAdmin
    .from("sales")
    .update({ platform_fee_status: "failed" })
    .eq("id", saleId)
    .eq("platform_fee_status", "pending");

  if (failUpdateError) {
    return {
      status: "failed",
      resultCategory: "error",
      httpStatus: 500,
      message: `Falha ao registrar falha da taxa da plataforma da venda ${saleId}`,
      responseBody: {
        error: "Platform fee failure update failed",
        sale_id: saleId,
      },
      saleId,
      companyId: sale.company_id,
    };
  }

  await logSaleOperationalEvent({
    supabaseAdmin,
    saleId,
    companyId: sale.company_id,
    action: "platform_fee_failed",
    source: "asaas-webhook",
    result: "warning",
    detail: `${eventType}|payment=${payment.id}`,
  });

  return {
    // Comentário de auditoria: evento de falha processado com sucesso técnico,
    // mas a categoria operacional precisa continuar visível como warning.
    status: "warning",
    resultCategory: "warning",
    httpStatus: 200,
    message: `Falha da taxa registrada para venda ${saleId}`,
    responseBody: {
      received: true,
      processed: true,
      sale_id: saleId,
      flow: "platform_fee",
    },
    saleId,
    companyId: sale.company_id,
  };
}

async function processPaymentConfirmed(
  supabaseAdmin: ReturnType<typeof createClient<any>>,
  sale: any,
  payment: any,
  eventType: string,
  webhookCreatedAt?: string | null,
): Promise<ProcessingResult> {
  const saleId = sale.id;
  const confirmedAt = resolveAsaasConfirmedAt(payment, webhookCreatedAt);

  // Etapa 2: webhook passa a delegar finalização para a rotina compartilhada.
  // Isso remove assimetria crítica em relação ao verify-payment-status.
  const finalization = await finalizeConfirmedPayment({
    supabaseAdmin,
    sale,
    confirmedAt,
    asaasStatus: payment.status,
    source: "asaas-webhook",
    paymentId: payment.id,
    eventType,
    allowStatusUpdate: true,
  });

  if (!finalization.ok) {
    return {
      /**
       * Blindagem Etapa 1:
       * quando o pagamento foi reconhecido, mas a finalização ficou inconsistente
       * (ex.: ticket não gerado), evitamos devolver não-2xx ao Asaas.
       * O incidente fica rastreável internamente e a reconciliação continua possível.
       */
      status:
        finalization.state === "inconsistent" ? "partial_failure" : "failed",
      resultCategory:
        finalization.state === "inconsistent" ? "partial_failure" : "error",
      httpStatus:
        finalization.state === "inconsistent" ? 200 : finalization.httpStatus,
      message: finalization.message,
      responseBody: {
        received: finalization.state === "inconsistent",
        processed: false,
        error:
          finalization.state === "inconsistent"
            ? "Ticket generation incomplete"
            : "Payment finalization failed",
        sale_id: saleId,
        ticket_status: finalization.ticketStatus,
        incident_code:
          finalization.state === "inconsistent"
            ? "ticket_generation_incomplete"
            : "payment_finalization_failed",
      },
      saleId,
      companyId: sale.company_id,
    };
  }

  await upsertFinancialSnapshot(
    supabaseAdmin,
    saleId,
    sale.company_id,
    sale,
    payment,
    sale.payment_environment === "production" ? "production" : "sandbox",
  );

  return {
    status: "success",
    resultCategory: "success",
    httpStatus: 200,
    message: finalization.message,
    responseBody: {
      received: true,
      processed: true,
      sale_id: saleId,
      ticket_status: finalization.ticketStatus,
      tickets_count: finalization.ticketsCount,
    },
    saleId,
    companyId: sale.company_id,
  };
}

async function upsertFinancialSnapshot(
  supabaseAdmin: ReturnType<typeof createClient<any>>,
  saleId: string,
  companyId: string,
  sale: any,
  payment: any,
  paymentEnvironment: PaymentEnvironment,
) {
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("platform_fee_percent, socio_split_percent")
    .eq("id", companyId)
    .single();

  if (company?.platform_fee_percent == null) {
    await logSaleOperationalEvent({
      supabaseAdmin,
      saleId,
      companyId,
      action: "payment_confirmed",
      source: "asaas-webhook",
      result: "warning",
      detail: `platform_fee_percent_missing|payment=${payment.id}`,
    });
    return;
  }

  const platformFeePercent = Number(company.platform_fee_percent);
  const grossAmount = sale.gross_amount ?? sale.unit_price * sale.quantity;
  const grossAmountCents = Math.round(grossAmount * 100);
  const platformFeeCents = Math.round(
    grossAmountCents * (platformFeePercent / 100),
  );
  const platformFeeTotal = platformFeeCents / 100;

  const socioSplitPercent = company?.socio_split_percent ?? 50;
  let socio: any = null;
  let socioWalletId: string | null = null;

  if (socioSplitPercent > 0) {
    const { data: socioRows, error: socioSplitError } = await supabaseAdmin
      .from("socios_split")
      .select("id, name, status, asaas_wallet_id, asaas_wallet_id_production, asaas_wallet_id_sandbox")
      // Hardening Step 5: escopo multi-tenant obrigatório para evitar parceiro de outra empresa.
      .eq("company_id", companyId)
      .eq("status", "ativo")
      .limit(2);

    if (socioSplitError) {
      logPaymentTrace("error", "asaas-webhook", "split_socio_query_failed", {
        sale_id: saleId,
        company_id: companyId,
        payment_environment: paymentEnvironment,
        error_message: socioSplitError.message,
      });

      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId,
        companyId,
        action: "payment_confirmed",
        source: "asaas-webhook",
        result: "error",
        paymentEnvironment,
        errorCode: "split_socio_query_failed",
        detail: socioSplitError.message,
      });
      return;
    }

    const socioSplitValidation = validateFinancialSocioForSplit({
      socios: socioRows ?? [],
      provider: "asaas",
      environment: paymentEnvironment,
    });

    if (!socioSplitValidation.ok) {
      logPaymentTrace("error", "asaas-webhook", "split_socio_validation_failed", {
        sale_id: saleId,
        company_id: companyId,
        payment_environment: paymentEnvironment,
        validation_code: socioSplitValidation.code,
        validation_message: socioSplitValidation.message,
        active_socio_rows: (socioRows ?? []).length,
      });

      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId,
        companyId,
        action: "payment_confirmed",
        source: "asaas-webhook",
        result: "error",
        paymentEnvironment,
        errorCode: socioSplitValidation.code,
        detail: socioSplitValidation.message,
      });
      return;
    }

    socio = socioSplitValidation.socio;
    socioWalletId = socioSplitValidation.walletId;
  }

  let socioFeeAmount = 0;
  let platformNetAmount = platformFeeTotal;

  logPaymentTrace("info", "asaas-webhook", "financial_socio_selected", {
    sale_id: saleId,
    company_id: companyId,
    payment_environment: paymentEnvironment,
    socio_id: socio?.id ?? null,
    socio_wallet_selected: socioWalletId,
    socio_wallet_source:
      paymentEnvironment === "production"
        ? socio?.asaas_wallet_id_production
          ? "socio.production"
          : "none"
        : socio?.asaas_wallet_id_sandbox
          ? "socio.sandbox"
          : "none",
  });

  if (socioWalletId && socio?.status === "ativo") {
    const socioFeeCents = Math.round(
      platformFeeCents * (socioSplitPercent / 100),
    );
    socioFeeAmount = socioFeeCents / 100;
    platformNetAmount = (platformFeeCents - socioFeeCents) / 100;
  }

  await supabaseAdmin
    .from("sales")
    .update({
      gross_amount: grossAmount,
      platform_fee_total: platformFeeTotal,
      socio_fee_amount: socioFeeAmount,
      platform_net_amount: platformNetAmount,
      asaas_payment_status: payment.status,
    })
    .eq("id", saleId);
}

async function processPaymentFailed(
  supabaseAdmin: ReturnType<typeof createClient<any>>,
  sale: any,
  payment: any,
  eventType: string,
): Promise<ProcessingResult> {
  const saleId = sale.id;

  const { data: cancelledSale, error: updateError } = await supabaseAdmin
    .from("sales")
    .update({
      status: "cancelado",
      cancel_reason: `Pagamento ${eventType.toLowerCase().replace("payment_", "")} via Asaas`,
      cancelled_at: new Date().toISOString(),
      asaas_payment_status: payment.status,
    })
    .eq("id", saleId)
    .in("status", ["pendente_pagamento", "reservado"])
    .select("id")
    .maybeSingle();

  if (updateError) {
    return {
      status: "failed",
      resultCategory: "error",
      httpStatus: 500,
      message: `Falha crítica ao cancelar venda ${saleId}`,
      responseBody: { error: "Sale cancellation failed", sale_id: saleId },
      saleId,
      companyId: sale.company_id,
    };
  }

  if (!cancelledSale) {
    /**
     * Blindagem Etapa 1:
     * evento de falha fora de ordem/repetido não pode executar limpeza destrutiva
     * quando a venda já saiu do estado cancelável (ex.: já está paga ou já cancelada).
     */
    await supabaseAdmin
      .from("sales")
      .update({ asaas_payment_status: payment.status })
      .eq("id", saleId);

    await logSaleOperationalEvent({
      supabaseAdmin,
      saleId,
      companyId: sale.company_id,
      action: "payment_failed_ignored",
      source: "asaas-webhook",
      result: "ignored",
      detail: `${eventType}|payment=${payment.id}`,
    });

    return {
      status: "ignored",
      resultCategory: "ignored",
      httpStatus: 200,
      message: `Evento ${eventType} ignorado para venda ${saleId} fora do estado cancelável`,
      responseBody: {
        received: true,
        ignored: true,
        reason: "sale_not_cancellable",
        sale_id: saleId,
        current_status: sale.status,
      },
      saleId,
      companyId: sale.company_id,
    };
  }

  await supabaseAdmin.from("tickets").delete().eq("sale_id", saleId);
  const { error: seatLockError } = await supabaseAdmin
    .from("seat_locks")
    .delete()
    .eq("sale_id", saleId);
  if (seatLockError) {
    return {
      status: "partial_failure",
      resultCategory: "partial_failure",
      httpStatus: 200,
      message: `Venda ${saleId} cancelada, mas falhou remoção de seat_locks`,
      responseBody: {
        received: true,
        processed: true,
        warning: "Seat lock cleanup failed",
        sale_id: saleId,
        incident_code: "seat_lock_cleanup_failed",
      },
      saleId,
      companyId: sale.company_id,
    };
  }

  await supabaseAdmin.from("sale_passengers").delete().eq("sale_id", saleId);

  await logSaleOperationalEvent({
    supabaseAdmin,
    saleId,
    companyId: sale.company_id,
    action: "payment_failed",
    source: "asaas-webhook",
    result: "success",
    detail: `${eventType}|payment=${payment.id}`,
  });

  return {
    status: "success",
    resultCategory: "success",
    httpStatus: 200,
    message: `Venda ${saleId} cancelada com sucesso`,
    responseBody: { received: true, processed: true, sale_id: saleId },
    saleId,
    companyId: sale.company_id,
  };
}

async function persistIntegrationLog(
  supabaseAdmin: ReturnType<typeof createClient<any>>,
  params: ProcessingResult & { payload: unknown },
) {
  await logSaleIntegrationEvent({
    supabaseAdmin,
    saleId: params.saleId ?? null,
    companyId: params.companyId ?? null,
    paymentEnvironment: params.paymentEnvironment ?? null,
    environmentDecisionSource: params.environmentDecisionSource ?? null,
    environmentHostDetected: params.environmentHostDetected ?? null,
    provider: "asaas",
    direction: "incoming_webhook",
    eventType: params.eventType ?? null,
    paymentId: params.paymentId ?? null,
    externalReference: params.externalReference ?? null,
    asaasEventId: params.asaasEventId ?? null,
    httpStatus: params.httpStatus,
    processingStatus: params.status,
    resultCategory: params.resultCategory,
    incidentCode: params.incidentCode ?? null,
    warningCode: params.warningCode ?? null,
    durationMs: params.durationMs ?? null,
    message: params.message,
    payloadJson: params.payload,
    responseJson: params.responseBody,
  });
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
