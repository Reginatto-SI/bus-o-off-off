import { describe, it, expect } from "vitest";
import { diagnosePagbankWebhookSignature } from "../../supabase/functions/_shared/pagbank/webhook-signature-diagnostic";
import { sha256Hex, verifyPagbankWebhookSignature } from "../../supabase/functions/_shared/pagbank/core";

const body = '{"id":"ORDE_X","reference_id":"abc"}';
const sign = (t: string) => sha256Hex(`${t}-${body}`);

describe("diagnóstico de assinatura do webhook PagBank", () => {
  it("identifica o candidato correto", async () => {
    const sig = await sign("tok-b");
    const r = await diagnosePagbankWebhookSignature({ rawBody: body, receivedSignature: sig, candidates: [
      { name: "connect_access_token", token: "tok-a" }, { name: "platform_account_token", token: "tok-b" },
    ] });
    expect(r.matched_candidate).toBe("platform_account_token");
  });
  it("candidato incorreto não coincide", async () => {
    const r = await diagnosePagbankWebhookSignature({ rawBody: body, receivedSignature: await sign("outro"), candidates: [{ name: "connect_access_token", token: "tok-a" }] });
    expect(r.matched_candidate).toBe("none");
  });
  it("sem credenciais resulta em none", async () => {
    const r = await diagnosePagbankWebhookSignature({ rawBody: body, receivedSignature: await sign("x"), candidates: [{ name: "environment_webhook_token", token: null }] });
    expect(r).toEqual({ matched_candidate: "none", compared_candidates: [] });
  });
  it("resultado não contém segredos, hash ou payload", async () => {
    const sig = await sign("segredo-123");
    const r = await diagnosePagbankWebhookSignature({ rawBody: body, receivedSignature: sig, candidates: [{ name: "connection_webhook_token", token: "segredo-123" }] });
    const s = JSON.stringify(r);
    expect(s).not.toContain("segredo-123");
    expect(s).not.toContain(sig);
    expect(s).not.toContain("ORDE_X");
  });
  it("verificação original continua rejeitando assinatura não comprovada", async () => {
    const r = await verifyPagbankWebhookSignature({ rawBody: body, token: "conexao", receivedSignature: await sign("plataforma") });
    expect(r.valid).toBe(false);
  });
});
