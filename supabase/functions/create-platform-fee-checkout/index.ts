import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Edge function para cobrar a taxa da plataforma em vendas manuais/conversão de reserva.
 *
 * Diferença fundamental do create-checkout-session:
 * - Lá: Direct Charge na conta conectada (empresa recebe, plataforma retém application_fee).
 * - Aqui: Cobrança direta na conta da plataforma. A empresa já recebeu por fora (Pix, dinheiro, etc.).
 *   A plataforma cobra apenas sua comissão.
 *
 * Fluxo:
 * 1. Frontend envia sale_id
 * 2. Valida que a venda é admin e tem taxa pendente
 * 3. Cria Checkout Session na conta da plataforma (sem stripeAccount header)
 * 4. Salva platform_fee_payment_id na venda
 * 5. Retorna URL do checkout
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

    // 1. Buscar venda com evento
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

    // 2. Validar que é venda admin com taxa pendente
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

    // 3. Criar Checkout Session na conta da plataforma (SEM stripeAccount)
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const feeAmountCents = Math.round(feeAmount * 100);
    const eventName = sale.event?.name || "Evento";
    const origin = req.headers.get("origin") || "https://busaooofoof.lovable.app";

    // Tenta criar com card + pix; se Pix não estiver habilitado na conta da plataforma, faz fallback para card-only.
    let session;
    const baseParams = {
      mode: "payment" as const,
      line_items: [
        {
          price_data: {
            currency: "brl",
            product_data: {
              name: `Taxa da Plataforma — Venda Manual`,
              description: `Comissão referente à venda do evento "${eventName}" (${sale.quantity} passagem(ns))`,
            },
            unit_amount: feeAmountCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        sale_id: sale.id,
        company_id: sale.company_id,
        payment_type: "platform_fee_manual",
        sale_origin: sale.sale_origin,
        fee_amount: String(feeAmount),
      },
      success_url: `${origin}/admin/vendas?fee_paid=${sale.id}`,
      cancel_url: `${origin}/admin/vendas?fee_cancelled=${sale.id}`,
    };

    try {
      session = await stripe.checkout.sessions.create({
        ...baseParams,
        payment_method_types: ["card", "pix"],
        payment_method_options: { pix: { expires_after_seconds: 900 } },
      });
      console.log("Platform fee checkout created with card + pix");
    } catch (pixError: any) {
      if (pixError?.type === "StripeInvalidRequestError" && pixError?.param === "payment_method_types") {
        console.warn("Pix not available on platform account, falling back to card-only");
        session = await stripe.checkout.sessions.create({
          ...baseParams,
          payment_method_types: ["card"],
        });
        console.log("Platform fee checkout created with card only");
      } else {
        throw pixError;
      }
    }

    // 4. Salvar referência do checkout na venda
    await supabaseAdmin
      .from("sales")
      .update({ platform_fee_payment_id: session.id })
      .eq("id", sale.id);

    // 5. Log de auditoria
    await supabaseAdmin.from("sale_logs").insert({
      sale_id: sale.id,
      action: "platform_fee_checkout_created",
      description: `Checkout da taxa da plataforma criado (R$ ${feeAmount.toFixed(2)}). Session: ${session.id}`,
      company_id: sale.company_id,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in create-platform-fee-checkout:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
