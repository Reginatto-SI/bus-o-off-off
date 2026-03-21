import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Cleanup de duas naturezas diferentes de pendência operacional:
 * 1) checkout público (`pendente_pagamento`) continua usando `seat_locks.expires_at`;
 * 2) reserva manual administrativa (`reservado`) usa `sales.reservation_expires_at`.
 *
 * Essa separação protege a regra de negócio central:
 * - o checkout público precisa de TTL curto baseado em lock técnico do assento;
 * - o administrativo precisa de validade explícita na própria venda para não virar reserva eterna;
 * - os dois fluxos não podem compartilhar a mesma heurística sem risco de cancelamento indevido.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const nowIso = new Date().toISOString();

    // 1) Busca locks expirados no momento atual.
    // A consulta é repetível e idempotente: se nada expirou, retorna rapidamente.
    const { data: expiredLocks, error: locksError } = await supabaseAdmin
      .from("seat_locks")
      .select("id, sale_id")
      .lt("expires_at", nowIso);

    if (locksError) {
      console.error("Error fetching expired locks:", locksError);
      return new Response(JSON.stringify({ error: "Failed to fetch locks" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let cleanedLocks = expiredLocks?.length ?? 0;

    if (!expiredLocks || expiredLocks.length === 0) {
      console.log("No expired checkout locks found");
    }

    if (expiredLocks && expiredLocks.length > 0) {
      console.log(`Found ${expiredLocks.length} expired seat locks`);

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
          console.error("Error fetching active locks for candidate sales:", activeLocksError);
          return new Response(JSON.stringify({ error: "Failed to validate active locks" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const salesWithActiveLocks = new Set((activeLocksForSales ?? []).map((row) => row.sale_id).filter(Boolean));
        cancellableSaleIds = saleIds.filter((id) => !salesWithActiveLocks.has(id));
      }

      // 3) Cancela somente vendas ainda pendentes E sem lock ativo remanescente.
      // Essa condição evita cancelamento precoce em cenários de lock parcial.
      if (cancellableSaleIds.length > 0) {
        const { data: cancelledSales } = await supabaseAdmin
          .from("sales")
          .update({
            status: "cancelado",
            cancel_reason: "Reserva expirada automaticamente após 15 minutos sem confirmação de pagamento",
            cancelled_at: nowIso,
            reservation_expires_at: null,
          })
          .in("id", cancellableSaleIds)
          .eq("status", "pendente_pagamento")
          .select("id, company_id");

        if (cancelledSales && cancelledSales.length > 0) {
          console.log(`Cancelled ${cancelledSales.length} expired pending sales`);

          const logs = cancelledSales.map((s) => ({
            sale_id: s.id,
            action: "auto_cancelled",
            description: "Venda cancelada automaticamente por expiração de reserva (15 minutos sem confirmação de pagamento).",
            company_id: s.company_id,
          }));
          await supabaseAdmin.from("sale_logs").insert(logs);

          for (const s of cancelledSales) {
            await supabaseAdmin.from("sale_passengers").delete().eq("sale_id", s.id);
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
        console.error("Error deleting expired locks:", deleteError);
      }

      cleanedLocks = expiredLocks.length;
    }

    // 5) Reservas manuais do administrativo não usam seat_locks como fonte de verdade.
    // O vencimento fica explícito em `sales.reservation_expires_at` justamente para evitar
    // reservas eternas sem aplicar o TTL curto do checkout público a vendas humanas legítimas.
    const { data: expiredManualReservations, error: manualReservationsError } = await supabaseAdmin
      .from("sales")
      .select("id, company_id")
      .eq("status", "reservado")
      .not("reservation_expires_at", "is", null)
      .lt("reservation_expires_at", nowIso);

    if (manualReservationsError) {
      console.error("Error fetching expired manual reservations:", manualReservationsError);
      return new Response(JSON.stringify({ error: "Failed to fetch manual reservations" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let cancelledManualReservations = 0;

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
        .select("id, company_id");

      if (cancelManualError) {
        console.error("Error cancelling expired manual reservations:", cancelManualError);
        return new Response(JSON.stringify({ error: "Failed to cancel manual reservations" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (cancelledSales && cancelledSales.length > 0) {
        cancelledManualReservations = cancelledSales.length;
        console.log(`Cancelled ${cancelledSales.length} expired manual reservations`);

        const logs = cancelledSales.map((sale) => ({
          sale_id: sale.id,
          action: "manual_reservation_auto_cancelled",
          description: "Reserva manual administrativa cancelada automaticamente por vencimento da validade configurada.",
          company_id: sale.company_id,
        }));
        await supabaseAdmin.from("sale_logs").insert(logs);

        // Vendas manuais reservadas ocupam assentos via tickets, não via seat_locks do checkout.
        // Ao expirar, apagamos tickets e resíduos acessórios para devolver a poltrona ao mapa operacional.
        for (const sale of cancelledSales) {
          const { error: ticketDeleteError } = await supabaseAdmin.from("tickets").delete().eq("sale_id", sale.id);
          if (ticketDeleteError) {
            console.error(`Error deleting tickets for expired manual reservation ${sale.id}:`, ticketDeleteError);
          }

          const { error: seatLockDeleteError } = await supabaseAdmin.from("seat_locks").delete().eq("sale_id", sale.id);
          if (seatLockDeleteError) {
            console.error(`Error deleting seat locks for expired manual reservation ${sale.id}:`, seatLockDeleteError);
          }

          const { error: passengerDeleteError } = await supabaseAdmin.from("sale_passengers").delete().eq("sale_id", sale.id);
          if (passengerDeleteError) {
            console.error(`Error deleting sale passengers for expired manual reservation ${sale.id}:`, passengerDeleteError);
          }
        }
      }
    }

    return new Response(JSON.stringify({
      cleaned: cleanedLocks,
      expired_manual_reservations: expiredManualReservations?.length ?? 0,
      cancelled_manual_reservations: cancelledManualReservations,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Cleanup failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
