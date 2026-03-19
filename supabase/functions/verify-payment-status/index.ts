import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  logPaymentTrace,
  logSaleIntegrationEvent,
  logSaleOperationalEvent,
} from "../_shared/payment-observability.ts";
import {
  resolvePartnerWalletByEnvironment,
  resolvePaymentContext,
} from "../_shared/payment-context-resolver.ts";
import { finalizeConfirmedPayment } from "../_shared/payment-finalization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    const { sale_id } = await req.json();
    saleIdFromRequest = typeof sale_id === "string" ? sale_id : null;

    if (!saleIdFromRequest) {
      return jsonResponse({ error: "sale_id is required" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: sale, error: saleError } = await supabaseAdmin
      .from("sales")
      .select("id, status, asaas_payment_id, asaas_payment_status, company_id, unit_price, quantity, gross_amount, payment_confirmed_at, platform_fee_paid_at, payment_environment")
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
        paymentId: sale.asaas_payment_id,
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

    if (sale.status === "pago") {
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

    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("asaas_api_key_production, asaas_api_key_sandbox, platform_fee_percent, partner_split_percent")
      .eq("id", sale.company_id)
      .single();

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

    const asaasStatus = paymentData.status;

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

      if (company?.platform_fee_percent != null) {
        const platformFeePercent = Number(company.platform_fee_percent);
        const grossAmount = sale.gross_amount ?? (sale.unit_price * sale.quantity);
        const grossAmountCents = Math.round(grossAmount * 100);
        const platformFeeCents = Math.round(grossAmountCents * (platformFeePercent / 100));
        const platformFeeTotal = platformFeeCents / 100;

        const partnerSplitPercent = company?.partner_split_percent ?? 50;
        const { data: partner } = await supabaseAdmin
          .from("partners")
          .select("id, asaas_wallet_id_production, asaas_wallet_id_sandbox, status")
          .eq("company_id", sale.company_id)
          .eq("status", "ativo")
          .limit(1)
          .maybeSingle();

        let partnerFeeAmount = 0;
        let platformNetAmount = platformFeeTotal;

        const partnerWalletId = resolvePartnerWalletByEnvironment(partner, paymentContext.environment);

        logPaymentTrace("info", "verify-payment-status", "financial_partner_selected", {
          sale_id: sale.id,
          company_id: sale.company_id,
          payment_environment: paymentContext.environment,
          partner_id: partner?.id ?? null,
          partner_wallet_selected: partnerWalletId,
          partner_wallet_source: paymentContext.environment === "production"
            ? (partner?.asaas_wallet_id_production ? "partner.production" : "none")
            : (partner?.asaas_wallet_id_sandbox ? "partner.sandbox" : "none"),
        });

        if (partnerWalletId && partner?.status === "ativo") {
          const partnerFeeCents = Math.round(platformFeeCents * (partnerSplitPercent / 100));
          partnerFeeAmount = partnerFeeCents / 100;
          platformNetAmount = (platformFeeCents - partnerFeeCents) / 100;
        }

        await supabaseAdmin
          .from("sales")
          .update({
            gross_amount: grossAmount,
            platform_fee_total: platformFeeTotal,
            partner_fee_amount: partnerFeeAmount,
            platform_net_amount: platformNetAmount,
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
          detail: `platform_fee_total=${platformFeeTotal.toFixed(2)}`,
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
