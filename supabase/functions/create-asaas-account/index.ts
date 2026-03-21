import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  resolveEnvironmentFromHost,
  getAsaasBaseUrl,
  getAsaasApiKeySecretName,
  type PaymentEnvironment,
} from "../_shared/runtime-env.ts";
import { inferPaymentOwnerType, logPaymentTrace } from "../_shared/payment-observability.ts";

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
      .select("id, name, legal_type, legal_name, trade_name, document_number, cnpj, email, phone, address, address_number, province, postal_code, city, state, asaas_api_key_production, asaas_wallet_id_production, asaas_account_id_production, asaas_account_email_production, asaas_onboarding_complete_production, asaas_api_key_sandbox, asaas_wallet_id_sandbox, asaas_account_id_sandbox, asaas_account_email_sandbox, asaas_onboarding_complete_sandbox")
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
        token_preview: maskSensitiveValue(verificationToken),
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
        const walletIdFromResponse = accountData.walletId ?? accountData.wallet?.id ?? accountData.id ?? null;
        const walletId = walletIdFromResponse ?? companyConfig[envFields.walletId] ?? null;

        if (!walletId) {
          console.error("[ASAAS][VERIFY] Validation failed reason", {
            company_id,
            reason: "wallet_id_missing_in_response",
            endpoint: verificationEndpoint,
            response_keys: Object.keys(accountData || {}),
          });
          return new Response(
            JSON.stringify({ error: "Não foi possível obter o walletId da conta Asaas." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Comentário de manutenção: nesta ação atualizamos apenas os campos exibidos no card
        // e reafirmamos o status de integração para manter o UI sincronizado com o Asaas.
        await supabaseAdmin
          .from("companies")
          .update(
            buildCompanyConfigWithEnvironmentUpdate({
              [envFields.walletId]: walletId,
              [envFields.accountId]: accountData.id || environmentAccountId || null,
              [envFields.accountEmail]: accountData.email || null,
              [envFields.onboardingComplete]: true,
            }),
          )
          .eq("id", company_id);

        return new Response(
          JSON.stringify({
            success: true,
            wallet_id: walletId,
            account_name: accountData.name || accountData.tradingName || null,
            account_email: accountData.email || null,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        console.error("[ASAAS][VERIFY] Unexpected error after gateway attempt", {
          company_id,
          requested_target_environment: target_environment ?? null,
          resolved_payment_environment: paymentEnv,
          endpoint: verificationEndpoint,
          asaas_request_attempted: true,
          error_origin: "gateway_or_runtime_after_attempt",
          error_message: err instanceof Error ? err.message : String(err),
        });
        return new Response(
          JSON.stringify({ error: "Erro ao validar integração com o Asaas. Tente novamente." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (mode === "disconnect") {
      await supabaseAdmin
        .from("companies")
        .update(
          buildCompanyConfigWithEnvironmentUpdate({
            [envFields.apiKey]: null,
            [envFields.walletId]: null,
            [envFields.accountId]: null,
            [envFields.accountEmail]: null,
            [envFields.onboardingComplete]: false,
          }),
        )
        .eq("id", company_id);

      return new Response(
        JSON.stringify({
          success: true,
          disconnected_environment: paymentEnv,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ====== MODE: Link existing account ======
    if (mode === "link_existing" && api_key) {
      try {
        const myAccountRes = await fetch(`${asaasBaseUrl}/myAccount`, {
          headers: { "access_token": api_key },
        });

        if (!myAccountRes.ok) {
          const errBody = await myAccountRes.text();
          console.error("Asaas myAccount validation failed:", errBody);
          return new Response(
            JSON.stringify({ error: "API Key inválida ou conta não encontrada. Verifique a chave e tente novamente." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const accountData = await myAccountRes.json();
        const walletId = accountData.walletId ?? accountData.wallet?.id ?? accountData.id ?? null;

        if (!walletId) {
          console.error("[create-asaas-account] walletId missing from /myAccount response", {
            company_id,
            response_keys: Object.keys(accountData || {}),
            environment: paymentEnv,
          });
          return new Response(
            JSON.stringify({ error: "Não foi possível obter o walletId da conta Asaas. Verifique se a API Key está correta." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        await supabaseAdmin
          .from("companies")
          .update(
            buildCompanyConfigWithEnvironmentUpdate({
              [envFields.walletId]: walletId,
              [envFields.apiKey]: api_key,
              [envFields.accountId]: accountData.id || null,
              [envFields.accountEmail]: accountData.email || null,
              [envFields.onboardingComplete]: true,
            }),
          )
          .eq("id", company_id);

        return new Response(
          JSON.stringify({
            success: true,
            wallet_id: walletId,
            account_name: accountData.name || accountData.tradingName || null,
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

      return new Response(
        JSON.stringify({
          success: true,
          wallet_id: walletId,
          account_id: accountId,
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
