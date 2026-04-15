import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RegisterRepresentativeRequest {
  name: string;
  email: string;
  phone: string;
  password: string;
  document_number?: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body: RegisterRepresentativeRequest = await req.json();
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    const phone = body.phone?.trim();
    const password = body.password ?? "";
    const documentNumber = body.document_number?.replace(/\D/g, "") || null;

    if (!name || !email || !phone || !password) {
      return new Response(JSON.stringify({ error: "Preencha todos os campos obrigatórios." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ error: "Digite um e-mail válido." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (password.length < 6) {
      return new Response(JSON.stringify({ error: "A senha deve ter pelo menos 6 caracteres." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Checagem de e-mail existente no Auth.
    const { data: existingUsers, error: listUsersError } = await supabaseAdmin.auth.admin.listUsers();
    if (listUsersError) {
      console.error("[register-representative] Error listing users:", listUsersError);
      return new Response(JSON.stringify({ error: "Erro ao validar disponibilidade do e-mail." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const existingUser = existingUsers?.users?.find((user: { email?: string }) => user.email?.toLowerCase() === email);

    // Variável que indica se estamos reutilizando conta existente (frontend precisará orientar login).
    let reusedAccount = false;
    let userId: string;

    if (existingUser) {
      // Conta já existe — verificar se já é representante antes de reutilizar.
      const { data: existingRep, error: repCheckError } = await supabaseAdmin
        .from("representatives")
        .select("id")
        .eq("user_id", existingUser.id)
        .maybeSingle();

      if (repCheckError) {
        console.error("[register-representative] Error checking existing representative:", repCheckError);
        return new Response(JSON.stringify({ error: "Erro ao verificar cadastro existente." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (existingRep) {
        // Já é representante — bloquear com mensagem específica.
        return new Response(
          JSON.stringify({
            error: "Este e-mail já possui cadastro como representante. Faça login para acessar seu painel.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Reutilizar conta existente — não criar novo auth user.
      userId = existingUser.id;
      reusedAccount = true;
      console.log("[register-representative] Reusing existing auth account for representative", {
        user_id: userId,
        email,
      });
    } else {
      // Conta nova — criar auth user normalmente.
      const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name,
          user_type: "representative",
        },
      });

      if (createUserError || !createdUser?.user) {
        console.error("[register-representative] Error creating auth user:", createUserError);
        return new Response(JSON.stringify({ error: createUserError?.message || "Erro ao criar usuário." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      userId = createdUser.user.id;
    }

    // Registro oficial em representatives vinculado por user_id.
    // representative_code e referral_link são garantidos por trigger no banco.
    const { data: representative, error: representativeError } = await supabaseAdmin
      .from("representatives")
      .insert({
        user_id: userId,
        name,
        email,
        phone,
        document_number: documentNumber,
        status: "ativo",
      })
      .select("id, representative_code, referral_link")
      .single();

    if (representativeError || !representative) {
      console.error("[register-representative] Error creating representative profile:", representativeError);
      // Se a conta foi criada nesta requisição (não reutilizada), removemos para evitar "meio criado".
      if (!reusedAccount) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      }
      return new Response(JSON.stringify({ error: "Não foi possível criar seu perfil de representante." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Atualiza perfil com nome/telefone para manter consistência com o fluxo de sessão.
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        name,
        phone,
      })
      .eq("id", userId);

    if (profileError) {
      console.error("[register-representative] Error updating profile:", profileError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        representative_id: representative.id,
        representative_code: representative.representative_code,
        referral_link: representative.referral_link,
        // Flag para o frontend saber que precisa orientar login em vez de auto-login.
        reused_account: reusedAccount,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[register-representative] Unexpected error:", error);
    return new Response(JSON.stringify({ error: "Erro inesperado ao criar conta de representante." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
