import {
  getAsaasApiKeySecretName,
  getAsaasBaseUrl,
  getAsaasWalletSecretName,
  getAsaasWebhookTokenSecretName,
  resolveEnvironmentFromHost,
  type PaymentEnvironment,
} from "./runtime-env.ts";

export type PaymentContextMode = "create" | "verify" | "webhook" | "platform_fee";
export type PaymentOwnerType = "platform" | "company";

export type PaymentContextDecisionTrace = {
  environmentSource: "sale" | "host" | "fallback";
  ownerDecision: string;
  credentialDecision: string;
  splitDecision: string;
};

export type PaymentContextSplitPolicy = {
  enabled: boolean;
  type: "none" | "platform_only" | "platform_and_partner";
};

export type ResolvedPaymentContext = {
  environment: PaymentEnvironment;
  ownerType: PaymentOwnerType;
  baseUrl: string;
  apiKeySource: string;
  apiKey: string | null;
  webhookToken: string | null;
  webhookTokenCandidates: string[];
  splitPolicy: PaymentContextSplitPolicy;
  decisionTrace: PaymentContextDecisionTrace;
  platformWalletSecretName: string;
  companyApiKeyByEnvironment: string | null;
  companyWalletByEnvironment: string | null;
  companyAccountIdByEnvironment: string | null;
  companyAccountEmailByEnvironment: string | null;
  companyOnboardingCompleteByEnvironment: boolean;
};

type MinimalSale = {
  payment_environment?: string | null;
};

type MinimalCompany = {
  asaas_api_key?: string | null;
  asaas_wallet_id?: string | null;
  asaas_account_id?: string | null;
  asaas_account_email?: string | null;
  asaas_onboarding_complete?: boolean | null;
  asaas_api_key_production?: string | null;
  asaas_wallet_id_production?: string | null;
  asaas_account_id_production?: string | null;
  asaas_account_email_production?: string | null;
  asaas_onboarding_complete_production?: boolean | null;
  asaas_api_key_sandbox?: string | null;
  asaas_wallet_id_sandbox?: string | null;
  asaas_account_id_sandbox?: string | null;
  asaas_account_email_sandbox?: string | null;
  asaas_onboarding_complete_sandbox?: boolean | null;
};

type MinimalPartner = {
  asaas_wallet_id?: string | null;
  asaas_wallet_id_production?: string | null;
  asaas_wallet_id_sandbox?: string | null;
};

function readEnvironmentCompanyConfig(company: MinimalCompany | null | undefined, environment: PaymentEnvironment) {
  if (!company) {
    return {
      apiKey: null,
      walletId: null,
      accountId: null,
      accountEmail: null,
      onboardingComplete: false,
      source: "none",
    };
  }

  if (environment === "production") {
    return {
      apiKey: company.asaas_api_key_production ?? company.asaas_api_key ?? null,
      walletId: company.asaas_wallet_id_production ?? company.asaas_wallet_id ?? null,
      accountId: company.asaas_account_id_production ?? company.asaas_account_id ?? null,
      accountEmail: company.asaas_account_email_production ?? company.asaas_account_email ?? null,
      onboardingComplete: Boolean(
        (company.asaas_onboarding_complete_production ?? false)
        || (company.asaas_onboarding_complete ?? false)
      ),
      source: company.asaas_api_key_production ? "production_field" : "legacy_fallback",
    };
  }

  return {
    apiKey: company.asaas_api_key_sandbox ?? company.asaas_api_key ?? null,
    walletId: company.asaas_wallet_id_sandbox ?? company.asaas_wallet_id ?? null,
    accountId: company.asaas_account_id_sandbox ?? company.asaas_account_id ?? null,
    accountEmail: company.asaas_account_email_sandbox ?? company.asaas_account_email ?? null,
    onboardingComplete: Boolean(
      (company.asaas_onboarding_complete_sandbox ?? false)
      || (company.asaas_onboarding_complete ?? false)
    ),
    source: company.asaas_api_key_sandbox ? "sandbox_field" : "legacy_fallback",
  };
}

export function resolvePartnerWalletByEnvironment(partner: MinimalPartner | null | undefined, environment: PaymentEnvironment): string | null {
  if (!partner) return null;
  if (environment === "production") {
    return partner.asaas_wallet_id_production ?? partner.asaas_wallet_id ?? null;
  }
  return partner.asaas_wallet_id_sandbox ?? partner.asaas_wallet_id ?? null;
}

