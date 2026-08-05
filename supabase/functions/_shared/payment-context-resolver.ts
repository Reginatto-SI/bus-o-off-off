// @ts-nocheck — arquivo Deno (edge function): tipos resolvidos pelo runtime Deno, não pelo tsc do app.
import {
  getAsaasApiKeySecretName,
  getAsaasBaseUrl,
  getAsaasWalletSecretName,
  getAsaasWebhookTokenSecretName,
  
  type PaymentEnvironment,
} from "./runtime-env.ts";

export type PaymentContextMode =
  | "create"
  | "verify"
  | "webhook"
  | "platform_fee";
export type PaymentOwnerType = "platform" | "company";

export type PaymentContextDecisionTrace = {
  environmentSource: "sale" | "company" | "request";
  hostDetected: string | null;
  ownerDecision: string;
  credentialDecision: string;
  splitDecision: string;
};

export type PaymentContextSplitPolicy = {
  enabled: boolean;
  type: "none" | "platform_only" | "platform_and_socio";
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
  payment_environment?: string | null;
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

type MinimalSocio = {
  id?: string | null;
  name?: string | null;
  status?: string | null;
  asaas_wallet_id?: string | null;
  asaas_wallet_id_production?: string | null;
  asaas_wallet_id_sandbox?: string | null;
};

function readEnvironmentCompanyConfig(
  company: MinimalCompany | null | undefined,
  environment: PaymentEnvironment,
) {
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
      apiKey: company.asaas_api_key_production ?? null,
      walletId: company.asaas_wallet_id_production ?? null,
      accountId: company.asaas_account_id_production ?? null,
      accountEmail: company.asaas_account_email_production ?? null,
      onboardingComplete: Boolean(
        company.asaas_onboarding_complete_production ?? false,
      ),
      source: company.asaas_api_key_production
        ? "production_field"
        : "missing_production_field",
    };
  }

  return {
    apiKey: company.asaas_api_key_sandbox ?? null,
    walletId: company.asaas_wallet_id_sandbox ?? null,
    accountId: company.asaas_account_id_sandbox ?? null,
    accountEmail: company.asaas_account_email_sandbox ?? null,
    onboardingComplete: Boolean(
      company.asaas_onboarding_complete_sandbox ?? false,
    ),
    source: company.asaas_api_key_sandbox
      ? "sandbox_field"
      : "missing_sandbox_field",
  };
}

export function resolveSocioWalletByEnvironment(
  socio: MinimalSocio | null | undefined,
  environment: PaymentEnvironment,
): string | null {
  if (!socio) return null;
  if (environment === "production") {
    return socio.asaas_wallet_id_production ?? socio.asaas_wallet_id ?? null;
  }
  return socio.asaas_wallet_id_sandbox ?? null;
}

// Comentário de suporte: após a neutralização final do legado Stripe no schema,
// o runtime oficial permanece com provider único e explícito: Asaas.
export type FinancialSocioValidationProvider = "asaas";

export type FinancialSocioValidationResult =
  | {
      ok: true;
      code: null;
      message: null;
      socio: MinimalSocio;
      walletId: string | null;
    }
  | {
      ok: false;
      code:
        | "split_socio_missing_active"
        | "split_socio_multiple_active"
        | "split_socio_wallet_missing"
        | "split_socio_destination_missing";
      message: string;
      socio: MinimalSocio | null;
      walletId: null;
    };

