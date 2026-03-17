import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logPaymentTrace } from "./payment-observability.ts";

export type TicketCreationStatus = "created" | "skipped_existing" | "skipped_no_passengers" | "error";

export type PaymentFinalizationResult = {
  ok: boolean;
  httpStatus: number;
  state: "finalized" | "already_finalized" | "inconsistent" | "error";
  message: string;
  ticketStatus: TicketCreationStatus;
  ticketsCount: number;
};

export async function createTicketsFromPassengersShared(
  supabaseAdmin: ReturnType<typeof createClient>,
  saleId: string,
  companyId: string
): Promise<{ status: TicketCreationStatus; message: string }> {
  const { count: existingTickets } = await supabaseAdmin
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("sale_id", saleId);

  if ((existingTickets ?? 0) > 0) {
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

  const ticketInserts = passengers.map((p: Record<string, unknown>) => ({
    sale_id: saleId,
    trip_id: p.trip_id as string,
    seat_id: (p.seat_id as string | null) ?? null,
    seat_label: p.seat_label as string,
    passenger_name: p.passenger_name as string,
    passenger_cpf: p.passenger_cpf as string,
    passenger_phone: (p.passenger_phone as string | null) ?? null,
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

export async function finalizeConfirmedPayment(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  sale: {
    id: string;
    company_id: string;
    status: string;
  };
  confirmedAt: string;
  asaasStatus: string;
  source: "asaas-webhook" | "verify-payment-status";
  paymentId?: string | null;
  eventType?: string | null;
  allowStatusUpdate?: boolean;
  writeSaleLog?: boolean;
}): Promise<PaymentFinalizationResult> {
  const {
    supabaseAdmin,
    sale,
    confirmedAt,
    asaasStatus,
    source,
    paymentId,
    eventType,
  } = params;
  const allowStatusUpdate = params.allowStatusUpdate ?? true;
  const writeSaleLog = params.writeSaleLog ?? true;

  let transitionedToPaid = false;

  if (sale.status !== "pago" && allowStatusUpdate) {
    const { data: updatedSale, error: updateError } = await supabaseAdmin
      .from("sales")
      .update({
        status: "pago",
        asaas_payment_status: asaasStatus,
        payment_confirmed_at: confirmedAt,
      })
      .eq("id", sale.id)
      .in("status", ["pendente_pagamento", "reservado"])
      .select("id")
      .maybeSingle();

    if (updateError) {
      return {
        ok: false,
        httpStatus: 500,
        state: "error",
        message: `Falha ao atualizar venda ${sale.id} para pago`,
        ticketStatus: "error",
        ticketsCount: 0,
      };
    }

    if (updatedSale) {
      transitionedToPaid = true;
    }
  } else {
    await supabaseAdmin
      .from("sales")
      .update({ asaas_payment_status: asaasStatus })
      .eq("id", sale.id);
  }

  // Centralização Etapa 2: webhook e verify executam exatamente a mesma rotina de geração/reconciliação.
  const ticketResult = await createTicketsFromPassengersShared(supabaseAdmin, sale.id, sale.company_id);

  const { count: ticketsCount } = await supabaseAdmin
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("sale_id", sale.id);

  if ((ticketsCount ?? 0) <= 0) {
    logPaymentTrace("error", source, "payment_without_tickets", {
      sale_id: sale.id,
      company_id: sale.company_id,
      asaas_payment_status: asaasStatus,
      payment_id: paymentId ?? null,
      event_type: eventType ?? null,
      ticket_result: ticketResult.status,
      allow_status_update: allowStatusUpdate,
    });

    return {
      ok: false,
      httpStatus: 409,
      state: "inconsistent",
      message: `Venda ${sale.id} sem tickets após confirmação/reconciliação`,
      ticketStatus: ticketResult.status,
      ticketsCount: 0,
    };
  }

  const { error: seatLockError } = await supabaseAdmin.from("seat_locks").delete().eq("sale_id", sale.id);

  if (seatLockError) {
    return {
      ok: false,
      httpStatus: 500,
      state: "error",
      message: `Falha ao limpar seat_locks da venda ${sale.id}`,
      ticketStatus: ticketResult.status,
      ticketsCount: ticketsCount ?? 0,
    };
  }

  // Comentário operacional: logamos apenas quando houve transição real ou reconciliação.
  // Isso preserva idempotência e evita ruído em chamadas repetidas (webhook duplicado/polling).
  if (writeSaleLog && (transitionedToPaid || ticketResult.status === "created")) {
    await supabaseAdmin.from("sale_logs").insert({
      sale_id: sale.id,
      action: "payment_confirmed",
      description: `Pagamento confirmado via ${source}${eventType ? ` (${eventType})` : ""}${paymentId ? `, payment ${paymentId}` : ""}.`,
      company_id: sale.company_id,
    });
  }

  return {
    ok: true,
    httpStatus: 200,
    state: transitionedToPaid ? "finalized" : "already_finalized",
    message: `Venda ${sale.id} finalizada com tickets consistentes`,
    ticketStatus: ticketResult.status,
    ticketsCount: ticketsCount ?? 0,
  };
}
