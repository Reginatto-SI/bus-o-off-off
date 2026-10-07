import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { probePagbankResources } from "../../supabase/functions/_shared/pagbank/resource-probe";
import { resolveCredentialFromConnection, type PagbankConnectionRow } from "../../supabase/functions/_shared/pagbank/credentials";
import { decryptSecret, encryptSecret } from "../../supabase/functions/_shared/pagbank/crypto";

vi.mock("../../supabase/functions/_shared/pagbank/crypto.ts", () => ({
  decryptSecret: vi.fn(), encryptSecret: vi.fn(), isEncryptionConfigured: () => true,
}));

const ORDER = "ORDE_3DF26723-A68D-4392-B47F-530DCB34B630";
const CHARGE = "CHAR_DDB650E1-FABA-4E1B-875E-2806E486DACD";
const SPLIT = "SPLI_2D316D1D-5709-4EAC-980D-36F098E0B780";
const TOKEN = "fake-connect-access-token-for-tests";
const params = { companyId: "company-1", companyGateway: "pagbank", environment: "sandbox", ids: { order_id: ORDER, charge_id: CHARGE, split_id: SPLIT } };
let connection: PagbankConnectionRow;
let fetchMock: ReturnType<typeof vi.fn>;

function database() {
  const chain = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockImplementation(async () => ({ data: connection, error: null })),
    update: vi.fn(), insert: vi.fn(), delete: vi.fn(),
  };
  return { from: vi.fn(() => chain), chain };
}

beforeEach(() => {
  vi.clearAllMocks();
  connection = {
    id: "connection-1", company_id: "company-1", gateway: "pagbank", environment: "sandbox",
    status: "connected", credential_mode: "connect_sms", is_current: true,
    access_token_enc: "encrypted-access", refresh_token_enc: "encrypted-refresh",
    webhook_token_enc: null, token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
  } as PagbankConnectionRow;
  vi.mocked(decryptSecret).mockImplementation(async (payload) => payload === "encrypted-access" ? TOKEN : null);
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: ORDER, charges: [{ id: CHARGE, status: "WAITING" }] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("Deno", { env: { get: vi.fn(() => undefined) } });
});

afterEach(() => vi.unstubAllGlobals());

