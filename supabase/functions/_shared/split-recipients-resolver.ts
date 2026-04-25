import { logPaymentTrace } from "./payment-observability.ts";
import {
  type FinancialSocioValidationResult,
  resolveSocioWalletByEnvironment,
  validateFinancialSocioForSplit,
} from "./payment-context-resolver.ts";
import type { PaymentEnvironment } from "./runtime-env.ts";

// deno-lint-ignore no-explicit-any
type SupabaseAdminClient = any;

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
  distributionPercentages?: {
    platform: number;
    socio: number;
    representative: number;
  } | null;
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
  socio: {
    included: boolean;
    reason: "included" | "missing_or_invalid" | "wallet_missing";
    percent: number;
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
  status: string;
  asaas_wallet_id_production?: string | null;
  asaas_wallet_id_sandbox?: string | null;
};

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

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
      socio: {
        included: false,
        reason: "missing_or_invalid",
        percent: 0,
      },
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

  if (!params.distributionPercentages) {
    throw new Error("missing_distribution_percentages");
  }

  const effectivePlatformPercent = roundPercent(
    params.distributionPercentages.platform,
  );
  const requestedSocioPercent = roundPercent(
    params.distributionPercentages.socio,
  );
  const requestedRepresentativePercent = roundPercent(
    params.distributionPercentages.representative,
  );

  let platformPercent = effectivePlatformPercent;
  let socioPercent = requestedSocioPercent;
  let representativePercent = requestedRepresentativePercent;
  let socioIncluded = false;
  let socioReason: "included" | "missing_or_invalid" | "wallet_missing" = "missing_or_invalid";

  const syncRecipients = () => {
    if (params.includePlatformRecipient) {
      const platformRecipient = recipients.find((item) => item.kind === "platform");
      if (platformRecipient) {
        platformRecipient.percentualValue = roundPercent(platformPercent);
      }
    }

    const existingSocio = recipients.findIndex((item) => item.kind === "socio");
    if (existingSocio >= 0) recipients.splice(existingSocio, 1);

    if (socioIncluded && socioPercent > 0 && socioValidation?.ok && socioValidation.walletId) {
      recipients.push({
        kind: "socio",
        walletId: socioValidation.walletId,
        percentualValue: roundPercent(socioPercent),
      });
    }
  };

  const redistributeRepresentativeWhenUnavailable = () => {
    if (representativePercent <= 0) return;
    if (socioIncluded && socioPercent > 0) {
      const halfRepresentative = roundPercent(representativePercent / 2);
      socioPercent = roundPercent(socioPercent + halfRepresentative);
      platformPercent = roundPercent(platformPercent + (representativePercent - halfRepresentative));
    } else {
      platformPercent = roundPercent(platformPercent + representativePercent);
    }
    representativePercent = 0;
  };

  if (params.includePlatformRecipient && effectivePlatformPercent > 0) {
    if (!params.platformWalletId) {
      throw new Error("missing_platform_wallet");
    }

    recipients.push({
      kind: "platform",
      walletId: params.platformWalletId,
      percentualValue: effectivePlatformPercent,
    });
  }

  if (requestedSocioPercent > 0) {
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
      platformPercent = roundPercent(platformPercent + requestedSocioPercent);
      socioPercent = 0;
      socioReason = socioValidation.code === "split_socio_wallet_missing"
        ? "wallet_missing"
        : "missing_or_invalid";
    } else if (socioValidation.walletId) {
      socioIncluded = true;
      socioReason = "included";
    }
  }

  if (!params.representativeId) {
    redistributeRepresentativeWhenUnavailable();
    syncRecipients();
    return {
      recipients,
      socioValidation,
      socio: {
        included: socioIncluded,
        reason: socioReason,
        percent: socioPercent,
      },
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
      .select("id, status, asaas_wallet_id_production, asaas_wallet_id_sandbox")
      .eq("id", params.representativeId)
      .maybeSingle();

    if (representativeError) {
      redistributeRepresentativeWhenUnavailable();
      syncRecipients();
      return {
        recipients,
        socioValidation,
        socio: {
          included: socioIncluded,
          reason: socioReason,
          percent: socioPercent,
        },
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
      redistributeRepresentativeWhenUnavailable();
      syncRecipients();
      return {
        recipients,
        socioValidation,
        socio: {
          included: socioIncluded,
          reason: socioReason,
          percent: socioPercent,
        },
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
      redistributeRepresentativeWhenUnavailable();
      syncRecipients();
      return {
        recipients,
        socioValidation,
        socio: {
          included: socioIncluded,
          reason: socioReason,
          percent: socioPercent,
        },
        representative: {
          eligible: false,
          reason: "representative_status_invalid",
          representativeId: representative.id,
          walletId: null,
          percent: 0,
        },
      };
    }

    /**
     * Regra nova: não usamos mais `representatives.commission_percent` como
     * fonte operacional do split. O percentual do representante deriva
     * exclusivamente da taxa da plataforma da própria venda/contexto.
     */
    representativePercent = roundPercent(
      Number(params.distributionPercentages.representative ?? 0),
    );
    if (!Number.isFinite(representativePercent) || representativePercent <= 0) {
      redistributeRepresentativeWhenUnavailable();
      syncRecipients();
      return {
        recipients,
        socioValidation,
        socio: {
          included: socioIncluded,
          reason: socioReason,
          percent: socioPercent,
        },
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
      redistributeRepresentativeWhenUnavailable();
      syncRecipients();

      return {
        recipients,
        socioValidation,
        socio: {
          included: socioIncluded,
          reason: socioReason,
          percent: socioPercent,
        },
        representative: {
          eligible: false,
          reason: "representative_wallet_missing",
          representativeId: representative.id,
          walletId: null,
          percent: representativePercent,
        },
      };
    }

    syncRecipients();

    if (representativePercent > 0) {
      recipients.push({
        kind: "representative",
        walletId: representativeWalletId,
        percentualValue: representativePercent,
      });
    }

    return {
      recipients,
      socioValidation,
      socio: {
        included: socioIncluded,
        reason: socioReason,
        percent: socioPercent,
      },
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

    redistributeRepresentativeWhenUnavailable();
    syncRecipients();

    return {
      recipients,
      socioValidation,
      socio: {
        included: socioIncluded,
        reason: socioReason,
        percent: socioPercent,
      },
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
