import type { Company } from '@/types/database';

export type PaymentEnvironment = 'production' | 'sandbox';

export type AsaasIntegrationStatus =
  | 'not_configured'
  | 'partially_configured'
  | 'connected'
  | 'inconsistent';

type EnvironmentAsaasConfig = {
  apiKey: string | null;
  walletId: string | null;
  accountId: string | null;
  accountEmail: string | null;
  onboardingComplete: boolean;
};

function normalizeText(value?: string | null) {
  const normalized = value?.trim() ?? '';
  return normalized.length > 0 ? normalized : null;
}

function readEnvironmentConfig(
  company: Company | null | undefined,
  environment: PaymentEnvironment,
): EnvironmentAsaasConfig {
  if (!company) {
    return {
      apiKey: null,
      walletId: null,
      accountId: null,
      accountEmail: null,
      onboardingComplete: false,
    };
  }

  if (environment === 'production') {
    return {
      apiKey: normalizeText(company.asaas_api_key_production),
      walletId: normalizeText(company.asaas_wallet_id_production),
      accountId: normalizeText(company.asaas_account_id_production),
      accountEmail: normalizeText(company.asaas_account_email_production),
      onboardingComplete: Boolean(company.asaas_onboarding_complete_production),
    };
  }

  return {
    apiKey: normalizeText(company.asaas_api_key_sandbox),
    walletId: normalizeText(company.asaas_wallet_id_sandbox),
    accountId: normalizeText(company.asaas_account_id_sandbox),
    accountEmail: normalizeText(company.asaas_account_email_sandbox),
    onboardingComplete: Boolean(company.asaas_onboarding_complete_sandbox),
  };
}

function hasAnyConfig(config: EnvironmentAsaasConfig) {
  return Boolean(
    config.apiKey ||
    config.walletId ||
    config.accountId ||
    config.accountEmail ||
    config.onboardingComplete,
  );
}

function hasOperationalConnection(config: EnvironmentAsaasConfig) {
  // Comentário de suporte: o checkout usa credencial + wallet por ambiente;
  // onboarding sozinho não é evidência suficiente para marcar como conectado.
  return Boolean(config.apiKey && config.walletId && config.onboardingComplete);
}

export function getAsaasIntegrationSnapshot(
  company: Company | null | undefined,
  environment: PaymentEnvironment,
) {
  const current = readEnvironmentConfig(company, environment);
  const oppositeEnvironment: PaymentEnvironment =
    environment === 'production' ? 'sandbox' : 'production';
  const opposite = readEnvironmentConfig(company, oppositeEnvironment);

  const currentHasAny = hasAnyConfig(current);
  const oppositeHasAny = hasAnyConfig(opposite);
  const currentIsConnected = hasOperationalConnection(current);
  const oppositeIsConnected = hasOperationalConnection(opposite);

  let status: AsaasIntegrationStatus = 'not_configured';
  const reasons: string[] = [];

  if (currentIsConnected && current.accountId) {
    status = 'connected';
  } else if (currentIsConnected && !current.accountId) {
    // Comentário de manutenção: o card não deve marcar "Conectado" quando o ambiente
    // ainda não tem `account_id` persistido. O checkout pode até operar com API key + wallet,
    // mas a verificação manual e a auditoria da conta exigem esse identificador.
    status = 'partially_configured';
  } else if (
    current.onboardingComplete && (!current.apiKey || !current.walletId)
  ) {
    status = 'inconsistent';
  } else if (currentHasAny || oppositeHasAny) {
    status = 'partially_configured';
  }

  if (!current.apiKey && current.walletId) {
    reasons.push('wallet preenchida sem API key no ambiente operacional');
  }
  if (current.onboardingComplete && !current.apiKey) {
    reasons.push('onboarding marcado sem API key no ambiente operacional');
  }
  if (current.onboardingComplete && !current.walletId) {
    reasons.push('onboarding marcado sem wallet no ambiente operacional');
  }
  if (currentIsConnected && !current.accountId) {
    reasons.push('conta operacional sem account_id salvo no ambiente operacional');
  }
  if (!currentHasAny && oppositeIsConnected) {
    reasons.push(`conta conectada apenas no ambiente ${oppositeEnvironment === 'production' ? 'de produção' : 'sandbox'}`);
  }
  if (currentHasAny && !currentIsConnected) {
    reasons.push('configuração do ambiente operacional está incompleta');
  }

  return {
    status,
    environment,
    current,
    opposite,
    currentIsConnected,
    oppositeIsConnected,
    // Comentário de suporte: o legado em companies foi esvaziado de propósito.
    // O contrato operacional do status passa a olhar somente sandbox/production.
    legacy: {
      apiKey: null,
      walletId: null,
      accountId: null,
      accountEmail: null,
      onboardingComplete: false,
    },
    legacyIsConnected: false,
    hasAnyConfiguration: currentHasAny || oppositeHasAny,
    reasons,
  };
}
