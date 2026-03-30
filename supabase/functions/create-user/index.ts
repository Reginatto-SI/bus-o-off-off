import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { sendAuthEmailViaResend } from "../_shared/auth-email-resend.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_APP_BASE_URL = "https://www.smartbusbr.com.br";
const CREATE_USER_RUNTIME_VERSION = "2026-03-29-redirect-resend-v3";

interface CreateUserRequest {
  email: string;
  name: string;
  role: string;
  status: string;
  notes: string | null;
  seller_id: string | null;
  driver_id: string | null;
  operational_role?: "motorista" | "auxiliar_embarque" | null;
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
  redirect_to?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient<any>(supabaseUrl, supabaseServiceKey);

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

    const isAuthorized = roles.some((r: any) => r.role === "gerente" || r.role === "developer");
    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: "Only gerentes or developers can create users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: CreateUserRequest = await req.json();
    const { email, name, role, status, notes, seller_id, driver_id, operational_role, company_id } = body;

    if (!email || !name || !role || !company_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resolvedOperationalRole =
      role === "motorista"
        ? (operational_role === "auxiliar_embarque" ? "auxiliar_embarque" : "motorista")
        : null;

    const isDev = roles.some((r: any) => r.role === "developer");
    const userCompanyIds = roles.map((r: any) => r.company_id);
    if (!isDev && !userCompanyIds.includes(company_id)) {
      return new Response(
        JSON.stringify({ error: "Cannot create users for this company" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

      const { error: roleInsertError } = await supabaseAdmin
        .from("user_roles")
        .insert({
          user_id: existingUser.id,
          company_id,
          role,
          seller_id: role === "vendedor" ? seller_id : null,
          driver_id: role === "motorista" ? driver_id : null,
          operational_role: resolvedOperationalRole,
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
          runtime_version: CREATE_USER_RUNTIME_VERSION,
        } satisfies CreateUserResponse),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tempPassword = crypto.randomUUID().substring(0, 12);

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: false,
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

    await new Promise(resolve => setTimeout(resolve, 500));

    const warnings: string[] = [];

    const { error: profileUpdateError } = await supabaseAdmin
      .from("profiles")
      .update({ name, status, notes })
      .eq("id", newUser.user.id);

    if (profileUpdateError) {
      console.error("Error updating profile:", profileUpdateError);
      warnings.push("Perfil criado, mas não foi possível sincronizar todos os dados complementares.");
    }

    const { error: roleUpsertError } = await supabaseAdmin
      .from("user_roles")
      .upsert({
        user_id: newUser.user.id,
        company_id,
        role,
        seller_id: role === "vendedor" ? seller_id : null,
        driver_id: role === "motorista" ? driver_id : null,
        operational_role: resolvedOperationalRole,
      }, {
        onConflict: "user_id,company_id",
      });

    if (roleUpsertError) {
      console.error("Error upserting role:", roleUpsertError);
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      return new Response(
        JSON.stringify({
          error: "Falha ao vincular o usuário à empresa. A criação foi revertida.",
        } satisfies CreateUserResponse),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Gerar link de ativação e enviar via Resend
    const signupRedirectTo = `${DEFAULT_APP_BASE_URL}/login?flow=signup`;
    console.log("[create-user] generateLink redirect resolution", {
      redirectTo: signupRedirectTo,
      runtime_version: CREATE_USER_RUNTIME_VERSION,
    });

    const { data: signupLinkData, error: signupLinkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "signup",
      email,
      password: tempPassword,
      options: {
        redirectTo: signupRedirectTo,
      },
    });

    if (signupLinkError || !signupLinkData?.properties?.action_link) {
      console.error("Error generating signup link:", signupLinkError);
      warnings.push("Não foi possível gerar o link de ativação do e-mail.");
    } else {
      const emailResult = await sendAuthEmailViaResend({
        to: email,
        type: "signup",
        actionLink: signupLinkData.properties.action_link,
        userName: name,
      });

      if (!emailResult.success) {
        console.error("Error sending signup email via Resend:", emailResult.error);
        warnings.push(`Não foi possível enviar o e-mail de ativação: ${emailResult.error}`);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Usuário criado e vinculado à empresa com sucesso",
        user_id: newUser.user.id,
        result: "created",
        warnings,
        runtime_version: CREATE_USER_RUNTIME_VERSION,
        redirect_to: signupRedirectTo,
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
