import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  logPaymentTrace,
  logSaleIntegrationEvent,
  logSaleOperationalEvent,
} from "../_shared/payment-observability.ts";
import { resolvePaymentContext } from "../_shared/payment-context-resolver.ts";
import { resolveAsaasSplitRecipients } from "../_shared/split-recipients-resolver.ts";
import {
  amountToGrossPercent,
  computeProgressiveFeeForPassengers,
  distributePlatformFee,
  logFeeEngineTrace,
} from "../_shared/platform-fee-engine.ts";
import {
  resolvePassengerFinancialUnitPrice,
  roundCurrency,
  type CheckoutPassengerSnapshotInput,
} from "../_shared/checkout-financial-integrity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type AsaasPaymentStatus =
  | "PENDING"
  | "AWAITING_RISK_ANALYSIS"
  | "AWAITING_CHECKOUT_RISK_ANALYSIS_REQUEST"
  | "RECEIVED"
  | "CONFIRMED"
  | "RECEIVED_IN_CASH"
  | "OVERDUE"
  | "REFUNDED"
  | "REFUND_REQUESTED"
  | "CHARGEBACK_REQUESTED"
  | "CHARGEBACK_DISPUTE"
  | "CHARGEBACK_DONE"
  | "CANCELLED"
  | "DELETED"
  | string;


type SupabaseAdminClient = ReturnType<typeof createClient>;

type ManualPlatformFeeSale = {
  id: string;
  company_id: string;
  trip_id: string;
  quantity?: number | null;
  gross_amount?: number | null;
  payment_environment?: string | null;
  platform_fee_payment_id?: string | null;
  representative_id?: string | null;
  [key: string]: unknown;
};

const MANUAL_SALE_ORIGINS = new Set([
  "admin_manual",
  "admin_reservation_conversion",
  "seller_manual",
]);

