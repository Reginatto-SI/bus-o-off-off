import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  logPaymentTrace,
  logSaleIntegrationEvent,
  logSaleOperationalEvent,
} from "../_shared/payment-observability.ts";
import { resolvePaymentContext } from "../_shared/payment-context-resolver.ts";

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

    const feeAmount = Number(sale.platform_fee_amount);
    if (!feeAmount || feeAmount <= 0) {
      return new Response(
        JSON.stringify({ error: "Valor da taxa inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Asaas exige mínimo de R$ 5,00 para billingType UNDEFINED.
    const ASAAS_MIN_CHARGE = 5.0;
    if (feeAmount < ASAAS_MIN_CHARGE) {
      // Defesa em profundidade: o frontend já bloqueia a criação da venda manual abaixo do mínimo,
      // porém este backend mantém proteção explícita para chamadas indiretas/legadas fora do fluxo esperado.
      // Regra oficial atual: não gerar novos casos `waived` para taxa manual < R$ 5,00.
      await supabaseAdmin.from("sale_logs").insert({
        sale_id: sale.id,
        action: "platform_fee_minimum_blocked",
        description: `Tentativa bloqueada: taxa da plataforma (R$ ${feeAmount.toFixed(2)}) abaixo do mínimo Asaas (R$ ${ASAAS_MIN_CHARGE.toFixed(2)}).`,
        company_id: sale.company_id,
      });

      return new Response(
        JSON.stringify({
          error:
            "Não é possível gerar cobrança: taxa da plataforma abaixo do mínimo permitido no Asaas (R$ 5,00).",
          error_code: "platform_fee_below_minimum",
          minimum_amount: ASAAS_MIN_CHARGE,
          fee_amount: feeAmount,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    const paymentRes = await fetch(`${paymentContext.baseUrl}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access_token": platformApiKey,
      },
      body: JSON.stringify({
        customer: customerId,
        billingType: "UNDEFINED",
        value: feeAmount,
        dueDate: dueDate.toISOString().split("T")[0],
        description: `Taxa da Plataforma — Venda Manual "${eventName}" (${sale.quantity} passagem(ns))`,
        externalReference: `platform_fee_${sale.id}`,
      }),
    });

    const paymentData = await paymentRes.json();

    if (!paymentRes.ok) {
      return new Response(
        JSON.stringify({ error: paymentData?.errors?.[0]?.description || "Erro ao criar cobrança no Asaas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabaseAdmin
      .from("sales")
      .update({ platform_fee_payment_id: paymentData.id })
      .eq("id", sale.id);

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
      message: "Nova cobrança da taxa da plataforma criada",
      payloadJson: { sale_id: sale.id },
      responseJson: { url: paymentData.invoiceUrl, payment_id: paymentData.id },
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

async function resolveExistingPlatformFeePayment(params: {
  supabaseAdmin: ReturnType<typeof createClient<any>>;
  sale: Record<string, any>;
  paymentContext: { environment: "production" | "sandbox"; baseUrl: string };
  apiKey: string;
  startedAt: number;
}): Promise<
  | { type: "already_paid"; paymentId: string; asaasStatus: string; invoiceUrl: string | null }
  | { type: "reused_pending"; paymentId: string; asaasStatus: string; invoiceUrl: string | null }
  | { type: "blocked_unverifiable"; paymentId: string | null }
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
      .filter((row: any) => row?.id)
      .filter((row: any) => row?.externalReference === externalReference)
      .sort((a: any, b: any) => {
        const aTs = new Date(a?.dateCreated ?? 0).getTime();
        const bTs = new Date(b?.dateCreated ?? 0).getTime();
        return bTs - aTs;
      });

    const confirmedCandidate = candidates.find((row: any) =>
      ASAAS_CONFIRMED_STATUS.has(normalizeAsaasStatus(row?.status))
    );
    if (confirmedCandidate) return confirmedCandidate;

    const pendingCandidate = candidates.find((row: any) =>
      ASAAS_REUSABLE_PENDING_STATUS.has(normalizeAsaasStatus(row?.status))
    );
    if (pendingCandidate) return pendingCandidate;

    return candidates[0] ?? null;
  };

  let existingPayment: Record<string, any> | null = null;

  if (sale.platform_fee_payment_id) {
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
    existingPayment = byId;
  }

  if (!existingPayment) {
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

    if (existingPayment?.id && sale.platform_fee_payment_id !== existingPayment.id) {
      await supabaseAdmin
        .from("sales")
        .update({ platform_fee_payment_id: existingPayment.id })
        .eq("id", sale.id);
    }
  }

  if (!existingPayment?.id) {
    return null;
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
        platform_fee_payment_id: existingPayment.id,
        status: sale.status === "reservado" ? "pago" : sale.status,
      })
      .eq("id", sale.id)
      .in("platform_fee_status", ["pending", "failed"])
      .select("id")
      .maybeSingle();

    await logSaleOperationalEvent({
      supabaseAdmin,
      saleId: sale.id,
      companyId: sale.company_id,
      action: "platform_fee_checkout_existing_paid_converged",
      source: "create-platform-fee-checkout",
      result: "success",
      paymentEnvironment: paymentContext.environment,
      detail: `payment_id=${existingPayment.id}|asaas_status=${asaasStatus}|updated=${Boolean(updatedSale)}`,
    });

    await logSaleIntegrationEvent({
      supabaseAdmin,
      saleId: sale.id,
      companyId: sale.company_id,
      paymentEnvironment: paymentContext.environment,
      provider: "asaas",
      direction: "outgoing_request",
      eventType: "platform_fee_checkout_idempotency",
      paymentId: existingPayment.id,
      externalReference,
      httpStatus: 200,
      processingStatus: "success",
      resultCategory: "payment_confirmed",
      incidentCode: "platform_fee_existing_payment_already_paid",
      durationMs: Date.now() - startedAt,
      message: "Cobrança existente já paga; venda convergida sem criar nova cobrança",
      payloadJson: { sale_id: sale.id, strategy: "existing_payment_id_or_external_reference" },
      responseJson: {
        payment_id: existingPayment.id,
        asaas_status: asaasStatus,
        already_paid: true,
      },
    });

    return {
      type: "already_paid",
      paymentId: existingPayment.id,
      asaasStatus,
      invoiceUrl: existingPayment.invoiceUrl ?? existingPayment.bankSlipUrl ?? null,
    };
  }

  if (ASAAS_REUSABLE_PENDING_STATUS.has(asaasStatus)) {
    await logSaleOperationalEvent({
      supabaseAdmin,
      saleId: sale.id,
      companyId: sale.company_id,
      action: "platform_fee_checkout_reused_existing_payment",
      source: "create-platform-fee-checkout",
      result: "ignored",
      paymentEnvironment: paymentContext.environment,
      detail: `payment_id=${existingPayment.id}|asaas_status=${asaasStatus}`,
    });

    await logSaleIntegrationEvent({
      supabaseAdmin,
      saleId: sale.id,
      companyId: sale.company_id,
      paymentEnvironment: paymentContext.environment,
      provider: "asaas",
      direction: "outgoing_request",
      eventType: "platform_fee_checkout_idempotency",
      paymentId: existingPayment.id,
      externalReference,
      httpStatus: 200,
      processingStatus: "ignored",
      resultCategory: "ignored",
      warningCode: "platform_fee_existing_payment_reused",
      durationMs: Date.now() - startedAt,
      message: "Cobrança existente reutilizada; nova cobrança não foi criada",
      payloadJson: { sale_id: sale.id },
      responseJson: {
        payment_id: existingPayment.id,
        asaas_status: asaasStatus,
        reused: true,
        invoice_url: existingPayment.invoiceUrl ?? null,
      },
    });

    return {
      type: "reused_pending",
      paymentId: existingPayment.id,
      asaasStatus,
      invoiceUrl: existingPayment.invoiceUrl ?? existingPayment.bankSlipUrl ?? null,
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
      detail: `payment_id=${existingPayment.id}|asaas_status=${asaasStatus}`,
    });

    return { type: "blocked_unverifiable", paymentId: existingPayment.id };
  }

  // Status finalizado/expirado: permitimos nova cobrança e mantemos trilha explícita.
  await logSaleOperationalEvent({
    supabaseAdmin,
    saleId: sale.id,
    companyId: sale.company_id,
    action: "platform_fee_checkout_allow_new_charge_after_terminal_status",
    source: "create-platform-fee-checkout",
    result: "warning",
    paymentEnvironment: paymentContext.environment,
    detail: `previous_payment_id=${existingPayment.id}|asaas_status=${asaasStatus}`,
  });

  await logSaleIntegrationEvent({
    supabaseAdmin,
    saleId: sale.id,
    companyId: sale.company_id,
    paymentEnvironment: paymentContext.environment,
    provider: "asaas",
    direction: "outgoing_request",
    eventType: "platform_fee_checkout_idempotency",
    paymentId: existingPayment.id,
    externalReference,
    httpStatus: 200,
    processingStatus: "warning",
    resultCategory: "warning",
    warningCode: "platform_fee_existing_payment_terminal_status",
    durationMs: Date.now() - startedAt,
    message: "Cobrança anterior em status terminal; criação de nova cobrança permitida",
    payloadJson: { sale_id: sale.id },
    responseJson: {
      payment_id: existingPayment.id,
      asaas_status: asaasStatus,
      allow_new_charge: true,
    },
  });

  return null;
}

function normalizeAsaasStatus(status: unknown): AsaasPaymentStatus {
  if (!status) return "";
  return String(status).toUpperCase() as AsaasPaymentStatus;
}

function resolveAsaasConfirmedAtFromPayment(payment: Record<string, any> | null): string {
  if (!payment) return new Date().toISOString();

  return payment?.confirmedDate
    || payment?.clientPaymentDate
    || payment?.paymentDate
    || payment?.dateCreated
    || new Date().toISOString();
}
