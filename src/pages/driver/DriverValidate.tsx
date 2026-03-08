import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
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

type BarcodeDetection = { rawValue?: string };
type BarcodeDetectorInstance = { detect: (source: HTMLVideoElement) => Promise<BarcodeDetection[]> };
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorInstance;

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

const REASON_MESSAGES: Record<string, string> = {
  ok: 'Operação realizada com sucesso',
  invalid_qr: 'QR inválido',
  already_checked_in: 'Já embarcado',
  sale_cancelled: 'Venda cancelada',
  sale_not_paid: 'Pagamento não confirmado',
  checkout_without_checkin: 'Saída sem embarque',
  already_checked_out: 'Saída já registrada',
  checkout_disabled: 'Saída desabilitada para este evento',
  not_allowed_company: 'Passagem de outra empresa',
  invalid_action: 'Ação inválida',
};

/* ------------------------------------------------------------------ */
/*  Debug state — temporary diagnostic panel for mobile field testing  */
/* ------------------------------------------------------------------ */
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
  constraintUsed: string;
  lastError: string | null;
  devices: string[];
  initInProgress: boolean;
  initCount: number;
  lastInitAt: string | null;
  liveTrackStates: string[];
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
  constraintUsed: 'none',
  lastError: null,
  devices: [],
  initInProgress: false,
  initCount: 0,
  lastInitAt: null,
  liveTrackStates: [],
};

/**
 * CONSTRAINT CHAIN — simplified (no resolution hints).
 * Some Android devices accept width/height constraints but return
 * a stream that never produces frames. Removing resolution ideals
 * forces the device to pick its native resolution which always works.
 */
const CAMERA_CONSTRAINTS_CHAIN: MediaStreamConstraints[] = [
  { video: { facingMode: { ideal: 'environment' } }, audio: false },
  { video: true, audio: false },
];

