import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { sendAuthEmailViaResend } from "../_shared/auth-email-resend.ts";
import type { AuthEmailType } from "../_shared/auth-email-resend.ts";

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

const DEFAULT_APP_BASE_URL = "https://www.smartbusbr.com.br";
const ADMIN_AUTH_SUPPORT_RUNTIME_VERSION = "2026-03-29-redirect-explicito-v2";

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function resolveAdminAuthRedirectBaseUrl(): string {
  // Regra operacional explícita: links administrativos de auth devem usar
  // o domínio canônico oficial para evitar herança de ambientes legados.
  return DEFAULT_APP_BASE_URL;
}

function resolveRedirectTo(action: SupportAction): string {
  const baseUrl = resolveAdminAuthRedirectBaseUrl();
  const redirectByAction: Record<Exclude<SupportAction, "get_auth_status">, string> = {
    send_recovery: `${baseUrl}/login?flow=recovery`,
    resend_confirmation: `${baseUrl}/login?flow=signup`,
    generate_magic_link: `${baseUrl}/login?flow=magiclink`,
  };

  return redirectByAction[action as Exclude<SupportAction, "get_auth_status">] ?? `${baseUrl}/login`;
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

/** Maps support actions to generateLink type and email type */
const ACTION_EMAIL_MAP: Record<string, { linkType: string; emailType: AuthEmailType }> = {
  send_recovery: { linkType: "recovery", emailType: "recovery" },
  resend_confirmation: { linkType: "signup", emailType: "signup" },
  generate_magic_link: { linkType: "magiclink", emailType: "magiclink" },
};

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

    // ── Authorization ──────────────────────────────────────────────────
    const { data: requesterRoles, error: requesterRolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role, company_id")
      .eq("user_id", requesterUserId);

    if (requesterRolesError || !requesterRoles?.length) {
      return jsonResponse({ error: "Requester has no roles" }, 403);
    }

    const isDeveloper = requesterRoles.some((r: { role: string }) => r.role === "developer");
    const isGerente = requesterRoles.some((r: { role: string }) => r.role === "gerente");

    if (!isDeveloper && !isGerente) {
      return jsonResponse({ error: "Only gerentes or developers can execute this action" }, 403);
    }

    const requesterBelongsToCompany = requesterRoles.some(
      (r: { company_id: string | null }) => r.company_id === company_id,
    );
    if (!isDeveloper && !requesterBelongsToCompany) {
      return jsonResponse({ error: "Requester does not belong to the target company" }, 403);
    }

    // ── Target validation ──────────────────────────────────────────────
    const { data: targetRole, error: targetRoleError } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", target_user_id)
      .eq("company_id", company_id)
      .maybeSingle();

    if (targetRoleError) {
      return jsonResponse({ error: "Failed to validate target user company scope" }, 500);
    }

    if (!targetRole) {
      return jsonResponse({ error: "Target user is not linked to the provided company" }, 403);
    }

    const { data: targetAuth, error: targetAuthError } = await supabaseAdmin.auth.admin.getUserById(target_user_id);
    if (targetAuthError || !targetAuth?.user) {
      return jsonResponse({ error: "Target auth user not found" }, 404);
    }

    const targetUser = targetAuth.user;

    // ── get_auth_status ────────────────────────────────────────────────
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

    // ── send_recovery / resend_confirmation / generate_magic_link ─────
    const emailMapping = ACTION_EMAIL_MAP[action];
    if (!emailMapping) {
      return jsonResponse({ error: "Unsupported action" }, 400);
    }

    // Special case: resend_confirmation when already confirmed
    if (action === "resend_confirmation" && targetUser.email_confirmed_at) {
      return jsonResponse({
        success: true,
        action,
        message: "Usuário já está com e-mail confirmado",
        data: { already_confirmed: true },
      });
    }

    // 1. Generate link
    const redirectTo = resolveRedirectTo(action);
    console.log("[admin-user-auth-support] generateLink redirect resolution", {
      action,
      redirectTo,
      runtime_version: ADMIN_AUTH_SUPPORT_RUNTIME_VERSION,
    });
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: emailMapping.linkType as any,
      email: targetUser.email ?? "",
      options: {
        redirectTo,
      },
    });

    if (linkError) {
      console.error(`[admin-user-auth-support] generateLink failed for ${action}`, {
        target_user_id,
        email: targetUser.email,
        linkError,
      });

      const errorMessages: Record<string, string> = {
        send_recovery: "Erro ao gerar link de recuperação de senha",
        resend_confirmation: "Erro ao gerar link de ativação",
        generate_magic_link: "Erro ao gerar magic link",
      };

      return jsonResponse({ error: `${errorMessages[action]}: ${linkError.message}` }, 500);
    }

    const actionLink = linkData?.properties?.action_link ?? null;

    // 2. Send email via Resend
    if (actionLink) {
      const emailResult = await sendAuthEmailViaResend({
        to: targetUser.email ?? "",
        type: emailMapping.emailType,
        actionLink,
      });

      if (!emailResult.success) {
        console.error(`[admin-user-auth-support] Resend send failed for ${action}`, {
          target_user_id,
          email: targetUser.email,
          error: emailResult.error,
        });

        const failMessages: Record<string, string> = {
          send_recovery: "Erro ao enviar e-mail de recuperação de senha",
          resend_confirmation: "Erro ao enviar e-mail de ativação",
          generate_magic_link: "Erro ao enviar magic link",
        };

        return jsonResponse({
          error: `${failMessages[action]}: ${emailResult.error}`,
        }, 500);
      }

      const successMessages: Record<string, string> = {
        send_recovery: "Redefinição de senha enviada com sucesso",
        resend_confirmation: "Ativação reenviada com sucesso",
        generate_magic_link: "Magic link enviado com sucesso",
      };

      const responseData: Record<string, unknown> = {
        email_sent: true,
        resend_id: emailResult.resendId,
        redirect_to: redirectTo,
        runtime_version: ADMIN_AUTH_SUPPORT_RUNTIME_VERSION,
      };

      // For magic link, also return link data for copy
      if (action === "generate_magic_link") {
        responseData.action_link = actionLink;
        responseData.email_otp = linkData?.properties?.email_otp ?? null;
        responseData.hashed_token = linkData?.properties?.hashed_token ?? null;
      }

      return jsonResponse({
        success: true,
        action,
        message: successMessages[action],
        data: responseData,
      });
    }

    // actionLink not available — link was generated but URL not returned
    const fallbackMessages: Record<string, string> = {
      send_recovery: "Link de recuperação gerado, mas URL não disponível para envio",
      resend_confirmation: "Link de ativação gerado, mas URL não disponível para envio",
      generate_magic_link: "Magic link gerado, mas URL não disponível para envio",
    };

    return jsonResponse({
      success: false,
      action,
      message: fallbackMessages[action],
      data: {
        email_sent: false,
        action_link: null,
      },
    });

  } catch (error) {
    console.error("[admin-user-auth-support] unexpected error", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
