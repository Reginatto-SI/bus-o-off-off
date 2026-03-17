import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logPaymentTrace } from "../_shared/payment-observability.ts";
import { resolvePartnerWalletByEnvironment, resolvePaymentContext } from "../_shared/payment-context-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type IntegrationLogStatus = "requested" | "success" | "failed";

const ASAAS_DESCRIPTION_MAX_LENGTH = 180;

function toSingleLineText(value: unknown, fallback: string) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function getShortSaleId(saleId: string) {
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

// deno-lint-ignore no-explicit-any
async function safeJson(res: Response): Promise<any> {
  try {
    const text = await res.text();
    if (!text || !text.trim()) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function jsonResponse(payload: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

    // 2. Buscar venda com evento
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

    // 3. Buscar empresa
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("name, asaas_wallet_id, asaas_api_key, asaas_onboarding_complete, asaas_wallet_id_production, asaas_api_key_production, asaas_onboarding_complete_production, asaas_wallet_id_sandbox, asaas_api_key_sandbox, asaas_onboarding_complete_sandbox, platform_fee_percent, partner_split_percent")
      .eq("id", sale.company_id)
      .single();

    if (companyError || !company) {
      return jsonResponse({ error: "Company not found" }, 404);
    }

    const paymentContext = resolvePaymentContext({
      mode: "create",
      request: req,
      sale,
      company,
    });

    // Comentário Step 3: onboarding e wallet passam a considerar configuração por ambiente
    // com fallback legado para manter compatibilidade do comportamento atual.
    if (!paymentContext.companyWalletByEnvironment || !paymentContext.companyOnboardingCompleteByEnvironment) {
      return jsonResponse({ error: "Empresa não possui conta Asaas configurada", error_code: "no_asaas_account" }, 400);
    }

    const paymentEnv = paymentContext.environment;
    const asaasBaseUrl = paymentContext.baseUrl;
    const splitEnabled = paymentContext.splitPolicy.enabled;
    const companyApiKey = paymentContext.apiKey;
    const apiKeySource = paymentContext.apiKeySource;

    logPaymentTrace("info", "create-asaas-payment", "payment_context_resolved", {
      sale_id: sale.id,
      company_id: sale.company_id,
      payment_environment: paymentContext.environment,
      payment_owner_type: paymentContext.ownerType,
      api_key_source: paymentContext.apiKeySource,
      asaas_base_url: paymentContext.baseUrl,
      split_policy: paymentContext.splitPolicy.type,
      decision_trace: paymentContext.decisionTrace,
    });

    if (!companyApiKey) {
      return jsonResponse({
        error: `Asaas API key not configured (${paymentContext.apiKeySource})`,
      }, 500);
    }

    if (paymentContext.ownerType === "company" && !paymentContext.companyApiKeyByEnvironment) {
      return jsonResponse({
        error: "Empresa sem API Key do Asaas vinculada.",
        error_code: "missing_company_asaas_api_key",
      }, 400);
    }

    console.log("[create-asaas-payment] Ambiente configurado", {
      environment_selected: paymentContext.environment,
      asaas_base_url: paymentContext.baseUrl,
      api_key_source: paymentContext.apiKeySource,
      sale_id: sale.id,
      company_id: sale.company_id,
    });

    const platformFeePercent = Number(company.platform_fee_percent ?? 0);
    const partnerSplitPercent = Number(company.partner_split_percent ?? 0);

    if (platformFeePercent < 0) {
      return jsonResponse({ error: "Taxa da plataforma inválida", error_code: "platform_fee_missing" }, 400);
    }

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

    // 5. Buscar sócio ativo para split (espelhado em sandbox/produção)
    let activePartnerWalletId: string | null = null;
    const effectivePartnerFee = splitEnabled && partnerSplitPercent > 0 ? partnerSplitPercent : 0;

    if (effectivePartnerFee > 0) {
      const { data: partnerData } = await supabaseAdmin
        .from("partners")
        .select("asaas_wallet_id, asaas_wallet_id_production, asaas_wallet_id_sandbox")
        .eq("company_id", sale.company_id)
        .eq("status", "ativo")
        .limit(1)
        .maybeSingle();

      activePartnerWalletId = resolvePartnerWalletByEnvironment(partnerData, paymentContext.environment);
    }

    // 6. Montar split (espelhado em sandbox/produção)
    const splitArray: Array<{ walletId: string; percentualValue: number }> = [];

    if (splitEnabled) {
      const actualPartnerFee = activePartnerWalletId ? effectivePartnerFee : 0;
      const totalFee = platformFeePercent + actualPartnerFee;

      if (totalFee > 100) {
        return jsonResponse({ error: "Soma das taxas (plataforma + sócio) excede 100%", error_code: "fee_exceeds_limit" }, 400);
      }

      // Em todos os ambientes do fluxo principal, a empresa é dona da cobrança. Plataforma e sócio entram no split.
      if (platformFeePercent > 0) {
        const platformWalletId = Deno.env.get(paymentContext.platformWalletSecretName);
        if (!platformWalletId) {
          return jsonResponse({ error: "Wallet da plataforma não configurada", error_code: "missing_platform_wallet" }, 500);
        }
        splitArray.push({ walletId: platformWalletId, percentualValue: platformFeePercent });
      }

      if (activePartnerWalletId && actualPartnerFee > 0) {
        splitArray.push({ walletId: activePartnerWalletId, percentualValue: actualPartnerFee });
      }
    }
    // Em fluxo principal: split habilitado conforme política central de contexto.

    // 7. Criar ou encontrar cliente no Asaas
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
      `${asaasBaseUrl}/customers?cpfCnpj=${customerCpf}`,
      { headers: { "access_token": companyApiKey } }
    );
    const searchData = await safeJson(searchRes) as Record<string, unknown> | null;
    if (!searchData) {
      console.error("[create-asaas-payment] Asaas customer search returned empty response", { sale_id: sale.id, status: searchRes.status });
      return jsonResponse({ error: "Resposta vazia ao buscar cliente no Asaas" }, 502);
    }

    if (!searchRes.ok) {
      console.error("[create-asaas-payment] Asaas customer search error", {
        sale_id: sale.id,
        company_id: sale.company_id,
        status: searchRes.status,
        response: searchData,
      });
      await insertIntegrationLog("failed", "Erro ao buscar cliente no Asaas", { cpfCnpj: customerCpf, externalReference: sale.id }, searchData);
      return jsonResponse({ error: "Erro ao buscar cliente no Asaas" }, 400);
    }

    if (searchData?.data?.length > 0) {
      customerId = searchData.data[0].id;
    } else {
      const createCustomerRes = await fetch(`${asaasBaseUrl}/customers`, {
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

      const customerData = await safeJson(createCustomerRes);
      if (!customerData) {
        return jsonResponse({ error: "Resposta vazia ao criar cliente no Asaas" }, 502);
      }
      if (!createCustomerRes.ok) {
        await insertIntegrationLog("failed", "Erro ao criar cliente no Asaas", { cpfCnpj: customerCpf }, customerData);
        return jsonResponse({ error: customerData?.errors?.[0]?.description || "Erro ao criar cliente no Asaas" }, 400);
      }
      customerId = customerData.id;
    }

    // 8. Criar cobrança
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);
    const dueDateStr = dueDate.toISOString().split("T")[0];

    const eventName = sale.event?.name || "Evento";
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
      externalReference: sale.id,
      split: splitArray,
    };

    console.log("[create-asaas-payment] sending payment payload", {
      sale_id: sale.id,
      billingType,
      grossAmount,
      splitArray,
      environment: paymentEnv,
    });

    await insertIntegrationLog("requested", "Solicitação de criação de cobrança enviada ao Asaas", paymentPayload, null);

    const paymentRes = await fetch(`${asaasBaseUrl}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access_token": companyApiKey,
      },
      body: JSON.stringify(paymentPayload),
    });

    const paymentData = await safeJson(paymentRes);
    if (!paymentData) {
      await insertIntegrationLog("failed", "Resposta vazia do Asaas ao criar cobrança", paymentPayload, null);
      return jsonResponse({ error: "Resposta vazia ao criar cobrança no Asaas" }, 502);
    }

    if (!paymentRes.ok) {
      await insertIntegrationLog("failed", "Erro ao criar cobrança no Asaas", paymentPayload, paymentData);
      return jsonResponse({ error: paymentData?.errors?.[0]?.description || "Erro ao criar cobrança no Asaas" }, 400);
    }

    console.log("[create-asaas-payment] payment created", {
      sale_id: sale.id,
      payment_id: paymentData.id,
      payment_status: paymentData.status,
      environment: paymentEnv,
    });

    await insertIntegrationLog("success", "Cobrança criada com sucesso no Asaas", paymentPayload, paymentData, paymentData.id);

    // 9. Salvar ID do pagamento E o ambiente na venda (fonte de verdade para demais funções)
    logPaymentTrace("info", "create-asaas-payment", "payment_created", {
      sale_id: sale.id,
      company_id: sale.company_id,
      payment_environment: paymentContext.environment,
      payment_owner_type: paymentContext.ownerType,
      asaas_payment_id: paymentData.id,
      asaas_payment_status: paymentData.status,
      external_reference: sale.id,
      split_attempted: splitArray.length > 0,
      split_recipients: splitArray.length,
    });

    await supabaseAdmin
      .from("sales")
      .update({
        asaas_payment_id: paymentData.id,
        asaas_payment_status: paymentData.status,
        payment_method: normalizedPaymentMethod,
        payment_environment: paymentContext.environment,
      })
      .eq("id", sale.id);

    return jsonResponse({
      url: paymentData.invoiceUrl,
      payment_id: paymentData.id,
      status: paymentData.status,
    }, 200);
  } catch (error) {
    logPaymentTrace("error", "create-asaas-payment", "unexpected_error", {
      error_message: error instanceof Error ? error.message : String(error),
    });
    console.error("Error in create-asaas-payment:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
