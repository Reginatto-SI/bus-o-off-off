// @ts-nocheck — arquivo Deno (edge function).
/* eslint-disable @typescript-eslint/no-explicit-any */
// Aplicação Connect da PLATAFORMA SmartBus na API oficial do PagBank (Sandbox).
// Ações: inspect (consulta a aplicação já registrada) | create (cria uma única
// aplicação da plataforma). Não pertence a nenhuma empresa vendedora, não cria
// cobrança, não autoriza vendedor e nunca devolve token ou client_secret.
//
// Autenticação: admin autenticado da plataforma OU service role (operação
// interna). Segredos só existem no ambiente do backend.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { logPaymentTrace } from "../_shared/payment-observability.ts";
import { PagbankError, assertPagbankEnvironmentAllowed } from "../_shared/pagbank/core.ts";
import { pagbankRequest } from "../_shared/pagbank/client.ts";
import { encryptSecret } from "../_shared/pagbank/crypto.ts";
import { loadCurrentPlatformApplication } from "../_shared/pagbank/credentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const ENVIRONMENT = "sandbox" as const; // Produção PagBank continua bloqueada.
const PLATFORM_TOKEN_SECRET = "PAGBANK_SMARTBUS_TOKEN_SANDBOX";
const APPLICATION_NAME = "SmartBus";
const APPLICATION_SITE = "https://smartbus.com.br";
// URL direta (sem redirecionamento): o PagBank recusa logo que não responda 200.
// Logo oficial redimensionada para o limite documentado (mínimo 220x80,
// máximo 440x160) e servida em URL direta, sem redirecionamento.
const APPLICATION_LOGO = "https://www.smartbus.com.br/platform/smartbus-logo-connect.png";

const APPLICATION_DESCRIPTION =
  "SmartBus é uma plataforma de venda e gestão de passagens de ônibus para empresas de transporte, excursões e caravanas.";

