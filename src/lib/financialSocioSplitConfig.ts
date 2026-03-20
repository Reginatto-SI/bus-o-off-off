type FinancialSocioLike = {
  status?: string | null;
  asaas_wallet_id?: string | null;
  asaas_wallet_id_production?: string | null;
  asaas_wallet_id_sandbox?: string | null;
};

export type FinancialSocioConfigStatus =
  | {
      state: 'valid';
      message: null;
    }
  | {
      state: 'missing_active_socio' | 'multiple_active_socios' | 'missing_wallet';
      message: string;
    };

/**
 * Regras de UI/diagnóstico para configuração de split:
 * - percentual 0 = split de sócio desativado, então não há bloqueio;
 * - percentual > 0 exige exatamente 1 sócio ativo com ao menos uma wallet legada/por ambiente.
 * O backend continua sendo a fonte de verdade e faz a validação final por ambiente.
 */
export function getFinancialSocioConfigStatus(params: {
  socioSplitPercent: number;
  socios: FinancialSocioLike[];
}): FinancialSocioConfigStatus {
  if (params.socioSplitPercent <= 0) {
    return { state: 'valid', message: null };
  }

  const activeSocios = params.socios.filter((socio) => socio.status === 'ativo');

  if (activeSocios.length === 0) {
    return {
      state: 'missing_active_socio',
      message: 'Você configurou split, mas não possui sócio ativo válido.',
    };
  }

  if (activeSocios.length > 1) {
    return {
      state: 'multiple_active_socios',
      message: 'Split inválido: existe mais de um sócio ativo para esta empresa.',
    };
  }

  const socio = activeSocios[0];
  const hasWallet = Boolean(
    socio.asaas_wallet_id ||
      socio.asaas_wallet_id_production ||
      socio.asaas_wallet_id_sandbox,
  );

  if (!hasWallet) {
    return {
      state: 'missing_wallet',
      message: 'Split inválido: o sócio ativo não possui wallet configurada.',
    };
  }

  return { state: 'valid', message: null };
}
