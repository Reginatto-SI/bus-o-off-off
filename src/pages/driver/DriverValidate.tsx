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
import { cameraLog, clearCameraDiagnosticEvents, formatCameraDiagnosticLogs, getCameraDiagnosticEvents } from '@/lib/cameraDiagnostics';
import { shouldEnableMobileDeveloperConsole } from '@/components/system/MobileDeveloperConsole';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
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
type IsolatedTrackEvent = {
  event: 'ended' | 'mute' | 'unmute'; timestamp: string; elapsedMs: number;
  streamActive: boolean; trackReadyState: MediaStreamTrackState; trackMuted: boolean;
};
type IsolatedCameraResult = {
  requestedAt: string; camera: CameraFacing; constraints: MediaStreamConstraints; acquisitionMs?: number;
  initial?: {
    timestamp: string; streamActive: boolean; trackCount: number; videoTrackCount: number;
    trackReadyState?: MediaStreamTrackState; trackEnabled?: boolean; trackMuted?: boolean;
    facingMode?: string; trackWidth?: number; trackHeight?: number;
    tracks: Array<{ kind: string; readyState: MediaStreamTrackState; enabled: boolean; muted: boolean }>;
  };
  preview?: {
    videoReadyState?: number; videoWidth?: number; videoHeight?: number; streamActive?: boolean;
    trackReadyState?: MediaStreamTrackState; trackEnabled?: boolean; trackMuted?: boolean; errorName?: string;
  };
  events: IsolatedTrackEvent[];
  acquisitionErrorName?: string;
};

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

// REASON_MESSAGES now imported from driverPhaseConfig

export type CameraFacing = 'back' | 'front';

// `ideal` é a forma padrão (MDN/W3C) de pedir uma orientação: o navegador escolhe a lente
// adequada do aparelho. Não usamos `exact` nem `deviceId` porque isso transfere para o app
// uma escolha de lente que o navegador faz melhor — e foi justamente essa complexidade
// (enumerateDevices + fila de lentes) que divergiu da versão funcional do validador.
export const getCameraConstraints = (facing: CameraFacing): MediaStreamConstraints => ({
  video: { facingMode: { ideal: facing === 'back' ? 'environment' : 'user' } },
  audio: false,
});



export const stopAllMediaStreamTracks = (stream: Pick<MediaStream, 'getTracks'>) => {
  stream.getTracks().forEach(track => track.stop());
};

export const cleanupCameraResources = (
  video: Pick<HTMLVideoElement, 'srcObject'> | null,
  stream: Pick<MediaStream, 'getTracks'> | null,
) => {
  if (video) video.srcObject = null;
  if (stream) stopAllMediaStreamTracks(stream);
};

export const isCurrentCameraSession = (currentSessionId: number, candidateSessionId: number) =>
  currentSessionId === candidateSessionId;

type CameraAcquisitionResult = { status: 'attached'; stream: MediaStream } | { status: 'stale'; stream: null };

const PREVIEW_IMAGE_TIMEOUT_MS = 5_000;

export class CameraPreviewUnavailableError extends Error {
  constructor() {
    super('The camera stream did not provide a video image.');
    this.name = 'CameraPreviewUnavailableError';
  }
}

export class CameraStreamInvalidError extends Error {
  constructor() {
    super('The camera stream is not active.');
    this.name = 'CameraStreamInvalidError';
  }
}

export const waitForVideoImage = (
  video: Pick<HTMLVideoElement, 'videoWidth' | 'videoHeight' | 'addEventListener' | 'removeEventListener'>,
  timeoutMs = PREVIEW_IMAGE_TIMEOUT_MS,
) => new Promise<void>((resolve, reject) => {
  // Alguns navegadores expõem dimensões placeholder, como 2x2, sem um preview real.
  const hasImage = () => video.videoWidth >= 16 && video.videoHeight >= 16;
  if (hasImage()) {
    resolve();
    return;
  }

  const timeoutId = window.setTimeout(() => finish(new CameraPreviewUnavailableError()), timeoutMs);
  const finish = (error?: Error) => {
    window.clearTimeout(timeoutId);
    video.removeEventListener('loadeddata', handleVideoData);
    video.removeEventListener('canplay', handleVideoData);
    video.removeEventListener('resize', handleVideoData);
    if (error) reject(error); else resolve();
  };
  const handleVideoData = () => {
    // Eventos naturais podem ocorrer antes de o navegador publicar as dimensões.
    if (hasImage()) finish();
  };

  video.addEventListener('loadeddata', handleVideoData);
  video.addEventListener('canplay', handleVideoData);
  video.addEventListener('resize', handleVideoData);
  // Uma única janela limitada evita deixar a UI eternamente em "Abrindo câmera".
});

