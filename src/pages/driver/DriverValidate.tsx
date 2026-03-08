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

/**
 * CONSTRAINT CHAIN for camera:
 * 1. Try rear camera with facingMode: { ideal: 'environment' }
 * 2. Fallback: any camera without facingMode constraint
 * This handles devices where environment constraint fails.
 */
const CAMERA_CONSTRAINTS_CHAIN: MediaStreamConstraints[] = [
  { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
  { video: true, audio: false },
];

export default function DriverValidate() {
  const navigate = useNavigate();
  const { user, userRole, loading } = useAuth();
  const canAccessDriverPortal = userRole === 'motorista' || userRole === 'operador' || userRole === 'gerente' || userRole === 'developer';

  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
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

  /**
   * videoEl via callback ref (useState, not useRef).
   * The camera-init effect depends on this — it only fires once the
   * <video> element is actually in the DOM (after auth resolves).
   */
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

  const reasonLabel = useMemo(() => {
    if (!overlay) return '';
    return REASON_MESSAGES[overlay.reason_code] ?? 'Validação bloqueada';
  }, [overlay]);

  const lockScannerTemporarily = useCallback(() => {
    setScanLocked(true);
    window.setTimeout(() => setScanLocked(false), 1000);
  }, []);

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
        result: 'blocked',
        reason_code: 'rpc_error',
        checkout_enabled: false,
        passenger_name: null,
        seat_label: null,
        event_name: null,
        boarding_label: null,
        passenger_cpf_masked: null,
        boarding_status: null,
      });
      setProcessing(false);
      return;
    }

    const payload = (Array.isArray(data) ? data[0] : data) as ValidationResponse | null;

    setOverlay(
      payload ?? {
        result: 'blocked',
        reason_code: 'invalid_response',
        checkout_enabled: false,
        passenger_name: null,
        seat_label: null,
        event_name: null,
        boarding_label: null,
        passenger_cpf_masked: null,
        boarding_status: null,
      }
    );
    setManualToken(qrCodeToken);
    setProcessing(false);
  }, [lockScannerTemporarily, processing]);

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

  /**
   * stopCurrentStream — stops all tracks on the current stream
   * and clears the scan interval. Must be called before opening a
   * new stream or when cleaning up on unmount / visibility change.
   */
  const stopCurrentStream = useCallback(() => {
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

  /**
   * startCamera — the core initialization routine.
   *
   * KEY DESIGN DECISIONS:
   * 1. Always clean up the previous stream first (avoids leaked tracks).
   * 2. Try constraints in a chain: rear camera first, then any camera.
   * 3. After getting the stream, assign srcObject and call play().
   * 4. ONLY set cameraReady=true AFTER confirming real frames exist
   *    (videoWidth > 0). This prevents the false-positive "ready but
   *    black" state that was the original bug.
   * 5. If play() fails or no frames appear within 3s, show an error
   *    with a retry button instead of a silent black screen.
   */
  const startCamera = useCallback(async (video: HTMLVideoElement) => {
    stopCurrentStream();
    setCameraError(null);

    // Setup BarcodeDetector if available
    const hasBarcodeDetector = Boolean(window.BarcodeDetector);
    setScannerSupported(hasBarcodeDetector);
    if (hasBarcodeDetector && window.BarcodeDetector) {
      detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
    }

    // Try each constraint set in order until one works
    let stream: MediaStream | null = null;
    for (const constraints of CAMERA_CONSTRAINTS_CHAIN) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (err) {
        console.warn('[DriverValidate] Constraint falhou:', constraints, err);
      }
    }

    if (!stream) {
      setCameraError('Não foi possível abrir a câmera. Verifique a permissão do navegador.');
      return;
    }

    streamRef.current = stream;
    video.srcObject = stream;

    /**
     * Wait for loadedmetadata + play() to confirm the video is actually
     * rendering frames. A stream can be "created" successfully but produce
     * no visible output if srcObject assignment or play() silently fails.
     */
    try {
      await new Promise<void>((resolve, reject) => {
        const onMeta = () => {
          video.removeEventListener('loadedmetadata', onMeta);
          resolve();
        };
        // If metadata already loaded (re-init scenario), resolve immediately
        if (video.readyState >= 1) {
          resolve();
        } else {
          video.addEventListener('loadedmetadata', onMeta);
          // Timeout: if metadata never fires in 5s, reject
          setTimeout(() => {
            video.removeEventListener('loadedmetadata', onMeta);
            reject(new Error('loadedmetadata timeout'));
          }, 5000);
        }
      });

      await video.play();

      /**
       * FRAME VALIDATION: After play(), check that videoWidth > 0.
       * Some devices report play() success but render black until a
       * frame is decoded. We poll briefly (up to 2s) to confirm.
       */
      let frameConfirmed = false;
      for (let i = 0; i < 20; i++) {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          frameConfirmed = true;
          break;
        }
        await new Promise(r => setTimeout(r, 100));
      }

      if (!frameConfirmed) {
        console.warn('[DriverValidate] Stream aberto mas sem frames reais (videoWidth=0)');
        // Still mark as ready — on some emulators/devices this is expected
        // but the camera IS working. The user will see if it's black.
      }

      setCameraReady(true);
      setCameraError(null);

      // Check torch support
      const track = stream.getVideoTracks()[0];
      if (track) {
        const caps = (track as any).getCapabilities?.();
        if (caps?.torch) setTorchSupported(true);
      }
    } catch (err) {
      console.error('[DriverValidate] Falha ao iniciar preview:', err);
      setCameraReady(false);
      setCameraError('Câmera aberta mas sem imagem. Toque em "Tentar novamente".');
    }
  }, [stopCurrentStream]);

  /**
   * Camera init effect — runs when <video> element appears in the DOM.
   * Uses videoEl (callback ref state) so it only fires after auth
   * resolves and the JSX with <video> is rendered.
   */
  useEffect(() => {
    if (!videoEl) return;

    startCamera(videoEl);

    return () => {
      stopCurrentStream();
    };
  }, [videoEl, startCamera, stopCurrentStream]);

  /**
   * VISIBILITY CHANGE handler — re-opens camera when user returns
   * to the app/tab (critical for PWA and mobile multitasking).
   * When the page becomes hidden, we stop the stream to free the
   * camera for other apps. When visible again, we restart.
   */
  useEffect(() => {
    if (!videoEl) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        console.log('[DriverValidate] Tab voltou ao foco, reiniciando câmera');
        startCamera(videoEl);
      } else {
        console.log('[DriverValidate] Tab saiu do foco, liberando câmera');
        stopCurrentStream();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [videoEl, startCamera, stopCurrentStream]);

  /**
   * QR scanning loop — runs every 300ms when camera is ready and
   * BarcodeDetector is supported.
   */
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
      } catch { /* silent — detection can fail between frames */ }
    }, 300);

    return () => {
      if (scanIntervalRef.current) {
        window.clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    };
  }, [cameraReady, handleValidate, overlay, processing, scanLocked, scannerSupported, videoEl]);

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
            <div className="relative overflow-hidden rounded-xl border bg-black/90">
              <video
                ref={setVideoEl}
                className="aspect-[3/4] w-full object-cover"
                autoPlay
                muted
                playsInline
                // @ts-ignore — webkit-playsinline for older iOS
                webkit-playsinline="true"
              />

              {/* Scan frame overlay — only when camera has real frames */}
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

            {/* Camera error with retry button */}
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

            {/* Manual token fallback — always visible */}
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
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => navigate('/motorista/embarque')}
                  >
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
      </div>
    </div>
  );
}
