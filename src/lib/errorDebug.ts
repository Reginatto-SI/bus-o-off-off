// Comentário: em DEV mostramos erro bruto; em PROD só quando VITE_DEBUG_ERRORS=true (fácil de reverter).
export const DEBUG_ERRORS =
  import.meta.env.DEV || import.meta.env.VITE_DEBUG_ERRORS === 'true';

const DEFAULT_MAX_TOAST_CHARS = 400;

type ErrorLike = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

type ToastMessageInput = {
  title: string;
  error?: ErrorLike | null;
  context?: Record<string, unknown>;
  maxChars?: number;
};

const formatContext = (context?: Record<string, unknown>) => {
  if (!context) return '';
  const entries = Object.entries(context)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value ?? 'null'}`);
  return entries.length ? entries.join(' | ') : '';
};

const formatErrorDetails = (error?: ErrorLike | null) => {
  if (!error) return '';
  const parts = [
    error.message ? `message=${error.message}` : null,
    error.code ? `code=${error.code}` : null,
    error.details ? `details=${error.details}` : null,
    error.hint ? `hint=${error.hint}` : null,
  ].filter(Boolean);

  return parts.length ? parts.join(' | ') : '';
};

export const buildDebugToastMessage = ({
  title,
  error,
  context,
  maxChars = DEFAULT_MAX_TOAST_CHARS,
}: ToastMessageInput) => {
  if (!DEBUG_ERRORS) {
    return title;
  }

  const errorDetails = formatErrorDetails(error);
  const contextDetails = formatContext(context);
  const suffix = [errorDetails, contextDetails].filter(Boolean).join(' | ');
  const fullMessage = suffix ? `${title} — ${suffix}` : title;

  if (fullMessage.length > maxChars) {
    return `${fullMessage.slice(0, maxChars - 1)}…`;
  }

  return fullMessage;
};

type LogInput = {
  label: string;
  error?: ErrorLike | null;
  context?: Record<string, unknown>;
};

export const logSupabaseError = ({ label, error, context }: LogInput) => {
  // Comentário: log completo para depuração (mensagem, código, detalhes, hint e contexto).
  console.error(label, {
    error,
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
    ...context,
  });
};
