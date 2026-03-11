import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Cleanup expired seat locks and cancel corresponding pending sales.
 * Called via pg_cron every 5 minutes.
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

    // 1. Find expired locks
    const { data: expiredLocks, error: locksError } = await supabaseAdmin
      .from("seat_locks")
      .select("id, sale_id")
      .lt("expires_at", new Date().toISOString());

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

    // 2. Get unique sale IDs from expired locks
    const saleIds = [...new Set(expiredLocks.map(l => l.sale_id).filter(Boolean))] as string[];

    // 3. Cancel pending sales whose locks expired
    if (saleIds.length > 0) {
      const { data: cancelledSales } = await supabaseAdmin
        .from("sales")
        .update({
          status: "cancelado",
          cancel_reason: "Tempo de pagamento expirado",
          cancelled_at: new Date().toISOString(),
        })
        .in("id", saleIds)
        .eq("status", "pendente_pagamento")
        .select("id, company_id");

      if (cancelledSales && cancelledSales.length > 0) {
        console.log(`Cancelled ${cancelledSales.length} expired pending sales`);

        // Log cancellations
        const logs = cancelledSales.map((s: any) => ({
          sale_id: s.id,
          action: "auto_cancelled",
          description: "Venda cancelada automaticamente: tempo de pagamento expirado.",
          company_id: s.company_id,
        }));
        await supabaseAdmin.from("sale_logs").insert(logs);

        // Clean up sale_passengers for cancelled sales
        for (const s of cancelledSales) {
          await supabaseAdmin.from("sale_passengers").delete().eq("sale_id", s.id);
        }
      }
    }

    // 4. Delete all expired locks
    const { error: deleteError } = await supabaseAdmin
      .from("seat_locks")
      .delete()
      .lt("expires_at", new Date().toISOString());

    if (deleteError) {
      console.error("Error deleting expired locks:", deleteError);
    }

    return new Response(JSON.stringify({ cleaned: expiredLocks.length, cancelled_sales: saleIds.length }), {
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
