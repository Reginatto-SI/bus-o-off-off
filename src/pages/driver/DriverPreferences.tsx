import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, ScanLine, Volume2, Vibrate } from 'lucide-react';
import { getDriverPreferences, setDriverPreferences, type DriverPreferences } from '@/lib/driverPreferences';
import { playBeep } from '@/lib/driverScannerFeedback';

export default function DriverPreferencesPage() {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<DriverPreferences>(getDriverPreferences);

  const update = (patch: Partial<DriverPreferences>) => {
    const updated = setDriverPreferences(patch);
    setPrefs(updated);
  };

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto w-full max-w-md space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/validador')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">Preferências</h1>
        </div>

        {/* Scan mode */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Modo de leitura</h2>
            </div>
            <RadioGroup
              value={prefs.scanMode}
              onValueChange={(v) => update({ scanMode: v as 'manual' | 'auto' })}
              className="space-y-3"
            >
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <RadioGroupItem value="manual" id="mode-manual" className="mt-0.5" />
                <div>
                  <Label htmlFor="mode-manual" className="font-medium cursor-pointer">Manual</Label>
                  <p className="text-xs text-muted-foreground">Toque em "Ler próximo" após cada leitura</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <RadioGroupItem value="auto" id="mode-auto" className="mt-0.5" />
                <div>
                  <Label htmlFor="mode-auto" className="font-medium cursor-pointer">Automático</Label>
                  <p className="text-xs text-muted-foreground">Scanner reinicia automaticamente após 2 segundos</p>
                </div>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Sound */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Volume2 className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-semibold text-sm">Sons do scanner</p>
                  <p className="text-xs text-muted-foreground">Beep ao ler QR Code</p>
                </div>
              </div>
              <Switch
                checked={prefs.soundEnabled}
                onCheckedChange={(v) => {
                  update({ soundEnabled: v });
                  if (v) playBeep(true);
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Vibration */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Vibrate className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-semibold text-sm">Vibração</p>
                  <p className="text-xs text-muted-foreground">Vibrar ao ler QR Code</p>
                </div>
              </div>
              <Switch
                checked={prefs.vibrationEnabled}
                onCheckedChange={(v) => update({ vibrationEnabled: v })}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
