import type { PlatformFeeDistribution } from "./platform-fee-engine.ts";
import type { ResolveSplitRecipientsResult } from "./split-recipients-resolver.ts";

export type SplitDegradationReason =
  | "socio_query_failed"
  | "socio_wallet_missing"
  | "socio_ambiguous"
  | "representative_unconfirmed"
  | "platform_wallet_missing"
  | "issuer_wallet_unavailable"
  | "issuer_wallet_omitted"
  | "gateway_split_rejected";

export type AsaasSplitPayloadRecipient = {
  kind: "platform" | "socio" | "representative";
  walletId: string;
  fixedValue?: number;
  totalFixedValue?: number;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function isSocioUncertain(eligibility: ResolveSplitRecipientsResult): boolean {
  return eligibility.socio.reason === "query_failed" || eligibility.socio.reason === "ambiguous";
}

function isRepresentativeUncertain(eligibility: ResolveSplitRecipientsResult): boolean {
  return eligibility.representative.reason === "representative_lookup_failed" ||
    eligibility.representative.reason === "representative_company_mismatch";
}

function potentialPendingAmount(
  eligibility: ResolveSplitRecipientsResult,
  totalFee: number,
): number {
  const totalCents = Math.round(totalFee * 100);
  const socioUncertain = isSocioUncertain(eligibility);
  const representativeUncertain = isRepresentativeUncertain(eligibility);
  const representativeCouldParticipate = eligibility.representative.eligible || representativeUncertain;
  const socioPotentialCents = socioUncertain
    ? (representativeCouldParticipate ? Math.floor(totalCents / 3) : Math.floor(totalCents / 2))
    : 0;
  const representativePotentialCents = representativeUncertain
    ? Math.floor(totalCents / 3)
    : 0;
  return roundMoney((socioPotentialCents + representativePotentialCents) / 100);
}

/**
 * Único adaptador entre a distribuição comercial em reais e o payload Asaas.
 * Cobrança avulsa usa `fixedValue`. Em parcelamento, `totalFixedValue` preserva
 * o total comercial e deixa o Asaas distribuí-lo entre parcelas (inclusive os
 * centavos). `percentualValue` não é usado porque incide sobre o valor líquido.
 * A wallet da conta emissora nunca é enviada; seu saldo permanece na emissora.
 */
export function buildAsaasSplitPayload(params: {
  eligibility: ResolveSplitRecipientsResult;
  distribution: PlatformFeeDistribution;
  platformWalletId: string | null;
  issuerWalletId: string | null;
  includePlatformRecipient: boolean;
  issuerKind: "company" | "platform";
  requireIssuerWallet?: boolean;
  installmentCount?: number | null;
}): { recipients: AsaasSplitPayloadRecipient[]; reasons: SplitDegradationReason[]; pendingAmount: number } {
  const reasons: SplitDegradationReason[] = [];
  if (params.eligibility.socio.reason === "query_failed") reasons.push("socio_query_failed");
  if (params.eligibility.socio.reason === "wallet_missing") reasons.push("socio_wallet_missing");
  if (params.eligibility.socio.reason === "ambiguous") reasons.push("socio_ambiguous");
  if (params.eligibility.representative.reason !== "included" &&
    params.eligibility.representative.reason !== "missing_sale_representative") {
    reasons.push("representative_unconfirmed");
  }

  if (params.requireIssuerWallet !== false && !params.issuerWalletId) {
    reasons.push("issuer_wallet_unavailable");
    return {
      recipients: [],
      reasons,
      pendingAmount: params.distribution.platformAmount +
        params.distribution.socioAmount + params.distribution.representativeAmount,
    };
  }

  // Sem a wallet da plataforma não enviamos um split parcial: a cobrança segue
  // na conta da empresa e toda a taxa calculada fica pendente de conciliação.
  if (params.includePlatformRecipient && !params.platformWalletId) {
    reasons.push("platform_wallet_missing");
    return {
      recipients: [],
      reasons,
      pendingAmount: params.distribution.platformAmount +
        params.distribution.socioAmount + params.distribution.representativeAmount,
    };
  }

  const recipients: AsaasSplitPayloadRecipient[] = [];
  let issuerWalletOmittedAmount = 0;
  const addRecipient = (
    kind: AsaasSplitPayloadRecipient["kind"],
    walletId: string | null,
    amount: number,
  ) => {
    if (!walletId || amount <= 0) return;
    if (params.issuerWalletId && walletId === params.issuerWalletId) {
      reasons.push("issuer_wallet_omitted");
      // Na cobrança manual a plataforma é a emissora e sua parcela permanece
      // naturalmente na conta. Na cobrança pública a empresa é a emissora:
      // colisão com a wallet SmartBus é configuração suspeita e fica pendente.
      if (kind !== "platform" || params.issuerKind === "company") {
        issuerWalletOmittedAmount += amount;
      }
      return;
    }
    const monetaryField = Number(params.installmentCount ?? 1) >= 2
      ? { totalFixedValue: roundMoney(amount) }
      : { fixedValue: roundMoney(amount) };
    recipients.push({ kind, walletId, ...monetaryField });
  };

  if (params.includePlatformRecipient) {
    addRecipient("platform", params.platformWalletId, params.distribution.platformAmount);
  }
  addRecipient("socio", params.eligibility.socio.walletId, params.distribution.socioAmount);
  addRecipient(
    "representative",
    params.eligibility.representative.walletId,
    params.distribution.representativeAmount,
  );

  return {
    recipients,
    reasons,
    pendingAmount: roundMoney(
      potentialPendingAmount(
        params.eligibility,
        params.distribution.platformAmount + params.distribution.socioAmount +
          params.distribution.representativeAmount,
      ) + issuerWalletOmittedAmount,
    ),
  };
}

export function isExplicitAsaasSplitRejection(status: number, data: unknown): boolean {
  if (status < 400 || status >= 500 || status === 401 || status === 403) return false;
  const payload = data as { errors?: Array<{ code?: unknown; description?: unknown }> } | null;
  const errors = payload?.errors ?? [];
  if (errors.length === 0) return false;
  return errors.every((error) => {
    const code = String(error.code ?? "").toLowerCase();
    const description = String(error.description ?? "").toLowerCase();
    const normalizedCode = code.replace(/[^a-z0-9]/g, "");
    if (["invalidsplit", "invalidwallet", "invalidfixedvalue", "invalidtotalfixedvalue"]
      .includes(normalizedCode)) return true;
    if (normalizedCode.includes("split") || normalizedCode.includes("recipientwallet")) return true;
    // Texto só é aceito quando identifica o contexto de recebedor/split; termos
    // genéricos de pagamento não autorizam uma segunda criação.
    const splitContext = description.includes("split") || description.includes("recebedor") ||
      description.includes("recipient");
    const splitField = description.includes("wallet") || description.includes("carteira") ||
      description.includes("fixedvalue") || description.includes("totalfixedvalue") ||
      description.includes("fixed value") || description.includes("valor fixo");
    return splitContext && splitField;
  });
}

export function withoutSplit(payload: Record<string, unknown>): Record<string, unknown> {
  const fallback = { ...payload };
  delete fallback.split;
  return fallback;
}
