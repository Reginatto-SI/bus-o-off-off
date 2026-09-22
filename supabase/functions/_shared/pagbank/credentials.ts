// @ts-nocheck — arquivo Deno (edge function): tipos resolvidos pelo runtime Deno, não pelo tsc do app.
/* eslint-disable @typescript-eslint/no-explicit-any */
// Resolução da credencial PagBank a partir da IDENTIDADE LÓGICA congelada na
// venda (payment_connection_id) ou da conexão corrente da empresa (somente na
// configuração). Tokens saem daqui decifrados apenas para uso em memória.

import { decryptSecret, isEncryptionConfigured } from "./crypto.ts";
import { PAGBANK_API_BASE_URLS, PagbankError, assertPagbankEnvironmentAllowed, type PagbankEnvironment } from "./core.ts";

type SupabaseAdminClient = any;

export type PagbankConnectionRow = {
  id: string;
  company_id: string;
  gateway: string;
  environment: PagbankEnvironment;
  status: string;
  credential_mode: string | null;
  external_account_id: string | null;
  external_account_email: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  webhook_token_enc: string | null;
  token_expires_at: string | null;
  scopes: string[] | null;
  credential_generation: number;
  pix_ready: boolean;
  last_validated_at: string | null;
  last_error: string | null;
  connected_at: string | null;
  is_current: boolean;
  split_ready: boolean;
  capabilities_verified_at: string | null;
  superseded_by_rotation: boolean;
};

export const CONNECTION_SELECT =
  "id, company_id, gateway, environment, status, credential_mode, external_account_id, external_account_email, access_token_enc, refresh_token_enc, webhook_token_enc, token_expires_at, scopes, credential_generation, pix_ready, last_validated_at, last_error, connected_at, is_current, split_ready, capabilities_verified_at, superseded_by_rotation";

export function pagbankSecretNames(environment: PagbankEnvironment) {
  const suffix = environment.toUpperCase();
  return {
    clientId: `PAGBANK_CLIENT_ID_${suffix}`,
    clientSecret: `PAGBANK_CLIENT_SECRET_${suffix}`,
    marketplaceAccountId: `PAGBANK_MARKETPLACE_ACCOUNT_ID_${suffix}`,
    webhookToken: `PAGBANK_WEBHOOK_TOKEN_${suffix}`,
    platformToken: `PAGBANK_SMARTBUS_TOKEN_${suffix}`,
    encryptionKey: "PAGBANK_TOKEN_ENCRYPTION_KEY",
  };
}

/**
 * Token da conta da plataforma SmartBus. Os endpoints oficiais /oauth2/token e
 * /oauth2/refresh exigem `Authorization: Bearer <token>` além de X_CLIENT_ID e
 * X_CLIENT_SECRET. Fonte única: o secret já existente no backend.
 */
export function resolvePlatformAccessToken(environment: PagbankEnvironment): string | null {
  const value = Deno.env.get(pagbankSecretNames(environment).platformToken)?.trim();
  return value ? value : null;
}


/** Lista nomes de secrets ausentes para o ambiente (sem valores). */
export function missingPagbankSecrets(environment: PagbankEnvironment): {
  connect: string[];
  split: string[];
  webhook: string[];
  encryption: string[];
} {
  const names = pagbankSecretNames(environment);
  const has = (n: string) => Boolean(Deno.env.get(n));
  return {
    connect: [names.clientId, names.clientSecret].filter((n) => !has(n)),
    split: [names.marketplaceAccountId].filter((n) => !has(n)),
    webhook: [names.webhookToken].filter((n) => !has(n)),
    encryption: isEncryptionConfigured() ? [] : [names.encryptionKey],
  };
}

export async function loadConnectionById(supabaseAdmin: SupabaseAdminClient, params: {
  connectionId: string;
  companyId: string;
}): Promise<PagbankConnectionRow | null> {
  const { data, error } = await supabaseAdmin
    .from("payment_gateway_connections")
    .select(CONNECTION_SELECT)
    .eq("id", params.connectionId)
    .eq("company_id", params.companyId)
    .eq("gateway", "pagbank")
    .maybeSingle();
  if (error) throw new Error(`pagbank_connection_load_failed:${error.message}`);
  return (data as PagbankConnectionRow | null) ?? null;
}

