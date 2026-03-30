import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  resolveEnvironmentFromHost,
  getAsaasBaseUrl,
  getAsaasApiKeySecretName,
  type PaymentEnvironment,
} from "../_shared/runtime-env.ts";
import {
  inferPaymentOwnerType,
  logPaymentTrace,
  logSaleIntegrationEvent,
} from "../_shared/payment-observability.ts";
import { ensurePixReadiness, type PixReadinessResult } from "../_shared/asaas-pix-readiness.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function maskSensitiveValue(value?: string | null) {
  if (!value) return null;
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

function listObjectKeys(value: unknown) {
  return value && typeof value === "object"
    ? Object.keys(value as Record<string, unknown>).sort()
    : [];
}

function summarizeAsaasPayload(value: unknown) {
  if (!value || typeof value !== "object") {
    return { kind: typeof value, keys: [] as string[] };
  }

  const record = value as Record<string, unknown>;
  const dataValue = record.data;
  const itemsValue = Array.isArray(record.items)
    ? record.items[0]
    : Array.isArray(dataValue)
      ? dataValue[0]
      : null;

  return {
    kind: Array.isArray(value) ? "array" : "object",
    keys: listObjectKeys(record),
    data_keys: listObjectKeys(dataValue),
    first_item_keys: listObjectKeys(itemsValue),
    has_embedded_wallet: Boolean(
      record.wallet ||
      (dataValue && typeof dataValue === "object" && !Array.isArray(dataValue) && (dataValue as Record<string, unknown>).wallet) ||
      (itemsValue && typeof itemsValue === "object" && (itemsValue as Record<string, unknown>).wallet)
    ),
  };
}

function extractWalletIdFromAsaasPayload(payload: unknown): string | null {
  /**
   * Comentário de manutenção:
   * o Asaas já foi consumido aqui em formatos diferentes (`walletId`, `wallet.id`, `id`).
   * Mantemos a ordem conservadora e ampliamos apenas alguns caminhos adjacentes de payload
   * para melhorar a resiliência sem transformar esse fluxo em parser genérico.
   */
  const visited = new Set<unknown>();

  const read = (value: unknown): string | null => {
    if (!value || typeof value !== "object") return null;
    if (visited.has(value)) return null;
    visited.add(value);

    const record = value as Record<string, unknown>;
    const directCandidates = [
      record.walletId,
      record.wallet_id,
      record.id,
    ];

    for (const candidate of directCandidates) {
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }

    if (record.wallet && typeof record.wallet === "object") {
      const walletRecord = record.wallet as Record<string, unknown>;
      const nestedWalletId = walletRecord.id ?? walletRecord.walletId ?? walletRecord.wallet_id;
      if (typeof nestedWalletId === "string" && nestedWalletId.trim().length > 0) {
        return nestedWalletId.trim();
      }
    }

    const nestedCandidates = [
      record.data,
      record.account,
      record.owner,
      Array.isArray(record.items) ? record.items[0] : null,
      Array.isArray(record.data) ? record.data[0] : null,
    ];

    for (const candidate of nestedCandidates) {
      const nestedWalletId = read(candidate);
      if (nestedWalletId) return nestedWalletId;
    }

    return null;
  };

  return read(payload);
}

type ResolvedAccountId = {
  value: string | null;
  source: string | null;
};

function extractAccountIdFromAsaasPayload(
  payload: unknown,
  options?: { allowGenericNestedId?: boolean },
): ResolvedAccountId {
  /**
   * Comentário de manutenção:
   * o `account_id` estava ficando nulo porque o vínculo por API Key aceitava apenas
   * `myAccount.id`. Em alguns payloads reais o identificador pode aparecer aninhado
   * em estruturas já usadas pelo fluxo atual (`account`, `owner`, `data`, `items`).
   * Mantemos uma ordem conservadora:
   * 1) prioriza `id` explícito do payload principal;
   * 2) depois tenta aliases semânticos de conta;
   * 3) por último, só quando permitido, aceita `id` genérico aninhado.
   * Isso evita confundir walletId com accountId e reaproveita apenas fontes já lidas
   * pelo próprio fluxo atual (`/myAccount` e fallbacks já existentes).
   */
  const visited = new Set<unknown>();

  const read = (value: unknown, path: string, allowGenericId: boolean): ResolvedAccountId => {
    if (!value || typeof value !== "object") return { value: null, source: null };
    if (visited.has(value)) return { value: null, source: null };
    visited.add(value);

    const record = value as Record<string, unknown>;
    const directCandidates: Array<{ value: unknown; source: string }> = [
      { value: record.accountId, source: `${path}.accountId` },
      { value: record.account_id, source: `${path}.account_id` },
    ];

    if (allowGenericId) {
      directCandidates.unshift({ value: record.id, source: `${path}.id` });
    }

    for (const candidate of directCandidates) {
      if (typeof candidate.value === "string" && candidate.value.trim().length > 0) {
        return { value: candidate.value.trim(), source: candidate.source };
      }
    }

    const nestedCandidates: Array<{ value: unknown; path: string; allowGenericId?: boolean }> = [
      { value: record.account, path: `${path}.account`, allowGenericId: true },
      { value: record.owner, path: `${path}.owner`, allowGenericId: true },
      { value: record.data, path: `${path}.data`, allowGenericId: false },
      { value: Array.isArray(record.items) ? record.items[0] : null, path: `${path}.items[0]`, allowGenericId: false },
      { value: Array.isArray(record.data) ? record.data[0] : null, path: `${path}.data[0]`, allowGenericId: false },
    ];

    for (const candidate of nestedCandidates) {
      const nestedResult = read(
        candidate.value,
        candidate.path,
        candidate.allowGenericId ?? options?.allowGenericNestedId ?? false,
      );
      if (nestedResult.value) return nestedResult;
    }

    return { value: null, source: null };
  };

  return read(payload, "payload", true);
}

function buildWalletDiagnosticMessage(params: {
  environment: PaymentEnvironment;
  walletLookupAttempted: boolean;
  walletLookupStatus?: number | null;
}) {
  const environmentLabel = params.environment === "production" ? "produção" : "sandbox";
  const walletLookupSuffix = params.walletLookupAttempted
    ? ` Tentativa complementar em /wallets${params.walletLookupStatus ? ` retornou HTTP ${params.walletLookupStatus}` : " não trouxe wallet utilizável"}.`
    : "";

  return `A conta Asaas respondeu no ambiente ${environmentLabel}, mas não foi possível identificar um walletId utilizável. Verifique se a API Key pertence a esse mesmo ambiente ou se a conta retornou um formato inesperado.${walletLookupSuffix}`;
}

const ASAAS_PAYMENT_WEBHOOK_EVENTS = [
  "PAYMENT_CREATED",
  "PAYMENT_UPDATED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_RESTORED",
  "PAYMENT_REFUNDED",
] as const;

type AsaasWebhookRecord = {
  id?: string;
  name?: string;
  url?: string;
  enabled?: boolean;
  interrupted?: boolean;
  sendType?: string;
  events?: unknown;
  authToken?: string | null;
};

type AsaasWebhookFlowType =
  | "link_existing"
  | "link_existing_partial"
  | "create_subaccount"
  | "manual_repair";

