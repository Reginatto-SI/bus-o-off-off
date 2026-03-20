type FinancialPartnerLike = {
  status?: string | null;
  asaas_wallet_id?: string | null;
  asaas_wallet_id_production?: string | null;
  asaas_wallet_id_sandbox?: string | null;
};

export type FinancialPartnerConfigStatus =
  | {
      state: 'valid';
      message: null;
    }
  | {
      state: 'missing_active_partner' | 'multiple_active_partners' | 'missing_wallet';
      message: string;
    };

/**
 * Regras de UI/diagnóstico para configuração de split:
 * - percentual 0 = split de sócio desativado, então não há bloqueio;
 * - percentual > 0 exige exatamente 1 sócio ativo com ao menos uma wallet legada/por ambiente.
 * O backend continua sendo a fonte de verdade e faz a validação final por ambiente.
 */
export function getFinancialPartnerConfigStatus(params: {
  partnerSplitPercent: number;
  partners: FinancialPartnerLike[];
}): FinancialPartnerConfigStatus {
  if (params.partnerSplitPercent <= 0) {
    return { state: 'valid', message: null };
  }

  const activePartners = params.partners.filter((partner) => partner.status === 'ativo');

  if (activePartners.length === 0) {
    return {
      state: 'missing_active_partner',
      message: 'Você configurou split, mas não possui sócio ativo válido.',
    };
  }

  if (activePartners.length > 1) {
    return {
      state: 'multiple_active_partners',
      message: 'Split inválido: existe mais de um sócio ativo para esta empresa.',
    };
  }

  const partner = activePartners[0];
  const hasWallet = Boolean(
    partner.asaas_wallet_id ||
      partner.asaas_wallet_id_production ||
      partner.asaas_wallet_id_sandbox,
  );

  if (!hasWallet) {
    return {
      state: 'missing_wallet',
      message: 'Split inválido: o sócio ativo não possui wallet configurada.',
    };
  }

  return { state: 'valid', message: null };
}