describe("resource_probe com a credencial Connect real da conexão corrente", () => {
  it("consulta os quatro caminhos oficiais usando somente o token decifrado e sem escrita", async () => {
    const db = database();
    const result = await probePagbankResources(db, params);
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.credential_mode).toBe("connect_sms");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `https://sandbox.api.pagseguro.com/orders/${ORDER}`,
      `https://sandbox.api.pagseguro.com/charges/${CHARGE}`,
      `https://sandbox.api.pagseguro.com/orders?charge_id=${CHARGE}`,
      `https://sandbox.api.pagseguro.com/splits/${SPLIT}`,
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({ method: "GET", redirect: "error", headers: { Accept: "application/json", Authorization: `Bearer ${TOKEN}` } });
      expect(init.headers).not.toHaveProperty("x-client-token");
    }
    expect(db.chain.eq.mock.calls).toEqual([["company_id", "company-1"], ["gateway", "pagbank"], ["environment", "sandbox"], ["is_current", true]]);
    expect(db.chain.update).not.toHaveBeenCalled();
    expect(db.chain.insert).not.toHaveBeenCalled();
    expect(db.chain.delete).not.toHaveBeenCalled();
    expect(encryptSecret).not.toHaveBeenCalled();
  });

  it.each([
    ["manual_sandbox"], ["connect_oauth"], [null],
  ])("recusa modo %s sem fallback ou decifragem", async (mode) => {
    connection.credential_mode = mode;
    const result = await probePagbankResources(database(), params);
    expect(result).toMatchObject({ status: 409, body: { credential_mode: mode, error_code: "pagbank_connection_not_homologated" } });
    expect(decryptSecret).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { status: "error" }, { is_current: false }, { access_token_enc: null },
  ])("recusa conexão não operacional: %j", async (patch) => {
    Object.assign(connection, patch);
    expect(await probePagbankResources(database(), params)).toMatchObject({ status: 409, body: { error_code: "pagbank_connection_not_operational" } });
    expect(decryptSecret).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { company_id: "another-company" }, { gateway: "asaas" }, { environment: "production" },
  ])("recusa conexão fora da empresa/gateway/Sandbox: %j", async (patch) => {
    Object.assign(connection, patch);
    expect(await probePagbankResources(database(), params)).toMatchObject({ status: 409, body: { error_code: "pagbank_tenant_mismatch" } });
    expect(decryptSecret).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { environment: "production" }, { environment: null }, { companyGateway: "asaas" },
    { ids: { environment: "production", order_id: ORDER } },
    { ids: { order_id: "ORDE_../oauth2/refresh" } }, { ids: { charge_id: 123 } }, { ids: {} },
  ])("recusa ambiente, gateway ou IDs inválidos antes de carregar credenciais: %j", async (patch) => {
    const db = database();
    const result = await probePagbankResources(db, { ...params, ...patch });
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(db.from).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aceita IDs opcionais e não executa consultas que não foram solicitadas", async () => {
    await probePagbankResources(database(), { ...params, ids: { order_id: ORDER } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("recusa empresa sem conexão corrente, sem buscar credenciais alternativas", async () => {
    const db = database();
    db.chain.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await probePagbankResources(db, params)).toMatchObject({ status: 409, body: { credential_mode: null, error_code: "pagbank_connection_missing" } });
    expect(decryptSecret).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recusa token perto de expirar sem renovar, consultar o PagBank ou gravar no banco", async () => {
    connection.token_expires_at = new Date(Date.now() + 30_000).toISOString();
    const db = database();
    expect(await probePagbankResources(db, params)).toMatchObject({ status: 409, body: { error_code: "pagbank_credential_requires_refresh" } });
    await expect(resolveCredentialFromConnection(db, connection, "query", { allowRefresh: false })).rejects.toMatchObject({ code: "pagbank_auth_failed" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(db.chain.update).not.toHaveBeenCalled();
    expect(encryptSecret).not.toHaveBeenCalled();
  });

  it("preserva a renovação padrão para os consumidores existentes do resolvedor", async () => {
    connection.token_expires_at = new Date(Date.now() - 1000).toISOString();
    vi.stubGlobal("Deno", { env: { get: (name: string) => ({
      PAGBANK_CLIENT_ID_SANDBOX: "fake-client-id", PAGBANK_CLIENT_SECRET_SANDBOX: "fake-client-secret",
      PAGBANK_SMARTBUS_TOKEN_SANDBOX: "fake-platform-token",
    })[name] } });
    vi.mocked(decryptSecret).mockImplementation(async (payload) => payload === "encrypted-access" ? TOKEN : payload === "encrypted-refresh" ? "fake-refresh-token" : null);
    vi.mocked(encryptSecret).mockResolvedValue("new-encrypted-token");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ access_token: "new-fake-access-token", refresh_token: "new-fake-refresh-token", expires_in: 3600 }), { status: 200 }));
    const db = database();
    db.chain.update.mockReturnThis();
    const credential = await resolveCredentialFromConnection(db, connection, "query");
    expect(credential.accessToken).toBe("new-fake-access-token");
    expect(fetchMock).toHaveBeenCalledWith("https://sandbox.api.pagseguro.com/oauth2/refresh", expect.objectContaining({ method: "POST" }));
    expect(db.chain.update).toHaveBeenCalledTimes(1);
  });

  it("não expõe falhas internas de carga ou descriptografia", async () => {
    const db = database();
    db.chain.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: TOKEN } });
    expect(await probePagbankResources(db, params)).toMatchObject({ status: 500, body: { error_code: "pagbank_connection_load_failed" } });
    vi.mocked(decryptSecret).mockRejectedValueOnce(new Error(TOKEN));
    const result = await probePagbankResources(database(), params);
    expect(result.body).toMatchObject({ error_code: "pagbank_credential_unavailable" });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retorna apenas IDs, status e valores permitidos, sem dados pessoais ou links arbitrários", async () => {
    fetchMock.mockImplementation(async (url: string) => new Response(JSON.stringify(url.includes("/splits/") ? {
      id: SPLIT, access_token: TOKEN, receivers: [{ account: { id: "ACCO_PRIVATE" }, email: "buyer@example.com", amount: { value: 600 } }],
    } : {
      id: ORDER, customer: { tax_id: "12345678909", email: "buyer@example.com" }, access_token: TOKEN,
      charges: [{ id: CHARGE, status: "PAID", links: [
        { rel: "SPLIT", href: `https://sandbox.api.pagseguro.com/splits/${SPLIT}` },
        { rel: "SPLIT", href: `https://untrusted.example/splits/${SPLIT}?token=${TOKEN}` },
      ] }],
    }), { status: 200 }));
    const result = await probePagbankResources(database(), params);
    const output = JSON.stringify(result);
    for (const sensitive of [TOKEN, "ACCO_PRIVATE", "12345678909", "buyer@example.com", "untrusted.example", "href", "Authorization"]) expect(output).not.toContain(sensitive);
    expect(result.body).toMatchObject({ results: [
      { order_ids: [ORDER], charge_ids: [CHARGE], split_ids: [SPLIT], financial_statuses: ["PAID"], has_split_link: true },
      {}, {}, { receiver_count: 1, receiver_amounts: [600] },
    ] });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("lê a resposta de consulta por charge_id contendo uma coleção de pedidos", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ orders: [{ id: ORDER, charges: [{ id: CHARGE, status: "WAITING" }] }] }), { status: 200 }));
    expect((await probePagbankResources(database(), { ...params, ids: { order_id: ORDER } })).body).toMatchObject({ results: [{ order_ids: [ORDER], charge_ids: [CHARGE], financial_statuses: ["WAITING"] }] });
  });

  it.each([
    [401, { error_messages: [{ description: TOKEN }] }, "pagbank", "pagbank_unauthorized"],
    [403, { message: "User is not authorized with an explicit deny " + TOKEN }, "pagbank", "pagbank_forbidden"],
    [404, { error_messages: [{ code: "NOT_FOUND" }] }, "pagbank", "pagbank_resource_not_found"],
    [406, "", "unknown", "pagbank_not_acceptable"],
    [403, "<html>Request blocked. Generated by cloudfront</html>", "cloudfront", "infra_block"],
  ])("classifica HTTP %s sem repetir ou expor resposta bruta", async (status, body, origin, code) => {
    fetchMock.mockResolvedValue(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
    const result = await probePagbankResources(database(), { ...params, ids: { split_id: SPLIT } });
    expect(result.body).toMatchObject({ ok: false, results: [{ http_status: status, response_origin: origin, error_code: code }] });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("classifica erro de rede sem devolver a mensagem que pode conter segredos", async () => {
    fetchMock.mockRejectedValue(new Error(TOKEN));
    const result = await probePagbankResources(database(), { ...params, ids: { order_id: ORDER } });
    expect(result.body).toMatchObject({ ok: false, results: [{ http_status: null, response_origin: "network", error_code: "pagbank_unreachable" }] });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });
});
