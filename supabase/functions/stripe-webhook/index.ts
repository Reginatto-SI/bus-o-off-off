import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * IMPORTANTE: seller_id NÃO participa do fluxo Stripe/pagamento.
 * Vendedores são 100% gerenciais — controle interno de comissão manual e rastreamento via link de referência.
 * A comissão do vendedor é apurada e paga manualmente pelo gerente (Pix ou outro meio próprio).
 * O Stripe lida apenas com pagamento do cliente final e repasse ao parceiro (partners).
 */

/** Processa pagamento confirmado: marca venda como pago, calcula comissão da plataforma e faz transfer ao parceiro */
async function processPaymentConfirmed(
  supabaseAdmin: ReturnType<typeof createClient<any>>,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  connectedAccountId?: string
) {
  const saleId = session.metadata?.sale_id;
  if (!saleId) {
    console.error("No sale_id in session metadata");
    return;
  }

  // Update sale to 'pago'
  const { error: updateError } = await supabaseAdmin
    .from("sales")
    .update({
      status: "pago",
      stripe_payment_intent_id: (session.payment_intent as string) || null,
    })
    .eq("id", saleId)
    .eq("status", "reservado");

  if (updateError) {
    console.error("Error updating sale:", updateError);
    return;
  }

  console.log(`Sale ${saleId} marked as 'pago' (Direct Charge, account: ${connectedAccountId || 'unknown'})`);

  // ── Cálculo de comissão e repasse ao parceiro ──
  const { data: sale } = await supabaseAdmin
    .from("sales")
    .select("company_id, unit_price, quantity, gross_amount")
    .eq("id", saleId)
    .single();

  if (!sale) return;

  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("platform_fee_percent, partner_split_percent")
    .eq("id", sale.company_id)
    .single();

  const platformFeePercent = company?.platform_fee_percent ?? 7.5;
  const partnerSplitPercent = company?.partner_split_percent ?? 50;

  // gross_amount já inclui taxas adicionais do evento (calculadas pelo frontend no momento da venda)
  const grossAmount = sale.gross_amount ?? (sale.unit_price * sale.quantity);
  const platformFeeTotal = grossAmount * (platformFeePercent / 100);

  const { data: partner } = await supabaseAdmin
    .from("partners")
    .select("id, stripe_account_id, status")
    .eq("status", "ativo")
    .limit(1)
    .maybeSingle();

  let partnerFeeAmount = 0;
  let platformNetAmount = platformFeeTotal;
  let stripeTransferId: string | null = null;

  if (partner?.stripe_account_id && partner.status === "ativo") {
    partnerFeeAmount = platformFeeTotal * (partnerSplitPercent / 100);
    platformNetAmount = platformFeeTotal - partnerFeeAmount;

    const partnerFeeCents = Math.round(partnerFeeAmount * 100);

    if (partnerFeeCents > 0) {
      try {
        const transfer = await stripe.transfers.create({
          amount: partnerFeeCents,
          currency: "brl",
          destination: partner.stripe_account_id,
          description: `Comissão parceiro — Venda ${saleId}`,
          metadata: { sale_id: saleId },
        });
        stripeTransferId = transfer.id;
        console.log(`Transfer ${transfer.id} created for partner (R$ ${partnerFeeAmount.toFixed(2)})`);
      } catch (transferError) {
        console.error("Error creating partner transfer:", transferError);
        partnerFeeAmount = 0;
        platformNetAmount = platformFeeTotal;
      }
    }
  }

  await supabaseAdmin
    .from("sales")
    .update({
      gross_amount: grossAmount,
      platform_fee_total: platformFeeTotal,
      partner_fee_amount: partnerFeeAmount,
      platform_net_amount: platformNetAmount,
      stripe_transfer_id: stripeTransferId,
    })
    .eq("id", saleId);

  await supabaseAdmin.from("sale_logs").insert({
    sale_id: saleId,
    action: "payment_confirmed",
    description: `Pagamento confirmado via Stripe Direct Charge (account: ${connectedAccountId || 'unknown'}, PI: ${session.payment_intent || 'pix'}). Comissão: R$ ${platformFeeTotal.toFixed(2)} (${platformFeePercent}%). Parceiro: R$ ${partnerFeeAmount.toFixed(2)}.`,
    company_id: sale.company_id,
  });
}

/** Processa falha de pagamento assíncrono (Pix expirado): cancela venda e libera assentos */
async function processAsyncPaymentFailed(
  supabaseAdmin: ReturnType<typeof createClient<any>>,
  session: Stripe.Checkout.Session,
  connectedAccountId?: string
) {
  const saleId = session.metadata?.sale_id;
  if (!saleId) {
    console.error("No sale_id in session metadata for async_payment_failed");
    return;
  }

  const { error: updateError } = await supabaseAdmin
    .from("sales")
    .update({
      status: "cancelado",
      cancel_reason: "Pagamento Pix expirado ou falhou",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", saleId)
    .eq("status", "reservado");

  if (updateError) {
    console.error("Error cancelling sale:", updateError);
    return;
  }

  console.log(`Sale ${saleId} cancelled due to async payment failure (account: ${connectedAccountId || 'unknown'})`);

  const { error: deleteError } = await supabaseAdmin
    .from("tickets")
    .delete()
    .eq("sale_id", saleId);

  if (deleteError) {
    console.error("Error deleting tickets:", deleteError);
  }

  const { data: sale } = await supabaseAdmin
    .from("sales")
    .select("company_id")
    .eq("id", saleId)
    .single();

  if (sale) {
    await supabaseAdmin.from("sale_logs").insert({
      sale_id: saleId,
      action: "payment_failed",
      description: `Pagamento assíncrono (Pix) falhou ou expirou (account: ${connectedAccountId || 'unknown'}). Venda cancelada e assentos liberados.`,
      company_id: sale.company_id,
    });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    let event: Stripe.Event;

    if (webhookSecret && signature) {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } else {
      console.warn("STRIPE_WEBHOOK_SECRET not set — skipping signature verification");
      event = JSON.parse(body) as Stripe.Event;
    }

    // Em Direct Charge com Connect Webhooks, event.account identifica a conta conectada
    const connectedAccountId = (event as any).account as string | undefined;
    console.log(`Webhook event: ${event.type}, account: ${connectedAccountId || 'platform'}`);

    const supabaseAdmin = createClient<any>(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.payment_status === "paid") {
        await processPaymentConfirmed(supabaseAdmin, stripe, session, connectedAccountId);
      } else {
        console.log(`Sale ${session.metadata?.sale_id} — checkout completed but payment_status=${session.payment_status}. Awaiting async payment.`);
      }
    } else if (event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log(`Async payment succeeded for sale ${session.metadata?.sale_id}`);
      await processPaymentConfirmed(supabaseAdmin, stripe, session, connectedAccountId);
    } else if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log(`Async payment failed for sale ${session.metadata?.sale_id}`);
      await processAsyncPaymentFailed(supabaseAdmin, session, connectedAccountId);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Webhook processing failed" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