export function validateFinancialSocioForSplit(params: {
  socios: MinimalSocio[] | null | undefined;
  provider: FinancialSocioValidationProvider;
  environment: PaymentEnvironment;
}): FinancialSocioValidationResult {
  // Elegibilidade financeira é definida somente pela wallet do ambiente. O
  // campo status é administrativo/legado e não pode contradizer essa regra.
  const configuredSocios = params.socios ?? [];
  const activeSocios = configuredSocios.filter((socio) =>
    Boolean(resolveSocioWalletByEnvironment(socio, params.environment))
  );

  if (activeSocios.length === 0) {
    return {
      ok: false,
      code: configuredSocios.length > 0
        ? "split_socio_wallet_missing"
        : "split_socio_missing_active",
      message: configuredSocios.length > 0
        ? "Sócio global sem wallet no ambiente da venda"
        : "Nenhum cadastro de sócio global encontrado",
      socio: configuredSocios[0] ?? null,
      walletId: null,
    };
  }

  if (activeSocios.length > 1) {
    return {
      ok: false,
      code: "split_socio_multiple_active",
      message: "Split inválido: mais de um sócio ativo",
      socio: null,
      walletId: null,
    };
  }

  const socio = activeSocios[0];

  const walletId = resolveSocioWalletByEnvironment(socio, params.environment);

  if (!walletId) {
    return {
      ok: false,
      code: "split_socio_wallet_missing",
      message: "Split inválido: sócio sem wallet configurada",
      socio,
      walletId: null,
    };
  }

  return {
    ok: true,
    code: null,
    message: null,
    socio,
    walletId,
  };
}

export function resolvePaymentContext(params: {
  mode: PaymentContextMode;
  sale?: MinimalSale | null;
  requestedEnvironment?: PaymentEnvironment | null;
  company?: MinimalCompany | null;
  socio?: MinimalSocio | null;
  request?: Request;
  isPlatformFeeFlow?: boolean;
  allowHostFallback?: boolean;
}): ResolvedPaymentContext {
  const saleEnvRaw = params.sale?.payment_environment;
  const hasSaleEnvironment =
    saleEnvRaw === "production" || saleEnvRaw === "sandbox";
  const companyEnvRaw = params.company?.payment_environment;
  const hasCompanyEnvironment =
    companyEnvRaw === "production" || companyEnvRaw === "sandbox";
  const requestedEnvironment = params.requestedEnvironment;

  let environment: PaymentEnvironment;
  let environmentSource: "sale" | "company" | "request";
  const hostDetected: string | null = null;

  if (hasSaleEnvironment) {
    // Venda já persistida carrega o ambiente em que a cobrança foi criada.
    environment = saleEnvRaw;
    environmentSource = "sale";
  } else if (hasCompanyEnvironment) {
    /**
     * Fonte única de verdade do projeto: o ambiente é configuração da empresa.
     * Domínio/hostname não decidem mais nada no caminho de pagamento.
     */
    environment = companyEnvRaw;
    environmentSource = "company";
  } else if (
    requestedEnvironment === "production" ||
    requestedEnvironment === "sandbox"
  ) {
    environment = requestedEnvironment;
    environmentSource = "request";
  } else {
    /**
     * Regra de segurança do projeto:
     * sem venda, sem empresa e sem ambiente explícito o fluxo falha de forma
     * explícita (nunca fallback silencioso para sandbox).
     */
    throw new Error(
      "payment_environment_unresolved: contexto sem venda, sem empresa e sem ambiente explícito",
    );
  }


  const isPlatformFeeFlow =
    params.mode === "platform_fee" || Boolean(params.isPlatformFeeFlow);
  const ownerType: PaymentOwnerType = isPlatformFeeFlow
    ? "platform"
    : "company";

  const apiKeySecretName = getAsaasApiKeySecretName(environment);
  const platformApiKey = Deno.env.get(apiKeySecretName) ?? null;
  const companyEnvConfig = readEnvironmentCompanyConfig(
    params.company,
    environment,
  );
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
    if (companyApiKey) {
      apiKey = companyApiKey;
      apiKeySource = `company.api_key (${companyEnvConfig.source})`;
    } else {
      apiKey = null;
      apiKeySource = "missing_company_api_key";
    }
  } else if (params.mode === "platform_fee") {
    apiKey = platformApiKey;
    apiKeySource = `platform (${apiKeySecretName})`;
  } else {
    // Comentário Step 2: webhook não consulta API Asaas hoje, então credencial fica apenas descritiva.
    apiKey = ownerType === "company" ? companyApiKey : platformApiKey;
    apiKeySource =
      ownerType === "company"
        ? `company.api_key (${companyEnvConfig.source}) (descritivo_webhook)`
        : `platform (${apiKeySecretName}) (descritivo_webhook)`;
  }

  const webhookTokenSecretName = getAsaasWebhookTokenSecretName(environment);
  const envWebhookToken = Deno.env.get(webhookTokenSecretName) ?? null;

  // Pré-Step 5: remove fallback dual-token para evitar aceitação permissiva entre ambientes.
  // Sempre valida APENAS o token do ambiente resolvido para o contexto.
  const webhookTokenCandidates = envWebhookToken ? [envWebhookToken] : [];

  const splitPolicy: PaymentContextSplitPolicy = isPlatformFeeFlow
    ? { enabled: true, type: "platform_and_socio" }
    : { enabled: true, type: "platform_and_socio" };

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
      hostDetected,
      ownerDecision: isPlatformFeeFlow
        ? "platform_fee_flow_forces_platform_owner"
        : "main_sale_flow_uses_company_owner_in_all_envs",
      credentialDecision: `${params.mode}_mode_${apiKeySource}`,
      splitDecision: isPlatformFeeFlow
        ? "split_enabled_for_manual_platform_fee_flow"
        : "split_enabled_for_main_sale_flow_in_all_envs",
    },
    platformWalletSecretName: getAsaasWalletSecretName(environment),
    companyApiKeyByEnvironment: companyEnvConfig.apiKey,
    companyWalletByEnvironment: companyEnvConfig.walletId,
    companyAccountIdByEnvironment: companyEnvConfig.accountId,
    companyAccountEmailByEnvironment: companyEnvConfig.accountEmail,
    companyOnboardingCompleteByEnvironment: companyEnvConfig.onboardingComplete,
  };
}

