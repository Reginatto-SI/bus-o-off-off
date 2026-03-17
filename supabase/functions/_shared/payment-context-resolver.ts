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
};

type MinimalSale = {
  payment_environment?: string | null;
};

type MinimalCompany = {
  asaas_api_key?: string | null;
};

export function resolvePaymentContext(params: {
  mode: PaymentContextMode;
  sale?: MinimalSale | null;
  company?: MinimalCompany | null;
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
    : (environment === "production" ? "company" : "platform");

  const apiKeySecretName = getAsaasApiKeySecretName(environment);
  const platformApiKey = Deno.env.get(apiKeySecretName) ?? null;
  const companyApiKey = params.company?.asaas_api_key ?? null;

  let apiKey: string | null = null;
  let apiKeySource = "not_used";

  if (params.mode === "create") {
    if (ownerType === "platform") {
      apiKey = platformApiKey;
      apiKeySource = `platform (${apiKeySecretName})`;
    } else {
      apiKey = companyApiKey;
      apiKeySource = "company.asaas_api_key";
    }
  } else if (params.mode === "verify") {
    if (environment === "sandbox") {
      apiKey = platformApiKey;
      apiKeySource = `platform (${apiKeySecretName})`;
    } else {
      const allowFallback = params.allowLegacyVerifyFallback ?? true;
      if (companyApiKey) {
        apiKey = companyApiKey;
        apiKeySource = "company.asaas_api_key";
      } else if (allowFallback) {
        apiKey = platformApiKey;
        apiKeySource = `platform_fallback (${apiKeySecretName})`;
      } else {
        apiKey = null;
        apiKeySource = "missing_company_api_key_without_fallback";
      }
    }
  } else if (params.mode === "platform_fee") {
    apiKey = platformApiKey;
    apiKeySource = `platform (${apiKeySecretName})`;
  } else {
    // Comentário Step 2: webhook não consulta API Asaas hoje, então credencial fica apenas descritiva.
    apiKey = ownerType === "company" ? companyApiKey : platformApiKey;
    apiKeySource = ownerType === "company"
      ? "company.asaas_api_key (descritivo_webhook)"
      : `platform (${apiKeySecretName}) (descritivo_webhook)`;
  }

  const webhookTokenSecretName = getAsaasWebhookTokenSecretName(environment);
  const envWebhookToken = Deno.env.get(webhookTokenSecretName) ?? null;

  const prodToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN") ?? "";
  const sandboxToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN_SANDBOX") ?? "";
  const dualCandidates = [prodToken, sandboxToken].filter(Boolean);

  const webhookTokenCandidates = environmentSource === "sale" || environmentSource === "host"
    ? (envWebhookToken ? [envWebhookToken] : [])
    : dualCandidates;

  const splitPolicy: PaymentContextSplitPolicy = isPlatformFeeFlow
    ? { enabled: false, type: "none" }
    : (environment === "production"
      ? { enabled: true, type: "platform_and_partner" }
      : { enabled: false, type: "none" });

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
        : (environment === "production" ? "production_uses_company_owner" : "sandbox_uses_platform_owner"),
      credentialDecision: `${params.mode}_mode_${apiKeySource}`,
      splitDecision: splitPolicy.enabled ? "split_enabled_like_current_rule" : "split_disabled_like_current_rule",
    },
    platformWalletSecretName: getAsaasWalletSecretName(environment),
  };
}

export function isWebhookTokenValidForContext(req: Request, context: ResolvedPaymentContext): boolean {
  const receivedToken = req.headers.get("asaas-access-token") || req.headers.get("x-asaas-webhook-token");
  if (!receivedToken) return false;
  if (context.webhookTokenCandidates.length === 0) return false;
  return context.webhookTokenCandidates.includes(receivedToken);
}
