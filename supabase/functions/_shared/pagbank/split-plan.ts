// @ts-nocheck — arquivo Deno (edge function): tipos resolvidos pelo runtime Deno, não pelo tsc do app.
/* eslint-disable @typescript-eslint/no-explicit-any */
// Tradução do plano financeiro SmartBus (já calculado pelo motor comum em
// `platform-fee-engine.ts`) para o formato `splits.method = FIXED` do PagBank.
// Este módulo NÃO recalcula taxa nem elegibilidade: só converte, valida a soma
// exata em centavos e falha fechado quando um recebedor elegível não tem conta.

import type { PlatformFeeDistribution } from "../platform-fee-engine.ts";
import { PagbankError } from "./core.ts";

export type PagbankSplitParticipant = "company" | "marketplace" | "socio" | "representative";

export type PagbankSplitReceiver = {
  kind: PagbankSplitParticipant;
  accountId: string;
  amountCents: number;
};

export type PagbankSplitPlan = {
  totalCents: number;
  feeCents: number;
  companyNetCents: number;
  receivers: PagbankSplitReceiver[];
  /** Payload pronto para `qr_codes[].splits` / `charges[].splits`. */
  payload: {
    method: "FIXED";
    receivers: Array<{ account: { id: string }; amount: { value: number }; reason: string }>;
  } | null;
  mode: PlatformFeeDistribution["mode"];
};

function toCents(value: number): number {
  return Math.round(Number(value || 0) * 100);
}

/**
 * Regras:
 * - empresa vendedora recebe total - taxa SmartBus;
 * - Marketplace, sócio e representante recebem exatamente os centavos do motor;
 * - qualquer participante com valor > 0 sem `accountId` bloqueia a cobrança (sem remoção silenciosa);
 * - soma dos recebedores deve fechar exatamente no total;
 * - taxa zero → sem split (payload null), cobrança 100% da empresa.
 */
export function buildPagbankFixedSplitPlan(params: {
  grossAmount: number;
  distribution: PlatformFeeDistribution;
  accounts: {
    company: string | null;
    marketplace: string | null;
    socio: string | null;
    representative: string | null;
  };
}): PagbankSplitPlan {
  const totalCents = toCents(params.grossAmount);
  const platformCents = toCents(params.distribution.platformAmount);
  const socioCents = toCents(params.distribution.socioAmount);
  const representativeCents = toCents(params.distribution.representativeAmount);
  const feeCents = platformCents + socioCents + representativeCents;

  if (totalCents <= 0) {
    throw new PagbankError("pagbank_validation_rejected", "Valor da cobrança inválido.", 400, { totalCents });
  }
  if (feeCents > totalCents) {
    throw new PagbankError("pagbank_split_sum_mismatch", "A taxa calculada excede o valor da cobrança.", 409, {
      totalCents,
      feeCents,
    });
  }

  const companyNetCents = totalCents - feeCents;

  if (feeCents === 0) {
    return {
      totalCents,
      feeCents,
      companyNetCents,
      receivers: [],
      payload: null,
      mode: params.distribution.mode,
    };
  }

  const wanted: Array<{ kind: PagbankSplitParticipant; amountCents: number; accountId: string | null }> = [
    { kind: "company", amountCents: companyNetCents, accountId: params.accounts.company },
    { kind: "marketplace", amountCents: platformCents, accountId: params.accounts.marketplace },
    { kind: "socio", amountCents: socioCents, accountId: params.accounts.socio },
    { kind: "representative", amountCents: representativeCents, accountId: params.accounts.representative },
  ];

  const missing = wanted.filter((w) => w.amountCents > 0 && !w.accountId).map((w) => w.kind);
  if (missing.length > 0) {
    throw new PagbankError(
      "pagbank_split_recipient_missing",
      "A divisão financeira não pôde ser montada: há recebedor sem conta PagBank configurada neste ambiente.",
      409,
      { missing },
    );
  }

  const receivers: PagbankSplitReceiver[] = wanted
    .filter((w) => w.amountCents > 0)
    .map((w) => ({ kind: w.kind, accountId: w.accountId as string, amountCents: w.amountCents }));

  const sum = receivers.reduce((acc, r) => acc + r.amountCents, 0);
  if (sum !== totalCents) {
    throw new PagbankError("pagbank_split_sum_mismatch", "A soma da divisão não fecha com o total.", 409, {
      sum,
      totalCents,
    });
  }

  const ids = receivers.map((r) => r.accountId);
  if (new Set(ids).size !== ids.length) {
    throw new PagbankError("pagbank_validation_rejected", "Contas de recebedores duplicadas na divisão.", 409, {
      receivers: receivers.map((r) => r.kind),
    });
  }

  return {
    totalCents,
    feeCents,
    companyNetCents,
    receivers,
    payload: {
      method: "FIXED",
      receivers: receivers.map((r) => ({
        account: { id: r.accountId },
        amount: { value: r.amountCents },
        reason: `smartbus_${r.kind}`,
      })),
    },
    mode: params.distribution.mode,
  };
}
