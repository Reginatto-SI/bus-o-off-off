import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APP_VERSION } from '@/generated/build-info';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getPersistedPhase } from '@/lib/driverTripStorage';
import { PHASE_CONFIG, REASON_MESSAGES } from '@/lib/driverPhaseConfig';
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

type BarcodeDetection = { rawValue?: string };
type BarcodeDetectorInstance = { detect: (source: HTMLVideoElement) => Promise<BarcodeDetection[]> };
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorInstance;

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

/**
 * tryDeviceCamera — opens a stream for a specific deviceId,
 * binds to video, validates that it produces real frames.
 * Returns the stream if valid, or null + reason if not.
 */
async function tryDeviceCamera(
  video: HTMLVideoElement,
  deviceId: string,
): Promise<{ stream: MediaStream | null; ok: boolean; reason: string }> {
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } },
      audio: false,
    });
  } catch (err: any) {
    return { stream: null, ok: false, reason: `getUserMedia error: ${err?.name}` };
  }

  const track = stream.getVideoTracks()[0];
  if (!track || track.readyState !== 'live') {
    stream.getTracks().forEach(t => t.stop());
    return { stream: null, ok: false, reason: `track ${track?.readyState ?? 'missing'}` };
  }

  // Bind and wait for metadata
  video.srcObject = stream;
  try {
    await new Promise<void>((resolve, reject) => {
      if (video.readyState >= 1) { resolve(); return; }
      const onMeta = () => { video.removeEventListener('loadedmetadata', onMeta); resolve(); };
      video.addEventListener('loadedmetadata', onMeta);
      setTimeout(() => { video.removeEventListener('loadedmetadata', onMeta); reject(new Error('metadata_timeout')); }, 4000);
    });
    await video.play();
  } catch (err: any) {
    stream.getTracks().forEach(t => t.stop());
    video.srcObject = null;
    return { stream: null, ok: false, reason: `play error: ${err?.message}` };
  }

  // Poll for real frames (up to 2s)
  let frameOk = false;
  for (let i = 0; i < 20; i++) {
    if (track.readyState !== 'live') {
      stream.getTracks().forEach(t => t.stop());
      video.srcObject = null;
      return { stream: null, ok: false, reason: 'track_ended during poll' };
    }
    if (video.videoWidth > 100 && video.videoHeight > 100) {
      frameOk = true;
      break;
    }
    await new Promise(r => setTimeout(r, 100));
  }

  if (!frameOk) {
    stream.getTracks().forEach(t => t.stop());
    video.srcObject = null;
    return { stream: null, ok: false, reason: `no_frames ${video.videoWidth}x${video.videoHeight}` };
  }

  return { stream, ok: true, reason: 'success' };
}

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

    // 4. Enumerate devices & find back cameras
    let stream: MediaStream | null = null;
    let usedConstraint = 'none';
    let selectedDeviceId: string | null = null;
    const attemptResults: AttemptResult[] = [];

    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter(d => d.kind === 'videoinput');
      const backCameras = videoDevices.filter(d =>
        /back|rear|environment|traseira/i.test(d.label)
      );

      // Sort: prefer lower camera index (camera 0 = primary on most Android)
      backCameras.sort((a, b) => {
        const numA = parseInt(a.label.match(/\d+/)?.[0] ?? '99', 10);
        const numB = parseInt(b.label.match(/\d+/)?.[0] ?? '99', 10);
        return numA - numB;
      });

      const candidateLabels = backCameras.map(d => `${d.label} [${d.deviceId.slice(0, 8)}]`);
      console.log('[CAM] back camera candidates (sorted):', candidateLabels);
      updateDebug({ candidateBackCameras: candidateLabels });

      // Phase 1: Try each back camera by deviceId (with delay between attempts)
      for (let i = 0; i < backCameras.length; i++) {
        const cam = backCameras[i];
        console.log(`[CAM] trying back cam #${i}: ${cam.label} [${cam.deviceId.slice(0, 8)}]`);
        const result = await tryDeviceCamera(video, cam.deviceId);
        const attempt: AttemptResult = {
          label: cam.label || 'unnamed',
          deviceId: cam.deviceId.slice(0, 8),
          result: result.ok ? 'success' : (result.reason.includes('track') ? 'track_ended' : (result.reason.includes('no_frames') ? 'no_frames' : 'error')),
          detail: result.reason,
        };
        attemptResults.push(attempt);
        console.log(`[CAM] back cam #${i} result:`, attempt.result, attempt.detail);

        if (result.ok && result.stream) {
          stream = result.stream;
          usedConstraint = `deviceId:${cam.label}`;
          selectedDeviceId = cam.deviceId;
          break;
        }

        // Wait 800ms for Android camera driver to release hardware before next attempt
        console.log('[CAM] waiting 800ms for driver release…');
        await new Promise(r => setTimeout(r, 800));
      }

      // Phase 2: Fallback — facingMode: environment
      if (!stream) {
        console.log('[CAM] no back cam worked, waiting 1s before fallbacks…');
        await new Promise(r => setTimeout(r, 1000));
        console.log('[CAM] trying facingMode environment');
        try {
          const envStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } }, audio: false,
          });
          const t = envStream.getVideoTracks()[0];
          video.srcObject = envStream;
          await video.play().catch(() => {});
          await new Promise(r => setTimeout(r, 500));
          if (t?.readyState === 'live' && video.videoWidth > 100) {
            stream = envStream;
            usedConstraint = 'facingMode:environment';
          } else {
            envStream.getTracks().forEach(t => t.stop());
            video.srcObject = null;
            attemptResults.push({ label: 'facingMode:env', deviceId: '-', result: 'no_frames', detail: `${video.videoWidth}x${video.videoHeight}` });
          }
        } catch (err: any) {
          attemptResults.push({ label: 'facingMode:env', deviceId: '-', result: 'error', detail: err?.message });
        }
      }

      // Phase 3: Fallback — video: true
      if (!stream) {
        console.log('[CAM] trying video:true fallback');
        try {
          const anyStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          const t = anyStream.getVideoTracks()[0];
          video.srcObject = anyStream;
          await video.play().catch(() => {});
          await new Promise(r => setTimeout(r, 500));
          if (t?.readyState === 'live' && video.videoWidth > 100) {
            stream = anyStream;
            usedConstraint = 'video:true';
          } else {
            anyStream.getTracks().forEach(t => t.stop());
            video.srcObject = null;
            attemptResults.push({ label: 'video:true', deviceId: '-', result: 'no_frames', detail: `${video.videoWidth}x${video.videoHeight}` });
          }
        } catch (err: any) {
          attemptResults.push({ label: 'video:true', deviceId: '-', result: 'error', detail: err?.message });
        }
      }
    } catch (enumErr: any) {
      console.error('[CAM] enumerate failed:', enumErr);
      updateDebug({ lastError: `enumerate: ${enumErr?.message}` });
    }

    updateDebug({ attemptResults, selectedDeviceId: selectedDeviceId?.slice(0, 8) ?? null });

    if (!stream) {
      const errMsg = 'Nenhuma câmera funcionou. Verifique as permissões ou use o campo manual.';
      setCameraError(errMsg);
      updateDebug({ cameraError: errMsg, streamExists: false });
      initInProgressRef.current = false;
      updateDebug({ initInProgress: false });
      console.log(`[CAM] startCamera #${thisInitId} END — no camera`);
      return;
    }

    // Stream is already bound to video by tryDeviceCamera or fallback
    streamRef.current = stream;

    const tracks = stream.getVideoTracks();
    console.log('[CAM] ✅ camera selected:', usedConstraint, `${video.videoWidth}×${video.videoHeight}`);
    updateDebug({
      streamExists: true,
      constraintUsed: usedConstraint,
      trackCount: tracks.length,
      trackStates: tracks.map(t => t.readyState),
      trackLabels: tracks.map(t => t.label || 'unnamed'),
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      readyState: video.readyState,
    });

    setCameraReady(true);
    setCameraError(null);
    updateDebug({ cameraReady: true, cameraError: null });

    // Check torch
    const track = stream.getVideoTracks()[0];
    if (track) {
      const caps = (track as any).getCapabilities?.();
      if (caps?.torch) setTorchSupported(true);
    }

    initInProgressRef.current = false;
    updateDebug({ initInProgress: false });
    console.log(`[CAM] startCamera #${thisInitId} END — success`);
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

              {/* ===== SCAN RESULT OVERLAY ===== */}
              {overlay && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/75 p-6">
                  {overlay.result === 'success' ? (
                    <CheckCircle2 className="h-14 w-14 text-green-400 mb-2" />
                  ) : (
                    <AlertCircle className="h-14 w-14 text-red-400 mb-2" />
                  )}
                  <h2 className="text-xl font-bold text-white mb-1">
                    {overlay.result === 'success' ? 'EMBARQUE LIBERADO' : 'PASSAGEM INVÁLIDA'}
                  </h2>
                  <p className="text-sm text-white/70 mb-3">{reasonLabel}</p>

                  <div className="w-full max-w-xs space-y-1 rounded-lg bg-white/10 p-3 text-sm text-white/90">
                    <p><strong>Passageiro:</strong> {overlay.passenger_name ?? '—'}</p>
                    <p><strong>Assento:</strong> {overlay.seat_label ?? '—'}</p>
                    <p><strong>Evento:</strong> {overlay.event_name ?? '—'}</p>
                    {overlay.boarding_label && <p><strong>Embarque:</strong> {overlay.boarding_label}</p>}
                  </div>

                  <div className="mt-4 flex w-full max-w-xs flex-col gap-2">
                    <Button className="h-12 w-full text-base" onClick={resetOverlay}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      {overlay.result === 'success' ? 'Ler próximo' : 'Tentar novamente'}
                    </Button>
                    {overlay.result === 'success' && (
                      <Button variant="secondary" className="w-full" onClick={() => navigate('/motorista/embarque')}>
                        <Users className="mr-2 h-4 w-4" />
                        Ver embarque
                      </Button>
                    )}
                    {overlay.result === 'success' && overlay.checkout_enabled && overlay.boarding_status === 'checked_in' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-white/70"
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
                </div>
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
                `scanner: ${debugInfo.scannerSupported ? '✅ BarcodeDetector' : '❌ não disponível'}`,
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
            <p><strong>scanner:</strong> {debugInfo.scannerSupported ? '✅ BarcodeDetector' : '❌ não disponível'}</p>
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
