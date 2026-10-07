import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const serve = vi.fn();
  vi.stubGlobal("Deno", { serve, env: { get: () => "runtime-test-placeholder" } });
  return { serve, createClient: vi.fn(), probe: vi.fn(), log: vi.fn() };
});
vi.mock("https://esm.sh/@supabase/supabase-js@2.39.0", () => ({ createClient: mocks.createClient }));
vi.mock("../../supabase/functions/_shared/payment-observability.ts", () => ({ logPaymentTrace: mocks.log }));
vi.mock("../../supabase/functions/_shared/pagbank/resource-probe.ts", () => ({ probePagbankResources: mocks.probe }));
import "../../supabase/functions/pagbank-connection/index";

const handler = mocks.serve.mock.calls[0][0] as (request: Request) => Promise<Response>;
const body = { action: "resource_probe", company_id: "company-1", order_id: "ORDE_3DF26723-A68D-4392-B47F-530DCB34B630" };
let db: { auth: { getUser: ReturnType<typeof vi.fn> }; rpc: ReturnType<typeof vi.fn>; from: ReturnType<typeof vi.fn> };

function request(authorization = "Bearer user-session") {
  return new Request("https://supabase.example/functions/v1/pagbank-connection", {
    method: "POST", headers: { Authorization: authorization, Origin: "http://localhost:8080", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("Deno", { env: { get: () => "runtime-test-placeholder" } });
  db = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
    rpc: vi.fn().mockResolvedValue({ data: true }),
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { payment_gateway: "pagbank", payment_environment: "sandbox" } }) }) }) })),
  };
  mocks.createClient.mockReturnValue(db);
  mocks.probe.mockResolvedValue({ status: 200, body: { ok: true, credential_mode: "connect_sms", results: [] } });
});
afterEach(() => vi.unstubAllGlobals());

describe("autorização da ação resource_probe em pagbank-connection", () => {
  it("rejeita sessão ausente antes de acessar o banco ou a credencial", async () => {
    expect((await handler(request(""))).status).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.probe).not.toHaveBeenCalled();
  });

  it("rejeita sessão inválida", async () => {
    db.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
    expect((await handler(request())).status).toBe(401);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(mocks.probe).not.toHaveBeenCalled();
  });

  it.each(["is_admin", "user_belongs_to_company"])("preserva a recusa do guard %s", async (deniedRpc) => {
    db.rpc.mockImplementation(async (name: string) => ({ data: name !== deniedRpc }));
    expect((await handler(request())).status).toBe(403);
    expect(db.from).not.toHaveBeenCalled();
    expect(mocks.probe).not.toHaveBeenCalled();
  });

  it("encaminha somente empresa autorizada, ambiente efetivo e IDs ao diagnóstico", async () => {
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, credential_mode: "connect_sms", results: [] });
    expect(db.rpc.mock.calls).toEqual([
      ["is_admin", { _user_id: "user-1" }],
      ["user_belongs_to_company", { _user_id: "user-1", _company_id: "company-1" }],
    ]);
    expect(mocks.probe).toHaveBeenCalledWith(db, {
      companyId: "company-1", companyGateway: "pagbank", environment: "sandbox",
      ids: { order_id: body.order_id, charge_id: undefined, split_id: undefined, environment: undefined },
    });
  });
});
