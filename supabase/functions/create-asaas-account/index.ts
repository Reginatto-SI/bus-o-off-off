import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const IS_SANDBOX = Deno.env.get("ASAAS_ENV") !== "production";
const ASAAS_BASE_URL = IS_SANDBOX
  ? "https://sandbox.asaas.com/api/v3"
  : "https://api.asaas.com/v3";

function maskSensitiveValue(value?: string | null) {
  if (!value) return null;
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
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

    const { company_id, mode, api_key } = await req.json();
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
      .select("id, name, legal_type, legal_name, trade_name, document_number, cnpj, email, phone, address, address_number, province, postal_code, city, state, asaas_api_key, asaas_wallet_id, asaas_account_id, asaas_onboarding_complete")
      .eq("id", company_id)
      .single();

    if (companyError || !company) {
      return new Response(JSON.stringify({ error: "Company not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const PLATFORM_API_KEY = Deno.env.get(IS_SANDBOX ? "ASAAS_API_KEY_SANDBOX" : "ASAAS_API_KEY");
    if (!PLATFORM_API_KEY) {
      return new Response(JSON.stringify({ error: `Asaas API key not configured on platform (env: ${IS_SANDBOX ? "sandbox" : "production"})` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[create-asaas-account] Asaas env: ${IS_SANDBOX ? "SANDBOX" : "PRODUCTION"}`);

    // ====== MODE: Revalidate existing integration ======
    if (mode === "revalidate") {
      console.log("[ASAAS][VERIFY] Starting verification", {
        company_id,
        has_api_key: Boolean(company.asaas_api_key),
        has_wallet_id: Boolean(company.asaas_wallet_id),
        has_account_id: Boolean(company.asaas_account_id),
        onboarding_complete: Boolean(company.asaas_onboarding_complete),
      });

      const isApiKeyMode = Boolean(company.asaas_api_key);
      const verificationEndpoint = isApiKeyMode
        ? `${ASAAS_BASE_URL}/myAccount`
        : company.asaas_account_id
          ? `${ASAAS_BASE_URL}/accounts/${company.asaas_account_id}`
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

      const verificationToken = isApiKeyMode ? company.asaas_api_key : PLATFORM_API_KEY;

      console.log("[ASAAS][VERIFY] Using company fields", {
        company_id,
        mode: isApiKeyMode ? "api_key_my_account" : "platform_account_lookup",
        endpoint: verificationEndpoint,
        wallet_id_preview: maskSensitiveValue(company.asaas_wallet_id),
        account_id_preview: maskSensitiveValue(company.asaas_account_id),
        token_preview: maskSensitiveValue(verificationToken),
      });

      try {
        console.log("[ASAAS][VERIFY] Endpoint called", {
          company_id,
          endpoint: verificationEndpoint,
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
        const walletIdFromResponse = accountData.walletId ?? accountData.wallet?.id ?? null;
        const walletId = walletIdFromResponse ?? company.asaas_wallet_id ?? null;

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
          .update({
            asaas_wallet_id: walletId,
            asaas_account_id: accountData.id || company.asaas_account_id || null,
            asaas_account_email: accountData.email || null,
            asaas_onboarding_complete: true,
          })
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
        console.error("Error revalidating Asaas account:", err);
        return new Response(
          JSON.stringify({ error: "Erro ao validar integração com o Asaas. Tente novamente." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ====== MODE: Link existing account ======
    if (mode === "link_existing" && api_key) {
      try {
        const myAccountRes = await fetch(`${ASAAS_BASE_URL}/myAccount`, {
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
        const walletId = accountData.walletId ?? accountData.wallet?.id ?? null;

        if (!walletId) {
          return new Response(
            JSON.stringify({ error: "Não foi possível obter o walletId da conta Asaas." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        await supabaseAdmin
          .from("companies")
          .update({
            asaas_wallet_id: walletId,
            asaas_api_key: api_key,
            asaas_account_id: accountData.id || null,
            // Mantém o e-mail efetivo da conta vinculada para exibição em /admin/empresa.
            asaas_account_email: accountData.email || null,
            asaas_onboarding_complete: true,
          })
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
    if (company.asaas_wallet_id && company.asaas_onboarding_complete) {
      return new Response(
        JSON.stringify({
          already_complete: true,
          wallet_id: company.asaas_wallet_id,
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

      const createRes = await fetch(`${ASAAS_BASE_URL}/accounts`, {
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

      const walletId = createData.walletId;
      const accountId = createData.id;

      // Save to database
      await supabaseAdmin
        .from("companies")
        .update({
          asaas_wallet_id: walletId,
          asaas_account_id: accountId,
          // No fluxo de criação de subconta, o e-mail da conta Asaas é o e-mail cadastrado da empresa.
          asaas_account_email: company.email,
          asaas_api_key: createData.apiKey || null,
          asaas_onboarding_complete: true,
        })
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
    console.error("Error in create-asaas-account:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    const isAddressValidationError = errorMessage.includes("Endereço da empresa incompleto");

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: isAddressValidationError ? 400 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
