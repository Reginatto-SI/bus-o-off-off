import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ASAAS_BASE_URL = Deno.env.get("ASAAS_ENV") === "production"
  ? "https://api.asaas.com/v3"
  : "https://sandbox.asaas.com/api/v3";

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
      .select("id, status, asaas_payment_id, company_id, unit_price, quantity, gross_amount")
      .eq("id", sale_id)
      .single();

    if (saleError || !sale) {
      return new Response(
        JSON.stringify({ error: "Sale not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (sale.status === "pago") {
      return new Response(
        JSON.stringify({ paymentStatus: "pago" }),
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
        JSON.stringify({ paymentStatus: "reservado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar empresa com asaas_api_key e dados de comissão em uma única query.
    // A cobrança é criada na conta Asaas da empresa, então a consulta de status
    // deve usar a API key da empresa para ler o pagamento corretamente.
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("asaas_api_key, platform_fee_percent, partner_split_percent")
      .eq("id", sale.company_id)
      .single();

    const PLATFORM_API_KEY = Deno.env.get("ASAAS_API_KEY");

    // Priorizar chave da empresa; fallback para chave global apenas para vendas legadas
    const apiKeyToUse = company?.asaas_api_key || PLATFORM_API_KEY;

    if (!apiKeyToUse) {
      return new Response(
        JSON.stringify({ paymentStatus: "reservado", detail: "Asaas API key not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!company?.asaas_api_key && PLATFORM_API_KEY) {
      console.warn(`[verify-payment-status] Empresa ${sale.company_id} sem asaas_api_key — usando chave global como fallback (venda legada?)`);
    }

    // Query Asaas for payment status
    let paymentData: any;
    try {
      const res = await fetch(`${ASAAS_BASE_URL}/payments/${sale.asaas_payment_id}`, {
        headers: { "access_token": apiKeyToUse },
      });

      if (!res.ok) {
        console.error("Asaas payment retrieve error:", await res.text());
        return new Response(
          JSON.stringify({ paymentStatus: "reservado", detail: "Could not verify with Asaas" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      paymentData = await res.json();
    } catch (err) {
      console.error("Asaas API error:", err);
      return new Response(
        JSON.stringify({ paymentStatus: "reservado", detail: "Could not verify with Asaas" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map Asaas status to internal status
    const asaasStatus = paymentData.status;

    if (asaasStatus === "CONFIRMED" || asaasStatus === "RECEIVED" || asaasStatus === "RECEIVED_IN_CASH") {
      // Payment confirmed — apply same logic as webhook
      const { error: updateError } = await supabaseAdmin
        .from("sales")
        .update({
          status: "pago",
          asaas_payment_status: asaasStatus,
        })
        .eq("id", sale_id)
        .eq("status", "reservado");

      if (updateError) {
        console.error("Error updating sale:", updateError);
        const { data: freshSale } = await supabaseAdmin
          .from("sales").select("status").eq("id", sale_id).single();
        return new Response(
          JSON.stringify({ paymentStatus: freshSale?.status || "reservado" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[verify-payment-status] Sale ${sale_id} marked as 'pago' via on-demand Asaas check`);

      // Calculate financial data using company data already fetched above
      if (company?.platform_fee_percent != null) {
        const platformFeePercent = Number(company.platform_fee_percent);
        const grossAmount = sale.gross_amount ?? (sale.unit_price * sale.quantity);
        const grossAmountCents = Math.round(grossAmount * 100);
        const platformFeeCents = Math.round(grossAmountCents * (platformFeePercent / 100));
        const platformFeeTotal = platformFeeCents / 100;

        const partnerSplitPercent = company?.partner_split_percent ?? 50;
        const { data: partner } = await supabaseAdmin
          .from("partners")
          .select("id, asaas_wallet_id, status")
          .eq("status", "ativo")
          .limit(1)
          .maybeSingle();

        let partnerFeeAmount = 0;
        let platformNetAmount = platformFeeTotal;

        if (partner?.asaas_wallet_id && partner.status === "ativo") {
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
        JSON.stringify({ paymentStatus: "pago" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (asaasStatus === "OVERDUE") {
      return new Response(
        JSON.stringify({ paymentStatus: "expirado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (asaasStatus === "PENDING" || asaasStatus === "AWAITING_RISK_ANALYSIS") {
      return new Response(
        JSON.stringify({ paymentStatus: "processando" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default
    return new Response(
      JSON.stringify({ paymentStatus: "reservado", asaas_status: asaasStatus }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[verify-payment-status] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
