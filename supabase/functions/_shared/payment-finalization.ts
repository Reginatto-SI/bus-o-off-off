import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// deno-lint-ignore no-explicit-any
type SupabaseAdmin = ReturnType<typeof createClient<any>>;
import {
  logCriticalPaymentIssue,
  logPaymentTrace,
  logSaleOperationalEvent,
} from "./payment-observability.ts";

export type TicketCreationStatus =
  | "created"
  | "skipped_existing"
  | "skipped_no_passengers"
  | "error";

export type PaymentFinalizationResult = {
  ok: boolean;
  httpStatus: number;
  state:
    | "finalized"
    | "already_finalized"
    | "inconsistent"
    | "warning"
    | "error";
  message: string;
  ticketStatus: TicketCreationStatus;
  ticketsCount: number;
};

export type SaleConsistencyState =
  | "healthy"
  | "inconsistent_paid_without_ticket"
  | "not_paid"
  | "not_found";

export type SaleConsistencyInspection = {
  state: SaleConsistencyState;
  sale: {
    id: string;
    company_id: string;
    status: string;
    asaas_payment_status: string | null;
    asaas_payment_id: string | null;
    payment_confirmed_at: string | null;
    platform_fee_paid_at: string | null;
    payment_environment: string | null;
  } | null;
  ticketsCount: number;
  reason: string;
};

export async function inspectSaleConsistency(
  supabaseAdmin: SupabaseAdmin,
  saleId: string,
): Promise<SaleConsistencyInspection> {
  const { data: sale, error: saleError } = await supabaseAdmin
    .from("sales")
    .select(
      "id, company_id, status, asaas_payment_status, asaas_payment_id, payment_confirmed_at, platform_fee_paid_at, payment_environment",
    )
    .eq("id", saleId)
    .maybeSingle();

  if (saleError || !sale) {
    return {
      state: "not_found",
      sale: null,
      ticketsCount: 0,
      reason: `Venda ${saleId} não encontrada`,
    };
  }

  const { count: ticketsCount } = await supabaseAdmin
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("sale_id", saleId);

  const safeTicketsCount = ticketsCount ?? 0;

  // Etapa 3: critério objetivo e auditável de inconsistência.
  // "pago" sem tickets é estado inconsistente que exige reconciliação.
  if (sale.status === "pago" && safeTicketsCount <= 0) {
    return {
      state: "inconsistent_paid_without_ticket",
      sale,
      ticketsCount: safeTicketsCount,
      reason: `Venda ${saleId} está paga e sem tickets`,
    };
  }

  if (sale.status !== "pago") {
    return {
      state: "not_paid",
      sale,
      ticketsCount: safeTicketsCount,
      reason: `Venda ${saleId} não está paga (status=${sale.status})`,
    };
  }

  return {
    state: "healthy",
    sale,
    ticketsCount: safeTicketsCount,
    reason: `Venda ${saleId} já está saudável`,
  };
}

export async function createTicketsFromPassengersShared(
  supabaseAdmin: SupabaseAdmin,
  saleId: string,
  companyId: string,
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

  const ticketInserts = passengers.map((p: Record<string, unknown>, index) => {
    const benefitApplied = Boolean(p.benefit_applied);
    const benefitProgramName = (p.benefit_program_name as string | null) ?? null;
    const discountAmount = Number(p.discount_amount ?? 0);
    const originalPrice = Number(p.original_price ?? 0);
    const finalPrice = Number(p.final_price ?? 0);

    /**
     * Snapshot financeiro/de benefício precisa chegar em tickets porque
     * sale_passengers é staging e pode ser limpo após finalização.
     * Se houver marcação de benefício sem os dados mínimos, registramos trilha explícita.
     */
    if (benefitApplied && (!benefitProgramName || discountAmount <= 0)) {
      logPaymentTrace("error", "payment-finalization", "ticket_benefit_snapshot_incomplete", {
        sale_id: saleId,
        company_id: companyId,
        passenger_index: index,
        passenger_cpf: p.passenger_cpf as string,
        benefit_program_name: benefitProgramName,
        discount_amount: discountAmount,
      });
    }

    return {
      sale_id: saleId,
      trip_id: p.trip_id as string,
      seat_id: (p.seat_id as string | null) ?? null,
      seat_label: p.seat_label as string,
      passenger_name: p.passenger_name as string,
      passenger_cpf: p.passenger_cpf as string,
      passenger_phone: (p.passenger_phone as string | null) ?? null,
      company_id: companyId,
      // Snapshot do tipo de passagem: preserva auditoria histórica mesmo se catálogo mudar.
      ticket_type_id: (p.ticket_type_id as string | null) ?? null,
      ticket_type_name: (p.ticket_type_name as string | null) ?? null,
      ticket_type_price: p.ticket_type_price == null ? null : Number(p.ticket_type_price),
      benefit_program_id: (p.benefit_program_id as string | null) ?? null,
      benefit_program_name: benefitProgramName,
      benefit_type: (p.benefit_type as string | null) ?? null,
      benefit_value: p.benefit_value == null ? null : Number(p.benefit_value),
      original_price: originalPrice,
      discount_amount: discountAmount,
      final_price: finalPrice,
      benefit_applied: benefitApplied,
      pricing_rule_version: (p.pricing_rule_version as string | null) ?? "beneficio_checkout_v1",
    };
  });

  const { error: ticketError } = await supabaseAdmin
    .from("tickets")
    .insert(ticketInserts);

  if (ticketError) {
    logPaymentTrace("error", "payment-finalization", "ticket_insert_with_benefit_snapshot_failed", {
      sale_id: saleId,
      company_id: companyId,
      error: ticketError.message,
    });
    return {
      status: "error",
      message: `Erro ao criar tickets da venda ${saleId}`,
    };
  }

  /**
   * Segurança operacional:
   * limpeza do staging só ocorre após inserção bem-sucedida em tickets.
   * Assim evitamos perder snapshot de benefício em caso de falha na cópia.
   */
  await supabaseAdmin.from("sale_passengers").delete().eq("sale_id", saleId);

  return {
    status: "created",
    message: `Tickets criados com sucesso para venda ${saleId}`,
  };
}