export async function loadCurrentConnection(supabaseAdmin: SupabaseAdminClient, params: {
  companyId: string;
  environment: PagbankEnvironment;
}): Promise<PagbankConnectionRow | null> {
  const { data, error } = await supabaseAdmin
    .from("payment_gateway_connections")
    .select(CONNECTION_SELECT)
    .eq("company_id", params.companyId)
    .eq("gateway", "pagbank")
    .eq("environment", params.environment)
    .eq("is_current", true)
    .maybeSingle();
  if (error) throw new Error(`pagbank_connection_load_failed:${error.message}`);
  return (data as PagbankConnectionRow | null) ?? null;
}

export type ResolvedPagbankCredential = {
  connection: PagbankConnectionRow;
  accessToken: string;
  webhookToken: string | null;
  environment: PagbankEnvironment;
};

/** `create` exige conexão corrente e conectada; `query` preserva vendas antigas. */
export type PagbankCredentialPurpose = "create" | "query";

/**
 * Resolve o access token válido da conexão da venda. Renova via refresh token
 * quando expirado (Connect). Falha fechada: nunca usa outra conexão/empresa.
 */
export async function resolvePagbankCredentialForSale(supabaseAdmin: SupabaseAdminClient, params: {
  sale: { id: string; company_id: string; payment_environment: string; payment_connection_id: string | null };
  purpose?: PagbankCredentialPurpose;
}): Promise<ResolvedPagbankCredential> {
  const environment = assertPagbankEnvironmentAllowed(params.sale.payment_environment);
  if (!params.sale.payment_connection_id) {
    throw new PagbankError("pagbank_connection_missing", "Esta venda não possui conexão PagBank vinculada.", 409, {
      sale_id: params.sale.id,
    });
  }
  const connection = await loadConnectionById(supabaseAdmin, {
    connectionId: params.sale.payment_connection_id,
    companyId: params.sale.company_id,
  });
  if (!connection || connection.environment !== environment) {
    throw new PagbankError("pagbank_tenant_mismatch", "Conexão PagBank incompatível com a venda.", 409, {
      sale_id: params.sale.id,
    });
  }
  return resolveCredentialFromConnection(supabaseAdmin, connection, params.purpose ?? "create");
}

export async function resolveCredentialFromConnection(
  supabaseAdmin: SupabaseAdminClient,
  connection: PagbankConnectionRow,
  purpose: PagbankCredentialPurpose = "create",
): Promise<ResolvedPagbankCredential> {
  // Identidade lógica × credencial:
  // - nova cobrança exige a conexão corrente e conectada;
  // - consulta/reconciliação de venda antiga continua usando a conexão congelada
  //   nela, mesmo já substituída por rotação de token da mesma conta.
  if (purpose === "create" && (connection.status !== "connected" || !connection.is_current)) {
    throw new PagbankError("pagbank_connection_not_operational", "A conta PagBank desta empresa não está conectada.", 409, {
      connection_status: connection.status,
      is_current: connection.is_current,
    });
  }
  let accessToken = await decryptSecret(connection.access_token_enc);
  if (!accessToken) {
    throw new PagbankError(
      "pagbank_connection_not_operational",
      purpose === "query"
        ? "A credencial usada nesta venda não está mais disponível. É necessária ação operacional para reconciliá-la."
        : "Credencial PagBank indisponível. Reconecte a conta.",
      409,
      { purpose, connection_status: connection.status },
    );
  }

  const expiresAt = connection.token_expires_at ? Date.parse(connection.token_expires_at) : null;
  const needsRefresh = connection.credential_mode === "connect_oauth" && expiresAt != null && expiresAt - Date.now() < 60_000;
  if (needsRefresh) {
    accessToken = await refreshConnectToken(supabaseAdmin, connection);
  }

  const envWebhook = Deno.env.get(pagbankSecretNames(connection.environment).webhookToken) ?? null;
  const webhookToken = (await decryptSecret(connection.webhook_token_enc)) ?? envWebhook;
  return { connection, accessToken, webhookToken, environment: connection.environment };
}

export type PlatformApplicationRow = {
  id: string;
  gateway: string;
  environment: PagbankEnvironment;
  client_id: string;
  account_id: string | null;
  name: string | null;
  site: string | null;
  redirect_uri: string | null;
  client_secret_enc: string | null;
  status: string;
  is_current: boolean;
  abandoned_reason: string | null;
  created_at: string;
};

export const PLATFORM_APPLICATION_SELECT =
  "id, gateway, environment, client_id, account_id, name, site, redirect_uri, client_secret_enc, status, is_current, abandoned_reason, created_at";

