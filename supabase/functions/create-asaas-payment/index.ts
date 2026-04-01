import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  logPaymentTrace,
  logSaleIntegrationEvent,
  logSaleOperationalEvent,
} from "../_shared/payment-observability.ts";
import {
  resolvePaymentContext,
  validateFinancialSocioForSplit,
} from "../_shared/payment-context-resolver.ts";
import type { PaymentEnvironment } from "../_shared/runtime-env.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type IntegrationLogStatus = "requested" | "success" | "failed" | "warning" | "rejected";

const ASAAS_DESCRIPTION_MAX_LENGTH = 180;

function toSingleLineText(value: unknown, fallback: string) {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
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

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function calculatePlatformFee(unitPrice: number, feePercent: number): number {
  return roundCurrency(unitPrice * (feePercent / 100));
}

function calculateFeesTotal(params: {
  unitPrice: number;
  eventFees: Array<{ fee_type: string; value: number; is_active: boolean }>;
  passPlatformFeeToCustomer: boolean;
  platformFeePercent: number;
  quantity: number;
}) {
  const activeFees = params.eventFees.filter((fee) => fee.is_active);
  const fixedAndPercentTotal = activeFees.reduce((sum, fee) => {
    if (fee.fee_type === "percent") {
      return sum + roundCurrency(params.unitPrice * (Number(fee.value) / 100));
    }
    return sum + roundCurrency(Number(fee.value) || 0);
  }, 0);

  const platformFee = params.passPlatformFeeToCustomer
    ? calculatePlatformFee(params.unitPrice, params.platformFeePercent)
    : 0;
  return roundCurrency((fixedAndPercentTotal + platformFee) * params.quantity);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startedAt = Date.now();
    const { sale_id, payment_method, payment_environment } = await req.json();
    console.log("[create-asaas-payment] request received", {
      sale_id,
      payment_method,
      payment_environment,
    });

    if (!sale_id) {
      return jsonResponse({ error: "sale_id is required" }, 400);
    }

    if (payment_method !== "pix" && payment_method !== "credit_card") {
      return jsonResponse(
        {
          error: "payment_method must be 'pix' or 'credit_card'",
          error_code: "invalid_payment_method",
        },
        400,
      );
    }

    const normalizedPaymentMethod = payment_method as "pix" | "credit_card";
    const billingType =
      normalizedPaymentMethod === "credit_card" ? "CREDIT_CARD" : "PIX";
    const requestedPaymentEnvironment: PaymentEnvironment | null =
      payment_environment === "production" || payment_environment === "sandbox"
        ? payment_environment
        : null;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
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
      return jsonResponse(
        { error: "Sale has no company_id", error_code: "invalid_sale_company" },
        400,
      );
    }

    if (sale.status !== "reservado" && sale.status !== "pendente_pagamento") {
      return jsonResponse(
        { error: "Sale is not in 'reservado' or 'pendente_pagamento' status" },
        400,
      );
    }

    // 3. Buscar empresa
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select(
        "name, asaas_wallet_id_production, asaas_api_key_production, asaas_onboarding_complete_production, asaas_pix_ready_production, asaas_wallet_id_sandbox, asaas_api_key_sandbox, asaas_onboarding_complete_sandbox, asaas_pix_ready_sandbox, platform_fee_percent, socio_split_percent",
      )
      .eq("id", sale.company_id)
      .single();

    if (companyError || !company) {
      return jsonResponse({ error: "Company not found" }, 404);
    }

    const hasPersistedEnvironment =
      sale.payment_environment === "production" ||
      sale.payment_environment === "sandbox";
    const lockedSaleEnvironment =
      hasPersistedEnvironment && Boolean(sale.asaas_payment_id)
        ? (sale.payment_environment as PaymentEnvironment)
        : null;

    /**
     * Etapa 2:
     * - a primeira decisão do ambiente deixa de usar host encaminhado até a Edge Function;
     * - o checkout envia `payment_environment` explícito e o create o persiste como nascimento oficial;
     * - depois da primeira cobrança criada, a venda passa a ser a única fonte de verdade.
     */
    if (!lockedSaleEnvironment && !requestedPaymentEnvironment) {
      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        action: "payment_create_failed",
        source: "create-asaas-payment",
        result: "error",
        paymentEnvironment: null,
        errorCode: "payment_environment_missing_from_request",
        detail:
          "create_without_locked_sale_environment_and_without_explicit_request_environment",
      });

      return jsonResponse(
        {
          error: "Ambiente de pagamento ausente no fluxo atual",
          error_code: "payment_environment_unresolved",
        },
        400,
      );
    }

    if (
      lockedSaleEnvironment &&
      requestedPaymentEnvironment &&
      lockedSaleEnvironment !== requestedPaymentEnvironment
    ) {
      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        action: "payment_create_failed",
        source: "create-asaas-payment",
        result: "error",
        paymentEnvironment: lockedSaleEnvironment,
        errorCode: "payment_environment_mismatch",
        detail: `sale=${lockedSaleEnvironment};request=${requestedPaymentEnvironment}`,
      });

      return jsonResponse(
        {
          error:
            "Ambiente explícito divergente do ambiente já vinculado à venda",
          error_code: "payment_environment_mismatch",
        },
        409,
      );
    }

    let paymentContext;
    try {
      paymentContext = resolvePaymentContext({
        mode: "create",
        requestedEnvironment: requestedPaymentEnvironment,
        sale: lockedSaleEnvironment
          ? { payment_environment: lockedSaleEnvironment }
          : undefined,
        company,
      });
    } catch (contextError) {
      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        action: "payment_create_failed",
        source: "create-asaas-payment",
        result: "error",
        paymentEnvironment: null,
        errorCode: "payment_environment_unresolved",
        detail:
          contextError instanceof Error
            ? contextError.message
            : String(contextError),
      });

      return jsonResponse(
        {
          error:
            "Não foi possível determinar o ambiente da venda com segurança",
          error_code: "payment_environment_unresolved",
        },
        400,
      );
    }

    // Hardening Step 5 (ajuste API direta):
    // para empresa cobrar no próprio Asaas, a credencial mandatória é API Key por ambiente.
    // wallet/onboarding continuam úteis para diagnóstico e trilha do vínculo, mas não devem
    // bloquear criação de cobrança quando a integração via API direta já está válida.
    if (!paymentContext.companyApiKeyByEnvironment) {
      return jsonResponse(
        {
          error: "Empresa não possui conta Asaas configurada",
          error_code: "no_asaas_account",
        },
        400,
      );
    }

    const paymentEnv = paymentContext.environment;
    const asaasBaseUrl = paymentContext.baseUrl;
    const splitEnabled = paymentContext.splitPolicy.enabled;
    const companyApiKey = paymentContext.apiKey;
    const apiKeySource = paymentContext.apiKeySource;
    const companyPixReadyByEnvironment = paymentEnv === "production"
      ? company.asaas_pix_ready_production === true
      : company.asaas_pix_ready_sandbox === true;

    // Etapa 4: trilha operacional mínima por sale_id para criação de pagamento.
    await logSaleOperationalEvent({
      supabaseAdmin,
      saleId: sale.id,
      companyId: sale.company_id,
      action: "payment_create_started",
      source: "create-asaas-payment",
      result: "started",
      paymentEnvironment: paymentEnv,
    });

    logPaymentTrace(
      "info",
      "create-asaas-payment",
      "payment_context_resolved",
      {
        sale_id: sale.id,
        company_id: sale.company_id,
        payment_environment: paymentContext.environment,
        payment_owner_type: paymentContext.ownerType,
        api_key_source: paymentContext.apiKeySource,
        asaas_base_url: paymentContext.baseUrl,
        split_policy: paymentContext.splitPolicy.type,
        decision_trace: paymentContext.decisionTrace,
        request_payment_environment: requestedPaymentEnvironment,
        sale_payment_environment: hasPersistedEnvironment
          ? sale.payment_environment
          : null,
        locked_sale_environment: lockedSaleEnvironment,
      },
    );

    if (!companyApiKey) {
      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        action: "payment_create_failed",
        source: "create-asaas-payment",
        result: "error",
        paymentEnvironment: paymentEnv,
        errorCode: "missing_api_key",
        detail: paymentContext.apiKeySource,
      });
      return jsonResponse(
        {
          error: `Asaas API key not configured (${paymentContext.apiKeySource})`,
        },
        500,
      );
    }

    if (
      paymentContext.ownerType === "company" &&
      !paymentContext.companyApiKeyByEnvironment
    ) {
      return jsonResponse(
        {
          error: "Empresa sem API Key do Asaas vinculada.",
          error_code: "missing_company_asaas_api_key",
        },
        400,
      );
    }

    if (
      !lockedSaleEnvironment &&
      sale.payment_environment !== paymentContext.environment
    ) {
      /**
       * Etapa 2:
       * explicitamos o nascimento do ambiente na própria venda antes de falar com o Asaas.
       * Isso evita depender do default legado do banco como se fosse decisão oficial.
       */
      const { error: environmentPersistError } = await supabaseAdmin
        .from("sales")
        .update({ payment_environment: paymentContext.environment })
        .eq("id", sale.id);

      if (environmentPersistError) {
        await logSaleOperationalEvent({
          supabaseAdmin,
          saleId: sale.id,
          companyId: sale.company_id,
          action: "payment_create_failed",
          source: "create-asaas-payment",
          result: "error",
          paymentEnvironment: paymentContext.environment,
          errorCode: "payment_environment_persist_failed",
          detail: environmentPersistError.message,
        });

        return jsonResponse(
          {
            error:
              "Não foi possível persistir o ambiente da venda antes da cobrança",
            error_code: "payment_environment_persist_failed",
          },
          500,
        );
      }
    }

    console.log("[create-asaas-payment] Ambiente configurado", {
      environment_selected: paymentContext.environment,
      asaas_base_url: paymentContext.baseUrl,
      api_key_source: paymentContext.apiKeySource,
      sale_id: sale.id,
      company_id: sale.company_id,
      request_payment_environment: requestedPaymentEnvironment,
      locked_sale_environment: lockedSaleEnvironment,
    });

    const platformFeePercent = Number(company.platform_fee_percent ?? 0);
    const socioSplitPercent = Number(company.socio_split_percent ?? 0);

    if (platformFeePercent < 0) {
      return jsonResponse(
        {
          error: "Taxa da plataforma inválida",
          error_code: "platform_fee_missing",
        },
        400,
      );
    }

    const grossAmount = sale.gross_amount ?? sale.unit_price * sale.quantity;
    if (
      typeof grossAmount !== "number" ||
      !Number.isFinite(grossAmount) ||
      grossAmount <= 0
    ) {
      return jsonResponse(
        {
          error: "Valor bruto da venda inválido",
          error_code: "invalid_gross_amount",
        },
        400,
      );
    }

    // Regra de integridade da fase 1:
    // soma dos final_price dos passageiros + taxas oficiais = sales.gross_amount.
    const { data: passengerSnapshots, error: passengersError } = await supabaseAdmin
      .from("sale_passengers")
      .select("trip_id, final_price, original_price, discount_amount")
      .eq("sale_id", sale.id)
      .order("sort_order", { ascending: true });

    if (passengersError) {
      console.error("[create-asaas-payment] erro ao carregar snapshot de passageiros", {
        sale_id: sale.id,
        error: passengersError,
      });
      return jsonResponse(
        {
          error: "Não foi possível validar os benefícios dos passageiros.",
          error_code: "passenger_snapshot_unavailable",
        },
        500,
      );
    }

    if (!passengerSnapshots || passengerSnapshots.length === 0) {
      return jsonResponse(
        {
          error: "Não foi possível validar os benefícios dos passageiros.",
          error_code: "passenger_snapshot_missing",
        },
        409,
      );
    }

    const passengerFinalSum = roundCurrency(
      passengerSnapshots.reduce(
        (sum, passenger) =>
          passenger.trip_id === sale.trip_id
            ? sum + Number(passenger.final_price ?? 0)
            : sum,
        0,
      ),
    );
    const passengerDiscountSum = roundCurrency(
      passengerSnapshots.reduce(
        (sum, passenger) =>
          passenger.trip_id === sale.trip_id
            ? sum + Number(passenger.discount_amount ?? 0)
            : sum,
        0,
      ),
    );

    const quantityFromSnapshot = passengerSnapshots.filter(
      (passenger) => passenger.trip_id === sale.trip_id,
    ).length;
    if (quantityFromSnapshot <= 0) {
      return jsonResponse(
        {
          error: "Não foi possível validar os benefícios dos passageiros.",
          error_code: "passenger_snapshot_without_primary_trip",
        },
        409,
      );
    }
    const avgFinalPrice = quantityFromSnapshot > 0
      ? roundCurrency(passengerFinalSum / quantityFromSnapshot)
      : 0;

    const { data: eventFees, error: eventFeesError } = await supabaseAdmin
      .from("event_fees")
      .select("fee_type, value, is_active")
      .eq("event_id", sale.event_id)
      .eq("is_active", true)
      .order("sort_order");

    if (eventFeesError) {
      console.error("[create-asaas-payment] erro ao carregar taxas do evento", {
        sale_id: sale.id,
        error: eventFeesError,
      });
      return jsonResponse(
        {
          error:
            "Foi detectada divergência entre o snapshot financeiro e o total da cobrança.",
          error_code: "event_fees_unavailable_for_integrity_check",
        },
        500,
      );
    }

    const feesTotal = calculateFeesTotal({
      unitPrice: avgFinalPrice,
      eventFees: (eventFees ?? []) as Array<{
        fee_type: string;
        value: number;
        is_active: boolean;
      }>,
      passPlatformFeeToCustomer: Boolean(sale.event?.pass_platform_fee_to_customer),
      platformFeePercent: platformFeePercent,
      quantity: quantityFromSnapshot,
    });

    const expectedGrossFromSnapshot = roundCurrency(passengerFinalSum + feesTotal);
    if (Math.abs(roundCurrency(grossAmount) - expectedGrossFromSnapshot) > 0.01) {
      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        action: "payment_create_failed",
        source: "create-asaas-payment",
        result: "error",
        paymentEnvironment: paymentContext.environment,
        errorCode: "sale_total_inconsistent_with_passenger_snapshot",
        detail: `gross_amount=${grossAmount};expected=${expectedGrossFromSnapshot};passenger_final_sum=${passengerFinalSum};fees_total=${feesTotal}`,
      });

      return jsonResponse(
        {
          error: "O total da venda está inconsistente com os valores dos passageiros.",
          error_code: "sale_total_inconsistent_with_passenger_snapshot",
        },
        409,
      );
    }

    if (Math.abs(Number(sale.benefit_total_discount ?? 0) - passengerDiscountSum) > 0.01) {
      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        action: "payment_create_failed",
        source: "create-asaas-payment",
        result: "error",
        paymentEnvironment: paymentContext.environment,
        errorCode: "sale_benefit_discount_inconsistent",
        detail: `sale_benefit_total_discount=${sale.benefit_total_discount};snapshot_discount=${passengerDiscountSum}`,
      });

      return jsonResponse(
        {
          error:
            "Foi detectada divergência entre o snapshot financeiro e o total da cobrança.",
          error_code: "sale_benefit_discount_inconsistent",
        },
        409,
      );
    }

    const insertIntegrationLog = async (
      processingStatus: IntegrationLogStatus,
      message: string,
      payloadJson: Record<string, unknown> | null,
      responseJson: Record<string, unknown> | null,
      paymentId?: string | null,
      incidentCode?: string | null,
    ) => {
      await logSaleIntegrationEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        paymentEnvironment: paymentEnv,
        environmentDecisionSource:
          paymentContext.decisionTrace.environmentSource,
        environmentHostDetected: paymentContext.decisionTrace.hostDetected,
        provider: "asaas",
        direction: "outgoing_request",
        eventType: "create_payment",
        paymentId: paymentId ?? null,
        externalReference: sale.id,
        httpStatus: responseJson && typeof responseJson === "object" && "http_status" in responseJson
          ? Number((responseJson as Record<string, unknown>).http_status ?? 0) || null
          : null,
        processingStatus,
        resultCategory: processingStatus === "requested"
          ? "started"
          : processingStatus === "success"
            ? "success"
            : processingStatus === "warning"
              ? "warning"
              : processingStatus === "failed"
                ? "error"
                : "rejected",
        incidentCode: incidentCode ?? null,
        durationMs: Date.now() - startedAt,
        message,
        payloadJson,
        responseJson,
      });
    };

    if (billingType === "PIX" && !companyPixReadyByEnvironment) {
      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        action: "payment_create_failed",
        source: "create-asaas-payment",
        result: "error",
        paymentEnvironment: paymentEnv,
        errorCode: "pix_not_ready",
        detail: "company_pix_readiness_flag_false",
      });

      await insertIntegrationLog(
        "failed",
        "Cobrança Pix bloqueada por readiness local da empresa",
        {
          sale_id: sale.id,
          company_id: sale.company_id,
          payment_environment: paymentEnv,
          company_pix_ready: companyPixReadyByEnvironment,
        },
        null,
        null,
        "pix_not_ready",
      );

      return jsonResponse(
        {
          error:
            "Pix indisponível para esta empresa no momento. Tente novamente mais tarde ou utilize cartão.",
          error_code: "pix_not_ready",
        },
        409,
      );
    }

    // 5. Buscar sócio ativo para split (espelhado em sandbox/produção)
    let activeSocioWalletId: string | null = null;
    const effectiveSocioFee =
      splitEnabled && socioSplitPercent > 0 ? socioSplitPercent : 0;

    if (effectiveSocioFee > 0) {
      const { data: socioRows, error: socioSplitError } = await supabaseAdmin
        .from("socios_split")
        .select("id, name, status, asaas_wallet_id, asaas_wallet_id_production, asaas_wallet_id_sandbox")
        .eq("company_id", sale.company_id)
        .eq("status", "ativo")
        .limit(2);

      if (socioSplitError) {
        await logSaleOperationalEvent({
          supabaseAdmin,
          saleId: sale.id,
          companyId: sale.company_id,
          action: "payment_create_failed",
          source: "create-asaas-payment",
          result: "error",
          paymentEnvironment: paymentContext.environment,
          errorCode: "split_socio_query_failed",
          detail: socioSplitError.message,
        });

        return jsonResponse(
          {
            error: "Falha ao validar o sócio do split",
            error_code: "split_socio_query_failed",
          },
          500,
        );
      }

      const socioSplitValidation = validateFinancialSocioForSplit({
        socios: socioRows ?? [],
        provider: "asaas",
        environment: paymentContext.environment,
      });

      if (!socioSplitValidation.ok) {
        logPaymentTrace("error", "create-asaas-payment", "split_socio_validation_failed", {
          sale_id: sale.id,
          company_id: sale.company_id,
          payment_environment: paymentContext.environment,
          validation_code: socioSplitValidation.code,
          validation_message: socioSplitValidation.message,
          active_socio_rows: (socioRows ?? []).length,
        });

        await logSaleOperationalEvent({
          supabaseAdmin,
          saleId: sale.id,
          companyId: sale.company_id,
          action: "payment_create_failed",
          source: "create-asaas-payment",
          result: "error",
          paymentEnvironment: paymentContext.environment,
          errorCode: socioSplitValidation.code,
          detail: socioSplitValidation.message,
        });

        return jsonResponse(
          {
            error: socioSplitValidation.message,
            error_code: socioSplitValidation.code,
          },
          409,
        );
      }

      activeSocioWalletId = socioSplitValidation.walletId;
    }

    // 6. Montar split (espelhado em sandbox/produção)
    const splitArray: Array<{ walletId: string; percentualValue: number }> = [];

    if (splitEnabled) {
      const actualSocioFee = activeSocioWalletId ? effectiveSocioFee : 0;
      const totalFee = platformFeePercent + actualSocioFee;

      if (totalFee > 100) {
        return jsonResponse(
          {
            error: "Soma das taxas (plataforma + sócio) excede 100%",
            error_code: "fee_exceeds_limit",
          },
          400,
        );
      }

      // Em todos os ambientes do fluxo principal, a empresa é dona da cobrança. Plataforma e sócio entram no split.
      if (platformFeePercent > 0) {
        const platformWalletId = Deno.env.get(
          paymentContext.platformWalletSecretName,
        );
        if (!platformWalletId) {
          return jsonResponse(
            {
              error: "Wallet da plataforma não configurada",
              error_code: "missing_platform_wallet",
            },
            500,
          );
        }
        splitArray.push({
          walletId: platformWalletId,
          percentualValue: platformFeePercent,
        });
      }

      if (activeSocioWalletId && actualSocioFee > 0) {
        splitArray.push({
          walletId: activeSocioWalletId,
          percentualValue: actualSocioFee,
        });
      }
    }
    // Em fluxo principal: split habilitado conforme política central de contexto.

    // 7. Criar ou encontrar cliente no Asaas
    const customerCpf = (sale.customer_cpf || "").replace(/\D/g, "");
    if (
      !customerCpf ||
      (customerCpf.length !== 11 && customerCpf.length !== 14)
    ) {
      await insertIntegrationLog(
        "failed",
        "Documento do cliente ausente ou inválido para criação de cobrança",
        {
          sale_id: sale.id,
          company_id: sale.company_id,
          customerCpfLength: customerCpf.length,
        },
        null,
      );
      return jsonResponse(
        {
          error: "CPF/CNPJ do cliente inválido",
          error_code: "invalid_customer_document",
        },
        400,
      );
    }

    let customerId: string | null = null;

    // Retry conservador: até 2 tentativas apenas quando body vazio/inválido ou erro de rede.
    const maxSearchAttempts = 2;
    let searchRes: Response | null = null;
    let searchData: {
      data?: Array<{ id?: string }>;
      [key: string]: unknown;
    } | null = null;

    for (let attempt = 1; attempt <= maxSearchAttempts; attempt++) {
      try {
        searchRes = await fetch(
          `${asaasBaseUrl}/customers?cpfCnpj=${customerCpf}`,
          { headers: { access_token: companyApiKey } },
        );
        searchData = (await safeJson(searchRes)) as typeof searchData;
      } catch (networkErr) {
        logPaymentTrace("warn", "create-asaas-payment", "customer_search_network_error", {
          sale_id: sale.id,
          company_id: sale.company_id,
          attempt,
          error_message: networkErr instanceof Error ? networkErr.message : String(networkErr),
          payment_environment: paymentEnv,
        });
        searchRes = null;
        searchData = null;
      }

      // Se obteve body parseável (mesmo que erro HTTP 4xx/5xx), não faz retry — segue fluxo existente.
      if (searchData !== null) break;

      if (attempt < maxSearchAttempts) {
        logPaymentTrace("warn", "create-asaas-payment", "customer_search_empty_retrying", {
          sale_id: sale.id,
          company_id: sale.company_id,
          attempt,
          http_status: searchRes?.status ?? null,
          http_status_text: searchRes?.statusText ?? null,
          payment_environment: paymentEnv,
        });
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    if (!searchData) {
      const httpStatus = searchRes?.status ?? null;
      const httpStatusText = searchRes?.statusText ?? null;

      await insertIntegrationLog(
        "failed",
        `Resposta vazia ao buscar cliente no Asaas (HTTP ${httpStatus ?? "sem resposta"}, ${maxSearchAttempts} tentativa(s))`,
        { externalReference: sale.id, attempts: maxSearchAttempts },
        { http_status: httpStatus, http_status_text: httpStatusText },
        null,
        "CUSTOMER_SEARCH_EMPTY_RESPONSE",
      );

      logPaymentTrace("error", "create-asaas-payment", "customer_search_empty_final", {
        sale_id: sale.id,
        company_id: sale.company_id,
        http_status: httpStatus,
        http_status_text: httpStatusText,
        payment_environment: paymentEnv,
        attempts: maxSearchAttempts,
      });

      return jsonResponse(
        { error: "Resposta vazia ao buscar cliente no Asaas", error_code: "customer_search_empty_response" },
        502,
      );
    }

    if (!searchRes.ok) {
      logPaymentTrace("error", "create-asaas-payment", "customer_search_http_error", {
        sale_id: sale.id,
        company_id: sale.company_id,
        http_status: searchRes.status,
        http_status_text: searchRes.statusText,
        payment_environment: paymentEnv,
      });
      await insertIntegrationLog(
        "failed",
        `Erro ao buscar cliente no Asaas (HTTP ${searchRes.status})`,
        { externalReference: sale.id },
        { http_status: searchRes.status, http_status_text: searchRes.statusText },
        null,
        "CUSTOMER_SEARCH_HTTP_ERROR",
      );
      return jsonResponse({ error: "Erro ao buscar cliente no Asaas", error_code: "customer_search_http_error" }, 400);
    }

    const existingCustomers = Array.isArray(searchData?.data)
      ? searchData.data
      : [];

    if (
      existingCustomers.length > 0 &&
      typeof existingCustomers[0]?.id === "string"
    ) {
      customerId = existingCustomers[0].id;
    } else {
      const createCustomerRes = await fetch(`${asaasBaseUrl}/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          access_token: companyApiKey,
        },
        body: JSON.stringify({
          name: sale.customer_name,
          cpfCnpj: customerCpf,
          phone: sale.customer_phone || undefined,
          externalReference: sale.id,
          // Regra de custo Smartbus BR: novos customers devem nascer sem notificações pagas.
          notificationDisabled: true,
        }),
      });

      const customerData = await safeJson(createCustomerRes);
      if (!customerData) {
        await insertIntegrationLog(
          "failed",
          `Resposta vazia ao criar cliente no Asaas (HTTP ${createCustomerRes.status})`,
          { externalReference: sale.id },
          { http_status: createCustomerRes.status, http_status_text: createCustomerRes.statusText },
          null,
          "CUSTOMER_CREATE_EMPTY_RESPONSE",
        );

        logPaymentTrace("error", "create-asaas-payment", "customer_create_empty_response", {
          sale_id: sale.id,
          company_id: sale.company_id,
          http_status: createCustomerRes.status,
          http_status_text: createCustomerRes.statusText,
          payment_environment: paymentEnv,
        });

        return jsonResponse(
          { error: "Resposta vazia ao criar cliente no Asaas", error_code: "customer_create_empty_response" },
          502,
        );
      }
      if (!createCustomerRes.ok) {
        const customerErrorDesc = customerData?.errors?.[0]?.description ?? null;

        await insertIntegrationLog(
          "failed",
          `Erro ao criar cliente no Asaas (HTTP ${createCustomerRes.status})`,
          { externalReference: sale.id },
          { http_status: createCustomerRes.status, http_status_text: createCustomerRes.statusText, error_description: customerErrorDesc },
          null,
          "CUSTOMER_CREATE_HTTP_ERROR",
        );
        return jsonResponse(
          {
            error: customerErrorDesc || "Erro ao criar cliente no Asaas",
            error_code: "customer_create_http_error",
          },
          400,
        );
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

    await insertIntegrationLog(
      "requested",
      "Solicitação de criação de cobrança enviada ao Asaas",
      paymentPayload,
      null,
    );

    const paymentRes = await fetch(`${asaasBaseUrl}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        access_token: companyApiKey,
      },
      body: JSON.stringify(paymentPayload),
    });

    const paymentData = await safeJson(paymentRes);
    if (!paymentData) {
      await insertIntegrationLog(
        "failed",
        "Resposta vazia do Asaas ao criar cobrança",
        paymentPayload,
        null,
      );
      return jsonResponse(
        { error: "Resposta vazia ao criar cobrança no Asaas" },
        502,
      );
    }

    if (!paymentRes.ok) {
      const gatewayErrorCode = String(paymentData?.errors?.[0]?.code ?? "");
      const gatewayErrorDescription = String(
        paymentData?.errors?.[0]?.description ?? "unknown_error",
      );
      const pixKeyUnavailableOnGateway =
        billingType === "PIX" &&
        (
          gatewayErrorCode === "invalid_billingType" ||
          gatewayErrorDescription
            .toLowerCase()
            .includes("não há nenhuma chave pix disponível para receber cobranças")
        );

      if (pixKeyUnavailableOnGateway) {
        // Observabilidade isolada ao Pix: logamos divergência entre readiness persistido e retorno real do gateway.
        logPaymentTrace("warn", "create-asaas-payment", "pix_key_unavailable_on_gateway", {
          sale_id: sale.id,
          company_id: sale.company_id,
          payment_environment: paymentEnv,
          billing_type: billingType,
          company_pix_ready_persisted: companyPixReadyByEnvironment,
          asaas_error_code: gatewayErrorCode || null,
          asaas_error_description: gatewayErrorDescription,
        });
      }

      await insertIntegrationLog(
        "failed",
        "Erro ao criar cobrança no Asaas",
        paymentPayload,
        paymentData,
      );
      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        action: "payment_create_failed",
        source: "create-asaas-payment",
        result: "error",
        paymentEnvironment: paymentEnv,
        errorCode: "asaas_create_payment_failed",
        detail: String(
          paymentData?.errors?.[0]?.description ?? "unknown_error",
        ),
      });
      return jsonResponse(
        {
          error:
            paymentData?.errors?.[0]?.description ||
            "Erro ao criar cobrança no Asaas",
        },
        400,
      );
    }

    console.log("[create-asaas-payment] payment created", {
      sale_id: sale.id,
      payment_id: paymentData.id,
      payment_status: paymentData.status,
      environment: paymentEnv,
    });

    await insertIntegrationLog(
      "success",
      "Cobrança criada com sucesso no Asaas",
      paymentPayload,
      paymentData,
      paymentData.id,
    );

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

    await logSaleOperationalEvent({
      supabaseAdmin,
      saleId: sale.id,
      companyId: sale.company_id,
      action: "payment_create_completed",
      source: "create-asaas-payment",
      result: "success",
      paymentEnvironment: paymentEnv,
      detail: `payment_id=${paymentData.id}`,
    });

    return jsonResponse(
      {
        url: paymentData.invoiceUrl,
        payment_id: paymentData.id,
        status: paymentData.status,
      },
      200,
    );
  } catch (error) {
    logPaymentTrace("error", "create-asaas-payment", "unexpected_error", {
      error_message: error instanceof Error ? error.message : String(error),
    });
    console.error("Error in create-asaas-payment:", error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      500,
    );
  }
});
