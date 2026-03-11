import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type ProcessingStatus = "received" | "ignored" | "success" | "partial_failure" | "failed" | "unauthorized";
type ProcessingResult = {
  status: ProcessingStatus;
  httpStatus: number;
  message: string;
  responseBody: Record<string, unknown>;
  saleId?: string | null;
  companyId?: string | null;
  eventType?: string | null;
  paymentId?: string | null;
  externalReference?: string | null;
};

/**
 * Webhook do Asaas para processar notificações de pagamento.
 * Eventos processados:
 * - PAYMENT_CONFIRMED / PAYMENT_RECEIVED → marca venda como pago + gera tickets
 * - PAYMENT_OVERDUE / PAYMENT_DELETED / PAYMENT_REFUNDED → cancela venda + libera locks
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  let requestPayload: any = null;
  try {
    requestPayload = await req.json();
  } catch {
    requestPayload = null;
  }

  const eventType = requestPayload?.event ?? null;
  const payment = requestPayload?.payment ?? null;
  const paymentId = payment?.id ?? null;
  const externalReference = payment?.externalReference ?? null;

  // Log estruturado para facilitar debug no painel de Edge Functions.
  console.log(JSON.stringify({
    source: "asaas-webhook",
    stage: "received",
    eventType,
    paymentId,
    paymentStatus: payment?.status ?? null,
    billingType: payment?.billingType ?? null,
    externalReference,
  }));

  try {
    const webhookToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
    if (webhookToken) {
      const receivedToken = req.headers.get("asaas-access-token") || req.headers.get("x-asaas-webhook-token");
      if (receivedToken !== webhookToken) {
        const unauthorizedResult: ProcessingResult = {
          status: "unauthorized",
          httpStatus: 401,
          message: "Token de webhook inválido",
          responseBody: { error: "Invalid token" },
          eventType,
          paymentId,
          externalReference,
        };

        await persistIntegrationLog(supabaseAdmin, {
          ...unauthorizedResult,
          payload: requestPayload,
        });

        return jsonResponse(unauthorizedResult.httpStatus, unauthorizedResult.responseBody);
      }
    }

    if (!eventType || !payment) {
      const invalidPayloadResult: ProcessingResult = {
        status: "failed",
        httpStatus: 400,
        message: "Payload inválido: event/payment ausente",
        responseBody: { error: "Invalid payload" },
        eventType,
        paymentId,
        externalReference,
      };

      await persistIntegrationLog(supabaseAdmin, {
        ...invalidPayloadResult,
        payload: requestPayload,
      });

      return jsonResponse(invalidPayloadResult.httpStatus, invalidPayloadResult.responseBody);
    }

    const saleId = externalReference;
    const supportedEvents = ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE", "PAYMENT_DELETED", "PAYMENT_REFUNDED"];

    if (!supportedEvents.includes(eventType)) {
      const ignoredEventResult: ProcessingResult = {
        status: "ignored",
        httpStatus: 200,
        message: `Evento ignorado: ${eventType}`,
        responseBody: { received: true, ignored: true, reason: "unsupported_event" },
        eventType,
        paymentId,
        externalReference,
      };

      await persistIntegrationLog(supabaseAdmin, {
        ...ignoredEventResult,
        payload: requestPayload,
      });

      return jsonResponse(ignoredEventResult.httpStatus, ignoredEventResult.responseBody);
    }

    if (!saleId) {
      const isPlatformFee = payment?.description?.includes("Taxa da Plataforma") || String(paymentId ?? "").startsWith("platform_fee_");
      const reason = isPlatformFee ? "platform_fee_out_of_scope" : "missing_external_reference";

      const missingReferenceResult: ProcessingResult = {
        status: "ignored",
        httpStatus: 200,
        message: isPlatformFee
          ? "Evento de taxa de plataforma ignorado neste fluxo"
          : "externalReference ausente; webhook sem vínculo de venda",
        responseBody: { received: true, ignored: true, reason },
        eventType,
        paymentId,
        externalReference,
      };

      await persistIntegrationLog(supabaseAdmin, {
        ...missingReferenceResult,
        payload: requestPayload,
      });

      return jsonResponse(missingReferenceResult.httpStatus, missingReferenceResult.responseBody);
    }

    const { data: sale, error: saleError } = await supabaseAdmin
      .from("sales")
      .select("id, company_id, status, unit_price, quantity, gross_amount")
      .eq("id", saleId)
      .maybeSingle();

    if (saleError || !sale) {
      // Não retornamos 200 aqui para evitar falso sucesso quando o evento era aplicável a uma venda.
      const saleNotFoundResult: ProcessingResult = {
        status: "failed",
        httpStatus: 404,
        message: `Venda não localizada para externalReference=${saleId}`,
        responseBody: { error: "Sale not found", sale_id: saleId },
        saleId,
        eventType,
        paymentId,
        externalReference,
      };

      await persistIntegrationLog(supabaseAdmin, {
        ...saleNotFoundResult,
        payload: requestPayload,
      });

      return jsonResponse(saleNotFoundResult.httpStatus, saleNotFoundResult.responseBody);
    }

    let result: ProcessingResult;

    if (eventType === "PAYMENT_CONFIRMED" || eventType === "PAYMENT_RECEIVED") {
      result = await processPaymentConfirmed(supabaseAdmin, sale, payment, eventType);
    } else {
      result = await processPaymentFailed(supabaseAdmin, sale, payment, eventType);
    }

    result.eventType = eventType;
    result.paymentId = paymentId;
    result.externalReference = externalReference;

    await persistIntegrationLog(supabaseAdmin, {
      ...result,
      payload: requestPayload,
    });

    console.log(JSON.stringify({
      source: "asaas-webhook",
      stage: "finished",
      eventType,
      paymentId,
      paymentStatus: payment?.status ?? null,
      billingType: payment?.billingType ?? null,
      externalReference,
      saleId: result.saleId,
      companyId: result.companyId,
      processingStatus: result.status,
      httpStatus: result.httpStatus,
      message: result.message,
    }));

    return jsonResponse(result.httpStatus, result.responseBody);
  } catch (error) {
    const fallbackResult: ProcessingResult = {
      status: "failed",
      httpStatus: 500,
      message: `Erro inesperado no processamento principal: ${error instanceof Error ? error.message : "unknown_error"}`,
      responseBody: { error: "Webhook processing failed" },
      eventType,
      paymentId,
      externalReference,
    };

    await persistIntegrationLog(supabaseAdmin, {
      ...fallbackResult,
      payload: requestPayload,
    });

    console.error("Asaas webhook error:", error);
    return jsonResponse(fallbackResult.httpStatus, fallbackResult.responseBody);
  }
});

async function processPaymentConfirmed(
  supabaseAdmin: ReturnType<typeof createClient<any>>,
  sale: any,
  payment: any,
  eventType: string
): Promise<ProcessingResult> {
  const saleId = sale.id;

  if (sale.status !== "pago") {
    const { data: updatedSale, error: updateError } = await supabaseAdmin
      .from("sales")
      .update({
        status: "pago",
        asaas_payment_status: payment.status,
      })
      .eq("id", saleId)
      .in("status", ["pendente_pagamento", "reservado"])
      .select("id, company_id, status")
      .single();

    if (updateError || !updatedSale) {
      // Falha crítica: sem status pago consistente não podemos confirmar sucesso ao Asaas.
      return {
        status: "failed",
        httpStatus: 500,
        message: `Falha crítica ao atualizar venda ${saleId} para pago`,
        responseBody: { error: "Sale update failed", sale_id: saleId },
        saleId,
        companyId: sale.company_id,
      };
    }
  } else {
    // Idempotência: webhook repetido de venda já paga não deve duplicar efeitos colaterais.
    await supabaseAdmin
      .from("sales")
      .update({ asaas_payment_status: payment.status })
      .eq("id", saleId);
  }

  const ticketsResult = await createTicketsFromPassengers(supabaseAdmin, saleId, sale.company_id);
  if (ticketsResult.status === "error") {
    // Parcial: a venda foi paga, mas sem tickets operacionais não concluímos o fluxo.
    return {
      status: "partial_failure",
      httpStatus: 500,
      message: `Venda ${saleId} paga, mas falhou geração de tickets`,
      responseBody: { error: "Ticket generation failed", sale_id: saleId },
      saleId,
      companyId: sale.company_id,
    };
  }

  const { error: seatLockError } = await supabaseAdmin.from("seat_locks").delete().eq("sale_id", saleId);
  if (seatLockError) {
    // Falha crítica operacional: locks presos causam inconsistência de ocupação.
    return {
      status: "failed",
      httpStatus: 500,
      message: `Falha crítica ao remover seat_locks da venda ${saleId}`,
      responseBody: { error: "Seat lock cleanup failed", sale_id: saleId },
      saleId,
      companyId: sale.company_id,
    };
  }

  await upsertFinancialSnapshot(supabaseAdmin, saleId, sale.company_id, sale, payment);

  await supabaseAdmin.from("sale_logs").insert({
    sale_id: saleId,
    action: "payment_confirmed",
    description: `Pagamento ${eventType} via Asaas (Payment: ${payment.id}, billingType: ${payment.billingType || "unknown"}).`,
    company_id: sale.company_id,
  });

  return {
    status: ticketsResult.status === "skipped_existing" ? "success" : "success",
    httpStatus: 200,
    message: ticketsResult.message,
    responseBody: { received: true, processed: true, sale_id: saleId },
    saleId,
    companyId: sale.company_id,
  };
}

async function upsertFinancialSnapshot(
  supabaseAdmin: ReturnType<typeof createClient<any>>,
  saleId: string,
  companyId: string,
  sale: any,
  payment: any,
) {
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("platform_fee_percent, partner_split_percent")
    .eq("id", companyId)
    .single();

  if (company?.platform_fee_percent == null) {
    await supabaseAdmin.from("sale_logs").insert({
      sale_id: saleId,
      action: "payment_confirmed",
      description: `Pagamento confirmado sem cálculo financeiro: empresa ${companyId} sem platform_fee_percent (payment ${payment.id}).`,
      company_id: companyId,
    });
    return;
  }

  const platformFeePercent = Number(company.platform_fee_percent);
  const grossAmount = sale.gross_amount ?? (sale.unit_price * sale.quantity);
  const grossAmountCents = Math.round(grossAmount * 100);
  const platformFeeCents = Math.round(grossAmountCents * (platformFeePercent / 100));
  const platformFeeTotal = platformFeeCents / 100;

  const partnerSplitPercent = company?.partner_split_percent ?? 50;
  const { data: partner } = await supabaseAdmin
    .from("partners")
    .select("id, asaas_wallet_id, status")
    .eq("status", "ativo")
    .limit(1)
    .maybeSingle();

  let partnerFeeAmount = 0;
  let platformNetAmount = platformFeeTotal;

  if (partner?.asaas_wallet_id && partner.status === "ativo") {
    const partnerFeeCents = Math.round(platformFeeCents * (partnerSplitPercent / 100));
    partnerFeeAmount = partnerFeeCents / 100;
    platformNetAmount = (platformFeeCents - partnerFeeCents) / 100;
  }

  await supabaseAdmin
    .from("sales")
    .update({
      gross_amount: grossAmount,
      platform_fee_total: platformFeeTotal,
      partner_fee_amount: partnerFeeAmount,
      platform_net_amount: platformNetAmount,
      asaas_payment_status: payment.status,
    })
    .eq("id", saleId);
}

async function processPaymentFailed(
  supabaseAdmin: ReturnType<typeof createClient<any>>,
  sale: any,
  payment: any,
  eventType: string
): Promise<ProcessingResult> {
  const saleId = sale.id;

  const { error: updateError } = await supabaseAdmin
    .from("sales")
    .update({
      status: "cancelado",
      cancel_reason: `Pagamento ${eventType.toLowerCase().replace("payment_", "")} via Asaas`,
      cancelled_at: new Date().toISOString(),
      asaas_payment_status: payment.status,
    })
    .eq("id", saleId)
    .in("status", ["pendente_pagamento", "reservado"]);

  if (updateError) {
    // Falha crítica: cancelamento inconsistente precisa de retry do provedor.
    return {
      status: "failed",
      httpStatus: 500,
      message: `Falha crítica ao cancelar venda ${saleId}`,
      responseBody: { error: "Sale cancellation failed", sale_id: saleId },
      saleId,
      companyId: sale.company_id,
    };
  }

  await supabaseAdmin.from("tickets").delete().eq("sale_id", saleId);
  const { error: seatLockError } = await supabaseAdmin.from("seat_locks").delete().eq("sale_id", saleId);
  if (seatLockError) {
    return {
      status: "failed",
      httpStatus: 500,
      message: `Venda ${saleId} cancelada, mas falhou remoção de seat_locks`,
      responseBody: { error: "Seat lock cleanup failed", sale_id: saleId },
      saleId,
      companyId: sale.company_id,
    };
  }

  await supabaseAdmin.from("sale_passengers").delete().eq("sale_id", saleId);

  await supabaseAdmin.from("sale_logs").insert({
    sale_id: saleId,
    action: "payment_failed",
    description: `Pagamento ${eventType} via Asaas (Payment: ${payment.id}). Venda cancelada e assentos liberados.`,
    company_id: sale.company_id,
  });

  return {
    status: "success",
    httpStatus: 200,
    message: `Venda ${saleId} cancelada com sucesso`,
    responseBody: { received: true, processed: true, sale_id: saleId },
    saleId,
    companyId: sale.company_id,
  };
}

/**
 * Creates tickets from sale_passengers staging table (new public checkout flow).
 * If no sale_passengers exist (admin/legacy flow), does nothing.
 */
