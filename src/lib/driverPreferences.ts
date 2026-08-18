const STORAGE_KEY = 'smartbus_driver_prefs';

export type DriverPreferences = {
  scanMode: 'manual' | 'auto';
  soundEnabled: boolean;
  vibrationEnabled: boolean;
};

const DEFAULTS: DriverPreferences = {
  scanMode: 'manual',
  soundEnabled: true,
  vibrationEnabled: true,
};

export function getDriverPreferences(): DriverPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      scanMode: parsed.scanMode === 'auto' ? 'auto' : 'manual',
      soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : DEFAULTS.soundEnabled,
      vibrationEnabled: typeof parsed.vibrationEnabled === 'boolean' ? parsed.vibrationEnabled : DEFAULTS.vibrationEnabled,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setDriverPreferences(prefs: Partial<DriverPreferences>): DriverPreferences {
  const current = getDriverPreferences();
  const updated = { ...current, ...prefs };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

const BACK_LENS_KEY = 'smartbus_driver_back_lens';

// A lente traseira aprovada é lembrada por aparelho: alguns celulares expõem várias
// lentes traseiras e apenas uma entrega vídeo real (as demais chegam com track encerrada).
export function getApprovedBackLensId(): string | null {
  try {
    const value = localStorage.getItem(BACK_LENS_KEY);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

export function setApprovedBackLensId(deviceId: string) {
  try {
    localStorage.setItem(BACK_LENS_KEY, deviceId);
  } catch { /* armazenamento indisponível não pode impedir a leitura */ }
}

export function clearApprovedBackLensId() {
  try {
    localStorage.removeItem(BACK_LENS_KEY);
  } catch { /* idem */ }
}
