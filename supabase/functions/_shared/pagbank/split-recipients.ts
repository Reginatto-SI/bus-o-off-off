// @ts-nocheck — arquivo Deno (edge function): tipos resolvidos pelo runtime Deno, não pelo tsc do app.
/* eslint-disable @typescript-eslint/no-explicit-any */
// Resolve elegibilidade SmartBus (mesma regra do Asaas: sócio global e
// representante vinculado à empresa) e as contas PagBank do ambiente.
// Diferença deliberada em relação ao Asaas: recebedor elegível SEM conta
// PagBank não degrada — o chamador deve bloquear a cobrança.

import { logPaymentTrace } from "../payment-observability.ts";
import type { PagbankEnvironment } from "./core.ts";

type SupabaseAdminClient = any;

export type PagbankRecipientResolution = {
  socio: {
    eligible: boolean;
    accountId: string | null;
    reason: "included" | "not_configured" | "account_missing" | "ambiguous" | "query_failed";
  };
  representative: {
    eligible: boolean;
    accountId: string | null;
    representativeId: string | null;
    reason:
      | "included"
      | "missing_sale_representative"
      | "representative_company_mismatch"
      | "representative_not_found"
      | "account_missing"
      | "query_failed";
  };
};

function pick(row: any, environment: PagbankEnvironment, base: string): string | null {
  const v = environment === "production" ? row?.[`${base}_production`] : row?.[`${base}_sandbox`];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

export async function resolvePagbankSplitRecipients(params: {
  supabaseAdmin: SupabaseAdminClient;
  source: string;
  saleId: string;
  companyId: string;
  environment: PagbankEnvironment;
  splitEnabled: boolean;
  representativeId?: string | null;
}): Promise<PagbankRecipientResolution> {
  const result: PagbankRecipientResolution = {
    socio: { eligible: false, accountId: null, reason: "not_configured" },
    representative: {
      eligible: false,
      accountId: null,
      representativeId: params.representativeId ?? null,
      reason: "missing_sale_representative",
    },
  };
  if (!params.splitEnabled) return result;

  // Sócio global: sem filtro por company_id (regra SmartBus). Considerado
  // "configurado" quando possui alguma identidade financeira no ambiente
  // (wallet Asaas ou conta PagBank); elegível para PagBank só com conta PagBank.
  const { data: socios, error: socioError } = await params.supabaseAdmin
    .from("socios_split")
    .select("id, name, asaas_wallet_id, asaas_wallet_id_production, asaas_wallet_id_sandbox, pagbank_account_id_production, pagbank_account_id_sandbox");
  if (socioError) {
    result.socio = { eligible: false, accountId: null, reason: "query_failed" };
    logPaymentTrace("error", params.source, "pagbank_split_socio_query_failed", {
      sale_id: params.saleId,
      company_id: params.companyId,
      payment_environment: params.environment,
      error_message: socioError.message,
    });
  } else {
    const configured = (socios ?? []).filter((s: any) =>
      Boolean(pick(s, params.environment, "asaas_wallet_id") ?? s?.asaas_wallet_id ?? pick(s, params.environment, "pagbank_account_id"))
    );
    if (configured.length === 1) {
      const accountId = pick(configured[0], params.environment, "pagbank_account_id");
      result.socio = accountId
        ? { eligible: true, accountId, reason: "included" }
        : { eligible: true, accountId: null, reason: "account_missing" };
    } else if (configured.length > 1) {
      result.socio = { eligible: false, accountId: null, reason: "ambiguous" };
    }
  }

  if (!params.representativeId) return result;

  const { data: link, error: linkError } = await params.supabaseAdmin
    .from("representative_company_links")
    .select("representative_id, company_id")
    .eq("representative_id", params.representativeId)
    .eq("company_id", params.companyId)
    .maybeSingle();
  if (linkError) {
    result.representative.reason = "query_failed";
    return result;
  }
  if (!link) {
    result.representative.reason = "representative_company_mismatch";
    return result;
  }
  const { data: rep, error: repError } = await params.supabaseAdmin
    .from("representatives")
    .select("id, pagbank_account_id_production, pagbank_account_id_sandbox")
    .eq("id", params.representativeId)
    .maybeSingle();
  if (repError) {
    result.representative.reason = "query_failed";
    return result;
  }
  if (!rep) {
    result.representative.reason = "representative_not_found";
    return result;
  }
  const accountId = pick(rep, params.environment, "pagbank_account_id");
  result.representative = accountId
    ? { eligible: true, accountId, representativeId: rep.id, reason: "included" }
    : { eligible: true, accountId: null, representativeId: rep.id, reason: "account_missing" };
  return result;
}
