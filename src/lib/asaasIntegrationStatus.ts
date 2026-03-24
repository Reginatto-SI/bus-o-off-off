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

function createEmptyEnvironmentConfig(): EnvironmentAsaasConfig {
  return {
    apiKey: null,
    walletId: null,
    accountId: null,
    accountEmail: null,
    onboardingComplete: false,
  };
}

function normalizeText(value?: string | null) {
  const normalized = value?.trim() ?? '';
  return normalized.length > 0 ? normalized : null;
}

function readEnvironmentConfig(
  company: Company | null | undefined,
  environment: PaymentEnvironment,
): EnvironmentAsaasConfig {
  if (!company) {
    return createEmptyEnvironmentConfig();
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
  // Regra corrigida: vínculo via API direta pode ser válido sem onboarding concluído.
  // Portanto, o estado "conectado" deve refletir prontidão operacional (apiKey+wallet),
  // enquanto `onboardingComplete` permanece apenas como sinal auxiliar/diagnóstico.
  return Boolean(config.apiKey && config.walletId);
}

export function getAsaasIntegrationSnapshot(
  company: Company | null | undefined,
  environment: PaymentEnvironment,
) {
  // Comentário de manutenção:
  // o card administrativo precisa ser determinístico pelo ambiente operacional ativo.
  // Portanto, o snapshot visual não deve ler sandbox para complementar produção
  // nem produção para complementar sandbox; o outro ambiente não participa do status.
  const current = readEnvironmentConfig(company, environment);
  const currentHasAny = hasAnyConfig(current);
  const currentIsConnected = hasOperationalConnection(current);
  const opposite = createEmptyEnvironmentConfig();

  let status: AsaasIntegrationStatus = 'not_configured';
  const reasons: string[] = [];

  if (currentIsConnected) {
    status = 'connected';
  } else if (
    current.onboardingComplete && (!current.apiKey || !current.walletId)
  ) {
    status = 'inconsistent';
  } else if (currentHasAny) {
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
  if (currentHasAny && !currentIsConnected) {
    reasons.push('configuração do ambiente operacional está incompleta');
  }

  return {
    status,
    environment,
    current,
    opposite,
    currentIsConnected,
    oppositeIsConnected: false,
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
    hasAnyConfiguration: currentHasAny,
    reasons,
  };
}
