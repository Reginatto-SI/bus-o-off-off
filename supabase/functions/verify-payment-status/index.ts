import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getAsaasBaseUrl,
  getAsaasPlatformApiKeySecretName,
  resolvePaymentEnvironment,
} from "../_shared/runtime-env.ts";

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

  // Em fallback, usamos o instante de sincronização para não deixar pagamento pago sem lastro temporal.
  return new Date().toISOString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const runtimeEnv = resolvePaymentEnvironment(req);
    if (runtimeEnv.blocked) {
      return new Response(JSON.stringify({ error: runtimeEnv.blockReason }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const asaasBaseUrl = getAsaasBaseUrl(runtimeEnv.resolved_env);

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
      .select("id, status, asaas_payment_id, company_id, unit_price, quantity, gross_amount, payment_confirmed_at, platform_fee_paid_at")
      .eq("id", sale_id)
      .single();

    if (saleError || !sale) {
      return new Response(
        JSON.stringify({ error: "Sale not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (sale.status === "pago") {
      const { data: paidSale } = await supabaseAdmin
        .from("sales")
        .select("payment_confirmed_at, platform_fee_paid_at, asaas_payment_id")
        .eq("id", sale_id)
        .single();

      return new Response(
        JSON.stringify({
          paymentStatus: "pago",
          paymentConfirmedAt: paidSale?.payment_confirmed_at ?? ((!paidSale?.asaas_payment_id) ? paidSale?.platform_fee_paid_at : null),
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

    // Buscar empresa com asaas_api_key e dados de comissão
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("asaas_api_key, platform_fee_percent, partner_split_percent")
      .eq("id", sale.company_id)
      .single();

    // Em modo downgrade (sandbox), a cobrança foi criada com a chave da plataforma sandbox,
    // então devemos usar essa mesma chave para consultar o pagamento.
    const platformApiKeySecretName = getAsaasPlatformApiKeySecretName(runtimeEnv.resolved_env);
    const PLATFORM_API_KEY = Deno.env.get(platformApiKeySecretName);

    let apiKeyToUse: string | null;
    if (runtimeEnv.downgraded) {
      console.log("[verify-payment-status] Downgrade ativo: usando chave da plataforma sandbox", {
        sale_id: sale.id,
        company_id: sale.company_id,
      });
      apiKeyToUse = PLATFORM_API_KEY ?? null;
    } else {
      // Em produção, tenta a chave da empresa; fallback para a chave da plataforma
      // para cobranças legadas criadas antes da migração para credenciais por empresa.
      apiKeyToUse = company?.asaas_api_key || PLATFORM_API_KEY || null;
    }

    console.log("[verify-payment-status] Asaas runtime resolved", {
      resolved_env: runtimeEnv.resolved_env,
      request_host: runtimeEnv.host,
      selected_base_url: asaasBaseUrl,
      selected_key_source: runtimeEnv.downgraded ? "platform_sandbox_key" : (company?.asaas_api_key ? "company.asaas_api_key" : "platform_fallback"),
    });

    if (!apiKeyToUse) {
      return new Response(
        JSON.stringify({ paymentStatus: sale.status, detail: "Asaas API key not available" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Query Asaas for payment status
    let paymentData: any;
    try {
      const res = await fetch(`${asaasBaseUrl}/payments/${sale.asaas_payment_id}`, {
        headers: { "access_token": apiKeyToUse },
      });

      if (!res.ok) {
        console.error("Asaas payment retrieve error:", await res.text());
        return new Response(
          JSON.stringify({ paymentStatus: sale.status, detail: "Could not verify with Asaas" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      paymentData = await res.json();
    } catch (err) {
      console.error("Asaas API error:", err);
      return new Response(
        JSON.stringify({ paymentStatus: sale.status, detail: "Could not verify with Asaas" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const asaasStatus = paymentData.status;

    if (asaasStatus === "CONFIRMED" || asaasStatus === "RECEIVED" || asaasStatus === "RECEIVED_IN_CASH") {
      const confirmedAt = resolveAsaasConfirmedAtFromPayment(paymentData);
      // Payment confirmed — accept both pendente_pagamento and reservado
      const { error: updateError } = await supabaseAdmin
        .from("sales")
        .update({
          status: "pago",
          asaas_payment_status: asaasStatus,
          payment_confirmed_at: confirmedAt,
        })
        .eq("id", sale_id)
        .in("status", ["pendente_pagamento", "reservado"]);

      if (updateError) {
        console.error("Error updating sale:", updateError);
        const { data: freshSale } = await supabaseAdmin
          .from("sales").select("status").eq("id", sale_id).single();
        return new Response(
          JSON.stringify({ paymentStatus: freshSale?.status || sale.status }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[verify-payment-status] Sale ${sale_id} marked as 'pago'`);

      // Create tickets from sale_passengers (same logic as webhook)
      await createTicketsFromPassengers(supabaseAdmin, sale_id, sale.company_id);

      // Release seat locks
      await supabaseAdmin.from("seat_locks").delete().eq("sale_id", sale_id);

      // Calculate financial data
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

      const { data: paidSaleAfterUpdate } = await supabaseAdmin
        .from("sales")
        .select("payment_confirmed_at, platform_fee_paid_at, asaas_payment_id")
        .eq("id", sale_id)
        .single();

      return new Response(
        JSON.stringify({
          paymentStatus: "pago",
          paymentConfirmedAt: paidSaleAfterUpdate?.payment_confirmed_at ?? ((!paidSaleAfterUpdate?.asaas_payment_id) ? paidSaleAfterUpdate?.platform_fee_paid_at : null),
        }),
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

    return new Response(
      JSON.stringify({ paymentStatus: sale.status, asaas_status: asaasStatus }),
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

/**
 * Creates tickets from sale_passengers staging table.
 * Same logic as asaas-webhook to ensure consistency.
 */
async function createTicketsFromPassengers(
  supabaseAdmin: ReturnType<typeof createClient<any>>,
  saleId: string,
  companyId: string
) {
  // Idempotency: skip if tickets already exist
  const { count: existingTickets } = await supabaseAdmin
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("sale_id", saleId);

  if (existingTickets && existingTickets > 0) {
    console.log(`Tickets already exist for sale ${saleId}, skipping`);
    return;
  }

  const { data: passengers, error: passError } = await supabaseAdmin
    .from("sale_passengers")
    .select("*")
    .eq("sale_id", saleId)
    .order("sort_order");

  if (passError) {
    console.error("Error fetching sale_passengers:", passError);
    return;
  }

  if (!passengers || passengers.length === 0) {
    console.log(`No sale_passengers for sale ${saleId} (legacy/admin flow)`);
    return;
  }

  const ticketInserts = passengers.map((p: any) => ({
    sale_id: saleId,
    trip_id: p.trip_id,
    seat_id: p.seat_id,
    seat_label: p.seat_label,
    passenger_name: p.passenger_name,
    passenger_cpf: p.passenger_cpf,
    passenger_phone: p.passenger_phone,
    company_id: companyId,
  }));

  const { error: ticketError } = await supabaseAdmin
    .from("tickets")
    .insert(ticketInserts);

  if (ticketError) {
    console.error("Error creating tickets:", ticketError);
    return;
  }

  console.log(`Created ${ticketInserts.length} tickets for sale ${saleId} via verify-payment-status`);

  // Clean up staging data
  await supabaseAdmin.from("sale_passengers").delete().eq("sale_id", saleId);
}