export async function finalizeConfirmedPayment(params: {
  supabaseAdmin: SupabaseAdmin;
  sale: {
    id: string;
    company_id: string;
    status: string;
    payment_environment?: string | null;
  };
  confirmedAt: string;
  asaasStatus: string;
  source: "asaas-webhook" | "verify-payment-status" | "reconcile-sale-payment";
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
  // Proteção mínima contra retry em loop indireto dentro da mesma execução.
  let ticketRetryAttemptedInThisRun = false;

  // Etapa 4: trilha operacional mínima por venda para facilitar suporte por sale_id.
  await logSaleOperationalEvent({
    supabaseAdmin,
    saleId: sale.id,
    companyId: sale.company_id,
    action: "payment_finalize_started",
    source,
    result: "started",
    paymentEnvironment: sale.payment_environment ?? null,
  });

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
      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        action: "payment_finalize_failed",
        source,
        result: "error",
        paymentEnvironment: sale.payment_environment ?? null,
        errorCode: "sale_update_failed",
        detail: updateError.message,
      });
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

  // Centralização Etapa 2/3: qualquer reconciliação passa por esta mesma rotina,
  // evitando fluxo paralelo que poderia divergir de webhook/verify.
  const ticketResult = await createTicketsFromPassengersShared(
    supabaseAdmin,
    sale.id,
    sale.company_id,
  );

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

    await logSaleOperationalEvent({
      supabaseAdmin,
      saleId: sale.id,
      companyId: sale.company_id,
      action: "payment_finalize_inconsistent",
      source,
      result: "inconsistent_paid_without_ticket",
      paymentEnvironment: sale.payment_environment ?? null,
      errorCode: "inconsistent_paid_without_ticket",
      detail: ticketResult.status,
    });

    /**
     * Mitigação mínima do bloqueante crítico:
     * tentamos uma reconciliação imediata na mesma transação lógica quando
     * o pagamento confirmou sem tickets. Não altera regra de negócio, apenas
     * evita depender exclusivamente de ação manual quando o staging ainda existe.
     */
    const retryTicketResult = !ticketRetryAttemptedInThisRun
      ? await createTicketsFromPassengersShared(
        supabaseAdmin,
        sale.id,
        sale.company_id,
      )
      : {
        status: "error" as const,
        message: "retry_guard_already_attempted",
      };
    ticketRetryAttemptedInThisRun = true;

    const { count: retriedTicketsCount } = await supabaseAdmin
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("sale_id", sale.id);

    if ((retriedTicketsCount ?? 0) > 0) {
      await logSaleOperationalEvent({
        supabaseAdmin,
        saleId: sale.id,
        companyId: sale.company_id,
        action: "payment_finalize_recovered_after_ticket_retry",
        source,
        result: "success",
        paymentEnvironment: sale.payment_environment ?? null,
        detail: `first_attempt=${ticketResult.status};retry_attempt=${retryTicketResult.status}`,
      });

      return {
        ok: true,
        httpStatus: 200,
        state: transitionedToPaid ? "finalized" : "already_finalized",
        message: `Venda ${sale.id} recuperada após retry imediato de geração de tickets`,
        ticketStatus: retryTicketResult.status,
        ticketsCount: retriedTicketsCount ?? 0,
      };
    }

    // Estado crítico rastreável: pagamento confirmado sem tickets mesmo após retry imediato.
    await logCriticalPaymentIssue({
      supabaseAdmin,
      source,
      errorCode: "payment_confirmed_ticket_generation_failed",
      saleId: sale.id,
      companyId: sale.company_id,
      paymentEnvironment: sale.payment_environment ?? null,
      paymentId: paymentId ?? null,
      detail: `first_attempt=${ticketResult.status};retry_attempt=${retryTicketResult.status}`,
    });

    await supabaseAdmin.from("sale_logs").insert({
      sale_id: sale.id,
      action: "payment_confirmed_ticket_generation_failed",
      description:
        `Pagamento confirmado via ${source}${eventType ? ` (${eventType})` : ""}, mas sem tickets após retry imediato. Ação manual: executar reconcile-sale-payment.`,
      company_id: sale.company_id,
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

  /**
   * Fase 1 representantes:
   * a comissão nasce APENAS após confirmação real de pagamento (venda paga)
   * e passa por função idempotente no banco para evitar duplicidade por sale_id.
   */
  const { data: commissionRows, error: commissionError } = await supabaseAdmin
    .rpc("upsert_representative_commission_for_sale", {
      p_sale_id: sale.id,
      p_source: source,
    });

  if (commissionError) {
    await logSaleOperationalEvent({
      supabaseAdmin,
      saleId: sale.id,
      companyId: sale.company_id,
      action: "representative_commission_failed",
      source,
      result: "error",
      paymentEnvironment: sale.payment_environment ?? null,
      errorCode: "representative_commission_upsert_failed",
      detail: commissionError.message,
    });
  } else {
    const commissionRow = Array.isArray(commissionRows)
      ? commissionRows[0]
      : null;

    await logSaleOperationalEvent({
      supabaseAdmin,
      saleId: sale.id,
      companyId: sale.company_id,
      action: "representative_commission_processed",
      source,
      result: "success",
      paymentEnvironment: sale.payment_environment ?? null,
      detail: commissionRow
        ? `action=${commissionRow.action};status=${commissionRow.status ?? "n/a"}`
        : "action=none",
    });
  }

  const { error: seatLockError } = await supabaseAdmin
    .from("seat_locks")
    .delete()
    .eq("sale_id", sale.id);

  if (seatLockError) {
    await logSaleOperationalEvent({
      supabaseAdmin,
      saleId: sale.id,
      companyId: sale.company_id,
      action: "payment_finalize_failed",
      source,
      result: "error",
      paymentEnvironment: sale.payment_environment ?? null,
      errorCode: "seat_lock_cleanup_failed",
      detail: seatLockError.message,
    });

    /**
     * Blindagem Etapa 1:
     * seat_locks é cleanup acessório. Se a venda já foi confirmada e os tickets existem,
     * não derrubamos o fluxo principal nem devolvemos erro ao provedor.
     * Os locks restantes expiram automaticamente e o suporte ganha trilha explícita.
     */
    return {
      ok: true,
      httpStatus: 200,
      state: "warning",
      message: `Venda ${sale.id} confirmada, mas falhou limpeza de seat_locks`,
      ticketStatus: ticketResult.status,
      ticketsCount: ticketsCount ?? 0,
    };
  }

  // Comentário operacional: logamos apenas quando houve transição real ou reconciliação.
  // Isso preserva idempotência e evita ruído em chamadas repetidas (webhook duplicado/polling/reprocessamento).
  if (
    writeSaleLog &&
    (transitionedToPaid || ticketResult.status === "created")
  ) {
    await supabaseAdmin.from("sale_logs").insert({
      sale_id: sale.id,
      action: "payment_confirmed",
      description: `Pagamento confirmado via ${source}${eventType ? ` (${eventType})` : ""}${paymentId ? `, payment ${paymentId}` : ""}.`,
      company_id: sale.company_id,
    });
  }

  await logSaleOperationalEvent({
    supabaseAdmin,
    saleId: sale.id,
    companyId: sale.company_id,
    action: "payment_finalize_completed",
    source,
    result: transitionedToPaid ? "payment_confirmed" : "healthy",
    paymentEnvironment: sale.payment_environment ?? null,
    detail: `ticket_status=${ticketResult.status}`,
  });

  // Validação leve pós-confirmação: reforça visibilidade sem alterar o fluxo.
  const postValidation = await inspectSaleConsistency(supabaseAdmin, sale.id);
  if (postValidation.state !== "healthy" || postValidation.ticketsCount <= 0) {
    await logSaleOperationalEvent({
      supabaseAdmin,
      saleId: sale.id,
      companyId: sale.company_id,
      action: "payment_post_confirmation_validation_failed",
      source,
      result: "warning",
      paymentEnvironment: sale.payment_environment ?? null,
      errorCode: "post_confirmation_validation_failed",
      detail: `state=${postValidation.state};tickets_count=${postValidation.ticketsCount}`,
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
