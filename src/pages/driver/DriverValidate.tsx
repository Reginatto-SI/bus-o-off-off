import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { APP_VERSION } from '@/generated/build-info';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getPersistedPhase } from '@/lib/driverTripStorage';
import { PHASE_CONFIG, REASON_MESSAGES } from '@/lib/driverPhaseConfig';
import { getDriverPreferences } from '@/lib/driverPreferences';
import { playBeep, vibrateDevice } from '@/lib/driverScannerFeedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, Loader2, QrCode, RefreshCw, RotateCcw, Users, Zap } from 'lucide-react';

type ValidationResponse = {
  result: 'success' | 'blocked';
  reason_code: string;
  checkout_enabled: boolean;
  passenger_name: string | null;
  seat_label: string | null;
  event_name: string | null;
  boarding_label: string | null;
  passenger_cpf_masked: string | null;
  boarding_status: string | null;
};

type ServiceQrItem = {
  item_id: string;
  service_id: string;
  service_name: string;
  unit_type: string;
  control_type: string;
  quantity_total: number;
  quantity_used: number;
  quantity_remaining: number;
  status: string;
  unit_price: number | null;
  total_price: number | null;
  is_consumable: boolean;
  consume_block_reason: string | null;
};

type ServiceQrResponse = {
  result: 'success' | 'blocked';
  reason_code: string;
  message: string;
  sale_id: string | null;
  event_id: string | null;
  customer_name: string | null;
  payment_method: string | null;
  status: string | null;
  payment_confirmed_at: string | null;
  service_qr_code_token: string | null;
  items: ServiceQrItem[];
};

type ServiceConsumeResponse = {
  result: 'success' | 'blocked';
  reason_code: string;
  message: string;
};

type BarcodeDetection = { rawValue?: string };
type BarcodeDetectorInstance = { detect: (source: HTMLVideoElement) => Promise<BarcodeDetection[]> };
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorInstance;
type ScannerEngine = 'barcode_detector' | 'jsqr' | 'none';

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

// REASON_MESSAGES now imported from driverPhaseConfig

/* ------------------------------------------------------------------ */
/*  Debug state — temporary diagnostic panel for mobile field testing  */
/* ------------------------------------------------------------------ */
type AttemptResult = {
  label: string;
  deviceId: string;
  result: 'success' | 'stream_inutilizavel' | 'error';
  detail?: string;
};

type CameraStrategy = { label: string; constraints: MediaStreamConstraints; deviceId?: string };
type CameraDeviceCandidate = { deviceId: string; label: string; classification: CameraDeviceClassification };
type CameraPreferenceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const IMMEDIATE_TRACK_ENDED_CODE = 'camera_track_ended_immediately';

export function getImmediateCameraFailure(stream: Pick<MediaStream, 'active' | 'getVideoTracks'>) {
  const track = stream.getVideoTracks()[0];
  return !stream.active || !track || track.readyState !== 'live'
    ? IMMEDIATE_TRACK_ENDED_CODE
    : null;
}

export async function runSerialCameraStrategies<T>(
  strategies: CameraStrategy[],
  handlers: {
    acquire: (strategy: CameraStrategy, index: number) => Promise<T>;
    validate: (candidate: T, strategy: CameraStrategy, index: number) => Promise<{ usable: boolean; detail: string }>;
    discard: (candidate: T, strategy: CameraStrategy) => Promise<void> | void;
    afterResolved?: (candidate: T, strategy: CameraStrategy) => Promise<void> | void;
    afterAttempt?: () => Promise<void> | void;
    onFailure?: (strategy: CameraStrategy, detail: string) => Promise<void> | void;
  },
) {
  const attempts: AttemptResult[] = [];
  for (let index = 0; index < strategies.length; index += 1) {
    const strategy = strategies[index];
    let candidate: T | null = null;
    try {
      candidate = await handlers.acquire(strategy, index);
      const validation = await handlers.validate(candidate, strategy, index);
      if (validation.usable) {
        await handlers.afterResolved?.(candidate, strategy);
        attempts.push({ label: strategy.label, deviceId: strategy.deviceId?.slice(0, 8) ?? '-', result: 'success', detail: validation.detail });
        return { selected: candidate, selectedStrategy: strategy, attempts };
      }
      attempts.push({ label: strategy.label, deviceId: strategy.deviceId?.slice(0, 8) ?? '-', result: 'stream_inutilizavel', detail: validation.detail });
      await handlers.onFailure?.(strategy, validation.detail);
      await handlers.discard(candidate, strategy);
    } catch (error: unknown) {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : `Error: ${String(error)}`;
      attempts.push({ label: strategy.label, deviceId: strategy.deviceId?.slice(0, 8) ?? '-', result: 'error', detail });
      await handlers.onFailure?.(strategy, detail);
      if (candidate) await handlers.discard(candidate, strategy);
    }
    await handlers.afterAttempt?.();
  }
  return { selected: null, selectedStrategy: null, attempts };
}

export async function acquireWithImmediateSnapshot<T>(
  acquire: () => Promise<T>,
  immediateSnapshot: (candidate: T) => void,
) {
  const candidate = await acquire();
  immediateSnapshot(candidate);
  return candidate;
}

export const shouldStartScanner = (minimalMode: boolean, scannerSupported: boolean, rawMode = false) =>
  !minimalMode && !rawMode && scannerSupported;

export type CameraDeviceClassification = 'traseira' | 'frontal' | 'não classificada';
export type CameraRawMode = 'generic' | 'ideal' | 'exact';

export const RAW_CAMERA_CONSTRAINTS: Record<CameraRawMode, MediaStreamConstraints> = {
  generic: { video: true, audio: false },
  ideal: { video: { facingMode: { ideal: 'environment' } }, audio: false },
  exact: { video: { facingMode: { exact: 'environment' } }, audio: false },
};

export const runRawCameraAcquisition = <T,>(
  mode: CameraRawMode,
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<T>,
  immediateSnapshot: (candidate: T) => void,
) => acquireWithImmediateSnapshot(() => getUserMedia(RAW_CAMERA_CONSTRAINTS[mode]), immediateSnapshot);

export const stopAllMediaStreamTracks = (stream: Pick<MediaStream, 'getTracks'>) => {
  stream.getTracks().forEach(track => track.stop());
};

export const createDeviceCameraConstraints = (deviceId: string): MediaStreamConstraints => ({
  video: { deviceId: { exact: deviceId } },
  audio: false,
});

export function readCameraPreference(storage: CameraPreferenceStorage, onError?: (error: unknown) => void) {
  try { return storage.getItem(LAST_WORKING_BACK_CAMERA_KEY); }
  catch (error) { onError?.(error); return null; }
}

export function saveCameraPreference(storage: CameraPreferenceStorage, deviceId: string, onError?: (error: unknown) => void) {
  try { storage.setItem(LAST_WORKING_BACK_CAMERA_KEY, deviceId); return true; }
  catch (error) { onError?.(error); return false; }
}

export function removeCameraPreference(storage: CameraPreferenceStorage, onError?: (error: unknown) => void) {
  try { storage.removeItem(LAST_WORKING_BACK_CAMERA_KEY); return true; }
  catch (error) { onError?.(error); return false; }
}

export function persistApprovedBackCamera(
  device: CameraDeviceCandidate,
  usable: boolean,
  storage: CameraPreferenceStorage,
  onError?: (error: unknown) => void,
) {
  if (!usable || device.classification !== 'traseira') return false;
  return saveCameraPreference(storage, device.deviceId, onError);
}

export function buildCameraDeviceStrategies(devices: CameraDeviceCandidate[], preferredDeviceId: string | null) {
  const rear = devices.filter(device => device.classification === 'traseira' && device.deviceId);
  const unknown = devices.filter(device => device.classification === 'não classificada' && device.deviceId);
  const preferred = rear.find(device => device.deviceId === preferredDeviceId) ?? null;
  const ordered = [
    ...(preferred ? [preferred] : []),
    ...rear.filter(device => device.deviceId !== preferred?.deviceId),
    ...unknown,
  ];
  const strategies: CameraStrategy[] = ordered.map(device => ({
    label: `${device.classification}:${device.label || device.deviceId.slice(0, 8)}`,
    deviceId: device.deviceId,
    constraints: createDeviceCameraConstraints(device.deviceId),
  }));
  strategies.push({ label: 'video:true (fallback final)', constraints: { video: true, audio: false } });
  return { strategies, preferredValid: !preferredDeviceId || Boolean(preferred) };
}

export function classifyCameraDevice(label: string): CameraDeviceClassification {
  const normalized = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/back|rear|environment|traseir|traser|arriere|hinten|后置|背面|後面/.test(normalized)) return 'traseira';
  if (/front|user|frontal|dianteir|delanter|avant|vorne|前置|前面/.test(normalized)) return 'frontal';
  return 'não classificada';
}

type CameraEnvironment = 'webview_android' | 'navegador';

/**
 * Detecta WebView Android embarcado (WebInto.app e similares).
 * Detecção ESTRITA: apenas UA "Dalvik/..." ou "; wv)".
 * Usado somente para a mensagem exibida — nunca para decidir o fluxo da câmera.
 */
function detectCameraEnvironment(): CameraEnvironment {
  const ua = navigator.userAgent || '';
  if (/Dalvik/i.test(ua) || /;\s*wv\)/i.test(ua)) return 'webview_android';
  return 'navegador';
}

