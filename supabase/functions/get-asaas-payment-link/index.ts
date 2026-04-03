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

type AsaasPaymentSummary = {
  id?: string;
  invoiceUrl?: string | null;
  status?: string | null;
  billingType?: string | null;
  externalReference?: string | null;
};

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
      has_asaas_payment_id: Boolean(sale.asaas_payment_id),
    };

    logPaymentTrace("info", "get-asaas-payment-link", "reopen_requested", saleContext);

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

    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("asaas_api_key_production, asaas_api_key_sandbox")
      .eq("id", sale.company_id)
      .single();

    if (companyError || !company) {
      return jsonResponse({ error: "Company not found" }, 404);
    }

    let paymentContext;
    try {
      paymentContext = resolvePaymentContext({
        mode: "verify",
        sale: { payment_environment: sale.payment_environment },
        company: {
          asaas_api_key_production: company.asaas_api_key_production,
          asaas_api_key_sandbox: company.asaas_api_key_sandbox,
        },
      });
    } catch (contextError) {
      logPaymentTrace("error", "get-asaas-payment-link", "payment_context_unresolved", {
        ...saleContext,
        reason: "payment_environment_unresolved",
        error_message: contextError instanceof Error ? contextError.message : String(contextError),
      });
      return jsonResponse({ url: null, reason: "payment_environment_unresolved" }, 200);
    }

    if (!paymentContext.apiKey) {
      logPaymentTrace("error", "get-asaas-payment-link", "payment_context_unresolved", {
        ...saleContext,
        reason: "missing_company_asaas_api_key",
      });

      return jsonResponse({ url: null, reason: "missing_company_asaas_api_key" }, 200);
    }

    let resolvedPayment: AsaasPaymentSummary | null = null;
    let resolvedPaymentId: string | null = null;
    let reopenStrategy: "by_payment_id" | "by_external_reference" = "by_payment_id";

    if (sale.asaas_payment_id) {
      // Caminho principal: cobrança já vinculada por payment_id.
      const asaasResponse = await fetch(`${paymentContext.baseUrl}/payments/${sale.asaas_payment_id}`, {
        headers: { access_token: paymentContext.apiKey },
      });

      if (!asaasResponse.ok) {
        const reason = asaasResponse.status === 404
          ? "payment_not_found_on_gateway"
          : "payment_fetch_failed";
        logPaymentTrace("warning", "get-asaas-payment-link", "payment_fetch_failed", {
          ...saleContext,
          asaas_payment_id: sale.asaas_payment_id,
          http_status: asaasResponse.status,
          reason,
        });

        return jsonResponse({ url: null, reason }, 200);
      }

      const paymentData = await asaasResponse.json();
      resolvedPayment = paymentData as AsaasPaymentSummary;
      resolvedPaymentId = typeof resolvedPayment?.id === "string" ? resolvedPayment.id : sale.asaas_payment_id;
    } else {
      // Fallback legado: busca determinística por externalReference oficial (sale.id).
      reopenStrategy = "by_external_reference";
      logPaymentTrace("info", "get-asaas-payment-link", "legacy_fallback_started", {
        ...saleContext,
        fallback_external_reference: sale.id,
      });

      const searchResponse = await fetch(
        `${paymentContext.baseUrl}/payments?externalReference=${encodeURIComponent(sale.id)}&limit=10`,
        { headers: { access_token: paymentContext.apiKey } },
      );

      if (!searchResponse.ok) {
        logPaymentTrace("warning", "get-asaas-payment-link", "legacy_fallback_search_failed", {
          ...saleContext,
          http_status: searchResponse.status,
          reason: "payment_search_failed",
        });
        return jsonResponse({ url: null, reason: "payment_search_failed" }, 200);
      }

      const searchData = await searchResponse.json();
      const payments = Array.isArray(searchData?.data)
        ? (searchData.data as AsaasPaymentSummary[])
        : [];
      const strictMatches = payments.filter((payment) =>
        typeof payment?.id === "string" && payment.externalReference === sale.id
      );

      if (strictMatches.length === 0) {
        logPaymentTrace("info", "get-asaas-payment-link", "legacy_fallback_not_found", {
          ...saleContext,
          reason: "no_payment_found_by_external_reference",
          candidate_count: payments.length,
        });
        return jsonResponse({ url: null, reason: "no_payment_found_by_external_reference" }, 200);
      }

      if (strictMatches.length > 1) {
        logPaymentTrace("warning", "get-asaas-payment-link", "legacy_fallback_ambiguous", {
          ...saleContext,
          reason: "multiple_payments_for_external_reference",
          candidate_count: strictMatches.length,
        });
        return jsonResponse({ url: null, reason: "multiple_payments_for_external_reference" }, 200);
      }

      resolvedPayment = strictMatches[0];
      resolvedPaymentId = resolvedPayment.id ?? null;

      if (!resolvedPaymentId) {
        logPaymentTrace("warning", "get-asaas-payment-link", "legacy_fallback_missing_payment_id", {
          ...saleContext,
          reason: "payment_missing_id_in_gateway_payload",
        });
        return jsonResponse({ url: null, reason: "payment_missing_id_in_gateway_payload" }, 200);
      }

      // Persistência defensiva: só vincula id recuperado quando a venda ainda está sem asaas_payment_id.
      const { error: persistError } = await supabaseAdmin
        .from("sales")
        .update({
          asaas_payment_id: resolvedPaymentId,
          asaas_payment_status: resolvedPayment?.status ?? null,
        })
        .eq("id", sale.id)
        .is("asaas_payment_id", null);

      if (persistError) {
        logPaymentTrace("warning", "get-asaas-payment-link", "legacy_fallback_persist_failed", {
          ...saleContext,
          reason: "legacy_payment_id_persist_failed",
          recovered_asaas_payment_id: resolvedPaymentId,
          error_message: persistError.message,
        });
      } else {
        logPaymentTrace("info", "get-asaas-payment-link", "legacy_fallback_persisted_payment_id", {
          ...saleContext,
          reason: "legacy_payment_id_persisted",
          recovered_asaas_payment_id: resolvedPaymentId,
        });
      }
    }

    const invoiceUrl = typeof resolvedPayment?.invoiceUrl === "string" ? resolvedPayment.invoiceUrl : null;
    if (!invoiceUrl) {
      logPaymentTrace("warning", "get-asaas-payment-link", "reopen_url_missing_on_payment_payload", {
        ...saleContext,
        asaas_payment_id: resolvedPaymentId,
        reason: "missing_invoice_url",
        asaas_status: resolvedPayment?.status ?? null,
        reopen_strategy: reopenStrategy,
      });
    }

    logPaymentTrace("info", "get-asaas-payment-link", "reopen_resolved", {
      ...saleContext,
      asaas_payment_id: resolvedPaymentId,
      has_invoice_url: Boolean(invoiceUrl),
      asaas_status: resolvedPayment?.status ?? null,
      reopen_strategy: reopenStrategy,
    });

    return jsonResponse({
      // Fonte de verdade: URL da cobrança existente no Asaas (payment_id direto ou fallback por externalReference).
      url: invoiceUrl,
      reason: invoiceUrl ? null : "missing_invoice_url",
      paymentStatus: resolvedPayment?.status ?? null,
      billingType: resolvedPayment?.billingType ?? null,
      asaasPaymentId: resolvedPaymentId,
      reopenStrategy,
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
