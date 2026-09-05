// @ts-nocheck — arquivo Deno (edge function): tipos resolvidos pelo runtime Deno, não pelo tsc do app.
/* eslint-disable @typescript-eslint/no-explicit-any */
// Cria (ou recupera) a cobrança PIX de uma venda PagBank via API oficial Order.
// Regras: venda já reservada; gateway/ambiente/conexão congelados na venda;
// idempotência local (payment_attempts) + header PagBank; split FIXED do plano
// SmartBus; nunca recria cobrança em resultado indeterminado; Sandbox apenas.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  logCriticalPaymentIssue,
  logPaymentTrace,
  logSaleIntegrationEvent,
  logSaleOperationalEvent,
} from "../_shared/payment-observability.ts";
import {
  amountToGrossPercent,
  computeProgressiveFeeForPassengers,
  distributePlatformFee,
  logFeeEngineTrace,
} from "../_shared/platform-fee-engine.ts";
import {
  buildCheckoutFinancialIntegritySnapshot,
  resolvePassengerFinancialUnitPrice,
  roundCurrency,
} from "../_shared/checkout-financial-integrity.ts";
import { ensureSaleTermsAcceptance, getPayloadTermsAcceptance } from "../_shared/sale-terms-acceptance.ts";
import {
  PAGBANK_PIX_EXPIRATION_MINUTES,
  PagbankError,
  assertPagbankEnvironmentAllowed,
  buildPagbankIdempotencyKey,
  extractPagbankPixArtifacts,
  normalizePagbankStatus,
} from "../_shared/pagbank/core.ts";
import { findPagbankOrdersByReference, getPagbankOrder, pagbankRequest, toPagbankError } from "../_shared/pagbank/client.ts";
import { pagbankSecretNames, resolvePagbankCredentialForSale } from "../_shared/pagbank/credentials.ts";
import { resolvePagbankSplitRecipients } from "../_shared/pagbank/split-recipients.ts";
import { buildPagbankFixedSplitPlan } from "../_shared/pagbank/split-plan.ts";
import { finalizeConfirmedPayment } from "../_shared/payment-finalization.ts";

