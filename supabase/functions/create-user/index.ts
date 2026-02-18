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

    // Validate JWT using getClaims (compatible with signing-keys)
    const token = authHeader.replace("Bearer ", "");
    const supabasePublicKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseUser = createClient(supabaseUrl, supabasePublicKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      console.error("getClaims error:", claimsError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const requestingUser = { id: claimsData.claims.sub as string };

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
          user_id: existingUser.id 
        }),
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

    const { error: profileUpdateError } = await supabaseAdmin
      .from("profiles")
      .update({
        name,
        status,
        notes,
        company_id,
      })
      .eq("id", newUser.user.id);

    if (profileUpdateError) {
      console.error("Error updating profile:", profileUpdateError);
      // Don't fail the request, profile was created by trigger
    }

    // Update the user_role created by trigger with the correct role and links
    const { error: roleUpdateError } = await supabaseAdmin
      .from("user_roles")
      .update({
        role,
        seller_id: role === "vendedor" ? seller_id : null,
        driver_id: role === "motorista" ? driver_id : null,
      })
      .eq("user_id", newUser.user.id)
      .eq("company_id", company_id);

    if (roleUpdateError) {
      console.error("Error updating role:", roleUpdateError);
      // Try to insert if update failed (trigger might not have created it)
      await supabaseAdmin
        .from("user_roles")
        .insert({
          user_id: newUser.user.id,
          company_id,
          role,
          seller_id: role === "vendedor" ? seller_id : null,
          driver_id: role === "motorista" ? driver_id : null,
        });
    }

    // Send password reset email so user can set their own password
    const { error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    if (resetError) {
      console.error("Error sending reset email:", resetError);
      // Don't fail, user can use forgot password later
    }

    // Alternatively, send magic link for first login
    await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Usuário criado com sucesso",
        user_id: newUser.user.id 
      }),
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