export function resolvePaymentContext(params: {
  mode: PaymentContextMode;
  sale?: MinimalSale | null;
  company?: MinimalCompany | null;
  partner?: MinimalPartner | null;
  request?: Request;
  allowLegacyVerifyFallback?: boolean;
  isPlatformFeeFlow?: boolean;
}): ResolvedPaymentContext {
  const saleEnvRaw = params.sale?.payment_environment;
  const hasSaleEnvironment = saleEnvRaw === "production" || saleEnvRaw === "sandbox";

  let environment: PaymentEnvironment;
  let environmentSource: "sale" | "host" | "fallback";

  if (hasSaleEnvironment) {
    environment = saleEnvRaw;
    environmentSource = "sale";
  } else if (params.request) {
    const resolvedFromHost = resolveEnvironmentFromHost(params.request);
    environment = resolvedFromHost.env;
    environmentSource = "host";
  } else {
    environment = "sandbox";
    environmentSource = "fallback";
  }

  const isPlatformFeeFlow = params.mode === "platform_fee" || Boolean(params.isPlatformFeeFlow);
  const ownerType: PaymentOwnerType = isPlatformFeeFlow
    ? "platform"
    : "company";

  const apiKeySecretName = getAsaasApiKeySecretName(environment);
  const platformApiKey = Deno.env.get(apiKeySecretName) ?? null;
  const companyEnvConfig = readEnvironmentCompanyConfig(params.company, environment);
  const companyApiKey = companyEnvConfig.apiKey;

  let apiKey: string | null = null;
  let apiKeySource = "not_used";

  if (params.mode === "create") {
    if (ownerType === "platform") {
      apiKey = platformApiKey;
      apiKeySource = `platform (${apiKeySecretName})`;
    } else {
      apiKey = companyApiKey;
      apiKeySource = `company.api_key (${companyEnvConfig.source})`;
    }
  } else if (params.mode === "verify") {
    // Pré-Step 5: fallback legado de verify passa a ser opt-in explícito (default = false).
    const allowFallback = params.allowLegacyVerifyFallback ?? false;
    if (companyApiKey) {
      apiKey = companyApiKey;
      apiKeySource = `company.api_key (${companyEnvConfig.source})`;
    } else if (allowFallback) {
      apiKey = platformApiKey;
      apiKeySource = `platform_fallback (${apiKeySecretName})`;
    } else {
      apiKey = null;
      apiKeySource = "missing_company_api_key_without_fallback";
    }
  } else if (params.mode === "platform_fee") {
    apiKey = platformApiKey;
    apiKeySource = `platform (${apiKeySecretName})`;
  } else {
    // Comentário Step 2: webhook não consulta API Asaas hoje, então credencial fica apenas descritiva.
    apiKey = ownerType === "company" ? companyApiKey : platformApiKey;
    apiKeySource = ownerType === "company"
      ? `company.api_key (${companyEnvConfig.source}) (descritivo_webhook)`
      : `platform (${apiKeySecretName}) (descritivo_webhook)`;
  }

  const webhookTokenSecretName = getAsaasWebhookTokenSecretName(environment);
  const envWebhookToken = Deno.env.get(webhookTokenSecretName) ?? null;

  // Pré-Step 5: remove fallback dual-token para evitar aceitação permissiva entre ambientes.
  // Sempre valida APENAS o token do ambiente resolvido para o contexto.
  const webhookTokenCandidates = envWebhookToken ? [envWebhookToken] : [];

  const splitPolicy: PaymentContextSplitPolicy = isPlatformFeeFlow
    ? { enabled: false, type: "none" }
    : { enabled: true, type: "platform_and_partner" };

  return {
    environment,
    ownerType,
    baseUrl: getAsaasBaseUrl(environment),
    apiKeySource,
    apiKey,
    webhookToken: webhookTokenCandidates[0] ?? null,
    webhookTokenCandidates,
    splitPolicy,
    decisionTrace: {
      environmentSource,
      ownerDecision: isPlatformFeeFlow
        ? "platform_fee_flow_forces_platform_owner"
        : "main_sale_flow_uses_company_owner_in_all_envs",
      credentialDecision: `${params.mode}_mode_${apiKeySource}`,
      splitDecision: splitPolicy.enabled
        ? "split_enabled_for_main_sale_flow_in_all_envs"
        : "split_disabled_for_platform_fee_flow",
    },
    platformWalletSecretName: getAsaasWalletSecretName(environment),
    companyApiKeyByEnvironment: companyEnvConfig.apiKey,
    companyWalletByEnvironment: companyEnvConfig.walletId,
    companyAccountIdByEnvironment: companyEnvConfig.accountId,
    companyAccountEmailByEnvironment: companyEnvConfig.accountEmail,
    companyOnboardingCompleteByEnvironment: companyEnvConfig.onboardingComplete,
  };
}

export function isWebhookTokenValidForContext(req: Request, context: ResolvedPaymentContext): boolean {
  const receivedToken = req.headers.get("asaas-access-token") || req.headers.get("x-asaas-webhook-token");
  if (!receivedToken) return false;
  if (context.webhookTokenCandidates.length === 0) return false;
  return context.webhookTokenCandidates.includes(receivedToken);
}
