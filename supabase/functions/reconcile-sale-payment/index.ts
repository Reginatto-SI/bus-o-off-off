import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { finalizeConfirmedPayment, inspectSaleConsistency } from "../_shared/payment-finalization.ts";
import { logPaymentTrace } from "../_shared/payment-observability.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type ReconcileItemResult = {
  sale_id: string;
  state: "healthy" | "reconciled" | "inconsistent_unresolved" | "not_eligible" | "not_found" | "error";
  message: string;
  tickets_before: number;
  tickets_after: number;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const singleSaleId = typeof body?.sale_id === "string" ? body.sale_id : null;
    const multipleSaleIds = Array.isArray(body?.sale_ids)
      ? body.sale_ids.filter((id: unknown): id is string => typeof id === "string")
      : [];

    const requestedSaleIds = [...new Set([...(singleSaleId ? [singleSaleId] : []), ...multipleSaleIds])];

    if (requestedSaleIds.length === 0) {
      return jsonResponse(400, { error: "sale_id ou sale_ids é obrigatório" });
    }

    // Etapa 3: lote opcional, pequeno e controlado para manter operação segura.
    const saleIds = requestedSaleIds.slice(0, 20);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const results: ReconcileItemResult[] = [];

    for (const saleId of saleIds) {
      const inspection = await inspectSaleConsistency(supabaseAdmin, saleId);
      const ticketsBefore = inspection.ticketsCount;

      if (inspection.state === "not_found") {
        results.push({
          sale_id: saleId,
          state: "not_found",
          message: inspection.reason,
          tickets_before: ticketsBefore,
          tickets_after: ticketsBefore,
        });
        continue;
      }

      if (inspection.state === "healthy") {
        // Etapa 3: venda saudável não deve ser alterada por reconciliação manual.
        results.push({
          sale_id: saleId,
          state: "healthy",
          message: inspection.reason,
          tickets_before: ticketsBefore,
          tickets_after: ticketsBefore,
        });
        continue;
      }

      if (inspection.state === "not_paid" || !inspection.sale) {
        results.push({
          sale_id: saleId,
          state: "not_eligible",
          message: inspection.reason,
          tickets_before: ticketsBefore,
          tickets_after: ticketsBefore,
        });
        continue;
      }

      const finalization = await finalizeConfirmedPayment({
        supabaseAdmin,
        sale: inspection.sale,
        confirmedAt: inspection.sale.payment_confirmed_at ?? inspection.sale.platform_fee_paid_at ?? new Date().toISOString(),
        asaasStatus: inspection.sale.asaas_payment_status ?? "CONFIRMED",
        source: "reconcile-sale-payment",
        paymentId: inspection.sale.asaas_payment_id,
        allowStatusUpdate: false,
        writeSaleLog: true,
      });

      const postInspection = await inspectSaleConsistency(supabaseAdmin, saleId);

      if (finalization.ok) {
        results.push({
          sale_id: saleId,
          state: "reconciled",
          message: finalization.message,
          tickets_before: ticketsBefore,
          tickets_after: postInspection.ticketsCount,
        });
      } else if (finalization.state === "inconsistent") {
        results.push({
          sale_id: saleId,
          state: "inconsistent_unresolved",
          message: finalization.message,
          tickets_before: ticketsBefore,
          tickets_after: postInspection.ticketsCount,
        });
      } else {
        results.push({
          sale_id: saleId,
          state: "error",
          message: finalization.message,
          tickets_before: ticketsBefore,
          tickets_after: postInspection.ticketsCount,
        });
      }
    }

    const summary = {
      total: results.length,
      healthy: results.filter((r) => r.state === "healthy").length,
      reconciled: results.filter((r) => r.state === "reconciled").length,
      inconsistent_unresolved: results.filter((r) => r.state === "inconsistent_unresolved").length,
      not_eligible: results.filter((r) => r.state === "not_eligible").length,
      not_found: results.filter((r) => r.state === "not_found").length,
      error: results.filter((r) => r.state === "error").length,
    };

    logPaymentTrace("info", "reconcile-sale-payment", "reconciliation_completed", {
      processed_sales: summary.total,
      reconciled: summary.reconciled,
      inconsistent_unresolved: summary.inconsistent_unresolved,
      not_eligible: summary.not_eligible,
      not_found: summary.not_found,
      error: summary.error,
    });

    return jsonResponse(200, { summary, results });
  } catch (error) {
    logPaymentTrace("error", "reconcile-sale-payment", "unexpected_error", {
      error_message: error instanceof Error ? error.message : String(error),
    });

    return jsonResponse(500, {
      error: "Falha ao executar reconciliação",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
