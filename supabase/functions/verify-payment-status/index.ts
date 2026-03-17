import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logPaymentTrace } from "../_shared/payment-observability.ts";
import { resolvePartnerWalletByEnvironment, resolvePaymentContext } from "../_shared/payment-context-resolver.ts";
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sale_id } = await req.json();

    if (!sale_id || typeof sale_id !== "string") {
      return new Response(
        JSON.stringify({ error: "sale_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: sale, error: saleError } = await supabaseAdmin
      .from("sales")
      .select("id, status, asaas_payment_id, asaas_payment_status, company_id, unit_price, quantity, gross_amount, payment_confirmed_at, platform_fee_paid_at, payment_environment")
      .eq("id", sale_id)
      .single();

    if (saleError || !sale) {
      return new Response(
        JSON.stringify({ error: "Sale not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (sale.status === "pago") {
      // Etapa 2: verify também usa a rotina central de finalização para manter simetria com webhook.
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
        return new Response(
          JSON.stringify({
            error: "Venda paga sem passagem gerada",
            error_code: "paid_sale_without_tickets",
            paymentStatus: "inconsistente_sem_passagem",
          }),
          { status: finalization.httpStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          paymentStatus: "pago",
          paymentConfirmedAt: sale.payment_confirmed_at ?? ((!sale.asaas_payment_id) ? sale.platform_fee_paid_at : null),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (sale.status === "cancelado") {
      return new Response(
        JSON.stringify({ paymentStatus: "cancelado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!sale.asaas_payment_id) {
      return new Response(
        JSON.stringify({ paymentStatus: sale.status }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar empresa
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("asaas_api_key_production, asaas_api_key_sandbox, platform_fee_percent, partner_split_percent")
      .eq("id", sale.company_id)
      .single();

    // Pré-Step 5: fallback legado só pode ser habilitado explicitamente por feature flag temporária.
    const allowLegacyVerifyFallback = Deno.env.get("ASAAS_VERIFY_ALLOW_LEGACY_FALLBACK") === "true";

    const paymentContext = resolvePaymentContext({
      mode: "verify",
      sale,
      company,
    });

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

      return new Response(
        JSON.stringify({
          error: "Empresa sem API key Asaas para o ambiente da venda",
          error_code: "missing_company_asaas_api_key",
          paymentStatus: sale.status,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (paymentContext.apiKeySource.includes("platform_fallback")) {
      logPaymentTrace("warn", "verify-payment-status", "legacy_fallback_used", {
        sale_id: sale.id,
        company_id: sale.company_id,
        payment_environment: paymentContext.environment,
        api_key_source: paymentContext.apiKeySource,
      });
    }

    // Query Asaas for payment status
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
        return new Response(
          JSON.stringify({ paymentStatus: sale.status, detail: "Could not verify with Asaas" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
      return new Response(
        JSON.stringify({ paymentStatus: sale.status, detail: "Could not verify with Asaas" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

        return new Response(
          JSON.stringify({
            error: "Pagamento confirmado, mas a passagem não foi gerada",
            error_code: "ticket_generation_incomplete",
            paymentStatus: "inconsistente_sem_passagem",
          }),
          { status: finalization.httpStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
          // Hardening Step 5: escopo multi-tenant obrigatório para não cruzar sócios entre empresas.
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
          .eq("id", sale_id);

        await supabaseAdmin.from("sale_logs").insert({
          sale_id,
          action: "payment_confirmed",
          description: `Pagamento confirmado via verify-payment-status (Asaas on-demand). Comissão: R$ ${platformFeeTotal.toFixed(2)} (${platformFeePercent}%).`,
          company_id: sale.company_id,
        });
      }

      return new Response(
        JSON.stringify({ paymentStatus: "pago", paymentConfirmedAt: confirmedAt }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (asaasStatus === "OVERDUE") {
      logPaymentTrace("info", "verify-payment-status", "payment_not_confirmed", {
        sale_id: sale.id,
        company_id: sale.company_id,
        payment_environment: paymentContext.environment,
        asaas_status: asaasStatus,
        result: "payment_not_confirmed",
      });
      return new Response(
        JSON.stringify({ paymentStatus: "expirado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (asaasStatus === "PENDING" || asaasStatus === "AWAITING_RISK_ANALYSIS") {
      logPaymentTrace("info", "verify-payment-status", "payment_not_confirmed", {
        sale_id: sale.id,
        company_id: sale.company_id,
        payment_environment: paymentContext.environment,
        asaas_status: asaasStatus,
        result: "payment_not_confirmed",
      });
      return new Response(
        JSON.stringify({ paymentStatus: "processando" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logPaymentTrace("info", "verify-payment-status", "payment_status_unchanged", {
      sale_id: sale.id,
      company_id: sale.company_id,
      payment_environment: paymentContext.environment,
      asaas_status: asaasStatus,
      result: "payment_not_confirmed",
      current_sale_status: sale.status,
    });

    return new Response(
      JSON.stringify({ paymentStatus: sale.status, asaas_status: asaasStatus }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    logPaymentTrace("error", "verify-payment-status", "unexpected_error", {
      error_message: error instanceof Error ? error.message : String(error),
    });
    console.error("[verify-payment-status] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

