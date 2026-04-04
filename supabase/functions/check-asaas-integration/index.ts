import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getAsaasBaseUrl,
  type PaymentEnvironment,
  resolveEnvironmentFromHost,
} from "../_shared/runtime-env.ts";
import {
  extractAccountIdFromAsaasPayload,
  extractWalletIdFromAsaasPayload,
} from "../_shared/asaas-account-payload.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type IntegrationStatus =
  | "valid"
  | "invalid"
  | "incomplete"
  | "not_found"
  | "pending"
  | "communication_error";

type DiagnosticStage =
  | "input_validation"
  | "company_lookup"
  | "credentials_validation"
  | "asaas_request";

type CheckResponse = {
  status: "ok" | "error";
  integration_status: IntegrationStatus;
  environment: PaymentEnvironment;
  diagnostic_stage: DiagnosticStage;
  details: {
    has_api_key: boolean;
    has_account_id: boolean;
    has_wallet_id: boolean;
    missing_fields: string[];
    asaas_request_attempted: boolean;
    asaas_account_found: boolean;
    wallet_found: boolean;
    account_id_matches: boolean;
    wallet_id_matches: boolean;
    onboarding_complete: boolean;
    local_pix_ready: boolean;
    gateway_pix_ready: boolean;
    pix_readiness_divergent: boolean;
    pix_ready: boolean;
    pix_readiness_action?: string;
    pix_last_checked_at?: string;
    pix_last_error?: string | null;
    pix_total_keys?: number;
    pix_active_keys?: number;
    pix_key_statuses?: string[];
    pix_key_types?: string[];
    account_status?: string | null;
    account_substatus?: {
      commercial: string | null;
      bank: string | null;
      documentation: string | null;
      general: string | null;
    } | null;
    local_metadata_warning?: string | null;
    api_key_fingerprint?: string | null;
    checked_at?: string;
    gateway_wallet_id?: string | null;
    gateway_account_id?: string | null;
    asaas_http_status?: number;
    error_type?: string;
  };
  message: string;
};

function jsonResponse(body: CheckResponse, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeCompanyField(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeAsaasList(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).data)) {
    return (payload as Record<string, unknown>).data as Record<string, unknown>[];
  }
  return [];
}

function normalizeUpperText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

async function buildApiKeyFingerprint(apiKey: string | null): Promise<string | null> {
  if (!apiKey) return null;
  const prefix = apiKey.slice(0, 4);
  const encoded = new TextEncoder().encode(apiKey);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const bytes = Array.from(new Uint8Array(digest)).slice(0, 4);
  const shortHash = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}...#${shortHash}`;
}

function resolveAccountSubstatus(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return { commercial: null, bank: null, documentation: null, general: null };
  }

  const source = payload as Record<string, unknown>;
  return {
    commercial: normalizeUpperText(source.commercial) ?? normalizeUpperText(source.commercialStatus),
    bank: normalizeUpperText(source.bank) ?? normalizeUpperText(source.bankAccount),
    documentation: normalizeUpperText(source.documentation) ?? normalizeUpperText(source.documentationStatus),
    general: normalizeUpperText(source.general) ?? normalizeUpperText(source.status),
  };
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

function buildBaseDetails(companyConfig: Record<string, unknown>, envFields: ReturnType<typeof getEnvironmentCompanyFields>) {
  const hasApiKey = Boolean(normalizeCompanyField(companyConfig[envFields.apiKey]));
  const hasAccountId = Boolean(normalizeCompanyField(companyConfig[envFields.accountId]));
  const hasWalletId = Boolean(normalizeCompanyField(companyConfig[envFields.walletId]));
  const missingFields = [
    !hasApiKey ? "api_key" : null,
    !hasWalletId ? "wallet_id" : null,
  ].filter((value): value is string => Boolean(value));

  return {
    has_api_key: hasApiKey,
    has_account_id: hasAccountId,
    has_wallet_id: hasWalletId,
    missing_fields: missingFields,
    asaas_request_attempted: false,
    asaas_account_found: false,
    wallet_found: false,
    account_id_matches: false,
    wallet_id_matches: false,
    onboarding_complete: companyConfig[envFields.onboardingComplete] === true,
    local_pix_ready: companyConfig[envFields.pixReady] === true,
    gateway_pix_ready: false,
    pix_readiness_divergent: false,
    pix_ready: companyConfig[envFields.pixReady] === true,
    pix_readiness_action: "not_checked",
    pix_last_checked_at: typeof companyConfig[envFields.pixLastCheckedAt] === "string"
      ? String(companyConfig[envFields.pixLastCheckedAt])
      : undefined,
    pix_last_error: typeof companyConfig[envFields.pixLastError] === "string"
      ? String(companyConfig[envFields.pixLastError])
      : null,
    local_metadata_warning: null,
  };
}

