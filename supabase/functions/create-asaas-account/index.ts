import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ASAAS_BASE_URL = Deno.env.get("ASAAS_ENV") === "production"
  ? "https://api.asaas.com/v3"
  : "https://sandbox.asaas.com/api/v3";

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
      .select("id, name, legal_type, legal_name, trade_name, document_number, cnpj, email, asaas_wallet_id, asaas_onboarding_complete")
      .eq("id", company_id)
      .single();

    if (companyError || !company) {
      return new Response(JSON.stringify({ error: "Company not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const PLATFORM_API_KEY = Deno.env.get("ASAAS_API_KEY");
    if (!PLATFORM_API_KEY) {
      return new Response(JSON.stringify({ error: "Asaas API key not configured on platform" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
        const walletId = accountData.walletId;

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

    // Create Asaas subaccount
    try {
      const accountPayload: Record<string, any> = {
        name: displayName,
        email: company.email,
        cpfCnpj: documentDigits,
        companyType: legalType === "PF" ? "MEI" : "LIMITED",
        incomeValue: 5000,
        birthDate: "1990-01-01",
      };

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
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