type AsaasWebhookEnsureResult =
  | {
    ok: true;
    action: "created" | "updated" | "unchanged";
    webhookId: string | null;
    webhookUrl: string;
  }
  | {
    ok: false;
    skipped: true;
    reason: string;
  };

function buildAsaasWebhookUrl() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  if (!supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/asaas-webhook`;
}

function buildAsaasWebhookPayload(params: {
  companyName: string;
  accountEmail: string | null;
  webhookUrl: string;
  webhookToken: string;
}) {
  return {
    name: `Smartbus BR - ${params.companyName}`.slice(0, 100),
    url: params.webhookUrl,
    email: params.accountEmail,
    enabled: true,
    interrupted: false,
    apiVersion: 3,
    sendType: "SEQUENTIALLY",
    authToken: params.webhookToken,
    events: [...ASAAS_PAYMENT_WEBHOOK_EVENTS],
  };
}

function normalizeWebhookEvents(events: unknown): string[] {
  return Array.isArray(events)
    ? events.filter((event): event is string => typeof event === "string").sort()
    : [];
}

async function ensureAsaasWebhook(params: {
  companyId: string;
  companyName: string;
  accountEmail: string | null;
  environment: PaymentEnvironment;
  asaasBaseUrl: string;
  accessToken: string;
}) {
  const webhookUrl = buildAsaasWebhookUrl();
  const webhookSecretName = params.environment === "production"
    ? "ASAAS_WEBHOOK_TOKEN"
    : "ASAAS_WEBHOOK_TOKEN_SANDBOX";
  const webhookToken = Deno.env.get(webhookSecretName)?.trim() ?? null;

  if (!webhookUrl || !webhookToken) {
    console.warn("[create-asaas-account] webhook auto-config skipped", {
      company_id: params.companyId,
      environment: params.environment,
      webhook_url_available: Boolean(webhookUrl),
      webhook_token_secret_name: webhookSecretName,
      webhook_token_available: Boolean(webhookToken),
    });
    return {
      ok: false,
      skipped: true,
      reason: "missing_webhook_runtime_configuration",
    } as const;
  }

  const payload = buildAsaasWebhookPayload({
    companyName: params.companyName,
    accountEmail: params.accountEmail,
    webhookUrl,
    webhookToken,
  });

  const listRes = await fetch(`${params.asaasBaseUrl}/webhooks`, {
    headers: { "access_token": params.accessToken },
  });

  if (!listRes.ok) {
    const responsePreview = await listRes.text();
    throw new Error(`webhook_list_failed:${listRes.status}:${responsePreview.slice(0, 300)}`);
  }

  const listData = await listRes.json();
  const webhooks = Array.isArray(listData?.data)
    ? listData.data
    : Array.isArray(listData)
      ? listData
      : [];

  const existingWebhook = webhooks.find((item: AsaasWebhookRecord) =>
    item?.url === webhookUrl || item?.name === payload.name,
  ) as AsaasWebhookRecord | undefined;

  const hasExpectedEvents = JSON.stringify(normalizeWebhookEvents(existingWebhook?.events)) === JSON.stringify([...ASAAS_PAYMENT_WEBHOOK_EVENTS].sort());
  const needsUpdate = Boolean(existingWebhook) && (
    existingWebhook?.url !== webhookUrl ||
    existingWebhook?.enabled !== true ||
    existingWebhook?.interrupted !== false ||
    existingWebhook?.sendType !== payload.sendType ||
    !hasExpectedEvents
  );

  if (existingWebhook?.id && needsUpdate) {
    const updateRes = await fetch(`${params.asaasBaseUrl}/webhooks/${existingWebhook.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "access_token": params.accessToken,
      },
      body: JSON.stringify(payload),
    });

    if (!updateRes.ok) {
      const responsePreview = await updateRes.text();
      throw new Error(`webhook_update_failed:${updateRes.status}:${responsePreview.slice(0, 300)}`);
    }

    return {
      ok: true,
      action: "updated",
      webhookId: existingWebhook.id,
      webhookUrl,
    } as const;
  }

  if (existingWebhook?.id) {
    return {
      ok: true,
      action: "unchanged",
      webhookId: existingWebhook.id,
      webhookUrl,
    } as const;
  }

  const createRes = await fetch(`${params.asaasBaseUrl}/webhooks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "access_token": params.accessToken,
    },
    body: JSON.stringify(payload),
  });

  if (!createRes.ok) {
    const responsePreview = await createRes.text();
    throw new Error(`webhook_create_failed:${createRes.status}:${responsePreview.slice(0, 300)}`);
  }

  const createdWebhook = await createRes.json();
  return {
    ok: true,
    action: "created",
    webhookId: typeof createdWebhook?.id === "string" ? createdWebhook.id : null,
    webhookUrl,
  } as const;
}

/**
 * Comentário de manutenção:
 * hoje não existe uma tabela dedicada a logs técnicos de integração por empresa.
 * Reutilizamos `sale_integration_logs` com `sale_id = null` para manter a mesma trilha
 * auditável já usada pelo projeto, sem criar estrutura paralela só para webhook Asaas.
 */
async function persistAsaasWebhookAttempt(params: {
  supabaseAdmin: any;
  companyId: string;
  paymentEnvironment: PaymentEnvironment;
  flowType: AsaasWebhookFlowType;
  result:
    | AsaasWebhookEnsureResult
    | {
      ok: false;
      skipped?: boolean;
      action?: "failed";
      reason: string;
      webhookUrl?: string | null;
      webhookId?: string | null;
      details?: unknown;
    };
}) {
  const r = params.result as any;
  const action = r.ok
    ? r.action
    : r.action === "failed"
      ? "failed"
      : "skipped";

  const processingStatus = r.ok
    ? "success"
    : r.action === "failed"
      ? "failed"
      : "warning";

  const resultCategory = r.ok
    ? "success"
    : r.action === "failed"
      ? "error"
      : "warning";

  const incidentCode = !r.ok
    ? r.action === "failed"
      ? "company_webhook_auto_config_failed"
      : "company_webhook_auto_config_skipped"
    : null;

  const warningCode = !r.ok && r.action !== "failed"
    ? r.reason
    : null;

  const webhookUrl = "webhookUrl" in params.result ? params.result.webhookUrl ?? null : null;
  const webhookId = "webhookId" in params.result ? params.result.webhookId ?? null : null;
  const reason = params.result.ok ? null : params.result.reason;

  await logSaleIntegrationEvent({
    supabaseAdmin: params.supabaseAdmin,
    saleId: null,
    companyId: params.companyId,
    paymentEnvironment: params.paymentEnvironment,
    environmentDecisionSource: "create-asaas-account",
    environmentHostDetected: null,
    provider: "asaas",
    direction: "outgoing_request",
    eventType: "company_webhook_configuration",
    processingStatus,
    resultCategory,
    incidentCode,
    warningCode,
    message: params.result.ok
      ? `Configuração de webhook Asaas da empresa concluída com ação=${action}`
      : `Tentativa de configuração de webhook Asaas da empresa terminou com ação=${action}`,
    payloadJson: {
      flow_type: params.flowType,
      action,
      webhook_url: webhookUrl,
      webhook_id: webhookId,
      reason,
      details: "details" in params.result ? params.result.details ?? null : null,
    },
    responseJson: {
      flow_type: params.flowType,
      action,
      webhook_url: webhookUrl,
      webhook_id: webhookId,
      reason,
    },
  });
}

async function persistCompanyPixReadinessAttempt(params: {
  supabaseAdmin: any;
  companyId: string;
  paymentEnvironment: PaymentEnvironment;
  flowType: string;
  result: PixReadinessResult;
}) {
  const processingStatus = params.result.ready
    ? "success"
    : params.result.action === "query_failed" || params.result.action === "evp_creation_failed"
      ? "failed"
      : "warning";

  const resultCategory = params.result.ready
    ? "success"
    : processingStatus === "failed"
      ? "error"
      : "warning";

  await logSaleIntegrationEvent({
    supabaseAdmin: params.supabaseAdmin,
    saleId: null,
    companyId: params.companyId,
    paymentEnvironment: params.paymentEnvironment,
    environmentDecisionSource: "create-asaas-account",
    environmentHostDetected: null,
    provider: "asaas",
    direction: "outgoing_request",
    eventType: "company_pix_readiness",
    processingStatus,
    resultCategory,
    incidentCode: params.result.ready ? null : params.result.errorCode ?? "pix_readiness_failed",
    warningCode: null,
    message: params.result.ready
      ? `Readiness Pix validado com sucesso (flow=${params.flowType};action=${params.result.action})`
      : `Readiness Pix não confirmado (flow=${params.flowType};action=${params.result.action})`,
    payloadJson: {
      flow_type: params.flowType,
      action: params.result.action,
      queried: params.result.queried,
      auto_create_attempted: params.result.autoCreateAttempted,
      active_key_count: params.result.activeKeyCount,
      keys_sample: params.result.keysSample,
    },
    responseJson: {
      ready: params.result.ready,
      action: params.result.action,
      http_status_list: params.result.httpStatusList ?? null,
      http_status_create: params.result.httpStatusCreate ?? null,
      error_code: params.result.errorCode ?? null,
      error_message: params.result.errorMessage ?? null,
    },
  });
}

async function syncCompanyPixReadiness(params: {
  supabaseAdmin: any;
  companyId: string;
  paymentEnvironment: PaymentEnvironment;
  asaasBaseUrl: string;
  apiKey: string | null;
  flowType: string;
}) {
  const envFields = getEnvironmentCompanyFields(params.paymentEnvironment);
  const checkedAtIso = new Date().toISOString();

  if (!params.apiKey) {
    await params.supabaseAdmin
      .from("companies")
      .update(
        buildCompanyConfigWithEnvironmentUpdate({
          [envFields.pixReady]: false,
          [envFields.pixLastCheckedAt]: checkedAtIso,
          [envFields.pixLastError]: "missing_company_api_key",
        }),
      )
      .eq("id", params.companyId);

    return {
      ready: false,
      action: "query_failed",
      queried: false,
      autoCreateAttempted: false,
      activeKeyCount: 0,
      keysSample: [],
      errorCode: "missing_company_api_key",
      errorMessage: "Empresa sem API Key Asaas para validar readiness Pix.",
    } as PixReadinessResult;
  }

  const readiness = await ensurePixReadiness({
    asaasBaseUrl: params.asaasBaseUrl,
    accessToken: params.apiKey,
    environment: params.paymentEnvironment,
    allowAutoCreateEvp: true,
  });

  await params.supabaseAdmin
    .from("companies")
    .update(
      buildCompanyConfigWithEnvironmentUpdate({
        [envFields.pixReady]: readiness.ready,
        [envFields.pixLastCheckedAt]: checkedAtIso,
        [envFields.pixLastError]: readiness.ready
          ? null
          : `${readiness.errorCode ?? "pix_not_ready"}:${readiness.errorMessage ?? "unknown"}`,
      }),
    )
    .eq("id", params.companyId);

  await persistCompanyPixReadinessAttempt({
    supabaseAdmin: params.supabaseAdmin,
    companyId: params.companyId,
    paymentEnvironment: params.paymentEnvironment,
    flowType: params.flowType,
    result: readiness,
  });

  return readiness;
}


function resolveTargetEnvironment(params: { requestedEnv?: string | null; hostEnv: PaymentEnvironment }): PaymentEnvironment {
  if (params.requestedEnv === "production" || params.requestedEnv === "sandbox") {
    return params.requestedEnv;
  }
  return params.hostEnv;
}

function getEnvironmentCompanyFields(environment: PaymentEnvironment) {
  if (environment === "production") {
    return {
      apiKey: "asaas_api_key_production",
      walletId: "asaas_wallet_id_production",
      accountId: "asaas_account_id_production",
      accountEmail: "asaas_account_email_production",
      onboardingComplete: "asaas_onboarding_complete_production",
      pixReady: "asaas_pix_ready_production",
      pixLastCheckedAt: "asaas_pix_last_checked_at_production",
      pixLastError: "asaas_pix_last_error_production",
    } as const;
  }

  return {
    apiKey: "asaas_api_key_sandbox",
    walletId: "asaas_wallet_id_sandbox",
    accountId: "asaas_account_id_sandbox",
    accountEmail: "asaas_account_email_sandbox",
    onboardingComplete: "asaas_onboarding_complete_sandbox",
    pixReady: "asaas_pix_ready_sandbox",
    pixLastCheckedAt: "asaas_pix_last_checked_at_sandbox",
    pixLastError: "asaas_pix_last_error_sandbox",
  } as const;
}

function normalizeCompanyField(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function hasEssentialEnvironmentConnection(companyConfig: Record<string, unknown>, envFields: ReturnType<typeof getEnvironmentCompanyFields>) {
  return Boolean(
    normalizeCompanyField(companyConfig[envFields.apiKey]) &&
    normalizeCompanyField(companyConfig[envFields.walletId]) &&
    companyConfig[envFields.onboardingComplete] === true,
  );
}

function buildCompanyConfigWithEnvironmentUpdate(
  updates: Record<string, unknown>,
) {
  return {
    ...updates,
    /**
     * Comentário de manutenção:
     * após a remoção do legado do schema, onboarding/revalidate/disconnect
     * devem persistir exclusivamente os campos por ambiente.
     */
  };
}

/**
 * Edge function para onboarding de conta Asaas.
 * 
 * Dois fluxos:
 * 1. Criar subconta Asaas para a empresa (POST /accounts)
 * 2. Vincular conta existente via API Key (GET /myAccount para validar e obter walletId)
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { env: hostResolvedEnv, host: detectedHost } = resolveEnvironmentFromHost(req);
    let asaasBaseUrl = getAsaasBaseUrl(hostResolvedEnv);
    let apiKeySecretName = getAsaasApiKeySecretName(hostResolvedEnv);
    let paymentOwnerType = inferPaymentOwnerType({ environment: hostResolvedEnv, isPlatformFeeFlow: true });

    // Authenticate admin user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    let userId: string;
    try {
      const payloadBase64 = token.split(".")[1];
      const payload = JSON.parse(atob(payloadBase64));
      userId = payload.sub;
      if (!userId) throw new Error("Missing sub");
    } catch {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: isAdmin } = await supabaseAdmin.rpc("is_admin", { _user_id: userId });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { company_id, mode, api_key, target_environment } = await req.json();

    const paymentEnv = resolveTargetEnvironment({ requestedEnv: target_environment ?? null, hostEnv: hostResolvedEnv });
    const envFields = getEnvironmentCompanyFields(paymentEnv);
    asaasBaseUrl = getAsaasBaseUrl(paymentEnv);
    apiKeySecretName = getAsaasApiKeySecretName(paymentEnv);
    paymentOwnerType = inferPaymentOwnerType({ environment: paymentEnv, isPlatformFeeFlow: true });

    logPaymentTrace("info", "create-asaas-account", "onboarding_request_received", {
      company_id: company_id ?? null,
      payment_environment: paymentEnv,
      payment_owner_type: paymentOwnerType,
      asaas_base_url: asaasBaseUrl,
      api_key_secret_name: apiKeySecretName,
      onboarding_mode: mode ?? "create",
      decision_origin: "resolveEnvironmentFromHost + target_environment override",
    });

    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: belongs } = await supabaseAdmin.rpc("user_belongs_to_company", {
      _user_id: userId,
      _company_id: company_id,
    });
    if (!belongs) {
      return new Response(JSON.stringify({ error: "Forbidden: not your company" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      // Comentário de manutenção: onboarding/revalidate/disconnect só devem ler o contrato por ambiente.
      .select("id, name, legal_type, legal_name, trade_name, document_number, cnpj, email, phone, address, address_number, province, postal_code, city, state, asaas_api_key_production, asaas_wallet_id_production, asaas_account_id_production, asaas_account_email_production, asaas_onboarding_complete_production, asaas_pix_ready_production, asaas_pix_last_checked_at_production, asaas_pix_last_error_production, asaas_api_key_sandbox, asaas_wallet_id_sandbox, asaas_account_id_sandbox, asaas_account_email_sandbox, asaas_onboarding_complete_sandbox, asaas_pix_ready_sandbox, asaas_pix_last_checked_at_sandbox, asaas_pix_last_error_sandbox")
      .eq("id", company_id)
      .maybeSingle();

    /**
     * Correção mínima e segura:
     * - `target_environment` continua prevalecendo sobre o host no fluxo de revalidação,
     *   porque a verificação manual precisa consultar exatamente o mesmo ambiente operacional
     *   cujas credenciais aparecem no card de /admin/empresa.
     * - lookup da empresa acontece ANTES de qualquer chamada ao Asaas; portanto, falha de query
     *   aqui é erro interno/estrutural do sistema e não pode ser mascarada como 404 de empresa ausente.
     */
    if (companyError) {
      console.error("[create-asaas-account] company lookup failed before Asaas call", {
        company_id,
        requested_target_environment: target_environment ?? null,
        resolved_payment_environment: paymentEnv,
        onboarding_mode: mode ?? "create",
        company_lookup_error: {
          code: companyError.code ?? null,
          message: companyError.message ?? null,
          details: companyError.details ?? null,
          hint: companyError.hint ?? null,
        },
        asaas_request_attempted: false,
        error_origin: "internal_company_lookup",
      });

      return new Response(JSON.stringify({
        error: "Internal error while loading company integration data",
        diagnostic_stage: "company_lookup",
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!company) {
      console.warn("[create-asaas-account] company not found before Asaas call", {
        company_id,
        requested_target_environment: target_environment ?? null,
        resolved_payment_environment: paymentEnv,
        onboarding_mode: mode ?? "create",
        asaas_request_attempted: false,
        error_origin: "company_not_found",
      });

      return new Response(JSON.stringify({ error: "Company not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const companyConfig = company as Record<string, unknown>;

    const PLATFORM_API_KEY = Deno.env.get(apiKeySecretName);
    if (!PLATFORM_API_KEY) {
      return new Response(JSON.stringify({ error: `Asaas API key not configured (${apiKeySecretName})` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[create-asaas-account] Ambiente configurado", {
      host_detected: detectedHost,
      environment_selected: paymentEnv,
      asaas_base_url: asaasBaseUrl,
      api_key_source: apiKeySecretName,
    });

    // ====== MODE: Disconnect existing integration ======
    if (mode === "disconnect") {
      console.log("[create-asaas-account] disconnect started", {
        company_id,
        environment: paymentEnv,
      });

      const { error: disconnectError } = await supabaseAdmin
        .from("companies")
        .update(
          buildCompanyConfigWithEnvironmentUpdate({
            [envFields.walletId]: null,
            [envFields.apiKey]: null,
            [envFields.accountId]: null,
            [envFields.accountEmail]: null,
            [envFields.onboardingComplete]: false,
            [envFields.pixReady]: false,
            [envFields.pixLastCheckedAt]: new Date().toISOString(),
            [envFields.pixLastError]: "integration_disconnected",
          }),
        )
        .eq("id", company_id);

      if (disconnectError) {
        console.error("[create-asaas-account] disconnect failed", {
          company_id,
          environment: paymentEnv,
          error: disconnectError,
        });
        return new Response(
          JSON.stringify({ error: "Erro ao desvincular a conta Asaas." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, disconnected: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ====== MODE: Revalidate existing integration ======
    if (mode === "revalidate") {
      console.log("[ASAAS][VERIFY] Starting verification", {
        company_id,
        payment_environment: paymentEnv,
        has_api_key: Boolean(companyConfig[envFields.apiKey]),
        has_wallet_id: Boolean(companyConfig[envFields.walletId]),
        has_account_id: Boolean(companyConfig[envFields.accountId]),
        onboarding_complete: Boolean(companyConfig[envFields.onboardingComplete]),
      });

      /**
       * Hardening operacional:
       * a revalidação manual deve usar a MESMA origem de credenciais do checkout/verify,
       * isto é, apenas os campos específicos do ambiente resolvido.
       * Evitamos fallback para os campos legados/genéricos para não misturar
       * API key de produção com endpoint sandbox (ou vice-versa).
       */
      const environmentApiKey = companyConfig[envFields.apiKey] || null;
      const environmentAccountId = companyConfig[envFields.accountId] || null;
      const isApiKeyMode = Boolean(environmentApiKey);
      const verificationEndpoint = isApiKeyMode
        ? `${asaasBaseUrl}/myAccount`
        : environmentAccountId
          ? `${asaasBaseUrl}/accounts/${environmentAccountId}`
          : null;

      if (!verificationEndpoint) {
        console.error("[ASAAS][VERIFY] Validation failed reason", {
          company_id,
          reason: "missing_api_key_and_account_id",
        });
        return new Response(
          JSON.stringify({ error: "Integração Asaas sem credencial suficiente para validação automática. Reconecte sua conta." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const verificationToken = isApiKeyMode ? environmentApiKey : PLATFORM_API_KEY;

      console.log("[ASAAS][VERIFY] Using company fields", {
        company_id,
        mode: isApiKeyMode ? "api_key_my_account" : "platform_account_lookup",
        endpoint: verificationEndpoint,
        wallet_id_preview: maskSensitiveValue(String(companyConfig[envFields.walletId] || "")),
        account_id_preview: maskSensitiveValue(String(companyConfig[envFields.accountId] || "")),
        token_preview: maskSensitiveValue(verificationToken as string),
      });

      try {
        // Comentário de suporte: a partir daqui o fluxo deixa de ser erro interno puro.
        // Qualquer falha abaixo já representa tentativa real de consulta ao gateway Asaas.
        console.log("[ASAAS][VERIFY] Endpoint called", {
          company_id,
          requested_target_environment: target_environment ?? null,
          resolved_payment_environment: paymentEnv,
          endpoint: verificationEndpoint,
          asaas_request_attempted: true,
          error_origin: "gateway_request_started",
        });

        const myAccountRes = await fetch(verificationEndpoint, {
          headers: { "access_token": verificationToken },
        });

        console.log("[ASAAS][VERIFY] Response status", {
          company_id,
          status: myAccountRes.status,
          endpoint: verificationEndpoint,
        });

        if (!myAccountRes.ok) {
          const errBody = await myAccountRes.text();
          console.error("[ASAAS][VERIFY] Validation failed reason", {
            company_id,
            status: myAccountRes.status,
            endpoint: verificationEndpoint,
            response: errBody,
          });

          const authError = myAccountRes.status === 401 || myAccountRes.status === 403;
          const notFoundError = myAccountRes.status === 404;
          const errorMessage = authError
            ? "Falha de autenticação ao validar integração com o Asaas. Reconecte a conta para atualizar as credenciais."
            : notFoundError
              ? "Conta Asaas vinculada não encontrada para validação. Reconecte a conta e tente novamente."
              : "Não foi possível validar a integração com o Asaas no momento. Tente novamente.";

          return new Response(
            JSON.stringify({ error: errorMessage }),
            { status: myAccountRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const accountData = await myAccountRes.json();
        const resolvedRevalidateAccountId = extractAccountIdFromAsaasPayload(accountData);
        let walletIdFromResponse = extractWalletIdFromAsaasPayload(accountData);
        let walletLookupStatus: number | null = null;
        let walletLookupSummary: ReturnType<typeof summarizeAsaasPayload> | null = null;

        if (!walletIdFromResponse) {
          try {
            const walletRes = await fetch(`${asaasBaseUrl}/wallets`, {
              headers: { "access_token": verificationToken },
            });
            walletLookupStatus = walletRes.status;

            if (walletRes.ok) {
              const walletData = await walletRes.json();
              walletLookupSummary = summarizeAsaasPayload(walletData);
              walletIdFromResponse = extractWalletIdFromAsaasPayload(walletData);
            } else {
              const walletError = await walletRes.text();
              console.warn("[ASAAS][VERIFY] wallet lookup failed", {
                company_id,
                endpoint: `${asaasBaseUrl}/wallets`,
                status: walletRes.status,
                response: walletError,
              });
            }
          } catch (walletLookupError) {
            console.warn("[ASAAS][VERIFY] wallet lookup runtime error", {
              company_id,
              message: walletLookupError instanceof Error ? walletLookupError.message : String(walletLookupError),
            });
          }
        }

        // Fallback 2: platform /accounts lookup by cpfCnpj or email
        if (!walletIdFromResponse && PLATFORM_API_KEY) {
          const acctEmail = accountData?.email || companyConfig?.email;
          const acctCpfCnpj = accountData?.cpfCnpj;
          const searchParam = acctCpfCnpj
            ? `cpfCnpj=${encodeURIComponent(acctCpfCnpj)}`
            : acctEmail
              ? `email=${encodeURIComponent(acctEmail)}`
              : null;

          if (searchParam) {
            try {
              const accountsRes = await fetch(`${asaasBaseUrl}/accounts?${searchParam}`, {
                headers: { "access_token": PLATFORM_API_KEY },
              });
              if (accountsRes.ok) {
                const accountsData = await accountsRes.json();
                const firstAccount = Array.isArray(accountsData?.data) ? accountsData.data[0] : accountsData;
                walletIdFromResponse = extractWalletIdFromAsaasPayload(firstAccount);
              } else {
                await accountsRes.text();
              }
            } catch (_e) { /* ignore */ }
          }
        }

        const walletId = walletIdFromResponse ?? companyConfig[envFields.walletId] ?? null;

        if (!walletId) {
          console.error("[ASAAS][VERIFY] Validation failed reason", {
            company_id,
            reason: "wallet_id_missing_in_response",
            endpoint: verificationEndpoint,
            response_keys: Object.keys(accountData || {}),
            my_account_summary: summarizeAsaasPayload(accountData),
            wallets_lookup_status: walletLookupStatus,
            wallets_lookup_summary: walletLookupSummary,
          });
          return new Response(
            JSON.stringify({
              error: buildWalletDiagnosticMessage({
                environment: paymentEnv,
                walletLookupAttempted: walletLookupStatus !== null,
                walletLookupStatus,
              }),
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Revalidation succeeded — wallet found
        console.log("[ASAAS][VERIFY] Validation succeeded", {
          company_id,
          environment: paymentEnv,
          wallet_id_preview: maskSensitiveValue(String(walletId)),
          account_id_preview: maskSensitiveValue(resolvedRevalidateAccountId.value),
          account_id_source: resolvedRevalidateAccountId.source,
          account_status: accountData?.status ?? null,
        });

        const revalidatePixReadiness = await syncCompanyPixReadiness({
          supabaseAdmin,
          companyId: company_id,
          paymentEnvironment: paymentEnv,
          asaasBaseUrl,
          apiKey: typeof environmentApiKey === "string" ? environmentApiKey : null,
          flowType: "revalidate",
        });

        return new Response(
          JSON.stringify({
            success: true,
            revalidated: true,
            wallet_id: walletId,
            account_id: resolvedRevalidateAccountId.value,
            account_id_source: resolvedRevalidateAccountId.source,
            account_status: accountData?.status ?? null,
            account_name: accountData?.name || accountData?.tradingName || null,
            pix_ready: revalidatePixReadiness.ready,
            pix_readiness_action: revalidatePixReadiness.action,
            pix_last_error: revalidatePixReadiness.errorMessage ?? null,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (revalidateErr) {
        console.error("[ASAAS][VERIFY] unexpected error", {
          company_id,
          environment: paymentEnv,
          error: revalidateErr instanceof Error ? revalidateErr.message : String(revalidateErr),
        });
        return new Response(
          JSON.stringify({ error: "Erro inesperado ao revalidar integração Asaas." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ====== MODE: Manually repair / ensure webhook ======
    if (mode === "ensure_webhook") {
      const companyApiKey = normalizeCompanyField(companyConfig[envFields.apiKey]);
      const companyDisplayName = String(company.trade_name || company.legal_name || company.name || "Empresa");

      if (!companyApiKey) {
        const failedResult = {
          ok: false as const,
          action: "failed" as const,
          reason: "missing_company_api_key_for_manual_webhook_repair",
        };

        await persistAsaasWebhookAttempt({
          supabaseAdmin,
          companyId: company_id,
          paymentEnvironment: paymentEnv,
          flowType: "manual_repair",
          result: failedResult,
        });

        return new Response(
          JSON.stringify({
            error: "A empresa não possui API Key Asaas no ambiente selecionado. Reconecte a conta antes de tentar reparar o webhook.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      try {
        const webhookResult = await ensureAsaasWebhook({
          companyId: company_id,
          companyName: companyDisplayName,
          accountEmail: normalizeCompanyField(companyConfig[envFields.accountEmail]) || company.email || null,
          environment: paymentEnv,
          asaasBaseUrl,
          accessToken: companyApiKey,
        });

        await persistAsaasWebhookAttempt({
          supabaseAdmin,
          companyId: company_id,
          paymentEnvironment: paymentEnv,
          flowType: "manual_repair",
          result: webhookResult,
        });

        return new Response(
          JSON.stringify({
            success: webhookResult.ok,
            mode: "ensure_webhook",
            flow_type: "manual_repair",
            action: webhookResult.ok ? webhookResult.action : "skipped",
            webhook_id: webhookResult.ok ? webhookResult.webhookId : null,
            webhook_url: webhookResult.ok ? webhookResult.webhookUrl : buildAsaasWebhookUrl(),
            reason: webhookResult.ok ? null : webhookResult.reason,
            message: webhookResult.ok
              ? `Webhook Asaas da empresa verificado com sucesso (${webhookResult.action}).`
              : "Tentativa de reparo concluída sem alteração automática. Verifique a configuração de runtime do webhook.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (webhookError) {
        const failedResult = {
          ok: false as const,
          action: "failed" as const,
          reason: webhookError instanceof Error ? webhookError.message : String(webhookError),
          webhookUrl: buildAsaasWebhookUrl(),
        };

        await persistAsaasWebhookAttempt({
          supabaseAdmin,
          companyId: company_id,
          paymentEnvironment: paymentEnv,
          flowType: "manual_repair",
          result: failedResult,
        });

        return new Response(
          JSON.stringify({
            error: "Não foi possível reconfigurar o webhook Asaas da empresa no momento.",
            flow_type: "manual_repair",
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ====== MODE: Link existing account via API Key ======
    if (mode === "link_existing" && api_key) {
      try {
        // Comentário de manutenção:
        // o vínculo por API Key agora é disparado apenas pelo wizard reutilizável no frontend.
        // Os logs abaixo existem para diferenciar ambiente incorreto, autenticação inválida
        // e resposta do Asaas sem wallet compatível, sem expor a API Key original.
        console.log("[create-asaas-account] link_existing started", {
          company_id,
          environment: paymentEnv,
          asaas_base_url: asaasBaseUrl,
          api_key_preview: maskSensitiveValue(api_key),
        });

        const myAccountRes = await fetch(`${asaasBaseUrl}/myAccount`, {
          headers: { "access_token": api_key },
        });
        console.log("[create-asaas-account] link_existing myAccount response", {
          company_id,
          environment: paymentEnv,
          asaas_base_url: asaasBaseUrl,
          status: myAccountRes.status,
          ok: myAccountRes.ok,
        });

        if (!myAccountRes.ok) {
          const errBody = await myAccountRes.text();
          console.error("[create-asaas-account] link_existing myAccount failed", {
            company_id,
            environment: paymentEnv,
            asaas_base_url: asaasBaseUrl,
            status: myAccountRes.status,
            response_preview: errBody.slice(0, 500),
          });
          const authError = myAccountRes.status === 401 || myAccountRes.status === 403;
          const environmentHint = paymentEnv === "production" ? "produção" : "sandbox";
          return new Response(
            JSON.stringify({
              error: authError
                ? `Não foi possível autenticar sua conta Asaas no ambiente ${environmentHint}. Verifique se a API Key pertence a esse ambiente e tente novamente.`
                : `Não foi possível validar sua conta Asaas no ambiente ${environmentHint}. Confira se o ambiente selecionado corresponde à API Key informada.`,
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const accountData = await myAccountRes.json();
        const resolvedAccountIdFromMyAccount = extractAccountIdFromAsaasPayload(accountData);
        console.log("[create-asaas-account] link_existing myAccount payload summary", {
          company_id,
          environment: paymentEnv,
          summary: summarizeAsaasPayload(accountData),
          account_id_preview: maskSensitiveValue(resolvedAccountIdFromMyAccount.value),
          account_id_source: resolvedAccountIdFromMyAccount.source,
        });

        let walletId = extractWalletIdFromAsaasPayload(accountData);
        let accountId = resolvedAccountIdFromMyAccount.value;
        let accountIdSource = resolvedAccountIdFromMyAccount.source;
        let walletLookupStatus: number | null = null;
        let walletLookupSummary: ReturnType<typeof summarizeAsaasPayload> | null = null;

        // Fallback 1: /wallets endpoint with user's key
        if (!walletId) {
          try {
            const walletRes = await fetch(`${asaasBaseUrl}/wallets`, {
              headers: { "access_token": api_key },
            });
            walletLookupStatus = walletRes.status;

            if (walletRes.ok) {
              const walletData = await walletRes.json();
              walletLookupSummary = summarizeAsaasPayload(walletData);
              walletId = extractWalletIdFromAsaasPayload(walletData);
              console.log("[create-asaas-account] link_existing wallets payload summary", {
                company_id,
                environment: paymentEnv,
                status: walletRes.status,
                summary: walletLookupSummary,
              });
            } else {
              const walletError = await walletRes.text();
              console.warn("[create-asaas-account] wallet lookup failed", {
                company_id,
                status: walletRes.status,
                response: walletError,
                environment: paymentEnv,
              });
            }
          } catch (walletLookupError) {
            console.warn("[create-asaas-account] wallet lookup runtime error", {
              company_id,
              environment: paymentEnv,
              message: walletLookupError instanceof Error ? walletLookupError.message : String(walletLookupError),
            });
          }
        }

        // Fallback 2: use platform API key to search /accounts by cpfCnpj or email
        if (!walletId && PLATFORM_API_KEY) {
          const searchParams: string[] = [];
          if (accountData.cpfCnpj) searchParams.push(`cpfCnpj=${encodeURIComponent(accountData.cpfCnpj)}`);
          else if (accountData.email) searchParams.push(`email=${encodeURIComponent(accountData.email)}`);

          if (searchParams.length > 0) {
            try {
              const accountsRes = await fetch(`${asaasBaseUrl}/accounts?${searchParams.join("&")}`, {
                headers: { "access_token": PLATFORM_API_KEY },
              });
              console.log("[create-asaas-account] link_existing platform accounts lookup", {
                company_id,
                environment: paymentEnv,
                status: accountsRes.status,
              });

              if (accountsRes.ok) {
                const accountsData = await accountsRes.json();
                // /accounts returns { data: [...] } — pick the first match
                const firstAccount = Array.isArray(accountsData?.data) ? accountsData.data[0] : accountsData;
                const platformWalletId = extractWalletIdFromAsaasPayload(firstAccount);
                const resolvedPlatformAccountId = extractAccountIdFromAsaasPayload(firstAccount);
                if (platformWalletId) {
                  walletId = platformWalletId;
                  console.log("[create-asaas-account] walletId resolved via platform /accounts lookup", {
                    company_id,
                    environment: paymentEnv,
                    wallet_id_preview: maskSensitiveValue(walletId),
                  });
                }
                if (!accountId && resolvedPlatformAccountId.value) {
                  // Comentário de manutenção:
                  // quando `myAccount` valida a conta mas não expõe `id` no topo, reutilizamos
                  // o primeiro item já retornado por `/accounts` neste mesmo fluxo para
                  // consolidar `account_id` do cadastro local sem criar endpoint novo.
                  accountId = resolvedPlatformAccountId.value;
                  accountIdSource = `platform_accounts_fallback:${resolvedPlatformAccountId.source}`;
                  console.log("[create-asaas-account] accountId resolved via platform /accounts lookup", {
                    company_id,
                    environment: paymentEnv,
                    account_id_preview: maskSensitiveValue(accountId),
                    account_id_source: accountIdSource,
                  });
                }
              } else {
                const errText = await accountsRes.text();
                console.warn("[create-asaas-account] platform accounts lookup failed", {
                  company_id,
                  status: accountsRes.status,
                  response: errText.slice(0, 300),
                });
              }
            } catch (platformLookupError) {
              console.warn("[create-asaas-account] platform accounts lookup error", {
                company_id,
                message: platformLookupError instanceof Error ? platformLookupError.message : String(platformLookupError),
              });
            }
          }
        }

        if (!walletId) {
          // Comentário de manutenção:
          // Sub-contas Asaas nem sempre expõem walletId via API.
          // Se a autenticação (myAccount) foi bem-sucedida, persistimos a API Key
          // e marcamos como parcialmente configurado para não bloquear o fluxo.
          console.warn("[create-asaas-account] walletId missing after all fallbacks — proceeding with partial link", {
            company_id,
            environment: paymentEnv,
            response_keys: Object.keys(accountData || {}),
            my_account_summary: summarizeAsaasPayload(accountData),
            wallets_lookup_status: walletLookupStatus,
            wallets_lookup_summary: walletLookupSummary,
          });

          await supabaseAdmin
            .from("companies")
            .update(
              buildCompanyConfigWithEnvironmentUpdate({
                [envFields.walletId]: null,
                [envFields.apiKey]: api_key,
                [envFields.accountId]: accountId,
                [envFields.accountEmail]: accountData.email || null,
                [envFields.onboardingComplete]: false,
              }),
            )
            .eq("id", company_id);

          try {
            const webhookResult = await ensureAsaasWebhook({
              companyId: company_id,
              companyName: String(company.trade_name || company.legal_name || company.name || "Empresa"),
              accountEmail: accountData.email || company.email || null,
              environment: paymentEnv,
              asaasBaseUrl,
              accessToken: api_key,
            });
            await persistAsaasWebhookAttempt({
              supabaseAdmin,
              companyId: company_id,
              paymentEnvironment: paymentEnv,
              flowType: "link_existing_partial",
              result: webhookResult,
            });
            console.log("[create-asaas-account] link_existing partial webhook auto-config result", webhookResult);
          } catch (webhookError) {
            await persistAsaasWebhookAttempt({
              supabaseAdmin,
              companyId: company_id,
              paymentEnvironment: paymentEnv,
              flowType: "link_existing_partial",
              result: {
                ok: false,
                action: "failed",
                reason: webhookError instanceof Error ? webhookError.message : String(webhookError),
                webhookUrl: buildAsaasWebhookUrl(),
              },
            });
            console.warn("[create-asaas-account] link_existing partial webhook auto-config failed", {
              company_id,
              environment: paymentEnv,
              message: webhookError instanceof Error ? webhookError.message : String(webhookError),
            });
          }

          const partialPixReadiness = await syncCompanyPixReadiness({
            supabaseAdmin,
            companyId: company_id,
            paymentEnvironment: paymentEnv,
            asaasBaseUrl,
            apiKey: api_key,
            flowType: "link_existing_partial",
          });

          return new Response(
            JSON.stringify({
              success: true,
              partial: true,
              wallet_id: null,
              account_id: accountId,
              account_id_source: accountIdSource,
              account_name: accountData.name || accountData.tradingName || null,
              pix_ready: partialPixReadiness.ready,
              pix_readiness_action: partialPixReadiness.action,
              pix_last_error: partialPixReadiness.errorMessage ?? null,
              warning: `API Key validada e salva, mas o walletId não foi identificado. ${accountId ? `O accountId foi resolvido via ${accountIdSource}. ` : "O accountId também não foi identificado. "}A conta foi vinculada parcialmente.`,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        await supabaseAdmin
          .from("companies")
          .update(
            buildCompanyConfigWithEnvironmentUpdate({
              [envFields.walletId]: walletId,
              [envFields.apiKey]: api_key,
              // Comentário de manutenção:
              // o `account_id` ficava nulo porque o código aceitava apenas `myAccount.id`.
              // Agora o fluxo tenta primeiro o identificador principal de `/myAccount` e,
              // se necessário, reutiliza o item já consultado em `/accounts` para extrair
              // o identificador equivalente da mesma conta validada, sem mudar a semântica
              // de status nem criar endpoints adicionais.
              [envFields.accountId]: accountId,
              [envFields.accountEmail]: accountData.email || null,
              [envFields.onboardingComplete]: true,
            }),
          )
          .eq("id", company_id);

        try {
          const webhookResult = await ensureAsaasWebhook({
            companyId: company_id,
            companyName: String(company.trade_name || company.legal_name || company.name || "Empresa"),
            accountEmail: accountData.email || company.email || null,
            environment: paymentEnv,
            asaasBaseUrl,
            accessToken: api_key,
          });
          await persistAsaasWebhookAttempt({
            supabaseAdmin,
            companyId: company_id,
            paymentEnvironment: paymentEnv,
            flowType: "link_existing",
            result: webhookResult,
          });
          console.log("[create-asaas-account] link_existing webhook auto-config result", webhookResult);
        } catch (webhookError) {
          await persistAsaasWebhookAttempt({
            supabaseAdmin,
            companyId: company_id,
            paymentEnvironment: paymentEnv,
            flowType: "link_existing",
            result: {
              ok: false,
              action: "failed",
              reason: webhookError instanceof Error ? webhookError.message : String(webhookError),
              webhookUrl: buildAsaasWebhookUrl(),
            },
          });
          console.warn("[create-asaas-account] link_existing webhook auto-config failed", {
            company_id,
            environment: paymentEnv,
            message: webhookError instanceof Error ? webhookError.message : String(webhookError),
          });
        }

        console.log("[create-asaas-account] link_existing persisted account identity", {
          company_id,
          environment: paymentEnv,
          wallet_id_preview: maskSensitiveValue(walletId),
          account_id_preview: maskSensitiveValue(accountId),
          account_id_source: accountIdSource,
        });

        const linkedPixReadiness = await syncCompanyPixReadiness({
          supabaseAdmin,
          companyId: company_id,
          paymentEnvironment: paymentEnv,
          asaasBaseUrl,
          apiKey: api_key,
          flowType: "link_existing",
        });

        return new Response(
          JSON.stringify({
            success: true,
            wallet_id: walletId,
            account_id: accountId,
            account_id_source: accountIdSource,
            account_name: accountData.name || accountData.tradingName || null,
            pix_ready: linkedPixReadiness.ready,
            pix_readiness_action: linkedPixReadiness.action,
            pix_last_error: linkedPixReadiness.errorMessage ?? null,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        console.error("Error validating Asaas API key:", err);
        return new Response(
          JSON.stringify({ error: "Erro ao validar a API Key do Asaas. Tente novamente." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ====== MODE: Create subaccount (default) ======
    // If already onboarded, return status
    if (hasEssentialEnvironmentConnection(companyConfig, envFields)) {
      return new Response(
        JSON.stringify({
          already_complete: true,
          wallet_id: normalizeCompanyField(companyConfig[envFields.walletId]),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate required fields
    const legalType = company.legal_type === "PF" ? "PF" : "PJ";
    const documentDigits = (company.document_number || company.cnpj || "").replace(/\D/g, "");
    const displayName = (company.trade_name || company.legal_name || company.name || "").trim();

    if (legalType === "PF" && documentDigits.length !== 11) {
      return new Response(
        JSON.stringify({ error: "Para Pessoa Física, preencha um CPF válido em /admin/empresa antes de conectar pagamentos." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (legalType === "PJ" && documentDigits.length !== 14) {
      return new Response(
        JSON.stringify({ error: "Para Pessoa Jurídica, preencha um CNPJ válido em /admin/empresa antes de conectar pagamentos." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!displayName) {
      return new Response(
        JSON.stringify({ error: "Preencha o nome da empresa/pessoa em /admin/empresa antes de conectar pagamentos." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!company.email) {
      return new Response(
        JSON.stringify({ error: "Preencha o e-mail da empresa em /admin/empresa antes de conectar pagamentos." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalização mínima para garantir contrato do payload oficial do Asaas.
    const normalizedAddress = (company.address || "").trim();
    const normalizedAddressNumber = (company.address_number || "").trim();
    const normalizedProvince = (company.province || "").trim();
    const normalizedPostalCode = (company.postal_code || "").replace(/\D/g, "");
    const normalizedPhone = (company.phone || "").trim();

    // Comentário de suporte: a API de criação de conta exige bloco de endereço completo.
    if (!normalizedAddress || !normalizedAddressNumber || !normalizedProvince || !normalizedPostalCode) {
      return new Response(
        JSON.stringify({ error: "Endereço da empresa incompleto. Complete o cadastro antes de conectar o Asaas." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (normalizedPostalCode.length !== 8) {
      return new Response(
        JSON.stringify({ error: "Endereço da empresa incompleto. Complete o cadastro antes de conectar o Asaas." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Asaas subaccount
    try {
      const accountPayload = {
        name: displayName,
        email: company.email,
        cpfCnpj: documentDigits,
        // Comentário: convertemos PF/PJ para enum esperado pelo Asaas no companyType.
        companyType: legalType === "PF" ? "MEI" : "LIMITED",
        // Campo obrigatório da API Asaas: renda/faturamento mensal estimado.
        incomeValue: legalType === "PF" ? 5000 : 50000,
        phone: normalizedPhone,
        mobilePhone: normalizedPhone,
        address: normalizedAddress,
        addressNumber: normalizedAddressNumber,
        province: normalizedProvince,
        postalCode: normalizedPostalCode,
        // companies não possui "complement" hoje; enviamos vazio para manter contrato oficial.
        complement: "",
      };

      // Log explícito para diagnóstico em produção do payload exato enviado ao Asaas.
      console.log("[ASAAS] Payload final", accountPayload);
      console.log("[DIAG][ASAAS] create account payload address fields", {
        company_id,
        hasAddress: Boolean(normalizedAddress),
        hasAddressNumber: Boolean(normalizedAddressNumber),
        hasProvince: Boolean(normalizedProvince),
        hasPostalCode: Boolean(normalizedPostalCode),
      });

      const createRes = await fetch(`${asaasBaseUrl}/accounts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "access_token": PLATFORM_API_KEY,
        },
        body: JSON.stringify(accountPayload),
      });

      const createData = await createRes.json();

      if (!createRes.ok) {
        const rawMsg = createData?.errors?.[0]?.description || createData?.message || "Erro ao criar subconta no Asaas";
        console.error("Asaas create account error:", JSON.stringify(createData));
        console.error("[DIAG][ASAAS] create account address diagnostic:", {
          company_id,
          hasAddress: Boolean(normalizedAddress),
          hasAddressNumber: Boolean(normalizedAddressNumber),
          hasProvince: Boolean(normalizedProvince),
          hasPostalCode: Boolean(normalizedPostalCode),
        });
        
        // If email already in use, suggest linking existing account
        const isEmailInUse = rawMsg.toLowerCase().includes("já está em uso") || rawMsg.toLowerCase().includes("already");
        const errorMsg = isEmailInUse
          ? "Este e-mail já possui uma conta no Asaas. Use a opção 'Vincular conta existente' informando sua API Key do Asaas."
          : rawMsg;

        return new Response(
          JSON.stringify({ error: errorMsg }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const walletId = createData.walletId ?? createData.wallet?.id ?? createData.id ?? null;
      const accountId = createData.id;

      // Save to database
      await supabaseAdmin
        .from("companies")
        .update(
          buildCompanyConfigWithEnvironmentUpdate({
            [envFields.walletId]: walletId,
            [envFields.accountId]: accountId,
            // No fluxo de criação de subconta, o e-mail efetivo continua vindo do cadastro da empresa.
            [envFields.accountEmail]: company.email,
            [envFields.apiKey]: createData.apiKey || null,
            [envFields.onboardingComplete]: true,
          }),
        )
        .eq("id", company_id);

      if (createData.apiKey) {
        try {
          const webhookResult = await ensureAsaasWebhook({
            companyId: company_id,
            companyName: displayName || "Empresa",
            accountEmail: company.email || null,
            environment: paymentEnv,
            asaasBaseUrl,
            accessToken: createData.apiKey,
          });
          await persistAsaasWebhookAttempt({
            supabaseAdmin,
            companyId: company_id,
            paymentEnvironment: paymentEnv,
            flowType: "create_subaccount",
            result: webhookResult,
          });
          console.log("[create-asaas-account] create_subaccount webhook auto-config result", webhookResult);
        } catch (webhookError) {
          await persistAsaasWebhookAttempt({
            supabaseAdmin,
            companyId: company_id,
            paymentEnvironment: paymentEnv,
            flowType: "create_subaccount",
            result: {
              ok: false,
              action: "failed",
              reason: webhookError instanceof Error ? webhookError.message : String(webhookError),
              webhookUrl: buildAsaasWebhookUrl(),
            },
          });
          console.warn("[create-asaas-account] create_subaccount webhook auto-config failed", {
            company_id,
            environment: paymentEnv,
            message: webhookError instanceof Error ? webhookError.message : String(webhookError),
          });
        }
      } else {
        await persistAsaasWebhookAttempt({
          supabaseAdmin,
          companyId: company_id,
          paymentEnvironment: paymentEnv,
          flowType: "create_subaccount",
          result: {
            ok: false,
            skipped: true,
            reason: "missing_subaccount_api_key_for_webhook_auto_config",
          },
        });
        console.warn("[create-asaas-account] create_subaccount webhook auto-config skipped: missing subaccount api key", {
          company_id,
          environment: paymentEnv,
        });
      }

      const createdPixReadiness = await syncCompanyPixReadiness({
        supabaseAdmin,
        companyId: company_id,
        paymentEnvironment: paymentEnv,
        asaasBaseUrl,
        apiKey: typeof createData.apiKey === "string" ? createData.apiKey : null,
        flowType: "create_subaccount",
      });

      return new Response(
        JSON.stringify({
          success: true,
          wallet_id: walletId,
          account_id: accountId,
          pix_ready: createdPixReadiness.ready,
          pix_readiness_action: createdPixReadiness.action,
          pix_last_error: createdPixReadiness.errorMessage ?? null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (err) {
      console.error("Error creating Asaas subaccount:", err);
      return new Response(
        JSON.stringify({ error: "Erro ao criar conta no Asaas. Tente novamente." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    logPaymentTrace("error", "create-asaas-account", "unexpected_error", {
      error_message: error instanceof Error ? error.message : String(error),
    });
    console.error("Error in create-asaas-account:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    const isAddressValidationError = errorMessage.includes("Endereço da empresa incompleto");

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: isAddressValidationError ? 400 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
