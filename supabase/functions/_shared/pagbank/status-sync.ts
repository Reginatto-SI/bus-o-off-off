// @ts-nocheck — módulo compartilhado Deno.
/* eslint-disable @typescript-eslint/no-explicit-any */
// Consulta o Order PagBank da venda e converge para a finalização comum.
// Usado por verify-payment-status (fallback) e pagbank-webhook (confirmação
// autoritativa: o webhook nunca finaliza só pelo corpo recebido).
import { finalizeConfirmedPayment } from "../payment-finalization.ts";
import { logSaleIntegrationEvent } from "../payment-observability.ts";
import { getPagbankOrder } from "./client.ts";
import { PagbankError, extractPagbankPixArtifacts, normalizePagbankStatus } from "./core.ts";
import { resolvePagbankCredentialForSale } from "./credentials.ts";

export type PagbankSaleForSync = {
  id: string;
  company_id: string;
  status: string;
  payment_environment: string;
  payment_connection_id: string | null;
  payment_confirmed_at?: string | null;
};

export type PagbankSyncResult =
  | { state: "no_attempt"; paymentStatus: string }
  | { state: "pending"; paymentStatus: string; normalized: string; rawStatus: string | null; attempt: any }
  | { state: "paid"; paymentStatus: "pago"; finalizationOk: boolean; httpStatus: number; attempt: any }
  | { state: "query_failed"; paymentStatus: string; code: string; attempt: any };

export async function syncPagbankSaleStatus(supabaseAdmin: any, params: {
  sale: PagbankSaleForSync;
  source: "verify-payment-status" | "pagbank-webhook";
  eventType?: string | null;
}): Promise<PagbankSyncResult> {
  const { sale, source } = params;
  const { data: attempt } = await supabaseAdmin
    .from("payment_attempts")
    .select("*")
    .eq("sale_id", sale.id)
    .eq("company_id", sale.company_id)
    .eq("gateway", "pagbank")
    .eq("operation", "create_pix")
    .maybeSingle();

  if (!attempt || !attempt.external_order_id) {
    return { state: "no_attempt", paymentStatus: sale.status };
  }

  const credential = await resolvePagbankCredentialForSale(supabaseAdmin, { sale });
  const res = await getPagbankOrder({
    environment: credential.environment,
    accessToken: credential.accessToken,
    orderId: attempt.external_order_id,
  });

  if (!res.ok || !res.data) {
    const code = res.indeterminate ? "pagbank_indeterminate" : res.status === 401 || res.status === 403 ? "pagbank_auth_failed" : "pagbank_transient_error";
    await logSaleIntegrationEvent({
      supabaseAdmin, saleId: sale.id, companyId: sale.company_id, paymentEnvironment: credential.environment,
      environmentDecisionSource: "sale", provider: "pagbank", direction: source === "pagbank-webhook" ? "incoming_webhook" : "manual_sync",
      eventType: params.eventType ?? "order_query", paymentId: attempt.external_order_id, externalReference: sale.id,
      httpStatus: res.status || null, processingStatus: "failed", resultCategory: "error", incidentCode: code,
      message: "Falha ao consultar Order PagBank.", responseJson: { error_messages: res.errorMessages },
    });
    return { state: "query_failed", paymentStatus: sale.status, code, attempt };
  }

  const art = extractPagbankPixArtifacts(res.data);
  const normalized = normalizePagbankStatus(art.rawStatus);
  const { data: updatedAttempt } = await supabaseAdmin
    .from("payment_attempts")
    .update({
      external_status_raw: art.rawStatus,
      normalized_status: normalized,
      external_charge_id: art.chargeId ?? attempt.external_charge_id,
      last_queried_at: new Date().toISOString(),
    })
    .eq("id", attempt.id)
    .eq("company_id", sale.company_id)
    .select("*")
    .single();

  await logSaleIntegrationEvent({
    supabaseAdmin, saleId: sale.id, companyId: sale.company_id, paymentEnvironment: credential.environment,
    environmentDecisionSource: "sale", provider: "pagbank", direction: source === "pagbank-webhook" ? "incoming_webhook" : "manual_sync",
    eventType: params.eventType ?? "order_query", paymentId: attempt.external_order_id, externalReference: sale.id,
    httpStatus: res.status, processingStatus: "success", resultCategory: normalized === "paid" ? "payment_confirmed" : "success",
    message: `Order PagBank consultado: ${art.rawStatus ?? "sem status"}.`,
    responseJson: { status: art.rawStatus, normalized, charge_id: art.chargeId },
  });

  if (normalized !== "paid") {
    return { state: "pending", paymentStatus: sale.status, normalized, rawStatus: art.rawStatus, attempt: updatedAttempt ?? attempt };
  }

  // Somente PAID (capturado) finaliza. Finalização idempotente comum.
  const paidAt = (res.data?.charges?.[0]?.paid_at as string | undefined) ?? new Date().toISOString();
  const finalization = await finalizeConfirmedPayment({
    supabaseAdmin,
    sale: { id: sale.id, company_id: sale.company_id, status: sale.status, payment_environment: credential.environment },
    confirmedAt: sale.payment_confirmed_at ?? paidAt,
    asaasStatus: art.rawStatus ?? "PAID",
    source,
    paymentId: art.chargeId ?? art.orderId,
    eventType: params.eventType ?? null,
    gateway: "pagbank",
  });
  return { state: "paid", paymentStatus: "pago", finalizationOk: finalization.ok, httpStatus: finalization.httpStatus, attempt: updatedAttempt ?? attempt };
}

export function isPagbankError(e: unknown): e is PagbankError {
  return e instanceof PagbankError;
}
