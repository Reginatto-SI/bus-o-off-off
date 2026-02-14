import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLATFORM_FEE_PERCENT = 0.075; // 7.5%

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

    // Get sale with event
    const { data: sale, error: saleError } = await supabaseAdmin
      .from("sales")
      .select("*, event:events(*)")
      .eq("id", sale_id)
      .single();

    if (saleError || !sale) {
      return new Response(JSON.stringify({ error: "Sale not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (sale.status !== "reservado") {
      return new Response(JSON.stringify({ error: "Sale is not in 'reservado' status" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get company stripe account
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("stripe_account_id, stripe_onboarding_complete")
      .eq("id", sale.company_id)
      .single();

    if (companyError || !company) {
      return new Response(JSON.stringify({ error: "Company not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!company.stripe_account_id || !company.stripe_onboarding_complete) {
      return new Response(
        JSON.stringify({ error: "Company has no Stripe account configured", error_code: "no_stripe_account" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Pre-validate capabilities before creating checkout session
    const connectedAccount = await stripe.accounts.retrieve(company.stripe_account_id);
    const transfersActive = connectedAccount.capabilities?.transfers === 'active';
    const paymentsActive = connectedAccount.capabilities?.card_payments === 'active';

    if (!transfersActive || !paymentsActive) {
      return new Response(
        JSON.stringify({
          error: "A conta Stripe da empresa ainda não está totalmente ativa. As capabilities 'transfers' e 'card_payments' precisam estar ativas. Aguarde a aprovação do Stripe ou entre em contato com o administrador.",
          error_code: "capabilities_not_ready",
          capabilities: {
            transfers: connectedAccount.capabilities?.transfers || 'inactive',
            card_payments: connectedAccount.capabilities?.card_payments || 'inactive',
          },
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const totalAmountCents = Math.round(sale.unit_price * sale.quantity * 100);
    const applicationFeeCents = Math.round(totalAmountCents * PLATFORM_FEE_PERCENT);

    const origin = req.headers.get("origin") || "https://busaooofoof.lovable.app";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "brl",
            product_data: {
              name: `${sale.event?.name || "Evento"} — ${sale.quantity} passagem(ns)`,
            },
            unit_amount: Math.round(sale.unit_price * 100),
          },
          quantity: sale.quantity,
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFeeCents,
        transfer_data: {
          destination: company.stripe_account_id,
        },
      },
      metadata: {
        sale_id: sale.id,
      },
      success_url: `${origin}/confirmacao/${sale.id}?payment=success`,
      cancel_url: `${origin}/eventos/${sale.event_id}/checkout?trip=${sale.trip_id}&location=${sale.boarding_location_id}&quantity=${sale.quantity}`,
    });

    // Save checkout session id on the sale
    await supabaseAdmin
      .from("sales")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", sale.id);

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in create-checkout-session:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