const SOURCE = "create-pagbank-payment";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(payload: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function attemptToPublic(attempt: any) {
  return {
    gateway: "pagbank",
    payment_method: "pix",
    attempt_id: attempt.id,
    state: attempt.state,
    normalized_status: attempt.normalized_status,
    order_id: attempt.external_order_id,
    pix: {
      qr_text: attempt.pix_qr_text,
      qr_image_url: attempt.pix_qr_image_url,
      expires_at: attempt.pix_expires_at,
      amount_cents: attempt.amount_cents,
    },
  };
}

function onlyDigits(v: unknown): string {
  return typeof v === "string" ? v.replace(/\D/g, "") : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let sale: any = null;
  try {
    const body = await req.json().catch(() => ({}));
    const saleId = typeof body?.sale_id === "string" ? body.sale_id : null;
    const paymentMethod = body?.payment_method ?? "pix";
    const termsAcceptance = getPayloadTermsAcceptance(body?.terms_acceptance);
    if (!saleId) return json({ error: "sale_id is required", error_code: "sale_id_required" }, 400);
    if (paymentMethod !== "pix") {
      return json({ error: "PagBank aceita somente PIX nesta fase.", error_code: "payment_method_not_supported" }, 400);
    }

    const { data: saleRow, error: saleError } = await supabaseAdmin
      .from("sales")
      .select("*, event:events(id, name, pass_platform_fee_to_customer)")
      .eq("id", saleId)
      .single();
    if (saleError || !saleRow) return json({ error: "Venda não encontrada.", error_code: "sale_not_found" }, 404);
    sale = saleRow;

    // Contexto congelado na venda: gateway, ambiente e conexão. Request/host não substituem.
    if (sale.payment_gateway !== "pagbank") {
      return json({ error: "Esta venda não usa PagBank.", error_code: "gateway_mismatch" }, 409);
    }
    const environment = assertPagbankEnvironmentAllowed(sale.payment_environment);
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("id, name, platform_fee_percent")
      .eq("id", sale.company_id)
      .single();
    if (companyError || !company) return json({ error: "Empresa não encontrada.", error_code: "company_not_found" }, 404);

    const idempotencyKey = buildPagbankIdempotencyKey({
      companyId: sale.company_id,
      saleId: sale.id,
      environment,
      operation: "create_pix",
    });

    // 1) Recuperação idempotente: tentativa existente nunca gera novo Order.
    const { data: existing } = await supabaseAdmin
      .from("payment_attempts")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .eq("company_id", sale.company_id)
      .maybeSingle();

    if (sale.status === "pago") {
      return json({ ...(existing ? attemptToPublic(existing) : { gateway: "pagbank" }), already_paid: true }, 200);
    }
    if (sale.status !== "reservado" && sale.status !== "pendente_pagamento") {
      return json({ error: "A venda não está aguardando pagamento.", error_code: "sale_status_invalid" }, 409);
    }

    const credential = await resolvePagbankCredentialForSale(supabaseAdmin, { sale });
    if (sale.external_account_id && credential.connection.external_account_id &&
        sale.external_account_id !== credential.connection.external_account_id) {
      throw new PagbankError("pagbank_tenant_mismatch", "Conta PagBank da venda diverge da conexão.", 409);
    }
    if (!credential.connection.pix_ready) {
      throw new PagbankError("pagbank_connection_not_operational", "PIX PagBank não está habilitado para esta empresa.", 409);
    }

    if (existing && existing.state === "succeeded" && existing.external_order_id) {
      // Retorna o mesmo QR; atualiza status por consulta (barato e seguro).
      const q = await getPagbankOrder({ environment, accessToken: credential.accessToken, orderId: existing.external_order_id });
      if (q.ok && q.data) {
        const art = extractPagbankPixArtifacts(q.data);
        const normalized = normalizePagbankStatus(art.rawStatus);
        await supabaseAdmin.from("payment_attempts").update({
          external_status_raw: art.rawStatus,
          normalized_status: normalized,
          external_charge_id: art.chargeId ?? existing.external_charge_id,
          last_queried_at: new Date().toISOString(),
        }).eq("id", existing.id).eq("company_id", sale.company_id);
        if (normalized === "paid") {
          await finalizeConfirmedPayment({
            supabaseAdmin,
            sale: { id: sale.id, company_id: sale.company_id, status: sale.status, payment_environment: environment },
            confirmedAt: new Date().toISOString(),
            asaasStatus: art.rawStatus ?? "PAID",
            source: "verify-payment-status",
            paymentId: art.chargeId ?? art.orderId,
            eventType: "pagbank_query_on_create_retry",
            gateway: "pagbank",
          });
        }
        return json({ ...attemptToPublic({ ...existing, external_status_raw: art.rawStatus, normalized_status: normalized }), reused: true }, 200);
      }
      return json({ ...attemptToPublic(existing), reused: true }, 200);
    }

    if (existing && existing.state === "indeterminate") {
      // Recupera por referência antes de qualquer nova criação.
      const found = await findPagbankOrdersByReference({ environment, accessToken: credential.accessToken, referenceId: sale.id });
      const orders: any[] = Array.isArray(found.data?.orders) ? found.data.orders : Array.isArray(found.data) ? found.data : [];
      if (found.ok && orders.length > 0) {
        const art = extractPagbankPixArtifacts(orders[0]);
        const { data: recovered } = await supabaseAdmin.from("payment_attempts").update({
          state: "succeeded",
          external_order_id: art.orderId,
          external_charge_id: art.chargeId,
          external_status_raw: art.rawStatus,
          normalized_status: normalizePagbankStatus(art.rawStatus),
          pix_qr_text: art.qrText,
          pix_qr_image_url: art.qrImageUrl,
          pix_expires_at: art.expiresAt,
          last_queried_at: new Date().toISOString(),
        }).eq("id", existing.id).eq("company_id", sale.company_id).select("*").single();
        await logSaleIntegrationEvent({
          supabaseAdmin, saleId: sale.id, companyId: sale.company_id, paymentEnvironment: environment,
          environmentDecisionSource: "sale", provider: "pagbank", direction: "outgoing_request",
          eventType: "create_pix_recovered", paymentId: art.orderId, externalReference: sale.id,
          processingStatus: "success", resultCategory: "success", message: "Order recuperado após resultado indeterminado.",
          payloadJson: { idempotency_key: idempotencyKey }, responseJson: { order_id: art.orderId, status: art.rawStatus },
        });
        return json({ ...attemptToPublic(recovered), recovered: true }, 200);
      }
      if (!found.ok && found.indeterminate) {
        throw new PagbankError("pagbank_indeterminate", "Ainda não foi possível confirmar a cobrança anterior. Aguarde alguns segundos.", 504);
      }
      // Comprovadamente inexistente: reutiliza a MESMA chave e payload abaixo (attempt_count+1).
    }
    if (existing && existing.state === "pending") {
      const ageMs = Date.now() - Date.parse(existing.created_at);
      if (ageMs < 45_000) {
        throw new PagbankError("pagbank_idempotency_conflict", "Já estamos gerando o PIX desta compra. Aguarde.", 409);
      }
      // Tentativa órfã (crash antes de gravar resultado): tratar como indeterminada.
      await supabaseAdmin.from("payment_attempts").update({ state: "indeterminate" }).eq("id", existing.id).eq("company_id", sale.company_id);
      throw new PagbankError("pagbank_indeterminate", "Estamos verificando a cobrança anterior. Tente novamente em instantes.", 504);
    }

    // 2) Termos do evento (mesma rotina do Asaas).
    const terms = await ensureSaleTermsAcceptance({ supabaseAdmin, sale, termsAcceptance });
    if (!terms.ok) {
      await logSaleOperationalEvent({
        supabaseAdmin, saleId: sale.id, companyId: sale.company_id, action: "payment_create_blocked", source: SOURCE,
        result: "rejected", paymentEnvironment: environment, errorCode: terms.reason, detail: "terms_acceptance_missing_or_invalid_before_pagbank",
      });
      return json({
        error: terms.reason, error_code: terms.reason,
        message: terms.reason === "terms_acceptance_persist_failed"
          ? "Não foi possível registrar o aceite dos termos deste evento. Tente novamente."
          : "É necessário aceitar os termos deste evento antes de continuar para o pagamento.",
      }, terms.status);
    }

    // 3) Plano financeiro: mesmo motor e mesma integridade do Asaas.
    const platformFeePercent = Number(company.platform_fee_percent ?? 0);
    const grossAmount = Number(sale.gross_amount ?? sale.unit_price * sale.quantity);
    if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
      return json({ error: "Valor bruto da venda inválido", error_code: "invalid_gross_amount" }, 400);
    }
    const { data: passengerSnapshots, error: passengersError } = await supabaseAdmin
      .from("sale_passengers")
      .select("trip_id, final_price, original_price, discount_amount, benefit_applied, ticket_type_id, ticket_type_name, ticket_type_price")
      .eq("sale_id", sale.id)
      .order("sort_order", { ascending: true });
    if (passengersError || !passengerSnapshots?.length) {
      return json({ error: "Não foi possível validar os passageiros.", error_code: "passenger_snapshot_missing" }, 409);
    }
    const primary = passengerSnapshots.filter((p: any) => p.trip_id === sale.trip_id);
    if (primary.length === 0) return json({ error: "Snapshot sem trecho principal.", error_code: "passenger_snapshot_without_primary_trip" }, 409);
    const computedEngine = computeProgressiveFeeForPassengers(primary.map(resolvePassengerFinancialUnitPrice));
    const platformFeeEngine = platformFeePercent > 0 ? computedEngine : { ...computedEngine, totalFee: 0, totalUncappedFee: 0, capHits: 0 };

    const { data: eventFees } = await supabaseAdmin
      .from("event_fees").select("fee_type, value, is_active").eq("event_id", sale.event_id).eq("is_active", true).order("sort_order");
    const integrity = buildCheckoutFinancialIntegritySnapshot({
      saleTripId: sale.trip_id,
      grossAmount,
      eventFees: (eventFees ?? []) as any,
      passengerSnapshots: passengerSnapshots as any,
      passPlatformFeeToCustomer: Boolean(sale.event?.pass_platform_fee_to_customer),
      progressivePlatformFeeTotal: platformFeeEngine.totalFee,
    });
    if (Math.abs(integrity.saleFeesFromGross - integrity.feesTotal) > 0.01 ||
        Math.abs(roundCurrency(grossAmount) - integrity.expectedGrossFromSnapshot) > 0.01) {
      return json({ error: "O total da venda está inconsistente com os valores dos passageiros.", error_code: "sale_total_inconsistent_with_passenger_snapshot" }, 409);
    }

    const recipients = await resolvePagbankSplitRecipients({
      supabaseAdmin, source: SOURCE, saleId: sale.id, companyId: sale.company_id, environment,
      splitEnabled: platformFeeEngine.totalFee > 0, representativeId: sale.representative_id ?? null,
    });
    // Recebedor elegível sem conta bloqueia (sem degradação silenciosa).
    const blockedRecipients: string[] = [];
    if (recipients.socio.eligible && !recipients.socio.accountId) blockedRecipients.push("socio");
    if (recipients.representative.eligible && !recipients.representative.accountId) blockedRecipients.push("representative");
    if (recipients.socio.reason === "ambiguous" || recipients.socio.reason === "query_failed") blockedRecipients.push(`socio:${recipients.socio.reason}`);
    if (recipients.representative.reason === "query_failed") blockedRecipients.push("representative:query_failed");
    if (platformFeeEngine.totalFee > 0 && blockedRecipients.length > 0) {
      throw new PagbankError("pagbank_split_recipient_missing", "A divisão financeira não pôde ser montada para esta empresa.", 409, { missing: blockedRecipients });
    }
    const distribution = distributePlatformFee({
      totalFee: platformFeeEngine.totalFee,
      socioEligible: recipients.socio.eligible,
      representativeEligible: recipients.representative.eligible,
    });
    const marketplaceAccountId = Deno.env.get(pagbankSecretNames(environment).marketplaceAccountId) ?? null;
    const splitPlan = buildPagbankFixedSplitPlan({
      grossAmount,
      distribution,
      accounts: {
        company: credential.connection.external_account_id,
        marketplace: marketplaceAccountId,
        socio: recipients.socio.accountId,
        representative: recipients.representative.accountId,
      },
    });
    logFeeEngineTrace({
      source: SOURCE, saleId: sale.id, companyId: sale.company_id, grossAmount,
      representativeEligible: recipients.representative.eligible, engine: platformFeeEngine, distribution,
    });

    // 4) Payload Order PIX (reference_id = sale.id; valores em centavos).
    const expiresAt = new Date(Date.now() + PAGBANK_PIX_EXPIRATION_MINUTES * 60_000);
    const phone = onlyDigits(sale.customer_phone);
    const customer: Record<string, unknown> = {
      name: String(sale.customer_name ?? "Cliente").slice(0, 60),
      tax_id: onlyDigits(sale.customer_cpf),
    };
    if (sale.customer_email) customer.email = sale.customer_email;
    if (phone.length >= 10) {
      customer.phones = [{ country: "55", area: phone.slice(0, 2), number: phone.slice(2), type: "MOBILE" }];
    }
    const qrCode: Record<string, unknown> = {
      amount: { value: splitPlan.totalCents },
      expiration_date: expiresAt.toISOString(),
    };
    if (splitPlan.payload) qrCode.splits = splitPlan.payload;
    const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pagbank-webhook`;
    const orderPayload = {
      reference_id: sale.id,
      customer,
      items: [{
        reference_id: sale.event_id,
        name: String(sale.event?.name ?? "Passagem").slice(0, 64),
        quantity: 1,
        unit_amount: splitPlan.totalCents,
      }],
      qr_codes: [qrCode],
      notification_urls: [webhookUrl],
    };
    const payloadHash = await (async () => {
      const bytes = new TextEncoder().encode(JSON.stringify({ ...orderPayload, qr_codes: [{ ...qrCode, expiration_date: undefined }] }));
      const h = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
    })();

    // 5) Persistir tentativa ANTES da chamada externa (barreira local por UNIQUE).
    let attemptId: string;
    if (existing) {
      const { data: reused } = await supabaseAdmin.from("payment_attempts").update({
        state: "pending", attempt_count: (existing.attempt_count ?? 1) + 1, payload_hash: payloadHash, error_code: null, error_message_sanitized: null,
      }).eq("id", existing.id).eq("company_id", sale.company_id).select("id").single();
      attemptId = reused.id;
    } else {
      const { data: inserted, error: insertError } = await supabaseAdmin.from("payment_attempts").insert({
        sale_id: sale.id, company_id: sale.company_id, connection_id: credential.connection.id, gateway: "pagbank",
        environment, operation: "create_pix", idempotency_key: idempotencyKey, payload_hash: payloadHash,
        state: "pending", external_reference: sale.id, amount_cents: splitPlan.totalCents,
      }).select("id").single();
      if (insertError) {
        // 23505 = outra requisição concorrente já criou a tentativa.
        throw new PagbankError("pagbank_idempotency_conflict", "Já estamos gerando o PIX desta compra. Aguarde.", 409, { db: insertError.code });
      }
      attemptId = inserted.id;
    }
    await logSaleIntegrationEvent({
      supabaseAdmin, saleId: sale.id, companyId: sale.company_id, paymentEnvironment: environment, environmentDecisionSource: "sale",
      provider: "pagbank", direction: "outgoing_request", eventType: "create_pix", externalReference: sale.id,
      processingStatus: "requested", resultCategory: "started", message: "Criando Order PIX no PagBank.",
      payloadJson: { idempotency_key: idempotencyKey, amount_cents: splitPlan.totalCents, split_mode: splitPlan.mode, split_receivers: splitPlan.receivers.map((r) => ({ kind: r.kind, amount_cents: r.amountCents })) },
    });

    const res = await pagbankRequest({ environment, accessToken: credential.accessToken, method: "POST", path: "/orders", body: orderPayload, idempotencyKey });

    if (res.indeterminate) {
      await supabaseAdmin.from("payment_attempts").update({ state: "indeterminate", error_code: "pagbank_indeterminate" }).eq("id", attemptId).eq("company_id", sale.company_id);
      await logSaleIntegrationEvent({
        supabaseAdmin, saleId: sale.id, companyId: sale.company_id, paymentEnvironment: environment, environmentDecisionSource: "sale",
        provider: "pagbank", direction: "outgoing_request", eventType: "create_pix", externalReference: sale.id,
        processingStatus: "warning", resultCategory: "warning", incidentCode: "pagbank_indeterminate", message: "Timeout após envio; recuperação por reference_id na próxima tentativa.",
        payloadJson: { idempotency_key: idempotencyKey }, durationMs: Date.now() - startedAt,
      });
      throw new PagbankError("pagbank_indeterminate", "Sem resposta conclusiva do PagBank. Aguarde e tente novamente — não será gerada cobrança duplicada.", 504);
    }
    if (!res.ok) {
      const err = toPagbankError(res, { idempotency_key: idempotencyKey });
      await supabaseAdmin.from("payment_attempts").update({ state: "failed", error_code: err.code, error_message_sanitized: res.errorMessages.join("; ").slice(0, 500) }).eq("id", attemptId).eq("company_id", sale.company_id);
      await logSaleIntegrationEvent({
        supabaseAdmin, saleId: sale.id, companyId: sale.company_id, paymentEnvironment: environment, environmentDecisionSource: "sale",
        provider: "pagbank", direction: "outgoing_request", eventType: "create_pix", externalReference: sale.id, httpStatus: res.status,
        processingStatus: "failed", resultCategory: "error", incidentCode: err.code, message: "PagBank recusou a criação do Order.",
        payloadJson: { idempotency_key: idempotencyKey }, responseJson: { http_status: res.status, error_messages: res.errorMessages }, durationMs: Date.now() - startedAt,
      });
      throw err;
    }

    const art = extractPagbankPixArtifacts(res.data);
    const normalized = normalizePagbankStatus(art.rawStatus ?? "WAITING");
    const { data: finalAttempt } = await supabaseAdmin.from("payment_attempts").update({
      state: "succeeded", external_order_id: art.orderId, external_charge_id: art.chargeId, external_status_raw: art.rawStatus ?? "WAITING",
      normalized_status: normalized, pix_qr_text: art.qrText, pix_qr_image_url: art.qrImageUrl, pix_expires_at: art.expiresAt ?? expiresAt.toISOString(),
    }).eq("id", attemptId).eq("company_id", sale.company_id).select("*").single();

    // Snapshot financeiro da venda (mesmas colunas do Asaas, sem tocar asaas_*).
    const { error: saleUpdateError } = await supabaseAdmin.from("sales").update({
      platform_fee_total: platformFeeEngine.totalFee,
      platform_fee_amount: distribution.platformAmount,
      platform_net_amount: distribution.platformAmount,
      split_snapshot_platform_fee_percent: amountToGrossPercent(platformFeeEngine.totalFee, grossAmount),
      split_snapshot_socio_split_percent: platformFeeEngine.totalFee > 0 ? (distribution.socioAmount / platformFeeEngine.totalFee) * 100 : 0,
      split_snapshot_representative_percent: recipients.representative.eligible ? amountToGrossPercent(distribution.representativeAmount, grossAmount) : 0,
      split_snapshot_platform_fee_total: platformFeeEngine.totalFee,
      split_snapshot_socio_fee_amount: distribution.socioAmount,
      split_snapshot_platform_net_amount: distribution.platformAmount,
      split_snapshot_source: SOURCE,
      split_snapshot_captured_at: new Date().toISOString(),
    }).eq("id", sale.id).eq("company_id", sale.company_id);
    if (saleUpdateError) {
      await logCriticalPaymentIssue({
        supabaseAdmin, source: SOURCE, errorCode: "sale_update_after_gateway_payment_failed", saleId: sale.id, companyId: sale.company_id,
        paymentEnvironment: environment, paymentId: art.orderId, detail: saleUpdateError.message,
      });
    }
    await logSaleIntegrationEvent({
      supabaseAdmin, saleId: sale.id, companyId: sale.company_id, paymentEnvironment: environment, environmentDecisionSource: "sale",
      provider: "pagbank", direction: "outgoing_request", eventType: "create_pix", paymentId: art.orderId, externalReference: sale.id, httpStatus: res.status,
      processingStatus: "success", resultCategory: "success", message: "Order PIX criado no PagBank.",
      payloadJson: { idempotency_key: idempotencyKey }, responseJson: { order_id: art.orderId, charge_id: art.chargeId, status: art.rawStatus, has_qr: Boolean(art.qrText) }, durationMs: Date.now() - startedAt,
    });
    await logSaleOperationalEvent({
      supabaseAdmin, saleId: sale.id, companyId: sale.company_id, action: "payment_created", source: SOURCE, result: "success",
      paymentEnvironment: environment, detail: `pagbank_order=${art.orderId}`,
    });

    return json(attemptToPublic(finalAttempt), 200);
  } catch (error) {
    if (error instanceof PagbankError) {
      logPaymentTrace("warn", SOURCE, "pagbank_error", {
        sale_id: sale?.id ?? null, company_id: sale?.company_id ?? null, code: error.code, detail: error.detail ?? null,
      });
      if (sale?.id) {
        await logSaleOperationalEvent({
          supabaseAdmin, saleId: sale.id, companyId: sale.company_id, action: "payment_create_failed", source: SOURCE, result: "error",
          paymentEnvironment: sale.payment_environment ?? null, errorCode: error.code, detail: JSON.stringify(error.detail ?? {}).slice(0, 500),
        }).catch(() => {});
      }
      return json({ error: error.publicMessage, error_code: error.code, message: error.publicMessage, detail: error.detail ?? null }, error.httpStatus);
    }
    logPaymentTrace("error", SOURCE, "unhandled_error", { sale_id: sale?.id ?? null, message: error instanceof Error ? error.message : String(error) });
    return json({ error: "Erro interno ao gerar o PIX.", error_code: "internal_error" }, 500);
  }
});