export async function acquireCameraSession(input: {
  constraints: MediaStreamConstraints;
  video: Pick<HTMLVideoElement, 'srcObject' | 'play'> & Partial<Pick<HTMLVideoElement, 'videoWidth' | 'videoHeight' | 'readyState' | 'addEventListener' | 'removeEventListener'>>;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  isCurrent: () => boolean;
  onGranted?: (stream: MediaStream) => void;
  onInvalid?: (stream: MediaStream, track: MediaStreamTrack | undefined) => void;
  onAccepted?: (stream: MediaStream) => void;
  onReleased?: (stream: MediaStream) => void;
  onPlayed?: (stream: MediaStream) => void;
  waitForImage?: (video: HTMLVideoElement) => Promise<void>;
}): Promise<CameraAcquisitionResult> {
  const stream = await input.getUserMedia(input.constraints);
  input.onGranted?.(stream);
  if (!input.isCurrent()) {
    stopAllMediaStreamTracks(stream);
    return { status: 'stale', stream: null };
  }

  const videoTrack = stream.getVideoTracks()[0];
  // getUserMedia pode resolver mesmo quando a track já chegou encerrada; não publique esse stream.
  if (!videoTrack || !stream.active || videoTrack.readyState !== 'live') {
    input.onInvalid?.(stream, videoTrack);
    stopAllMediaStreamTracks(stream);
    throw new CameraStreamInvalidError();
  }

  input.onAccepted?.(stream);
  input.video.srcObject = stream;
  try {
    await input.video.play();
    input.onPlayed?.(stream);
    // play() confirma reprodução permitida, não que um frame com dimensões chegou.
    await (input.waitForImage ?? waitForVideoImage)(input.video as HTMLVideoElement);
  } catch (error) {
    // A aquisição aceita é dona apenas deste stream; uma rejeição de play não pode deixá-lo órfão.
    if (input.video.srcObject === stream) {
      input.video.srcObject = null;
      stopAllMediaStreamTracks(stream);
    }
    input.onReleased?.(stream);
    throw error;
  }

  if (!input.isCurrent()) {
    // Uma sessão antiga nunca desassocia o stream que uma sessão nova já colocou no mesmo vídeo.
    if (input.video.srcObject === stream) input.video.srcObject = null;
    stopAllMediaStreamTracks(stream);
    input.onReleased?.(stream);
    return { status: 'stale', stream: null };
  }

  return { status: 'attached', stream };
}

export function getCameraErrorMessage(errorName: string, facing: CameraFacing) {
  const alternative = facing === 'back' ? 'frontal' : 'traseira';
  switch (errorName) {
    case 'CameraStreamInvalidError':
      return `A câmera ${facing === 'back' ? 'traseira' : 'frontal'} foi acessada, mas não permaneceu ativa. Tente novamente ou utilize a câmera ${alternative}.`;
    case 'CameraPreviewUnavailableError':
      return `A câmera ${facing === 'back' ? 'traseira' : 'frontal'} foi acessada, mas não forneceu imagem. Tente novamente ou utilize a câmera ${alternative}.`;
    case 'NotAllowedError':
      return 'O acesso à câmera foi negado. Autorize a câmera nas permissões do navegador e tente novamente.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return `A câmera selecionada não está disponível. Tente utilizar a câmera ${alternative}.`;
    case 'NotReadableError':
      return 'A câmera está indisponível ou sendo utilizada por outro aplicativo. Feche outros usos da câmera e tente novamente.';
    case 'SecurityError':
      return 'O navegador não permitiu acessar a câmera neste contexto.';
    case 'AbortError':
      return 'A abertura da câmera foi interrompida. Tente novamente.';
    default:
      return `Não foi possível abrir a câmera. Tente novamente ou utilize a câmera ${alternative}.`;
  }
}

