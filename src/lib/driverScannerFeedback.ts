let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

/**
 * Play a short beep.
 * Success: single high-pitched beep (880Hz, 150ms)
 * Error: double low-pitched beep (440Hz, 100ms x2)
 */
export function playBeep(success: boolean): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();

    if (success) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.value = 0.3;
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else {
      // Double beep for error
      for (let i = 0; i < 2; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 440;
        osc.type = 'sine';
        gain.gain.value = 0.3;
        const offset = i * 0.15;
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.1);
      }
    }
  } catch {
    // Web Audio API not available — silently ignore
  }
}

/**
 * Vibrate the device if supported.
 * Success: single 100ms pulse
 * Error: double pulse 100-50-100ms
 */
export function vibrateDevice(success: boolean): void {
  if (!navigator.vibrate) return;
  try {
    if (success) {
      navigator.vibrate(100);
    } else {
      navigator.vibrate([100, 50, 100]);
    }
  } catch {
    // Vibration API not available
  }
}
