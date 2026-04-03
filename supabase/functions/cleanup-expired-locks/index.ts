import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type CleanupFlow = "checkout_publico" | "reserva_manual";
type CleanupAction = "executando" | "candidato" | "cancelado" | "ignorado" | "falhou" | "finalizado";
type CleanupLogLevel = "info" | "warn" | "error";

type CleanupContext = {
  execution_id: string;
  stage: string;
  action: CleanupAction;
  flow?: CleanupFlow;
  sale_id?: string | null;
  company_id?: string | null;
  payment_environment?: string | null;
  reason?: string | null;
  detail?: string | null;
  totals?: Record<string, number>;
};

function logCleanup(level: CleanupLogLevel, context: CleanupContext) {
  const payload = {
    source: "cleanup-expired-locks",
    timestamp: new Date().toISOString(),
    ...context,
  };

  const message = JSON.stringify(payload);
  if (level === "error") {
    console.error(message);
    return;
  }

  if (level === "warn") {
    console.warn(message);
    return;
  }

  console.info(message);
}

async function insertSaleLogsSafely(
  supabaseAdmin: any,
  logs: Array<{
    sale_id: string;
    action: string;
    description: string;
    company_id: string;
  }>,
  logContext: CleanupContext,
) {
  if (logs.length === 0) return;

  const { error } = await supabaseAdmin.from("sale_logs").insert(logs);
  if (error) {
    logCleanup("error", {
      ...logContext,
      action: "falhou",
      reason: "sale_logs_insert_failed",
      detail: error.message,
    });
  }
}

