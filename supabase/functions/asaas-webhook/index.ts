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
} from "../_shared/payment-context-resolver.ts";
import { finalizeConfirmedPayment } from "../_shared/payment-finalization.ts";
import {
  computeSocioFinancialSnapshot,
  resolveAsaasSplitRecipients,
} from "../_shared/split-recipients-resolver.ts";

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

function normalizeAsaasStatus(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function isConfirmedAsaasStatus(value: unknown): boolean {
  const status = normalizeAsaasStatus(value);
  return (
    status === "CONFIRMED" ||
    status === "RECEIVED" ||
    status === "RECEIVED_IN_CASH"
  );
}

function isFinancialReversalAsaasStatus(value: unknown): boolean {
  const status = normalizeAsaasStatus(value);
  if (!status) return false;
  if (status === "REFUNDED" || status === "REFUND_REQUESTED") {
    return true;
  }

  // Blindagem conservadora e explícita:
  // alguns contratos podem sinalizar contestação/reversão no próprio status do pagamento
  // (ex.: chargeback/dispute). Nesses casos precisamos invalidar operação, nunca ignorar.
  return (
    status.includes("CHARGEBACK") ||
    status.includes("DISPUTE") ||
    status.includes("CONTEST")
  );
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
  const asaasAccountId = requestPayload?.account?.id ?? null;

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

    /**
     * Blindagem mínima e conservadora:
     * antes de resolver ambiente da venda, ignoramos com 200 apenas eventos
     * claramente fora do escopo SmartBus (sem referência, referência vazia
     * ou referência fora dos padrões oficiais `uuid` / `platform_fee_<uuid>`).
     *
     * Isso evita retry infinito no Asaas para cobranças externas à operação
     * de vendas SmartBus, sem relaxar validações para referências válidas.
     */
    /**
     * Refinamento de validação:
     * o regex anterior (`/^[0-9a-fA-F-]{36}$/`) era permissivo e aceitava
     * qualquer combinação hex/hífen com 36 caracteres, mesmo sem estrutura
     * real de UUID. Usamos padrão UUID canônico (versões 1-5) para reduzir
     * falso-positivo e melhorar previsibilidade/auditabilidade da triagem.
     * Risco mitigado: classificar referência inválida como "potencial venda".
     */
    const hasUuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(actualSaleId);
    const isClearlyOutsideSmartbusScope = !actualSaleId || !hasUuidPattern;
    if (isClearlyOutsideSmartbusScope) {
      const reason = !externalReference
        ? "missing_external_reference"
        : "invalid_external_reference_scope";
      const outsideScopeResult: ProcessingResult = {
        asaasEventId,
        durationMs: Date.now() - startedAt,
        status: "ignored",
        resultCategory: "ignored",
        httpStatus: 200,
        message: `Evento fora do escopo SmartBus ignorado (${reason})`,
        responseBody: {
          received: true,
          ignored: true,
          reason,
          incident_code: "webhook_event_outside_smartbus_scope",
          external_reference: externalReference,
          account_id: asaasAccountId,
        },
        saleId: actualSaleId || null,
        eventType,
        paymentId,
        externalReference,
        incidentCode: "webhook_event_outside_smartbus_scope",
      };

      await persistIntegrationLog(supabaseAdmin, {
        ...outsideScopeResult,
        payload: requestPayload,
      });

      logPaymentTrace("warn", "asaas-webhook", "webhook_event_outside_smartbus_scope", {
        event_type: eventType,
        asaas_payment_id: paymentId,
        external_reference: externalReference,
        asaas_account_id: asaasAccountId,
        reason,
      });

      return jsonResponse(
        outsideScopeResult.httpStatus,
        outsideScopeResult.responseBody,
      );
    }

    // Pré-Step 5: webhook só segue quando o ambiente da venda foi determinado de forma explícita.
    let saleEnv: PaymentEnvironment | null = null;
    if (actualSaleId && hasUuidPattern) {
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
      "PAYMENT_UPDATED",
      "PAYMENT_RESTORED",
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
        "id, company_id, status, unit_price, quantity, gross_amount, payment_environment, representative_id",
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

    const normalizedAsaasStatus = normalizeAsaasStatus(payment?.status);
    const shouldTreatAsConfirmed =
      isConfirmedAsaasStatus(normalizedAsaasStatus) ||
      eventType === "PAYMENT_CONFIRMED" ||
      eventType === "PAYMENT_RECEIVED";
    const shouldTreatAsFailure =
      isFinancialReversalAsaasStatus(normalizedAsaasStatus) ||
      eventType === "PAYMENT_OVERDUE" ||
      eventType === "PAYMENT_DELETED" ||
      eventType === "PAYMENT_REFUNDED";

    if (shouldTreatAsConfirmed) {
      result = await processPaymentConfirmed(
        supabaseAdmin,
        sale,
        payment,
        eventType,
        requestPayload?.dateCreated ?? null,
      );
    } else if (shouldTreatAsFailure) {
      result = await processPaymentFailed(
        supabaseAdmin,
        sale,
        payment,
        eventType,
      );
    } else {
      // Eventos operacionais sem perda financeira terminal (ex.: PAYMENT_UPDATED/PAYMENT_RESTORED)
      // não alteram status da venda por si só. Persistimos apenas status do gateway para
      // manter rastreabilidade e evitar fluxo paralelo/mágico no backend.
      const normalized = normalizeAsaasStatus(payment?.status);
      await supabaseAdmin
        .from("sales")
        .update({
          asaas_payment_status: normalized || payment?.status || null,
        })
        .eq("id", sale.id)
        .eq("company_id", sale.company_id);

      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        action: "payment_status_updated_without_transition",
        source: "asaas-webhook",
        result: "ignored",
        paymentEnvironment: sale.payment_environment ?? null,
        detail: `${eventType}|status=${normalized || "unknown"}|payment=${payment.id}`,
      });

      result = {
        status: "ignored",
        resultCategory: "ignored",
        httpStatus: 200,
        message: `Evento ${eventType} registrado sem transição operacional`,
        responseBody: {
          received: true,
          ignored: true,
          reason: "status_update_without_operational_transition",
          asaas_status: normalized || payment?.status || null,
          sale_id: sale.id,
        },
        saleId: sale.id,
        companyId: sale.company_id,
      };
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
    .select("id, company_id, status, platform_fee_status, platform_fee_amount, platform_fee_total")
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
    // Comentário de manutenção: a taxa de venda manual nasce em `platform_fee_amount`,
    // mas os consolidadores oficiais (/admin/vendas, relatórios e PDF) leem `platform_fee_total`.
    // Quando a taxa separada é quitada via webhook, espelhamos o valor consolidado aqui para
    // manter a mesma fonte de verdade financeira dos demais fluxos pagos.
    const consolidatedPlatformFeeTotal =
      sale.platform_fee_total ?? sale.platform_fee_amount ?? 0;

    const { error: updateError } = await supabaseAdmin
      .from("sales")
      .update({
        platform_fee_status: "paid",
        platform_fee_paid_at: confirmedAt,
        platform_fee_payment_id: payment.id,
        platform_fee_total: consolidatedPlatformFeeTotal,
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
  const socioSplitPercent = Number(company?.socio_split_percent ?? 50);
  let splitResolution;
  try {
    splitResolution = await resolveAsaasSplitRecipients({
      supabaseAdmin,
      source: "asaas-webhook",
      saleId,
      companyId,
      paymentEnvironment,
      splitEnabled: true,
      platformFeePercent,
      socioSplitPercent,
      representativeId: sale.representative_id ?? null,
      includePlatformRecipient: false,
    });
  } catch (splitError) {
    const splitErrorMessage = splitError instanceof Error
      ? splitError.message
      : String(splitError);
    const [splitErrorCode, ...rest] = splitErrorMessage.split(":");
    const splitErrorDetail = rest.join(":").trim();

    logPaymentTrace("error", "asaas-webhook", splitErrorCode || "split_resolution_failed", {
      sale_id: saleId,
      company_id: companyId,
      payment_environment: paymentEnvironment,
      error_message: splitErrorDetail || splitErrorMessage,
    });

    await logSaleOperationalEvent({
      supabaseAdmin,
      saleId,
      companyId,
      action: "payment_confirmed",
      source: "asaas-webhook",
      result: "error",
      paymentEnvironment,
      errorCode: splitErrorCode || "split_resolution_failed",
      detail: splitErrorDetail || splitErrorMessage,
    });
    return;
  }

  const financialSnapshot = computeSocioFinancialSnapshot({
    grossAmount,
    platformFeePercent,
    socioSplitPercent,
    socioValidation: splitResolution.socioValidation,
    paymentEnvironment,
  });

  logPaymentTrace("info", "asaas-webhook", "financial_socio_selected", {
    sale_id: saleId,
    company_id: companyId,
    payment_environment: paymentEnvironment,
    socio_id: financialSnapshot.socio?.id ?? null,
    socio_wallet_selected: financialSnapshot.socioWalletId,
    socio_wallet_source:
      paymentEnvironment === "production"
        ? financialSnapshot.socio?.asaas_wallet_id_production
          ? "socio.production"
          : "none"
        : financialSnapshot.socio?.asaas_wallet_id_sandbox
          ? "socio.sandbox"
          : "none",
  });

  if (splitResolution.representative.eligible) {
    logPaymentTrace("info", "asaas-webhook", "split_representative_eligible", {
      sale_id: saleId,
      company_id: companyId,
      payment_environment: paymentEnvironment,
      representative_id: splitResolution.representative.representativeId,
      representative_percent: splitResolution.representative.percent,
    });
  } else if (sale.representative_id) {
    logPaymentTrace("warn", "asaas-webhook", "split_representative_ignored", {
      sale_id: saleId,
      company_id: companyId,
      payment_environment: paymentEnvironment,
      representative_id: sale.representative_id,
      representative_reason: splitResolution.representative.reason,
    });
  }

  await supabaseAdmin
    .from("sales")
    .update({
      gross_amount: grossAmount,
      platform_fee_total: financialSnapshot.platformFeeTotal,
      socio_fee_amount: financialSnapshot.socioFeeAmount,
      platform_net_amount: financialSnapshot.platformNetAmount,
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
  const asaasStatusNormalized = normalizeAsaasStatus(payment?.status);

  if (sale.status === "cancelado") {
    await supabaseAdmin
      .from("sales")
      .update({ asaas_payment_status: asaasStatusNormalized || payment.status })
      .eq("id", saleId)
      .eq("company_id", sale.company_id);

    await logSaleOperationalEvent({
      supabaseAdmin,
      saleId,
      companyId: sale.company_id,
      action: "payment_failed_ignored",
      source: "asaas-webhook",
      result: "ignored",
      paymentEnvironment: sale.payment_environment ?? null,
      detail: `${eventType}|payment=${payment.id}|already_cancelled`,
    });

    return {
      status: "ignored",
      resultCategory: "ignored",
      httpStatus: 200,
      message: `Evento ${eventType} ignorado: venda ${saleId} já estava cancelada`,
      responseBody: {
        received: true,
        ignored: true,
        reason: "sale_already_cancelled",
        sale_id: saleId,
      },
      saleId,
      companyId: sale.company_id,
    };
  }

  if (sale.status === "pago") {
    const isPostPaidFinancialReversal =
      isFinancialReversalAsaasStatus(asaasStatusNormalized) ||
      eventType === "PAYMENT_REFUNDED";

    if (!isPostPaidFinancialReversal) {
      /**
       * Revisão conservadora:
       * sinais como OVERDUE/DELETED/CANCELLED podem aparecer em trilhas administrativas
       * e não significam, por si só, perda financeira pós-pago.
       * Para venda já paga, só executamos blindagem destrutiva em estorno/disputa/chargeback real.
       */
      await supabaseAdmin
        .from("sales")
        .update({ asaas_payment_status: asaasStatusNormalized || payment.status })
        .eq("id", saleId)
        .eq("company_id", sale.company_id);

      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId,
        companyId: sale.company_id,
        action: "payment_failed_ignored",
        source: "asaas-webhook",
        result: "ignored",
        paymentEnvironment: sale.payment_environment ?? null,
        detail:
          `${eventType}|status=${asaasStatusNormalized || "unknown"}|payment=${payment.id}|non_terminal_for_post_paid_reversal`,
      });

      return {
        status: "ignored",
        resultCategory: "ignored",
        httpStatus: 200,
        message:
          `Evento ${eventType} registrado sem blindagem pós-pago na venda ${saleId} (status não terminal de perda financeira)`,
        responseBody: {
          received: true,
          ignored: true,
          reason: "non_terminal_for_post_paid_reversal",
          sale_id: saleId,
          asaas_status: asaasStatusNormalized || payment.status || null,
        },
        saleId,
        companyId: sale.company_id,
      };
    }

    const { data: ticketsData } = await supabaseAdmin
      .from("tickets")
      .select("id, boarding_status")
      .eq("sale_id", saleId)
      .eq("company_id", sale.company_id);

    const hasConsumedBoarding = (ticketsData ?? []).some((ticket) =>
      (ticket.boarding_status ?? "pendente") !== "pendente"
    );

    if (hasConsumedBoarding) {
      /**
       * Blindagem operacional pós-embarque:
       * - NÃO apagamos histórico já consumido (ticket/boarding);
       * - registramos risco financeiro explícito para suporte/auditoria;
       * - e deixamos claro que não existe reembolso automático de split/taxas.
       */
      await supabaseAdmin
        .from("sales")
        .update({
          asaas_payment_status: asaasStatusNormalized || payment.status,
        })
        .eq("id", saleId)
        .eq("company_id", sale.company_id);

      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId,
        companyId: sale.company_id,
        action: "financial_reversal_post_paid_after_boarding",
        source: "asaas-webhook",
        result: "warning",
        paymentEnvironment: sale.payment_environment ?? null,
        errorCode: "post_paid_reversal_after_boarding",
        detail:
          `${eventType}|status=${asaasStatusNormalized || "unknown"}|payment=${payment.id}|manual_refund_required_no_split_rollback`,
      });

      return {
        status: "warning",
        resultCategory: "warning",
        httpStatus: 200,
        message: `Reversão financeira detectada após embarque na venda ${saleId}; risco financeiro registrado`,
        responseBody: {
          received: true,
          processed: true,
          sale_id: saleId,
          incident_code: "post_paid_reversal_after_boarding",
          operational_action: "kept_history_and_flagged_risk",
          no_automatic_refund: true,
        },
        saleId,
        companyId: sale.company_id,
        incidentCode: "post_paid_reversal_after_boarding",
      };
    }

    /**
     * Blindagem operacional pré-embarque:
     * reversão financeira pós-pago invalida venda para impedir uso indevido.
     * Não há reembolso automático de split/taxa neste fluxo.
     */
    const { data: cancelledPaidSale, error: cancelPaidError } = await supabaseAdmin
      .from("sales")
      .update({
        status: "cancelado",
        cancel_reason:
          `Reversão financeira (${eventType}/${asaasStatusNormalized || "unknown"}) pós-pagamento; venda invalidada operacionalmente. Reembolso/split permanece manual pela empresa.`,
        cancelled_at: new Date().toISOString(),
        asaas_payment_status: asaasStatusNormalized || payment.status,
      })
      .eq("id", saleId)
      .eq("company_id", sale.company_id)
      .eq("status", "pago")
      .select("id")
      .maybeSingle();

    if (cancelPaidError) {
      return {
        status: "failed",
        resultCategory: "error",
        httpStatus: 500,
        message: `Falha ao invalidar venda paga ${saleId} após reversão financeira`,
        responseBody: {
          error: "post_paid_reversal_cancellation_failed",
          sale_id: saleId,
        },
        saleId,
        companyId: sale.company_id,
      };
    }

    if (!cancelledPaidSale) {
      await supabaseAdmin
        .from("sales")
        .update({
          asaas_payment_status: asaasStatusNormalized || payment.status,
        })
        .eq("id", saleId)
        .eq("company_id", sale.company_id);

      return {
        status: "ignored",
        resultCategory: "ignored",
        httpStatus: 200,
        message: `Venda ${saleId} já mudou de estado durante a reversão; status Asaas atualizado sem nova limpeza`,
        responseBody: {
          received: true,
          ignored: true,
          reason: "race_condition_sale_state_changed",
          sale_id: saleId,
        },
        saleId,
        companyId: sale.company_id,
      };
    }

    await supabaseAdmin
      .from("tickets")
      .delete()
      .eq("sale_id", saleId)
      .eq("company_id", sale.company_id);
    const { error: postPaidSeatLockError } = await supabaseAdmin
      .from("seat_locks")
      .delete()
      .eq("sale_id", saleId)
      .eq("company_id", sale.company_id);

    if (postPaidSeatLockError) {
      return {
        status: "partial_failure",
        resultCategory: "partial_failure",
        httpStatus: 200,
        message:
          `Venda paga ${saleId} invalidada por reversão, mas falhou remoção de seat_locks`,
        responseBody: {
          received: true,
          processed: true,
          warning: "Seat lock cleanup failed",
          sale_id: saleId,
          incident_code: "seat_lock_cleanup_failed",
          no_automatic_refund: true,
        },
        saleId,
        companyId: sale.company_id,
      };
    }

    await supabaseAdmin
      .from("sale_passengers")
      .delete()
      .eq("sale_id", saleId)
      .eq("company_id", sale.company_id);

    await logSaleOperationalEvent({
      supabaseAdmin,
      saleId,
      companyId: sale.company_id,
      action: "financial_reversal_post_paid_cancelled",
      source: "asaas-webhook",
      result: "success",
      paymentEnvironment: sale.payment_environment ?? null,
      detail:
        `${eventType}|status=${asaasStatusNormalized || "unknown"}|payment=${payment.id}|manual_refund_required_no_split_rollback`,
    });

    return {
      status: "success",
      resultCategory: "success",
      httpStatus: 200,
      message: `Venda paga ${saleId} cancelada por reversão financeira antes do embarque`,
      responseBody: {
        received: true,
        processed: true,
        sale_id: saleId,
        operational_action: "cancelled_before_boarding",
        no_automatic_refund: true,
      },
      saleId,
      companyId: sale.company_id,
    };
  }

  const { data: cancelledSale, error: updateError } = await supabaseAdmin
    .from("sales")
    .update({
      status: "cancelado",
      cancel_reason: `Pagamento ${eventType.toLowerCase().replace("payment_", "")} via Asaas`,
      cancelled_at: new Date().toISOString(),
      asaas_payment_status: asaasStatusNormalized || payment.status,
    })
    .eq("id", saleId)
    .eq("company_id", sale.company_id)
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
      .update({ asaas_payment_status: asaasStatusNormalized || payment.status })
      .eq("id", saleId)
      .eq("company_id", sale.company_id);

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

  await supabaseAdmin
    .from("tickets")
    .delete()
    .eq("sale_id", saleId)
    .eq("company_id", sale.company_id);
  const { error: seatLockError } = await supabaseAdmin
    .from("seat_locks")
    .delete()
    .eq("sale_id", saleId)
    .eq("company_id", sale.company_id);
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

  await supabaseAdmin
    .from("sale_passengers")
    .delete()
    .eq("sale_id", saleId)
    .eq("company_id", sale.company_id);

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
