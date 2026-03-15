import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const IS_SANDBOX = Deno.env.get("ASAAS_ENV") !== "production";
const ASAAS_BASE_URL = IS_SANDBOX
  ? "https://sandbox.asaas.com/api/v3"
  : "https://api.asaas.com/v3";

type IntegrationLogStatus = "requested" | "success" | "failed";

const ASAAS_DESCRIPTION_MAX_LENGTH = 180;

function toSingleLineText(value: unknown, fallback: string) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function getShortSaleId(saleId: string) {
  // Comentário de suporte: quando a venda é UUID exibimos apenas o prefixo para facilitar leitura humana.
  return /^[0-9a-fA-F-]{36}$/.test(saleId) ? saleId.split("-")[0] : saleId;
}

function truncateForAsaas(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildAsaasPaymentDescription(params: {
  companyName: string;
  eventName: string;
  saleId: string;
  quantity: number;
  customerName: string;
}) {
  const shortSaleId = getShortSaleId(params.saleId);
  const quantityLabel = `${params.quantity} passagem(ns)`;

  const description = [
    "SmartBus",
    toSingleLineText(params.companyName, "Empresa"),
    toSingleLineText(params.eventName, "Evento"),
    `Venda ${shortSaleId}`,
    quantityLabel,
    `Resp.: ${toSingleLineText(params.customerName, "Comprador")}`,
  ].join(" | ");

  return truncateForAsaas(description, ASAAS_DESCRIPTION_MAX_LENGTH);
}

function jsonResponse(payload: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
    const { sale_id, payment_method } = await req.json();
    console.log("[create-asaas-payment] request received", { sale_id, payment_method });

    if (!sale_id) {
      return jsonResponse({ error: "sale_id is required" }, 400);
    }

    // Mudança crítica de segurança: só aceitamos métodos explícitos do checkout.
    // Isso evita fallback silencioso para PIX quando o front falhar ao enviar payment_method.
    if (payment_method !== "pix" && payment_method !== "credit_card") {
      return jsonResponse({
        error: "payment_method must be 'pix' or 'credit_card'",
        error_code: "invalid_payment_method",
      }, 400);
    }

    const normalizedPaymentMethod = payment_method as "pix" | "credit_card";
    const billingType = normalizedPaymentMethod === "credit_card" ? "CREDIT_CARD" : "PIX";

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
      return jsonResponse({ error: "Sale not found" }, 404);
    }

    if (!sale.company_id) {
      return jsonResponse({ error: "Sale has no company_id", error_code: "invalid_sale_company" }, 400);
    }

    if (sale.status !== "reservado" && sale.status !== "pendente_pagamento") {
      return jsonResponse({ error: "Sale is not in 'reservado' or 'pendente_pagamento' status" }, 400);
    }

    // 2. Buscar empresa com configuração de comissão
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("name, asaas_wallet_id, asaas_api_key, asaas_onboarding_complete, platform_fee_percent, partner_split_percent")
      .eq("id", sale.company_id)
      .single();

    if (companyError || !company) {
      return jsonResponse({ error: "Company not found" }, 404);
    }

    if (!company.asaas_wallet_id || !company.asaas_onboarding_complete) {
      return jsonResponse({ error: "Empresa não possui conta Asaas configurada", error_code: "no_asaas_account" }, 400);
    }

    const PLATFORM_API_KEY = Deno.env.get(IS_SANDBOX ? "ASAAS_API_KEY_SANDBOX" : "ASAAS_API_KEY");
    if (!PLATFORM_API_KEY) {
      return jsonResponse({ error: `Asaas API key not configured on platform (env: ${IS_SANDBOX ? "sandbox" : "production"})` }, 500);
    }

    console.log(`[create-asaas-payment] Asaas env: ${IS_SANDBOX ? "SANDBOX" : "PRODUCTION"}`);


    // Importante: a cobrança precisa ser criada no contexto da conta da empresa.
    // Se cair no token da plataforma, o checkout exibe o emissor incorreto.
    const companyApiKey = company.asaas_api_key;
    if (!companyApiKey) {
      return jsonResponse({
        error: "Empresa sem API Key do Asaas vinculada. Reconecte a conta Asaas da empresa para emitir cobranças no nome correto.",
        error_code: "missing_company_asaas_api_key",
      }, 400);
    }

    const platformFeePercent = Number(company.platform_fee_percent ?? 0);
    const partnerSplitPercent = Number(company.partner_split_percent ?? 0);

    if (platformFeePercent < 0) {
      return jsonResponse({ error: "Taxa da plataforma inválida", error_code: "platform_fee_missing" }, 400);
    }

    // Mantém compatibilidade com dados antigos: prioriza gross_amount persistido,
    // e só calcula via unit_price * quantity quando necessário.
    const grossAmount = sale.gross_amount ?? (sale.unit_price * sale.quantity);
    if (typeof grossAmount !== "number" || !Number.isFinite(grossAmount) || grossAmount <= 0) {
      return jsonResponse({ error: "Valor bruto da venda inválido", error_code: "invalid_gross_amount" }, 400);
    }

    const insertIntegrationLog = async (
      processingStatus: IntegrationLogStatus,
      message: string,
      payloadJson: Record<string, unknown> | null,
      responseJson: Record<string, unknown> | null,
      paymentId?: string | null
    ) => {
      const { error: logError } = await supabaseAdmin.from("sale_integration_logs").insert({
        sale_id: sale.id,
        company_id: sale.company_id,
        provider: "asaas",
        direction: "outgoing_request",
        event_type: "create_payment",
        payment_id: paymentId ?? null,
        external_reference: sale.id,
        processing_status: processingStatus,
        message,
        payload_json: payloadJson,
        response_json: responseJson,
      });

      if (logError) {
        console.error("[create-asaas-payment] failed to persist integration log", {
          sale_id: sale.id,
          error: logError.message,
        });
      }
    };

    // 3. Buscar sócio ativo (máximo 1) para incluir no split
    let activePartner: { asaas_wallet_id: string } | null = null;
    if (partnerSplitPercent > 0) {
      const { data: partnerData } = await supabaseAdmin
        .from("partners")
        .select("asaas_wallet_id")
        // Mudança crítica multiempresa: impede split com wallet de parceiro de outra empresa.
        .eq("company_id", sale.company_id)
        .eq("status", "ativo")
        .limit(1)
        .maybeSingle();

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
      return jsonResponse({ error: "Soma das taxas (plataforma + sócio) excede 100%", error_code: "fee_exceeds_limit" }, 400);
    }

    // Array de split: apenas plataforma + sócio (empresa recebe o restante automaticamente como dona da cobrança)
    const splitArray: Array<{ walletId: string; percentualValue: number }> = [];

    // A plataforma deve continuar recebendo comissão via split,
    // mesmo com a cobrança sendo criada na conta da empresa.
    const platformWalletFromEnv = Deno.env.get("ASAAS_WALLET_ID");
    let platformWalletId = platformWalletFromEnv ?? null;

    if (!platformWalletId && platformFeePercent > 0) {
      console.log("[create-asaas-payment] ASAAS_WALLET_ID not set, falling back to /myAccount", {
        sale_id: sale.id,
        company_id: sale.company_id,
      });
      try {
        const myAccountRes = await fetch(`${ASAAS_BASE_URL}/myAccount`, {
          headers: { "access_token": PLATFORM_API_KEY },
        });

        if (myAccountRes.ok) {
          const myAccountData = await myAccountRes.json();
          platformWalletId = myAccountData?.walletId ?? null;
          console.log("[create-asaas-payment] fallback /myAccount resolved", {
            sale_id: sale.id,
            company_id: sale.company_id,
            has_wallet: Boolean(platformWalletId),
          });
        } else {
          console.error("[create-asaas-payment] fallback /myAccount failed", {
            sale_id: sale.id,
            company_id: sale.company_id,
            status: myAccountRes.status,
            response: await myAccountRes.text(),
          });
        }
      } catch (fetchErr) {
        console.error("[create-asaas-payment] fallback /myAccount fetch error", {
          sale_id: sale.id,
          company_id: sale.company_id,
          error: fetchErr,
        });
      }
    }

    if (platformFeePercent > 0) {
      if (!platformWalletId) {
        return jsonResponse({ error: "Não foi possível obter wallet da plataforma para aplicar o split.", error_code: "missing_platform_wallet" }, 500);
      }

      splitArray.push({
        walletId: platformWalletId,
        percentualValue: platformFeePercent,
      });
    }

    // Incluir sócio no split somente se aplicável
    if (activePartner && effectivePartnerFee > 0) {
      splitArray.push({
        walletId: activePartner.asaas_wallet_id,
        percentualValue: effectivePartnerFee,
      });
    }

    // 5. Criar ou encontrar cliente no Asaas
    const customerCpf = (sale.customer_cpf || "").replace(/\D/g, "");
    if (!customerCpf || (customerCpf.length !== 11 && customerCpf.length !== 14)) {
      await insertIntegrationLog(
        "failed",
        "Documento do cliente ausente ou inválido para criação de cobrança",
        { sale_id: sale.id, company_id: sale.company_id, customerCpfLength: customerCpf.length },
        null
      );
      return jsonResponse({ error: "CPF/CNPJ do cliente inválido", error_code: "invalid_customer_document" }, 400);
    }

    let customerId: string | null = null;

    const searchRes = await fetch(
      `${ASAAS_BASE_URL}/customers?cpfCnpj=${customerCpf}`,
      { headers: { "access_token": companyApiKey } }
    );
    const searchData = await searchRes.json();

    if (!searchRes.ok) {
      console.error("[create-asaas-payment] Asaas customer search error", {
        sale_id: sale.id,
        company_id: sale.company_id,
        status: searchRes.status,
        response: searchData,
      });
      await insertIntegrationLog(
        "failed",
        "Erro ao buscar cliente no Asaas",
        { cpfCnpj: customerCpf, externalReference: sale.id },
        searchData
      );
      return jsonResponse({ error: "Erro ao buscar cliente no Asaas" }, 400);
    }

    if (searchData?.data?.length > 0) {
      customerId = searchData.data[0].id;
    } else {
      const createCustomerRes = await fetch(`${ASAAS_BASE_URL}/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "access_token": companyApiKey,
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
        console.error("[create-asaas-payment] Asaas customer create error", {
          sale_id: sale.id,
          company_id: sale.company_id,
          payload: { cpfCnpj: customerCpf, externalReference: sale.id },
          response: customerData,
        });
        await insertIntegrationLog(
          "failed",
          "Erro ao criar cliente no Asaas",
          { cpfCnpj: customerCpf, externalReference: sale.id },
          customerData
        );
        return jsonResponse({ error: customerData?.errors?.[0]?.description || "Erro ao criar cliente no Asaas" }, 400);
      }
      customerId = customerData.id;
    }

    // 6. Criar cobrança com split
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);
    const dueDateStr = dueDate.toISOString().split("T")[0];

    const eventName = sale.event?.name || "Evento";
    const saleExternalReference = sale.id;
    const paymentDescription = buildAsaasPaymentDescription({
      companyName: company.name,
      eventName,
      saleId: sale.id,
      quantity: Number(sale.quantity ?? 0),
      customerName: sale.customer_name,
    });

    const paymentPayload: Record<string, unknown> = {
      customer: customerId,
      billingType,
      value: grossAmount,
      dueDate: dueDateStr,
      description: paymentDescription,
      externalReference: saleExternalReference,
      split: splitArray,
    };

    console.log("[create-asaas-payment] sending payment payload", {
      sale_id: sale.id,
      company_id: sale.company_id,
      payment_method_received: payment_method,
      payment_method_normalized: normalizedPaymentMethod,
      billingType,
      grossAmount,
      platformWalletId,
      partnerWalletId: activePartner?.asaas_wallet_id ?? null,
      splitArray,
    });

    await insertIntegrationLog("requested", "Solicitação de criação de cobrança enviada ao Asaas", paymentPayload, null);

    const paymentRes = await fetch(`${ASAAS_BASE_URL}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access_token": companyApiKey,
      },
      body: JSON.stringify(paymentPayload),
    });

    const paymentData = await paymentRes.json();

    if (!paymentRes.ok) {
      console.error("[create-asaas-payment] Asaas payment create error", {
        sale_id: sale.id,
        company_id: sale.company_id,
        billingType,
        splitArray,
        response: paymentData,
      });
      await insertIntegrationLog("failed", "Erro ao criar cobrança no Asaas", paymentPayload, paymentData);
      return jsonResponse({ error: paymentData?.errors?.[0]?.description || "Erro ao criar cobrança no Asaas" }, 400);
    }

    console.log("[create-asaas-payment] payment created", {
      sale_id: sale.id,
      company_id: sale.company_id,
      payment_id: paymentData.id,
      payment_status: paymentData.status,
      billingType,
      invoiceUrl: paymentData.invoiceUrl ?? null,
    });

    await insertIntegrationLog(
      "success",
      "Cobrança criada com sucesso no Asaas",
      paymentPayload,
      paymentData,
      paymentData.id
    );

    // 7. Salvar ID do pagamento na venda
    await supabaseAdmin
      .from("sales")
      .update({
        asaas_payment_id: paymentData.id,
        asaas_payment_status: paymentData.status,
        payment_method: normalizedPaymentMethod,
      })
      .eq("id", sale.id);

    // 8. Retornar URL para redirect
    // Mantemos invoiceUrl para PIX e CREDIT_CARD porque o checkout atual usa redirecionamento
    // para a página hospedada do Asaas, e essa URL vem padronizada nesse campo na API /payments.
    return jsonResponse({
      url: paymentData.invoiceUrl,
      payment_id: paymentData.id,
      status: paymentData.status,
    }, 200);
  } catch (error) {
    console.error("Error in create-asaas-payment:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