/**
 * Cleanup de duas naturezas diferentes de pendência operacional:
 * 1) checkout público (`pendente_pagamento`) continua usando `seat_locks.expires_at`;
 * 2) reserva manual administrativa (`reservado`) usa `sales.reservation_expires_at`.
 *
 * Essa separação protege a regra de negócio central:
 * - o checkout público precisa de TTL curto baseado em lock técnico do assento;
 * - o administrativo precisa de validade explícita na própria venda para não virar reserva eterna;
 * - os dois fluxos não podem compartilhar a mesma heurística sem risco de cancelamento indevido.
 *
 * Comentário de suporte: os logs abaixo foram reforçados para que cada execução e cada venda
 * afetada deixem rastro auditável com `sale_id`, `company_id`, `payment_environment`, fluxo
 * e motivo da decisão, sem transformar logging em dependência crítica do cleanup.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const executionId = crypto.randomUUID();

  try {
    const supabaseAdmin = createClient<any>(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const nowIso = new Date().toISOString();

    logCleanup("info", {
      execution_id: executionId,
      stage: "cleanup_started",
      action: "executando",
      detail: "Início da rotina oficial de cleanup de locks e reservas expiradas",
    });

    // 1) Busca locks expirados no momento atual.
    // A consulta é repetível e idempotente: se nada expirou, retorna rapidamente.
    const { data: expiredLocks, error: locksError } = await supabaseAdmin
      .from("seat_locks")
      .select("id, sale_id")
      .lt("expires_at", nowIso);

    if (locksError) {
      logCleanup("error", {
        execution_id: executionId,
        stage: "checkout_expired_lock_scan",
        action: "falhou",
        flow: "checkout_publico",
        reason: "expired_lock_query_failed",
        detail: locksError.message,
      });
      return new Response(JSON.stringify({ error: "Failed to fetch locks" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let cleanedLocks = expiredLocks?.length ?? 0;
    let checkoutCandidateCount = 0;
    let checkoutCancelledCount = 0;
    let checkoutIgnoredCount = 0;
    let orphanCheckoutCandidateCount = 0;
    let orphanCheckoutCancelledCount = 0;
    let orphanCheckoutIgnoredCount = 0;
    let manualCandidateCount = 0;
    let cancelledManualReservations = 0;
    let manualIgnoredCount = 0;

    if (!expiredLocks || expiredLocks.length === 0) {
      logCleanup("info", {
        execution_id: executionId,
        stage: "checkout_expired_lock_scan",
        action: "finalizado",
        flow: "checkout_publico",
        detail: "Nenhum lock expirado encontrado nesta execução",
        totals: { expired_locks: 0 },
      });
    }

    if (expiredLocks && expiredLocks.length > 0) {
      logCleanup("info", {
        execution_id: executionId,
        stage: "checkout_expired_lock_scan",
        action: "finalizado",
        flow: "checkout_publico",
        detail: "Locks expirados encontrados para avaliação",
        totals: { expired_locks: expiredLocks.length },
      });

      // 2) Extrai vendas candidatas ao cancelamento.
      // Nem toda venda com lock expirado deve ser cancelada imediatamente: primeiro
      // validamos se ainda não restou lock ativo para a mesma venda.
      const saleIds = [...new Set(expiredLocks.map((l) => l.sale_id).filter(Boolean))] as string[];
      let cancellableSaleIds = saleIds;

      if (saleIds.length > 0) {
        const { data: activeLocksForSales, error: activeLocksError } = await supabaseAdmin
          .from("seat_locks")
          .select("sale_id")
          .in("sale_id", saleIds)
          .gt("expires_at", nowIso);

        if (activeLocksError) {
          logCleanup("error", {
            execution_id: executionId,
            stage: "checkout_active_lock_validation",
            action: "falhou",
            flow: "checkout_publico",
            reason: "active_lock_query_failed",
            detail: activeLocksError.message,
          });
          return new Response(JSON.stringify({ error: "Failed to validate active locks" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const salesWithActiveLocks = new Set((activeLocksForSales ?? []).map((row) => row.sale_id).filter(Boolean));
        cancellableSaleIds = saleIds.filter((id) => !salesWithActiveLocks.has(id));
      }

      const { data: checkoutCandidates, error: checkoutCandidatesError } = saleIds.length > 0
        ? await supabaseAdmin
          .from("sales")
          .select("id, company_id, status, payment_environment")
          .in("id", saleIds)
        : { data: [], error: null };

      if (checkoutCandidatesError) {
        logCleanup("error", {
          execution_id: executionId,
          stage: "checkout_candidate_sales_fetch",
          action: "falhou",
          flow: "checkout_publico",
          reason: "candidate_sales_query_failed",
          detail: checkoutCandidatesError.message,
        });
        return new Response(JSON.stringify({ error: "Failed to fetch candidate sales" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      checkoutCandidateCount = checkoutCandidates?.length ?? 0;
      (checkoutCandidates ?? []).forEach((sale) => {
        const hasActiveLocks = !cancellableSaleIds.includes(sale.id);
        logCleanup(hasActiveLocks ? "warn" : "info", {
          execution_id: executionId,
          stage: "checkout_candidate_evaluated",
          action: hasActiveLocks ? "ignorado" : "candidato",
          flow: "checkout_publico",
          sale_id: sale.id,
          company_id: sale.company_id,
          payment_environment: sale.payment_environment ?? null,
          reason: hasActiveLocks
            ? "sale_has_active_lock_remaining"
            : `expired_seat_lock_without_active_lock;status=${sale.status}`,
        });
      });

      // 3) Cancela somente vendas ainda pendentes E sem lock ativo remanescente.
      // Essa condição evita cancelamento precoce em cenários de lock parcial.
      if (cancellableSaleIds.length > 0) {
        const { data: cancelledSales, error: cancelCheckoutError } = await supabaseAdmin
          .from("sales")
          .update({
            status: "cancelado",
            cancel_reason: "Reserva expirada automaticamente após 15 minutos sem confirmação de pagamento",
            cancelled_at: nowIso,
            reservation_expires_at: null,
          })
          .in("id", cancellableSaleIds)
          .eq("status", "pendente_pagamento")
          .select("id, company_id, payment_environment");

        if (cancelCheckoutError) {
          logCleanup("error", {
            execution_id: executionId,
            stage: "checkout_cancel_update",
            action: "falhou",
            flow: "checkout_publico",
            reason: "sales_cancel_update_failed",
            detail: cancelCheckoutError.message,
          });
          return new Response(JSON.stringify({ error: "Failed to cancel pending sales" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const cancelledSaleIds = new Set((cancelledSales ?? []).map((sale) => sale.id));
        checkoutCancelledCount = cancelledSales?.length ?? 0;
        checkoutIgnoredCount += Math.max(cancellableSaleIds.length - checkoutCancelledCount, 0);

        (cancelledSales ?? []).forEach((sale) => {
          logCleanup("info", {
            execution_id: executionId,
            stage: "checkout_cancel_update",
            action: "cancelado",
            flow: "checkout_publico",
            sale_id: sale.id,
            company_id: sale.company_id,
            payment_environment: sale.payment_environment ?? null,
            reason: "expired_seat_lock_without_active_lock",
          });
        });

        (checkoutCandidates ?? [])
          .filter((sale) => cancellableSaleIds.includes(sale.id) && !cancelledSaleIds.has(sale.id))
          .forEach((sale) => {
            logCleanup("warn", {
              execution_id: executionId,
              stage: "checkout_cancel_update",
              action: "ignorado",
              flow: "checkout_publico",
              sale_id: sale.id,
              company_id: sale.company_id,
              payment_environment: sale.payment_environment ?? null,
              reason: `sale_not_cancelled_by_status_guard;status=${sale.status}`,
            });
          });

        await insertSaleLogsSafely(
          supabaseAdmin,
          (cancelledSales ?? []).map((s) => ({
            sale_id: s.id,
            action: "auto_cancelled",
            description: `Venda cancelada automaticamente por expiração do checkout público (lock expirado sem lock ativo remanescente, env=${s.payment_environment ?? "unknown"}).`,
            company_id: s.company_id,
          })),
          {
            execution_id: executionId,
            stage: "checkout_sale_logs",
            flow: "checkout_publico",
            action: "executando",
          },
        );

        for (const s of cancelledSales ?? []) {
          const { error: passengerDeleteError } = await supabaseAdmin.from("sale_passengers").delete().eq("sale_id", s.id);
          if (passengerDeleteError) {
            logCleanup("error", {
              execution_id: executionId,
              stage: "checkout_passenger_cleanup",
              action: "falhou",
              flow: "checkout_publico",
              sale_id: s.id,
              company_id: s.company_id,
              payment_environment: s.payment_environment ?? null,
              reason: "sale_passengers_delete_failed",
              detail: passengerDeleteError.message,
            });
          }
        }
      }

      // 4) Remove locks expirados para liberar assentos no mapa público.
      // Checkout e seat map consideram somente locks com expires_at > now.
      const { error: deleteError } = await supabaseAdmin
        .from("seat_locks")
        .delete()
        .lt("expires_at", nowIso);

      if (deleteError) {
        logCleanup("error", {
          execution_id: executionId,
          stage: "checkout_lock_cleanup",
          action: "falhou",
          flow: "checkout_publico",
          reason: "expired_lock_delete_failed",
          detail: deleteError.message,
        });
      }

      cleanedLocks = expiredLocks.length;
    }

    // 4.1) Blindagem defensiva para checkout órfão:
    // mantém o pipeline oficial sem fluxo paralelo, mas cobre vendas pendentes do checkout
    // que não aparecem mais na trilha de lock expirado (ex.: lock sem sale_id rastreável).
    // Segurança: só atua após a mesma janela operacional do checkout público (15 min)
    // e exige ausência de ticket/lock ativo e ausência de confirmação financeira.
    const orphanCheckoutCutoffIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const { data: orphanCheckoutCandidates, error: orphanCheckoutCandidatesError } = await supabaseAdmin
      .from("sales")
      .select("id, company_id, payment_environment, asaas_payment_status, payment_confirmed_at")
      .eq("status", "pendente_pagamento")
      .eq("sale_origin", "online_checkout")
      .is("reservation_expires_at", null)
      .is("payment_confirmed_at", null)
      .lt("created_at", orphanCheckoutCutoffIso);

    if (orphanCheckoutCandidatesError) {
      logCleanup("error", {
        execution_id: executionId,
        stage: "checkout_orphan_candidate_scan",
        action: "falhou",
        flow: "checkout_publico",
        reason: "orphan_candidate_sales_query_failed",
        detail: orphanCheckoutCandidatesError.message,
      });
      return new Response(JSON.stringify({ error: "Failed to fetch orphan checkout candidates" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    orphanCheckoutCandidateCount = orphanCheckoutCandidates?.length ?? 0;

    const orphanSaleIds = (orphanCheckoutCandidates ?? []).map((sale) => sale.id);
    if (orphanSaleIds.length > 0) {
      const [activeLocksRes, ticketsRes] = await Promise.all([
        supabaseAdmin
          .from("seat_locks")
          .select("sale_id")
          .in("sale_id", orphanSaleIds)
          .gt("expires_at", nowIso),
        supabaseAdmin
          .from("tickets")
          .select("sale_id")
          .in("sale_id", orphanSaleIds),
      ]);

      if (activeLocksRes.error) {
        logCleanup("error", {
          execution_id: executionId,
          stage: "checkout_orphan_active_lock_validation",
          action: "falhou",
          flow: "checkout_publico",
          reason: "orphan_active_lock_query_failed",
          detail: activeLocksRes.error.message,
        });
        return new Response(JSON.stringify({ error: "Failed to validate orphan active locks" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (ticketsRes.error) {
        logCleanup("error", {
          execution_id: executionId,
          stage: "checkout_orphan_ticket_validation",
          action: "falhou",
          flow: "checkout_publico",
          reason: "orphan_ticket_query_failed",
          detail: ticketsRes.error.message,
        });
        return new Response(JSON.stringify({ error: "Failed to validate orphan tickets" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const salesWithActiveLocks = new Set((activeLocksRes.data ?? []).map((row) => row.sale_id).filter(Boolean));
      const salesWithTickets = new Set((ticketsRes.data ?? []).map((row) => row.sale_id).filter(Boolean));
      const cancellableAsaasStatuses = new Set([null, "PENDING", "AWAITING_RISK_ANALYSIS", "OVERDUE"]);

      const orphanCancellableSales = (orphanCheckoutCandidates ?? []).filter((sale) => {
        const hasActiveLock = salesWithActiveLocks.has(sale.id);
        const hasTicket = salesWithTickets.has(sale.id);
        const hasConfirmedAsaasStatus = sale.asaas_payment_status === "RECEIVED"
          || sale.asaas_payment_status === "CONFIRMED"
          || sale.asaas_payment_status === "RECEIVED_IN_CASH";
        const statusAllowsCancel = cancellableAsaasStatuses.has(sale.asaas_payment_status ?? null);

        const isCancellable = !hasActiveLock && !hasTicket && !hasConfirmedAsaasStatus && statusAllowsCancel;
        logCleanup(isCancellable ? "info" : "warn", {
          execution_id: executionId,
          stage: "checkout_orphan_candidate_evaluated",
          action: isCancellable ? "candidato" : "ignorado",
          flow: "checkout_publico",
          sale_id: sale.id,
          company_id: sale.company_id,
          payment_environment: sale.payment_environment ?? null,
          reason: isCancellable
            ? "pending_checkout_without_active_lock_or_ticket_after_window"
            : `orphan_guard_blocked;active_lock=${hasActiveLock};ticket=${hasTicket};asaas_status=${sale.asaas_payment_status ?? "null"}`,
        });
        return isCancellable;
      });

      if (orphanCancellableSales.length > 0) {
        const orphanCancellableIds = orphanCancellableSales.map((sale) => sale.id);
        const { data: cancelledOrphanSales, error: cancelOrphanError } = await supabaseAdmin
          .from("sales")
          .update({
            status: "cancelado",
            cancel_reason: "Checkout pendente expirado sem lock/ticket ativo (blindagem do cleanup oficial)",
            cancelled_at: nowIso,
            reservation_expires_at: null,
          })
          .in("id", orphanCancellableIds)
          .eq("status", "pendente_pagamento")
          .is("payment_confirmed_at", null)
          .select("id, company_id, payment_environment");

        if (cancelOrphanError) {
          logCleanup("error", {
            execution_id: executionId,
            stage: "checkout_orphan_cancel_update",
            action: "falhou",
            flow: "checkout_publico",
            reason: "orphan_sales_cancel_update_failed",
            detail: cancelOrphanError.message,
          });
          return new Response(JSON.stringify({ error: "Failed to cancel orphan pending sales" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        orphanCheckoutCancelledCount = cancelledOrphanSales?.length ?? 0;
        orphanCheckoutIgnoredCount += Math.max(orphanCancellableIds.length - orphanCheckoutCancelledCount, 0);

        await insertSaleLogsSafely(
          supabaseAdmin,
          (cancelledOrphanSales ?? []).map((sale) => ({
            sale_id: sale.id,
            action: "auto_cancelled",
            description: `Venda cancelada automaticamente por blindagem do checkout órfão (pendente > 15min sem lock/ticket ativo, env=${sale.payment_environment ?? "unknown"}).`,
            company_id: sale.company_id,
          })),
          {
            execution_id: executionId,
            stage: "checkout_orphan_sale_logs",
            flow: "checkout_publico",
            action: "executando",
          },
        );

        for (const sale of cancelledOrphanSales ?? []) {
          const { error: passengerDeleteError } = await supabaseAdmin.from("sale_passengers").delete().eq("sale_id", sale.id);
          if (passengerDeleteError) {
            logCleanup("error", {
              execution_id: executionId,
              stage: "checkout_orphan_passenger_cleanup",
              action: "falhou",
              flow: "checkout_publico",
              sale_id: sale.id,
              company_id: sale.company_id,
              payment_environment: sale.payment_environment ?? null,
              reason: "sale_passengers_delete_failed",
              detail: passengerDeleteError.message,
            });
          }

          const { error: seatLockDeleteError } = await supabaseAdmin.from("seat_locks").delete().eq("sale_id", sale.id);
          if (seatLockDeleteError) {
            logCleanup("error", {
              execution_id: executionId,
              stage: "checkout_orphan_lock_cleanup",
              action: "falhou",
              flow: "checkout_publico",
              sale_id: sale.id,
              company_id: sale.company_id,
              payment_environment: sale.payment_environment ?? null,
              reason: "seat_locks_delete_failed",
              detail: seatLockDeleteError.message,
            });
          }
        }
      }

      orphanCheckoutIgnoredCount += Math.max(orphanCheckoutCandidateCount - orphanCancellableSales.length, 0);
    }

    // 5) Reservas manuais do administrativo não usam seat_locks como fonte de verdade.
    // O vencimento fica explícito em `sales.reservation_expires_at` justamente para evitar
    // reservas eternas sem aplicar o TTL curto do checkout público a vendas humanas legítimas.
    const { data: expiredManualReservations, error: manualReservationsError } = await supabaseAdmin
      .from("sales")
      .select("id, company_id, payment_environment")
      .eq("status", "reservado")
      .not("reservation_expires_at", "is", null)
      .lt("reservation_expires_at", nowIso);

    if (manualReservationsError) {
      logCleanup("error", {
        execution_id: executionId,
        stage: "manual_expired_reservation_scan",
        action: "falhou",
        flow: "reserva_manual",
        reason: "manual_reservation_query_failed",
        detail: manualReservationsError.message,
      });
      return new Response(JSON.stringify({ error: "Failed to fetch manual reservations" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    manualCandidateCount = expiredManualReservations?.length ?? 0;
    (expiredManualReservations ?? []).forEach((sale) => {
      logCleanup("info", {
        execution_id: executionId,
        stage: "manual_candidate_evaluated",
        action: "candidato",
        flow: "reserva_manual",
        sale_id: sale.id,
        company_id: sale.company_id,
        payment_environment: sale.payment_environment ?? null,
        reason: "reservation_expires_at_in_past",
      });
    });

    if (expiredManualReservations && expiredManualReservations.length > 0) {
      const manualReservationIds = expiredManualReservations.map((sale) => sale.id);
      const { data: cancelledSales, error: cancelManualError } = await supabaseAdmin
        .from("sales")
        .update({
          status: "cancelado",
          cancel_reason: "Reserva manual administrativa expirada automaticamente por vencimento da validade da reserva",
          cancelled_at: nowIso,
          reservation_expires_at: null,
        })
        .in("id", manualReservationIds)
        .eq("status", "reservado")
        .select("id, company_id, payment_environment");

      if (cancelManualError) {
        logCleanup("error", {
          execution_id: executionId,
          stage: "manual_cancel_update",
          action: "falhou",
          flow: "reserva_manual",
          reason: "manual_sales_cancel_update_failed",
          detail: cancelManualError.message,
        });
        return new Response(JSON.stringify({ error: "Failed to cancel manual reservations" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cancelledManualIds = new Set((cancelledSales ?? []).map((sale) => sale.id));
      cancelledManualReservations = cancelledSales?.length ?? 0;
      manualIgnoredCount = Math.max(manualReservationIds.length - cancelledManualReservations, 0);

      (cancelledSales ?? []).forEach((sale) => {
        logCleanup("info", {
          execution_id: executionId,
          stage: "manual_cancel_update",
          action: "cancelado",
          flow: "reserva_manual",
          sale_id: sale.id,
          company_id: sale.company_id,
          payment_environment: sale.payment_environment ?? null,
          reason: "reservation_expires_at_in_past",
        });
      });

      (expiredManualReservations ?? [])
        .filter((sale) => !cancelledManualIds.has(sale.id))
        .forEach((sale) => {
          logCleanup("warn", {
            execution_id: executionId,
            stage: "manual_cancel_update",
            action: "ignorado",
            flow: "reserva_manual",
            sale_id: sale.id,
            company_id: sale.company_id,
            payment_environment: sale.payment_environment ?? null,
            reason: "manual_sale_not_cancelled_by_status_guard",
          });
        });

      await insertSaleLogsSafely(
        supabaseAdmin,
        (cancelledSales ?? []).map((sale) => ({
          sale_id: sale.id,
          action: "manual_reservation_auto_cancelled",
          description: `Reserva manual administrativa cancelada automaticamente por vencimento da validade configurada (env=${sale.payment_environment ?? "unknown"}).`,
          company_id: sale.company_id,
        })),
        {
          execution_id: executionId,
          stage: "manual_sale_logs",
          flow: "reserva_manual",
          action: "executando",
        },
      );

      // Vendas manuais reservadas ocupam assentos via tickets, não via seat_locks do checkout.
      // Ao expirar, apagamos tickets e resíduos acessórios para devolver a poltrona ao mapa operacional.
      for (const sale of cancelledSales ?? []) {
        const { error: ticketDeleteError } = await supabaseAdmin.from("tickets").delete().eq("sale_id", sale.id);
        if (ticketDeleteError) {
          logCleanup("error", {
            execution_id: executionId,
            stage: "manual_ticket_cleanup",
            action: "falhou",
            flow: "reserva_manual",
            sale_id: sale.id,
            company_id: sale.company_id,
            payment_environment: sale.payment_environment ?? null,
            reason: "tickets_delete_failed",
            detail: ticketDeleteError.message,
          });
        }

        const { error: seatLockDeleteError } = await supabaseAdmin.from("seat_locks").delete().eq("sale_id", sale.id);
        if (seatLockDeleteError) {
          logCleanup("error", {
            execution_id: executionId,
            stage: "manual_lock_cleanup",
            action: "falhou",
            flow: "reserva_manual",
            sale_id: sale.id,
            company_id: sale.company_id,
            payment_environment: sale.payment_environment ?? null,
            reason: "seat_locks_delete_failed",
            detail: seatLockDeleteError.message,
          });
        }

        const { error: passengerDeleteError } = await supabaseAdmin.from("sale_passengers").delete().eq("sale_id", sale.id);
        if (passengerDeleteError) {
          logCleanup("error", {
            execution_id: executionId,
            stage: "manual_passenger_cleanup",
            action: "falhou",
            flow: "reserva_manual",
            sale_id: sale.id,
            company_id: sale.company_id,
            payment_environment: sale.payment_environment ?? null,
            reason: "sale_passengers_delete_failed",
            detail: passengerDeleteError.message,
          });
        }
      }
    }

    logCleanup("info", {
      execution_id: executionId,
      stage: "cleanup_finished",
      action: "finalizado",
      detail: "Rotina oficial concluída",
      totals: {
        expired_locks_removed: cleanedLocks,
        checkout_candidates: checkoutCandidateCount,
        checkout_cancelled: checkoutCancelledCount,
        checkout_ignored: checkoutIgnoredCount,
        checkout_orphan_candidates: orphanCheckoutCandidateCount,
        checkout_orphan_cancelled: orphanCheckoutCancelledCount,
        checkout_orphan_ignored: orphanCheckoutIgnoredCount,
        manual_candidates: manualCandidateCount,
        manual_cancelled: cancelledManualReservations,
        manual_ignored: manualIgnoredCount,
      },
    });

    return new Response(JSON.stringify({
      cleaned: cleanedLocks,
      checkout_candidates: checkoutCandidateCount,
      checkout_cancelled: checkoutCancelledCount,
      checkout_ignored: checkoutIgnoredCount,
      checkout_orphan_candidates: orphanCheckoutCandidateCount,
      checkout_orphan_cancelled: orphanCheckoutCancelledCount,
      checkout_orphan_ignored: orphanCheckoutIgnoredCount,
      expired_manual_reservations: manualCandidateCount,
      cancelled_manual_reservations: cancelledManualReservations,
      ignored_manual_reservations: manualIgnoredCount,
      execution_id: executionId,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    logCleanup("error", {
      execution_id: executionId,
      stage: "cleanup_unexpected_error",
      action: "falhou",
      reason: "unexpected_error",
      detail: error instanceof Error ? error.message : String(error),
    });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Cleanup failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
