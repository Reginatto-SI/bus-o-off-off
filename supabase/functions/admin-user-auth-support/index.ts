import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SupportAction = "get_auth_status" | "send_recovery" | "resend_confirmation" | "generate_magic_link";

interface AdminUserAuthSupportRequest {
  action: SupportAction;
  target_user_id: string;
  company_id: string;
}

interface StandardResponse {
  success: boolean;
  action: SupportAction;
  message: string;
  data?: Record<string, unknown>;
}

function jsonResponse(payload: StandardResponse | { error: string }, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function decodeJwtSub(token: string): string | null {
  try {
    const payloadBase64 = token.split(".")[1];
    const payload = JSON.parse(atob(payloadBase64));
    return payload?.sub ?? null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const requesterUserId = decodeJwtSub(token);
    if (!requesterUserId) {
      return jsonResponse({ error: "Invalid token" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body: AdminUserAuthSupportRequest = await req.json();
    const { action, target_user_id, company_id } = body;

    if (!action || !target_user_id || !company_id) {
      return jsonResponse({ error: "Missing required fields: action, target_user_id, company_id" }, 400);
    }

    const allowedActions: SupportAction[] = [
      "get_auth_status",
      "send_recovery",
      "resend_confirmation",
      "generate_magic_link",
    ];

    if (!allowedActions.includes(action)) {
      return jsonResponse({ error: "Invalid action" }, 400);
    }

    const { data: requesterRoles, error: requesterRolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role, company_id")
      .eq("user_id", requesterUserId);

    if (requesterRolesError || !requesterRoles?.length) {
      console.error("[admin-user-auth-support] requester role check failed", {
        requesterUserId,
        requesterRolesError,
      });
      return jsonResponse({ error: "Requester has no roles" }, 403);
    }

    const isDeveloper = requesterRoles.some((r: { role: string }) => r.role === "developer");
    const isGerente = requesterRoles.some((r: { role: string }) => r.role === "gerente");

    // Regra restritiva: somente gerente/developer.
    if (!isDeveloper && !isGerente) {
      return jsonResponse({ error: "Only gerentes or developers can execute this action" }, 403);
    }

    // Multiempresa obrigatório: gerente só atua na empresa à qual pertence.
    // Developer mantém bypass existente no projeto para suporte global.
    const requesterBelongsToCompany = requesterRoles.some(
      (r: { company_id: string | null }) => r.company_id === company_id,
    );
    if (!isDeveloper && !requesterBelongsToCompany) {
      return jsonResponse({ error: "Requester does not belong to the target company" }, 403);
    }

    // Validação alvo: impedir operações em usuário fora do escopo da empresa alvo.
    const { data: targetRole, error: targetRoleError } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", target_user_id)
      .eq("company_id", company_id)
      .maybeSingle();

    if (targetRoleError) {
      console.error("[admin-user-auth-support] target scope check failed", {
        target_user_id,
        company_id,
        targetRoleError,
      });
      return jsonResponse({ error: "Failed to validate target user company scope" }, 500);
    }

    if (!targetRole) {
      return jsonResponse({ error: "Target user is not linked to the provided company" }, 403);
    }

    const { data: targetAuth, error: targetAuthError } = await supabaseAdmin.auth.admin.getUserById(target_user_id);
    if (targetAuthError || !targetAuth?.user) {
      console.error("[admin-user-auth-support] target auth lookup failed", {
        target_user_id,
        targetAuthError,
      });
      return jsonResponse({ error: "Target auth user not found" }, 404);
    }

    const targetUser = targetAuth.user;

    if (action === "get_auth_status") {
      const { data: lastEmailEvent, error: emailLogError } = await supabaseAdmin
        .from("email_send_log")
        .select("status, template_name, error_message, created_at")
        .eq("recipient_email", targetUser.email ?? "")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (emailLogError) {
        console.error("[admin-user-auth-support] email log lookup failed", {
          target_user_id,
          email: targetUser.email,
          emailLogError,
        });
      }

      return jsonResponse({
        success: true,
        action,
        message: "Status de autenticação carregado com sucesso",
        data: {
          user_id: targetUser.id,
          email: targetUser.email,
          email_confirmed: Boolean(targetUser.email_confirmed_at),
          email_confirmed_at: targetUser.email_confirmed_at ?? null,
          auth_created_at: targetUser.created_at ?? null,
          last_sign_in_at: targetUser.last_sign_in_at ?? null,
          last_email_event: lastEmailEvent
            ? {
                status: lastEmailEvent.status,
                template_name: lastEmailEvent.template_name,
                error_message: lastEmailEvent.error_message,
                created_at: lastEmailEvent.created_at,
              }
            : null,
          email_event_unavailable: Boolean(emailLogError),
        },
      });
    }

    if (action === "send_recovery") {
      const { error: recoveryError } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: targetUser.email ?? "",
      });

      if (recoveryError) {
        console.error("[admin-user-auth-support] send_recovery failed", {
          target_user_id,
          email: targetUser.email,
          recoveryError,
        });
        return jsonResponse({ error: `Falha ao enviar redefinição de senha: ${recoveryError.message}` }, 500);
      }

      return jsonResponse({
        success: true,
        action,
        message: "Redefinição de senha enviada com sucesso",
      });
    }

    if (action === "resend_confirmation") {
      if (targetUser.email_confirmed_at) {
        return jsonResponse({
          success: true,
          action,
          message: "Usuário já está com e-mail confirmado",
          data: { already_confirmed: true },
        });
      }

      const { error: confirmationError } = await supabaseAdmin.auth.admin.generateLink({
        type: "signup",
        email: targetUser.email ?? "",
      });

      if (confirmationError) {
        console.error("[admin-user-auth-support] resend_confirmation failed", {
          target_user_id,
          email: targetUser.email,
          confirmationError,
        });
        return jsonResponse({ error: `Falha ao reenviar ativação: ${confirmationError.message}` }, 500);
      }

      return jsonResponse({
        success: true,
        action,
        message: "Ativação reenviada com sucesso",
      });
    }

    if (action === "generate_magic_link") {
      const { data: magicData, error: magicError } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: targetUser.email ?? "",
      });

      if (magicError) {
        console.error("[admin-user-auth-support] generate_magic_link failed", {
          target_user_id,
          email: targetUser.email,
          magicError,
        });
        return jsonResponse({ error: `Falha ao gerar magic link: ${magicError.message}` }, 500);
      }

      // Mantemos retorno mínimo e explícito para evitar dependência de campos não garantidos.
      const actionLink = magicData?.properties?.action_link ?? null;

      return jsonResponse({
        success: true,
        action,
        message: actionLink
          ? "Magic link gerado com sucesso"
          : "Magic link disparado, mas o link não está disponível para cópia neste ambiente",
        data: {
          action_link: actionLink,
          email_otp: magicData?.properties?.email_otp ?? null,
          hashed_token: magicData?.properties?.hashed_token ?? null,
        },
      });
    }

    return jsonResponse({ error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("[admin-user-auth-support] unexpected error", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
