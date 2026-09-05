// @ts-nocheck — arquivo Deno (edge function).
/* eslint-disable @typescript-eslint/no-explicit-any */
// Webhook PagBank (separado do Asaas). Fluxo:
// corpo bruto → correlaciona venda por reference_id → valida assinatura com o
// token da conexão/ambiente da venda → deduplica → consulta Order → finaliza
// somente se PAID. O corpo recebido nunca é fonte de verdade para "pago".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { logPaymentTrace, logSaleIntegrationEvent } from "../_shared/payment-observability.ts";
import {
  buildPagbankWebhookEventKey,
  extractPagbankPixArtifacts,
  sha256Hex,
  verifyPagbankWebhookSignature,
} from "../_shared/pagbank/core.ts";
import { pagbankSecretNames, loadConnectionById } from "../_shared/pagbank/credentials.ts";
import { decryptSecret } from "../_shared/pagbank/crypto.ts";
import { isPagbankError, syncPagbankSaleStatus } from "../_shared/pagbank/status-sync.ts";

const SOURCE = "pagbank-webhook";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return respond(405, { error: "method_not_allowed" });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Corpo bruto preservado para assinatura; nunca persistido integralmente.
  const rawBody = await req.text();
  const receivedSignature = req.headers.get("x-authenticity-token");
  let payload: any = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    logPaymentTrace("warn", SOURCE, "invalid_json", { size: rawBody.length });
    return respond(400, { error: "invalid_json" });
  }

  const art = extractPagbankPixArtifacts(payload);
  const referenceId = typeof payload?.reference_id === "string" ? payload.reference_id : null;
  const saleId = referenceId && UUID_RE.test(referenceId) ? referenceId : null;

  // 1) Correlação: sem venda PagBank correspondente, não há token a usar → rejeita.
  let sale: any = null;
  if (saleId) {
    const { data } = await supabaseAdmin
      .from("sales")
      .select("id, company_id, status, payment_gateway, payment_environment, payment_connection_id, external_account_id, payment_confirmed_at")
      .eq("id", saleId)
      .maybeSingle();
    sale = data;
  }
  if (!sale || sale.payment_gateway !== "pagbank") {
    logPaymentTrace("warn", SOURCE, "unmatched_webhook", { reference_id: referenceId, order_id: art.orderId, status: art.rawStatus });
    return respond(202, { received: true, matched: false });
  }

  // 2) Assinatura com o token da conexão congelada na venda (fallback: token do ambiente).
  const connection = sale.payment_connection_id
    ? await loadConnectionById(supabaseAdmin, { connectionId: sale.payment_connection_id, companyId: sale.company_id })
    : null;
  const environment = sale.payment_environment;
  const envToken = Deno.env.get(pagbankSecretNames(environment).webhookToken) ?? null;
  const token = (await decryptSecret(connection?.webhook_token_enc)) ?? envToken;
  const signature = await verifyPagbankWebhookSignature({ rawBody, token, receivedSignature });
  const rawBodyHash = await sha256Hex(rawBody);
  const eventKey = buildPagbankWebhookEventKey(payload) ?? `${art.orderId ?? "unknown"}:${rawBodyHash.slice(0, 16)}`;
  const externalAccountId = connection?.external_account_id ?? sale.external_account_id ?? "";

  if (!signature.valid) {
    await logSaleIntegrationEvent({
      supabaseAdmin, saleId: sale.id, companyId: sale.company_id, paymentEnvironment: environment, environmentDecisionSource: "sale",
      provider: "pagbank", direction: "incoming_webhook", eventType: "webhook_rejected", paymentId: art.orderId, externalReference: sale.id,
      httpStatus: 401, processingStatus: "unauthorized", resultCategory: "rejected", incidentCode: `pagbank_signature_${signature.reason}`,
      message: "Webhook PagBank rejeitado: assinatura inválida ou token ausente.", payloadJson: { event_key: eventKey, status: art.rawStatus },
    });
    return respond(401, { error: "invalid_signature" });
  }

  // 3) Dedup por (gateway, ambiente, conta, evento). Duplicata → apenas contabiliza.
  const { error: dedupError } = await supabaseAdmin.from("payment_webhook_events").insert({
    gateway: "pagbank", environment, external_account_id: externalAccountId, event_key: eventKey,
    sale_id: sale.id, company_id: sale.company_id, raw_body_hash: rawBodyHash, signature_valid: true, raw_status: art.rawStatus,
    processing_result: "received",
  });
  if (dedupError) {
    if (dedupError.code === "23505") {
      const dedupFilter = (q: any) =>
        q.eq("event_key", eventKey).eq("gateway", "pagbank").eq("environment", environment).eq("external_account_id", externalAccountId);
      const { data: existingEvent } = await dedupFilter(
        supabaseAdmin.from("payment_webhook_events").select("id, duplicate_count"),
      ).maybeSingle();
      if (existingEvent) {
        await supabaseAdmin.from("payment_webhook_events")
          .update({ last_seen_at: new Date().toISOString(), duplicate_count: (existingEvent.duplicate_count ?? 0) + 1 })
          .eq("id", existingEvent.id);
      }
      await logSaleIntegrationEvent({
        supabaseAdmin, saleId: sale.id, companyId: sale.company_id, paymentEnvironment: environment, environmentDecisionSource: "sale",
        provider: "pagbank", direction: "incoming_webhook", eventType: "webhook_duplicate", paymentId: art.orderId, externalReference: sale.id,
        httpStatus: 200, processingStatus: "duplicate", resultCategory: "duplicate", message: "Webhook PagBank duplicado ignorado.",
        payloadJson: { event_key: eventKey },
      });
      return respond(200, { received: true, duplicate: true });
    }
    logPaymentTrace("error", SOURCE, "dedup_insert_failed", { sale_id: sale.id, message: dedupError.message });
    return respond(500, { error: "dedup_failed" });
  }

  // 4) Confirmação autoritativa por consulta + finalização comum.
  let processingResult = "pending";
  try {
    const sync = await syncPagbankSaleStatus(supabaseAdmin, { sale, source: SOURCE, eventType: `webhook:${art.rawStatus ?? "unknown"}` });
    processingResult = sync.state === "paid" ? (sync.finalizationOk ? "finalized" : "finalization_inconsistent") : sync.state;
  } catch (error) {
    processingResult = isPagbankError(error) ? error.code : "internal_error";
    logPaymentTrace("error", SOURCE, "sync_failed", { sale_id: sale.id, result: processingResult });
  }
  await supabaseAdmin.from("payment_webhook_events")
    .update({ processing_result: processingResult })
    .eq("event_key", eventKey).eq("gateway", "pagbank").eq("environment", environment).eq("external_account_id", externalAccountId);

  // Responder 200 evita retentativas infinitas; inconsistências ficam registradas para reconciliação.
  return respond(200, { received: true, result: processingResult });
});
