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
  result: 'success' | 'track_ended' | 'no_frames' | 'error';
  detail?: string;
};

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
};

export default function DriverValidate() {
  const navigate = useNavigate();
  const { user, userRole, loading, activeCompanyId } = useAuth();
  const canAccessDriverPortal = userRole === 'motorista' || userRole === 'operador' || userRole === 'gerente' || userRole === 'developer';

  // Read active phase from localStorage
  const activePhase = user && activeCompanyId ? getPersistedPhase(user.id, activeCompanyId) : 'ida';
  const phaseConfig = PHASE_CONFIG[activePhase];

  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const scannerEngineRef = useRef<ScannerEngine>('none');
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const initInProgressRef = useRef(false);
  const initCountRef = useRef(0);
  const scanIntervalRef = useRef<number | null>(null);

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

  /* ---------- stopCurrentStream ---------- */

  const stopCurrentStream = useCallback(() => {
    console.log('[CAM] stopCurrentStream');
    if (scanIntervalRef.current) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  /* ---------- startCamera — core init routine ---------- */

  const startCamera = useCallback(async (video: HTMLVideoElement) => {
    // A solicitação nasce apenas do botão do usuário e a trava impede duas aberturas concorrentes.
    if (initInProgressRef.current) {
      console.info('[CAM] solicitação ignorada: inicialização já em andamento');
      return;
    }

    initInProgressRef.current = true;
    initCountRef.current += 1;
    const thisInitId = initCountRef.current;
    const initTimestamp = new Date().toISOString().slice(11, 23);
    const attemptResults: AttemptResult[] = [];
    console.info(`[CAM] solicitação #${thisInitId} iniciada`, { secureContext: window.isSecureContext });

    stopCurrentStream();
    setCameraError(null);
    updateDebug({ ...INITIAL_DEBUG, initInProgress: true, initCount: thisInitId, lastInitAt: initTimestamp });

    const finishInit = () => {
      initInProgressRef.current = false;
      updateDebug({ initInProgress: false });
    };

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      const reason = !window.isSecureContext ? 'contexto_inseguro' : 'api_indisponivel';
      console.error('[CAM] câmera indisponível', { reason });
      setCameraError('Não foi possível acessar a câmera. Abra o SmartBus em uma conexão segura e tente novamente. Você também pode validar a passagem manualmente.');
      updateDebug({ cameraError: reason, lastError: reason });
      finishInit();
      return;
    }

    try {
      try {
        const permission = await navigator.permissions.query({ name: 'camera' as PermissionName });
        console.info('[CAM] estado da permissão antes da solicitação', { state: permission.state });
        updateDebug({ permission: permission.state });
      } catch {
        updateDebug({ permission: 'api_unavailable' });
      }

      const hasBarcodeDetector = Boolean(window.BarcodeDetector);
      if (hasBarcodeDetector && window.BarcodeDetector) {
        detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
        scannerEngineRef.current = 'barcode_detector';
      } else {
        detectorRef.current = null;
        scannerEngineRef.current = 'jsqr';
        console.warn('[SCAN] BarcodeDetector indisponível; fallback jsQR ativado');
      }
      setScannerSupported(true);
      updateDebug({ scannerSupported: true, scannerEngine: scannerEngineRef.current });

      const enumerate = async (stage: 'antes' | 'depois') => {
        try {
          const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput');
          const labels = devices.map(device => `${device.label || 'unnamed'} [${device.deviceId.slice(0, 8)}]`);
          console.info(`[CAM] dispositivos ${stage} da autorização`, { count: devices.length, devices: labels });
          updateDebug({ devices: labels });
          return devices;
        } catch (error: any) {
          console.warn(`[CAM] enumerateDevices falhou ${stage}`, { name: error?.name, message: error?.message });
          return [];
        }
      };

      await enumerate('antes');

      const requestStream = async (label: string, constraints: MediaStreamConstraints) => {
        console.info('[CAM] getUserMedia', { label, constraints });
        let timedOut = false;
        const request = navigator.mediaDevices.getUserMedia(constraints).then(lateStream => {
          if (timedOut) lateStream.getTracks().forEach(track => track.stop());
          return lateStream;
        });
        const timeout = new Promise<never>((_, reject) => window.setTimeout(() => {
          timedOut = true;
          reject(new DOMException('A solicitação da câmera não respondeu em 15 segundos.', 'TimeoutError'));
        }, 15000));
        return Promise.race([request, timeout]);
      };

      let stream: MediaStream | null = null;
      let usedConstraint = 'none';
      const constraints: Array<[string, MediaStreamConstraints]> = [
        ['facingMode:environment', { video: { facingMode: { ideal: 'environment' } }, audio: false }],
        ['video:true', { video: true, audio: false }],
      ];

      for (const [label, constraint] of constraints) {
        try {
          stream = await requestStream(label, constraint);
          usedConstraint = label;
          attemptResults.push({ label, deviceId: '-', result: 'success' });
          console.info('[CAM] getUserMedia retornou stream', { label, tracks: stream.getVideoTracks().length });
          break;
        } catch (error: any) {
          const detail = `${error?.name ?? 'Error'}: ${error?.message ?? 'sem mensagem'}`;
          attemptResults.push({ label, deviceId: '-', result: 'error', detail });
          console.error('[CAM] getUserMedia falhou', { label, name: error?.name, message: error?.message, code: error?.code });
          updateDebug({ lastError: detail });
        }
      }

      if (!stream) throw new DOMException('Todas as constraints falharam.', 'NotReadableError');

      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      await enumerate('depois');

      const track = stream.getVideoTracks()[0];
      if (!track || track.readyState !== 'live') throw new DOMException('O stream não possui faixa de vídeo ativa.', 'NotReadableError');

      updateDebug({
        permission: 'granted', streamExists: true, constraintUsed: usedConstraint,
        trackCount: stream.getVideoTracks().length,
        trackStates: stream.getVideoTracks().map(item => item.readyState),
        trackLabels: stream.getVideoTracks().map(item => item.label || 'unnamed'),
        selectedDeviceId: track.getSettings().deviceId?.slice(0, 8) ?? null,
        attemptResults, videoWidth: video.videoWidth, videoHeight: video.videoHeight,
        readyState: video.readyState, cameraReady: true, cameraError: null,
      });
      setCameraReady(true);
      const capabilities = (track as any).getCapabilities?.();
      if (capabilities?.torch) setTorchSupported(true);
      console.info('[CAM] stream pronto', { constraint: usedConstraint, width: video.videoWidth, height: video.videoHeight });
    } catch (error: any) {
      stopCurrentStream();
      const detail = `${error?.name ?? 'Error'}: ${error?.message ?? 'sem mensagem'}`;
      console.error('[CAM] inicialização encerrada com falha', { name: error?.name, message: error?.message, code: error?.code });
      setCameraError('Não foi possível acessar a câmera. Verifique a permissão do aplicativo e tente novamente. Você também pode validar a passagem manualmente.');
      updateDebug({ cameraError: detail, lastError: detail, attemptResults, streamExists: false });
    } finally {
      finishInit();
    }
  }, [stopCurrentStream, updateDebug]);

  /* ---------- Camera init effect ---------- */

  useEffect(() => {
    if (!videoEl) return;
    // A câmera só é solicitada após o clique explícito; ao desmontar, libera o hardware.
    return () => { stopCurrentStream(); };
  }, [videoEl, stopCurrentStream]);

  /* ---------- Visibility change ---------- */

  useEffect(() => {
    if (!videoEl) return;
    const handleVisibility = () => {
      const state = document.visibilityState;
      const inProgress = initInProgressRef.current;
      console.log(`[CAM] visibilitychange → ${state}, initInProgress=${inProgress}`);
      if (state === 'hidden' && !inProgress) {
        // Ao retornar, o botão visível cria um novo stream a partir de uma ação do usuário.
        stopCurrentStream();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [videoEl, startCamera, stopCurrentStream]);

  /* ---------- QR scanning loop ---------- */

  useEffect(() => {
    if (!scannerSupported || !cameraReady || !videoEl || overlay || serviceOverlay || processing) return;

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
  }, [cameraReady, handleValidate, overlay, processing, scanLocked, scannerSupported, serviceOverlay, startCamera, videoEl]);

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!userRole) {
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
  if (!canAccessDriverPortal) return <Navigate to="/admin/eventos" replace />;


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
                ref={setVideoEl}
                className="aspect-[3/4] w-full object-cover"
                autoPlay
                muted
                playsInline
                // @ts-ignore — webkit-playsinline for older iOS
                webkit-playsinline="true"
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

              {!cameraReady && !cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white/90">
                  <p className="text-sm">Abra a câmera para ler o QR Code da passagem.</p>
                  <Button type="button" onClick={() => videoEl && startCamera(videoEl)} disabled={debugInfo.initInProgress}>
                    {debugInfo.initInProgress ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
                    {debugInfo.initInProgress ? 'Abrindo câmera...' : 'Abrir câmera'}
                  </Button>
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
                  onClick={() => videoEl && startCamera(videoEl)}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Tentar novamente
                </Button>
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

        {/* ========== TEMPORARY DEBUG PANEL ========== */}
        <details className="rounded-lg border border-muted bg-muted/20 p-2 text-xs">
          <summary className="cursor-pointer font-mono text-muted-foreground">🔧 Debug câmera</summary>
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
                `lastInitAt: ${debugInfo.lastInitAt ?? '—'}`,
                `lastError: ${debugInfo.lastError ?? '—'}`,
                `backCameras: ${debugInfo.candidateBackCameras.length > 0 ? debugInfo.candidateBackCameras.join(' | ') : 'nenhuma'}`,
                `devices: ${debugInfo.devices.length > 0 ? debugInfo.devices.join(' | ') : 'nenhum'}`,
                ...(attemptLines.length > 0 ? ['--- tentativas:', ...attemptLines] : ['--- tentativas: nenhuma']),
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
            <p><strong>devices:</strong></p>
            {debugInfo.devices.length > 0 ? (
              <ul className="ml-3 list-disc">
                {debugInfo.devices.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            ) : <p className="ml-3">nenhum listado</p>}
          </div>
        </details>

        {/* Versão compacta */}
        <p className="mt-3 text-center text-[10px] text-muted-foreground">
          Build {APP_VERSION}
        </p>
      </div>
    </div>
  );
}
