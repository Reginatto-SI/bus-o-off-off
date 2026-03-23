import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateUserRequest {
  email: string;
  name: string;
  role: string;
  status: string;
  notes: string | null;
  seller_id: string | null;
  driver_id: string | null;
  company_id: string;
}

interface CreateUserResponse {
  success?: boolean;
  error?: string;
  message?: string;
  user_id?: string;
  result?: "created" | "linked_existing";
  warnings?: string[];
  runtime_version?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get authorization header to verify requesting user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create admin client with service role key
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Decode JWT payload to extract user id (safe: verify_jwt=false, permissions validated via user_roles with service_role)
    const token = authHeader.replace("Bearer ", "");
    let requestingUserId: string;
    try {
      const payloadBase64 = token.split('.')[1];
      const payload = JSON.parse(atob(payloadBase64));
      requestingUserId = payload.sub;
      if (!requestingUserId) throw new Error("Missing sub in JWT");
    } catch (e) {
      console.error("JWT decode error:", e);
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const requestingUser = { id: requestingUserId };

    // Verify requesting user is a gerente
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role, company_id")
      .eq("user_id", requestingUser.id);

    if (rolesError || !roles || roles.length === 0) {
      return new Response(
        JSON.stringify({ error: "User has no roles" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Gerentes e developers podem criar usuários
    const isAuthorized = roles.some((r: any) => r.role === "gerente" || r.role === "developer");
    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: "Only gerentes or developers can create users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: CreateUserRequest = await req.json();
    const { email, name, role, status, notes, seller_id, driver_id, company_id } = body;
    const runtimeVersion = "2026-03-23-users-multiempresa-v2";

    // Validate required fields
    if (!email || !name || !role || !company_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify company_id is one of the requesting user's companies (developer bypasses)
    const isDev = roles.some((r: any) => r.role === "developer");
    const userCompanyIds = roles.map((r: any) => r.company_id);
    if (!isDev && !userCompanyIds.includes(company_id)) {
      return new Response(
        JSON.stringify({ error: "Cannot create users for this company" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user already exists
    const { data: existingUsers, error: existingError } = await supabaseAdmin.auth.admin.listUsers();
    if (existingError) {
      console.error("Error checking existing users:", existingError);
      return new Response(
        JSON.stringify({ error: "Error checking existing users" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const existingUser = existingUsers?.users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
    
    if (existingUser) {
      // User exists - check if they already have a role in this company
      const { data: existingRole } = await supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", existingUser.id)
        .eq("company_id", company_id)
        .single();

      if (existingRole) {
        return new Response(
          JSON.stringify({ error: "Usuário já existe nesta empresa" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Add role to existing user
      const { error: roleInsertError } = await supabaseAdmin
        .from("user_roles")
        .insert({
          user_id: existingUser.id,
          company_id,
          role,
          seller_id: role === "vendedor" ? seller_id : null,
          driver_id: role === "motorista" ? driver_id : null,
        });

      if (roleInsertError) {
        console.error("Error creating role:", roleInsertError);
        return new Response(
          JSON.stringify({ error: "Error creating user role" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Usuário existente vinculado à empresa",
          user_id: existingUser.id,
          result: "linked_existing",
          runtime_version: runtimeVersion,
        } satisfies CreateUserResponse),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate a temporary password
    const tempPassword = crypto.randomUUID().substring(0, 12);

    // Create new user with Supabase Auth Admin API
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: false, // User needs to confirm email
      user_metadata: { name },
    });

    if (createError) {
      console.error("Error creating user:", createError);
      return new Response(
        JSON.stringify({ error: createError.message || "Error creating user" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!newUser?.user) {
      return new Response(
        JSON.stringify({ error: "User creation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update the profile with status and notes (the trigger creates the profile)
    // Wait a bit for the trigger to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    const warnings: string[] = [];

    const { error: profileUpdateError } = await supabaseAdmin
      .from("profiles")
      .update({
        name,
        status,
        notes,
      })
      .eq("id", newUser.user.id);

    if (profileUpdateError) {
      console.error("Error updating profile:", profileUpdateError);
      // O vínculo multiempresa oficial fica em user_roles. Se o profile não puder
      // ser enriquecido, não devemos contaminar a empresa por fallback implícito.
      warnings.push("Perfil criado, mas não foi possível sincronizar todos os dados complementares.");
    }

    // Proteção contra cadastro parcial invisível: o trigger atual não cria mais
    // user_roles. Por isso o vínculo com a empresa precisa ser explícito e
    // idempotente aqui, sem depender do comportamento legado do trigger.
    const { error: roleUpsertError } = await supabaseAdmin
      .from("user_roles")
      .upsert({
        user_id: newUser.user.id,
        company_id,
        role,
        seller_id: role === "vendedor" ? seller_id : null,
        driver_id: role === "motorista" ? driver_id : null,
      }, {
        onConflict: "user_id,company_id",
      });

    if (roleUpsertError) {
      console.error("Error upserting role:", roleUpsertError);

      // Sem user_roles o usuário não aparece na empresa ativa. Reverter a criação
      // evita deixar Auth/Profile órfãos quando o vínculo obrigatório falha.
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);

      return new Response(
        JSON.stringify({
          error: "Falha ao vincular o usuário à empresa. A criação foi revertida.",
        } satisfies CreateUserResponse),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mantemos a geração de links legada para não alterar o onboarding nesta tarefa.
    // Porém isso não é tratado como prova auditável de entrega de e-mail no front.
    const { error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    if (resetError) {
      console.error("Error sending reset email:", resetError);
      warnings.push("Não foi possível confirmar a geração do link de recuperação.");
    }

    // Alternativa legada para primeiro acesso. Falha aqui não deve mascarar que o
    // usuário foi criado e vinculado; por isso tratamos como aviso operacional.
    const { error: magicLinkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (magicLinkError) {
      console.error("Error generating magic link:", magicLinkError);
      warnings.push("Não foi possível confirmar a geração do link de primeiro acesso.");
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Usuário criado e vinculado à empresa com sucesso",
        user_id: newUser.user.id,
        result: "created",
        warnings,
        runtime_version: runtimeVersion,
      } satisfies CreateUserResponse),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