async function createTicketsFromPassengers(
  supabaseAdmin: ReturnType<typeof createClient<any>>,
  saleId: string,
  companyId: string
): Promise<{ status: "created" | "skipped_existing" | "skipped_no_passengers" | "error"; message: string }> {
  const { count: existingTickets } = await supabaseAdmin
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("sale_id", saleId);

  if (existingTickets && existingTickets > 0) {
    return {
      status: "skipped_existing",
      message: `Idempotência aplicada: venda ${saleId} já tinha tickets`,
    };
  }

  const { data: passengers, error: passError } = await supabaseAdmin
    .from("sale_passengers")
    .select("*")
    .eq("sale_id", saleId)
    .order("sort_order");

  if (passError) {
    return {
      status: "error",
      message: `Erro ao buscar sale_passengers da venda ${saleId}`,
    };
  }

  if (!passengers || passengers.length === 0) {
    return {
      status: "skipped_no_passengers",
      message: `Sem sale_passengers para a venda ${saleId} (fluxo legado/admin)`,
    };
  }

  const ticketInserts = passengers.map((p: any) => ({
    sale_id: saleId,
    trip_id: p.trip_id,
    seat_id: p.seat_id,
    seat_label: p.seat_label,
    passenger_name: p.passenger_name,
    passenger_cpf: p.passenger_cpf,
    passenger_phone: p.passenger_phone,
    company_id: companyId,
  }));

  const { error: ticketError } = await supabaseAdmin
    .from("tickets")
    .insert(ticketInserts);

  if (ticketError) {
    return {
      status: "error",
      message: `Erro ao criar tickets da venda ${saleId}`,
    };
  }

  await supabaseAdmin.from("sale_passengers").delete().eq("sale_id", saleId);

  return {
    status: "created",
    message: `Tickets criados com sucesso para venda ${saleId}`,
  };
}

async function persistIntegrationLog(
  supabaseAdmin: ReturnType<typeof createClient<any>>,
  params: ProcessingResult & { payload: unknown }
) {
  try {
    // Persistimos a trilha técnica para diagnóstico administrativo e auditoria de integração.
    await supabaseAdmin.from("sale_integration_logs").insert({
      sale_id: params.saleId ?? null,
      company_id: params.companyId ?? null,
      provider: "asaas",
      direction: "incoming_webhook",
      event_type: params.eventType ?? null,
      payment_id: params.paymentId ?? null,
      external_reference: params.externalReference ?? null,
      http_status: params.httpStatus,
      processing_status: params.status,
      message: params.message,
      payload_json: params.payload,
      response_json: params.responseBody,
    });
  } catch (logError) {
    console.error("[asaas-webhook] failed to persist integration log", logError);
  }
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
