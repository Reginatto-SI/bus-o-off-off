const INTERNAL_ERROR_MARKERS = [
  'RUNTIME_ERROR',
  'supabase/functions',
  'edge function',
  'stack trace',
  'ReferenceError',
  'TypeError',
  'SyntaxError',
  'at ',
];

const isSafeForUi = (rawMessage: string) => {
  const normalized = rawMessage.toLowerCase();
  return !INTERNAL_ERROR_MARKERS.some((marker) => normalized.includes(marker.toLowerCase()));
};

const normalizeMessage = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/^error:\s*/i, '').trim();
  if (!cleaned) return null;
  if (!isSafeForUi(cleaned)) return null;
  return cleaned.slice(0, 500);
};

const extractMessageFromPayload = (payload: unknown): string | null => {
  if (!payload) return null;

  const direct = normalizeMessage(payload);
  if (direct) return direct;

  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>;

    // Comentário de suporte: edge functions e respostas do Asaas podem variar entre
    // { error }, { message } e { errors: [{ description }] }. Mantemos cobertura simples.
    const candidates = [
      record.error,
      record.message,
      record.description,
      Array.isArray(record.errors) ? (record.errors[0] as Record<string, unknown> | undefined)?.description : null,
    ];

    for (const candidate of candidates) {
      const normalized = normalizeMessage(candidate);
      if (normalized) return normalized;
    }
  }

  return null;
};

export async function extractAsaasErrorMessage({
  data,
  error,
  fallbackMessage,
}: {
  data: unknown;
  error: unknown;
  fallbackMessage: string;
}): Promise<{ message: string; statusCode?: number }> {
  let statusCode: number | undefined;

  const dataMessage = extractMessageFromPayload(data);
  if (dataMessage) return { message: dataMessage };

  if (error && typeof error === 'object') {
    const errorRecord = error as Record<string, unknown>;

    const context = errorRecord.context;
    if (context instanceof Response) {
      statusCode = context.status;

      try {
        const contextJson = await context.clone().json();
        const contextJsonMessage = extractMessageFromPayload(contextJson);
        if (contextJsonMessage) return { message: contextJsonMessage, statusCode };
      } catch {
        // Comentário de suporte: se não vier JSON, tentamos texto puro sem quebrar o fluxo.
      }

      try {
        const contextText = await context.clone().text();
        const parsed = (() => {
          try {
            return JSON.parse(contextText);
          } catch {
            return contextText;
          }
        })();
        const contextTextMessage = extractMessageFromPayload(parsed);
        if (contextTextMessage) return { message: contextTextMessage, statusCode };
      } catch {
        // noop
      }
    }

    const objectMessage = extractMessageFromPayload(errorRecord);
    if (objectMessage) return { message: objectMessage, statusCode };
  }

  return { message: fallbackMessage, statusCode };
}