const ASAAS_CONFIRMED_STATUS = new Set(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"]);
const ASAAS_REUSABLE_PENDING_STATUS = new Set([
  "PENDING",
  "AWAITING_RISK_ANALYSIS",
  "AWAITING_CHECKOUT_RISK_ANALYSIS_REQUEST",
]);
const ASAAS_ALLOW_NEW_CHARGE_STATUS = new Set([
  "OVERDUE",
  "REFUNDED",
  "REFUND_REQUESTED",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "CHARGEBACK_DONE",
  "CANCELLED",
  "DELETED",
]);

/**
 * Cobra a taxa da plataforma em vendas manuais/conversão de reserva via Asaas.
 * Usa o payment_environment salvo na venda (nunca recalcula por host).
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();

  try {
    const { sale_id, consult_only } = await req.json();
    const consultOnly = consult_only === true;
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

    const isManualOrigin = !sale.sale_origin || MANUAL_SALE_ORIGINS.has(sale.sale_origin);
    if (!isManualOrigin) {
      return new Response(
        JSON.stringify({ error: "Fluxo de taxa manual disponível apenas para vendas administrativas." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (sale.platform_fee_status === "paid") {
      // Blindagem anti-duplicidade: taxa já quitada não pode gerar nova cobrança.
      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        action: "platform_fee_checkout_skipped_already_paid",
        source: "create-platform-fee-checkout",
        result: "ignored",
        paymentEnvironment: sale.payment_environment ?? null,
      });

      await logSaleIntegrationEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        paymentEnvironment: sale.payment_environment ?? null,
        provider: "asaas",
        direction: "outgoing_request",
        eventType: "platform_fee_checkout_create",
        paymentId: sale.platform_fee_payment_id ?? null,
        externalReference: `platform_fee_${sale.id}`,
        httpStatus: 200,
        processingStatus: "ignored",
        resultCategory: "ignored",
        warningCode: "platform_fee_already_paid",
        durationMs: Date.now() - startedAt,
        message: "Nova cobrança bloqueada: taxa da plataforma já está paga",
        payloadJson: { sale_id: sale.id, reason: "platform_fee_already_paid" },
        responseJson: {
          already_paid: true,
          payment_id: sale.platform_fee_payment_id ?? null,
          payment_status: sale.platform_fee_status,
        },
      });

      return new Response(
        JSON.stringify({
          already_paid: true,
          message: "Taxa da plataforma já confirmada para esta venda.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (consultOnly && !sale.platform_fee_payment_id) {
      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        action: "platform_fee_checkout_consult_blocked_missing_payment",
        source: "create-platform-fee-checkout",
        result: "warning",
        paymentEnvironment: sale.payment_environment ?? null,
        errorCode: "consult_only_without_payment_id",
      });

      return new Response(
        JSON.stringify({
          error: "Consulta da taxa exige cobrança já vinculada (platform_fee_payment_id ausente).",
          error_code: "consult_only_without_reusable_payment",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (sale.platform_fee_status !== "pending" && sale.platform_fee_status !== "failed") {
      return new Response(
        JSON.stringify({ error: `Taxa não está elegível para cobrança (status atual: ${sale.platform_fee_status})` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: companyFeeConfig } = await supabaseAdmin
      .from("companies")
      .select("platform_fee_percent")
      .eq("id", sale.company_id)
      .single();

    const platformFeePercent = Number(companyFeeConfig?.platform_fee_percent ?? 0);
    const hasConfiguredPlatformFee = Number.isFinite(platformFeePercent) && platformFeePercent > 0;

    if (!hasConfiguredPlatformFee) {
      // Empresas piloto/isentas podem vender normalmente pelo Asaas, mas não geram
      // cobrança/split da plataforma. A taxa mínima de R$ 5,00 só é aplicada quando
      // a Taxa da Plataforma (%) em /admin/empresa é maior que zero.
      await supabaseAdmin
        .from("sales")
        .update({
          platform_fee_amount: 0,
          platform_fee_status: "not_applicable",
          platform_fee_payment_id: null,
        })
        .eq("id", sale.id)
        .in("platform_fee_status", ["pending", "failed"]);

      await supabaseAdmin.from("sale_logs").insert({
        sale_id: sale.id,
        action: "platform_fee_skipped_zero_percent",
        description: "Taxa da plataforma não gerada: empresa configurada com Taxa da Plataforma (%) zero/isenta.",
        company_id: sale.company_id,
      });

      return new Response(
        JSON.stringify({
          waived: true,
          waived_reason: "company_platform_fee_zero",
          message: "Taxa da plataforma não aplicável para empresa com comissão zero.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const originalFeeAmount = Number(sale.platform_fee_amount ?? 0);
    if (!originalFeeAmount || originalFeeAmount <= 0) {
      return new Response(
        JSON.stringify({ error: "Valor da taxa inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const manualFeeComputation = await computeOfficialManualPlatformFee({
      supabaseAdmin,
      sale,
    });

    if (!manualFeeComputation.ok) {
      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        action: "platform_fee_checkout_blocked_invalid_manual_snapshot",
        source: "create-platform-fee-checkout",
        result: "rejected",
        paymentEnvironment: sale.payment_environment ?? null,
        errorCode: manualFeeComputation.errorCode,
        detail: manualFeeComputation.detail,
      });

      return new Response(JSON.stringify({
        error: manualFeeComputation.message,
        error_code: manualFeeComputation.errorCode,
      }), {
        status: manualFeeComputation.httpStatus,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const officialFeeAmount = manualFeeComputation.engine.totalFee;
    if (!officialFeeAmount || officialFeeAmount <= 0) {
      return new Response(
        JSON.stringify({ error: "Taxa oficial da plataforma inválida", error_code: "official_platform_fee_invalid" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const feeDiff = Math.abs(roundCurrency(originalFeeAmount) - roundCurrency(officialFeeAmount));
    const hasLinkedPlatformFeePayment = Boolean(sale.platform_fee_payment_id);
    if (feeDiff > 0.01 && hasLinkedPlatformFeePayment) {
      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        action: "platform_fee_checkout_blocked_amount_mismatch_existing_payment",
        source: "create-platform-fee-checkout",
        result: "rejected",
        paymentEnvironment: sale.payment_environment ?? null,
        errorCode: "manual_platform_fee_amount_mismatch_existing_payment",
        detail: `stored=${originalFeeAmount.toFixed(2)}|official=${officialFeeAmount.toFixed(2)}|payment_id=${sale.platform_fee_payment_id}`,
      });

      return new Response(JSON.stringify({
        error: "A taxa oficial diverge da cobrança já vinculada. Cancele/regularize a cobrança existente antes de reprocessar.",
        error_code: "manual_platform_fee_amount_mismatch_existing_payment",
        stored_amount: originalFeeAmount,
        official_amount: officialFeeAmount,
        payment_id: sale.platform_fee_payment_id,
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const feeAmount = officialFeeAmount;
    if (feeDiff > 0.01 && !hasLinkedPlatformFeePayment) {
      // Correção mínima: antes de falar com o Asaas, a venda manual passa a usar
      // o mesmo motor oficial do checkout público. Nunca alteramos cobrança já vinculada/paga.
      await supabaseAdmin
        .from("sales")
        .update({ platform_fee_amount: feeAmount })
        .eq("id", sale.id)
        .is("platform_fee_payment_id", null);

      await supabaseAdmin.from("sale_logs").insert({
        sale_id: sale.id,
        action: "platform_fee_official_amount_recalculated",
        description: `Taxa manual recalculada pelo motor oficial (de R$ ${originalFeeAmount.toFixed(2)} para R$ ${feeAmount.toFixed(2)}).`,
        company_id: sale.company_id,
      });
    }

    // Regra de blindagem: cobrança de taxa usa estritamente o ambiente persistido na venda.
    let paymentContext;
    try {
      paymentContext = resolvePaymentContext({
        mode: "platform_fee",
        sale,
      });
    } catch (contextError) {
      return new Response(JSON.stringify({
        error: "Ambiente da venda inválido ou ausente",
        error_code: "payment_environment_unresolved",
        detail: contextError instanceof Error ? contextError.message : String(contextError),
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logPaymentTrace("info", "create-platform-fee-checkout", "payment_context_loaded", {
      sale_id: sale.id,
      company_id: sale.company_id,
      payment_environment: paymentContext.environment,
      payment_owner_type: paymentContext.ownerType,
      asaas_base_url: paymentContext.baseUrl,
      api_key_source: paymentContext.apiKeySource,
      split_policy: paymentContext.splitPolicy.type,
      decision_trace: paymentContext.decisionTrace,
    });

    const platformApiKey = paymentContext.apiKey;
    if (!platformApiKey) {
      return new Response(JSON.stringify({ error: `Asaas API key not configured (${paymentContext.apiKeySource})` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const splitResolutionContext = await resolveManualPlatformFeeSplit({
      supabaseAdmin,
      sale,
      paymentEnvironment: paymentContext.environment,
      feeAmount,
      chargeAmount: feeAmount,
    });

    if (!splitResolutionContext.ok) {
      return new Response(JSON.stringify({
        error: splitResolutionContext.message,
        error_code: splitResolutionContext.errorCode,
      }), {
        status: splitResolutionContext.httpStatus,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logFeeEngineTrace({
      source: "create-platform-fee-checkout",
      saleId: sale.id,
      companyId: sale.company_id,
      grossAmount: feeAmount,
      representativeEligible: splitResolutionContext.splitResolution.representative.eligible,
      engine: manualFeeComputation.engine,
      distribution: splitResolutionContext.distribution,
    });

    // Proteção crítica: antes de criar nova cobrança, valida se já existe cobrança ativa/paga.
    const existingOutcome = await resolveExistingPlatformFeePayment({
      supabaseAdmin,
      sale,
      paymentContext,
      apiKey: platformApiKey,
      startedAt,
    });

    if (existingOutcome?.type === "already_paid") {
      return new Response(JSON.stringify({
        already_paid: true,
        reused_existing_payment: true,
        payment_id: existingOutcome.paymentId,
        payment_status: existingOutcome.asaasStatus,
        url: existingOutcome.invoiceUrl,
        message: "Taxa da plataforma já estava paga e foi convergida localmente.",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (existingOutcome?.type === "reused_pending") {
      const existingHasManualSplitSnapshot =
        sale.split_snapshot_source === "create-platform-fee-checkout" &&
        Boolean(sale.split_snapshot_captured_at) &&
        Math.abs(Number(sale.split_snapshot_platform_fee_total ?? 0) - feeAmount) <= 0.01;

      if (!existingHasManualSplitSnapshot) {
        await logSaleOperationalEvent({
          supabaseAdmin,
          saleId: sale.id,
          companyId: sale.company_id,
          action: "platform_fee_checkout_blocked_legacy_pending_without_split_snapshot",
          source: "create-platform-fee-checkout",
          result: "rejected",
          paymentEnvironment: paymentContext.environment,
          errorCode: "legacy_pending_platform_fee_without_split_snapshot",
          detail: `payment_id=${existingOutcome.paymentId}`,
        });

        return new Response(JSON.stringify({
          error: "Cobrança pendente da taxa foi criada antes do split oficial. Cancele a cobrança pendente no Asaas e gere uma nova cobrança com split.",
          error_code: "legacy_pending_platform_fee_without_split_snapshot",
          payment_id: existingOutcome.paymentId,
        }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        reused_existing_payment: true,
        payment_id: existingOutcome.paymentId,
        payment_status: existingOutcome.asaasStatus,
        url: existingOutcome.invoiceUrl,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (existingOutcome?.type === "blocked_unverifiable") {
      return new Response(JSON.stringify({
        error: "Não foi possível validar a cobrança existente da taxa. Nova cobrança bloqueada para evitar duplicidade.",
        error_code: "existing_platform_fee_unverifiable",
        payment_id: existingOutcome.paymentId,
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (existingOutcome?.type === "blocked_disallowed_billing_type") {
      return new Response(JSON.stringify({
        error: "Esta cobrança antiga possui uma forma de pagamento não permitida. Cancele a cobrança anterior e gere uma nova cobrança em Pix ou Cartão de crédito.",
        error_code: "disallowed_billing_type",
        payment_id: existingOutcome.paymentId,
        billing_type: existingOutcome.billingType,
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (existingOutcome?.type === "blocked_terminal_or_invalid") {
      return new Response(JSON.stringify({
        error: "Existe uma cobrança vinculada em status terminal. Para gerar uma nova cobrança, é necessária ação administrativa explícita.",
        error_code: "existing_platform_fee_terminal_requires_admin_action",
        payment_id: existingOutcome.paymentId,
        asaas_status: existingOutcome.asaasStatus,
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (consultOnly) {
      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        action: "platform_fee_checkout_consult_only_blocked_no_reusable_payment",
        source: "create-platform-fee-checkout",
        result: "warning",
        paymentEnvironment: paymentContext.environment,
        errorCode: "consult_only_without_reusable_payment",
        detail: `platform_fee_payment_id=${sale.platform_fee_payment_id ?? "null"}`,
      });

      return new Response(
        JSON.stringify({
          error: "Não existe cobrança reutilizável para consulta. Use reprocessamento para avaliar nova geração.",
          error_code: "consult_only_without_reusable_payment",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get or create customer for the company admin
    const { data: companyData } = await supabaseAdmin
      .from("companies")
      .select("name, document_number, cnpj, email")
      .eq("id", sale.company_id)
      .single();

    const companyDoc = (companyData?.document_number || companyData?.cnpj || "").replace(/\D/g, "");
    const companyName = companyData?.name || "Empresa";

    let customerId: string | null = null;

    if (companyDoc) {
      const searchRes = await fetch(
        `${paymentContext.baseUrl}/customers?cpfCnpj=${companyDoc}`,
        { headers: { "access_token": platformApiKey } }
      );
      const searchData = await searchRes.json();
      if (searchData?.data?.length > 0) {
        customerId = searchData.data[0].id;
      }
    }

    if (!customerId) {
      const createRes = await fetch(`${paymentContext.baseUrl}/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "access_token": platformApiKey,
        },
        body: JSON.stringify({
          name: companyName,
          cpfCnpj: companyDoc || undefined,
          email: companyData?.email || undefined,
          externalReference: `company_${sale.company_id}`,
          // Evita habilitação padrão de mensageria paga (SMS) em novos customers no Asaas.
          notificationDisabled: true,
        }),
      });
      const customerData = await createRes.json();
      if (!createRes.ok) {
        return new Response(
          JSON.stringify({ error: customerData?.errors?.[0]?.description || "Erro ao criar cliente no Asaas" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      customerId = customerData.id;
    }

    // Create payment for the platform fee
    const eventName = sale.event?.name || "Evento";
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);

    const splitArray = splitResolutionContext.splitResolution.recipients.map((recipient) => ({
      walletId: recipient.walletId,
      percentualValue: recipient.percentualValue,
    }));
    const totalSplitPercent = roundCurrency(
      splitArray.reduce((sum, recipient) => sum + recipient.percentualValue, 0),
    );
    if (totalSplitPercent > 100) {
      return new Response(JSON.stringify({
        error: "Soma do split da taxa manual excede 100%",
        error_code: "manual_platform_fee_split_exceeds_limit",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paymentPayload = {
      customer: customerId,
      // Boleto não é permitido no SmartBus: a taxa administrativa também sai restrita a Pix.
      billingType: "PIX",
      value: feeAmount,
      dueDate: dueDate.toISOString().split("T")[0],
      description: `Taxa da Plataforma — Venda Manual "${eventName}" (${sale.quantity} passagem(ns))`,
      externalReference: `platform_fee_${sale.id}`,
      // Cobrança continua separada, mas o split oficial da taxa sai no próprio payload.
      split: splitArray,
    };

    await logSaleIntegrationEvent({
      supabaseAdmin,
      saleId: sale.id,
      companyId: sale.company_id,
      paymentEnvironment: paymentContext.environment,
      provider: "asaas",
      direction: "outgoing_request",
      eventType: "platform_fee_checkout_create",
      externalReference: `platform_fee_${sale.id}`,
      httpStatus: null,
      processingStatus: "requested",
      resultCategory: "started",
      durationMs: Date.now() - startedAt,
      message: "Solicitação de cobrança da taxa manual com split oficial enviada ao Asaas",
      payloadJson: buildManualPlatformFeeAuditPayload({
        sale,
        paymentPayload,
        manualFeeComputation,
        splitResolutionContext,
        feeAmount,
      }),
    });

    const paymentRes = await fetch(`${paymentContext.baseUrl}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access_token": platformApiKey,
      },
      body: JSON.stringify(paymentPayload),
    });

    const paymentData = await paymentRes.json();

    if (!paymentRes.ok) {
      await logSaleIntegrationEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        paymentEnvironment: paymentContext.environment,
        provider: "asaas",
        direction: "outgoing_request",
        eventType: "platform_fee_checkout_create",
        externalReference: `platform_fee_${sale.id}`,
        httpStatus: paymentRes.status,
        processingStatus: "failed",
        resultCategory: "error",
        incidentCode: "manual_platform_fee_create_failed",
        durationMs: Date.now() - startedAt,
        message: "Erro ao criar cobrança da taxa manual com split oficial no Asaas",
        payloadJson: buildManualPlatformFeeAuditPayload({
          sale,
          paymentPayload,
          manualFeeComputation,
          splitResolutionContext,
          feeAmount,
        }),
        responseJson: paymentData,
      });

      return new Response(
        JSON.stringify({ error: paymentData?.errors?.[0]?.description || "Erro ao criar cobrança no Asaas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const saleSnapshotUpdate = buildManualPlatformFeeSaleSnapshotUpdate({
      feeAmount,
      saleGrossAmount: Number(sale.gross_amount ?? 0),
      splitResolutionContext,
      paymentData,
    });

    await supabaseAdmin
      .from("sales")
      .update(saleSnapshotUpdate)
      .eq("id", sale.id)
      // Blindagem de corrida: não sobrescreve vínculo já preenchido por outro fluxo concorrente.
      .is("platform_fee_payment_id", null);

    await supabaseAdmin.from("sale_logs").insert({
      sale_id: sale.id,
      action: "platform_fee_checkout_created",
      description: `Cobrança da taxa da plataforma criada no Asaas (R$ ${feeAmount.toFixed(2)}). Payment: ${paymentData.id}`,
      company_id: sale.company_id,
    });

    await logSaleIntegrationEvent({
      supabaseAdmin,
      saleId: sale.id,
      companyId: sale.company_id,
      paymentEnvironment: paymentContext.environment,
      provider: "asaas",
      direction: "outgoing_request",
      eventType: "platform_fee_checkout_create",
      paymentId: paymentData.id,
      externalReference: `platform_fee_${sale.id}`,
      httpStatus: 200,
      processingStatus: "success",
      resultCategory: "success",
      durationMs: Date.now() - startedAt,
      message: "Nova cobrança da taxa da plataforma criada com split oficial",
      payloadJson: buildManualPlatformFeeAuditPayload({
        sale,
        paymentPayload,
        manualFeeComputation,
        splitResolutionContext,
        feeAmount,
      }),
      responseJson: {
        url: paymentData.invoiceUrl,
        payment_id: paymentData.id,
        split_recipients: splitArray.length,
      },
    });

    return new Response(
      JSON.stringify({ url: paymentData.invoiceUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    logPaymentTrace("error", "create-platform-fee-checkout", "unexpected_error", {
      error_message: error instanceof Error ? error.message : String(error),
    });
    console.error("Error in create-platform-fee-checkout:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});


type ManualPlatformFeeComputationResult =
  | {
      ok: true;
      passengerUnitPrices: number[];
      passengerSnapshots: CheckoutPassengerSnapshotInput[];
      engine: ReturnType<typeof computeProgressiveFeeForPassengers>;
    }
  | {
      ok: false;
      httpStatus: number;
      errorCode: string;
      message: string;
      detail: string;
    };

type ManualPlatformFeeSplitContext = {
  splitResolution: Awaited<ReturnType<typeof resolveAsaasSplitRecipients>>;
  distribution: ReturnType<typeof distributePlatformFee>;
  platformAmount: number;
  socioAmount: number;
  representativeAmount: number;
  splitPercentages: {
    socio: number;
    representative: number;
  };
};

type ManualPlatformFeeSplitResult =
  | ({ ok: true } & ManualPlatformFeeSplitContext)
  | {
      ok: false;
      httpStatus: number;
      errorCode: string;
      message: string;
    };

function toCents(value: number): number {
  return Math.round(Number(value || 0) * 100);
}

function centsToMoney(value: number): number {
  return roundCurrency(value / 100);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function splitAmountToChargePercent(amount: number, chargeAmount: number): number {
  const charge = Number(chargeAmount || 0);
  if (!Number.isFinite(charge) || charge <= 0) return 0;
  return roundCurrency((Number(amount || 0) / charge) * 100);
}

async function computeOfficialManualPlatformFee(params: {
  supabaseAdmin: SupabaseAdminClient;
  sale: ManualPlatformFeeSale;
}): Promise<ManualPlatformFeeComputationResult> {
  const { data: ticketRows, error: ticketError } = await params.supabaseAdmin
    .from("tickets")
    .select("trip_id, final_price, original_price, discount_amount, benefit_applied, ticket_type_id, ticket_type_name, ticket_type_price")
    .eq("sale_id", params.sale.id)
    .eq("company_id", params.sale.company_id)
    .order("created_at", { ascending: true });

  if (ticketError) {
    return {
      ok: false,
      httpStatus: 500,
      errorCode: "manual_ticket_snapshot_unavailable",
      message: "Não foi possível carregar os tickets para recalcular a taxa manual.",
      detail: ticketError.message,
    };
  }

  const passengerSnapshots = ((ticketRows ?? []) as CheckoutPassengerSnapshotInput[])
    .filter((ticket) => ticket.trip_id === params.sale.trip_id);

  if (passengerSnapshots.length <= 0) {
    return {
      ok: false,
      httpStatus: 409,
      errorCode: "manual_ticket_snapshot_missing",
      message: "Venda manual sem snapshot de passagem principal para recalcular a taxa oficial.",
      detail: `sale_id=${params.sale.id}|trip_id=${params.sale.trip_id}`,
    };
  }

  const passengerUnitPrices = passengerSnapshots.map(resolvePassengerFinancialUnitPrice);
  const engine = computeProgressiveFeeForPassengers(passengerUnitPrices);

  return {
    ok: true,
    passengerUnitPrices,
    passengerSnapshots,
    engine,
  };
}

async function resolveManualPlatformFeeSplit(params: {
  supabaseAdmin: SupabaseAdminClient;
  sale: ManualPlatformFeeSale;
  paymentEnvironment: "production" | "sandbox";
  feeAmount: number;
  chargeAmount: number;
}): Promise<ManualPlatformFeeSplitResult> {
  try {
    // Primeiro resolvemos apenas a elegibilidade do representante; a divisão oficial
    // depende desta resposta, mas a cobrança manual continua sendo da plataforma.
    const preResolution = await resolveAsaasSplitRecipients({
      supabaseAdmin: params.supabaseAdmin,
      source: "create-platform-fee-checkout",
      saleId: params.sale.id,
      companyId: params.sale.company_id,
      paymentEnvironment: params.paymentEnvironment,
      splitEnabled: params.feeAmount > 0,
      platformFeePercent: 100,
      socioSplitPercent: 100,
      representativeId: params.sale.representative_id ?? null,
      includePlatformRecipient: false,
      platformWalletId: null,
      distributionPercentages: {
        platform: 0,
        socio: 1,
        representative: 1,
      },
    });

    const distribution = distributePlatformFee({
      totalFee: params.feeAmount,
      representativeEligible: preResolution.representative.eligible,
    });

    const socioChargePercent = splitAmountToChargePercent(distribution.socioAmount, params.chargeAmount);
    const representativeChargePercent = splitAmountToChargePercent(
      distribution.representativeAmount,
      params.chargeAmount,
    );

    const splitResolution = await resolveAsaasSplitRecipients({
      supabaseAdmin: params.supabaseAdmin,
      source: "create-platform-fee-checkout",
      saleId: params.sale.id,
      companyId: params.sale.company_id,
      paymentEnvironment: params.paymentEnvironment,
      splitEnabled: params.feeAmount > 0,
      platformFeePercent: 100,
      socioSplitPercent: socioChargePercent,
      representativeId: params.sale.representative_id ?? null,
      includePlatformRecipient: false,
      platformWalletId: null,
      distributionPercentages: {
        // Em cobrança criada pela conta da plataforma, Marketplace é o saldo retido
        // pela própria cobrança; sócio/representante entram como split efetivo.
        platform: splitAmountToChargePercent(distribution.platformAmount, params.chargeAmount),
        socio: socioChargePercent,
        representative: representativeChargePercent,
      },
    });

    const socioAmountCents = splitResolution.socio.included
      ? toCents(distribution.socioAmount)
      : 0;
    const representativeAmountCents = splitResolution.representative.eligible
      ? toCents(distribution.representativeAmount)
      : 0;
    const platformAmountCents = Math.max(
      toCents(params.feeAmount) - socioAmountCents - representativeAmountCents,
      0,
    );

    return {
      ok: true,
      splitResolution,
      distribution,
      platformAmount: centsToMoney(platformAmountCents),
      socioAmount: centsToMoney(socioAmountCents),
      representativeAmount: centsToMoney(representativeAmountCents),
      splitPercentages: {
        socio: splitResolution.socio.included ? socioChargePercent : 0,
        representative: splitResolution.representative.eligible ? representativeChargePercent : 0,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const [errorCode] = message.split(":");
    await logSaleOperationalEvent({
      supabaseAdmin: params.supabaseAdmin,
      saleId: params.sale.id,
      companyId: params.sale.company_id,
      action: "platform_fee_checkout_split_resolution_failed",
      source: "create-platform-fee-checkout",
      result: "error",
      paymentEnvironment: params.paymentEnvironment,
      errorCode: errorCode || "manual_platform_fee_split_resolution_failed",
      detail: message,
    });

    return {
      ok: false,
      httpStatus: errorCode === "missing_platform_wallet" ? 500 : 409,
      errorCode: errorCode || "manual_platform_fee_split_resolution_failed",
      message: "Falha ao resolver split financeiro da taxa manual.",
    };
  }
}

function buildManualPlatformFeeSaleSnapshotUpdate(params: {
  feeAmount: number;
  saleGrossAmount: number;
  splitResolutionContext: ManualPlatformFeeSplitContext;
  paymentData: Record<string, unknown>;
}) {
  const grossAmount = Number(params.saleGrossAmount || 0);
  const platformFeePercentOverSale = amountToGrossPercent(params.feeAmount, grossAmount);
  const representativePercentOverSale = amountToGrossPercent(
    params.splitResolutionContext.representativeAmount,
    grossAmount,
  );

  return {
    platform_fee_amount: params.feeAmount,
    platform_fee_total: params.feeAmount,
    platform_fee_payment_id: optionalString(params.paymentData.id),
    split_snapshot_platform_fee_percent: platformFeePercentOverSale,
    split_snapshot_socio_split_percent: params.splitResolutionContext.splitPercentages.socio,
    split_snapshot_representative_percent: representativePercentOverSale,
    split_snapshot_platform_fee_total: params.feeAmount,
    split_snapshot_socio_fee_amount: params.splitResolutionContext.socioAmount,
    split_snapshot_platform_net_amount: params.splitResolutionContext.platformAmount,
    split_snapshot_source: "create-platform-fee-checkout",
    split_snapshot_captured_at: new Date().toISOString(),
  };
}

function buildManualPlatformFeeAuditPayload(params: {
  sale: ManualPlatformFeeSale;
  paymentPayload: Record<string, unknown>;
  manualFeeComputation: Extract<ManualPlatformFeeComputationResult, { ok: true }>;
  splitResolutionContext: ManualPlatformFeeSplitContext;
  feeAmount: number;
}) {
  return {
    sale_id: params.sale.id,
    company_id: params.sale.company_id,
    payment_environment: params.sale.payment_environment ?? null,
    externalReference: `platform_fee_${params.sale.id}`,
    base_item_values: params.manualFeeComputation.passengerUnitPrices,
    platform_fee_engine: {
      total_fee: params.manualFeeComputation.engine.totalFee,
      total_uncapped_fee: params.manualFeeComputation.engine.totalUncappedFee,
      cap_hits: params.manualFeeComputation.engine.capHits,
      passenger_breakdown: params.manualFeeComputation.engine.passengerBreakdown,
    },
    fee_charged: params.feeAmount,
    distribution_expected: params.splitResolutionContext.distribution,
    distribution_effective: {
      marketplace_amount: params.splitResolutionContext.platformAmount,
      socio_amount: params.splitResolutionContext.socioAmount,
      representative_amount: params.splitResolutionContext.representativeAmount,
      socio_included: params.splitResolutionContext.splitResolution.socio.included,
      socio_reason: params.splitResolutionContext.splitResolution.socio.reason,
      representative_eligible: params.splitResolutionContext.splitResolution.representative.eligible,
      representative_reason: params.splitResolutionContext.splitResolution.representative.reason,
    },
    split_effective_sent: params.splitResolutionContext.splitResolution.recipients.map((recipient) => ({
      kind: recipient.kind,
      walletId: recipient.walletId,
      percentualValue: recipient.percentualValue,
    })),
    omitted_recipients: {
      socio: params.splitResolutionContext.splitResolution.socio.included
        ? null
        : params.splitResolutionContext.splitResolution.socio.reason,
      representative: params.splitResolutionContext.splitResolution.representative.eligible
        ? null
        : params.splitResolutionContext.splitResolution.representative.reason,
    },
    asaas_payload: params.paymentPayload,
  };
}

async function resolveExistingPlatformFeePayment(params: {
  supabaseAdmin: SupabaseAdminClient;
  sale: ManualPlatformFeeSale;
  paymentContext: { environment: "production" | "sandbox"; baseUrl: string };
  apiKey: string;
  startedAt: number;
}): Promise<
  | { type: "already_paid"; paymentId: string; asaasStatus: string; invoiceUrl: string | null }
  | { type: "reused_pending"; paymentId: string; asaasStatus: string; invoiceUrl: string | null }
  | { type: "blocked_unverifiable"; paymentId: string | null }
  | { type: "blocked_disallowed_billing_type"; paymentId: string; billingType: string | null }
  | { type: "blocked_terminal_or_invalid"; paymentId: string | null; asaasStatus: string | null }
  | null
> {
  const { supabaseAdmin, sale, paymentContext, apiKey, startedAt } = params;
  const externalReference = `platform_fee_${sale.id}`;

  const checkExistingByPaymentId = async (paymentId: string) => {
    const res = await fetch(`${paymentContext.baseUrl}/payments/${paymentId}`, {
      headers: { "access_token": apiKey },
    });

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      return "unverifiable" as const;
    }

    return await res.json();
  };

  const choosePaymentFromExternalReference = async () => {
    const res = await fetch(
      `${paymentContext.baseUrl}/payments?externalReference=${encodeURIComponent(externalReference)}&limit=20&offset=0`,
      { headers: { "access_token": apiKey } }
    );

    if (!res.ok) {
      return "unverifiable" as const;
    }

    const payload = await res.json();
    const data = Array.isArray(payload?.data) ? payload.data : [];
    if (data.length === 0) return null;

    /**
     * Comentário crítico:
     * quando há múltiplas cobranças no mesmo externalReference, a escolha precisa
     * ser determinística para reduzir risco de reaproveitar cobrança errada.
     * Priorizamos: confirmada > pendente reutilizável > mais recente.
     */
    const candidates = data
      .filter((row: Record<string, unknown>) => row?.id)
      .filter((row: Record<string, unknown>) => row?.externalReference === externalReference)
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
        const aTs = new Date(a?.dateCreated ?? 0).getTime();
        const bTs = new Date(b?.dateCreated ?? 0).getTime();
        return bTs - aTs;
      });

    const confirmedCandidate = candidates.find((row: Record<string, unknown>) =>
      ASAAS_CONFIRMED_STATUS.has(normalizeAsaasStatus(row?.status))
    );
    if (confirmedCandidate) return confirmedCandidate;

    const pendingCandidate = candidates.find((row: Record<string, unknown>) =>
      ASAAS_REUSABLE_PENDING_STATUS.has(normalizeAsaasStatus(row?.status))
    );
    if (pendingCandidate) return pendingCandidate;

    return candidates[0] ?? null;
  };

  let existingPayment: Record<string, unknown> | null = null;

  if (sale.platform_fee_payment_id) {
    // Regra de imutabilidade: se já existe `platform_fee_payment_id`, só consultamos esse ID.
    // Nunca buscamos por externalReference para substituir/corrigir automaticamente.
    const byId = await checkExistingByPaymentId(String(sale.platform_fee_payment_id));
    if (byId === "unverifiable") {
      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        action: "platform_fee_checkout_duplicate_attempt_blocked",
        source: "create-platform-fee-checkout",
        result: "warning",
        paymentEnvironment: paymentContext.environment,
        errorCode: "existing_platform_fee_unverifiable",
        detail: `payment_id=${sale.platform_fee_payment_id}`,
      });

      return { type: "blocked_unverifiable", paymentId: sale.platform_fee_payment_id };
    }
    if (!byId) {
      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        action: "platform_fee_checkout_blocked_existing_payment_not_found",
        source: "create-platform-fee-checkout",
        result: "warning",
        paymentEnvironment: paymentContext.environment,
        errorCode: "existing_platform_fee_not_found_on_asaas",
        detail: `payment_id=${sale.platform_fee_payment_id}`,
      });

      return {
        type: "blocked_terminal_or_invalid",
        paymentId: sale.platform_fee_payment_id,
        asaasStatus: "NOT_FOUND",
      };
    }
    existingPayment = byId;
  }

  if (!existingPayment) {
    // Busca por externalReference só é permitida quando o vínculo local ainda está vazio.
    const byExternalReference = await choosePaymentFromExternalReference();
    if (byExternalReference === "unverifiable") {
      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        action: "platform_fee_checkout_duplicate_attempt_blocked",
        source: "create-platform-fee-checkout",
        result: "warning",
        paymentEnvironment: paymentContext.environment,
        errorCode: "existing_platform_fee_lookup_unverifiable",
        detail: `external_reference=${externalReference}`,
      });

      return { type: "blocked_unverifiable", paymentId: sale.platform_fee_payment_id ?? null };
    }
    existingPayment = byExternalReference;
  }

  if (!existingPayment?.id) {
    return null;
  }

  const existingPaymentId = String(existingPayment.id);
  const existingBillingType = String(existingPayment.billingType ?? "").toUpperCase();
  if (existingBillingType && existingBillingType !== "PIX" && existingBillingType !== "CREDIT_CARD") {
    // Cobranças antigas da taxa em BOLETO/UNDEFINED não devem ser reabertas pelo SmartBus.
    await logSaleOperationalEvent({
      supabaseAdmin,
      saleId: sale.id,
      companyId: sale.company_id,
      action: "platform_fee_checkout_blocked_disallowed_billing_type",
      source: "create-platform-fee-checkout",
      result: "rejected",
      paymentEnvironment: paymentContext.environment,
      errorCode: "disallowed_billing_type",
      detail: `payment_id=${existingPaymentId}|billing_type=${existingBillingType}`,
    });

    return {
      type: "blocked_disallowed_billing_type",
      paymentId: existingPaymentId,
      billingType: existingBillingType,
    };
  }

  const asaasStatus = normalizeAsaasStatus(existingPayment.status);

  if (ASAAS_CONFIRMED_STATUS.has(asaasStatus)) {
    const confirmedAt = resolveAsaasConfirmedAtFromPayment(existingPayment);

    const { data: updatedSale } = await supabaseAdmin
      .from("sales")
      .update({
        platform_fee_status: "paid",
        platform_fee_paid_at: confirmedAt,
        payment_confirmed_at: confirmedAt,
        // Congela ID original quando já havia vínculo; só preenche quando estava nulo.
        platform_fee_payment_id: sale.platform_fee_payment_id ?? existingPaymentId,
        status: sale.status === "reservado" ? "pago" : sale.status,
      })
      .eq("id", sale.id)
      .in("platform_fee_status", ["pending", "failed"])
      .select("id")
      .maybeSingle();

    const canUseManualSplitSnapshotForCommission =
      sale.split_snapshot_source === "create-platform-fee-checkout" &&
      Boolean(sale.split_snapshot_captured_at);

    const { data: commissionRows, error: commissionError } = canUseManualSplitSnapshotForCommission
      ? await supabaseAdmin.rpc("upsert_representative_commission_for_sale", {
        p_sale_id: sale.id,
        p_source: "create-platform-fee-checkout:existing_paid",
      })
      : { data: [{ action: "skipped_missing_manual_split_snapshot", status: null }], error: null };

    if (commissionError) {
      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        action: "platform_fee_checkout_existing_paid_commission_failed",
        source: "create-platform-fee-checkout",
        result: "error",
        paymentEnvironment: paymentContext.environment,
        errorCode: "representative_commission_upsert_failed",
        detail: commissionError.message,
      });
    } else {
      const commissionRow = Array.isArray(commissionRows) ? commissionRows[0] : null;
      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        action: "platform_fee_checkout_existing_paid_commission_processed",
        source: "create-platform-fee-checkout",
        result: "success",
        paymentEnvironment: paymentContext.environment,
        detail: commissionRow
          ? `action=${commissionRow.action};status=${commissionRow.status ?? "n/a"}`
          : "action=none",
      });
    }

    await logSaleOperationalEvent({
      supabaseAdmin,
      saleId: sale.id,
      companyId: sale.company_id,
      action: "platform_fee_checkout_existing_paid_converged",
      source: "create-platform-fee-checkout",
      result: "success",
      paymentEnvironment: paymentContext.environment,
      detail: `payment_id=${existingPaymentId}|asaas_status=${asaasStatus}|updated=${Boolean(updatedSale)}`,
    });

    await logSaleIntegrationEvent({
      supabaseAdmin,
      saleId: sale.id,
      companyId: sale.company_id,
      paymentEnvironment: paymentContext.environment,
      provider: "asaas",
      direction: "outgoing_request",
      eventType: "platform_fee_checkout_idempotency",
      paymentId: existingPaymentId,
      externalReference,
      httpStatus: 200,
      processingStatus: "success",
      resultCategory: "payment_confirmed",
      incidentCode: "platform_fee_existing_payment_already_paid",
      durationMs: Date.now() - startedAt,
      message: "Cobrança existente já paga; venda convergida sem criar nova cobrança",
      payloadJson: { sale_id: sale.id, strategy: "existing_payment_id_or_external_reference" },
      responseJson: {
        payment_id: existingPaymentId,
        asaas_status: asaasStatus,
        already_paid: true,
      },
    });

    return {
      type: "already_paid",
      paymentId: existingPaymentId,
      asaasStatus,
      invoiceUrl: optionalString(existingPayment.invoiceUrl) ?? optionalString(existingPayment.bankSlipUrl),
    };
  }

  if (ASAAS_REUSABLE_PENDING_STATUS.has(asaasStatus)) {
    if (!sale.platform_fee_payment_id && existingPayment?.id) {
      // Primeira vinculação local (legado sem ID): permitido apenas quando estava vazio.
      await supabaseAdmin
        .from("sales")
        .update({ platform_fee_payment_id: existingPaymentId })
        .eq("id", sale.id)
        .is("platform_fee_payment_id", null);
    }

    await logSaleOperationalEvent({
      supabaseAdmin,
      saleId: sale.id,
      companyId: sale.company_id,
      action: "platform_fee_checkout_reused_existing_payment",
      source: "create-platform-fee-checkout",
      result: "ignored",
      paymentEnvironment: paymentContext.environment,
      detail: `payment_id=${existingPaymentId}|asaas_status=${asaasStatus}`,
    });

    await logSaleIntegrationEvent({
      supabaseAdmin,
      saleId: sale.id,
      companyId: sale.company_id,
      paymentEnvironment: paymentContext.environment,
      provider: "asaas",
      direction: "outgoing_request",
      eventType: "platform_fee_checkout_idempotency",
      paymentId: existingPaymentId,
      externalReference,
      httpStatus: 200,
      processingStatus: "ignored",
      resultCategory: "ignored",
      warningCode: "platform_fee_existing_payment_reused",
      durationMs: Date.now() - startedAt,
      message: "Cobrança existente reutilizada; nova cobrança não foi criada",
      payloadJson: { sale_id: sale.id },
      responseJson: {
        payment_id: existingPaymentId,
        asaas_status: asaasStatus,
        reused: true,
        invoice_url: optionalString(existingPayment.invoiceUrl),
      },
    });

    return {
      type: "reused_pending",
      paymentId: existingPaymentId,
      asaasStatus,
      invoiceUrl: optionalString(existingPayment.invoiceUrl) ?? optionalString(existingPayment.bankSlipUrl),
    };
  }

  if (ASAAS_ALLOW_NEW_CHARGE_STATUS.has(asaasStatus)) {
    await logSaleOperationalEvent({
      supabaseAdmin,
      saleId: sale.id,
      companyId: sale.company_id,
      action: "platform_fee_checkout_blocked_terminal_status_requires_admin_action",
      source: "create-platform-fee-checkout",
      result: "warning",
      paymentEnvironment: paymentContext.environment,
      errorCode: "platform_fee_existing_payment_terminal_status",
      detail: `payment_id=${existingPaymentId}|asaas_status=${asaasStatus}`,
    });

    await logSaleIntegrationEvent({
      supabaseAdmin,
      saleId: sale.id,
      companyId: sale.company_id,
      paymentEnvironment: paymentContext.environment,
      provider: "asaas",
      direction: "outgoing_request",
      eventType: "platform_fee_checkout_idempotency",
      paymentId: existingPaymentId,
      externalReference,
      httpStatus: 409,
      processingStatus: "warning",
      resultCategory: "warning",
      warningCode: "platform_fee_existing_payment_terminal_status",
      durationMs: Date.now() - startedAt,
      message: "Cobrança existente em status terminal; nova cobrança bloqueada (ação administrativa explícita necessária)",
      payloadJson: { sale_id: sale.id },
      responseJson: {
        payment_id: existingPaymentId,
        asaas_status: asaasStatus,
        allow_new_charge: false,
      },
    });

    return {
      type: "blocked_terminal_or_invalid",
      paymentId: existingPaymentId,
      asaasStatus,
    };
  }

  if (!ASAAS_ALLOW_NEW_CHARGE_STATUS.has(asaasStatus)) {
    await logSaleOperationalEvent({
      supabaseAdmin,
      saleId: sale.id,
      companyId: sale.company_id,
      action: "platform_fee_checkout_duplicate_attempt_blocked",
      source: "create-platform-fee-checkout",
      result: "warning",
      paymentEnvironment: paymentContext.environment,
      errorCode: "platform_fee_status_divergence_with_asaas",
      detail: `payment_id=${existingPaymentId}|asaas_status=${asaasStatus}`,
    });

    return { type: "blocked_unverifiable", paymentId: existingPaymentId };
  }

  return null;
}

function normalizeAsaasStatus(status: unknown): AsaasPaymentStatus {
  if (!status) return "";
  return String(status).toUpperCase() as AsaasPaymentStatus;
}

function resolveAsaasConfirmedAtFromPayment(payment: Record<string, unknown> | null): string {
  if (!payment) return new Date().toISOString();

  return payment?.confirmedDate
    || payment?.clientPaymentDate
    || payment?.paymentDate
    || payment?.dateCreated
    || new Date().toISOString();
}
