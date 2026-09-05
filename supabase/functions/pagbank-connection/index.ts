// @ts-nocheck — arquivo Deno (edge function).
/* eslint-disable @typescript-eslint/no-explicit-any */
// Administração da conexão PagBank por empresa (autenticado, admin da empresa).
// Ações: status | save_sandbox_token | connect_start | disconnect | set_gateway.
// Nunca retorna tokens; apenas status, conta mascarada e diagnóstico.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { logPaymentTrace } from "../_shared/payment-observability.ts";
import {
  PAGBANK_ALLOWED_ENVIRONMENTS,
  PAGBANK_CONNECT_AUTHORIZE_URLS,
  PAGBANK_CONNECT_SCOPES,
  PagbankError,
  assertPagbankEnvironmentAllowed,
  maskIdentifier,
} from "../_shared/pagbank/core.ts";
import { probePagbankToken } from "../_shared/pagbank/client.ts";
import { encryptSecret, isEncryptionConfigured } from "../_shared/pagbank/crypto.ts";
import { loadCurrentConnection, missingPagbankSecrets, pagbankSecretNames } from "../_shared/pagbank/credentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function publicConnection(c: any) {
  if (!c) return null;
  return {
    id: c.id,
    environment: c.environment,
    status: c.status,
    credential_mode: c.credential_mode,
    account_masked: maskIdentifier(c.external_account_email ?? c.external_account_id),
    pix_ready: c.pix_ready,
    last_validated_at: c.last_validated_at,
    last_error: c.last_error,
    connected_at: c.connected_at,
    token_expires_at: c.token_expires_at,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(authHeader.slice(7));
    if (userError || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "status");
    const companyId = typeof body?.company_id === "string" ? body.company_id : null;
    if (!companyId) return json({ error: "company_id is required" }, 400);

    const [{ data: isAdmin }, { data: belongs }] = await Promise.all([
      supabaseAdmin.rpc("is_admin", { _user_id: userId }),
      supabaseAdmin.rpc("user_belongs_to_company", { _user_id: userId, _company_id: companyId }),
    ]);
    if (!isAdmin || !belongs) return json({ error: "Forbidden" }, 403);

    const { data: company } = await supabaseAdmin
      .from("companies").select("id, name, payment_gateway, payment_environment").eq("id", companyId).single();
    if (!company) return json({ error: "company_not_found" }, 404);

    const environment = "sandbox" as const; // Produção PagBank bloqueada nesta fase.
    const missing = missingPagbankSecrets(environment);

    if (action === "status") {
      const connection = await loadCurrentConnection(supabaseAdmin, { companyId, environment });
      return json({
        company_gateway: company.payment_gateway,
        company_environment: company.payment_environment,
        allowed_environments: PAGBANK_ALLOWED_ENVIRONMENTS,
        connection: publicConnection(connection),
        platform_ready: {
          connect: missing.connect.length === 0,
          split: missing.split.length === 0,
          webhook: missing.webhook.length === 0,
          encryption: missing.encryption.length === 0,
          missing_secret_names: [...missing.connect, ...missing.split, ...missing.webhook, ...missing.encryption],
        },
      });
    }

    if (action === "set_gateway") {
      const gateway = body?.gateway === "pagbank" ? "pagbank" : body?.gateway === "asaas" ? "asaas" : null;
      if (!gateway) return json({ error: "gateway inválido" }, 400);
      if (gateway === "pagbank") {
        if (company.payment_environment !== "sandbox") {
          return json({ error: "PagBank está disponível apenas em Sandbox nesta fase. Ajuste o ambiente da empresa para Sandbox antes.", error_code: "pagbank_environment_not_allowed" }, 409);
        }
        const connection = await loadCurrentConnection(supabaseAdmin, { companyId, environment });
        if (!connection || connection.status !== "connected" || !connection.pix_ready) {
          return json({ error: "Conecte e valide a conta PagBank antes de ativá-la para novas vendas.", error_code: "pagbank_connection_not_operational" }, 409);
        }
      }
      const { error } = await supabaseAdmin.from("companies").update({ payment_gateway: gateway }).eq("id", companyId);
      if (error) return json({ error: error.message }, 500);
      logPaymentTrace("info", "pagbank-connection", "company_gateway_changed", { company_id: companyId, gateway, user_id: userId });
      return json({ ok: true, company_gateway: gateway });
    }

    if (action === "save_sandbox_token") {
      assertPagbankEnvironmentAllowed(environment);
      if (!isEncryptionConfigured()) throw new PagbankError("pagbank_configuration_missing", "Chave de criptografia não configurada.", 409);
      const token = typeof body?.token === "string" ? body.token.trim() : "";
      const accountId = typeof body?.account_id === "string" ? body.account_id.trim() : "";
      if (token.length < 20) return json({ error: "Token Sandbox inválido." }, 400);
      if (!accountId) return json({ error: "Informe o ID da conta PagBank (recebedor) do Sandbox." }, 400);

      // Validação sem efeito financeiro.
      const probe = await probePagbankToken({ environment, accessToken: token });
      if (!probe.ok) {
        const reason = probe.status === 401 || probe.status === 403 ? "token_rejected" : probe.indeterminate ? "pagbank_unreachable" : `http_${probe.status}`;
        return json({ error: "O PagBank não aceitou este token.", error_code: "pagbank_auth_failed", reason }, 409);
      }
      const now = new Date().toISOString();
      // Substitui conexão corrente (nova identidade lógica; vendas antigas mantêm a anterior).
      await supabaseAdmin.from("payment_gateway_connections")
        .update({ is_current: false, revoked_at: now, status: "revoked" })
        .eq("company_id", companyId).eq("gateway", "pagbank").eq("environment", environment).eq("is_current", true);
      const { data: created, error } = await supabaseAdmin.from("payment_gateway_connections").insert({
        company_id: companyId, gateway: "pagbank", environment, status: "connected", credential_mode: "sandbox_manual_token",
        external_account_id: accountId, access_token_enc: await encryptSecret(token), scopes: PAGBANK_CONNECT_SCOPES,
        pix_ready: true, last_validated_at: now, connected_at: now, is_current: true, credential_generation: 1,
      }).select("*").single();
      if (error) return json({ error: error.message }, 500);
      logPaymentTrace("info", "pagbank-connection", "sandbox_token_saved", { company_id: companyId, connection_id: created.id });
      return json({ ok: true, connection: publicConnection(created) });
    }

    if (action === "connect_start") {
      assertPagbankEnvironmentAllowed(environment);
      if (missing.connect.length > 0 || missing.encryption.length > 0) {
        throw new PagbankError("pagbank_configuration_missing", "Connect PagBank ainda não configurado na plataforma.", 409, { missing: [...missing.connect, ...missing.encryption] });
      }
      const state = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const { error } = await supabaseAdmin.from("pagbank_connect_states").insert({
        state, company_id: companyId, environment, user_id: userId, expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      if (error) return json({ error: error.message }, 500);
      const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pagbank-connect-callback`;
      const url = new URL(PAGBANK_CONNECT_AUTHORIZE_URLS[environment]);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", Deno.env.get(pagbankSecretNames(environment).clientId) ?? "");
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("scope", PAGBANK_CONNECT_SCOPES.join(" "));
      url.searchParams.set("state", state);
      return json({ ok: true, authorize_url: url.toString(), expires_in_seconds: 600 });
    }

    if (action === "disconnect") {
      const now = new Date().toISOString();
      await supabaseAdmin.from("payment_gateway_connections")
        .update({ is_current: false, revoked_at: now, status: "revoked", pix_ready: false })
        .eq("company_id", companyId).eq("gateway", "pagbank").eq("environment", environment).eq("is_current", true);
      if (company.payment_gateway === "pagbank") {
        await supabaseAdmin.from("companies").update({ payment_gateway: "asaas" }).eq("id", companyId);
      }
      return json({ ok: true, company_gateway: company.payment_gateway === "pagbank" ? "asaas" : company.payment_gateway });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    if (error instanceof PagbankError) return json({ error: error.publicMessage, error_code: error.code, detail: error.detail ?? null }, error.httpStatus);
    logPaymentTrace("error", "pagbank-connection", "unhandled", { message: error instanceof Error ? error.message : String(error) });
    return json({ error: "internal_error" }, 500);
  }
});
