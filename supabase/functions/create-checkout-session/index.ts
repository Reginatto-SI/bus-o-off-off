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

    // seller_id não participa do fluxo Stripe. Comissão do vendedor é apurada manualmente pelo gerente.
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

    // Get company with stripe account AND platform fee
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("stripe_account_id, stripe_onboarding_complete, platform_fee_percent")
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
          error: "A conta Stripe da empresa ainda não está totalmente ativa. As capabilities 'transfers' e 'card_payments' precisam estar ativas.",
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

    // Regra oficial atual: taxa da plataforma fixa em 6% para vendas online.
    // gross_amount já inclui taxas adicionais do evento (calculadas pelo frontend)
    const feePercent = 0.06;
    const grossAmount = sale.gross_amount ?? (sale.unit_price * sale.quantity);
    const totalAmountCents = Math.round(grossAmount * 100);
    const applicationFeeCents = Math.round(totalAmountCents * feePercent);

    const origin = req.headers.get("origin") || "https://busaooofoof.lovable.app";

    const stripeAccountHeader = { stripeAccount: company.stripe_account_id };

    const checkoutParams: Record<string, unknown> = {
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "brl",
            product_data: {
              name: `${sale.event?.name || "Evento"} — ${sale.quantity} passagem(ns)${grossAmount > sale.unit_price * sale.quantity ? ' (com taxas)' : ''}`,
            },
            unit_amount: Math.round((grossAmount / sale.quantity) * 100),
          },
          quantity: sale.quantity,
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFeeCents,
      },
      metadata: {
        sale_id: sale.id,
        company_id: sale.company_id,
      },
      success_url: `${origin}/confirmacao/${sale.id}?payment=success`,
      cancel_url: `${origin}/eventos/${sale.event_id}/checkout?trip=${sale.trip_id}&location=${sale.boarding_location_id}&quantity=${sale.quantity}`,
    };

    let session;
    try {
      // Try with card + pix (Direct Charge — session on connected account)
      session = await stripe.checkout.sessions.create({
        ...checkoutParams,
        payment_method_types: ['card', 'pix'],
        payment_method_options: {
          pix: { expires_after_seconds: 900 },
        },
      } as any, stripeAccountHeader);
      console.log("Checkout session created with card + pix (Direct Charge)");
    } catch (pixError: any) {
      if (pixError?.type === "StripeInvalidRequestError" && pixError?.param === "payment_method_types") {
        console.warn("Pix not available on connected account, falling back to card-only");
        session = await stripe.checkout.sessions.create({
          ...checkoutParams,
          payment_method_types: ['card'],
        } as any, stripeAccountHeader);
        console.log("Checkout session created with card only (Direct Charge)");
      } else {
        throw pixError;
      }
    }

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
