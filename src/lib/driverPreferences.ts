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
