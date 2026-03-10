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

/**
 * Cria cobrança no Asaas com split dinâmico.
 *
 * Regra de split:
 *   empresa  = 100 - (taxa_plataforma + taxa_socio)
 *   plataforma = taxa_plataforma  (fica na conta principal da plataforma)
 *   sócio    = taxa_socio         (enviado via walletId do sócio ativo)
 *
 * Se taxa_socio = 0 ou não há sócio ativo com wallet válido, o sócio é omitido do split.
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

    // 2. Buscar empresa com configuração de comissão
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("asaas_wallet_id, asaas_onboarding_complete, platform_fee_percent, partner_split_percent")
      .eq("id", sale.company_id)
      .single();

    if (companyError || !company) {
      return new Response(JSON.stringify({ error: "Company not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!company.asaas_wallet_id || !company.asaas_onboarding_complete) {
      return new Response(
        JSON.stringify({ error: "Empresa não possui conta Asaas configurada", error_code: "no_asaas_account" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const PLATFORM_API_KEY = Deno.env.get("ASAAS_API_KEY");
    if (!PLATFORM_API_KEY) {
      return new Response(JSON.stringify({ error: "Asaas API key not configured on platform" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const platformFeePercent = Number(company.platform_fee_percent ?? 0);
    const partnerSplitPercent = Number(company.partner_split_percent ?? 0);

    if (platformFeePercent < 0) {
      return new Response(JSON.stringify({ error: "Taxa da plataforma inválida", error_code: "platform_fee_missing" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Buscar sócio ativo (máximo 1) para incluir no split
    let activePartner: { asaas_wallet_id: string } | null = null;
    if (partnerSplitPercent > 0) {
      const { data: partnerData } = await supabaseAdmin
        .from("partners")
        .select("asaas_wallet_id")
        .eq("status", "ativo")
        .limit(1)
        .single();

      if (partnerData?.asaas_wallet_id) {
        activePartner = partnerData;
      }
    }

    // 4. Montar split dinâmico
    // Se sócio ativo com wallet válido e taxa > 0: split triplo (empresa + plataforma + sócio)
    // Caso contrário: split duplo (empresa + plataforma)
    const effectivePartnerFee = activePartner ? partnerSplitPercent : 0;
    const totalFee = platformFeePercent + effectivePartnerFee;

    if (totalFee > 100) {
      return new Response(
        JSON.stringify({ error: "Soma das taxas (plataforma + sócio) excede 100%", error_code: "fee_exceeds_limit" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const companySharePercent = 100 - totalFee;
    const grossAmount = sale.gross_amount ?? (sale.unit_price * sale.quantity);

    // Array de split: empresa sempre presente
    const splitArray: Array<{ walletId: string; percentualValue: number }> = [
      {
        walletId: company.asaas_wallet_id,
        percentualValue: companySharePercent,
      },
    ];

    // Incluir sócio no split somente se aplicável
    if (activePartner && effectivePartnerFee > 0) {
      splitArray.push({
        walletId: activePartner.asaas_wallet_id,
        percentualValue: effectivePartnerFee,
      });
    }

    // 5. Criar ou encontrar cliente no Asaas
    const customerCpf = (sale.customer_cpf || "").replace(/\D/g, "");
    let customerId: string | null = null;

    const searchRes = await fetch(
      `${ASAAS_BASE_URL}/customers?cpfCnpj=${customerCpf}`,
      { headers: { "access_token": PLATFORM_API_KEY } }
    );
    const searchData = await searchRes.json();

    if (searchData?.data?.length > 0) {
      customerId = searchData.data[0].id;
    } else {
      const createCustomerRes = await fetch(`${ASAAS_BASE_URL}/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "access_token": PLATFORM_API_KEY,
        },
        body: JSON.stringify({
          name: sale.customer_name,
          cpfCnpj: customerCpf,
          phone: sale.customer_phone || undefined,
          externalReference: sale.id,
        }),
      });

      const customerData = await createCustomerRes.json();
      if (!createCustomerRes.ok) {
        console.error("Asaas customer create error:", JSON.stringify(customerData));
        return new Response(
          JSON.stringify({ error: customerData?.errors?.[0]?.description || "Erro ao criar cliente no Asaas" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      customerId = customerData.id;
    }

    // 6. Criar cobrança com split
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);
    const dueDateStr = dueDate.toISOString().split("T")[0];

    const eventName = sale.event?.name || "Evento";
    const paymentPayload: Record<string, unknown> = {
      customer: customerId,
      billingType: "UNDEFINED",
      value: grossAmount,
      dueDate: dueDateStr,
      description: `${eventName} — ${sale.quantity} passagem(ns)`,
      externalReference: sale.id,
      split: splitArray,
    };

    const paymentRes = await fetch(`${ASAAS_BASE_URL}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access_token": PLATFORM_API_KEY,
      },
      body: JSON.stringify(paymentPayload),
    });

    const paymentData = await paymentRes.json();

    if (!paymentRes.ok) {
      console.error("Asaas payment create error:", JSON.stringify(paymentData));
      return new Response(
        JSON.stringify({ error: paymentData?.errors?.[0]?.description || "Erro ao criar cobrança no Asaas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Salvar ID do pagamento na venda
    await supabaseAdmin
      .from("sales")
      .update({
        asaas_payment_id: paymentData.id,
        asaas_payment_status: paymentData.status,
      })
      .eq("id", sale.id);

    // 8. Retornar URL para redirect
    return new Response(
      JSON.stringify({
        url: paymentData.invoiceUrl,
        payment_id: paymentData.id,
        status: paymentData.status,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in create-asaas-payment:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
