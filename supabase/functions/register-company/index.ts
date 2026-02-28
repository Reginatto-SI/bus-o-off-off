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

    // Comentário de manutenção: regra explícita de nome evita fallback confuso entre PF/PJ.
    const persistedName = legal_type === "PJ"
      ? (trade_name?.trim() || legal_name?.trim() || company_name.trim())
      : (trade_name?.trim() || company_name.trim());

    if (!persistedName) {
      return new Response(
        JSON.stringify({ error: "Nome de exibição da empresa é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if email already exists
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) {
      console.error("Error listing users:", listError);
      return new Response(
        JSON.stringify({ error: "Erro ao verificar email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (existingUser) {
      return new Response(
        JSON.stringify({ error: "Este email já está cadastrado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Create auth user (email pre-confirmed for immediate access)
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

    const userId = newUser.user.id;

    // 2. Create company
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
      })
      .select("id")
      .single();

    if (companyError || !company) {
      console.error("Error creating company:", companyError);
      // Cleanup: delete auth user
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: "Erro ao criar empresa" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const companyId = company.id;

    // 3. Wait for handle_new_user trigger to complete
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 4. Update profile to point to new company
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        name: responsible_name,
        company_id: companyId,
        phone,
      })
      .eq("id", userId);

    if (profileError) {
      console.error("Error updating profile:", profileError);
    }

    // 5. Delete default company role created by trigger
    const defaultCompanyId = "a0000000-0000-0000-0000-000000000001";
    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("company_id", defaultCompanyId);

    // 6. Insert role for new company
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
      // Try insert as fallback
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
