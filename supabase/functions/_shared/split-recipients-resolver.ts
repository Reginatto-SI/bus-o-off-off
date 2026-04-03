import { logPaymentTrace } from "./payment-observability.ts";
import {
  type FinancialSocioValidationResult,
  resolveSocioWalletByEnvironment,
  validateFinancialSocioForSplit,
} from "./payment-context-resolver.ts";
import type { PaymentEnvironment } from "./runtime-env.ts";

type SupabaseAdminClient = {
  from: (table: string) => {
    select: (query: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          limit: (value: number) => Promise<{
            data: Array<Record<string, unknown>> | null;
            error: { message: string } | null;
          }>;
        };
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

type ResolveSplitRecipientsParams = {
  supabaseAdmin: SupabaseAdminClient;
  source: "create-asaas-payment" | "verify-payment-status" | "asaas-webhook" | "reconcile-sale-payment";
  saleId: string;
  companyId: string;
  paymentEnvironment: PaymentEnvironment;
  splitEnabled: boolean;
  platformFeePercent: number;
  socioSplitPercent: number;
  representativeId?: string | null;
  includePlatformRecipient: boolean;
  platformWalletId?: string | null;
};

export type SplitRecipient = {
  kind: "platform" | "socio" | "representative";
  walletId: string;
  percentualValue: number;
};

type RepresentativeResolution = {
  eligible: boolean;
  reason:
    | "not_configured"
    | "missing_sale_representative"
    | "representative_not_found"
    | "representative_status_invalid"
    | "representative_wallet_missing"
    | "representative_percent_invalid"
    | "representative_lookup_failed"
    | "included";
  representativeId: string | null;
  walletId: string | null;
  percent: number;
};

export type ResolveSplitRecipientsResult = {
  recipients: SplitRecipient[];
  socioValidation: FinancialSocioValidationResult | null;
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
  status: string;
  commission_percent?: number | null;
  asaas_wallet_id_production?: string | null;
  asaas_wallet_id_sandbox?: string | null;
};

function resolveRepresentativeWalletByEnvironment(
  representative: {
    asaas_wallet_id_production?: string | null;
    asaas_wallet_id_sandbox?: string | null;
  },
  environment: PaymentEnvironment,
): string | null {
  return environment === "production"
    ? representative.asaas_wallet_id_production ?? null
    : representative.asaas_wallet_id_sandbox ?? null;
}

/**
 * Resolvedor central de recebedores do split Asaas.
 *
 * Objetivo da Fase 2:
 * - manter uma única interpretação para plataforma/sócio/representante;
 * - permitir reuso em create/verify/webhook/reconcile sem lógica paralela;
 * - tratar representante como elegível opcional (wallet ausente nunca derruba checkout).
 */
export async function resolveAsaasSplitRecipients(
  params: ResolveSplitRecipientsParams,
): Promise<ResolveSplitRecipientsResult> {
  const recipients: SplitRecipient[] = [];

  if (!params.splitEnabled) {
    return {
      recipients,
      socioValidation: null,
      representative: {
        eligible: false,
        reason: "not_configured",
        representativeId: params.representativeId ?? null,
        walletId: null,
        percent: 0,
      },
    };
  }

  let socioValidation: FinancialSocioValidationResult | null = null;

  const effectiveSocioPercent = params.socioSplitPercent > 0
    ? params.socioSplitPercent
    : 0;

  if (params.includePlatformRecipient && params.platformFeePercent > 0) {
    if (!params.platformWalletId) {
      throw new Error("missing_platform_wallet");
    }

    recipients.push({
      kind: "platform",
      walletId: params.platformWalletId,
      percentualValue: params.platformFeePercent,
    });
  }

  if (effectiveSocioPercent > 0) {
    const { data: socioRows, error: socioError } = await params.supabaseAdmin
      .from("socios_split")
      .select("id, name, status, asaas_wallet_id, asaas_wallet_id_production, asaas_wallet_id_sandbox")
      .eq("company_id", params.companyId)
      .eq("status", "ativo")
      .limit(2);

    if (socioError) {
      throw new Error(`split_socio_query_failed:${socioError.message}`);
    }

    socioValidation = validateFinancialSocioForSplit({
      socios: (socioRows ?? []) as SocioRow[],
      provider: "asaas",
      environment: params.paymentEnvironment,
    });

    if (!socioValidation.ok) {
      throw new Error(`${socioValidation.code}:${socioValidation.message}`);
    }

    if (socioValidation.walletId) {
      recipients.push({
        kind: "socio",
        walletId: socioValidation.walletId,
        percentualValue: effectiveSocioPercent,
      });
    }
  }

  if (!params.representativeId) {
    return {
      recipients,
      socioValidation,
      representative: {
        eligible: false,
        reason: "missing_sale_representative",
        representativeId: null,
        walletId: null,
        percent: 0,
      },
    };
  }

  try {
    const { data: representativeRaw, error: representativeError } = await params.supabaseAdmin
      .from("representatives")
      .select("id, status, commission_percent, asaas_wallet_id_production, asaas_wallet_id_sandbox")
      .eq("id", params.representativeId)
      .maybeSingle();

    if (representativeError) {
      return {
        recipients,
        socioValidation,
        representative: {
          eligible: false,
          reason: "representative_lookup_failed",
          representativeId: params.representativeId,
          walletId: null,
          percent: 0,
        },
      };
    }

    if (!representativeRaw) {
      return {
        recipients,
        socioValidation,
        representative: {
          eligible: false,
          reason: "representative_not_found",
          representativeId: params.representativeId,
          walletId: null,
          percent: 0,
        },
      };
    }

    const representative = representativeRaw as RepresentativeRow;

    if (representative.status !== "ativo") {
      return {
        recipients,
        socioValidation,
        representative: {
          eligible: false,
          reason: "representative_status_invalid",
          representativeId: representative.id,
          walletId: null,
          percent: 0,
        },
      };
    }

    const representativePercent = Number(representative.commission_percent ?? 2);
    if (!Number.isFinite(representativePercent) || representativePercent <= 0) {
      return {
        recipients,
        socioValidation,
        representative: {
          eligible: false,
          reason: "representative_percent_invalid",
          representativeId: representative.id,
          walletId: null,
          percent: representativePercent,
        },
      };
    }

    const representativeWalletId = resolveRepresentativeWalletByEnvironment(
      representative,
      params.paymentEnvironment,
    );

    if (!representativeWalletId) {
      return {
        recipients,
        socioValidation,
        representative: {
          eligible: false,
          reason: "representative_wallet_missing",
          representativeId: representative.id,
          walletId: null,
          percent: representativePercent,
        },
      };
    }

    recipients.push({
      kind: "representative",
      walletId: representativeWalletId,
      percentualValue: representativePercent,
    });

    return {
      recipients,
      socioValidation,
      representative: {
        eligible: true,
        reason: "included",
        representativeId: representative.id,
        walletId: representativeWalletId,
        percent: representativePercent,
      },
    };
  } catch (error) {
    logPaymentTrace("error", params.source, "split_representative_resolution_exception", {
      sale_id: params.saleId,
      company_id: params.companyId,
      payment_environment: params.paymentEnvironment,
      representative_id: params.representativeId,
      error_message: error instanceof Error ? error.message : String(error),
    });

    return {
      recipients,
      socioValidation,
      representative: {
        eligible: false,
        reason: "representative_lookup_failed",
        representativeId: params.representativeId,
        walletId: null,
        percent: 0,
      },
    };
  }
}

export function computeSocioFinancialSnapshot(params: {
  grossAmount: number;
  platformFeePercent: number;
  socioSplitPercent: number;
  socioValidation: FinancialSocioValidationResult | null;
  paymentEnvironment: PaymentEnvironment;
}) {
  const grossAmountCents = Math.round(params.grossAmount * 100);
  const platformFeeCents = Math.round(
    grossAmountCents * (params.platformFeePercent / 100),
  );
  const platformFeeTotal = platformFeeCents / 100;

  const socio = params.socioValidation?.ok ? params.socioValidation.socio : null;
  const socioWalletId = params.socioValidation?.ok
    ? resolveSocioWalletByEnvironment(socio, params.paymentEnvironment)
    : null;

  let socioFeeAmount = 0;
  let platformNetAmount = platformFeeTotal;

  if (
    socioWalletId &&
    socio?.status === "ativo" &&
    params.socioSplitPercent > 0
  ) {
    const socioFeeCents = Math.round(
      platformFeeCents * (params.socioSplitPercent / 100),
    );
    socioFeeAmount = socioFeeCents / 100;
    platformNetAmount = (platformFeeCents - socioFeeCents) / 100;
  }

  return {
    platformFeeTotal,
    socioFeeAmount,
    platformNetAmount,
    socio,
    socioWalletId,
  };
}
