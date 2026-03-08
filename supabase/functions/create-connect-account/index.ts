import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Authenticate admin user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;

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

    const { company_id } = await req.json();
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
      .select("id, name, legal_type, legal_name, trade_name, document_number, cnpj, stripe_account_id, stripe_onboarding_complete")
      .eq("id", company_id)
      .single();

    if (companyError || !company) {
      return new Response(JSON.stringify({ error: "Company not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    let stripeAccountId = company.stripe_account_id;

    // Validar se a conta Stripe existente ainda é acessível (pode ter sido criada em modo teste).
    // Se não for, limpar referência e criar nova conta.
    if (stripeAccountId) {
      try {
        await stripe.accounts.retrieve(stripeAccountId);
      } catch (retrieveError: any) {
        if (retrieveError?.code === 'account_invalid' || retrieveError?.statusCode === 403) {
          console.warn(`Stripe account ${stripeAccountId} inaccessível (provável conta de teste). Recriando...`);
          stripeAccountId = null;
          await supabaseAdmin
            .from("companies")
            .update({ stripe_account_id: null, stripe_onboarding_complete: false })
            .eq("id", company_id);
        } else {
          throw retrieveError;
        }
      }
    }

    if (!stripeAccountId) {
      const legalType = company.legal_type === "PF" ? "PF" : "PJ";
      const documentDigits = (company.document_number || company.cnpj || "").replace(/\D/g, "");
      const displayName = (company.trade_name || company.legal_name || company.name || "").trim();

      if (legalType === "PF") {
        if (documentDigits.length !== 11) {
          return new Response(
            JSON.stringify({
              error: "Para Pessoa Física, preencha um CPF válido em /admin/empresa antes de conectar pagamentos.",
              reason_code: "missing_or_invalid_pf_document",
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (!displayName) {
          return new Response(
            JSON.stringify({
              error: "Para Pessoa Física, preencha o nome da empresa/pessoa em /admin/empresa antes de conectar pagamentos.",
              reason_code: "missing_pf_name",
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      if (legalType === "PJ") {
        if (documentDigits.length !== 14) {
          return new Response(
            JSON.stringify({
              error: "Para Pessoa Jurídica, preencha um CNPJ válido em /admin/empresa antes de conectar pagamentos.",
              reason_code: "missing_or_invalid_pj_document",
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (!displayName) {
          return new Response(
            JSON.stringify({
              error: "Para Pessoa Jurídica, preencha Razão Social/Nome Fantasia em /admin/empresa antes de conectar pagamentos.",
              reason_code: "missing_pj_name",
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const businessType = legalType === "PF" ? "individual" : "company";
      console.log("[create-connect-account] creating stripe account", {
        company_id,
        legal_type: legalType,
        business_type: businessType,
      });

      const account = await stripe.accounts.create({
        type: "express",
        country: "BR",
        business_type: businessType,
        ...(businessType === "company"
          ? { company: { name: displayName } }
          : { individual: { first_name: displayName } }),
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      stripeAccountId = account.id;
      await supabaseAdmin
        .from("companies")
        .update({ stripe_account_id: stripeAccountId })
        .eq("id", company_id);
    }

    const account = await stripe.accounts.retrieve(stripeAccountId);
    const transfersActive = account.capabilities?.transfers === 'active';
    const paymentsActive = account.capabilities?.card_payments === 'active';
    const capabilitiesReady = transfersActive && paymentsActive;

    if (capabilitiesReady && !company.stripe_onboarding_complete) {
      await supabaseAdmin.from("companies").update({ stripe_onboarding_complete: true }).eq("id", company_id);
    }
    if (!capabilitiesReady && company.stripe_onboarding_complete) {
      await supabaseAdmin.from("companies").update({ stripe_onboarding_complete: false }).eq("id", company_id);
    }

    // Verificar se Pix está habilitado na conta conectada
    let pixEnabled = false;
    if (capabilitiesReady) {
      try {
        const testIntent = await stripe.paymentIntents.create({
          amount: 500,
          currency: 'brl',
          payment_method_types: ['pix'],
          metadata: { test: 'pix_check' },
        }, { stripeAccount: stripeAccountId });
        // Se criou sem erro, Pix está habilitado. Cancelar imediatamente.
        await stripe.paymentIntents.cancel(testIntent.id, {}, { stripeAccount: stripeAccountId });
        pixEnabled = true;
      } catch (pixCheckError: any) {
        console.log("Pix check: not available on connected account", pixCheckError?.message);
        pixEnabled = false;
      }
    }

    const origin = req.headers.get("origin") || "https://busaooofoof.lovable.app";

    if (account.details_submitted || company.stripe_onboarding_complete) {
      try {
        const loginLink = await stripe.accounts.createLoginLink(stripeAccountId);
        return new Response(
          JSON.stringify({
            already_complete: true,
            dashboard_url: loginLink.url,
            capabilities_ready: capabilitiesReady,
            pix_enabled: pixEnabled,
            capabilities: {
              transfers: account.capabilities?.transfers || 'inactive',
              card_payments: account.capabilities?.card_payments || 'inactive',
            },
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (loginError) {
        console.warn("createLoginLink failed, falling back to onboarding link:", loginError);
      }
    }

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${origin}/admin/empresa?stripe=refresh`,
      return_url: `${origin}/admin/empresa?stripe=complete`,
      type: "account_onboarding",
    });

    return new Response(
      JSON.stringify({ onboarding_url: accountLink.url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in create-connect-account:", error);

    const message = error instanceof Error ? error.message : "Internal server error";
    let userMessage = message;
    let actionUrl: string | undefined;

    if (message.includes("signed up for Connect")) {
      userMessage = "O Stripe Connect ainda não está ativado na sua conta Stripe. Acesse o Dashboard do Stripe, vá em 'Connect' e ative a funcionalidade antes de continuar.";
      actionUrl = "https://dashboard.stripe.com/connect/overview";
    } else if (message.includes("responsibilities of managing losses") || message.includes("platform-profile")) {
      userMessage = "Você precisa revisar e aceitar as responsabilidades do Stripe Connect no seu Dashboard. Acesse o link abaixo, complete o perfil da plataforma e tente novamente.";
      actionUrl = "https://dashboard.stripe.com/settings/connect/platform-profile";
    }

    return new Response(
      JSON.stringify({ error: userMessage, action_url: actionUrl }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
