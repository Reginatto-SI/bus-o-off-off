// @ts-nocheck — arquivo Deno (edge function): tipos resolvidos pelo runtime Deno, não pelo tsc do app.
/* eslint-disable @typescript-eslint/no-explicit-any */
// Cliente HTTP mínimo para a API oficial PagBank (Order). Responsável apenas por
// transporte, autenticação Bearer, idempotência e classificação de erro.
// Não decide gateway/ambiente, não calcula taxa e não registra segredos.

import { PAGBANK_API_BASE_URLS, PagbankError, type PagbankEnvironment } from "./core.ts";

const REQUEST_TIMEOUT_MS = 20_000;

export type PagbankHttpResult<T = any> = {
  ok: boolean;
  status: number;
  data: T | null;
  /** true quando não houve resposta conclusiva (timeout/rede após envio). */
  indeterminate: boolean;
  errorMessages: string[];
};

function extractErrorMessages(body: any): string[] {
  const list = Array.isArray(body?.error_messages) ? body.error_messages : [];
  return list
    .map((e: any) => [e?.code, e?.parameter_name, e?.description].filter(Boolean).join(" "))
    .filter((s: string) => s.length > 0)
    .slice(0, 5);
}

export async function pagbankRequest<T = any>(params: {
  environment: PagbankEnvironment;
  accessToken: string;
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  idempotencyKey?: string;
}): Promise<PagbankHttpResult<T>> {
  const base = PAGBANK_API_BASE_URLS[params.environment];
  const headers: Record<string, string> = {
    Authorization: `Bearer ${params.accessToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (params.idempotencyKey) headers["x-idempotency-key"] = params.idempotencyKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${params.path}`, {
      method: params.method,
      headers,
      body: params.body === undefined ? undefined : JSON.stringify(params.body),
      signal: controller.signal,
    });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return {
      ok: res.ok,
      status: res.status,
      data,
      indeterminate: false,
      errorMessages: res.ok ? [] : extractErrorMessages(data),
    };
  } catch (error) {
    // Timeout/rede: o PagBank pode ter processado. Nunca tratar como "não criado".
    return {
      ok: false,
      status: 0,
      data: null,
      indeterminate: true,
      errorMessages: [error instanceof Error ? error.name : "network_error"],
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Converte resultado HTTP em erro tipado (para respostas não-ok). */
export function toPagbankError(result: PagbankHttpResult, context: Record<string, unknown> = {}): PagbankError {
  if (result.indeterminate) {
    return new PagbankError("pagbank_indeterminate", "Sem resposta conclusiva do PagBank. Vamos verificar antes de tentar de novo.", 504, context);
  }
  if (result.status === 401 || result.status === 403) {
    return new PagbankError("pagbank_auth_failed", "A conexão com o PagBank desta empresa não está autorizada. Reconecte a conta.", 409, {
      ...context,
      http_status: result.status,
    });
  }
  if (result.status === 409) {
    return new PagbankError("pagbank_idempotency_conflict", "Operação já em andamento no PagBank.", 409, context);
  }
  if (result.status >= 500) {
    return new PagbankError("pagbank_transient_error", "O PagBank está instável no momento. Tente novamente em instantes.", 502, {
      ...context,
      http_status: result.status,
    });
  }
  return new PagbankError("pagbank_validation_rejected", "O PagBank recusou a criação da cobrança.", 422, {
    ...context,
    http_status: result.status,
    error_messages: result.errorMessages,
  });
}

/** Consulta um pedido por ID. */
export function getPagbankOrder(params: { environment: PagbankEnvironment; accessToken: string; orderId: string }) {
  return pagbankRequest({
    environment: params.environment,
    accessToken: params.accessToken,
    method: "GET",
    path: `/orders/${encodeURIComponent(params.orderId)}`,
  });
}

/** Busca pedidos por referência própria (recuperação após resultado indeterminado). */
export function findPagbankOrdersByReference(params: {
  environment: PagbankEnvironment;
  accessToken: string;
  referenceId: string;
}) {
  return pagbankRequest({
    environment: params.environment,
    accessToken: params.accessToken,
    method: "GET",
    path: `/orders?reference_id=${encodeURIComponent(params.referenceId)}`,
  });
}

/** Chamada barata para validar um token (autenticação) sem efeito financeiro. */
export function probePagbankToken(params: { environment: PagbankEnvironment; accessToken: string }) {
  return pagbankRequest({
    environment: params.environment,
    accessToken: params.accessToken,
    method: "GET",
    path: "/public-keys",
  });
}
