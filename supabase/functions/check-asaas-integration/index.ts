import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getAsaasBaseUrl,
  type PaymentEnvironment,
  resolveEnvironmentFromHost,
} from "../_shared/runtime-env.ts";

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

function getEnvironmentCompanyFields(environment: PaymentEnvironment) {
  if (environment === "production") {
    return {
      apiKey: "asaas_api_key_production",
      walletId: "asaas_wallet_id_production",
      accountId: "asaas_account_id_production",
      accountEmail: "asaas_account_email_production",
      onboardingComplete: "asaas_onboarding_complete_production",
    } as const;
  }

  return {
    apiKey: "asaas_api_key_sandbox",
    walletId: "asaas_wallet_id_sandbox",
    accountId: "asaas_account_id_sandbox",
    accountEmail: "asaas_account_email_sandbox",
    onboardingComplete: "asaas_onboarding_complete_sandbox",
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
  };
}

function logCheck(level: "log" | "warn" | "error", message: string, payload: Record<string, unknown>) {
  console[level](message, payload);
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
          error_type: "invalid_input",
        },
        message: "Informe company_id e target_environment para verificar a integração Asaas.",
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
          error_type: "company_not_found",
        },
        message: "Empresa não encontrada para verificar a integração Asaas.",
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
      const missingResponse: CheckResponse = {
        status: "error",
        integration_status: "incomplete",
        environment: paymentEnv,
        diagnostic_stage: "credentials_validation",
        details: {
          ...details,
          error_type: "missing_credentials",
        },
        message: `A conta Asaas deste ambiente ainda não está completamente configurada: faltando ${details.missing_fields.join(", ")}.`,
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
      logCheck("log", "[check-asaas-integration] calling Asaas health check", {
        company_id: companyId,
        requested_target_environment: requestedEnvironment,
        resolved_payment_environment: paymentEnv,
        diagnostic_stage: "asaas_request",
        asaas_request_attempted: true,
        error_type: null,
        endpoint: `${asaasBaseUrl}/myAccount`,
      });

      const asaasResponse = await fetch(`${asaasBaseUrl}/myAccount`, {
        headers: { access_token: apiKey! },
      });

      if (!asaasResponse.ok) {
        const errorBody = await asaasResponse.text();
        const authError = asaasResponse.status === 401 || asaasResponse.status === 403;
        const notFoundError = asaasResponse.status === 404;

        const gatewayFailureResponse: CheckResponse = {
          status: "error",
          integration_status: authError ? "invalid" : notFoundError ? "not_found" : "communication_error",
          environment: paymentEnv,
          diagnostic_stage: "asaas_request",
          details: {
            ...details,
            asaas_request_attempted: true,
            asaas_http_status: asaasResponse.status,
            error_type: authError
              ? "invalid_api_key"
              : notFoundError
                ? "asaas_account_not_found"
                : "asaas_gateway_error",
          },
          message: authError
            ? "Falha de credencial no Asaas: API Key rejeitada pelo gateway."
            : notFoundError
              ? "Conta Asaas não encontrada durante a verificação da integração."
              : "Falha na comunicação com o Asaas durante a verificação da integração.",
        };

        logCheck(authError || notFoundError ? "warn" : "error", "[check-asaas-integration] Asaas returned operational error", {
          company_id: companyId,
          requested_target_environment: requestedEnvironment,
          resolved_payment_environment: paymentEnv,
          diagnostic_stage: "asaas_request",
          asaas_request_attempted: true,
          error_type: gatewayFailureResponse.details.error_type,
          asaas_http_status: asaasResponse.status,
          response_body: errorBody,
        });

        return jsonResponse(gatewayFailureResponse, 200);
      }

      const accountData = await asaasResponse.json();
      const remoteAccountId = normalizeCompanyField(accountData?.id ?? null);
      const remoteWalletId = normalizeCompanyField(accountData?.walletId ?? accountData?.wallet?.id ?? null);
      const accountIdMatches = Boolean(remoteAccountId && storedAccountId && remoteAccountId === storedAccountId);
      const walletIdMatches = Boolean(remoteWalletId && storedWalletId && remoteWalletId === storedWalletId);
      const asaasAccountFound = Boolean(remoteAccountId);
      const walletFound = Boolean(remoteWalletId);
      const onboardingComplete = details.onboarding_complete;

      /**
       * Comentário de manutenção:
       * a conta pode estar operacional com API key + wallet válidas, mas sem `account_id`
       * persistido localmente em empresas que passaram por vínculo anterior/legado.
       * Nesses casos a verificação manual não deve falhar genericamente antes de consultar
       * o Asaas. Primeiro validamos o gateway real e, só depois, devolvemos pendência clara
       * de cadastro local para o ambiente ativo.
       */
      if (!storedAccountId) {
        const missingLocalAccountIdResponse: CheckResponse = {
          status: "error",
          integration_status: "pending",
          environment: paymentEnv,
          diagnostic_stage: "asaas_request",
          details: {
            ...details,
            asaas_request_attempted: true,
            asaas_account_found: asaasAccountFound,
            wallet_found: walletFound,
            account_id_matches: false,
            wallet_id_matches: walletIdMatches,
            error_type: "missing_local_account_id",
          },
          message: "Conta Asaas validada no gateway, mas falta salvar o account_id deste ambiente no cadastro da empresa.",
        };

        logCheck("warn", "[check-asaas-integration] gateway validated account but local account_id is missing", {
          company_id: companyId,
          requested_target_environment: requestedEnvironment,
          resolved_payment_environment: paymentEnv,
          diagnostic_stage: "asaas_request",
          asaas_request_attempted: true,
          error_type: "missing_local_account_id",
          remote_account_id: remoteAccountId,
        });

        return jsonResponse(missingLocalAccountIdResponse, 200);
      }

      if (!asaasAccountFound || !accountIdMatches) {
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

        return jsonResponse(walletMismatchResponse, 200);
      }

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
            error_type: "onboarding_pending",
          },
          message: "Conta Asaas encontrada e credenciais válidas, mas o onboarding ainda está pendente no cadastro da empresa.",
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
        status: "ok",
        integration_status: "valid",
        environment: paymentEnv,
        diagnostic_stage: "asaas_request",
        details: {
          ...details,
          asaas_request_attempted: true,
          asaas_account_found: asaasAccountFound,
          wallet_found: walletFound,
          account_id_matches: accountIdMatches,
          wallet_id_matches: walletIdMatches,
        },
        message: "Integração Asaas validada com sucesso.",
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
        message: "Falha na comunicação com o Asaas durante a verificação da integração.",
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
