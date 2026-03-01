import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Edge function pública para verificar o status real de pagamento no Stripe.
 * Resolve o problema de vendas que ficam "reservado" quando o webhook falha ou demora.
 * Reutiliza a mesma lógica financeira do webhook (comissão + transfer) para consistência.
 */
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

    // 1. Buscar a venda com checkout session id
    const { data: sale, error: saleError } = await supabaseAdmin
      .from("sales")
      .select("id, status, stripe_checkout_session_id, company_id, unit_price, quantity, gross_amount")
      .eq("id", sale_id)
      .single();

    if (saleError || !sale) {
      return new Response(
        JSON.stringify({ error: "Sale not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Se já está pago, retorna direto sem consultar Stripe
    if (sale.status === "pago") {
      return new Response(
        JSON.stringify({ paymentStatus: "pago" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Se cancelado, retorna direto
    if (sale.status === "cancelado") {
      return new Response(
        JSON.stringify({ paymentStatus: "cancelado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sem checkout session, não há como verificar no Stripe
    if (!sale.stripe_checkout_session_id) {
      return new Response(
        JSON.stringify({ paymentStatus: "reservado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Buscar empresa para obter stripe_account_id (Direct Charge)
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("stripe_account_id, platform_fee_percent, partner_split_percent")
      .eq("id", sale.company_id)
      .single();

    if (!company?.stripe_account_id) {
      return new Response(
        JSON.stringify({ paymentStatus: "reservado", detail: "Company has no Stripe account" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Consultar Checkout Session no Stripe (conta conectada)
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.retrieve(
        sale.stripe_checkout_session_id,
        { stripeAccount: company.stripe_account_id }
      );
    } catch (stripeErr: any) {
      console.error("Stripe session retrieve error:", stripeErr);
      return new Response(
        JSON.stringify({ paymentStatus: "reservado", detail: "Could not verify with Stripe" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Mapear status do Stripe para status interno
    if (session.payment_status === "paid" || session.payment_status === "no_payment_required") {
      // Pagamento confirmado — aplicar mesma lógica do webhook
      const { error: updateError } = await supabaseAdmin
        .from("sales")
        .update({
          status: "pago",
          stripe_payment_intent_id: (session.payment_intent as string) || null,
        })
        .eq("id", sale_id)
        .eq("status", "reservado"); // Guard de idempotência

      if (updateError) {
        console.error("Error updating sale:", updateError);
        // Se falhou o update, pode ser que já foi atualizado por outra instância
        const { data: freshSale } = await supabaseAdmin
          .from("sales").select("status").eq("id", sale_id).single();
        return new Response(
          JSON.stringify({ paymentStatus: freshSale?.status || "reservado" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[verify-payment-status] Sale ${sale_id} marked as 'pago' via on-demand check`);

      // Regra oficial atual: taxa da plataforma fixa em 6% para vendas online.
      // Mantemos esse valor aqui para manter o financeiro consistente com checkout/admin/ticket.
      const platformFeePercent = 6;
      const partnerSplitPercent = company.partner_split_percent ?? 50;
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
              description: `Comissão parceiro — Venda ${sale_id} (verify-payment-status)`,
              metadata: { sale_id },
            });
            stripeTransferId = transfer.id;
            console.log(`[verify-payment-status] Transfer ${transfer.id} created (R$ ${partnerFeeAmount.toFixed(2)})`);
          } catch (transferError) {
            console.error("[verify-payment-status] Error creating partner transfer:", transferError);
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
        .eq("id", sale_id);

      await supabaseAdmin.from("sale_logs").insert({
        sale_id,
        action: "payment_confirmed",
        description: `Pagamento confirmado via verify-payment-status (on-demand). Comissão: R$ ${platformFeeTotal.toFixed(2)} (${platformFeePercent}%). Parceiro: R$ ${partnerFeeAmount.toFixed(2)}.`,
        company_id: sale.company_id,
      });

      return new Response(
        JSON.stringify({ paymentStatus: "pago" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Session ainda não paga — verificar se expirou
    if (session.status === "expired") {
      return new Response(
        JSON.stringify({ paymentStatus: "expirado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pagamento em processamento (ex: cartão aguardando confirmação)
    return new Response(
      JSON.stringify({ paymentStatus: "processando" }),
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
