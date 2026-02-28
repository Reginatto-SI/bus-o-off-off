import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, Loader2, QrCode, RotateCcw } from 'lucide-react';

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

export default function DriverValidate() {
  const navigate = useNavigate();
  const { user, userRole, loading } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const scanIntervalRef = useRef<number | null>(null);

  const [processing, setProcessing] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [scannerSupported, setScannerSupported] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [overlay, setOverlay] = useState<ValidationResponse | null>(null);

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

  useEffect(() => {
    const startScanner = async () => {
      if (!window.BarcodeDetector) {
        setScannerSupported(false);
        return;
      }

      setScannerSupported(true);

      try {
        detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
          },
          audio: false,
        });

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch {
        setCameraReady(false);
      }
    };

    startScanner();

    return () => {
      if (scanIntervalRef.current) {
        window.clearInterval(scanIntervalRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (!scannerSupported || !cameraReady || overlay || processing) return;

    scanIntervalRef.current = window.setInterval(async () => {
      if (!videoRef.current || !detectorRef.current || scanLocked || processing || overlay) return;

      try {
        const detected = await detectorRef.current.detect(videoRef.current);
        const token = detected?.[0]?.rawValue?.trim();
        if (token) {
          await handleValidate(token, 'checkin');
        }
      } catch {
        // Sem toast para evitar poluição visual durante a leitura contínua.
      }
    }, 300);

    return () => {
      if (scanIntervalRef.current) {
        window.clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    };
  }, [cameraReady, handleValidate, overlay, processing, scanLocked, scannerSupported]);

  const resetOverlay = () => {
    setOverlay(null);
    setProcessing(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (userRole !== 'motorista') return <Navigate to="/admin/eventos" replace />;

  return (
    <div className="min-h-screen bg-background px-4 py-4">
      <div className="mx-auto w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/motorista')}>Voltar</Button>
          <span className="text-sm text-muted-foreground">Validação QR</span>
        </div>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="relative overflow-hidden rounded-xl border bg-black/90">
              <video ref={videoRef} className="aspect-[3/4] w-full object-cover" muted playsInline />
              {!cameraReady && (
                <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-white/80">
                  Preparando câmera...
                </div>
              )}
            </div>

            {!scannerSupported && (
              <p className="text-sm text-muted-foreground">
                Este navegador não suporta leitura automática por câmera. Use o token manual.
              </p>
            )}

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

              <div className="flex gap-2">
                <Button className="flex-1" onClick={resetOverlay}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {overlay.result === 'success' ? 'Ler próximo' : 'Tentar outro'}
                </Button>

                {overlay.result === 'success' && overlay.checkout_enabled && overlay.boarding_status === 'checked_in' && (
                  <Button
                    variant="outline"
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
