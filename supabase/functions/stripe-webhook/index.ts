import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

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
      // Verify webhook signature
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } else {
      // Fallback: parse without verification (development only)
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
        .eq("status", "reservado"); // Only update if still reserved

      if (updateError) {
        console.error("Error updating sale:", updateError);
      } else {
        console.log(`Sale ${saleId} marked as 'pago'`);
      }

      // Log the payment
      const { data: sale } = await supabaseAdmin
        .from("sales")
        .select("company_id")
        .eq("id", saleId)
        .single();

      if (sale) {
        await supabaseAdmin.from("sale_logs").insert({
          sale_id: saleId,
          action: "payment_confirmed",
          description: `Pagamento confirmado via Stripe (PI: ${session.payment_intent})`,
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