/** Aplicação Connect corrente da plataforma para o ambiente. */
export async function loadCurrentPlatformApplication(
  supabaseAdmin: SupabaseAdminClient,
  environment: PagbankEnvironment,
): Promise<PlatformApplicationRow | null> {
  const { data, error } = await supabaseAdmin
    .from("payment_platform_applications")
    .select(PLATFORM_APPLICATION_SELECT)
    .eq("gateway", "pagbank")
    .eq("environment", environment)
    .eq("is_current", true)
    .maybeSingle();
  if (error) throw new Error(`pagbank_platform_application_load_failed:${error.message}`);
  return (data as PlatformApplicationRow | null) ?? null;
}

/**
 * Credenciais da aplicação Connect da plataforma. Prioriza o registro corrente
 * (client_secret cifrado no backend) e mantém compatibilidade com os secrets de
 * ambiente. Nunca retorna valores para fora do backend.
 */
export async function resolvePlatformConnectCredentials(
  supabaseAdmin: SupabaseAdminClient,
  environment: PagbankEnvironment,
): Promise<{ clientId: string | null; clientSecret: string | null; source: "database" | "environment" | "none" }> {
  const names = pagbankSecretNames(environment);
  const application = await loadCurrentPlatformApplication(supabaseAdmin, environment).catch(() => null);
  if (application?.client_id && application.client_secret_enc) {
    const secret = await decryptSecret(application.client_secret_enc).catch(() => null);
    if (secret) return { clientId: application.client_id, clientSecret: secret, source: "database" };
  }
  const envId = Deno.env.get(names.clientId) ?? null;
  const envSecret = Deno.env.get(names.clientSecret) ?? null;
  if (envId && envSecret) return { clientId: envId, clientSecret: envSecret, source: "environment" };
  return { clientId: application?.client_id ?? envId, clientSecret: null, source: "none" };
}

/**
 * Renovação serializada por geração da credencial: só persiste se ninguém
 * renovou antes (controle otimista). Em corrida, relê a conexão vencedora.
 */
async function refreshConnectToken(supabaseAdmin: SupabaseAdminClient, connection: PagbankConnectionRow): Promise<string> {
  const names = pagbankSecretNames(connection.environment);
  const platform = await resolvePlatformConnectCredentials(supabaseAdmin, connection.environment);
  const clientId = platform.clientId;
  const clientSecret = platform.clientSecret;
  const refreshToken = await decryptSecret(connection.refresh_token_enc);
  const platformToken = resolvePlatformAccessToken(connection.environment);
  if (!clientId || !clientSecret || !refreshToken || !platformToken) {
    throw new PagbankError("pagbank_configuration_missing", "Não foi possível renovar a autorização PagBank.", 409, {
      missing: [
        !clientId && names.clientId,
        !clientSecret && names.clientSecret,
        !platformToken && names.platformToken,
        !refreshToken && "refresh_token",
      ].filter(Boolean),
    });
  }
  const res = await fetch(`${PAGBANK_API_BASE_URLS[connection.environment]}/oauth2/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${platformToken}`,
      X_CLIENT_ID: clientId,
      X_CLIENT_SECRET: clientSecret,
    },
    body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || typeof body?.access_token !== "string") {
    await supabaseAdmin
      .from("payment_gateway_connections")
      .update({ status: "error", last_error: `refresh_failed_http_${res.status}` })
      .eq("id", connection.id)
      .eq("company_id", connection.company_id);
    throw new PagbankError("pagbank_auth_failed", "A autorização PagBank expirou. Reconecte a conta.", 409, {
      http_status: res.status,
    });
  }
  const { encryptSecret } = await import("./crypto.ts");
  const update = {
    access_token_enc: await encryptSecret(body.access_token),
    refresh_token_enc: typeof body.refresh_token === "string" ? await encryptSecret(body.refresh_token) : connection.refresh_token_enc,
    token_expires_at: typeof body.expires_in === "number" ? new Date(Date.now() + body.expires_in * 1000).toISOString() : null,
    credential_generation: connection.credential_generation + 1,
    last_error: null,
  };
  const { data: updated } = await supabaseAdmin
    .from("payment_gateway_connections")
    .update(update)
    .eq("id", connection.id)
    .eq("company_id", connection.company_id)
    .eq("credential_generation", connection.credential_generation)
    .select("id")
    .maybeSingle();
  if (!updated) {
    // Outra execução renovou antes; usa a credencial vencedora.
    const fresh = await loadConnectionById(supabaseAdmin, { connectionId: connection.id, companyId: connection.company_id });
    const token = await decryptSecret(fresh?.access_token_enc);
    if (!token) throw new PagbankError("pagbank_auth_failed", "Falha ao renovar autorização PagBank.", 409);
    return token;
  }
  return body.access_token;
}
