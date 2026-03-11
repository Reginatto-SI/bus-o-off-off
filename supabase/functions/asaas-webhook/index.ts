import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Webhook do Asaas para processar notificações de pagamento.
 * Eventos processados:
 * - PAYMENT_CONFIRMED / PAYMENT_RECEIVED → marca venda como pago + gera tickets
 * - PAYMENT_OVERDUE / PAYMENT_DELETED / PAYMENT_REFUNDED → cancela venda + libera locks
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate webhook token
    const webhookToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
    if (webhookToken) {
      const receivedToken = req.headers.get("asaas-access-token") || req.headers.get("x-asaas-webhook-token");
      if (receivedToken !== webhookToken) {
        console.warn("Invalid webhook token received");
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json();
    const eventType = body.event;
    const payment = body.payment;

    if (!eventType || !payment) {
      return new Response(JSON.stringify({ received: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Asaas webhook: ${eventType}, payment: ${payment.id}, externalRef: ${payment.externalReference}`);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const saleId = payment.externalReference;
    if (!saleId) {
      console.log("No externalReference in payment, checking metadata...");
      if (payment.description?.includes("Taxa da Plataforma")) {
        console.log("Platform fee payment event, skipping (handled by platform fee flow)");
      }
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle payment confirmed/received
    if (eventType === "PAYMENT_CONFIRMED" || eventType === "PAYMENT_RECEIVED") {
      await processPaymentConfirmed(supabaseAdmin, saleId, payment);
    }

    // Handle payment failed/overdue/deleted/refunded
    if (eventType === "PAYMENT_OVERDUE" || eventType === "PAYMENT_DELETED" || eventType === "PAYMENT_REFUNDED") {
      await processPaymentFailed(supabaseAdmin, saleId, payment, eventType);
    }

    // Update payment status on the sale regardless
    await supabaseAdmin
      .from("sales")
      .update({ asaas_payment_status: payment.status })
      .eq("id", saleId);

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Asaas webhook error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Webhook processing failed" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processPaymentConfirmed(
  supabaseAdmin: ReturnType<typeof createClient<any>>,
  saleId: string,
  payment: any
) {
  // Accept both pendente_pagamento and reservado (admin flow backward compat)
  const { data: updatedSale, error: updateError } = await supabaseAdmin
    .from("sales")
    .update({
      status: "pago",
      asaas_payment_status: payment.status,
    })
    .eq("id", saleId)
    .in("status", ["pendente_pagamento", "reservado"])
    .select("id, company_id, unit_price, quantity, gross_amount, event_id, trip_id, boarding_location_id")
    .single();

  if (updateError || !updatedSale) {
    console.error("Error updating sale (may already be pago):", updateError);
    return;
  }

  console.log(`Sale ${saleId} marked as 'pago' via Asaas webhook`);

  // Generate tickets from sale_passengers if they exist (new flow)
  await createTicketsFromPassengers(supabaseAdmin, saleId, updatedSale.company_id);

  // Release seat locks for this sale
  await supabaseAdmin.from("seat_locks").delete().eq("sale_id", saleId);

  // Calculate financial data
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("platform_fee_percent, partner_split_percent")
    .eq("id", updatedSale.company_id)
    .single();

  if (company?.platform_fee_percent == null) {
    console.error(`Company ${updatedSale.company_id} missing platform_fee_percent`);
    return;
  }

  const platformFeePercent = Number(company.platform_fee_percent);
  const grossAmount = updatedSale.gross_amount ?? (updatedSale.unit_price * updatedSale.quantity);
  const grossAmountCents = Math.round(grossAmount * 100);
  const platformFeeCents = Math.round(grossAmountCents * (platformFeePercent / 100));
  const platformFeeTotal = platformFeeCents / 100;

  // Partner split (if applicable)
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
    .eq("id", saleId);

  await supabaseAdmin.from("sale_logs").insert({
    sale_id: saleId,
    action: "payment_confirmed",
    description: `Pagamento confirmado via Asaas (Payment: ${payment.id}, billingType: ${payment.billingType || 'unknown'}). Comissão: R$ ${platformFeeTotal.toFixed(2)} (${platformFeePercent}%). Parceiro: R$ ${partnerFeeAmount.toFixed(2)}.`,
    company_id: updatedSale.company_id,
  });
}

/**
 * Creates tickets from sale_passengers staging table (new public checkout flow).
 * If no sale_passengers exist (admin/legacy flow), does nothing.
 */
async function createTicketsFromPassengers(
  supabaseAdmin: ReturnType<typeof createClient<any>>,
  saleId: string,
  companyId: string
) {
  // Check if tickets already exist for this sale (idempotency)
  const { count: existingTickets } = await supabaseAdmin
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("sale_id", saleId);

  if (existingTickets && existingTickets > 0) {
    console.log(`Tickets already exist for sale ${saleId}, skipping creation`);
    return;
  }

  // Fetch passenger data from staging table
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

  // Create tickets from passenger data
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
    console.error("Error creating tickets from passengers:", ticketError);
    return;
  }

  console.log(`Created ${ticketInserts.length} tickets for sale ${saleId} from sale_passengers`);

  // Clean up staging data
  await supabaseAdmin.from("sale_passengers").delete().eq("sale_id", saleId);
}

async function processPaymentFailed(
  supabaseAdmin: ReturnType<typeof createClient<any>>,
  saleId: string,
  payment: any,
  eventType: string
) {
  // Accept both pendente_pagamento and reservado for cancellation
  const { error: updateError } = await supabaseAdmin
    .from("sales")
    .update({
      status: "cancelado",
      cancel_reason: `Pagamento ${eventType.toLowerCase().replace('payment_', '')} via Asaas`,
      cancelled_at: new Date().toISOString(),
      asaas_payment_status: payment.status,
    })
    .eq("id", saleId)
    .in("status", ["pendente_pagamento", "reservado"]);

  if (updateError) {
    console.error("Error cancelling sale:", updateError);
    return;
  }

  console.log(`Sale ${saleId} cancelled due to ${eventType}`);

  // Delete tickets to release seats (if any exist from legacy flow)
  await supabaseAdmin.from("tickets").delete().eq("sale_id", saleId);

  // Delete seat locks
  await supabaseAdmin.from("seat_locks").delete().eq("sale_id", saleId);

  // Clean up staging data
  await supabaseAdmin.from("sale_passengers").delete().eq("sale_id", saleId);

  const { data: sale } = await supabaseAdmin
    .from("sales")
    .select("company_id")
    .eq("id", saleId)
    .single();

  if (sale) {
    await supabaseAdmin.from("sale_logs").insert({
      sale_id: saleId,
      action: "payment_failed",
      description: `Pagamento ${eventType} via Asaas (Payment: ${payment.id}). Venda cancelada e assentos liberados.`,
      company_id: sale.company_id,
    });
  }
}