type DebugInfo = {
  permission: string;
  streamExists: boolean;
  trackCount: number;
  trackStates: string[];
  trackLabels: string[];
  videoWidth: number;
  videoHeight: number;
  readyState: number;
  cameraReady: boolean;
  cameraError: string | null;
  scannerSupported: boolean;
  scannerEngine: ScannerEngine;
  constraintUsed: string;
  lastError: string | null;
  devices: string[];
  initInProgress: boolean;
  initCount: number;
  lastInitAt: string | null;
  liveTrackStates: string[];
  selectedDeviceId: string | null;
  candidateBackCameras: string[];
  attemptResults: AttemptResult[];
  currentStrategy: string;
  environment: CameraEnvironment;
  timeline: string[];
};

const INITIAL_DEBUG: DebugInfo = {
  permission: 'unknown',
  streamExists: false,
  trackCount: 0,
  trackStates: [],
  trackLabels: [],
  videoWidth: 0,
  videoHeight: 0,
  readyState: 0,
  cameraReady: false,
  cameraError: null,
  scannerSupported: false,
  scannerEngine: 'none',
  constraintUsed: 'none',
  lastError: null,
  devices: [],
  initInProgress: false,
  initCount: 0,
  lastInitAt: null,
  liveTrackStates: [],
  selectedDeviceId: null,
  candidateBackCameras: [],
  attemptResults: [],
  currentStrategy: 'nenhuma',
  environment: 'navegador',
  timeline: [],
};

/**
 * Watchdog APENAS visual: se a câmera não responder nesse tempo, a tela sai do
 * estado "abrindo…" e mostra mensagem. A solicitação original continua viva —
 * se o usuário autorizar depois, o stream é aceito normalmente.
 */
const CAMERA_WATCHDOG_MS = 12000;

const REAL_FRAME_MIN_SIZE = 16;
const FRAME_READY_WAIT_MS = 3000;
// O fluxo antigo já chegou a aguardar 800 ms; esse teto dá margem ao CameraService
// sem criar repetição infinita nem alongar excessivamente o fallback.
const CAMERA_RELEASE_WAIT_MS = 800;
const LAST_WORKING_BACK_CAMERA_KEY = 'smartbus.validator.lastWorkingBackCameraDeviceId';

export function isUsableCameraState(input: {
  streamActive: boolean;
  trackState: MediaStreamTrackState | 'missing';
  videoConnected: boolean;
  width: number;
  height: number;
}) {
  return input.streamActive
    && input.trackState === 'live'
    && input.videoConnected
    && input.width >= REAL_FRAME_MIN_SIZE
    && input.height >= REAL_FRAME_MIN_SIZE;
}

export async function waitForUsableCameraState(
  readState: () => Parameters<typeof isUsableCameraState>[0],
  wait: (milliseconds: number) => Promise<void>,
  windowMs = FRAME_READY_WAIT_MS,
  pollMs = 100,
) {
  let elapsed = 0;
  while (elapsed < windowMs) {
    const state = readState();
    if (isUsableCameraState(state)) return true;
    if (!state.streamActive || state.trackState === 'ended' || state.trackState === 'missing' || !state.videoConnected) return false;
    await wait(pollMs);
    elapsed += pollMs;
  }
  return false;
}


