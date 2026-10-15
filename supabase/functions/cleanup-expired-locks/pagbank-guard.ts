// @ts-nocheck — módulo Deno.
// Proteção PagBank do cleanup e recuperação periódica em segundo plano.
// Consulta somente a Order já existente (nunca cria cobrança), com a credencial e o
// ambiente congelados na venda. Fail-closed: na dúvida, a venda é preservada.
import { syncPagbankSaleStatus } from "../_shared/pagbank/status-sync.ts";

export const PAGBANK_RECOVERY_WINDOW_HOURS = 24;
const SALE_COLUMNS = "id, company_id, status, payment_environment, payment_connection_id, payment_confirmed_at, payment_gateway";

export type PagbankGuardDecision = "allow_cancel" | "preserve" | "finalized";

export async function evaluatePagbankSale(supabaseAdmin: any, sale: any): Promise<{ decision: PagbankGuardDecision; reason: string }> {
  try {
    const result = await syncPagbankSaleStatus(supabaseAdmin, {
      sale,
      source: "verify-payment-status",
      eventType: "pagbank_background_recovery",
    });
    // no_attempt now means a successful read proved absence, never a missing ID.
    if (result.state === "no_attempt") return { decision: "allow_cancel", reason: "no_payment_attempt" };
    if (result.state === "paid") {
      return result.finalizationOk
        ? { decision: "finalized", reason: "order_paid_finalized" }
        : { decision: "preserve", reason: "order_paid_finalization_incomplete" };
    }
    if (result.state === "pending" && (result.normalized === "failed" || result.normalized === "canceled")) {
      return { decision: "allow_cancel", reason: `order_${result.normalized}` };
    }
    if (result.state === "pending") return { decision: "preserve", reason: `order_${result.normalized}` };
    return { decision: "preserve", reason: result.code ?? "query_failed" };
  } catch (e) {
    return { decision: "preserve", reason: (e as any)?.code ?? "query_exception" };
  }
}

/** Dentre as vendas candidatas a cancelamento, devolve as que NÃO podem ser canceladas. */
export async function pagbankSalesToPreserve(supabaseAdmin: any, saleIds: string[], log: (d: any) => void): Promise<Set<string>> {
  const preserve = new Set<string>();
  if (saleIds.length === 0) return preserve;
  const { data, error } = await supabaseAdmin.from("sales").select(SALE_COLUMNS).in("id", saleIds).eq("payment_gateway", "pagbank");
  if (error) {
    // Sem saber quais são PagBank, nenhuma candidata é cancelada.
    saleIds.forEach((id) => preserve.add(id));
    log({ stage: "pagbank_guard", action: "falhou", reason: "pagbank_sales_query_failed" });
    return preserve;
  }
  for (const sale of data ?? []) {
    const { decision, reason } = await evaluatePagbankSale(supabaseAdmin, sale);
    if (decision !== "allow_cancel") preserve.add(sale.id);
    log({ stage: "pagbank_guard", action: decision === "allow_cancel" ? "candidato" : "ignorado", sale_id: sale.id, company_id: sale.company_id, payment_environment: sale.payment_environment, reason });
  }
  return preserve;
}

/** Recuperação periódica: vendas PagBank pendentes com cobrança existente na janela. */
export async function recoverPendingPagbankSales(supabaseAdmin: any, log: (d: any) => void, limit = 20): Promise<number> {
  const since = new Date(Date.now() - PAGBANK_RECOVERY_WINDOW_HOURS * 3600 * 1000).toISOString();
  const { data: attempts, error } = await supabaseAdmin
    .from("payment_attempts")
    .select("sale_id")
    .eq("gateway", "pagbank")
    .not("external_order_id", "is", null)
    .gte("created_at", since)
    .order("last_queried_at", { ascending: true, nullsFirst: true })
    .limit(200);
  // Vendas já pagas com staging remanescente precisam de recuperação mesmo após 24h.
  const { data: staged, error: stagedError } = await supabaseAdmin
    .rpc("pagbank_paid_sales_needing_tickets", { p_limit: limit });
  if (error || stagedError) return 0;
  const paidIds = (staged ?? []).map((p: any) => p.sale_id);
  const pendingIds = (attempts ?? []).map((a: any) => a.sale_id);
  const paidResult = paidIds.length
    ? await supabaseAdmin.from("sales").select(SALE_COLUMNS).in("id", paidIds)
      .eq("payment_gateway", "pagbank").eq("status", "pago").limit(limit)
    : { data: [], error: null };
  const pendingResult = pendingIds.length
    ? await supabaseAdmin.from("sales").select(SALE_COLUMNS).in("id", pendingIds)
      .eq("payment_gateway", "pagbank").eq("status", "pendente_pagamento").limit(limit)
    : { data: [], error: null };
  if (paidResult.error || pendingResult.error) return 0;
  const paid = (paidResult.data ?? []).filter((s: any) => s.status === "pago")
    .sort((a: any, b: any) => paidIds.indexOf(a.id) - paidIds.indexOf(b.id));
  // Reserve space for pending Orders too; problematic paid sales cannot starve them.
  const paidLimit = pendingResult.data?.length ? Math.ceil(limit / 2) : limit;
  const sales = [...paid.slice(0, paidLimit),
    ...(pendingResult.data ?? []).filter((s: any) => s.status === "pendente_pagamento").slice(0, limit - Math.min(paid.length, paidLimit))];
  let finalized = 0;
  for (const sale of sales ?? []) {
    const { decision, reason } = await evaluatePagbankSale(supabaseAdmin, sale);
    if (decision === "finalized") finalized++;
    log({ stage: "pagbank_recovery", action: decision === "finalized" ? "finalizado" : "ignorado", sale_id: sale.id, company_id: sale.company_id, payment_environment: sale.payment_environment, reason });
  }
  return finalized;
}
