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

function readLegacyConfig(company: Company | null | undefined): EnvironmentAsaasConfig {
  return {
    apiKey: normalizeText(company?.asaas_api_key),
    walletId: normalizeText(company?.asaas_wallet_id),
    accountId: normalizeText(company?.asaas_account_id),
    accountEmail: normalizeText(company?.asaas_account_email),
    onboardingComplete: Boolean(company?.asaas_onboarding_complete),
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
  const legacy = readLegacyConfig(company);

  const currentHasAny = hasAnyConfig(current);
  const oppositeHasAny = hasAnyConfig(opposite);
  const legacyHasAny = hasAnyConfig(legacy);
  const currentIsConnected = hasOperationalConnection(current);
  const oppositeIsConnected = hasOperationalConnection(opposite);
  const legacyIsConnected = hasOperationalConnection(legacy);

  let status: AsaasIntegrationStatus = 'not_configured';
  const reasons: string[] = [];

  if (currentIsConnected) {
    status = 'connected';
  } else if (
    (current.onboardingComplete && (!current.apiKey || !current.walletId)) ||
    (!currentHasAny && legacyIsConnected) ||
    (legacy.onboardingComplete && (!legacy.apiKey || !legacy.walletId))
  ) {
    status = 'inconsistent';
  } else if (currentHasAny || oppositeHasAny || legacyHasAny) {
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
  if (!currentHasAny && oppositeIsConnected) {
    reasons.push(`conta conectada apenas no ambiente ${oppositeEnvironment === 'production' ? 'de produção' : 'sandbox'}`);
  }
  if (!currentHasAny && legacyIsConnected) {
    reasons.push('campos legados indicam conexão, mas o ambiente operacional está vazio');
  }
  if (currentHasAny && !currentIsConnected) {
    reasons.push('configuração do ambiente operacional está incompleta');
  }

  return {
    status,
    environment,
    current,
    opposite,
    legacy,
    currentIsConnected,
    oppositeIsConnected,
    legacyIsConnected,
    hasAnyConfiguration: currentHasAny || oppositeHasAny || legacyHasAny,
    reasons,
  };
}
