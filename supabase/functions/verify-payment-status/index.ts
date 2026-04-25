import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  logPaymentTrace,
  logSaleIntegrationEvent,
  logSaleOperationalEvent,
} from "../_shared/payment-observability.ts";
import {
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
const MANUAL_PLATFORM_FEE_ORIGINS = new Set([
  "admin_manual",
  "admin_reservation_conversion",
  "seller_manual",
]);
const ASAAS_CONFIRMED_STATUS = new Set(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"]);

function normalizeAsaasConfirmationTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime()) && (trimmed.includes("T") || trimmed.includes(":"))) {
    return parsed.toISOString();
  }
  return null;
}

function resolveAsaasConfirmedAtFromPayment(paymentData: any): string {
  const candidates = [
    paymentData?.clientPaymentDate,
    paymentData?.confirmedDate,
    paymentData?.paymentDate,
    paymentData?.dateCreated,
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

function isFinancialReversalAsaasStatus(value: unknown): boolean {
  const status = normalizeAsaasStatus(value);
  if (!status) return false;
  if (status === "REFUNDED" || status === "REFUND_REQUESTED") {
    return true;
  }

  return (
    status.includes("CHARGEBACK") ||
    status.includes("DISPUTE") ||
    status.includes("CONTEST")
  );
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();
  let saleIdFromRequest: string | null = null;

  try {
    const { sale_id, force_revalidate } = await req.json();
    saleIdFromRequest = typeof sale_id === "string" ? sale_id : null;
    const forceRevalidate = force_revalidate === true;

    if (!saleIdFromRequest) {
      return jsonResponse({ error: "sale_id is required" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: sale, error: saleError } = await supabaseAdmin
      .from("sales")
      .select("id, status, asaas_payment_id, asaas_payment_status, company_id, unit_price, quantity, gross_amount, payment_confirmed_at, platform_fee_paid_at, payment_environment, representative_id, split_snapshot_platform_fee_total, split_snapshot_socio_fee_amount, split_snapshot_platform_net_amount, split_snapshot_captured_at, platform_fee_payment_id, platform_fee_status, sale_origin")
      .eq("id", saleIdFromRequest)
      .single();

    if (saleError || !sale) {
      await logSaleIntegrationEvent({
        supabaseAdmin,
        saleId: saleIdFromRequest,
        companyId: null,
        provider: "asaas",
        direction: "manual_sync",
        eventType: "verify_payment_status",
        externalReference: saleIdFromRequest,
        httpStatus: 404,
        processingStatus: "rejected",
        resultCategory: "rejected",
        incidentCode: "sale_not_found",
        durationMs: Date.now() - startedAt,
        message: "Venda não encontrada para verify-payment-status",
        payloadJson: { sale_id: saleIdFromRequest },
        responseJson: { error: "Sale not found" },
      });
      return jsonResponse({ error: "Sale not found" }, 404);
    }

    const persistVerifyLog = async (params: {
      processingStatus: "success" | "ignored" | "partial_failure" | "failed" | "warning" | "rejected";
      resultCategory: "success" | "ignored" | "partial_failure" | "warning" | "rejected" | "error";
      message: string;
      incidentCode?: string | null;
      warningCode?: string | null;
      httpStatus?: number | null;
      responseJson?: Record<string, unknown> | null;
      payloadJson?: Record<string, unknown> | null;
    }) => {
      await logSaleIntegrationEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        paymentEnvironment: sale.payment_environment ?? null,
        provider: "asaas",
        direction: "manual_sync",
        eventType: "verify_payment_status",
        paymentId: sale.asaas_payment_id ?? sale.platform_fee_payment_id ?? null,
        externalReference: sale.id,
        httpStatus: params.httpStatus ?? null,
        processingStatus: params.processingStatus,
        resultCategory: params.resultCategory,
        incidentCode: params.incidentCode ?? null,
        warningCode: params.warningCode ?? null,
        durationMs: Date.now() - startedAt,
        message: params.message,
        payloadJson: params.payloadJson ?? { sale_id: sale.id },
        responseJson: params.responseJson ?? null,
      });
    };

    const ensureMissingWebhookObservationLog = async () => {
      // Comentário de suporte: quando o fallback confirma sem `incoming_webhook`,
      // gravamos um incidente único para explicitar a lacuna de observabilidade da venda.
      const webhookQuery = supabaseAdmin
          .from("sale_integration_logs")
          .select("id", { head: true, count: "exact" })
          .eq("sale_id", sale.id)
          .eq("company_id", sale.company_id)
          .eq("provider", "asaas")
          .eq("direction", "incoming_webhook");
      const existingIncidentQuery = supabaseAdmin
          .from("sale_integration_logs")
          .select("id", { head: true, count: "exact" })
          .eq("sale_id", sale.id)
          .eq("company_id", sale.company_id)
          .eq("provider", "asaas")
          .eq("direction", "manual_sync")
          .eq("incident_code", "webhook_not_observed_before_verify_confirmation");

      if (sale.payment_environment) {
        webhookQuery.eq("payment_environment", sale.payment_environment);
        existingIncidentQuery.eq("payment_environment", sale.payment_environment);
      }

      const [webhookRes, existingIncidentRes] = await Promise.all([
        webhookQuery,
        existingIncidentQuery,
      ]);

      if ((webhookRes.count ?? 0) > 0 || (existingIncidentRes.count ?? 0) > 0) {
        return;
      }

      await persistVerifyLog({
        processingStatus: "warning",
        resultCategory: "warning",
        incidentCode: "webhook_not_observed_before_verify_confirmation",
        httpStatus: 200,
        message: "Pagamento confirmado via verify-payment-status sem webhook persistido correlacionado até o momento da confirmação",
        responseJson: {
          paymentStatus: "pago",
          observability_warning: "webhook_not_observed_before_verify_confirmation",
        },
      });
    };

    if (sale.status === "pago" && !forceRevalidate) {
      const finalization = await finalizeConfirmedPayment({
        supabaseAdmin,
        sale,
        confirmedAt: sale.payment_confirmed_at ?? sale.platform_fee_paid_at ?? new Date().toISOString(),
        asaasStatus: sale.asaas_payment_status ?? "CONFIRMED",
        source: "verify-payment-status",
        paymentId: sale.asaas_payment_id,
        allowStatusUpdate: false,
        writeSaleLog: false,
      });

      if (!finalization.ok) {
        await persistVerifyLog({
          processingStatus: "partial_failure",
          resultCategory: "partial_failure",
          message: "Venda paga sem passagem gerada durante verify-payment-status",
          incidentCode: "ticket_generation_incomplete",
          httpStatus: finalization.httpStatus,
          responseJson: {
            error: "Venda paga sem passagem gerada",
            error_code: "paid_sale_without_tickets",
            paymentStatus: "inconsistente_sem_passagem",
          },
        });

        return jsonResponse({
          error: "Venda paga sem passagem gerada",
          error_code: "paid_sale_without_tickets",
          paymentStatus: "inconsistente_sem_passagem",
        }, finalization.httpStatus);
      }

      await persistVerifyLog({
        processingStatus: "success",
        resultCategory: "success",
        message: "Verify confirmou venda já saudável e paga",
        httpStatus: 200,
        responseJson: {
          paymentStatus: "pago",
          paymentConfirmedAt: sale.payment_confirmed_at ?? ((!sale.asaas_payment_id) ? sale.platform_fee_paid_at : null),
        },
      });

      return jsonResponse({
        paymentStatus: "pago",
        paymentConfirmedAt: sale.payment_confirmed_at ?? ((!sale.asaas_payment_id) ? sale.platform_fee_paid_at : null),
      }, 200);
    }

    if (sale.status === "cancelado") {
      await persistVerifyLog({
        processingStatus: "ignored",
        resultCategory: "ignored",
        message: "Verify ignorado porque a venda já está cancelada",
        warningCode: "sale_already_cancelled",
        httpStatus: 200,
        responseJson: { paymentStatus: "cancelado" },
      });
      return jsonResponse({ paymentStatus: "cancelado" }, 200);
    }

    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("asaas_api_key_production, asaas_api_key_sandbox, platform_fee_percent, socio_split_percent")
      .eq("id", sale.company_id)
      .single();

    const shouldRunManualPlatformFeeFallback =
      !sale.asaas_payment_id &&
      !!sale.platform_fee_payment_id &&
      (sale.platform_fee_status === "pending" || sale.platform_fee_status === "failed") &&
      (!sale.sale_origin || MANUAL_PLATFORM_FEE_ORIGINS.has(sale.sale_origin));

    /**
     * Fallback mínimo (manual/admin):
     * quando a venda não possui cobrança principal (`asaas_payment_id`) mas possui taxa manual
     * com `platform_fee_payment_id`, consultamos o Asaas para convergir status e evitar
     * nova cobrança duplicada no admin.
     */
    if (shouldRunManualPlatformFeeFallback) {
      let paymentContext;
      try {
        paymentContext = resolvePaymentContext({
          mode: "verify",
          sale,
          company,
        });
      } catch (contextError) {
        await persistVerifyLog({
          processingStatus: "rejected",
          resultCategory: "rejected",
          message: "Fallback manual não executado: ambiente da venda inválido ou ausente",
          incidentCode: "payment_environment_unresolved",
          httpStatus: 409,
          responseJson: {
            error: "Ambiente da venda inválido ou ausente",
            error_code: "payment_environment_unresolved",
            paymentStatus: sale.status,
          },
          payloadJson: { sale_id: sale.id, platform_fee_payment_id: sale.platform_fee_payment_id },
        });

        return jsonResponse({
          error: "Ambiente da venda inválido ou ausente",
          error_code: "payment_environment_unresolved",
          paymentStatus: sale.status,
        }, 409);
      }

      const apiKeyToUse = paymentContext.apiKey;
      if (!apiKeyToUse) {
        await persistVerifyLog({
          processingStatus: "rejected",
          resultCategory: "rejected",
          message: "Fallback manual sem API key Asaas no ambiente da venda",
          incidentCode: "missing_company_asaas_api_key",
          httpStatus: 409,
          responseJson: {
            error: "Empresa sem API key Asaas para o ambiente da venda",
            error_code: "missing_company_asaas_api_key",
            paymentStatus: sale.status,
          },
          payloadJson: { sale_id: sale.id, platform_fee_payment_id: sale.platform_fee_payment_id },
        });
        return jsonResponse({
          error: "Empresa sem API key Asaas para o ambiente da venda",
          error_code: "missing_company_asaas_api_key",
          paymentStatus: sale.status,
        }, 409);
      }

      let platformFeePaymentData: any;
      try {
        const response = await fetch(`${paymentContext.baseUrl}/payments/${sale.platform_fee_payment_id}`, {
          headers: { "access_token": apiKeyToUse },
        });

        if (!response.ok) {
          await persistVerifyLog({
            processingStatus: "warning",
            resultCategory: "warning",
            message: "Fallback manual não conseguiu consultar cobrança da taxa no Asaas",
            warningCode: "platform_fee_payment_status_fetch_failed",
            httpStatus: response.status,
            payloadJson: { sale_id: sale.id, platform_fee_payment_id: sale.platform_fee_payment_id },
            responseJson: { paymentStatus: sale.status },
          });
          return jsonResponse({ paymentStatus: sale.status }, 200);
        }

        platformFeePaymentData = await response.json();
      } catch {
        await persistVerifyLog({
          processingStatus: "warning",
          resultCategory: "warning",
          message: "Fallback manual com exceção ao consultar cobrança da taxa no Asaas",
          warningCode: "platform_fee_payment_status_fetch_exception",
          httpStatus: 200,
          payloadJson: { sale_id: sale.id, platform_fee_payment_id: sale.platform_fee_payment_id },
          responseJson: { paymentStatus: sale.status },
        });
        return jsonResponse({ paymentStatus: sale.status }, 200);
      }

      const platformFeeAsaasStatus = normalizeAsaasStatus(platformFeePaymentData?.status);

      if (ASAAS_CONFIRMED_STATUS.has(platformFeeAsaasStatus)) {
        const confirmedAt = resolveAsaasConfirmedAtFromPayment(platformFeePaymentData);

        const { data: updatedSale, error: updateError } = await supabaseAdmin
          .from("sales")
          .update({
            platform_fee_status: "paid",
            platform_fee_paid_at: confirmedAt,
            payment_confirmed_at: confirmedAt,
            status: sale.status === "reservado" ? "pago" : sale.status,
            platform_fee_payment_id: platformFeePaymentData.id ?? sale.platform_fee_payment_id,
          })
          .eq("id", sale.id)
          .in("platform_fee_status", ["pending", "failed"])
          .select("id, status, payment_confirmed_at, platform_fee_paid_at")
          .maybeSingle();

        if (updateError) {
          await persistVerifyLog({
            processingStatus: "failed",
            resultCategory: "error",
            message: "Fallback manual falhou ao convergir venda com taxa paga",
            incidentCode: "manual_platform_fee_convergence_failed",
            httpStatus: 500,
            payloadJson: { sale_id: sale.id, platform_fee_payment_id: sale.platform_fee_payment_id },
            responseJson: { error: "manual_platform_fee_convergence_failed", paymentStatus: sale.status },
          });
          return jsonResponse({ error: "manual_platform_fee_convergence_failed", paymentStatus: sale.status }, 500);
        }

        await logSaleOperationalEvent({
          supabaseAdmin,
          saleId: sale.id,
          companyId: sale.company_id,
          action: "manual_platform_fee_verify_converged",
          source: "verify-payment-status",
          result: "success",
          paymentEnvironment: paymentContext.environment,
          detail: `platform_fee_payment_id=${platformFeePaymentData.id ?? sale.platform_fee_payment_id}|asaas_status=${platformFeeAsaasStatus}`,
        });

        await persistVerifyLog({
          processingStatus: "success",
          resultCategory: "success",
          message: "Fallback manual convergiu venda após confirmação da taxa no Asaas",
          incidentCode: "manual_platform_fee_converged",
          httpStatus: 200,
          payloadJson: { sale_id: sale.id, platform_fee_payment_id: sale.platform_fee_payment_id },
          responseJson: {
            paymentStatus: updatedSale?.status ?? (sale.status === "reservado" ? "pago" : sale.status),
            paymentConfirmedAt: updatedSale?.payment_confirmed_at ?? confirmedAt,
            platformFeePaidAt: updatedSale?.platform_fee_paid_at ?? confirmedAt,
            fallback: "manual_platform_fee_payment_id",
          },
        });

        return jsonResponse({
          paymentStatus: updatedSale?.status ?? (sale.status === "reservado" ? "pago" : sale.status),
          paymentConfirmedAt: updatedSale?.payment_confirmed_at ?? confirmedAt,
          platformFeePaidAt: updatedSale?.platform_fee_paid_at ?? confirmedAt,
          fallback: "manual_platform_fee_payment_id",
        }, 200);
      }

      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        action: "manual_platform_fee_status_divergence",
        source: "verify-payment-status",
        result: "warning",
        paymentEnvironment: paymentContext.environment,
        detail: `platform_fee_payment_id=${sale.platform_fee_payment_id}|asaas_status=${platformFeeAsaasStatus || "unknown"}|local_status=${sale.platform_fee_status}`,
      });

      await persistVerifyLog({
        processingStatus: "warning",
        resultCategory: "warning",
        message: "Fallback manual detectou cobrança da taxa ainda não confirmada no Asaas",
        warningCode: "manual_platform_fee_not_confirmed",
        httpStatus: 200,
        payloadJson: { sale_id: sale.id, platform_fee_payment_id: sale.platform_fee_payment_id },
        responseJson: { paymentStatus: sale.status, platform_fee_asaas_status: platformFeeAsaasStatus || "unknown" },
      });
      return jsonResponse({
        paymentStatus: sale.status,
        platformFeeAsaasStatus: platformFeeAsaasStatus || null,
      }, 200);
    }

    if (!sale.asaas_payment_id) {
      await persistVerifyLog({
        processingStatus: "ignored",
        resultCategory: "ignored",
        message: "Verify sem cobrança Asaas vinculada; sem consulta externa",
        warningCode: "missing_asaas_payment_id",
        httpStatus: 200,
        responseJson: { paymentStatus: sale.status },
      });
      return jsonResponse({ paymentStatus: sale.status }, 200);
    }

    let paymentContext;
    try {
      paymentContext = resolvePaymentContext({
        mode: "verify",
        sale,
        company,
      });
    } catch (contextError) {
      logPaymentTrace("error", "verify-payment-status", "payment_environment_unresolved", {
        sale_id: sale.id,
        company_id: sale.company_id,
        failure_reason: contextError instanceof Error ? contextError.message : String(contextError),
      });

      await persistVerifyLog({
        processingStatus: "rejected",
        resultCategory: "rejected",
        message: "Ambiente da venda inválido ou ausente no verify-payment-status",
        incidentCode: "payment_environment_unresolved",
        httpStatus: 409,
        responseJson: {
          error: "Ambiente da venda inválido ou ausente",
          error_code: "payment_environment_unresolved",
          paymentStatus: sale.status,
        },
      });

      return jsonResponse({
        error: "Ambiente da venda inválido ou ausente",
        error_code: "payment_environment_unresolved",
        paymentStatus: sale.status,
      }, 409);
    }

    const apiKeyToUse = paymentContext.apiKey;

    logPaymentTrace("info", "verify-payment-status", "payment_context_loaded", {
      sale_id: sale.id,
      company_id: sale.company_id,
      payment_environment: paymentContext.environment,
      payment_owner_type: paymentContext.ownerType,
      asaas_payment_id: sale.asaas_payment_id,
      asaas_base_url: paymentContext.baseUrl,
      api_key_source: paymentContext.apiKeySource,
      split_policy: paymentContext.splitPolicy.type,
      decision_trace: paymentContext.decisionTrace,
    });

    if (!apiKeyToUse) {
      logPaymentTrace("error", "verify-payment-status", "missing_company_api_key", {
        sale_id: sale.id,
        company_id: sale.company_id,
        payment_environment: paymentContext.environment,
        api_key_source: paymentContext.apiKeySource,
        failure_reason: "company_missing_api_key_for_sale_environment",
      });

      await persistVerifyLog({
        processingStatus: "rejected",
        resultCategory: "rejected",
        message: "Empresa sem API key Asaas para o ambiente da venda",
        incidentCode: "missing_company_asaas_api_key",
        httpStatus: 409,
        responseJson: {
          error: "Empresa sem API key Asaas para o ambiente da venda",
          error_code: "missing_company_asaas_api_key",
          paymentStatus: sale.status,
        },
      });

      return jsonResponse({
        error: "Empresa sem API key Asaas para o ambiente da venda",
        error_code: "missing_company_asaas_api_key",
        paymentStatus: sale.status,
      }, 409);
    }

    let paymentData: any;
    try {
      const res = await fetch(`${paymentContext.baseUrl}/payments/${sale.asaas_payment_id}`, {
        headers: { "access_token": apiKeyToUse },
      });

      if (!res.ok) {
        const responseText = await res.text();
        console.error("Asaas payment retrieve error:", responseText);
        logPaymentTrace("error", "verify-payment-status", "payment_status_fetch_failed", {
          sale_id: sale.id,
          company_id: sale.company_id,
          payment_environment: paymentContext.environment,
          asaas_payment_id: sale.asaas_payment_id,
          http_status: res.status,
          result: "unexpected_error",
          detail: responseText,
        });

        await persistVerifyLog({
          processingStatus: "warning",
          resultCategory: "warning",
          message: "Falha ao consultar status no Asaas; retorno preservado para UX",
          warningCode: "payment_status_fetch_failed",
          httpStatus: res.status,
          responseJson: { paymentStatus: sale.status, detail: "Could not verify with Asaas" },
          payloadJson: { sale_id: sale.id, asaas_payment_id: sale.asaas_payment_id },
        });

        return jsonResponse({ paymentStatus: sale.status, detail: "Could not verify with Asaas" }, 200);
      }

      paymentData = await res.json();
    } catch (err) {
      console.error("Asaas API error:", err);
      logPaymentTrace("error", "verify-payment-status", "payment_status_fetch_exception", {
        sale_id: sale.id,
        company_id: sale.company_id,
        payment_environment: paymentContext.environment,
        asaas_payment_id: sale.asaas_payment_id,
        result: "unexpected_error",
        error_message: err instanceof Error ? err.message : String(err),
      });

      await persistVerifyLog({
        processingStatus: "warning",
        resultCategory: "warning",
        message: "Exceção ao consultar status no Asaas; retorno degradado sem quebrar UX",
        warningCode: "payment_status_fetch_exception",
        httpStatus: 200,
        responseJson: { paymentStatus: sale.status, detail: "Could not verify with Asaas" },
        payloadJson: { sale_id: sale.id, asaas_payment_id: sale.asaas_payment_id },
      });

      return jsonResponse({ paymentStatus: sale.status, detail: "Could not verify with Asaas" }, 200);
    }

    const asaasStatus = normalizeAsaasStatus(paymentData.status) || paymentData.status;

    if (sale.status === "pago" && forceRevalidate && isFinancialReversalAsaasStatus(asaasStatus)) {
      const { data: ticketsData } = await supabaseAdmin
        .from("tickets")
        .select("id, boarding_status")
        .eq("sale_id", sale.id)
        .eq("company_id", sale.company_id);

      const hasConsumedBoarding = (ticketsData ?? []).some((ticket) =>
        (ticket.boarding_status ?? "pendente") !== "pendente"
      );

      if (hasConsumedBoarding) {
        /**
         * Revalidação manual (fallback):
         * quando a venda já foi utilizada no embarque, preservamos histórico operacional
         * e sinalizamos risco financeiro explícito. Não há reembolso/split automático.
         */
        await supabaseAdmin
          .from("sales")
          .update({ asaas_payment_status: asaasStatus })
          .eq("id", sale.id)
          .eq("company_id", sale.company_id);

        await logSaleOperationalEvent({
          supabaseAdmin,
          saleId: sale.id,
          companyId: sale.company_id,
          action: "financial_reversal_post_paid_after_boarding",
          source: "verify-payment-status",
          result: "warning",
          paymentEnvironment: paymentContext.environment,
          errorCode: "post_paid_reversal_after_boarding",
          detail: `manual_revalidate=true|asaas_status=${asaasStatus}|manual_refund_required_no_split_rollback`,
        });

        await persistVerifyLog({
          processingStatus: "warning",
          resultCategory: "warning",
          message: "Revalidação detectou reversão financeira após embarque; risco registrado sem apagar histórico",
          incidentCode: "post_paid_reversal_after_boarding",
          httpStatus: 200,
          responseJson: {
            paymentStatus: sale.status,
            asaas_status: asaasStatus,
            operational_action: "kept_history_and_flagged_risk",
            no_automatic_refund: true,
          },
          payloadJson: { sale_id: sale.id, force_revalidate: true, asaas_payment_id: sale.asaas_payment_id },
        });

        return jsonResponse({
          paymentStatus: sale.status,
          asaas_status: asaasStatus,
          operational_action: "kept_history_and_flagged_risk",
          no_automatic_refund: true,
        }, 200);
      }

      const { data: cancelledSale, error: cancelError } = await supabaseAdmin
        .from("sales")
        .update({
          status: "cancelado",
          cancel_reason: `Reversão financeira (${asaasStatus}) detectada em revalidação manual; venda invalidada operacionalmente. Reembolso/split permanece manual pela empresa.`,
          cancelled_at: new Date().toISOString(),
          asaas_payment_status: asaasStatus,
        })
        .eq("id", sale.id)
        .eq("company_id", sale.company_id)
        .eq("status", "pago")
        .select("id")
        .maybeSingle();

      if (cancelError) {
        await persistVerifyLog({
          processingStatus: "failed",
          resultCategory: "error",
          message: "Falha ao cancelar venda paga durante revalidação de reversão financeira",
          incidentCode: "post_paid_reversal_cancellation_failed",
          httpStatus: 500,
          responseJson: {
            error: "post_paid_reversal_cancellation_failed",
            paymentStatus: sale.status,
          },
          payloadJson: { sale_id: sale.id, force_revalidate: true, asaas_payment_id: sale.asaas_payment_id },
        });

        return jsonResponse({
          error: "post_paid_reversal_cancellation_failed",
          paymentStatus: sale.status,
        }, 500);
      }

      if (cancelledSale) {
        await supabaseAdmin
          .from("tickets")
          .delete()
          .eq("sale_id", sale.id)
          .eq("company_id", sale.company_id);
        await supabaseAdmin
          .from("seat_locks")
          .delete()
          .eq("sale_id", sale.id)
          .eq("company_id", sale.company_id);
        await supabaseAdmin
          .from("sale_passengers")
          .delete()
          .eq("sale_id", sale.id)
          .eq("company_id", sale.company_id);
      }

      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        action: "financial_reversal_post_paid_cancelled",
        source: "verify-payment-status",
        result: cancelledSale ? "success" : "ignored",
        paymentEnvironment: paymentContext.environment,
        detail: `manual_revalidate=true|asaas_status=${asaasStatus}|manual_refund_required_no_split_rollback`,
      });

      await persistVerifyLog({
        processingStatus: cancelledSale ? "success" : "ignored",
        resultCategory: cancelledSale ? "success" : "ignored",
        message: cancelledSale
          ? "Revalidação manual detectou reversão e cancelou venda paga antes do embarque"
          : "Revalidação detectou reversão, mas venda já havia mudado de estado",
        incidentCode: cancelledSale ? "post_paid_reversal_cancelled_before_boarding" : "race_condition_sale_state_changed",
        httpStatus: 200,
        responseJson: {
          paymentStatus: cancelledSale ? "cancelado" : sale.status,
          asaas_status: asaasStatus,
          operational_action: cancelledSale ? "cancelled_before_boarding" : "state_already_changed",
          no_automatic_refund: true,
        },
        payloadJson: { sale_id: sale.id, force_revalidate: true, asaas_payment_id: sale.asaas_payment_id },
      });

      return jsonResponse({
        paymentStatus: cancelledSale ? "cancelado" : sale.status,
        asaas_status: asaasStatus,
        operational_action: cancelledSale ? "cancelled_before_boarding" : "state_already_changed",
        no_automatic_refund: true,
      }, 200);
    }

    if (asaasStatus === "CONFIRMED" || asaasStatus === "RECEIVED" || asaasStatus === "RECEIVED_IN_CASH") {
      const confirmedAt = resolveAsaasConfirmedAtFromPayment(paymentData);
      logPaymentTrace("info", "verify-payment-status", "status_transition_attempt", {
        sale_id: sale.id,
        company_id: sale.company_id,
        payment_environment: paymentContext.environment,
        payment_owner_type: paymentContext.ownerType,
        previous_status: sale.status,
        next_status: "pago",
        asaas_payment_id: sale.asaas_payment_id,
        asaas_status: asaasStatus,
      });

      const finalization = await finalizeConfirmedPayment({
        supabaseAdmin,
        sale,
        confirmedAt,
        asaasStatus,
        source: "verify-payment-status",
        paymentId: sale.asaas_payment_id,
        allowStatusUpdate: true,
        writeSaleLog: false,
      });

      if (!finalization.ok) {
        logPaymentTrace("error", "verify-payment-status", "payment_confirmed_but_ticket_missing", {
          sale_id: sale.id,
          company_id: sale.company_id,
          payment_environment: paymentContext.environment,
          asaas_payment_id: sale.asaas_payment_id,
          asaas_status: asaasStatus,
          finalization_state: finalization.state,
          ticket_status: finalization.ticketStatus,
        });

        await persistVerifyLog({
          processingStatus: "partial_failure",
          resultCategory: "partial_failure",
          message: "Pagamento confirmado, mas a passagem não foi gerada durante verify-payment-status",
          incidentCode: "ticket_generation_incomplete",
          httpStatus: finalization.httpStatus,
          responseJson: {
            error: "Pagamento confirmado, mas a passagem não foi gerada",
            error_code: "ticket_generation_incomplete",
            paymentStatus: "inconsistente_sem_passagem",
          },
        });

        return jsonResponse({
          error: "Pagamento confirmado, mas a passagem não foi gerada",
          error_code: "ticket_generation_incomplete",
          paymentStatus: "inconsistente_sem_passagem",
        }, finalization.httpStatus);
      }

      logPaymentTrace("info", "verify-payment-status", "status_transition_success", {
        sale_id: sale.id,
        company_id: sale.company_id,
        payment_environment: paymentContext.environment,
        payment_owner_type: paymentContext.ownerType,
        previous_status: sale.status,
        next_status: "pago",
        tickets_generation: "attempted",
        seat_locks_cleanup: "attempted",
      });

      if (sale.split_snapshot_captured_at) {
        // Bloqueante crítico: reusar snapshot congelado na criação da cobrança
        // para impedir divergência com configuração atual da empresa.
        await supabaseAdmin
          .from("sales")
          .update({
            gross_amount: sale.gross_amount ?? (sale.unit_price * sale.quantity),
            platform_fee_total: sale.split_snapshot_platform_fee_total ?? null,
            socio_fee_amount: sale.split_snapshot_socio_fee_amount ?? null,
            platform_net_amount: sale.split_snapshot_platform_net_amount ?? null,
          })
          .eq("id", saleIdFromRequest);

        await logSaleOperationalEvent({
          supabaseAdmin,
          saleId: saleIdFromRequest,
          companyId: sale.company_id,
          action: "payment_confirmed",
          source: "verify-payment-status",
          result: "payment_confirmed",
          paymentEnvironment: paymentContext.environment,
          detail: "financial_snapshot_source=frozen_sale_snapshot",
        });
      } else if (company?.platform_fee_percent != null) {
        logPaymentTrace("warn", "verify-payment-status", "financial_snapshot_source_dynamic_recalculation", {
          sale_id: sale.id,
          company_id: sale.company_id,
          payment_environment: paymentContext.environment,
          financial_snapshot_source: "dynamic_recalculation",
          reason: "snapshot_not_found_on_sale",
        });

        const platformFeePercent = Number(company.platform_fee_percent);
        const grossAmount = sale.gross_amount ?? (sale.unit_price * sale.quantity);

        const socioSplitPercent = Number(company?.socio_split_percent ?? 50);
        let splitResolution;
        try {
          splitResolution = await resolveAsaasSplitRecipients({
            supabaseAdmin,
            source: "verify-payment-status",
            saleId: sale.id,
            companyId: sale.company_id,
            paymentEnvironment: paymentContext.environment,
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

          logPaymentTrace("error", "verify-payment-status", splitErrorCode || "split_resolution_failed", {
            sale_id: sale.id,
            company_id: sale.company_id,
            payment_environment: paymentContext.environment,
            error_message: splitErrorDetail || splitErrorMessage,
          });

          await persistVerifyLog({
            processingStatus: "warning",
            resultCategory: "warning",
            message: splitErrorCode === "split_socio_query_failed"
              ? "Falha ao validar sócio do split no verify-payment-status"
              : (splitErrorDetail || "Falha ao validar o split financeiro"),
            incidentCode: splitErrorCode || "split_resolution_failed",
            httpStatus: 409,
            responseJson: {
              paymentStatus: sale.status,
              split_error: splitErrorDetail || "Falha ao validar o split financeiro",
              split_error_code: splitErrorCode || "split_resolution_failed",
            },
          });

          return jsonResponse({
            paymentStatus: sale.status,
            split_error: splitErrorDetail || "Falha ao validar o split financeiro",
            split_error_code: splitErrorCode || "split_resolution_failed",
          }, 409);
        }

        const financialSnapshot = computeSocioFinancialSnapshot({
          grossAmount,
          platformFeePercent,
          socioSplitPercent,
          socioValidation: splitResolution.socioValidation,
          paymentEnvironment: paymentContext.environment,
        });

        logPaymentTrace("info", "verify-payment-status", "financial_socio_selected", {
          sale_id: sale.id,
          company_id: sale.company_id,
          payment_environment: paymentContext.environment,
          socio_id: financialSnapshot.socio?.id ?? null,
          socio_wallet_selected: financialSnapshot.socioWalletId,
          socio_wallet_source: paymentContext.environment === "production"
            ? (financialSnapshot.socio?.asaas_wallet_id_production ? "socio.production" : "none")
            : (financialSnapshot.socio?.asaas_wallet_id_sandbox ? "socio.sandbox" : "none"),
        });

        if (splitResolution.representative.eligible) {
          logPaymentTrace("info", "verify-payment-status", "split_representative_eligible", {
            sale_id: sale.id,
            company_id: sale.company_id,
            payment_environment: paymentContext.environment,
            representative_id: splitResolution.representative.representativeId,
            representative_percent: splitResolution.representative.percent,
          });
        } else if (sale.representative_id) {
          logPaymentTrace("warn", "verify-payment-status", "split_representative_ignored", {
            sale_id: sale.id,
            company_id: sale.company_id,
            payment_environment: paymentContext.environment,
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
          })
          .eq("id", saleIdFromRequest);

        await logSaleOperationalEvent({
          supabaseAdmin,
          saleId: saleIdFromRequest,
          companyId: sale.company_id,
          action: "payment_confirmed",
          source: "verify-payment-status",
          result: "payment_confirmed",
          paymentEnvironment: paymentContext.environment,
          detail: `platform_fee_total=${financialSnapshot.platformFeeTotal.toFixed(2)}`,
        });
      }

      await persistVerifyLog({
        processingStatus: finalization.state === "already_finalized" ? "ignored" : "success",
        // Normalização final: verify usa `success` para confirmação saudável
        // e reserva categorias especiais apenas para warnings/partial failures.
        resultCategory: "success",
        message: "Verify confirmou pagamento e consolidou rastros operacionais",
        httpStatus: 200,
        responseJson: { paymentStatus: "pago", paymentConfirmedAt: confirmedAt, asaas_status: asaasStatus },
      });

      await ensureMissingWebhookObservationLog();

      return jsonResponse({ paymentStatus: "pago", paymentConfirmedAt: confirmedAt }, 200);
    }

    if (asaasStatus === "OVERDUE") {
      logPaymentTrace("info", "verify-payment-status", "payment_not_confirmed", {
        sale_id: sale.id,
        company_id: sale.company_id,
        payment_environment: paymentContext.environment,
        asaas_status: asaasStatus,
        result: "payment_not_confirmed",
      });

      await persistVerifyLog({
        processingStatus: "ignored",
        resultCategory: "ignored",
        message: "Verify retornou cobrança vencida sem alteração de venda",
        warningCode: "payment_overdue",
        httpStatus: 200,
        responseJson: { paymentStatus: "expirado" },
      });

      return jsonResponse({ paymentStatus: "expirado" }, 200);
    }

    if (asaasStatus === "PENDING" || asaasStatus === "AWAITING_RISK_ANALYSIS") {
      logPaymentTrace("info", "verify-payment-status", "payment_not_confirmed", {
        sale_id: sale.id,
        company_id: sale.company_id,
        payment_environment: paymentContext.environment,
        asaas_status: asaasStatus,
        result: "payment_not_confirmed",
      });

      await persistVerifyLog({
        processingStatus: "ignored",
        resultCategory: "ignored",
        message: "Verify consultou cobrança ainda pendente",
        warningCode: "payment_pending",
        httpStatus: 200,
        responseJson: { paymentStatus: "processando" },
      });

      return jsonResponse({ paymentStatus: "processando" }, 200);
    }

    logPaymentTrace("info", "verify-payment-status", "payment_status_unchanged", {
      sale_id: sale.id,
      company_id: sale.company_id,
      payment_environment: paymentContext.environment,
      asaas_status: asaasStatus,
      result: "payment_not_confirmed",
      current_sale_status: sale.status,
    });

    await persistVerifyLog({
      processingStatus: "ignored",
      resultCategory: "ignored",
      message: "Verify consultou status sem transição operacional",
      warningCode: "payment_status_unchanged",
      httpStatus: 200,
      responseJson: { paymentStatus: sale.status, asaas_status: asaasStatus },
    });

    return jsonResponse({ paymentStatus: sale.status, asaas_status: asaasStatus }, 200);
  } catch (error) {
    logPaymentTrace("error", "verify-payment-status", "unexpected_error", {
      sale_id: saleIdFromRequest,
      error_message: error instanceof Error ? error.message : String(error),
    });

    if (saleIdFromRequest) {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );

      await logSaleIntegrationEvent({
        supabaseAdmin,
        saleId: saleIdFromRequest,
        companyId: null,
        provider: "asaas",
        direction: "manual_sync",
        eventType: "verify_payment_status",
        externalReference: saleIdFromRequest,
        httpStatus: 500,
        processingStatus: "failed",
        resultCategory: "error",
        incidentCode: "unexpected_error",
        durationMs: Date.now() - startedAt,
        message: "Erro inesperado no verify-payment-status",
        payloadJson: { sale_id: saleIdFromRequest },
        responseJson: { error: "Internal server error" },
      });
    }

    console.error("[verify-payment-status] Error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