function logCheck(level: "log" | "warn" | "error", message: string, payload: Record<string, unknown>) {
  console[level](message, payload);
}

function formatOperationalErrorMessage(params: {
  base: string;
  environment: PaymentEnvironment;
  walletId?: string | null;
  accountId?: string | null;
}) {
  const environmentLabel = params.environment === "production" ? "Produção" : "Sandbox";
  const walletLine = params.walletId ? `Wallet utilizada: ${params.walletId}` : "Wallet utilizada: não informada";
  const accountLine = params.accountId ? `Account ID utilizado: ${params.accountId}` : "Account ID utilizado: não informado";
  return `${params.base}\nAmbiente: ${environmentLabel}\n${walletLine}\n${accountLine}`;
}

function formatEnvironmentLabel(environment: PaymentEnvironment) {
  return environment === "production" ? "produção" : "sandbox";
}

function resolveAccountNumberFromPayload(payload: unknown): string | null {
  if (typeof payload === "string" && payload.trim().length > 0) {
    return payload.trim();
  }

  if (!payload || typeof payload !== "object") return null;
  const source = payload as Record<string, unknown>;
  const accountNumber = source.accountNumber ?? source.account_number ?? source.number;
  return typeof accountNumber === "string" && accountNumber.trim().length > 0
    ? accountNumber.trim()
    : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const { env: hostResolvedEnv, host: detectedHost } = resolveEnvironmentFromHost(req);

  try {
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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: isAdmin } = await supabaseAdmin.rpc("is_admin", { _user_id: userId });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const companyId = typeof body?.company_id === "string" ? body.company_id : null;
    const requestedEnvironment =
      body?.target_environment === "production" || body?.target_environment === "sandbox"
        ? body.target_environment
        : null;

    if (!companyId || !requestedEnvironment) {
      const invalidInputMessage = !companyId
        ? "Empresa atual não localizada para validar a integração."
        : "O ambiente operacional informado não é válido para esta verificação.";
      const invalidResponse: CheckResponse = {
        status: "error",
        integration_status: "incomplete",
        environment: requestedEnvironment ?? hostResolvedEnv,
        diagnostic_stage: "input_validation",
        details: {
          has_api_key: false,
          has_account_id: false,
          has_wallet_id: false,
          missing_fields: [],
          asaas_request_attempted: false,
          asaas_account_found: false,
          wallet_found: false,
          account_id_matches: false,
          wallet_id_matches: false,
          onboarding_complete: false,
          pix_ready: false,
          pix_readiness_action: "not_checked",
          pix_last_error: null,
          error_type: !companyId ? "company_context_missing" : "invalid_target_environment",
        },
        message: invalidInputMessage,
      };

      logCheck("warn", "[check-asaas-integration] invalid input", {
        company_id: companyId,
        requested_target_environment: body?.target_environment ?? null,
        detected_host: detectedHost,
        host_resolved_environment: hostResolvedEnv,
        diagnostic_stage: "input_validation",
        asaas_request_attempted: false,
        error_type: "invalid_input",
      });

      return jsonResponse(invalidResponse, 400);
    }

    /**
     * Comentário de manutenção:
     * esta função existe para verificar saúde/diagnóstico da integração sem mutar estado.
     * Não reutilizamos `create-asaas-account` porque onboarding, vínculo e disconnect têm
     * responsabilidade diferente de health check. Separar o endpoint reduz ruído operacional,
     * evita efeitos colaterais e deixa explícito quando o erro ainda é interno ou já é externo.
     */
    const paymentEnv: PaymentEnvironment = requestedEnvironment;
    const envFields = getEnvironmentCompanyFields(paymentEnv);
    const asaasBaseUrl = getAsaasBaseUrl(paymentEnv);

    const { data: belongs } = await supabaseAdmin.rpc("user_belongs_to_company", {
      _user_id: userId,
      _company_id: companyId,
    });
    if (!belongs) {
      return new Response(JSON.stringify({ error: "Forbidden: not your company" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Comentário de manutenção:
    // depois de resolver o ambiente ativo, lemos somente o bloco de colunas daquele ambiente.
    // É proibido complementar produção com sandbox (ou o inverso) durante a verificação manual.
    const companySelect = [
      "id",
      "name",
      envFields.apiKey,
      envFields.walletId,
      envFields.accountId,
      envFields.accountEmail,
      envFields.onboardingComplete,
      envFields.pixReady,
      envFields.pixLastCheckedAt,
      envFields.pixLastError,
    ].join(", ");

    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select(companySelect)
      .eq("id", companyId)
      .maybeSingle();

    if (companyError) {
      const errorResponse: CheckResponse = {
        status: "error",
        integration_status: "invalid",
        environment: paymentEnv,
        diagnostic_stage: "company_lookup",
        details: {
          has_api_key: false,
          has_account_id: false,
          has_wallet_id: false,
          missing_fields: [],
          asaas_request_attempted: false,
          asaas_account_found: false,
          wallet_found: false,
          account_id_matches: false,
          wallet_id_matches: false,
          onboarding_complete: false,
          pix_ready: false,
          pix_readiness_action: "not_checked",
          pix_last_error: null,
          error_type: "company_lookup_error",
        },
        message: "Erro interno ao consultar empresa para verificar a integração Asaas.",
      };

      logCheck("error", "[check-asaas-integration] company lookup failed before Asaas call", {
        company_id: companyId,
        requested_target_environment: requestedEnvironment,
        resolved_payment_environment: paymentEnv,
        diagnostic_stage: "company_lookup",
        asaas_request_attempted: false,
        error_type: "company_lookup_error",
        company_lookup_error: {
          code: companyError.code ?? null,
          message: companyError.message ?? null,
          details: companyError.details ?? null,
          hint: companyError.hint ?? null,
        },
      });

      return jsonResponse(errorResponse, 500);
    }

    if (!company) {
      const notFoundResponse: CheckResponse = {
        status: "error",
        integration_status: "not_found",
        environment: paymentEnv,
        diagnostic_stage: "company_lookup",
        details: {
          has_api_key: false,
          has_account_id: false,
          has_wallet_id: false,
          missing_fields: [],
          asaas_request_attempted: false,
          asaas_account_found: false,
          wallet_found: false,
          account_id_matches: false,
          wallet_id_matches: false,
          onboarding_complete: false,
          pix_ready: false,
          pix_readiness_action: "not_checked",
          pix_last_error: null,
          error_type: "company_not_found",
        },
          message: "Empresa atual não localizada para validar a integração.",
      };

      logCheck("warn", "[check-asaas-integration] company not found before Asaas call", {
        company_id: companyId,
        requested_target_environment: requestedEnvironment,
        resolved_payment_environment: paymentEnv,
        diagnostic_stage: "company_lookup",
        asaas_request_attempted: false,
        error_type: "company_not_found",
      });

      return jsonResponse(notFoundResponse, 404);
    }

    const companyConfig = company as Record<string, unknown>;
    const details = buildBaseDetails(companyConfig, envFields);

    if (details.missing_fields.length > 0) {
      const environmentLabel = formatEnvironmentLabel(paymentEnv);
      const missingMessage = !details.has_api_key
        ? `Chave da API Asaas não configurada para o ambiente ${environmentLabel}.`
        : !details.has_wallet_id
          ? `Wallet Asaas não configurada para o ambiente ${environmentLabel}.`
          : `Configuração Asaas incompleta para o ambiente ${environmentLabel}.`;
      const missingResponse: CheckResponse = {
        status: "error",
        integration_status: "incomplete",
        environment: paymentEnv,
        diagnostic_stage: "credentials_validation",
        details: {
          ...details,
          error_type: "missing_credentials",
        },
        message: `${missingMessage} Campos pendentes: ${details.missing_fields.join(", ")}.`,
      };

      logCheck("warn", "[check-asaas-integration] missing environment credentials before Asaas call", {
        company_id: companyId,
        requested_target_environment: requestedEnvironment,
        resolved_payment_environment: paymentEnv,
        diagnostic_stage: "credentials_validation",
        asaas_request_attempted: false,
        error_type: "missing_credentials",
        missing_fields: details.missing_fields,
      });

      return jsonResponse(missingResponse, 200);
    }

    const apiKey = normalizeCompanyField(companyConfig[envFields.apiKey]);
    const storedAccountId = normalizeCompanyField(companyConfig[envFields.accountId]);
    const storedWalletId = normalizeCompanyField(companyConfig[envFields.walletId]);

    try {
      /**
       * Comentário de suporte:
       * verificação dedicada não altera onboarding nem corrige dados automaticamente.
       * Ela apenas consulta o gateway e compara o retorno com o que já está salvo,
       * justamente para diferenciar credencial inválida, conta divergente e pendência operacional.
       */
      logCheck("log", "[check-asaas-integration] calling Asaas accountNumber health check", {
        company_id: companyId,
        requested_target_environment: requestedEnvironment,
        resolved_payment_environment: paymentEnv,
        diagnostic_stage: "asaas_request",
        asaas_request_attempted: true,
        error_type: null,
        endpoint: `${asaasBaseUrl}/myAccount/accountNumber`,
      });

      /**
       * Ordem da validação (mínima e explícita):
       * 1) accountNumber como prova primária de conta/autenticação no ambiente;
       * 2) status/wallet/pix para diagnóstico operacional complementar.
       */
      const accountNumberRes = await fetch(`${asaasBaseUrl}/myAccount/accountNumber`, {
        headers: { access_token: apiKey! },
      });

      if (!accountNumberRes.ok) {
        const errorBody = await accountNumberRes.text();
        const authError = accountNumberRes.status === 401 || accountNumberRes.status === 403;
        const notFoundError = accountNumberRes.status === 404;
        const environmentLabel = formatEnvironmentLabel(paymentEnv);

        const gatewayFailureResponse: CheckResponse = {
          status: "error",
          integration_status: authError ? "invalid" : notFoundError ? "not_found" : "communication_error",
          environment: paymentEnv,
          diagnostic_stage: "asaas_request",
          details: {
            ...details,
            asaas_request_attempted: true,
            asaas_http_status: accountNumberRes.status,
            error_type: authError
              ? "invalid_api_key"
              : notFoundError
                ? "asaas_account_not_found"
                : "asaas_gateway_error",
          },
          message: authError
            ? `Falha de autenticação com o Asaas no ambiente ${environmentLabel}. Verifique a API Key e o ambiente configurado.`
            : notFoundError
              ? `Conta Asaas não encontrada no ambiente ${environmentLabel} durante a validação da integração.`
              : `Falha na comunicação com o Asaas durante a validação da integração no ambiente ${environmentLabel}.`,
        };

        logCheck(authError || notFoundError ? "warn" : "error", "[check-asaas-integration] Asaas returned operational error", {
          company_id: companyId,
          requested_target_environment: requestedEnvironment,
          resolved_payment_environment: paymentEnv,
          diagnostic_stage: "asaas_request",
          asaas_request_attempted: true,
          error_type: gatewayFailureResponse.details.error_type,
          asaas_http_status: accountNumberRes.status,
          response_body: errorBody,
        });

        return jsonResponse(gatewayFailureResponse, 200);
      }

      let accountNumberPayload: unknown = null;
      const accountNumberRawBody = await accountNumberRes.text();
      if (accountNumberRawBody.trim().length > 0) {
        try {
          accountNumberPayload = JSON.parse(accountNumberRawBody);
        } catch {
          accountNumberPayload = accountNumberRawBody;
        }
      }
      const resolvedAccountNumber = resolveAccountNumberFromPayload(accountNumberPayload);
      if (!resolvedAccountNumber) {
        // Comentário de manutenção: se accountNumber não vier em payload de sucesso,
        // separamos o erro para não mascarar como "conta não encontrada".
        const parseFailureResponse: CheckResponse = {
          status: "error",
          integration_status: "communication_error",
          environment: paymentEnv,
          diagnostic_stage: "asaas_request",
          details: {
            ...details,
            asaas_request_attempted: true,
            asaas_http_status: accountNumberRes.status,
            error_type: "unexpected_account_number_payload",
          },
          message: `Conta Asaas respondeu no ambiente ${formatEnvironmentLabel(paymentEnv)}, mas não foi possível identificar o número da conta.`,
        };

        logCheck("warn", "[check-asaas-integration] accountNumber payload parsing failed", {
          company_id: companyId,
          requested_target_environment: requestedEnvironment,
          resolved_payment_environment: paymentEnv,
          diagnostic_stage: "asaas_request",
          asaas_request_attempted: true,
          error_type: "unexpected_account_number_payload",
          payload_type: typeof accountNumberPayload,
        });

        return jsonResponse(parseFailureResponse, 200);
      }

      // Comentário de manutenção: mantemos /myAccount como leitura auxiliar para
      // account_id/wallet legados e validações já existentes sem alterar arquitetura.
      const asaasResponse = await fetch(`${asaasBaseUrl}/myAccount`, {
        headers: { access_token: apiKey! },
      });
      if (!asaasResponse.ok) {
        const asaasBody = await asaasResponse.text();
        const authError = asaasResponse.status === 401 || asaasResponse.status === 403;
        const notFoundError = asaasResponse.status === 404;
        const environmentLabel = formatEnvironmentLabel(paymentEnv);
        const myAccountFailure: CheckResponse = {
          status: "error",
          integration_status: authError ? "invalid" : notFoundError ? "not_found" : "communication_error",
          environment: paymentEnv,
          diagnostic_stage: "asaas_request",
          details: {
            ...details,
            asaas_request_attempted: true,
            asaas_http_status: asaasResponse.status,
            error_type: authError
              ? "invalid_api_key_after_account_number"
              : notFoundError
                ? "asaas_my_account_not_found"
                : "asaas_my_account_error",
          },
          message: authError
            ? `Falha de autenticação com o Asaas no ambiente ${environmentLabel}. Verifique a API Key e o ambiente configurado.`
            : notFoundError
              ? `Conta Asaas validada no ambiente ${environmentLabel}, mas não encontrada no endpoint complementar de conta.`
              : `Conta Asaas validada no ambiente ${environmentLabel}, porém o diagnóstico complementar falhou.`,
        };

        logCheck(authError || notFoundError ? "warn" : "error", "[check-asaas-integration] myAccount complementary check failed", {
          company_id: companyId,
          requested_target_environment: requestedEnvironment,
          resolved_payment_environment: paymentEnv,
          diagnostic_stage: "asaas_request",
          asaas_request_attempted: true,
          error_type: myAccountFailure.details.error_type,
          asaas_http_status: asaasResponse.status,
          response_body: asaasBody,
        });

        return jsonResponse(myAccountFailure, 200);
      }

      const checkedAt = new Date().toISOString();
      const apiKeyFingerprint = await buildApiKeyFingerprint(apiKey);
      const accountData = await asaasResponse.json();
      const remoteAccountResolution = extractAccountIdFromAsaasPayload(accountData);
      const remoteAccountId = normalizeCompanyField(remoteAccountResolution.value);
      let remoteWalletId = normalizeCompanyField(extractWalletIdFromAsaasPayload(accountData));
      // Comentário de manutenção: alguns payloads de /myAccount não trazem wallet no topo.
      // Reutilizamos /wallets como fallback de leitura para evitar falso "wallet_not_found".
      if (!remoteWalletId) {
        try {
          const walletsLookupRes = await fetch(`${asaasBaseUrl}/wallets/`, {
            headers: { access_token: apiKey! },
          });
          if (walletsLookupRes.ok) {
            const walletsLookupData = await walletsLookupRes.json();
            const walletCandidates = normalizeAsaasList(walletsLookupData)
              .map((item) => normalizeCompanyField(item.id ?? item.walletId ?? null))
              .filter((value): value is string => Boolean(value));
            remoteWalletId = walletCandidates.find((walletId) => walletId === storedWalletId) ?? walletCandidates[0] ?? null;
          }
        } catch (walletLookupError) {
          logCheck("warn", "[check-asaas-integration] wallet lookup fallback failed", {
            company_id: companyId,
            requested_target_environment: requestedEnvironment,
            resolved_payment_environment: paymentEnv,
            diagnostic_stage: "asaas_request",
            asaas_request_attempted: true,
            error_type: "wallet_lookup_fallback_failed",
            error_message: walletLookupError instanceof Error ? walletLookupError.message : String(walletLookupError),
          });
        }
      }
      const accountIdMatches = Boolean(remoteAccountId && storedAccountId && remoteAccountId === storedAccountId);
      const walletIdMatches = Boolean(remoteWalletId && storedWalletId && remoteWalletId === storedWalletId);
      const asaasAccountFound = Boolean(remoteAccountId);
      const walletFound = Boolean(remoteWalletId);
      const onboardingComplete = details.onboarding_complete;
      let confirmedWalletId = remoteWalletId;
      let accountStatus: string | null = null;
      let accountSubstatus: {
        commercial: string | null;
        bank: string | null;
        documentation: string | null;
        general: string | null;
      } | null = null;
      let pixTotalKeys = 0;
      let pixActiveKeys = 0;
      const pixStatuses = new Set<string>();
      const pixTypes = new Set<string>();

      /**
       * Comentário de manutenção:
       * a conta pode estar operacional com API key + wallet válidas, mas sem `account_id`
       * persistido localmente em empresas que passaram por vínculo anterior/legado.
       * Nesses casos a verificação manual não deve falhar genericamente antes de consultar
       * o Asaas. Primeiro validamos o gateway real e, só depois, devolvemos pendência clara
       * de cadastro local para o ambiente ativo.
       */
      // Comentário de manutenção:
      // `account_id` local é metadado de auditoria; a operação real usa API key + wallet.
      // Portanto, ausência de account_id não deve gerar falso negativo para o usuário.
      const accountIdCheckBypassed = !storedAccountId;
      const localMetadataWarning = accountIdCheckBypassed
        ? "Pendência cadastral local: account_id do ambiente não está salvo na empresa."
        : null;
      if (accountIdCheckBypassed) {
        logCheck("log", "[check-asaas-integration] local account_id missing; proceeding with non-blocking validation", {
          company_id: companyId,
          requested_target_environment: requestedEnvironment,
          resolved_payment_environment: paymentEnv,
          diagnostic_stage: "asaas_request",
          asaas_request_attempted: true,
          error_type: "missing_local_account_id_non_blocking",
          remote_account_id: remoteAccountId,
        });
      }

      // Comentário de manutenção:
      // ausência de account_id local não bloqueia, mas ausência de conta no gateway bloqueia
      // para evitar falso positivo quando `/myAccount` retorna payload inconsistente.
      if (!asaasAccountFound) {
        const accountNotFoundResponse: CheckResponse = {
          status: "error",
          integration_status: "not_found",
          environment: paymentEnv,
          diagnostic_stage: "asaas_request",
          details: {
            ...details,
            asaas_request_attempted: true,
            asaas_account_found: asaasAccountFound,
            wallet_found: walletFound,
            account_id_matches: accountIdMatches,
            wallet_id_matches: walletIdMatches,
            error_type: "asaas_account_not_found",
          },
          message: `Conta Asaas validada no ambiente ${formatEnvironmentLabel(paymentEnv)}, porém não foi possível identificar os dados da conta no retorno complementar.`,
        };

        logCheck("warn", "[check-asaas-integration] account not found in /myAccount response", {
          company_id: companyId,
          requested_target_environment: requestedEnvironment,
          resolved_payment_environment: paymentEnv,
          diagnostic_stage: "asaas_request",
          asaas_request_attempted: true,
          error_type: "asaas_account_not_found",
          remote_account_id: remoteAccountId,
          remote_account_id_source: remoteAccountResolution.source,
        });

        accountNotFoundResponse.message = formatOperationalErrorMessage({
          base: "Verificação falhou. Resultado: conta não encontrada no Asaas.",
          environment: paymentEnv,
          walletId: storedWalletId,
          accountId: storedAccountId,
        });
        return jsonResponse(accountNotFoundResponse, 200);
      }

      if (!accountIdCheckBypassed && !accountIdMatches) {
        const accountMismatchResponse: CheckResponse = {
          status: "error",
          integration_status: "not_found",
          environment: paymentEnv,
          diagnostic_stage: "asaas_request",
          details: {
            ...details,
            asaas_request_attempted: true,
            asaas_account_found: asaasAccountFound,
            wallet_found: walletFound,
            account_id_matches: accountIdMatches,
            wallet_id_matches: walletIdMatches,
            error_type: "account_id_mismatch",
          },
          message: "Conta Asaas encontrada, mas o account_id salvo na empresa não confere com o gateway.",
        };

        logCheck("warn", "[check-asaas-integration] account mismatch after Asaas call", {
          company_id: companyId,
          requested_target_environment: requestedEnvironment,
          resolved_payment_environment: paymentEnv,
          diagnostic_stage: "asaas_request",
          asaas_request_attempted: true,
          error_type: "account_id_mismatch",
          stored_account_id: storedAccountId,
          remote_account_id: remoteAccountId,
          remote_account_id_source: remoteAccountResolution.source,
        });

        accountMismatchResponse.message = formatOperationalErrorMessage({
          base: "Verificação falhou. Resultado: account_id divergente entre empresa e gateway.",
          environment: paymentEnv,
          walletId: storedWalletId,
          accountId: storedAccountId,
        });
        return jsonResponse(accountMismatchResponse, 200);
      }

      if (!walletFound || !walletIdMatches) {
        const walletMismatchResponse: CheckResponse = {
          status: "error",
          integration_status: "invalid",
          environment: paymentEnv,
          diagnostic_stage: "asaas_request",
          details: {
            ...details,
            asaas_request_attempted: true,
            asaas_account_found: asaasAccountFound,
            wallet_found: walletFound,
            account_id_matches: accountIdMatches,
            wallet_id_matches: walletIdMatches,
            error_type: walletFound ? "wallet_id_mismatch" : "wallet_not_found",
          },
          message: walletFound
            ? "Wallet Asaas divergente: o wallet_id salvo na empresa não confere com o gateway."
            : "Wallet Asaas não encontrada durante a verificação da integração.",
        };

        logCheck("warn", "[check-asaas-integration] wallet validation failed after Asaas call", {
          company_id: companyId,
          requested_target_environment: requestedEnvironment,
          resolved_payment_environment: paymentEnv,
          diagnostic_stage: "asaas_request",
          asaas_request_attempted: true,
          error_type: walletMismatchResponse.details.error_type,
          stored_wallet_id: storedWalletId,
          remote_wallet_id: remoteWalletId,
        });

        walletMismatchResponse.message = formatOperationalErrorMessage({
          base: walletFound
            ? "Verificação falhou. Resultado: wallet divergente entre empresa e gateway."
            : "Verificação falhou. Resultado: wallet não encontrada no Asaas.",
          environment: paymentEnv,
          walletId: storedWalletId,
          accountId: storedAccountId,
        });
        return jsonResponse(walletMismatchResponse, 200);
      }

      /**
       * Comentário de diagnóstico:
       * as chamadas abaixo são estritamente de leitura para auditoria operacional do Pix.
       * Não criamos chave, não alteramos conta e não executamos endpoints de escrita.
       */
      const [statusRes, walletsRes, pixActiveRes, pixAllRes] = await Promise.all([
        fetch(`${asaasBaseUrl}/myAccount/status`, { headers: { access_token: apiKey! } }),
        fetch(`${asaasBaseUrl}/wallets/`, { headers: { access_token: apiKey! } }),
        fetch(`${asaasBaseUrl}/pix/addressKeys?status=ACTIVE`, { headers: { access_token: apiKey! } }),
        fetch(`${asaasBaseUrl}/pix/addressKeys`, { headers: { access_token: apiKey! } }),
      ]);

      if (!statusRes.ok || !walletsRes.ok || !pixActiveRes.ok || !pixAllRes.ok) {
        const gatewayFailureResponse: CheckResponse = {
          status: "error",
          integration_status: "communication_error",
          environment: paymentEnv,
          diagnostic_stage: "asaas_request",
          details: {
            ...details,
            asaas_request_attempted: true,
            api_key_fingerprint: apiKeyFingerprint,
            checked_at: checkedAt,
            gateway_account_id: remoteAccountId,
            gateway_wallet_id: remoteWalletId,
            error_type: "asaas_diagnostic_query_failed",
            pix_readiness_action: "query_failed",
            pix_last_checked_at: checkedAt,
            pix_last_error: "Falha ao consultar diagnóstico operacional do Pix no Asaas.",
            local_metadata_warning: localMetadataWarning,
          },
          message: `Conta Asaas validada no ambiente ${formatEnvironmentLabel(paymentEnv)}, porém houve erro ao consultar o diagnóstico operacional (status/wallet/pix).`,
        };

        logCheck("warn", "[check-asaas-integration] read-only diagnostic query failed", {
          company_id: companyId,
          environment: paymentEnv,
          status_http: statusRes.status,
          wallets_http: walletsRes.status,
          pix_active_http: pixActiveRes.status,
          pix_all_http: pixAllRes.status,
        });

        return jsonResponse(gatewayFailureResponse, 200);
      }

      const statusData = await statusRes.json();
      const statusRecord = statusData && typeof statusData === "object"
        ? (statusData as Record<string, unknown>)
        : null;
      accountStatus = normalizeUpperText(statusRecord?.status) ?? normalizeUpperText(statusRecord?.generalStatus);
      accountSubstatus = resolveAccountSubstatus(statusRecord);

      const walletsData = await walletsRes.json();
      const walletsList = normalizeAsaasList(walletsData);
      const walletCandidates = walletsList
        .map((item) => normalizeCompanyField(item.id ?? item.walletId ?? null))
        .filter((value): value is string => Boolean(value));
      const matchedWallet = walletCandidates.find((walletId) => walletId === storedWalletId);
      confirmedWalletId = matchedWallet ?? walletCandidates[0] ?? confirmedWalletId;

      const pixActiveData = await pixActiveRes.json();
      pixActiveKeys = normalizeAsaasList(pixActiveData).length;

      const pixAllData = await pixAllRes.json();
      const allPixKeys = normalizeAsaasList(pixAllData);
      pixTotalKeys = allPixKeys.length;
      allPixKeys.forEach((item) => {
        const status = normalizeUpperText(item.status);
        const type = normalizeUpperText(item.type);
        if (status) pixStatuses.add(status);
        if (type) pixTypes.add(type);
      });

      const gatewayPixReady = pixActiveKeys > 0;
      const pixReadinessDivergent = gatewayPixReady !== details.local_pix_ready;
      const pixFinalError = gatewayPixReady
        ? null
        : "Conta Asaas sem chave Pix ACTIVE no ambiente consultado.";
      const accountApproved = onboardingComplete && accountStatus !== "PENDING" && accountStatus !== "REJECTED";
      const pixReadyForOperations = gatewayPixReady && accountApproved;
      const pixConclusion = !accountApproved
        ? "Pix indisponível: conta não aprovada."
        : !gatewayPixReady
          ? "Pix indisponível: sem chave ACTIVE."
          : pixReadinessDivergent
            ? "Pix indisponível: divergência entre estado local e gateway."
            : "Pix operacional neste ambiente.";

      if (!onboardingComplete) {
        const pendingResponse: CheckResponse = {
          status: "error",
          integration_status: "pending",
          environment: paymentEnv,
          diagnostic_stage: "asaas_request",
          details: {
            ...details,
            asaas_request_attempted: true,
            asaas_account_found: asaasAccountFound,
            wallet_found: walletFound,
            account_id_matches: accountIdMatches,
            wallet_id_matches: walletIdMatches,
            local_pix_ready: details.local_pix_ready,
            gateway_pix_ready: gatewayPixReady,
            pix_readiness_divergent: pixReadinessDivergent,
            pix_ready: pixReadyForOperations,
            pix_readiness_action: "already_ready",
            pix_last_checked_at: checkedAt,
            pix_last_error: pixFinalError,
            pix_total_keys: pixTotalKeys,
            pix_active_keys: pixActiveKeys,
            pix_key_statuses: Array.from(pixStatuses),
            pix_key_types: Array.from(pixTypes),
            account_status: accountStatus,
            account_substatus: accountSubstatus,
            api_key_fingerprint: apiKeyFingerprint,
            checked_at: checkedAt,
            gateway_wallet_id: confirmedWalletId,
            gateway_account_id: remoteAccountId,
            local_metadata_warning: localMetadataWarning,
            error_type: "onboarding_pending",
          },
          message: "Pix indisponível: conta não aprovada.",
        };

        logCheck("warn", "[check-asaas-integration] onboarding pending after Asaas validation", {
          company_id: companyId,
          requested_target_environment: requestedEnvironment,
          resolved_payment_environment: paymentEnv,
          diagnostic_stage: "asaas_request",
          asaas_request_attempted: true,
          error_type: "onboarding_pending",
        });

        return jsonResponse(pendingResponse, 200);
      }

      const successResponse: CheckResponse = {
        status: pixReadyForOperations ? "ok" : "error",
        integration_status: pixReadyForOperations ? "valid" : "pending",
        environment: paymentEnv,
        diagnostic_stage: "asaas_request",
        details: {
          ...details,
          asaas_request_attempted: true,
          asaas_account_found: asaasAccountFound,
          wallet_found: walletFound,
          account_id_matches: accountIdMatches,
          wallet_id_matches: walletIdMatches,
          local_pix_ready: details.local_pix_ready,
          gateway_pix_ready: gatewayPixReady,
          pix_readiness_divergent: pixReadinessDivergent,
          pix_ready: pixReadyForOperations,
          pix_readiness_action: "already_ready",
          pix_last_checked_at: checkedAt,
          pix_last_error: pixFinalError,
          pix_total_keys: pixTotalKeys,
          pix_active_keys: pixActiveKeys,
          pix_key_statuses: Array.from(pixStatuses),
          pix_key_types: Array.from(pixTypes),
          account_status: accountStatus,
          account_substatus: accountSubstatus,
          api_key_fingerprint: apiKeyFingerprint,
          checked_at: checkedAt,
          gateway_wallet_id: confirmedWalletId,
          gateway_account_id: remoteAccountId,
          local_metadata_warning: localMetadataWarning,
        },
        message: pixReadyForOperations
          ? `Conta Asaas validada com sucesso no ambiente ${formatEnvironmentLabel(paymentEnv)}. ${pixConclusion}`
          : `Conta validada no ambiente ${formatEnvironmentLabel(paymentEnv)}, porém com pendências operacionais. ${pixConclusion}`,
      };

      logCheck("log", "[check-asaas-integration] Asaas integration validated successfully", {
        company_id: companyId,
        requested_target_environment: requestedEnvironment,
        resolved_payment_environment: paymentEnv,
        diagnostic_stage: "asaas_request",
        asaas_request_attempted: true,
        error_type: null,
      });

      return jsonResponse(successResponse, 200);
    } catch (error) {
      const communicationResponse: CheckResponse = {
        status: "error",
        integration_status: "communication_error",
        environment: paymentEnv,
        diagnostic_stage: "asaas_request",
        details: {
          ...details,
          asaas_request_attempted: true,
          error_type: "network_or_runtime_error",
        },
        message: `Falha de rede/execução ao validar a integração Asaas no ambiente ${formatEnvironmentLabel(paymentEnv)}.`,
      };

      logCheck("error", "[check-asaas-integration] unexpected error after Asaas attempt", {
        company_id: companyId,
        requested_target_environment: requestedEnvironment,
        resolved_payment_environment: paymentEnv,
        diagnostic_stage: "asaas_request",
        asaas_request_attempted: true,
        error_type: "network_or_runtime_error",
        error_message: error instanceof Error ? error.message : String(error),
      });

      return jsonResponse(communicationResponse, 200);
    }
  } catch (error) {
    console.error("[check-asaas-integration] unexpected root error", error);
    return new Response(
      JSON.stringify({ error: "Unexpected error while checking Asaas integration" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