/** Retorno estável do Connect Authorization: função de callback já existente. */
function platformRedirectUri(): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/pagbank-connect-callback`;
}

/** Só campos não secretos. Nunca client_secret, nunca token. */
function publicApplication(data: any) {
  if (!data) return null;
  return {
    client_id: data.client_id ?? data.clientId ?? null,
    account_id: data.account_id ?? data.accountId ?? null,
    name: data.name ?? null,
    site: data.site ?? null,
    description: data.description ?? null,
    redirect_uri: data.redirect_uri ?? data.redirectUri ?? null,
    scopes: data.scopes ?? null,
    status: data.status ?? null,
    created_at: data.created_at ?? null,
    client_secret_returned: Boolean(data.client_secret ?? data.clientSecret),
    returned_field_names: Object.keys(data).sort(),
  };
}

async function isAuthorized(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceRoleKey && token === serviceRoleKey) return true;
  const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);
  const { data: userData } = await supabaseAdmin.auth.getUser(token);
  if (!userData?.user) return false;
  const { data: isAdmin } = await supabaseAdmin.rpc("is_admin", { _user_id: userData.user.id });
  return Boolean(isAdmin);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!(await isAuthorized(req))) return json({ error: "Unauthorized" }, 401);
    assertPagbankEnvironmentAllowed(ENVIRONMENT);

    const platformToken = Deno.env.get(PLATFORM_TOKEN_SECRET)?.trim();
    if (!platformToken) {
      throw new PagbankError(
        "pagbank_configuration_missing",
        "Token Sandbox da conta SmartBus não configurado no backend.",
        409,
        { missing: [PLATFORM_TOKEN_SECRET] },
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "inspect");
    const registered = await loadCurrentPlatformApplication(supabaseAdmin, ENVIRONMENT).catch(() => null);
    const knownClientId =
      (typeof body?.client_id === "string" ? body.client_id : registered?.client_id ?? Deno.env.get("PAGBANK_CLIENT_ID_SANDBOX"))?.trim() || null;
    const registryState = registered
      ? {
          client_id: registered.client_id,
          account_id: registered.account_id,
          redirect_uri: registered.redirect_uri,
          status: registered.status,
          client_secret_stored: Boolean(registered.client_secret_enc),
          created_at: registered.created_at,
        }
      : null;

    if (action === "inspect") {
      if (!knownClientId) {
        return json({
          environment: ENVIRONMENT,
          existing_application: null,
          reason: "no_client_id_registered",
          redirect_uri: platformRedirectUri(),
        });
      }
      const res = await pagbankRequest({
        environment: ENVIRONMENT,
        accessToken: platformToken,
        method: "GET",
        path: `/oauth2/application/${encodeURIComponent(knownClientId)}`,
      });
      logPaymentTrace("info", "pagbank-platform-application", "inspect", { status: res.status, ok: res.ok });
      return json({
        environment: ENVIRONMENT,
        http_status: res.status,
        ok: res.ok,
        indeterminate: res.indeterminate,
        error_messages: res.errorMessages,
        existing_application: res.ok ? publicApplication(res.data) : null,
        registry: registryState,
        redirect_uri: platformRedirectUri(),
      }, res.ok ? 200 : 409);
    }

    if (action === "create") {
      // `replace_reason` autoriza criar uma nova aplicação e abandonar a atual
      // (ex.: client_secret da primeira não pôde ser preservado).
      const replaceReason = typeof body?.replace_reason === "string" ? body.replace_reason.slice(0, 200) : null;
      // Evita duplicidade: se já há client_id registrado e consultável, não cria.
      if (knownClientId && !replaceReason) {
        const existing = await pagbankRequest({
          environment: ENVIRONMENT,
          accessToken: platformToken,
          method: "GET",
          path: `/oauth2/application/${encodeURIComponent(knownClientId)}`,
        });
        if (existing.ok) {
          return json({
            environment: ENVIRONMENT,
            created: false,
            reason: "application_already_exists",
            existing_application: publicApplication(existing.data),
            redirect_uri: platformRedirectUri(),
          });
        }
      }

      const payload = {
        name: APPLICATION_NAME,
        description: APPLICATION_DESCRIPTION,
        site: APPLICATION_SITE,
        logo: APPLICATION_LOGO,
        redirect_uri: platformRedirectUri(),
        // A especificação oficial atual de criação de aplicação não possui campo
        // `scopes`; os escopos são pedidos no Connect Authorization.

      };
      const res = await pagbankRequest({
        environment: ENVIRONMENT,
        accessToken: platformToken,
        method: "POST",
        path: "/oauth2/application",
        body: payload,
      });
      logPaymentTrace(res.ok ? "info" : "error", "pagbank-platform-application", "create", {
        status: res.status, ok: res.ok, indeterminate: res.indeterminate,
      });
      if (!res.ok) {
        return json({
          environment: ENVIRONMENT,
          created: false,
          http_status: res.status,
          indeterminate: res.indeterminate,
          error_messages: res.errorMessages,
          sent_fields: Object.keys(payload).sort(),
          redirect_uri: platformRedirectUri(),
        }, 409);
      }

      const created = publicApplication(res.data);
      // Captura imediata do client_secret: só existe nesta resposta. Gravado
      // exclusivamente cifrado (AES-256-GCM, chave de backend) e nunca devolvido.
      const rawSecret = (res.data as any)?.client_secret ?? (res.data as any)?.clientSecret ?? null;
      let secretStored = false;
      let storageError: string | null = null;
      if (created?.client_id) {
        try {
          if (registered?.client_id && registered.client_id !== created.client_id) {
            await supabaseAdmin
              .from("payment_platform_applications")
              .update({
                is_current: false,
                status: "abandoned",
                abandoned_reason: replaceReason ?? "substituida_por_nova_aplicacao",
                client_secret_enc: null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", registered.id);
          }
          const { error: insertError } = await supabaseAdmin.from("payment_platform_applications").insert({
            gateway: "pagbank",
            environment: ENVIRONMENT,
            client_id: created.client_id,
            account_id: created.account_id,
            name: created.name ?? APPLICATION_NAME,
            site: created.site ?? APPLICATION_SITE,
            redirect_uri: created.redirect_uri ?? platformRedirectUri(),
            client_secret_enc: typeof rawSecret === "string" && rawSecret ? await encryptSecret(rawSecret) : null,
            status: "active",
            is_current: true,
          });
          if (insertError) storageError = "persist_failed";
          else secretStored = typeof rawSecret === "string" && Boolean(rawSecret);
        } catch (_e) {
          storageError = "persist_failed";
        }
      }
      logPaymentTrace(storageError ? "error" : "info", "pagbank-platform-application", "create_persist", {
        secret_stored: secretStored, storage_error: storageError,
      });
      let validation: Record<string, unknown> | null = null;
      if (created?.client_id) {
        const check = await pagbankRequest({
          environment: ENVIRONMENT,
          accessToken: platformToken,
          method: "GET",
          path: `/oauth2/application/${encodeURIComponent(created.client_id)}`,
        });
        validation = { http_status: check.status, ok: check.ok, application: check.ok ? publicApplication(check.data) : null, error_messages: check.errorMessages };
      }
      return json({
        environment: ENVIRONMENT,
        created: true,
        http_status: res.status,
        application: created,
        validation,
        client_secret_stored: secretStored,
        client_secret_storage_error: storageError,
        abandoned_previous_client_id: registered?.client_id && registered.client_id !== created?.client_id ? registered.client_id : null,
        redirect_uri: platformRedirectUri(),
      });
    }

    if (action === "abandon") {
      const target = typeof body?.client_id === "string" ? body.client_id.trim() : null;
      if (!target) return json({ error: "client_id_required" }, 400);
      const { error } = await supabaseAdmin
        .from("payment_platform_applications")
        .update({
          is_current: false,
          status: "abandoned",
          abandoned_reason: typeof body?.reason === "string" ? body.reason.slice(0, 200) : "abandonada_manualmente",
          client_secret_enc: null,
          updated_at: new Date().toISOString(),
        })
        .eq("gateway", "pagbank")
        .eq("environment", ENVIRONMENT)
        .eq("client_id", target);
      if (error) return json({ error: "abandon_failed" }, 409);
      return json({ environment: ENVIRONMENT, abandoned_client_id: target });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    if (error instanceof PagbankError) {
      return json({ error: error.publicMessage, error_code: error.code, detail: error.detail ?? null }, error.httpStatus);
    }
    logPaymentTrace("error", "pagbank-platform-application", "unhandled", {
      message: error instanceof Error ? error.message : String(error),
    });
    return json({ error: "internal_error" }, 500);
  }
});