const formatIsolatedCameraResult = (result: IsolatedCameraResult) => {
  const initial = result.initial;
  const preview = result.preview;
  return [
    '=== SMARTBUS ISOLATED CAMERA TEST ===', '',
    `Data: ${result.requestedAt}`,
    `Rota: ${window.location.pathname}`,
    `User Agent: ${navigator.userAgent}`,
    `Câmera solicitada: ${result.camera === 'back' ? 'traseira' : 'frontal'}`,
    `Constraints: ${JSON.stringify(result.constraints)}`,
    `Tempo até getUserMedia resolver: ${result.acquisitionMs ?? 'não resolveu'} ms`, '',
    'SNAPSHOT APÓS GETUSERMEDIA',
    `streamActive: ${initial?.streamActive ?? 'indisponível'}`,
    `trackCount: ${initial?.trackCount ?? 'indisponível'}`,
    `videoTrackCount: ${initial?.videoTrackCount ?? 'indisponível'}`,
    `trackReadyState: ${initial?.trackReadyState ?? 'indisponível'}`,
    `trackEnabled: ${initial?.trackEnabled ?? 'indisponível'}`,
    `trackMuted: ${initial?.trackMuted ?? 'indisponível'}`,
    `facingMode: ${initial?.facingMode ?? 'indisponível'}`,
    `trackWidth: ${initial?.trackWidth ?? 'indisponível'}`,
    `trackHeight: ${initial?.trackHeight ?? 'indisponível'}`,
    `tracks: ${JSON.stringify(initial?.tracks ?? [])}`,
    `acquisitionErrorName: ${result.acquisitionErrorName ?? 'nenhum'}`, '',
    'SNAPSHOT APÓS VIDEO.PLAY',
    `videoReadyState: ${preview?.videoReadyState ?? 'não iniciado'}`,
    `videoWidth: ${preview?.videoWidth ?? 'não iniciado'}`,
    `videoHeight: ${preview?.videoHeight ?? 'não iniciado'}`,
    `streamActive: ${preview?.streamActive ?? 'não iniciado'}`,
    `trackReadyState: ${preview?.trackReadyState ?? 'não iniciado'}`,
    `trackEnabled: ${preview?.trackEnabled ?? 'não iniciado'}`,
    `trackMuted: ${preview?.trackMuted ?? 'não iniciado'}`,
    `playErrorName: ${preview?.errorName ?? 'nenhum'}`, '',
    'EVENTOS DA TRACK',
    ...(result.events.length ? result.events.map(event => JSON.stringify(event)) : ['nenhum']),
  ].join('\n');
};

const DECODER_ERROR_MESSAGE = 'Não foi possível ler o QR neste momento. A câmera continua ativa; tente apontá-la novamente.';