export default function DriverValidate() {
  const navigate = useNavigate();
  const { user, userRole, loading } = useAuth();
  const canAccessDriverPortal = userRole === 'motorista' || userRole === 'operador' || userRole === 'gerente' || userRole === 'developer';

  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
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
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo>(INITIAL_DEBUG);

  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

  const reasonLabel = useMemo(() => {
    if (!overlay) return '';
    return REASON_MESSAGES[overlay.reason_code] ?? 'Validação bloqueada';
  }, [overlay]);

  /* ---------- helpers ---------- */

  const updateDebug = useCallback((patch: Partial<DebugInfo>) => {
    setDebugInfo(prev => ({ ...prev, ...patch }));
  }, []);

  const lockScannerTemporarily = useCallback(() => {
    setScanLocked(true);
    window.setTimeout(() => setScanLocked(false), 1000);
  }, []);

  /* ---------- RPC validate ---------- */

  const handleValidate = useCallback(async (qrCodeToken: string, action: 'checkin' | 'checkout') => {
    if (!qrCodeToken || processing) return;
    setProcessing(true);
    lockScannerTemporarily();

    const { data, error } = await supabase.rpc('validate_ticket_scan', {
      p_qr_code_token: qrCodeToken,
      p_action: action,
      p_device_info: navigator.userAgent,
      p_app_version: import.meta.env.VITE_APP_VERSION ?? 'web',
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
    setOverlay(payload ?? {
      result: 'blocked', reason_code: 'invalid_response', checkout_enabled: false,
      passenger_name: null, seat_label: null, event_name: null,
      boarding_label: null, passenger_cpf_masked: null, boarding_status: null,
    });
    setManualToken(qrCodeToken);
    setProcessing(false);
  }, [lockScannerTemporarily, processing]);

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
    // Guard: prevent concurrent initializations (race condition fix)
    if (initInProgressRef.current) {
      console.log('[CAM] startCamera SKIPPED — init already in progress');
      return;
    }
    initInProgressRef.current = true;
    initCountRef.current += 1;
    const thisInitId = initCountRef.current;
    const initTimestamp = new Date().toISOString().slice(11, 23);
    console.log(`[CAM] startCamera #${thisInitId} BEGIN at ${initTimestamp}`);

    stopCurrentStream();
    setCameraError(null);
    updateDebug({ ...INITIAL_DEBUG, initInProgress: true, initCount: thisInitId, lastInitAt: initTimestamp });

    // 1. Check permission
    try {
      const perm = await navigator.permissions.query({ name: 'camera' as PermissionName });
      console.log('[CAM] permission state:', perm.state);
      updateDebug({ permission: perm.state });
    } catch {
      console.log('[CAM] permissions API not available');
      updateDebug({ permission: 'api_unavailable' });
    }

    // 2. Setup BarcodeDetector
    const hasBarcodeDetector = Boolean(window.BarcodeDetector);
    setScannerSupported(hasBarcodeDetector);
    updateDebug({ scannerSupported: hasBarcodeDetector });
    if (hasBarcodeDetector && window.BarcodeDetector) {
      detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
    }

    // 3. Enumerate devices for debug
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter(d => d.kind === 'videoinput');
      const deviceLabels = videoDevices.map(d => `${d.label || 'unnamed'} [${d.deviceId.slice(0, 8)}]`);
      console.log('[CAM] videoinput devices:', deviceLabels);
      updateDebug({ devices: deviceLabels });
    } catch (e) {
      console.warn('[CAM] enumerateDevices failed', e);
    }

    // 4. Try constraint chain
    let stream: MediaStream | null = null;
    let usedConstraint = 'none';

    for (let i = 0; i < CAMERA_CONSTRAINTS_CHAIN.length; i++) {
      const constraints = CAMERA_CONSTRAINTS_CHAIN[i];
      try {
        console.log(`[CAM] trying constraint #${i}:`, JSON.stringify(constraints));
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        usedConstraint = `chain[${i}]`;
        console.log(`[CAM] constraint #${i} SUCCESS`);
        break;
      } catch (err: any) {
        console.warn(`[CAM] constraint #${i} FAILED:`, err?.name, err?.message);
        updateDebug({ lastError: `constraint[${i}]: ${err?.name}: ${err?.message}` });
      }
    }

    // 5. If chain failed, try enumerateDevices fallback
    if (!stream) {
      console.log('[CAM] all constraints failed, trying enumerateDevices fallback');
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices.filter(d => d.kind === 'videoinput');
        // Prefer back camera
        const backCam = videoDevices.find(d =>
          /back|rear|environment|traseira/i.test(d.label)
        );
        const target = backCam ?? videoDevices[0];
        if (target) {
          console.log('[CAM] fallback device:', target.label, target.deviceId.slice(0, 8));
          stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: target.deviceId } },
            audio: false,
          });
          usedConstraint = `fallback:${target.label || target.deviceId.slice(0, 8)}`;
        }
      } catch (err: any) {
        console.error('[CAM] enumerateDevices fallback failed:', err);
        updateDebug({ lastError: `fallback: ${err?.name}: ${err?.message}` });
      }
    }

    if (!stream) {
      const errMsg = 'Não foi possível abrir a câmera. Verifique a permissão do navegador.';
      setCameraError(errMsg);
      updateDebug({ cameraError: errMsg, streamExists: false });
      return;
    }

    // 6. Bind stream
    streamRef.current = stream;
    video.srcObject = stream;

    const tracks = stream.getVideoTracks();
    console.log('[CAM] stream bound. Tracks:', tracks.length, tracks.map(t => `${t.label} state=${t.readyState}`));
    updateDebug({
      streamExists: true,
      constraintUsed: usedConstraint,
      trackCount: tracks.length,
      trackStates: tracks.map(t => t.readyState),
      trackLabels: tracks.map(t => t.label || 'unnamed'),
    });

    // 7. Wait for loadedmetadata + play()
    try {
      await new Promise<void>((resolve, reject) => {
        if (video.readyState >= 1) {
          console.log('[CAM] metadata already loaded (readyState=' + video.readyState + ')');
          resolve();
          return;
        }
        const onMeta = () => {
          video.removeEventListener('loadedmetadata', onMeta);
          console.log('[CAM] loadedmetadata fired');
          resolve();
        };
        video.addEventListener('loadedmetadata', onMeta);
        setTimeout(() => {
          video.removeEventListener('loadedmetadata', onMeta);
          reject(new Error('loadedmetadata timeout (5s)'));
        }, 5000);
      });

      console.log('[CAM] calling play()...');
      await video.play();
      console.log('[CAM] play() resolved');

      // 8. Frame validation — poll for real frames
      let frameConfirmed = false;
      for (let i = 0; i < 30; i++) {
        // Strict threshold: real cameras always produce > 100px
        if (video.videoWidth > 100 && video.videoHeight > 100) {
          frameConfirmed = true;
          break;
        }
        await new Promise(r => setTimeout(r, 100));
      }

      console.log('[CAM] frame check:', frameConfirmed, `${video.videoWidth}×${video.videoHeight}`, 'readyState=' + video.readyState);
      updateDebug({
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        readyState: video.readyState,
      });

      if (!frameConfirmed) {
        /**
         * STRICT: Do NOT mark cameraReady if no real frames detected.
         * This prevents the false-positive "camera ready but black screen".
         */
        const errMsg = 'Câmera abriu mas sem imagem. Toque em "Tentar novamente".';
        setCameraReady(false);
        setCameraError(errMsg);
        updateDebug({ cameraReady: false, cameraError: errMsg });
        console.warn('[CAM] NO FRAMES — cameraReady stays false');
        return;
      }

      setCameraReady(true);
      setCameraError(null);
      updateDebug({ cameraReady: true, cameraError: null });
      console.log('[CAM] ✅ camera fully ready');

      // Check torch
      const track = stream.getVideoTracks()[0];
      if (track) {
        const caps = (track as any).getCapabilities?.();
        if (caps?.torch) setTorchSupported(true);
      }
    } catch (err: any) {
      console.error(`[CAM] init #${thisInitId} failed:`, err);
      setCameraReady(false);
      const errMsg = `Erro ao iniciar câmera: ${err?.message || 'desconhecido'}`;
      setCameraError(errMsg);
      updateDebug({ cameraReady: false, cameraError: errMsg, lastError: err?.message });
    } finally {
      initInProgressRef.current = false;
      updateDebug({ initInProgress: false });
      console.log(`[CAM] startCamera #${thisInitId} END`);
    }
  }, [stopCurrentStream, updateDebug]);

  /* ---------- Camera init effect ---------- */

  useEffect(() => {
    if (!videoEl) return;
    startCamera(videoEl);
    return () => { stopCurrentStream(); };
  }, [videoEl, startCamera, stopCurrentStream]);

  /* ---------- Visibility change ---------- */

  useEffect(() => {
    if (!videoEl) return;
    const handleVisibility = () => {
      const state = document.visibilityState;
      const inProgress = initInProgressRef.current;
      console.log(`[CAM] visibilitychange → ${state}, initInProgress=${inProgress}`);
      if (state === 'visible') {
        startCamera(videoEl);
      } else {
        // Do NOT kill the stream if init is in progress (e.g. permission dialog open on Android)
        if (!inProgress) {
          stopCurrentStream();
        } else {
          console.log('[CAM] hidden ignored — init in progress (permission dialog?)');
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [videoEl, startCamera, stopCurrentStream]);

  /* ---------- QR scanning loop ---------- */

  useEffect(() => {
    if (!scannerSupported || !cameraReady || !videoEl || overlay || processing) return;

    scanIntervalRef.current = window.setInterval(async () => {
      if (!videoEl || !detectorRef.current || scanLocked || processing || overlay) return;
      try {
        const detected = await detectorRef.current.detect(videoEl);
        const token = detected?.[0]?.rawValue?.trim();
        if (token) {
          await handleValidate(token, 'checkin');
        }
      } catch { /* silent */ }
    }, 300);

    return () => {
      if (scanIntervalRef.current) {
        window.clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    };
  }, [cameraReady, handleValidate, overlay, processing, scanLocked, scannerSupported, videoEl]);

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

  const resetOverlay = () => {
    setOverlay(null);
    setProcessing(false);
  };

  // --- Auth guards ---
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!userRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!canAccessDriverPortal) return <Navigate to="/admin/eventos" replace />;

  return (
    <div className="min-h-screen bg-background px-4 py-4">
      <div className="mx-auto w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/motorista')}>Voltar</Button>
          <span className="text-sm text-muted-foreground">Validação QR</span>
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
                    Aponte a câmera para o QR Code da passagem
                  </p>
                </div>
              )}

              {!cameraReady && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-white/80">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Preparando câmera...
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
            </div>

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
                  onClick={() => handleValidate(manualToken.trim(), 'checkin')}
                >
                  <QrCode className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {overlay && (
          <Card className={overlay.result === 'success' ? 'border-green-500' : 'border-red-500'}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                {overlay.result === 'success' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600" />
                )}
                <h2 className="text-lg font-semibold">
                  {overlay.result === 'success' ? 'Embarque liberado' : 'Bloqueado'}
                </h2>
              </div>

              <p className="text-sm text-muted-foreground">{reasonLabel}</p>

              <div className="space-y-1 rounded-lg bg-muted/40 p-3 text-sm">
                <p><strong>Passageiro:</strong> {overlay.passenger_name ?? '—'}</p>
                <p><strong>Assento:</strong> {overlay.seat_label ?? '—'}</p>
                <p><strong>Evento:</strong> {overlay.event_name ?? '—'}</p>
                <p><strong>Embarque:</strong> {overlay.boarding_label ?? '—'}</p>
                <p><strong>CPF:</strong> {overlay.passenger_cpf_masked ?? '—'}</p>
              </div>

              <div className="flex flex-col gap-2">
                <Button className="w-full" onClick={resetOverlay}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {overlay.result === 'success' ? 'Ler próximo' : 'Tentar outro'}
                </Button>

                {overlay.result === 'success' && (
                  <Button variant="outline" className="w-full" onClick={() => navigate('/motorista/embarque')}>
                    <Users className="mr-2 h-4 w-4" />
                    Ver embarque
                  </Button>
                )}

                {overlay.result === 'success' && overlay.checkout_enabled && overlay.boarding_status === 'checked_in' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (manualToken.trim()) {
                        handleValidate(manualToken.trim(), 'checkout');
                      }
                    }}
                  >
                    Registrar saída (opcional)
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ========== TEMPORARY DEBUG PANEL ========== */}
        <details className="rounded-lg border border-muted bg-muted/20 p-2 text-xs">
          <summary className="cursor-pointer font-mono text-muted-foreground">🔧 Debug câmera</summary>
          <div className="mt-2 space-y-1 font-mono text-muted-foreground break-all">
            <p><strong>permission:</strong> {debugInfo.permission}</p>
            <p><strong>stream:</strong> {debugInfo.streamExists ? '✅' : '❌'}</p>
            <p><strong>tracks:</strong> {debugInfo.trackCount} — [{debugInfo.trackStates.join(', ')}]</p>
            <p><strong>liveTrackStates:</strong> [{debugInfo.liveTrackStates.join(', ')}]</p>
            <p><strong>labels:</strong> {debugInfo.trackLabels.join(', ') || '—'}</p>
            <p><strong>constraint:</strong> {debugInfo.constraintUsed}</p>
            <p><strong>videoSize:</strong> {debugInfo.videoWidth}×{debugInfo.videoHeight}</p>
            <p><strong>readyState:</strong> {debugInfo.readyState}</p>
            <p><strong>cameraReady:</strong> {debugInfo.cameraReady ? '✅' : '❌'}</p>
            <p><strong>cameraError:</strong> {debugInfo.cameraError ?? '—'}</p>
            <p><strong>scanner:</strong> {debugInfo.scannerSupported ? '✅ BarcodeDetector' : '❌ não disponível'}</p>
            <p><strong>initInProgress:</strong> {debugInfo.initInProgress ? '⏳ sim' : 'não'}</p>
            <p><strong>initCount:</strong> {debugInfo.initCount}</p>
            <p><strong>lastInitAt:</strong> {debugInfo.lastInitAt ?? '—'}</p>
            <p><strong>lastError:</strong> {debugInfo.lastError ?? '—'}</p>
            <p><strong>devices:</strong></p>
            {debugInfo.devices.length > 0 ? (
              <ul className="ml-3 list-disc">
                {debugInfo.devices.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            ) : <p className="ml-3">nenhum listado</p>}
          </div>
        </details>

      </div>
    </div>
  );
}
