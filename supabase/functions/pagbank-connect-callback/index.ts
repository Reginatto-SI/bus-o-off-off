// @ts-nocheck — arquivo Deno (edge function).
/* eslint-disable @typescript-eslint/no-explicit-any */
// Callback OAuth do PagBank Connect. Valida state (opaco, uso único, expiração),
// troca o code por tokens, grava cifrado e redireciona para /admin/empresa.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { logPaymentTrace } from "../_shared/payment-observability.ts";
import { PAGBANK_API_BASE_URLS, PAGBANK_CONNECT_SCOPES } from "../_shared/pagbank/core.ts";
import { encryptSecret } from "../_shared/pagbank/crypto.ts";
import { resolvePlatformConnectCredentials, resolvePlatformAccessToken, pagbankSecretNames } from "../_shared/pagbank/credentials.ts";

// Rota de retorno desta autorização: a própria configuração de pagamentos.
// Caminho fixo no código; somente a ORIGEM vem do state gravado no início.
const RETURN_PATH = "/admin/empresa";
const RETURN_QUERY = { tab: "pagamentos" } as const;

function adminRedirect(result: string, detail?: string, returnOrigin?: string | null) {
  const base = Deno.env.get("PAGBANK_ADMIN_RETURN_URL") ?? "https://www.smartbus.com.br/admin/empresa";
  let url: URL;
  try {
    url = returnOrigin ? new URL(RETURN_PATH, returnOrigin) : new URL(base);
  } catch {
    url = new URL(base);
  }
  for (const [key, value] of Object.entries(RETURN_QUERY)) url.searchParams.set(key, value);
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

  // Origem de retorno gravada no início do fluxo (lista fechada de hosts).
  // Lida antes da marcação para preservar a tela de origem mesmo em erro.
  const { data: originRow } = await supabaseAdmin
    .from("pagbank_connect_states")
    .select("return_origin")
    .eq("state", state)
    .maybeSingle();
  const returnOrigin: string | null = originRow?.return_origin ?? null;

  // State: uso único e não expirado (marcação atômica).
  const { data: stateRow } = await supabaseAdmin
    .from("pagbank_connect_states")
    .update({ used_at: new Date().toISOString() })
    .eq("state", state)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("company_id, environment, user_id, return_origin")
    .maybeSingle();
  if (!stateRow) return adminRedirect("error", "state_invalid_or_expired", returnOrigin);
  if (oauthError || !code) return adminRedirect("denied", oauthError ?? "no_code", returnOrigin);


  const environment = stateRow.environment as "sandbox" | "production";
  if (environment !== "sandbox") return adminRedirect("error", "environment_not_allowed", returnOrigin);
  // Aplicação corrente da plataforma (client_secret cifrado no backend) com
  // compatibilidade para os secrets de ambiente.
  const { clientId, clientSecret } = await resolvePlatformConnectCredentials(supabaseAdmin, environment);
  if (!clientId || !clientSecret) return adminRedirect("error", "connect_not_configured", returnOrigin);
  // A API oficial exige também o token da conta da plataforma (Bearer) nesta troca.
  const platformToken = resolvePlatformAccessToken(environment);
  if (!platformToken) {
    logPaymentTrace("warn", "pagbank-connect-callback", "platform_token_missing", {
      company_id: stateRow.company_id, missing: pagbankSecretNames(environment).platformToken,
    });
    return adminRedirect("error", "connect_not_configured", returnOrigin);
  }

  const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pagbank-connect-callback`;
  const tokenRes = await fetch(`${PAGBANK_API_BASE_URLS[environment]}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${platformToken}`,
      X_CLIENT_ID: clientId,
      X_CLIENT_SECRET: clientSecret,
    },
    body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  }).catch(() => null);
  const tokenBody = tokenRes ? await tokenRes.json().catch(() => null) : null;
  if (!tokenRes?.ok || typeof tokenBody?.access_token !== "string") {
    logPaymentTrace("warn", "pagbank-connect-callback", "token_exchange_failed", {
      company_id: stateRow.company_id, http_status: tokenRes?.status ?? null,
    });
    return adminRedirect("error", `token_exchange_${tokenRes?.status ?? "network"}`, returnOrigin);
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
    // Capacidades (PIX/split) só são comprovadas por cobrança real aceita.
    pix_ready: false, last_validated_at: now, connected_at: now, is_current: true, credential_generation: 1,
    last_error: accountId ? null : "account_id_missing_in_token_response",
  });
  if (error) return adminRedirect("error", "persist_failed", returnOrigin);
  logPaymentTrace("info", "pagbank-connect-callback", "connected", { company_id: stateRow.company_id, has_account: Boolean(accountId) });
  return adminRedirect(accountId ? "connected" : "connected_without_account", undefined, returnOrigin);
});
