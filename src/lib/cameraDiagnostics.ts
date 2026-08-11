export type CameraDiagnosticEvent = {
  timestamp: string;
  event: string;
  data: unknown;
};

const CAMERA_LOG_LIMIT = 100;
const cameraEvents: CameraDiagnosticEvent[] = [];

// Cria uma fotografia serializável para que alterações posteriores no objeto não mudem o diagnóstico registrado.
function toSerializable(value: unknown): unknown {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : JSON.parse(serialized);
  } catch {
    return '[Dados não serializáveis]';
  }
}

// Mantém o console como destino original e registra, no mesmo ponto, somente o evento aprovado da câmera.
export function cameraLog(event: string, data: Record<string, unknown>) {
  console.info(`[CAMERA] ${event}`, data);
  cameraEvents.push({ timestamp: new Date().toISOString(), event, data: toSerializable(data) });
  if (cameraEvents.length > CAMERA_LOG_LIMIT) cameraEvents.splice(0, cameraEvents.length - CAMERA_LOG_LIMIT);
}

// Retorna uma cópia para impedir que consumidores alterem o buffer compartilhado da sessão.
export function getCameraDiagnosticEvents(): CameraDiagnosticEvent[] {
  return cameraEvents.map(entry => ({ ...entry, data: toSerializable(entry.data) }));
}

export function clearCameraDiagnosticEvents() {
  cameraEvents.length = 0;
}

// Formata todos os eventos em uma única mensagem sem adicionar informações pessoais do usuário.
export function formatCameraDiagnosticLogs(input: {
  route: string;
  userAgent: string;
  generatedAt?: string;
}) {
  const events = getCameraDiagnosticEvents();
  const header = [
    '=== SMARTBUS CAMERA DEBUG ===',
    '',
    `Data: ${input.generatedAt ?? new Date().toISOString()}`,
    `Rota atual: ${input.route}`,
    `User Agent: ${input.userAgent}`,
    `Total de eventos: ${events.length}`,
  ];
  const entries = events.map(({ timestamp, event, data }) =>
    `[${timestamp}] ${event}\n${JSON.stringify(data, null, 2)}`,
  );
  return [...header, ...entries.flatMap(entry => ['', entry])].join('\n');
}
