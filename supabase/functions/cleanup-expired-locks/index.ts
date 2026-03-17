import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Cleanup expired seat locks and cancel corresponding pending sales.
 * Called automatically by pg_cron (migration dedicada deste Step 1).
 *
 * Regra operacional protegida aqui:
 * - seat_locks expiram em 15 minutos no checkout público;
 * - venda só é cancelada automaticamente se continuar em `pendente_pagamento`;
 * - locks expirados sempre são removidos para liberar assentos no mapa público.
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

    if (!expiredLocks || expiredLocks.length === 0) {
      return new Response(JSON.stringify({ cleaned: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
        })
        .in("id", cancellableSaleIds)
        .eq("status", "pendente_pagamento")
        .select("id, company_id");

      if (cancelledSales && cancelledSales.length > 0) {
        console.log(`Cancelled ${cancelledSales.length} expired pending sales`);

        // Log cancellations
        const logs = cancelledSales.map((s) => ({
          sale_id: s.id,
          action: "auto_cancelled",
          description: "Venda cancelada automaticamente por expiração de reserva (15 minutos sem confirmação de pagamento).",
          company_id: s.company_id,
        }));
        await supabaseAdmin.from("sale_logs").insert(logs);

        // Limpeza de staging: impede resíduos de passageiros em vendas expiradas.
        // Fluxos de pagamento confirmado (webhook/verify) já removem esse staging na finalização.
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

    return new Response(JSON.stringify({
      cleaned: expiredLocks.length,
      candidate_sales: saleIds.length,
      cancellable_sales: cancellableSaleIds.length,
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