export function isWebhookTokenValidForContext(
  req: Request,
  context: ResolvedPaymentContext,
): boolean {
  return validateWebhookTokenForContext(req, context).valid;
}

export type WebhookTokenValidationReason =
  | "missing_header"
  | "invalid_token"
  | "missing_expected_secret";

export type WebhookTokenReceivedHeaderName =
  | "asaas-access-token"
  | "x-asaas-webhook-token";

export type WebhookTokenValidationResult = {
  valid: boolean;
  reason: WebhookTokenValidationReason | null;
  receivedHeaderName: WebhookTokenReceivedHeaderName | null;
};

export function validateWebhookTokenForContext(
  req: Request,
  context: ResolvedPaymentContext,
): WebhookTokenValidationResult {
  const primaryHeaderName: WebhookTokenReceivedHeaderName =
    "asaas-access-token";
  const fallbackHeaderName: WebhookTokenReceivedHeaderName =
    "x-asaas-webhook-token";
  const primaryToken = req.headers.get(primaryHeaderName);
  const fallbackToken = req.headers.get(fallbackHeaderName);
  const receivedHeaderName = primaryToken
    ? primaryHeaderName
    : fallbackToken
    ? fallbackHeaderName
    : null;
  const receivedToken = primaryToken || fallbackToken;

  // Comentário de segurança: retornamos apenas metadados da validação para auditoria,
  // nunca o valor bruto recebido no header do webhook.
  if (!receivedToken) {
    return { valid: false, reason: "missing_header", receivedHeaderName };
  }

  if (context.webhookTokenCandidates.length === 0) {
    return {
      valid: false,
      reason: "missing_expected_secret",
      receivedHeaderName,
    };
  }

  if (!context.webhookTokenCandidates.includes(receivedToken)) {
    return { valid: false, reason: "invalid_token", receivedHeaderName };
  }

  return { valid: true, reason: null, receivedHeaderName };
}
