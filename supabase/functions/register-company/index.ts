import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RegisterCompanyRequest {
  legal_type: "PF" | "PJ";
  company_name: string;
  legal_name?: string | null;
  trade_name?: string | null;
  document_number: string;
  responsible_name: string;
  email: string;
  phone: string;
  password: string;
  referral_code?: string | null;
  representative_code?: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body: RegisterCompanyRequest = await req.json();
    const {
      legal_type,
      company_name,
      legal_name,
      trade_name,
      document_number,
      responsible_name,
      email,
      phone,
      password,
      referral_code,
      representative_code,
    } = body;

    // Validate required fields
    if (!legal_type || !company_name || !document_number || !responsible_name || !email || !phone || !password) {
      return new Response(
        JSON.stringify({ error: "Todos os campos são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (legal_type !== "PF" && legal_type !== "PJ") {
      return new Response(
        JSON.stringify({ error: "Tipo de cadastro inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Email inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate password length
    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Senha deve ter pelo menos 6 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedDocument = document_number.replace(/\D/g, "");
    const normalizedReferralCode = referral_code?.trim().toUpperCase() || null;
    const normalizedRepresentativeCode = representative_code?.trim().toUpperCase() || null;
    if (legal_type === "PJ" && normalizedDocument.length !== 14) {
      return new Response(
        JSON.stringify({ error: "CNPJ deve ter 14 dígitos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (legal_type === "PF" && normalizedDocument.length !== 11) {
      return new Response(
        JSON.stringify({ error: "CPF deve ter 11 dígitos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Regra explícita de nome evita fallback confuso entre PF/PJ.
    const persistedName = legal_type === "PJ"
      ? (trade_name?.trim() || legal_name?.trim() || company_name.trim())
      : (trade_name?.trim() || company_name.trim());

    if (!persistedName) {
      return new Response(
        JSON.stringify({ error: "Nome de exibição da empresa é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Checagem de e-mail existente no Auth.
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) {
      console.error("Error listing users:", listError);
      return new Response(
        JSON.stringify({ error: "Erro ao verificar email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const existingUser = existingUsers?.users?.find(
      (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()
    );

    // Flag para o frontend saber que a conta foi reutilizada (orientar login).
    let reusedAccount = false;
    let userId: string;

    if (existingUser) {
      // Conta já existe — verificar se já tem papel de gerente em alguma empresa.
      const { data: existingRole, error: roleCheckError } = await supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", existingUser.id)
        .eq("role", "gerente")
        .maybeSingle();

      if (roleCheckError) {
        console.error("[register-company] Error checking existing roles:", roleCheckError);
        return new Response(
          JSON.stringify({ error: "Erro ao verificar cadastro existente." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (existingRole) {
        // Já tem empresa — bloquear com mensagem específica.
        return new Response(
          JSON.stringify({
            error: "Este e-mail já possui uma empresa cadastrada. Faça login para gerenciar sua conta.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Reutilizar conta existente — não criar novo auth user.
      userId = existingUser.id;
      reusedAccount = true;
      console.log("[register-company] Reusing existing auth account for company registration", {
        user_id: userId,
        email,
      });
    } else {
      // Conta nova — criar auth user normalmente.
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: responsible_name },
      });

      if (createError || !newUser?.user) {
        console.error("Error creating user:", createError);
        return new Response(
          JSON.stringify({ error: createError?.message || "Erro ao criar usuário" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = newUser.user.id;
    }

    // Gerar referral_code único para a nova empresa (campo NOT NULL obrigatório).
    const generatedReferralCode = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();

    // Criar empresa.
    // Comentário de manutenção: o `public_slug` não é enviado aqui propositalmente,
    // pois a geração automática da vitrine ocorre no banco (trigger) com regra
    // determinística de normalização + unicidade sequencial.
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .insert({
        name: persistedName,
        legal_type,
        legal_name: legal_type === "PJ" ? (legal_name?.trim() || null) : null,
        trade_name: trade_name?.trim() || null,
        cnpj: legal_type === "PJ" ? normalizedDocument : null,
        document: normalizedDocument,
        document_number: normalizedDocument,
        phone,
        email,
        referral_code: generatedReferralCode,
        platform_fee_percent: 3,
        socio_split_percent: 3,
      })
      .select("id")
      .single();

    if (companyError || !company) {
      console.error("Error creating company:", companyError);
      // Cleanup: se a conta foi criada nesta requisição, remover.
      if (!reusedAccount) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      }
      return new Response(
        JSON.stringify({ error: "Erro ao criar empresa" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const companyId = company.id;

    // Vínculo de referral entre empresas.
    let companyReferralLinked = false;

    if (normalizedReferralCode) {
      const { data: referrerCompany, error: referrerLookupError } = await supabaseAdmin
        .from("companies")
        .select("id, referral_code, is_active")
        .eq("referral_code", normalizedReferralCode)
        .eq("is_active", true)
        .maybeSingle();

      if (referrerLookupError) {
        console.error("Error resolving referral code:", referrerLookupError);
      } else if (!referrerCompany) {
        console.log("[register-company] referral_code ignored because it was not found or inactive", {
          referral_code: normalizedReferralCode,
          referred_company_id: companyId,
        });
      } else if (referrerCompany.id === companyId) {
        console.log("[register-company] direct self-referral blocked", {
          referral_code: normalizedReferralCode,
          referred_company_id: companyId,
        });
      } else {
        const { error: referralInsertError } = await supabaseAdmin
          .from("company_referrals")
          .insert({
            company_id: referrerCompany.id,
            referrer_company_id: referrerCompany.id,
            referred_company_id: companyId,
            referral_code: normalizedReferralCode,
            status: "pendente",
            tracking_captured_at: new Date().toISOString(),
            activated_at: new Date().toISOString(),
            target_platform_fee_amount: 100,
            reward_amount: 50,
            progress_platform_fee_amount: 0,
          });

        if (referralInsertError) {
          if ((referralInsertError as { code?: string | null }).code === "23505") {
            console.log("[register-company] referral ignored because referred company already has an official link", {
              referral_code: normalizedReferralCode,
              referred_company_id: companyId,
            });
          } else {
            console.error("Error creating company referral:", referralInsertError);
          }
        } else {
          companyReferralLinked = true;
        }
      }
    }

    // Fase complementar: vínculo com representante.
    const hasLegacyRepresentativeFallback =
      !normalizedRepresentativeCode &&
      !companyReferralLinked &&
      Boolean(normalizedReferralCode && /^REP[A-Z0-9]{7}$/.test(normalizedReferralCode));

    const representativeCodeCandidate =
      normalizedRepresentativeCode ||
      (hasLegacyRepresentativeFallback ? normalizedReferralCode : null);

    if (representativeCodeCandidate) {
      const { data: representative, error: representativeLookupError } = await supabaseAdmin
        .from("representatives")
        .select("id, representative_code")
        .eq("representative_code", representativeCodeCandidate)
        .eq("status", "ativo")
        .maybeSingle();

      if (representativeLookupError) {
        console.error("Error resolving representative code:", representativeLookupError);
      } else if (!representative) {
        console.log("[register-company] representative_code ignored because it was not found or inactive", {
          representative_code: representativeCodeCandidate,
          company_id: companyId,
        });
      } else {
        const representativeLinkSource =
          normalizedRepresentativeCode
            ? "codigo_manual"
            : "url_ref";

        const { error: representativeLinkError } = await supabaseAdmin
          .from("representative_company_links")
          .insert({
            company_id: companyId,
            representative_id: representative.id,
            source_code: representativeCodeCandidate,
            link_source: representativeLinkSource,
            source_context: {
              captured_via: "register-company",
              request_origin: req.headers.get("origin"),
              request_referer: req.headers.get("referer"),
              user_agent: req.headers.get("user-agent"),
              used_field: normalizedRepresentativeCode
                ? "representative_code"
                : "referral_code_legacy_fallback",
            },
            linked_at: new Date().toISOString(),
            locked: true,
          });

        if (representativeLinkError) {
          if ((representativeLinkError as { code?: string | null }).code === "23505") {
            console.log("[register-company] representative link ignored because company already has official representative", {
              company_id: companyId,
              representative_code: representativeCodeCandidate,
            });
          } else {
            console.error("Error creating representative company link:", representativeLinkError);
          }
        }
      }
    }

    // Aguardar trigger handle_new_user (apenas para contas novas).
    if (!reusedAccount) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Atualizar dados cadastrais no perfil.
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        name: responsible_name,
        phone,
      })
      .eq("id", userId);

    if (profileError) {
      console.error("Error updating profile:", profileError);
    }

    // Limpeza defensiva do legado.
    const defaultCompanyId = "a0000000-0000-0000-0000-000000000001";
    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("company_id", defaultCompanyId);

    // Vincular papel gerente na nova empresa.
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        {
          user_id: userId,
          company_id: companyId,
          role: "gerente",
        },
        { onConflict: "user_id,company_id" }
      );

    if (roleError) {
      console.error("Error creating role:", roleError);
      await supabaseAdmin.from("user_roles").insert({
        user_id: userId,
        company_id: companyId,
        role: "gerente",
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        company_id: companyId,
        user_id: userId,
        // Flag para o frontend saber que precisa orientar login em vez de auto-login.
        reused_account: reusedAccount,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Erro inesperado. Tente novamente." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