export default function DriverValidate() {
  const navigate = useNavigate();
  const { user, userRole, loading, activeCompanyId } = useAuth();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const canAccessDriverPortal = userRole === 'motorista' || userRole === 'operador' || userRole === 'gerente' || userRole === 'developer';
  // Reutiliza exatamente a autorização do Eruda para não criar uma segunda regra de acesso ao diagnóstico.
  const canUseCameraDiagnostics = shouldEnableMobileDeveloperConsole({
    authenticated: Boolean(user), userRole, isMobile, loading,
  });

  // Read active phase from localStorage
  const activePhase = user && activeCompanyId ? getPersistedPhase(user.id, activeCompanyId) : 'ida';
  const phaseConfig = PHASE_CONFIG[activePhase];

  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const scannerEngineRef = useRef<ScannerEngine>('none');
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const sessionIdRef = useRef(0);
  const mountedRef = useRef(true);
  const initInProgressRef = useRef(false);
  const scanIntervalRef = useRef<number | null>(null);
  const cameraReadyRef = useRef(false);
  const roleResolvedRef = useRef(false);
  const [selectedCamera, setSelectedCamera] = useState<CameraFacing | null>(null);
  const [cameraOpening, setCameraOpening] = useState(false);

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
  const [driverPrefs, setDriverPrefs] = useState(getDriverPreferences);
  const autoResetTimerRef = useRef<number | null>(null);
  const lastScanSuccessAtRef = useRef<number>(Date.now());
  const scanErrorCountRef = useRef<number>(0);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const attachedVideoRef = useRef<HTMLVideoElement | null>(null);

  // O laboratório mantém ownership próprio para nunca compartilhar recursos com o scanner produtivo.
  const diagnosticStreamRef = useRef<MediaStream | null>(null);
  const diagnosticVideoRef = useRef<HTMLVideoElement | null>(null);
  const diagnosticTrackRef = useRef<MediaStreamTrack | null>(null);
  const diagnosticRemoveListenersRef = useRef<(() => void) | null>(null);
  const diagnosticRequestIdRef = useRef(0);
  const diagnosticOpeningRef = useRef(false);
  const [diagnosticOpening, setDiagnosticOpening] = useState(false);
  const [diagnosticActive, setDiagnosticActive] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<IsolatedCameraResult | null>(null);

  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

  const videoRef = useCallback((node: HTMLVideoElement | null) => {
    videoElementRef.current = node;
    setVideoEl(node);
  }, []);

  const reasonLabel = useMemo(() => {
    if (!overlay) return '';
    return REASON_MESSAGES[overlay.reason_code] ?? 'Validação bloqueada';
  }, [overlay]);

  // Copia o buffer inteiro de uma vez e mantém o desenvolvedor na tela normal do validador.
  const copyCameraLogs = useCallback(async () => {
    if (getCameraDiagnosticEvents().length === 0) {
      toast({ title: 'Nenhum log de câmera registrado ainda.' });
      return;
    }
    try {
      await navigator.clipboard.writeText(formatCameraDiagnosticLogs({
        route: window.location.pathname,
        userAgent: navigator.userAgent,
      }));
      toast({ title: 'Logs da câmera copiados.' });
    } catch {
      toast({ title: 'Não foi possível copiar os logs.', variant: 'destructive' });
    }
  }, [toast]);

  const clearCameraLogs = useCallback(() => {
    clearCameraDiagnosticEvents();
  }, []);

  const closeIsolatedCameraTest = useCallback(() => {
    diagnosticRequestIdRef.current += 1;
    diagnosticOpeningRef.current = false;
    diagnosticRemoveListenersRef.current?.();
    diagnosticRemoveListenersRef.current = null;
    if (diagnosticVideoRef.current) diagnosticVideoRef.current.srcObject = null;
    diagnosticStreamRef.current?.getTracks().forEach(track => track.stop());
    diagnosticStreamRef.current = null;
    diagnosticTrackRef.current = null;
    if (mountedRef.current) {
      setDiagnosticOpening(false);
      setDiagnosticActive(false);
    }
  }, []);

  const startIsolatedCameraTest = useCallback(async (facing: CameraFacing) => {
    if (streamRef.current || initInProgressRef.current || cameraReadyRef.current) {
      toast({ title: 'Feche a câmera normal antes de iniciar o diagnóstico.' });
      return;
    }
    if (diagnosticOpeningRef.current || diagnosticStreamRef.current) return;

    const requestId = ++diagnosticRequestIdRef.current;
    const startedAt = performance.now();
    // O laboratório usa exatamente a mesma constraint do fluxo produtivo, para que o
    // resultado do diagnóstico represente o que o validador realmente pede ao navegador.
    const constraints = getCameraConstraints(facing);

    const baseResult: IsolatedCameraResult = {
      requestedAt: new Date().toISOString(), camera: facing, constraints, events: [],
    };

    diagnosticOpeningRef.current = true;
    setDiagnosticOpening(true);
    setDiagnosticResult(baseResult);

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const acquisitionMs = Math.round(performance.now() - startedAt);
      const tracks = stream.getTracks();
      const videoTracks = stream.getVideoTracks();
      const track = videoTracks[0];
      const settings = track?.getSettings();
      // Este snapshot precede srcObject, play e stop para preservar exatamente o estado entregue pelo navegador.
      const initial: IsolatedCameraResult['initial'] = {
        timestamp: new Date().toISOString(), streamActive: stream.active,
        trackCount: tracks.length, videoTrackCount: videoTracks.length,
        trackReadyState: track?.readyState, trackEnabled: track?.enabled, trackMuted: track?.muted,
        facingMode: settings?.facingMode, trackWidth: settings?.width, trackHeight: settings?.height,
        tracks: tracks.map(item => ({ kind: item.kind, readyState: item.readyState, enabled: item.enabled, muted: item.muted })),
      };
      const grantedResult = { ...baseResult, acquisitionMs, initial };

      if (requestId !== diagnosticRequestIdRef.current || !mountedRef.current) {
        tracks.forEach(item => item.stop());
        return;
      }

      diagnosticStreamRef.current = stream;
      diagnosticTrackRef.current = track ?? null;
      setDiagnosticActive(true);
      setDiagnosticResult(grantedResult);

      if (!track || !diagnosticVideoRef.current) return;
      const recordTrackEvent = (event: IsolatedTrackEvent['event']) => {
        const entry: IsolatedTrackEvent = {
          event, timestamp: new Date().toISOString(), elapsedMs: Math.round(performance.now() - startedAt),
          streamActive: stream.active, trackReadyState: track.readyState, trackMuted: track.muted,
        };
        setDiagnosticResult(current => current ? { ...current, events: [...current.events, entry] } : current);
      };
      const onEnded = () => recordTrackEvent('ended');
      const onMute = () => recordTrackEvent('mute');
      const onUnmute = () => recordTrackEvent('unmute');
      track.addEventListener('ended', onEnded);
      track.addEventListener('mute', onMute);
      track.addEventListener('unmute', onUnmute);
      diagnosticRemoveListenersRef.current = () => {
        track.removeEventListener('ended', onEnded);
        track.removeEventListener('mute', onMute);
        track.removeEventListener('unmute', onUnmute);
      };

      const video = diagnosticVideoRef.current;
      video.srcObject = stream;
      try {
        await video.play();
        setDiagnosticResult(current => current ? { ...current, preview: {
          videoReadyState: video.readyState, videoWidth: video.videoWidth, videoHeight: video.videoHeight,
          streamActive: stream.active, trackReadyState: track.readyState,
          trackEnabled: track.enabled, trackMuted: track.muted,
        } } : current);
      } catch (error: unknown) {
        const errorName = error instanceof Error ? error.name : 'Error';
        setDiagnosticResult(current => current ? { ...current, preview: {
          videoReadyState: video.readyState, videoWidth: video.videoWidth, videoHeight: video.videoHeight,
          streamActive: stream.active, trackReadyState: track.readyState,
          trackEnabled: track.enabled, trackMuted: track.muted, errorName,
        } } : current);
      }
    } catch (error: unknown) {
      const acquisitionErrorName = error instanceof Error ? error.name : 'Error';
      if (requestId === diagnosticRequestIdRef.current && mountedRef.current) {
        setDiagnosticResult({ ...baseResult, acquisitionErrorName });
      }
    } finally {
      if (requestId === diagnosticRequestIdRef.current) {
        diagnosticOpeningRef.current = false;
        if (mountedRef.current) setDiagnosticOpening(false);
      }
    }
  }, [toast]);

  const copyIsolatedCameraResult = useCallback(async () => {
    if (!diagnosticResult) {
      toast({ title: 'Nenhum resultado isolado registrado ainda.' });
      return;
    }
    try {
      await navigator.clipboard.writeText(formatIsolatedCameraResult(diagnosticResult));
      toast({ title: 'Resultado isolado copiado.' });
    } catch {
      toast({ title: 'Não foi possível copiar o resultado isolado.', variant: 'destructive' });
    }
  }, [diagnosticResult, toast]);

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
      const torchTrack = track as MediaStreamTrack & { applyConstraints: (constraints: { advanced: Array<{ torch: boolean }> }) => Promise<void> };
      await torchTrack.applyConstraints({ advanced: [{ torch: newState }] });
      setTorchOn(newState);
    } catch { /* torch not supported */ }
  }, [torchOn]);

  /* ---------- lifecycle centralizado da câmera ---------- */

  // Único ponto de encerramento: invalida a sessão, para decoder e tracks e desassocia o vídeo.
  const cleanupCamera = useCallback((reason: string) => {
    const endedSessionId = sessionIdRef.current;
    sessionIdRef.current += 1;
    if (scanIntervalRef.current !== null) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
      cameraLog('CAMERA DECODER STOP', { cameraSessionId: endedSessionId, reason });
    }
    const stream = streamRef.current;
    // O estado das tracks é lido ANTES do stop, para mostrar se a lente anterior ainda
    // estava viva quando a tela pediu o encerramento (hipótese de ocupação no Android).
    const trackStatesBeforeStop = stream?.getTracks().map(track => track.readyState) ?? [];
    const streamActiveBeforeStop = stream?.active ?? false;
    cleanupCameraResources(attachedVideoRef.current ?? videoElementRef.current, stream);
    if (stream) {
      cameraLog('CAMERA TRACK STOP', {
        cameraSessionId: endedSessionId,
        reason,
        trackCount: trackStatesBeforeStop.length,
        trackStatesBeforeStop,
        streamActiveBeforeStop,
      });
    }


    streamRef.current = null;
    attachedVideoRef.current = null;
    detectorRef.current = null;
    scannerEngineRef.current = 'none';
    cameraReadyRef.current = false;
    initInProgressRef.current = false;
    if (mountedRef.current) {
      setCameraReady(false);
      setCameraOpening(false);
      setTorchOn(false);
      setTorchSupported(false);
    }
    cameraLog('CAMERA SESSION END', { cameraSessionId: endedSessionId, reason });
  }, []);

  const startCamera = useCallback(async (video: HTMLVideoElement, facing: CameraFacing) => {
    if (initInProgressRef.current || diagnosticOpeningRef.current || diagnosticStreamRef.current) return;

    cleanupCamera('new_session');
    const cameraSessionId = ++sessionIdRef.current;
    initInProgressRef.current = true;
    setSelectedCamera(facing);
    setCameraOpening(true);
    setCameraError(null);
    setScannerStatusMessage(null);
    cameraLog('CAMERA SESSION START', { cameraSessionId, camera: facing });

    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new DOMException('API de câmera indisponível em contexto não seguro.', 'SecurityError');
      }

      // Uma escolha do usuário → uma constraint → uma aquisição. Sem enumeração, sem fila
      // de lentes e sem fallback: se esta aquisição falhar, o usuário decide o que fazer.
      const constraints = getCameraConstraints(facing);
      const requestedAt = performance.now();
      cameraLog('CAMERA REQUEST', { cameraSessionId, camera: facing, constraints });

      const acquisition = await acquireCameraSession({
        constraints,
        video,

        getUserMedia: requestedConstraints => navigator.mediaDevices.getUserMedia(requestedConstraints),
        // O prompt pode ocultar a página enquanto a Promise está pendente. A decisão
        // de aceitar o stream é feita somente quando a aquisição resolve.
        isCurrent: () => mountedRef.current
          && document.visibilityState === 'visible'
          && isCurrentCameraSession(sessionIdRef.current, cameraSessionId),
        onGranted: stream => {
          const track = stream.getVideoTracks()[0];
          const settings = track?.getSettings?.();
          // Diagnóstico deliberadamente não inclui deviceId nem qualquer conteúdo capturado.
          cameraLog('CAMERA GRANTED', {
            cameraSessionId,
            camera: facing,
            acquisitionMs: Math.round(performance.now() - requestedAt),
            streamActive: stream.active,
            videoTrackExists: Boolean(track),
            trackReadyState: track?.readyState,
            trackEnabled: track?.enabled,
            trackMuted: track?.muted,
            facingMode: settings?.facingMode,
            trackWidth: settings?.width,
            trackHeight: settings?.height,
            videoReadyState: video.readyState,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
          });
        },
        onInvalid: (stream, track) => cameraLog('CAMERA STREAM INVALID', {
          cameraSessionId,
          camera: facing,
          streamActive: stream.active,
          videoTrackExists: Boolean(track),
          trackReadyState: track?.readyState,
        }),
        onAccepted: stream => {
          streamRef.current = stream;
          attachedVideoRef.current = video;
        },
        onReleased: stream => {
          // O callback é protegido por identidade para nunca limpar ownership de uma sessão posterior.
          if (streamRef.current === stream) {
            streamRef.current = null;
            if (attachedVideoRef.current === video) attachedVideoRef.current = null;
          }
        },
        onPlayed: () => cameraLog('CAMERA PLAY RESOLVED', {
          cameraSessionId,
          camera: facing,
          videoReadyState: video.readyState,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
        }),
      });

      if (acquisition.status === 'stale') {
        cameraLog('CAMERA STALE STREAM DISCARDED', { cameraSessionId, camera: facing });
        return;
      }




      const stream = acquisition.stream;
      cameraLog('CAMERA PREVIEW READY', {
        cameraSessionId,
        camera: facing,
        videoReadyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      });
      detectorRef.current = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
      scannerEngineRef.current = detectorRef.current ? 'barcode_detector' : 'jsqr';
      setScannerSupported(true);
      cameraReadyRef.current = true;
      setCameraReady(true);
      const track = stream.getVideoTracks()[0];
      const capabilities = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
      setTorchSupported(Boolean(capabilities?.torch));
    } catch (error: unknown) {
      if (!isCurrentCameraSession(sessionIdRef.current, cameraSessionId)) return;
      const errorName = error instanceof DOMException ? error.name : error instanceof Error ? error.name : 'Error';
      cameraLog('CAMERA ERROR', { cameraSessionId, camera: facing, errorName, stage: 'capture' });
      cleanupCamera('capture_error');
      if (mountedRef.current) {
        setSelectedCamera(facing);
        setCameraError(getCameraErrorMessage(errorName, facing));
      }
    } finally {
      if (isCurrentCameraSession(sessionIdRef.current, cameraSessionId)) {
        initInProgressRef.current = false;
        if (mountedRef.current) setCameraOpening(false);
      }
    }
  }, [cleanupCamera]);

  /* ---------- Libera o hardware apenas no desmonte real da tela ---------- */

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanupCamera('component_unmount');
    };
  }, [cleanupCamera]);

  useEffect(() => () => closeIsolatedCameraTest(), [closeIsolatedCameraTest]);

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
      // Durante getUserMedia, hidden pode ser apenas o prompt de permissão. Um stream
      // que resolver ainda em background será descartado pela validação da aquisição.
      if (state === 'hidden' && !inProgress && cameraReadyRef.current) {
        cleanupCamera('page_background');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [cleanupCamera]);

  /* ---------- QR scanning loop ---------- */



  useEffect(() => {
    if (!scannerSupported || !cameraReady || !videoEl || overlay || serviceOverlay || processing) return;

    cameraLog('CAMERA DECODER START', {
      cameraSessionId: sessionIdRef.current,
      engine: scannerEngineRef.current,
    });
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
        // O contador representa apenas falhas consecutivas; qualquer ciclo de decode sem exceção recupera o scanner.
        scanErrorCountRef.current = 0;
        setScannerStatusMessage(current => current === DECODER_ERROR_MESSAGE ? null : current);
        if (token) {
          setScannerStatusMessage(null);
          await handleValidate(token, phaseConfig.action);
        }
      } catch (error: unknown) {
        const decoderError = error instanceof Error ? error : new Error(String(error));
        console.error('[SCAN] erro no loop de leitura', {
          engine: scannerEngineRef.current,
          message: decoderError.message,
          name: decoderError.name,
        });
        // O decoder apenas analisa frames: uma falha nunca reinicia nem encerra o MediaStream.
        scanErrorCountRef.current += 1;
        if (scanErrorCountRef.current >= 3) {
          setScannerStatusMessage(DECODER_ERROR_MESSAGE);
        }
      }
    }, 300);

    return () => {
      if (scanIntervalRef.current) {
        window.clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
        cameraLog('CAMERA DECODER STOP', { cameraSessionId: sessionIdRef.current, reason: 'decoder_paused' });
      }
    };
  }, [cameraReady, handleValidate, overlay, processing, scanLocked, scannerSupported, serviceOverlay, videoEl]);

  useEffect(() => {
    if (!cameraReady || overlay || processing) return;

    const id = window.setInterval(() => {
      if (Date.now() - lastScanSuccessAtRef.current >= 15000) {
        setScannerStatusMessage('Câmera ativa, mas nenhum QR foi reconhecido ainda.');
      }
    }, 1000);

    return () => window.clearInterval(id);
  }, [cameraReady, overlay, processing]);

  useEffect(() => {
    if (!cameraReady) return;
    if (!scannerSupported) {
      setScannerStatusMessage('Leitura indisponível neste navegador. Use o token manual do QR.');
    }
  }, [cameraReady, scannerSupported]);

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
            <div className="space-y-2">
              <p className="text-sm font-medium">Escolha a câmera para leitura</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={selectedCamera === 'back' ? 'default' : 'outline'}
                  className="h-auto min-h-20 flex-col gap-1 whitespace-normal px-3 py-3"
                  disabled={cameraOpening || diagnosticOpening || diagnosticActive || !videoEl}
                  onClick={() => videoEl && startCamera(videoEl, 'back')}
                >
                  <span>Câmera traseira</span>
                  <span className="text-xs font-normal opacity-80">Recomendada para QR Code</span>
                </Button>
                <Button
                  type="button"
                  variant={selectedCamera === 'front' ? 'default' : 'outline'}
                  className="h-auto min-h-20 flex-col gap-1 whitespace-normal px-3 py-3"
                  disabled={cameraOpening || diagnosticOpening || diagnosticActive || !videoEl}
                  onClick={() => videoEl && startCamera(videoEl, 'front')}
                >
                  <span>Câmera frontal</span>
                  <span className="text-xs font-normal opacity-80">Usar como alternativa</span>
                </Button>
              </div>
              {cameraReady && (
                <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => cleanupCamera('user_closed')}>
                  Fechar câmera
                </Button>
              )}
              {canUseCameraDiagnostics && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={copyCameraLogs}>
                    Copiar logs da câmera
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={clearCameraLogs}>
                    Limpar logs
                  </Button>
                </div>
              )}
            </div>

            {/* Camera viewport */}
            <div className="relative overflow-hidden rounded-xl border bg-black/90" style={{ minHeight: '300px' }}>
              <video
                ref={videoRef}
                className="aspect-[3/4] w-full object-cover"
                autoPlay
                muted
                playsInline
                {...{ 'webkit-playsinline': 'true' }}

              />

              {/* Scan frame overlay */}
              {cameraReady && !overlay && (
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

              {!cameraReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white/90">
                  {cameraOpening ? <Loader2 className="h-6 w-6 animate-spin" /> : <QrCode className="h-6 w-6" />}
                  <p className="text-sm">{cameraOpening ? 'Abrindo câmera…' : 'Escolha a câmera acima para iniciar a leitura.'}</p>
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
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" disabled={cameraOpening} onClick={() => videoEl && startCamera(videoEl, selectedCamera ?? 'back')}>
                    <RefreshCw className="mr-2 h-4 w-4" />Tentar novamente
                  </Button>
                  <Button variant="outline" size="sm" disabled={cameraOpening} onClick={() => videoEl && startCamera(videoEl, selectedCamera === 'front' ? 'back' : 'front')}>
                    Usar câmera {selectedCamera === 'front' ? 'traseira' : 'frontal'}
                  </Button>
                </div>
              </div>
            )}

            {/* Manual token fallback */}
            <div className="space-y-2">
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
            </div>
          </CardContent>
        </Card>

        {canUseCameraDiagnostics && (
          <Card>
            <CardContent className="space-y-3 p-4">
              <div>
                <p className="text-sm font-medium">Diagnóstico isolado da câmera</p>
                <p className="text-xs text-muted-foreground">Laboratório independente do scanner normal.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={diagnosticOpening || diagnosticActive}
                  onClick={() => void startIsolatedCameraTest('back')}
                >
                  Testar câmera traseira
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={diagnosticOpening || diagnosticActive}
                  onClick={() => void startIsolatedCameraTest('front')}
                >
                  Testar câmera frontal
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!diagnosticOpening && !diagnosticActive}
                  onClick={closeIsolatedCameraTest}
                >
                  Fechar teste
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={!diagnosticResult} onClick={copyIsolatedCameraResult}>
                  Copiar resultado
                </Button>
              </div>

              <video
                ref={diagnosticVideoRef}
                className="aspect-[3/4] w-full rounded-lg bg-black object-cover"
                autoPlay
                muted
                playsInline
              />

              {diagnosticResult && (
                <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-xs">
                  <p>Câmera solicitada: {diagnosticResult.camera === 'back' ? 'traseira' : 'frontal'}</p>
                  <p>Tempo de aquisição: {diagnosticResult.acquisitionMs === undefined ? 'aguardando' : `${(diagnosticResult.acquisitionMs / 1000).toFixed(1)} s`}</p>
                  <p>Stream ativo: {diagnosticResult.initial ? (diagnosticResult.initial.streamActive ? 'sim' : 'não') : 'indisponível'}</p>
                  <p>Track: {diagnosticResult.initial?.trackReadyState ?? 'indisponível'}</p>
                  <p>Facing mode: {diagnosticResult.initial?.facingMode ?? 'indisponível'}</p>
                  <p>Resolução reportada: {diagnosticResult.initial?.trackWidth ?? '—'} × {diagnosticResult.initial?.trackHeight ?? '—'}</p>
                  <p>Preview: {diagnosticResult.preview?.errorName
                    ? `erro ${diagnosticResult.preview.errorName}`
                    : diagnosticResult.preview
                      ? `${diagnosticResult.preview.videoWidth} × ${diagnosticResult.preview.videoHeight}`
                      : 'não iniciado'}</p>
                  {diagnosticResult.acquisitionErrorName && <p>Erro de aquisição: {diagnosticResult.acquisitionErrorName}</p>}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Versão compacta */}
        <p className="mt-3 text-center text-[10px] text-muted-foreground">
          Build {APP_VERSION}
        </p>
      </div>
    </div>
  );
}
