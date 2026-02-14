import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const saleId = session.metadata?.sale_id;

      if (!saleId) {
        console.error("No sale_id in session metadata");
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update sale to 'pago'
      const { error: updateError } = await supabaseAdmin
        .from("sales")
        .update({
          status: "pago",
          stripe_payment_intent_id: session.payment_intent as string,
        })
        .eq("id", saleId)
        .eq("status", "reservado");

      if (updateError) {
        console.error("Error updating sale:", updateError);
      } else {
        console.log(`Sale ${saleId} marked as 'pago'`);
      }

      // ── Cálculo de comissão e repasse ao parceiro ──
      // 1. Buscar dados completos da venda
      const { data: sale } = await supabaseAdmin
        .from("sales")
        .select("company_id, unit_price, quantity")
        .eq("id", saleId)
        .single();

      if (sale) {
        // 2. Buscar taxa da plataforma e split do parceiro na empresa
        const { data: company } = await supabaseAdmin
          .from("companies")
          .select("platform_fee_percent, partner_split_percent")
          .eq("id", sale.company_id)
          .single();

        const platformFeePercent = company?.platform_fee_percent ?? 7.5;
        const partnerSplitPercent = company?.partner_split_percent ?? 50;

        // 3. Calcular valores financeiros
        const grossAmount = sale.unit_price * sale.quantity;
        const platformFeeTotal = grossAmount * (platformFeePercent / 100);

        // 4. Buscar parceiro ativo com conta Stripe
        const { data: partner } = await supabaseAdmin
          .from("partners")
          .select("id, stripe_account_id, status")
          .eq("status", "ativo")
          .limit(1)
          .maybeSingle();

        let partnerFeeAmount = 0;
        let platformNetAmount = platformFeeTotal;
        let stripeTransferId: string | null = null;

        // 5. Se parceiro ativo com conta Stripe, calcular split e fazer transfer
        if (partner?.stripe_account_id && partner.status === "ativo") {
          partnerFeeAmount = platformFeeTotal * (partnerSplitPercent / 100);
          platformNetAmount = platformFeeTotal - partnerFeeAmount;

          // Converter para centavos para o Stripe Transfer
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
              // Logar erro mas não falhar o webhook
              console.error("Error creating partner transfer:", transferError);
              // Se transfer falhar, toda a comissão fica na plataforma
              partnerFeeAmount = 0;
              platformNetAmount = platformFeeTotal;
            }
          }
        }

        // 6. Registrar dados financeiros na venda
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

        // 7. Log da confirmação de pagamento
        await supabaseAdmin.from("sale_logs").insert({
          sale_id: saleId,
          action: "payment_confirmed",
          description: `Pagamento confirmado via Stripe (PI: ${session.payment_intent}). Comissão: R$ ${platformFeeTotal.toFixed(2)} (${platformFeePercent}%). Parceiro: R$ ${partnerFeeAmount.toFixed(2)}.`,
          company_id: sale.company_id,
        });
      }
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
