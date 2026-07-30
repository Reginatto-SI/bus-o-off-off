import { logPaymentTrace } from "./payment-observability.ts";
import {
  type FinancialSocioValidationResult,
  validateFinancialSocioForSplit,
} from "./payment-context-resolver.ts";
import type { PaymentEnvironment } from "./runtime-env.ts";

// The Edge Functions deliberately accept the untyped service-role client used by
// this repository; authorization remains enforced by the resolver's explicit
// company predicates rather than generated client types.
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdminClient = any;

type ResolveSplitRecipientsParams = {
  supabaseAdmin: SupabaseAdminClient;
  source: "create-asaas-payment" | "create-platform-fee-checkout" | "verify-payment-status" | "asaas-webhook" | "reconcile-sale-payment";
  saleId: string;
  companyId: string;
  paymentEnvironment: PaymentEnvironment;
  splitEnabled: boolean;
  representativeId?: string | null;
};

type RepresentativeResolution = {
  eligible: boolean;
  reason:
    | "not_configured"
    | "missing_sale_representative"
    | "representative_not_found"
    | "representative_wallet_missing"
    | "representative_company_mismatch"
    | "representative_lookup_failed"
    | "included";
  representativeId: string | null;
  walletId: string | null;
};

export type ResolveSplitRecipientsResult = {
  socioValidation: FinancialSocioValidationResult | null;
  socio: {
    included: boolean;
    reason: "included" | "missing_or_invalid" | "wallet_missing" | "query_failed" | "ambiguous";
    walletId: string | null;
  };
  representative: RepresentativeResolution;
};

type SocioRow = {
  id?: string | null;
  name?: string | null;
  status?: string | null;
  asaas_wallet_id?: string | null;
  asaas_wallet_id_production?: string | null;
  asaas_wallet_id_sandbox?: string | null;
};

type RepresentativeRow = {
  id: string;
  asaas_wallet_id_production?: string | null;
  asaas_wallet_id_sandbox?: string | null;
};

function representativeWallet(row: RepresentativeRow, environment: PaymentEnvironment): string | null {
  return environment === "production"
    ? row.asaas_wallet_id_production ?? null
    : row.asaas_wallet_id_sandbox ?? null;
}

/**
 * Resolve somente identidade, vínculo multiempresa e wallet no ambiente.
 * A taxa comercial já foi calculada em valores absolutos antes desta função;
 * os quatro cenários são distribuídos exclusivamente por `distributePlatformFee`
 * e convertidos para `fixedValue`/`totalFixedValue` por `buildAsaasSplitPayload`.
 *
 * O sócio é global e não recebe filtro por `company_id` nem por status legado.
 * O representante precisa do vínculo explícito com a empresa da venda e da
 * wallet do ambiente. Ausência, consulta indisponível ou vínculo inconsistente
 * degradam o recebedor sem bloquear a cobrança e ficam distinguíveis nos logs.
 */
export async function resolveAsaasSplitRecipients(
  params: ResolveSplitRecipientsParams,
): Promise<ResolveSplitRecipientsResult> {
  const emptyRepresentative = (reason: RepresentativeResolution["reason"]): RepresentativeResolution => ({
    eligible: false,
    reason,
    representativeId: params.representativeId ?? null,
    walletId: null,
  });
  if (!params.splitEnabled) {
    return {
      socioValidation: null,
      socio: { included: false, reason: "missing_or_invalid", walletId: null },
      representative: emptyRepresentative("not_configured"),
    };
  }

  let socioValidation: FinancialSocioValidationResult | null = null;
  let socio: ResolveSplitRecipientsResult["socio"] = {
    included: false,
    reason: "missing_or_invalid",
    walletId: null,
  };
  const { data: socioRows, error: socioError } = await params.supabaseAdmin
    .from("socios_split")
    .select("id, name, status, asaas_wallet_id, asaas_wallet_id_production, asaas_wallet_id_sandbox");
  if (socioError) {
    socio = { included: false, reason: "query_failed", walletId: null };
    logPaymentTrace("error", params.source, "split_socio_query_failed_degraded", {
      sale_id: params.saleId,
      company_id: params.companyId,
      payment_environment: params.paymentEnvironment,
      error_message: socioError.message,
      fallback: "socio_unconfirmed",
      reconciliation_pending: true,
    });
  } else {
    socioValidation = validateFinancialSocioForSplit({
      socios: (socioRows ?? []) as SocioRow[],
      provider: "asaas",
      environment: params.paymentEnvironment,
    });
    if (socioValidation.ok) {
      socio = { included: true, reason: "included", walletId: socioValidation.walletId };
    } else {
      socio = {
        included: false,
        reason: socioValidation.code === "split_socio_wallet_missing"
          ? "wallet_missing"
          : socioValidation.code === "split_socio_multiple_active"
          ? "ambiguous"
          : "missing_or_invalid",
        walletId: null,
      };
    }
  }

  if (!params.representativeId) {
    return { socioValidation, socio, representative: emptyRepresentative("missing_sale_representative") };
  }

  try {
    // A associação é confirmada pela mesma tabela que alimenta os links de
    // representante. O predicado duplo impede vazamento entre empresas.
    const { data: link, error: linkError } = await params.supabaseAdmin
      .from("representative_company_links")
      .select("representative_id, company_id")
      .eq("representative_id", params.representativeId)
      .eq("company_id", params.companyId)
      .maybeSingle();
    if (linkError) {
      logPaymentTrace("error", params.source, "split_representative_company_lookup_failed", {
        sale_id: params.saleId,
        company_id: params.companyId,
        representative_id: params.representativeId,
        error_message: linkError.message,
      });
      return { socioValidation, socio, representative: emptyRepresentative("representative_lookup_failed") };
    }
    if (!link) {
      logPaymentTrace("warn", params.source, "split_representative_company_mismatch_degraded", {
        sale_id: params.saleId,
        company_id: params.companyId,
        representative_id: params.representativeId,
        reconciliation_pending: true,
      });
      return { socioValidation, socio, representative: emptyRepresentative("representative_company_mismatch") };
    }

    const { data: raw, error } = await params.supabaseAdmin
      .from("representatives")
      .select("id, asaas_wallet_id_production, asaas_wallet_id_sandbox")
      .eq("id", params.representativeId)
      .maybeSingle();
    if (error) return { socioValidation, socio, representative: emptyRepresentative("representative_lookup_failed") };
    if (!raw) return { socioValidation, socio, representative: emptyRepresentative("representative_not_found") };
    const row = raw as RepresentativeRow;
    const walletId = representativeWallet(row, params.paymentEnvironment);
    if (!walletId) {
      return { socioValidation, socio, representative: emptyRepresentative("representative_wallet_missing") };
    }
    return {
      socioValidation,
      socio,
      representative: { eligible: true, reason: "included", representativeId: row.id, walletId },
    };
  } catch (error) {
    logPaymentTrace("error", params.source, "split_representative_resolution_exception", {
      sale_id: params.saleId,
      company_id: params.companyId,
      representative_id: params.representativeId,
      error_message: error instanceof Error ? error.message : String(error),
    });
    return { socioValidation, socio, representative: emptyRepresentative("representative_lookup_failed") };
  }
}
