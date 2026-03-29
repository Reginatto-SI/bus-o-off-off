import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logPaymentTrace } from "../_shared/payment-observability.ts";
import { resolvePaymentContext } from "../_shared/payment-context-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

  try {
    const { sale_id } = await req.json();
    if (typeof sale_id !== "string" || !sale_id) {
      return jsonResponse({ error: "sale_id is required" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: sale, error: saleError } = await supabaseAdmin
      .from("sales")
      .select("id, company_id, status, asaas_payment_id, payment_environment")
      .eq("id", sale_id)
      .single();

    if (saleError || !sale) {
      return jsonResponse({ error: "Sale not found" }, 404);
    }

    const saleContext = {
      sale_id: sale.id,
      company_id: sale.company_id,
      payment_environment: sale.payment_environment,
      sale_status: sale.status,
    };

    if (sale.status === "pago") {
      logPaymentTrace("info", "get-asaas-payment-link", "reopen_blocked_paid_sale", {
        ...saleContext,
        reason: "sale_paid_not_reopenable",
      });

      return jsonResponse({ url: null, reason: "sale_paid_not_reopenable" }, 200);
    }

    if (sale.status === "cancelado") {
      logPaymentTrace("info", "get-asaas-payment-link", "reopen_blocked_cancelled_sale", {
        ...saleContext,
        reason: "sale_cancelled_not_reopenable",
      });

      return jsonResponse({ url: null, reason: "sale_cancelled_not_reopenable" }, 200);
    }

    const isReopenableSaleStatus = sale.status === "pendente_pagamento" || sale.status === "reservado";
    if (!isReopenableSaleStatus) {
      logPaymentTrace("info", "get-asaas-payment-link", "reopen_blocked_invalid_sale_status", {
        ...saleContext,
        reason: "sale_status_not_reopenable",
      });

      return jsonResponse({ url: null, reason: "sale_status_not_reopenable" }, 200);
    }

    if (!sale.asaas_payment_id) {
      logPaymentTrace("info", "get-asaas-payment-link", "reopen_blocked_missing_payment_id", {
        ...saleContext,
        reason: "missing_asaas_payment_id",
      });

      return jsonResponse({ url: null, reason: "missing_asaas_payment_id" }, 200);
    }

    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("asaas_api_key_production, asaas_api_key_sandbox")
      .eq("id", sale.company_id)
      .single();

    if (companyError || !company) {
      return jsonResponse({ error: "Company not found" }, 404);
    }

    const paymentContext = resolvePaymentContext(sale.payment_environment, {
      asaasApiKeyProduction: company.asaas_api_key_production,
      asaasApiKeySandbox: company.asaas_api_key_sandbox,
      asaasWalletIdProduction: null,
      asaasWalletIdSandbox: null,
    });

    if (!paymentContext.ok || !paymentContext.apiKey) {
      logPaymentTrace("error", "get-asaas-payment-link", "payment_context_unresolved", {
        ...saleContext,
        reason: "missing_company_asaas_api_key",
      });

      return jsonResponse({ url: null, reason: "missing_company_asaas_api_key" }, 200);
    }

    const asaasResponse = await fetch(`${paymentContext.baseUrl}/payments/${sale.asaas_payment_id}`, {
      headers: { access_token: paymentContext.apiKey },
    });

    if (!asaasResponse.ok) {
      logPaymentTrace("warning", "get-asaas-payment-link", "payment_fetch_failed", {
        ...saleContext,
        asaas_payment_id: sale.asaas_payment_id,
        http_status: asaasResponse.status,
        reason: "payment_fetch_failed",
      });

      return jsonResponse({ url: null, reason: "payment_fetch_failed" }, 200);
    }

    const paymentData = await asaasResponse.json();
    const invoiceUrl = typeof paymentData?.invoiceUrl === "string" ? paymentData.invoiceUrl : null;

    if (!invoiceUrl) {
      logPaymentTrace("warning", "get-asaas-payment-link", "reopen_url_missing_on_payment_payload", {
        ...saleContext,
        asaas_payment_id: sale.asaas_payment_id,
        reason: "missing_invoice_url",
        asaas_status: paymentData?.status ?? null,
      });
    }

    return jsonResponse({
      // Fonte de verdade: URL da cobrança já existente no Asaas para este payment_id.
      url: invoiceUrl,
      paymentStatus: paymentData?.status ?? null,
      billingType: paymentData?.billingType ?? null,
    }, 200);
  } catch (error) {
    logPaymentTrace("error", "get-asaas-payment-link", "unexpected_error", {
      error_message: error instanceof Error ? error.message : String(error),
    });

    return jsonResponse({
      error: error instanceof Error ? error.message : "Internal server error",
    }, 500);
  }
});