export default function DriverValidate() {
  const navigate = useNavigate();
  const { user, userRole, loading, activeCompanyId } = useAuth();
  const canAccessDriverPortal = userRole === 'motorista' || userRole === 'operador' || userRole === 'gerente' || userRole === 'developer';

  // Read active phase from localStorage
  const activePhase = user && activeCompanyId ? getPersistedPhase(user.id, activeCompanyId) : 'ida';
  const phaseConfig = PHASE_CONFIG[activePhase];

  const streamRef = useRef<MediaStream | null>(null);
  const streamOwnerInitRef = useRef(0);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const scannerEngineRef = useRef<ScannerEngine>('none');
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const initInProgressRef = useRef(false);
  const initCountRef = useRef(0);
  const scanIntervalRef = useRef<number | null>(null);
  const timelineRef = useRef<string[]>([]);
  const cameraReadyRef = useRef(false);
  const roleResolvedRef = useRef(false);
  const cameraDebug = useMemo(() => new URLSearchParams(window.location.search).get('cameraDebug') === '1', []);
  const cameraRawMode = useMemo<CameraRawMode | null>(() => {
    if (!cameraDebug) return null;
    const value = new URLSearchParams(window.location.search).get('cameraRaw');
    return value === 'generic' || value === 'ideal' || value === 'exact' ? value : null;
  }, [cameraDebug]);
  const cameraRawDevicesMode = useMemo(() => cameraDebug
    && new URLSearchParams(window.location.search).get('cameraRaw') === 'devices', [cameraDebug]);
  const [minimalCameraMode, setMinimalCameraMode] = useState(false);
  const [rawTestExecuted, setRawTestExecuted] = useState(false);
  const rawTestExecutedRef = useRef(false);
  const [rawDevices, setRawDevices] = useState<CameraDeviceCandidate[]>([]);
  const [rawDevicesError, setRawDevicesError] = useState<string | null>(null);
  const [approvedRawDevice, setApprovedRawDevice] = useState<CameraDeviceCandidate | null>(null);
  const rawDiagnosticActive = Boolean(cameraRawMode) || cameraRawDevicesMode;
  const diagnosticLinesRef = useRef<string[]>([]);

  const [processing, setProcessing] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [scannerSupported, setScannerSupported] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<ValidationResponse | null>(null);
  const [serviceOverlay, setServiceOverlay] = useState<ServiceQrResponse | null>(null);
  const [serviceEventName, setServiceEventName] = useState<string | null>(null);
  const [serviceActionFeedback, setServiceActionFeedback] = useState<string | null>(null);
  const [consumingItemId, setConsumingItemId] = useState<string | null>(null);
  const [scannerStatusMessage, setScannerStatusMessage] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo>(INITIAL_DEBUG);
  const [driverPrefs, setDriverPrefs] = useState(getDriverPreferences);
  const autoResetTimerRef = useRef<number | null>(null);
  const lastScanSuccessAtRef = useRef<number>(Date.now());
  const scanErrorCountRef = useRef<number>(0);

  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

  const recordDiagnostic = useCallback((message: string, data?: unknown) => {
    if (!cameraDebug) return;
    const detail = data === undefined ? '' : ` ${JSON.stringify(data)}`;
    diagnosticLinesRef.current = [...diagnosticLinesRef.current, `${new Date().toISOString()} ${message}${detail}`].slice(-250);
    console.info(`[CAM-DIAG] ${message}`, data ?? '');
  }, [cameraDebug]);
  const recordPreferenceStorageError = useCallback((error: unknown) => {
    recordDiagnostic('cameraPreference:storage_error', {
      detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
  }, [recordDiagnostic]);

  const videoRef = useCallback((node: HTMLVideoElement | null) => {
    recordDiagnostic(`video:${node ? 'mount' : 'unmount'}`, {
      event: node ? 'mount' : 'unmount',
      at: new Date().toISOString(),
      url: window.location.href,
    });
    setVideoEl(node);
  }, [recordDiagnostic]);

  useEffect(() => {
    if (!cameraRawDevicesMode || !navigator.mediaDevices?.enumerateDevices) return;
    // O catálogo bruto enumera uma única vez por carregamento e não abre câmera.
    void navigator.mediaDevices.enumerateDevices().then(devices => {
      const candidates = devices.filter(device => device.kind === 'videoinput').map(device => ({
        deviceId: device.deviceId,
        label: device.label || 'unnamed',
        classification: classifyCameraDevice(device.label),
      }));
      recordDiagnostic('cameraDeviceTest:devices', candidates.map(device => ({
        ...device, deviceId: device.deviceId.slice(0, 8),
      })));
      setRawDevices(candidates);
    }).catch(error => {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      recordDiagnostic('cameraDeviceTest:enumerate_reject', { detail });
      setRawDevicesError(detail);
    });
  }, [cameraRawDevicesMode, recordDiagnostic]);

  const reasonLabel = useMemo(() => {
    if (!overlay) return '';
    return REASON_MESSAGES[overlay.reason_code] ?? 'Validação bloqueada';
  }, [overlay]);

  const serviceReasonLabel = useMemo(() => {
    if (!serviceOverlay) return '';
    const serviceMessages: Record<string, string> = {
      service_qr_not_found: 'QR de serviços inválido ou não reconhecido.',
      service_qr_resolved: 'Serviços da venda carregados com sucesso.',
      service_item_consumed: '1 unidade consumida com sucesso.',
      sale_cancelled: 'Venda cancelada. Não é possível consumir o serviço.',
      sale_pending_fee: 'Venda pendente de taxa. Consumo indisponível.',
      sale_not_paid: 'Venda ainda não está paga. Não é possível consumir o serviço.',
      control_not_required: 'Serviço sem validação obrigatória. Nada para consumir.',
      no_balance: 'Saldo esgotado para este serviço.',
      item_inactive: 'Item de serviço inativo para consumo.',
      service_qr_mismatch: 'Este item não pertence ao QR de serviços lido.',
      concurrent_update_blocked: 'Outro operador consumiu este item. Releia para atualizar.',
      not_allowed_company: 'Você não tem permissão para validar esta venda.',
    };
    return serviceMessages[serviceOverlay.reason_code] ?? serviceOverlay.message ?? 'Validação de serviço bloqueada.';
  }, [serviceOverlay]);

  const itemBlockReasonMessages: Record<string, string> = {
    control_not_required: 'Serviço sem validação obrigatória.',
    no_balance: 'Saldo esgotado para este serviço.',
    item_inactive: 'Item inativo para consumo.',
  };

  /* ---------- helpers ---------- */

  const updateDebug = useCallback((patch: Partial<DebugInfo>) => {
    setDebugInfo(prev => ({ ...prev, ...patch }));
  }, []);

  const lockScannerTemporarily = useCallback(() => {
    setScanLocked(true);
    window.setTimeout(() => setScanLocked(false), 1000);
  }, []);

  /* ---------- RPC validate ---------- */

  const resolveServiceQr = useCallback(async (serviceToken: string) => {
    const { data, error } = await supabase.rpc('resolve_service_qr', {
      p_service_qr_code_token: serviceToken,
    });

    if (error) return null;
    const payload = (Array.isArray(data) ? data[0] : data) as Omit<ServiceQrResponse, 'items'> & { items: unknown } | null;
    if (!payload) return null;

    let eventName: string | null = null;
    if (payload.event_id) {
      const { data: eventData } = await supabase.from('events').select('name').eq('id', payload.event_id).maybeSingle();
      eventName = eventData?.name ?? null;
    }

    setServiceEventName(eventName);
    const parsedItems = Array.isArray(payload.items) ? payload.items as ServiceQrItem[] : [];
    const serviceData: ServiceQrResponse = { ...payload, items: parsedItems };
    setServiceOverlay(serviceData);
    return serviceData;
  }, []);

  const handleValidate = useCallback(async (qrCodeToken: string, action: 'checkin' | 'checkout' | 'reboard') => {
    if (!qrCodeToken || processing) return;
    setProcessing(true);
    lockScannerTemporarily();
    setScannerStatusMessage(null);
    setServiceOverlay(null);
    setServiceEventName(null);
    setServiceActionFeedback(null);

    const { data, error } = await supabase.rpc('validate_ticket_scan', {
      p_qr_code_token: qrCodeToken,
      p_action: action,
      p_device_info: navigator.userAgent,
      p_app_version: import.meta.env.VITE_APP_VERSION ?? 'web',
      p_source: 'scanner',
    });

    if (error) {
      setOverlay({
        result: 'blocked', reason_code: 'rpc_error', checkout_enabled: false,
        passenger_name: null, seat_label: null, event_name: null,
        boarding_label: null, passenger_cpf_masked: null, boarding_status: null,
      });
      setProcessing(false);
      return;
    }

    const payload = (Array.isArray(data) ? data[0] : data) as ValidationResponse | null;
    const shouldTryServiceQr = payload?.reason_code === 'invalid_qr';

    // Mantemos primeiro o fluxo de passagem e só tentamos serviços quando o ticket não é reconhecido.
    if (shouldTryServiceQr) {
      const servicePayload = await resolveServiceQr(qrCodeToken);
      if (servicePayload && servicePayload.reason_code !== 'service_qr_not_found') {
        setOverlay(null);
        setManualToken(qrCodeToken);
        setProcessing(false);
        return;
      }
    }

    // Feedback operacional obrigatório: ao menos uma resposta clara após leitura reconhecida.
    setOverlay(payload ?? {
      result: 'blocked', reason_code: 'invalid_response', checkout_enabled: false,
      passenger_name: null, seat_label: null, event_name: null,
      boarding_label: null, passenger_cpf_masked: null, boarding_status: null,
    });
    lastScanSuccessAtRef.current = Date.now();
    scanErrorCountRef.current = 0;
    setManualToken(qrCodeToken);
    setProcessing(false);
  }, [lockScannerTemporarily, processing, resolveServiceQr]);

  const handleConsumeServiceItem = useCallback(async (itemId: string) => {
    if (!serviceOverlay?.service_qr_code_token || consumingItemId) return;
    setConsumingItemId(itemId);
    setServiceActionFeedback(null);

    // O consumo é sempre via RPC para manter atomicidade e evitar ajuste local de saldo no frontend.
    const { data, error } = await supabase.rpc('consume_service_item', {
      p_sale_service_item_id: itemId,
      p_service_qr_code_token: serviceOverlay.service_qr_code_token,
    });

    if (error) {
      setServiceActionFeedback('Erro ao consumir item. Tente novamente.');
      setConsumingItemId(null);
      return;
    }

    const payload = (Array.isArray(data) ? data[0] : data) as ServiceConsumeResponse | null;
    setServiceActionFeedback(payload?.message ?? 'Consumo processado.');

    // Recarrega o estado via resolve_service_qr para garantir saldo atualizado após concorrência.
    await resolveServiceQr(serviceOverlay.service_qr_code_token);
    setConsumingItemId(null);
  }, [consumingItemId, resolveServiceQr, serviceOverlay?.service_qr_code_token]);

  /* ---------- torch ---------- */

  const toggleTorch = useCallback(async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const newState = !torchOn;
      await (track as any).applyConstraints({ advanced: [{ torch: newState }] as any });
      setTorchOn(newState);
    } catch { /* torch not supported */ }
  }, [torchOn]);

  /* ---------- diagnóstico ---------- */

  const logStep = useCallback((message: string) => {
    const at = new Date().toISOString().slice(11, 23);
    timelineRef.current = [...timelineRef.current, `${at} — ${message}`];
    console.info(`[CAM] ${message}`);
    updateDebug({ timeline: timelineRef.current });
  }, [updateDebug]);

  const logStreamSnapshot = useCallback((stage: string, stream: MediaStream, video?: HTMLVideoElement) => {
    recordDiagnostic(`stream:${stage}`, {
      at: new Date().toISOString(), stage, initId: initCountRef.current,
      streamId: stream.id, active: stream.active,
      video: video ? { connected: video.isConnected, readyState: video.readyState, width: video.videoWidth, height: video.videoHeight } : null,
      tracks: stream.getTracks().map(track => ({
        id: track.id, label: track.label, kind: track.kind, readyState: track.readyState,
        enabled: track.enabled, muted: track.muted, settings: track.getSettings?.(),
      })),
    });
  }, [recordDiagnostic]);

  const captureImmediateSnapshot = useCallback((stream: MediaStream, video: HTMLVideoElement, testType: string) => {
    const tracks = stream.getTracks();
    recordDiagnostic('getUserMedia:immediate_snapshot', {
      at: new Date().toISOString(), testType, streamId: stream.id, streamActive: stream.active,
      trackCount: tracks.length,
      tracks: tracks.map(track => ({
        id: track.id, label: track.label, readyState: track.readyState,
        enabled: track.enabled, muted: track.muted, settings: track.getSettings?.(),
      })),
      visibility: document.visibilityState,
      videoConnected: video.isConnected,
    });
  }, [recordDiagnostic]);

  useEffect(() => {
    recordDiagnostic('react:state', {
      at: new Date().toISOString(), videoEl: Boolean(videoEl), videoConnected: videoEl?.isConnected,
      loading, authenticated: Boolean(user), initId: initCountRef.current,
    });
  }, [loading, user, videoEl, recordDiagnostic]);

  const stopStreamTracks = useCallback((stream: MediaStream, reason: string) => {
    recordDiagnostic('track.stop', { reason, trackStates: stream.getTracks().map(track => track.readyState) });
    stopAllMediaStreamTracks(stream);
  }, [recordDiagnostic]);

  /* ---------- stopCurrentStream ---------- */

  const stopCurrentStream = useCallback((reason: string, ownerInitId?: number) => {
    const stream = streamRef.current;
    if (stream && typeof ownerInitId === 'number' && streamOwnerInitRef.current !== ownerInitId) {
      // Uma sessão antiga nunca pode encerrar o stream de uma sessão mais nova.
      logStep(`encerramento ignorado (${reason}): stream pertence à sessão #${streamOwnerInitRef.current}`);
      return;
    }

    const before = stream?.getVideoTracks().map(t => t.readyState) ?? [];
    if (scanIntervalRef.current) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (stream) {
      stopStreamTracks(stream, reason);
      streamRef.current = null;
    }
    const after = stream?.getVideoTracks().map(t => t.readyState) ?? [];

    console.log('[CAM] stopCurrentStream', {
      reason,
      initId: initCountRef.current,
      streamOwner: streamOwnerInitRef.current,
      visibility: document.visibilityState,
      tracks: before.length,
      before,
      after,
    });
    if (before.length) logStep(`câmera encerrada (${reason}) — tracks ${before.join(',')} → ${after.join(',')}`);

    cameraReadyRef.current = false;
    setCameraReady(false);
    setTorchOn(false);
    setTorchSupported(false);
  }, [logStep, stopStreamTracks]);

  /* ---------- startCamera — core init routine ---------- */

  const startCamera = useCallback(async (video: HTMLVideoElement) => {
    if (initInProgressRef.current) {
      recordDiagnostic('getUserMedia:bloqueado_concorrencia');
      return;
    }
    initInProgressRef.current = true;
    const thisInitId = ++initCountRef.current;
    const attemptResults: AttemptResult[] = [];
    const environment = detectCameraEnvironment();
    timelineRef.current = [];
    stopCurrentStream('nova_inicializacao');
    setCameraError(null);
    updateDebug({ ...INITIAL_DEBUG, initInProgress: true, initCount: thisInitId, lastInitAt: new Date().toISOString(), environment, currentStrategy: 'preparando solicitação' });
    logStep(`botão "Abrir câmera" clicado (solicitação #${thisInitId})`);

    let settled = false;
    const watchdogId = window.setTimeout(() => {
      if (settled) return;
      logStep(`sem resposta após ${CAMERA_WATCHDOG_MS / 1000}s — chamada continua ativa e concorrência permanece bloqueada`);
      setCameraError('A câmera ainda não respondeu. A solicitação atual continua em andamento.');
    }, CAMERA_WATCHDOG_MS);
    const finish = () => {
      settled = true;
      window.clearTimeout(watchdogId);
      initInProgressRef.current = false;
      updateDebug({ initInProgress: false, attemptResults: [...attemptResults] });
    };

    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new DOMException('API de câmera indisponível em contexto não seguro.', 'SecurityError');
      }
      try {
        const permission = await navigator.permissions.query({ name: 'camera' as PermissionName });
        updateDebug({ permission: permission.state });
        logStep(`permissão antes da solicitação: ${permission.state}`);
      } catch { updateDebug({ permission: 'api_unavailable' }); }

      if (minimalCameraMode) {
        detectorRef.current = null;
        scannerEngineRef.current = 'none';
        setScannerSupported(false);
        updateDebug({ scannerSupported: false, scannerEngine: 'none' });
        logStep('modo mínimo: scanner e processamento desativados');
      } else {
        detectorRef.current = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
        scannerEngineRef.current = detectorRef.current ? 'barcode_detector' : 'jsqr';
        setScannerSupported(true);
        updateDebug({ scannerSupported: true, scannerEngine: scannerEngineRef.current });
      }

      const discoverBackCameras = async (stage: string) => {
        try {
          const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput');
          const classified = devices.map(device => ({ device, classification: classifyCameraDevice(device.label) }));
          const back = classified.filter(item => item.classification === 'traseira');
          const unknown = classified.filter(item => item.classification === 'não classificada');
          updateDebug({
            devices: classified.map(({ device, classification }) => `${device.label || 'unnamed'} [${device.deviceId.slice(0, 8)}] — ${classification}`),
            candidateBackCameras: back.map(({ device }) => `${device.label} [${device.deviceId.slice(0, 8)}]`),
          });
          recordDiagnostic('devices:classified', classified.map(({ device, classification }) => ({
            deviceId: device.deviceId.slice(0, 8), label: device.label || 'unnamed', classification,
          })));
          logStep(`dispositivos ${stage}: ${devices.length}; traseiras=${back.length}; não classificados=${unknown.length}`);
          return classified.map(({ device, classification }) => ({ deviceId: device.deviceId, label: device.label, classification }));
        } catch (error) { recordDiagnostic('enumerateDevices:error', String(error)); }
        return [] as CameraDeviceCandidate[];
      };

      const validateCandidate = async (candidate: MediaStream) => {
        const track = candidate.getVideoTracks()[0];
        const videoStage = (stage: string, extra?: unknown) => recordDiagnostic(`video:${stage}`, {
          trackState: candidate.getVideoTracks()[0]?.readyState ?? 'ausente',
          streamActive: candidate.active,
          connected: video.isConnected,
          readyState: video.readyState,
          ...((extra && typeof extra === 'object') ? extra : {}),
        });
        logStreamSnapshot('primeiro retorno de getUserMedia', candidate, video);
        const immediateFailure = getImmediateCameraFailure(candidate);
        if (immediateFailure) {
          recordDiagnostic(immediateFailure, { active: candidate.active, trackState: track?.readyState ?? 'ausente' });
          return { usable: false, detail: immediateFailure };
        }
        if (!video.isConnected) return { usable: false, detail: 'video desmontado' };

        streamRef.current = candidate;
        streamOwnerInitRef.current = thisInitId;
        video.srcObject = candidate;
        videoStage('srcObject_assigned');

        // Espera curta por metadata/canplay antes de play; listeners também provam
        // qual evento ocorreu no aparelho, sem bloquear além do timeout.
        const waitUntilPlayable = (timeoutMs: number, requireCanPlay = false) => new Promise<boolean>(resolve => {
          if ((!requireCanPlay && video.readyState >= HTMLMediaElement.HAVE_METADATA)
            || (requireCanPlay && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA)) {
            videoStage('loadedmetadata', { source: 'readyState' });
            if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) videoStage('canplay', { source: 'readyState' });
            resolve(true);
            return;
          }
          let settled = false;
          const finish = (ready: boolean) => {
            if (settled) return;
            settled = true;
            video.removeEventListener('loadedmetadata', onMetadata);
            video.removeEventListener('canplay', onCanPlay);
            window.clearTimeout(timeoutId);
            resolve(ready);
          };
          const onMetadata = () => { videoStage('loadedmetadata'); if (!requireCanPlay) finish(true); };
          const onCanPlay = () => { videoStage('canplay'); finish(true); };
          const timeoutId = window.setTimeout(() => finish(false), timeoutMs);
          video.addEventListener('loadedmetadata', onMetadata, { once: true });
          video.addEventListener('canplay', onCanPlay, { once: true });
        });
        await waitUntilPlayable(1800);

        let playResolved = false;
        for (let playAttempt = 1; playAttempt <= 2; playAttempt += 1) {
          videoStage('play_start', { attempt: playAttempt });
          try {
            await video.play();
            videoStage('play_resolve', { attempt: playAttempt });
            playResolved = true;
            break;
          } catch (error) {
            videoStage('play_reject', { attempt: playAttempt, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
            if (playAttempt === 1 && candidate.active && track.readyState === 'live' && video.isConnected) {
              await waitUntilPlayable(1000, true);
            }
          }
        }
        if (!playResolved) return { usable: false, detail: 'video.play rejeitou duas tentativas' };

        const frameReady = await waitForUsableCameraState(
          () => ({
            streamActive: candidate.active,
            trackState: candidate.getVideoTracks()[0]?.readyState ?? 'missing',
            videoConnected: video.isConnected,
            width: video.videoWidth,
            height: video.videoHeight,
          }),
          milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds)),
        );
        if (frameReady) {
          videoStage('first_frame', { width: video.videoWidth, height: video.videoHeight });
          logStreamSnapshot('primeiro quadro plausível', candidate, video);
          return { usable: true, detail: `${video.videoWidth}x${video.videoHeight}` };
        }
        return {
          usable: false,
          detail: `active=${candidate.active}, track=${candidate.getVideoTracks()[0]?.readyState ?? 'ausente'}, video=${video.videoWidth}x${video.videoHeight}, connected=${video.isConnected}`,
        };
      };

      let availableDevices = await discoverBackCameras('antes da abertura');
      const labelsAndIdsAvailable = availableDevices.some(device => device.deviceId && device.label);

      if (!labelsAndIdsAvailable) {
        // Bootstrap único: abre a opção flexível apenas para liberar labels/IDs,
        // encerra completamente e só então monta a fila física por deviceId.
        recordDiagnostic('cameraBootstrap:start', { constraints: RAW_CAMERA_CONSTRAINTS.generic });
        let bootstrap: MediaStream | null = null;
        try {
          bootstrap = await acquireWithImmediateSnapshot(
            () => navigator.mediaDevices.getUserMedia(RAW_CAMERA_CONSTRAINTS.generic),
            stream => captureImmediateSnapshot(stream, video, 'normal:bootstrap_autorizacao'),
          );
          const bootstrapValidation = await validateCandidate(bootstrap);
          if (bootstrapValidation.usable) availableDevices = await discoverBackCameras('após bootstrap de autorização');
        } catch (error) {
          recordDiagnostic('cameraBootstrap:reject', { detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
        } finally {
          if (bootstrap) {
            stopStreamTracks(bootstrap, 'fim_bootstrap_autorizacao');
            if (streamRef.current === bootstrap) streamRef.current = null;
            if (video.srcObject === bootstrap) video.srcObject = null;
            await new Promise(resolve => window.setTimeout(resolve, CAMERA_RELEASE_WAIT_MS));
          }
        }
      }

      const savedDeviceId = readCameraPreference(localStorage, recordPreferenceStorageError);
      const strategyPlan = buildCameraDeviceStrategies(availableDevices, savedDeviceId);
      if (!strategyPlan.preferredValid && savedDeviceId) removeCameraPreference(localStorage, recordPreferenceStorageError);
      const strategies = strategyPlan.strategies;
      const classificationById = new Map(availableDevices.map(device => [device.deviceId, device.classification]));
      const failedDeviceIds = new Set<string>();

      const serialResult = await runSerialCameraStrategies(strategies, {
        acquire: async (strategy, index) => {
          const callId = `${thisInitId}.${index + 1}`;
          if (strategy.deviceId && failedDeviceIds.has(strategy.deviceId)) {
            throw new DOMException('Dispositivo já falhou nesta inicialização.', 'InvalidStateError');
          }
          updateDebug({ currentStrategy: strategy.label });
          setScannerStatusMessage(index === 0 ? 'Procurando uma câmera traseira disponível…' : 'Tentando outra câmera…');
          logStep(`${index ? 'fallback serial' : 'tentativa inicial'} → ${strategy.label}`);
          recordDiagnostic('getUserMedia:start', { callId, label: strategy.label, constraints: strategy.constraints });
          try {
            const candidate = await acquireWithImmediateSnapshot(
              () => navigator.mediaDevices.getUserMedia(strategy.constraints),
              stream => captureImmediateSnapshot(stream, video, `normal:${strategy.label}`),
            );
            recordDiagnostic('getUserMedia:resolve', { callId, streamId: candidate.id, tracks: candidate.getVideoTracks().length });
            return candidate;
          } catch (error) {
            recordDiagnostic('getUserMedia:reject', {
              callId,
              detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
            });
            throw error;
          }
        },
        afterResolved: async (candidate, strategy) => {
          if (strategy.deviceId && classificationById.get(strategy.deviceId) === 'traseira') {
            const saved = saveCameraPreference(localStorage, strategy.deviceId, recordPreferenceStorageError);
            if (saved) recordDiagnostic('cameraPreference:saved', { deviceId: strategy.deviceId.slice(0, 8) });
            setScannerStatusMessage('Câmera traseira configurada.');
          } else if (!strategy.deviceId) {
            setScannerStatusMessage('Usando a câmera frontal como alternativa.');
            recordDiagnostic('cameraSelection:video_true_fallback', { label: candidate.getVideoTracks()[0]?.label || 'unnamed' });
          }
        },
        validate: async (candidate, strategy) => {
          const validation = await validateCandidate(candidate);
          if (!validation.usable) logStep(`stream_inutilizavel (${strategy.label}): ${validation.detail}`);
          return validation;
        },
        discard: (candidate, strategy) => {
          stopStreamTracks(candidate, `tentativa_inutilizavel_ou_erro:${strategy.label}`);
          if (streamRef.current === candidate) streamRef.current = null;
          if (video.srcObject === candidate) video.srcObject = null;
          recordDiagnostic('video:srcObject_removed', { strategy: strategy.label });
        },
        onFailure: (strategy, detail) => {
          if (!strategy.deviceId) return;
          failedDeviceIds.add(strategy.deviceId);
          recordDiagnostic('cameraDevice:temporarily_failed', {
            deviceId: strategy.deviceId.slice(0, 8), detail, failedCount: failedDeviceIds.size,
          });
          if (strategy.deviceId === savedDeviceId) {
            removeCameraPreference(localStorage, recordPreferenceStorageError);
            recordDiagnostic('cameraPreference:removed_after_failure', { deviceId: strategy.deviceId.slice(0, 8), detail });
          }
        },
        afterAttempt: () => new Promise(resolve => window.setTimeout(resolve, CAMERA_RELEASE_WAIT_MS)),
      });
      const selected = serialResult.selected;
      const selectedLabel = serialResult.selectedStrategy?.label ?? 'none';
      attemptResults.push(...serialResult.attempts);
      updateDebug({ attemptResults: [...attemptResults], currentStrategy: selected ? selectedLabel : 'finalizada' });

      if (!selected) {
        const endedImmediately = serialResult.attempts.some(attempt => attempt.detail === IMMEDIATE_TRACK_ENDED_CODE);
        throw new DOMException(
          endedImmediately ? IMMEDIATE_TRACK_ENDED_CODE : 'Todas as estratégias falharam ou retornaram stream inutilizável.',
          endedImmediately ? 'ImmediateTrackEndedError' : 'StreamEndedError',
        );
      }
      const track = selected.getVideoTracks()[0];
      updateDebug({
        permission: 'granted', streamExists: true, constraintUsed: selectedLabel,
        trackCount: selected.getVideoTracks().length,
        trackStates: selected.getVideoTracks().map(item => item.readyState),
        liveTrackStates: selected.getVideoTracks().filter(item => item.readyState === 'live').map(item => item.readyState),
        trackLabels: selected.getVideoTracks().map(item => item.label || 'unnamed'),
        selectedDeviceId: track.getSettings().deviceId?.slice(0, 8) ?? null,
        attemptResults: [...attemptResults], videoWidth: video.videoWidth, videoHeight: video.videoHeight,
        readyState: video.readyState, cameraReady: true, cameraError: null,
      });
      cameraReadyRef.current = true;
      setCameraReady(true);
      setCameraError(null);
      const capabilities = track.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
      if (capabilities?.torch) setTorchSupported(true);
    } catch (error: unknown) {
      stopCurrentStream('falha_inicializacao', thisInitId);
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : `Error: ${String(error)}`;
      logStep(`conclusão: falha ao abrir a câmera — ${detail}`);
      const trackEndedImmediately = error instanceof DOMException && error.name === 'ImmediateTrackEndedError';
      const webViewFallback = trackEndedImmediately && environment === 'webview_android'
        ? ' Caso o problema continue, feche e abra novamente o aplicativo ou utilize temporariamente o Chrome.'
        : '';
      setCameraError((trackEndedImmediately
        ? 'A câmera foi aberta, mas o vídeo foi interrompido pelo dispositivo. Feche outros aplicativos que estejam usando a câmera e tente novamente.'
        : error instanceof DOMException && error.name === 'StreamEndedError'
          ? 'Nenhuma estratégia de câmera produziu vídeo utilizável. Toque em "Tentar novamente".'
          : 'Não foi possível acessar a câmera. Verifique a permissão e tente novamente.')
        + webViewFallback + ' Você também pode validar a passagem manualmente.');
      updateDebug({ cameraError: detail, lastError: detail, attemptResults: [...attemptResults], streamExists: false });
    } finally {
      finish();
    }
  }, [logStep, logStreamSnapshot, minimalCameraMode, recordDiagnostic, stopCurrentStream, stopStreamTracks, updateDebug]);

  const startRawCamera = useCallback(async (
    video: HTMLVideoElement,
    testType: string,
    constraints: MediaStreamConstraints,
    device?: CameraDeviceCandidate,
  ) => {
    if (rawTestExecutedRef.current || initInProgressRef.current) return;
    rawTestExecutedRef.current = true;
    setRawTestExecuted(true);
    initInProgressRef.current = true;
    const clickedAt = new Date().toISOString();
    recordDiagnostic(device ? 'cameraDeviceTest:click' : 'cameraRaw:click', {
      testType, clickedAt, label: device?.label, classification: device?.classification,
      deviceId: device?.deviceId.slice(0, 8), constraints,
    });
    stopCurrentStream('inicio_teste_bruto');
    setCameraError(null);
    updateDebug({ ...INITIAL_DEBUG, initInProgress: true, initCount: 1, lastInitAt: clickedAt, currentStrategy: `bruto:${testType}`, scannerEngine: 'none' });

    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new DOMException('API de câmera indisponível.', 'SecurityError');
      }
      recordDiagnostic('getUserMedia:start', { testType, at: new Date().toISOString(), constraints });
      const stream = await acquireWithImmediateSnapshot(
        () => navigator.mediaDevices.getUserMedia(constraints),
        candidate => captureImmediateSnapshot(candidate, video, `raw:${testType}`),
      );
      recordDiagnostic('getUserMedia:resolve', { testType, at: new Date().toISOString() });
      if (getImmediateCameraFailure(stream)) {
        recordDiagnostic(IMMEDIATE_TRACK_ENDED_CODE, {
          testType, active: stream.active, trackState: stream.getVideoTracks()[0]?.readyState ?? 'ausente',
        });
        stopStreamTracks(stream, IMMEDIATE_TRACK_ENDED_CODE);
        throw new DOMException(IMMEDIATE_TRACK_ENDED_CODE, 'ImmediateTrackEndedError');
      }
      streamRef.current = stream;
      streamOwnerInitRef.current = 1;
      video.srcObject = stream;
      recordDiagnostic('video:srcObject_assigned', { testType, trackState: stream.getVideoTracks()[0]?.readyState ?? 'ausente' });
      try {
        recordDiagnostic('video:play_start', { testType });
        await video.play();
        recordDiagnostic('video:play_resolve', { testType });
      } catch (error) {
        recordDiagnostic('video:play_reject', { testType, detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
      }
      const frameReady = await waitForUsableCameraState(
        () => ({
          streamActive: stream.active,
          trackState: stream.getVideoTracks()[0]?.readyState ?? 'missing',
          videoConnected: video.isConnected,
          width: video.videoWidth,
          height: video.videoHeight,
        }),
        milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds)),
      );
      if (frameReady) recordDiagnostic('video:first_frame', { testType, width: video.videoWidth, height: video.videoHeight });
      const track = stream.getVideoTracks()[0];
      if (device) {
        const saved = persistApprovedBackCamera(device, frameReady, localStorage, recordPreferenceStorageError);
        if (saved) {
          recordDiagnostic('cameraDeviceTest:approved_back_camera', {
            label: device.label, deviceId: device.deviceId.slice(0, 8), preferenceSaved: true,
          });
          setApprovedRawDevice(device);
        } else if (frameReady) {
          recordDiagnostic('cameraDeviceTest:functional_not_saved_as_back', {
            classification: device.classification, deviceId: device.deviceId.slice(0, 8),
          });
        }
      }
      updateDebug({
        streamExists: true, trackCount: stream.getVideoTracks().length,
        trackStates: stream.getVideoTracks().map(item => item.readyState),
        liveTrackStates: stream.getVideoTracks().filter(item => item.readyState === 'live').map(item => item.readyState),
        trackLabels: stream.getVideoTracks().map(item => item.label || 'unnamed'),
        constraintUsed: `raw:${testType}`, selectedDeviceId: track?.getSettings().deviceId?.slice(0, 8) ?? null,
        videoWidth: video.videoWidth, videoHeight: video.videoHeight, readyState: video.readyState,
        cameraReady: frameReady, cameraError: frameReady ? null : 'sem_quadro_real', currentStrategy: `bruto:${testType}:finalizado`,
      });
      cameraReadyRef.current = frameReady;
      setCameraReady(frameReady);
      if (!frameReady) setCameraError('O teste bruto terminou sem quadro real. Recarregue a página para repetir ou use outro link de teste.');
    } catch (error) {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      recordDiagnostic('getUserMedia:reject', { testType, at: new Date().toISOString(), detail });
      setCameraError(error instanceof DOMException && error.name === 'ImmediateTrackEndedError'
        ? 'A câmera foi aberta, mas o vídeo foi interrompido pelo dispositivo. Feche outros aplicativos que estejam usando a câmera e tente novamente.'
        : 'Não foi possível abrir a câmera neste teste. Recarregue a página e tente novamente.');
      updateDebug({ lastError: detail, cameraError: detail, currentStrategy: `bruto:${testType}:rejeitado` });
    } finally {
      initInProgressRef.current = false;
      updateDebug({ initInProgress: false });
    }
  }, [captureImmediateSnapshot, recordDiagnostic, recordPreferenceStorageError, stopCurrentStream, stopStreamTracks, updateDebug]);

  /* ---------- Libera o hardware apenas no desmonte real da tela ---------- */

  useEffect(() => {
    return () => { stopCurrentStream('desmontagem_da_tela'); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Reanexa o stream caso o elemento de vídeo seja recriado ---------- */

  useEffect(() => {
    if (!videoEl || !streamRef.current) return;
    if (videoEl.srcObject !== streamRef.current) {
      videoEl.srcObject = streamRef.current;
      void videoEl.play().catch(() => undefined);
    }
  }, [videoEl]);

  /* ---------- Visibility change ---------- */

  useEffect(() => {
    const handleVisibility = () => {
      const state = document.visibilityState;
      const inProgress = initInProgressRef.current;
      console.log(`[CAM] visibilitychange → ${state}, initInProgress=${inProgress}, cameraReady=${cameraReadyRef.current}`);
      // O diálogo de permissão também dispara visibilitychange: só encerra quando
      // a câmera já estava pronta e não há inicialização pendente.
      if (state === 'hidden' && !inProgress && cameraReadyRef.current) {
        stopCurrentStream('pagina_em_background');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [stopCurrentStream]);

  /* ---------- QR scanning loop ---------- */



  useEffect(() => {
    if (!shouldStartScanner(minimalCameraMode, scannerSupported, rawDiagnosticActive) || !cameraReady || !videoEl || overlay || serviceOverlay || processing) return;

    scanIntervalRef.current = window.setInterval(async () => {
      if (!videoEl || scanLocked || processing || overlay || serviceOverlay) return;
      try {
        let token = '';
        if (scannerEngineRef.current === 'barcode_detector') {
          if (!detectorRef.current) return;
          const detected = await detectorRef.current.detect(videoEl);
          token = detected?.[0]?.rawValue?.trim() ?? '';
        } else if (scannerEngineRef.current === 'jsqr') {
          const width = videoEl.videoWidth;
          const height = videoEl.videoHeight;
          if (!width || !height) return;
          if (!frameCanvasRef.current) frameCanvasRef.current = document.createElement('canvas');
          const canvas = frameCanvasRef.current;
          canvas.width = width;
          canvas.height = height;
          if (!frameContextRef.current) frameContextRef.current = canvas.getContext('2d', { willReadFrequently: true });
          const ctx = frameContextRef.current;
          if (!ctx) return;
          ctx.drawImage(videoEl, 0, 0, width, height);
          const image = ctx.getImageData(0, 0, width, height);
          const result = jsQR(image.data, width, height, { inversionAttempts: 'dontInvert' });
          token = result?.data?.trim() ?? '';
        } else {
          return;
        }
        if (token) {
          setScannerStatusMessage(null);
          await handleValidate(token, phaseConfig.action);
        }
      } catch (err: any) {
        console.error('[SCAN] erro no loop de leitura', {
          engine: scannerEngineRef.current,
          message: err?.message,
          name: err?.name,
        });
        // Não deixar falha de leitura silenciosa em campo: expor aviso curto após erros repetidos.
        scanErrorCountRef.current += 1;
        if (scanErrorCountRef.current >= 3) {
          setScannerStatusMessage('Erro ao iniciar leitura do QR. Tentando reinicializar...');
          updateDebug({ lastError: `scanner_loop:${err?.name ?? 'unknown'}` });
          if (videoEl) {
            startCamera(videoEl);
          }
        }
      }
    }, 300);

    return () => {
      if (scanIntervalRef.current) {
        window.clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    };
  }, [cameraReady, handleValidate, minimalCameraMode, overlay, processing, rawDiagnosticActive, scanLocked, scannerSupported, serviceOverlay, startCamera, videoEl]);

  useEffect(() => {
    if (!cameraReady || rawDiagnosticActive || minimalCameraMode || overlay || processing) return;

    const id = window.setInterval(() => {
      if (Date.now() - lastScanSuccessAtRef.current >= 15000) {
        setScannerStatusMessage('Câmera ativa, mas nenhum QR foi reconhecido ainda.');
      }
    }, 1000);

    return () => window.clearInterval(id);
  }, [cameraReady, minimalCameraMode, overlay, processing, rawDiagnosticActive]);

  useEffect(() => {
    if (!cameraReady || minimalCameraMode || rawDiagnosticActive) return;
    if (!scannerSupported) {
      setScannerStatusMessage('Leitura indisponível neste navegador. Use o token manual do QR.');
    }
  }, [cameraReady, minimalCameraMode, rawDiagnosticActive, scannerSupported]);

  /* ---------- Keep debug in sync ---------- */

  useEffect(() => {
    if (!videoEl) return;
    const id = window.setInterval(() => {
      const liveTrackStates = streamRef.current
        ? streamRef.current.getVideoTracks().map(t => t.readyState)
        : [];
      setDebugInfo(prev => ({
        ...prev,
        videoWidth: videoEl.videoWidth,
        videoHeight: videoEl.videoHeight,
        readyState: videoEl.readyState,
        cameraReady,
        cameraError,
        liveTrackStates,
      }));
    }, 1000);
    return () => window.clearInterval(id);
  }, [videoEl, cameraReady, cameraError]);

  const resetOverlay = useCallback(() => {
    if (autoResetTimerRef.current) {
      window.clearTimeout(autoResetTimerRef.current);
      autoResetTimerRef.current = null;
    }
    setOverlay(null);
    setServiceOverlay(null);
    setServiceEventName(null);
    setServiceActionFeedback(null);
    setConsumingItemId(null);
    setScannerStatusMessage(null);
    setProcessing(false);
    // Re-read prefs in case user changed them
    setDriverPrefs(getDriverPreferences());
  }, []);

  // Trigger feedback + auto-reset when overlay appears
  useEffect(() => {
    if (!overlay) return;
    const prefs = driverPrefs;
    const isSuccess = overlay.result === 'success';
    if (prefs.soundEnabled) playBeep(isSuccess);
    if (prefs.vibrationEnabled) vibrateDevice(isSuccess);
    if (prefs.scanMode === 'auto') {
      autoResetTimerRef.current = window.setTimeout(() => {
        resetOverlay();
      }, 2000);
    }
    return () => {
      if (autoResetTimerRef.current) {
        window.clearTimeout(autoResetTimerRef.current);
        autoResetTimerRef.current = null;
      }
    };
  }, [overlay, driverPrefs, resetOverlay]);

  // --- Auth guards ---
  // Resiliência: evita spinner infinito quando o role não resolve.
  const [roleTimedOut, setRoleTimedOut] = useState(false);
  useEffect(() => {
    if (loading || userRole) { setRoleTimedOut(false); return; }
    if (!user) return;
    const t = window.setTimeout(() => setRoleTimedOut(true), 3000);
    return () => window.clearTimeout(t);
  }, [loading, userRole, user]);

  // Depois que o perfil resolve uma vez, um refresh de sessão não pode desmontar a tela
  // (isso encerraria o stream da câmera no meio da inicialização).
  useEffect(() => {
    if (userRole) roleResolvedRef.current = true;
  }, [userRole]);

  // Só bloqueia a tela inteira na carga inicial; refresh de token mantém o <video> montado.
  if (loading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user && !loading) return <Navigate to="/login" replace />;
  if (!userRole && !roleResolvedRef.current) {
    if (!roleTimedOut) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 space-y-4 text-center">
            <p className="text-base font-semibold">Não foi possível identificar seu perfil nesta empresa.</p>
            <p className="text-sm text-muted-foreground">
              Verifique com o administrador se seu acesso operacional está vinculado à empresa correta. Você pode voltar para a tela inicial do validador ou sair e entrar novamente.
            </p>
            <div className="flex gap-2 justify-center pt-2">
              <Button variant="outline" onClick={() => navigate('/validador')}>Voltar</Button>
              <Button variant="ghost" onClick={() => supabase.auth.signOut()}>Sair</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (userRole && !canAccessDriverPortal) return <Navigate to="/admin/eventos" replace />;


  return (
    <div className="min-h-screen bg-background px-4 py-4">
      <div className="mx-auto w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/validador')}>Voltar</Button>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-medium">
              {phaseConfig.label}
            </Badge>
            <span className="text-sm text-muted-foreground">Validação QR</span>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-4 p-4">
            {/* Camera viewport */}
            <div className="relative overflow-hidden rounded-xl border bg-black/90" style={{ minHeight: '300px' }}>
              <video
                ref={videoRef}
                className="aspect-[3/4] w-full object-cover"
                autoPlay
                muted
                playsInline
                // @ts-ignore — webkit-playsinline for older iOS
                webkit-playsinline="true"
              />

              {/* Scan frame overlay */}
              {cameraReady && !overlay && !minimalCameraMode && !rawDiagnosticActive && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative h-48 w-48">
                    <div className="absolute left-0 top-0 h-8 w-8 border-l-4 border-t-4 border-white/80 rounded-tl-lg" />
                    <div className="absolute right-0 top-0 h-8 w-8 border-r-4 border-t-4 border-white/80 rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 h-8 w-8 border-b-4 border-l-4 border-white/80 rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 h-8 w-8 border-b-4 border-r-4 border-white/80 rounded-br-lg" />
                  </div>
                  <p className="absolute bottom-4 left-0 right-0 text-center text-xs text-white/90 drop-shadow-md px-4">
                    Aponte a câmera para o QR Code da passagem ou dos serviços
                  </p>
                </div>
              )}

              {!cameraReady && !cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white/90">
                  <p className="text-sm">{cameraRawDevicesMode ? 'Selecione uma câmera na lista de dispositivos abaixo.' : cameraRawMode ? `Teste bruto ativo: ${cameraRawMode}. Uma execução por carregamento.` : minimalCameraMode ? 'Abra somente a câmera para o teste mínimo.' : 'Abra a câmera para ler o QR Code da passagem.'}</p>
                  {!cameraRawDevicesMode && <Button type="button" onClick={() => videoEl && (cameraRawMode ? startRawCamera(videoEl, cameraRawMode, RAW_CAMERA_CONSTRAINTS[cameraRawMode]) : startCamera(videoEl))} disabled={debugInfo.initInProgress || (Boolean(cameraRawMode) && rawTestExecuted)}>
                    {debugInfo.initInProgress ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
                    {debugInfo.initInProgress ? 'Abrindo câmera...' : cameraRawMode && rawTestExecuted ? 'Teste executado — recarregue para repetir' : 'Abrir câmera'}
                  </Button>}
                </div>
              )}

              {/* Flash toggle */}
              {torchSupported && cameraReady && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={`absolute right-3 top-3 rounded-full ${torchOn ? 'bg-yellow-400/80 text-black' : 'bg-black/40 text-white'}`}
                  onClick={toggleTorch}
                  aria-label={torchOn ? 'Desligar flash' : 'Ligar flash'}
                >
                  <Zap className="h-5 w-5" />
                </Button>
              )}

              {/* ===== SCAN RESULT OVERLAY ===== */}
              {overlay && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/75 p-6">
                  {overlay.result === 'success' ? (
                    <CheckCircle2 className="h-14 w-14 text-green-400 mb-2" />
                  ) : (
                    <AlertCircle className="h-14 w-14 text-red-400 mb-2" />
                  )}
                  <h2 className="text-xl font-bold text-white mb-1">
                    {overlay.result === 'success' ? phaseConfig.successTitle : 'PASSAGEM INVÁLIDA'}
                  </h2>
                  <p className="text-sm text-white/70 mb-3">{reasonLabel}</p>

                  <div className="w-full max-w-xs space-y-1 rounded-lg bg-white/10 p-3 text-sm text-white/90">
                    <p><strong>Passageiro:</strong> {overlay.passenger_name ?? '—'}</p>
                    <p><strong>Assento:</strong> {overlay.seat_label ?? '—'}</p>
                    <p><strong>Evento:</strong> {overlay.event_name ?? '—'}</p>
                    {overlay.boarding_label && <p><strong>Embarque:</strong> {overlay.boarding_label}</p>}
                  </div>

                  <div className="mt-4 flex w-full max-w-xs flex-col gap-2">
                    {driverPrefs.scanMode === 'auto' ? (
                      <p className="text-xs text-white/60 text-center">Leitura automática em 2s…</p>
                    ) : (
                      <Button className="h-12 w-full text-base" onClick={resetOverlay}>
                        <RotateCcw className="mr-2 h-4 w-4" />
                        {overlay.result === 'success' ? 'Ler próximo' : 'Tentar novamente'}
                      </Button>
                    )}
                    {overlay.result === 'success' && (
                      <Button variant="secondary" className="w-full" onClick={() => navigate('/validador/embarque')}>
                        <Users className="mr-2 h-4 w-4" />
                        Lista de passageiros
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {serviceOverlay && (
              <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
                <div className="space-y-1 text-sm">
                  <p className="font-semibold">Validação de serviços</p>
                  <p className="text-muted-foreground">{serviceReasonLabel}</p>
                  <p><strong>Cliente:</strong> {serviceOverlay.customer_name ?? '—'}</p>
                  <p><strong>Status da venda:</strong> {serviceOverlay.status ?? '—'}</p>
                  <p><strong>Pagamento:</strong> {serviceOverlay.payment_method ?? '—'}</p>
                  <p><strong>Evento:</strong> {serviceEventName ?? '—'}</p>
                </div>

                <div className="space-y-2">
                  {serviceOverlay.items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum serviço encontrado para esta venda.</p>
                  ) : serviceOverlay.items.map((item) => (
                    <div key={item.item_id} className="rounded-lg border bg-background p-3 text-sm">
                      <p className="font-medium">{item.service_name}</p>
                      <p><strong>Unidade:</strong> {item.unit_type}</p>
                      <p><strong>Comprada:</strong> {item.quantity_total}</p>
                      <p><strong>Usada:</strong> {item.quantity_used}</p>
                      <p><strong>Restante:</strong> {item.quantity_remaining}</p>
                      <p><strong>Status:</strong> {item.status}</p>
                      <p><strong>Consumível:</strong> {item.is_consumable ? 'Sim' : 'Não'}</p>
                      {!item.is_consumable && item.consume_block_reason && (
                        <p className="text-xs text-destructive">
                          Motivo: {itemBlockReasonMessages[item.consume_block_reason] ?? item.consume_block_reason}
                        </p>
                      )}
                      {item.is_consumable && (
                        <Button
                          className="mt-2"
                          size="sm"
                          disabled={consumingItemId === item.item_id}
                          onClick={() => handleConsumeServiceItem(item.item_id)}
                        >
                          {consumingItemId === item.item_id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Consumir 1
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {serviceActionFeedback && <p className="text-xs text-muted-foreground">{serviceActionFeedback}</p>}
                <Button className="w-full" onClick={resetOverlay}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Ler próximo
                </Button>
              </div>
            )}

            {/* Camera error with retry */}
            {cameraError && (
              <div className="space-y-2">
                <p className="text-sm text-destructive">{cameraError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={debugInfo.initInProgress || rawDiagnosticActive}
                  onClick={() => videoEl && startCamera(videoEl)}
                >
                  {debugInfo.initInProgress ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  {debugInfo.initInProgress ? `Inicializando: ${debugInfo.currentStrategy}` : 'Tentar novamente'}
                </Button>
              </div>
            )}

            {/* Manual token fallback */}
            {!minimalCameraMode && !rawDiagnosticActive && <div className="space-y-2">
              <Label htmlFor="manual-token">Token do QR (fallback)</Label>
              <div className="flex gap-2">
                <Input
                  id="manual-token"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="Cole aqui o token do QR"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!manualToken.trim() || processing}
                  onClick={() => handleValidate(manualToken.trim(), phaseConfig.action)}
                >
                  <QrCode className="h-4 w-4" />
                </Button>
              </div>
              {scannerStatusMessage && (
                <p className="text-xs text-amber-600">{scannerStatusMessage}</p>
              )}
            </div>}
          </CardContent>
        </Card>

        {/* ========== TEMPORARY DEBUG PANEL ========== */}
        {cameraDebug && <details className="rounded-lg border border-muted bg-muted/20 p-2 text-xs" open>
          <summary className="cursor-pointer font-mono text-muted-foreground">🔧 Debug câmera</summary>
          <div className="mt-2 grid gap-1 font-mono">
            <a className="underline" href="?cameraDebug=1&cameraRaw=generic">Teste bruto — video:true</a>
            <a className="underline" href="?cameraDebug=1&cameraRaw=ideal">Teste bruto — traseira preferencial</a>
            <a className="underline" href="?cameraDebug=1&cameraRaw=exact">Teste bruto — traseira obrigatória</a>
            <a className="underline" href="?cameraDebug=1&cameraRaw=devices">Teste bruto — dispositivo individual</a>
          </div>
          <p className="mt-1 font-mono">teste bruto ativo: {cameraRawDevicesMode ? 'devices' : cameraRawMode ?? 'nenhum'}</p>
          {cameraRawDevicesMode && <div className="mt-2 space-y-3">
            {rawDevicesError && <p className="text-destructive">Falha ao listar: {rawDevicesError}</p>}
            {approvedRawDevice && <div className="rounded border border-green-500/40 bg-green-500/10 p-3">
              <p className="font-semibold text-green-700">Câmera traseira aprovada</p>
              <p>{approvedRawDevice.label}</p>
              <p className="font-mono">ID: {approvedRawDevice.deviceId.slice(0, 8)}…</p>
              <p>Ela será priorizada no validador.</p>
              <Button
                type="button"
                size="sm"
                className="mt-2 w-full"
                onClick={() => {
                  stopCurrentStream('voltar_validador_normal');
                  window.location.assign('/validador/validar');
                }}
              >Voltar ao validador normal</Button>
            </div>}
            {(['traseira', 'frontal', 'não classificada'] as CameraDeviceClassification[]).map(classification => (
              <div key={classification} className="space-y-1 rounded border p-2">
                <p className="font-semibold capitalize">{classification}s</p>
                {rawDevices.filter(device => device.classification === classification).length === 0
                  ? <p className="text-muted-foreground">nenhuma</p>
                  : rawDevices.filter(device => device.classification === classification).map(device => (
                    <div key={device.deviceId} className="rounded bg-background p-2 font-mono">
                      <p>{device.label}</p>
                      <p>deviceId: {device.deviceId.slice(0, 8)}…</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-1 w-full"
                        disabled={rawTestExecuted || debugInfo.initInProgress || !videoEl}
                        onClick={() => videoEl && startRawCamera(
                          videoEl,
                          `device:${device.deviceId.slice(0, 8)}`,
                          createDeviceCameraConstraints(device.deviceId),
                          device,
                        )}
                      >{rawTestExecuted ? 'Recarregue para outro teste' : 'Testar esta câmera'}</Button>
                    </div>
                  ))}
              </div>
            ))}
          </div>}
          {!rawDiagnosticActive && <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 w-full"
            disabled={debugInfo.initInProgress}
            onClick={() => {
              stopCurrentStream('troca_modo_minimo');
              setMinimalCameraMode(value => !value);
              setCameraError(null);
            }}
          >{minimalCameraMode ? 'Usar câmera com scanner' : 'Ativar teste mínimo sem scanner'}</Button>}
          <p className="mt-1 font-mono">modo: {cameraRawDevicesMode ? 'bruto:devices' : cameraRawMode ? `bruto:${cameraRawMode}` : minimalCameraMode ? 'mínimo (scanner desativado)' : 'com scanner'}</p>
          <button
            type="button"
            className="mt-2 mb-1 w-full rounded border border-muted bg-background px-2 py-1 font-mono text-xs active:bg-muted"
            onClick={() => {
              const attemptLines = debugInfo.attemptResults.map((a, i) =>
                `  tentativa ${i + 1} → ${a.label} [${a.deviceId}] → ${a.result}${a.detail ? ` (${a.detail})` : ''}`
              );
              const lines = [
                `permission: ${debugInfo.permission}`,
                `stream: ${debugInfo.streamExists ? '✅' : '❌'}`,
                `tracks: ${debugInfo.trackCount} — [${debugInfo.trackStates.join(', ')}]`,
                `liveTrackStates: [${debugInfo.liveTrackStates.join(', ')}]`,
                `labels: ${debugInfo.trackLabels.join(', ') || '—'}`,
                `constraint: ${debugInfo.constraintUsed}`,
                `selectedDeviceId: ${debugInfo.selectedDeviceId ?? '—'}`,
                `videoSize: ${debugInfo.videoWidth}×${debugInfo.videoHeight}`,
                `readyState: ${debugInfo.readyState}`,
                `cameraReady: ${debugInfo.cameraReady ? '✅' : '❌'}`,
                `cameraError: ${debugInfo.cameraError ?? '—'}`,
                `scanner: ${debugInfo.scannerSupported ? `✅ ${debugInfo.scannerEngine}` : '❌ não disponível'}`,
                `initInProgress: ${debugInfo.initInProgress ? '⏳ sim' : 'não'}`,
                `initCount: ${debugInfo.initCount}`,
                `currentStrategy: ${debugInfo.currentStrategy}`,
                `lastInitAt: ${debugInfo.lastInitAt ?? '—'}`,
                `lastError: ${debugInfo.lastError ?? '—'}`,
                `backCameras: ${debugInfo.candidateBackCameras.length > 0 ? debugInfo.candidateBackCameras.join(' | ') : 'nenhuma'}`,
                `devices: ${debugInfo.devices.length > 0 ? debugInfo.devices.join(' | ') : 'nenhum'}`,
                ...(attemptLines.length > 0 ? ['--- tentativas:', ...attemptLines] : ['--- tentativas: nenhuma']),
                `--- ambiente: ${debugInfo.environment === 'webview_android' ? 'WebView Android (app instalado)' : 'navegador'}`,
                ...(debugInfo.timeline.length > 0 ? ['--- timeline:', ...debugInfo.timeline.map(t => `  ${t}`)] : ['--- timeline: vazia']),
                '--- diagnóstico detalhado:',
                ...diagnosticLinesRef.current,
                `--- userAgent: ${navigator.userAgent}`,

              ];
              navigator.clipboard.writeText(lines.join('\n')).then(() => {
                const btn = document.activeElement as HTMLButtonElement;
                if (btn) { btn.textContent = '✅ Copiado!'; setTimeout(() => { btn.textContent = '📋 Copiar log'; }, 2000); }
              });
            }}
          >📋 Copiar log</button>
          <div className="mt-2 space-y-1 font-mono text-muted-foreground break-all">
            <p><strong>permission:</strong> {debugInfo.permission}</p>
            <p><strong>stream:</strong> {debugInfo.streamExists ? '✅' : '❌'}</p>
            <p><strong>tracks:</strong> {debugInfo.trackCount} — [{debugInfo.trackStates.join(', ')}]</p>
            <p><strong>liveTrackStates:</strong> [{debugInfo.liveTrackStates.join(', ')}]</p>
            <p><strong>labels:</strong> {debugInfo.trackLabels.join(', ') || '—'}</p>
            <p><strong>constraint:</strong> {debugInfo.constraintUsed}</p>
            <p><strong>selectedDeviceId:</strong> {debugInfo.selectedDeviceId ?? '—'}</p>
            <p><strong>videoSize:</strong> {debugInfo.videoWidth}×{debugInfo.videoHeight}</p>
            <p><strong>readyState:</strong> {debugInfo.readyState}</p>
            <p><strong>cameraReady:</strong> {debugInfo.cameraReady ? '✅' : '❌'}</p>
            <p><strong>cameraError:</strong> {debugInfo.cameraError ?? '—'}</p>
            <p><strong>scanner:</strong> {debugInfo.scannerSupported ? `✅ ${debugInfo.scannerEngine}` : '❌ não disponível'}</p>
            <p><strong>initInProgress:</strong> {debugInfo.initInProgress ? '⏳ sim' : 'não'}</p>
            <p><strong>initCount:</strong> {debugInfo.initCount}</p>
            <p><strong>currentStrategy:</strong> {debugInfo.currentStrategy}</p>
            <p><strong>lastInitAt:</strong> {debugInfo.lastInitAt ?? '—'}</p>
            <p><strong>lastError:</strong> {debugInfo.lastError ?? '—'}</p>
            <p><strong>backCameras:</strong></p>
            {debugInfo.candidateBackCameras.length > 0 ? (
              <ul className="ml-3 list-disc">
                {debugInfo.candidateBackCameras.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            ) : <p className="ml-3">nenhuma</p>}
            <p><strong>tentativas:</strong></p>
            {debugInfo.attemptResults.length > 0 ? (
              <ul className="ml-3 list-disc">
                {debugInfo.attemptResults.map((a, i) => (
                  <li key={i} className={a.result === 'success' ? 'text-green-600' : 'text-red-500'}>
                    #{i + 1} {a.label} [{a.deviceId}] → <strong>{a.result}</strong> {a.detail && `(${a.detail})`}
                  </li>
                ))}
              </ul>
            ) : <p className="ml-3">nenhuma</p>}
            <p><strong>ambiente:</strong> {debugInfo.environment === 'webview_android' ? 'WebView Android (app instalado)' : 'navegador'}</p>
            <p><strong>timeline:</strong></p>
            {debugInfo.timeline.length > 0 ? (
              <ol className="ml-3 list-decimal">
                {debugInfo.timeline.map((t, i) => <li key={i}>{t}</li>)}
              </ol>
            ) : <p className="ml-3">vazia</p>}
            <p><strong>devices:</strong></p>

            {debugInfo.devices.length > 0 ? (
              <ul className="ml-3 list-disc">
                {debugInfo.devices.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            ) : <p className="ml-3">nenhum listado</p>}
          </div>
        </details>}

        {/* Versão compacta */}
        <p className="mt-3 text-center text-[10px] text-muted-foreground">
          Build {APP_VERSION}
        </p>
      </div>
    </div>
  );
}
