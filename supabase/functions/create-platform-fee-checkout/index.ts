import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logPaymentTrace } from "../_shared/payment-observability.ts";
import { resolvePaymentContext } from "../_shared/payment-context-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Cobra a taxa da plataforma em vendas manuais/conversão de reserva via Asaas.
 * Usa o payment_environment salvo na venda (nunca recalcula por host).
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sale_id } = await req.json();
    if (!sale_id) {
      return new Response(JSON.stringify({ error: "sale_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: sale, error: saleError } = await supabaseAdmin
      .from("sales")
      .select("*, event:events(name)")
      .eq("id", sale_id)
      .single();

    if (saleError || !sale) {
      return new Response(JSON.stringify({ error: "Venda não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (sale.platform_fee_status !== "pending") {
      return new Response(
        JSON.stringify({ error: `Taxa não está pendente (status atual: ${sale.platform_fee_status})` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const feeAmount = Number(sale.platform_fee_amount);
    if (!feeAmount || feeAmount <= 0) {
      return new Response(
        JSON.stringify({ error: "Valor da taxa inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Asaas exige mínimo de R$ 5,00 para billingType UNDEFINED.
    const ASAAS_MIN_CHARGE = 5.0;
    if (feeAmount < ASAAS_MIN_CHARGE) {
      await supabaseAdmin
        .from("sales")
        .update({
          platform_fee_status: "waived",
          platform_fee_paid_at: null,
        })
        .eq("id", sale.id);

      await supabaseAdmin.from("sale_logs").insert({
        sale_id: sale.id,
        action: "platform_fee_waived",
        description: `Taxa da plataforma (R$ ${feeAmount.toFixed(2)}) abaixo do mínimo Asaas (R$ ${ASAAS_MIN_CHARGE.toFixed(2)}). Taxa marcada como dispensada.`,
        company_id: sale.company_id,
      });

      return new Response(
        JSON.stringify({ waived: true, message: "Taxa dispensada (abaixo do mínimo do gateway)" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const paymentContext = resolvePaymentContext({
      mode: "platform_fee",
      sale,
    });

    logPaymentTrace("info", "create-platform-fee-checkout", "payment_context_loaded", {
      sale_id: sale.id,
      company_id: sale.company_id,
      payment_environment: paymentContext.environment,
      payment_owner_type: paymentContext.ownerType,
      asaas_base_url: paymentContext.baseUrl,
      api_key_source: paymentContext.apiKeySource,
      split_policy: paymentContext.splitPolicy.type,
      decision_trace: paymentContext.decisionTrace,
    });

    console.log("[create-platform-fee-checkout] Ambiente da venda", {
      sale_id: sale.id,
      sale_environment: paymentContext.environment,
      asaas_base_url: paymentContext.baseUrl,
      api_key_source: paymentContext.apiKeySource,
    });

    const PLATFORM_API_KEY = paymentContext.apiKey;
    if (!PLATFORM_API_KEY) {
      return new Response(JSON.stringify({ error: `Asaas API key not configured (${paymentContext.apiKeySource})` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get or create customer for the company admin
    const { data: companyData } = await supabaseAdmin
      .from("companies")
      .select("name, document_number, cnpj, email")
      .eq("id", sale.company_id)
      .single();

    const companyDoc = (companyData?.document_number || companyData?.cnpj || "").replace(/\D/g, "");
    const companyName = companyData?.name || "Empresa";

    let customerId: string | null = null;

    if (companyDoc) {
      const searchRes = await fetch(
        `${paymentContext.baseUrl}/customers?cpfCnpj=${companyDoc}`,
        { headers: { "access_token": PLATFORM_API_KEY } }
      );
      const searchData = await searchRes.json();
      if (searchData?.data?.length > 0) {
        customerId = searchData.data[0].id;
      }
    }

    if (!customerId) {
      const createRes = await fetch(`${paymentContext.baseUrl}/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "access_token": PLATFORM_API_KEY,
        },
        body: JSON.stringify({
          name: companyName,
          cpfCnpj: companyDoc || undefined,
          email: companyData?.email || undefined,
          externalReference: `company_${sale.company_id}`,
        }),
      });
      const customerData = await createRes.json();
      if (!createRes.ok) {
        return new Response(
          JSON.stringify({ error: customerData?.errors?.[0]?.description || "Erro ao criar cliente no Asaas" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      customerId = customerData.id;
    }

    // Create payment for the platform fee
    const eventName = sale.event?.name || "Evento";
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);

    const paymentRes = await fetch(`${paymentContext.baseUrl}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access_token": PLATFORM_API_KEY,
      },
      body: JSON.stringify({
        customer: customerId,
        billingType: "UNDEFINED",
        value: feeAmount,
        dueDate: dueDate.toISOString().split("T")[0],
        description: `Taxa da Plataforma — Venda Manual "${eventName}" (${sale.quantity} passagem(ns))`,
        externalReference: `platform_fee_${sale.id}`,
      }),
    });

    const paymentData = await paymentRes.json();

    if (!paymentRes.ok) {
      return new Response(
        JSON.stringify({ error: paymentData?.errors?.[0]?.description || "Erro ao criar cobrança no Asaas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabaseAdmin
      .from("sales")
      .update({ platform_fee_payment_id: paymentData.id })
      .eq("id", sale.id);

    await supabaseAdmin.from("sale_logs").insert({
      sale_id: sale.id,
      action: "platform_fee_checkout_created",
      description: `Cobrança da taxa da plataforma criada no Asaas (R$ ${feeAmount.toFixed(2)}). Payment: ${paymentData.id}`,
      company_id: sale.company_id,
    });

    return new Response(
      JSON.stringify({ url: paymentData.invoiceUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    logPaymentTrace("error", "create-platform-fee-checkout", "unexpected_error", {
      error_message: error instanceof Error ? error.message : String(error),
    });
    console.error("Error in create-platform-fee-checkout:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
