import type { PaymentEnvironment } from "./runtime-env.ts";

type JsonRecord = Record<string, unknown>;

type PixReadinessAction =
  | "already_ready"
  | "evp_created"
  | "evp_creation_failed"
  | "query_failed";

export type PixReadinessResult = {
  ready: boolean;
  action: PixReadinessAction;
  queried: boolean;
  autoCreateAttempted: boolean;
  activeKeyCount: number;
  keysSample: Array<{ id: string | null; status: string | null; type: string | null }>;
  httpStatusList?: number | null;
  httpStatusCreate?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

function normalizeAsaasList(payload: unknown): JsonRecord[] {
  if (Array.isArray(payload)) return payload as JsonRecord[];
  if (payload && typeof payload === "object" && Array.isArray((payload as JsonRecord).data)) {
    return (payload as JsonRecord).data as JsonRecord[];
  }
  return [];
}

function normalizePixKeyStatus(status: unknown): string | null {
  if (typeof status !== "string") return null;
  const normalized = status.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function isPixKeyOperational(status: unknown) {
  // Correção pontual (somente Pix): consideramos apta para cobrança apenas chave ACTIVE.
  // Status ausente/desconhecido agora não gera falso positivo de readiness.
  const normalized = normalizePixKeyStatus(status);
  return normalized === "ACTIVE";
}

function pickError(payload: unknown): { code: string | null; message: string | null } {
  if (!payload || typeof payload !== "object") {
    return { code: null, message: null };
  }

  const record = payload as JsonRecord;
  const firstError = Array.isArray(record.errors) && record.errors.length > 0
    ? (record.errors[0] as JsonRecord)
    : null;

  const code = typeof firstError?.code === "string" ? firstError.code : null;
  const description = typeof firstError?.description === "string"
    ? firstError.description
    : typeof record.message === "string"
      ? record.message
      : null;

  return { code, message: description };
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    const text = await res.text();
    if (!text || !text.trim()) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function ensurePixReadiness(params: {
  asaasBaseUrl: string;
  accessToken: string;
  environment: PaymentEnvironment;
  allowAutoCreateEvp: boolean;
}): Promise<PixReadinessResult> {
  const listRes = await fetch(`${params.asaasBaseUrl}/pix/addressKeys`, {
    headers: { access_token: params.accessToken },
  });
  const listData = await safeJson(listRes);

  if (!listRes.ok) {
    const gatewayError = pickError(listData);
    return {
      ready: false,
      action: "query_failed",
      queried: true,
      autoCreateAttempted: false,
      activeKeyCount: 0,
      keysSample: [],
      httpStatusList: listRes.status,
      errorCode: gatewayError.code ?? "pix_address_keys_query_failed",
      errorMessage: gatewayError.message ?? "Falha ao consultar chaves Pix da conta Asaas.",
    };
  }

  const keys = normalizeAsaasList(listData);
  const unexpectedStatuses = new Set<string>();
  const activeKeys = keys.filter((item) => {
    const normalizedStatus = normalizePixKeyStatus(item?.status);
    if (normalizedStatus && normalizedStatus !== "ACTIVE") {
      unexpectedStatuses.add(normalizedStatus);
    }
    if (!normalizedStatus) {
      unexpectedStatuses.add("MISSING_STATUS");
    }
    return isPixKeyOperational(item?.status);
  });
  const keysSample = keys.slice(0, 5).map((item) => ({
    id: typeof item?.id === "string" ? item.id : null,
    status: typeof item?.status === "string" ? item.status : null,
    type: typeof item?.type === "string" ? item.type : null,
  }));

  if (unexpectedStatuses.size > 0) {
    console.warn("[asaas-pix-readiness] non-operational pix key statuses detected", {
      environment: params.environment,
      statuses: Array.from(unexpectedStatuses),
      total_keys: keys.length,
    });
  }

  if (activeKeys.length > 0) {
    return {
      ready: true,
      action: "already_ready",
      queried: true,
      autoCreateAttempted: false,
      activeKeyCount: activeKeys.length,
      keysSample,
      httpStatusList: listRes.status,
    };
  }

  if (!params.allowAutoCreateEvp) {
    return {
      ready: false,
      action: "query_failed",
      queried: true,
      autoCreateAttempted: false,
      activeKeyCount: 0,
      keysSample,
      httpStatusList: listRes.status,
      errorCode: "pix_key_missing",
      errorMessage: "Conta Asaas sem chave Pix ativa no ambiente operacional.",
    };
  }

  const createRes = await fetch(`${params.asaasBaseUrl}/pix/addressKeys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: params.accessToken,
    },
    body: JSON.stringify({ type: "EVP" }),
  });
  const createData = await safeJson(createRes);

  if (!createRes.ok) {
    const gatewayError = pickError(createData);
    return {
      ready: false,
      action: "evp_creation_failed",
      queried: true,
      autoCreateAttempted: true,
      activeKeyCount: 0,
      keysSample,
      httpStatusList: listRes.status,
      httpStatusCreate: createRes.status,
      errorCode: gatewayError.code ?? "pix_evp_create_failed",
      errorMessage: gatewayError.message ?? "Falha ao criar chave Pix EVP automaticamente.",
    };
  }

  // Comentário de suporte: reconsulta para confirmar estado final após tentativa de criação.
  const recheckRes = await fetch(`${params.asaasBaseUrl}/pix/addressKeys`, {
    headers: { access_token: params.accessToken },
  });
  const recheckData = await safeJson(recheckRes);
  if (!recheckRes.ok) {
    const gatewayError = pickError(recheckData);
    return {
      ready: false,
      action: "evp_creation_failed",
      queried: true,
      autoCreateAttempted: true,
      activeKeyCount: 0,
      keysSample,
      httpStatusList: recheckRes.status,
      httpStatusCreate: createRes.status,
      errorCode: gatewayError.code ?? "pix_recheck_failed",
      errorMessage: gatewayError.message ?? "Chave EVP criada, mas não foi possível confirmar readiness Pix.",
    };
  }

  const recheckedKeys = normalizeAsaasList(recheckData);
  const recheckedActiveKeys = recheckedKeys.filter((item) => isPixKeyOperational(item?.status));
  return {
    ready: recheckedActiveKeys.length > 0,
    action: recheckedActiveKeys.length > 0 ? "evp_created" : "evp_creation_failed",
    queried: true,
    autoCreateAttempted: true,
    activeKeyCount: recheckedActiveKeys.length,
    keysSample: recheckedKeys.slice(0, 5).map((item) => ({
      id: typeof item?.id === "string" ? item.id : null,
      status: typeof item?.status === "string" ? item.status : null,
      type: typeof item?.type === "string" ? item.type : null,
    })),
    httpStatusList: recheckRes.status,
    httpStatusCreate: createRes.status,
    errorCode: recheckedActiveKeys.length > 0 ? null : "pix_key_missing_after_create",
    errorMessage: recheckedActiveKeys.length > 0
      ? null
      : "Asaas não confirmou chave Pix ativa após criação automática.",
  };
}
