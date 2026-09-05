// @ts-nocheck — arquivo Deno (edge function).
/* eslint-disable @typescript-eslint/no-explicit-any */
// Callback OAuth do PagBank Connect. Valida state (opaco, uso único, expiração),
// troca o code por tokens, grava cifrado e redireciona para /admin/empresa.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { logPaymentTrace } from "../_shared/payment-observability.ts";
import { PAGBANK_API_BASE_URLS, PAGBANK_CONNECT_SCOPES } from "../_shared/pagbank/core.ts";
import { encryptSecret } from "../_shared/pagbank/crypto.ts";
import { pagbankSecretNames } from "../_shared/pagbank/credentials.ts";

function adminRedirect(result: string, detail?: string) {
  const base = Deno.env.get("PAGBANK_ADMIN_RETURN_URL") ?? "https://www.smartbus.com.br/admin/empresa";
  const url = new URL(base);
  url.searchParams.set("pagbank", result);
  if (detail) url.searchParams.set("detail", detail.slice(0, 80));
  return Response.redirect(url.toString(), 302);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  if (!state) return adminRedirect("error", "missing_state");

  const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  // State: uso único e não expirado (marcação atômica).
  const { data: stateRow } = await supabaseAdmin
    .from("pagbank_connect_states")
    .update({ used_at: new Date().toISOString() })
    .eq("state", state)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("company_id, environment, user_id")
    .maybeSingle();
  if (!stateRow) return adminRedirect("error", "state_invalid_or_expired");
  if (oauthError || !code) return adminRedirect("denied", oauthError ?? "no_code");

  const environment = stateRow.environment as "sandbox" | "production";
  if (environment !== "sandbox") return adminRedirect("error", "environment_not_allowed");
  const names = pagbankSecretNames(environment);
  const clientId = Deno.env.get(names.clientId);
  const clientSecret = Deno.env.get(names.clientSecret);
  if (!clientId || !clientSecret) return adminRedirect("error", "connect_not_configured");

  const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pagbank-connect-callback`;
  const tokenRes = await fetch(`${PAGBANK_API_BASE_URLS[environment]}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", X_CLIENT_ID: clientId, X_CLIENT_SECRET: clientSecret },
    body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  }).catch(() => null);
  const tokenBody = tokenRes ? await tokenRes.json().catch(() => null) : null;
  if (!tokenRes?.ok || typeof tokenBody?.access_token !== "string") {
    logPaymentTrace("warn", "pagbank-connect-callback", "token_exchange_failed", {
      company_id: stateRow.company_id, http_status: tokenRes?.status ?? null,
    });
    return adminRedirect("error", `token_exchange_${tokenRes?.status ?? "network"}`);
  }

  const accountId = typeof tokenBody.account_id === "string" ? tokenBody.account_id : null;
  const now = new Date().toISOString();
  await supabaseAdmin.from("payment_gateway_connections")
    .update({ is_current: false, revoked_at: now, status: "revoked" })
    .eq("company_id", stateRow.company_id).eq("gateway", "pagbank").eq("environment", environment).eq("is_current", true);
  const { error } = await supabaseAdmin.from("payment_gateway_connections").insert({
    company_id: stateRow.company_id, gateway: "pagbank", environment, status: "connected", credential_mode: "connect_oauth",
    external_account_id: accountId,
    access_token_enc: await encryptSecret(tokenBody.access_token),
    refresh_token_enc: typeof tokenBody.refresh_token === "string" ? await encryptSecret(tokenBody.refresh_token) : null,
    token_expires_at: typeof tokenBody.expires_in === "number" ? new Date(Date.now() + tokenBody.expires_in * 1000).toISOString() : null,
    scopes: typeof tokenBody.scope === "string" ? tokenBody.scope.split(/\s+/) : PAGBANK_CONNECT_SCOPES,
    // pix_ready só após conta identificada; sem account_id o split não pode ser montado.
    pix_ready: Boolean(accountId), last_validated_at: now, connected_at: now, is_current: true, credential_generation: 1,
    last_error: accountId ? null : "account_id_missing_in_token_response",
  });
  if (error) return adminRedirect("error", "persist_failed");
  logPaymentTrace("info", "pagbank-connect-callback", "connected", { company_id: stateRow.company_id, has_account: Boolean(accountId) });
  return adminRedirect(accountId ? "connected" : "connected_without_account");
});
