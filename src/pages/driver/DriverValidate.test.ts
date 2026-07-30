import { describe, expect, it, vi } from 'vitest';
import {
  classifyCameraDevice,
  acquireWithImmediateSnapshot,
  isUsableCameraState,
  runSerialCameraStrategies,
  runRawCameraAcquisition,
  shouldStartScanner,
  waitForUsableCameraState,
  stopAllMediaStreamTracks,
} from './DriverValidate';

describe('isUsableCameraState', () => {
  const valid = { streamActive: true, trackState: 'live' as const, videoConnected: true, width: 640, height: 480 };

  it('aceita somente stream ativo, track live, vídeo montado e quadro plausível', () => {
    expect(isUsableCameraState(valid)).toBe(true);
  });

  it.each([
    [{ ...valid, streamActive: false }, 'stream inativo'],
    [{ ...valid, trackState: 'ended' as const }, 'track encerrada'],
    [{ ...valid, videoConnected: false }, 'vídeo desmontado'],
    [{ ...valid, width: 2, height: 2 }, 'placeholder 2x2'],
  ])('rejeita %s (%s)', (state, _reason) => {
    expect(isUsableCameraState(state)).toBe(false);
  });
});

describe('orquestração serial', () => {
  const strategies = [
    { label: 'environment exact', constraints: { video: true } },
    { label: 'environment ideal', constraints: { video: true } },
    { label: 'video:true', constraints: { video: true } },
  ];

  it('descarta track ended, remove srcObject e executa a estratégia seguinte', async () => {
    const calls: string[] = [];
    const video = { srcObject: null as object | null };
    const first = { ended: true, stopped: false };
    const second = { ended: false, stopped: false };
    const result = await runSerialCameraStrategies(strategies, {
      acquire: async (strategy, index) => {
        calls.push(`acquire:${strategy.label}`);
        const candidate = index === 0 ? first : second;
        video.srcObject = candidate;
        return candidate;
      },
      validate: async candidate => ({ usable: !candidate.ended, detail: candidate.ended ? 'track=ended' : '640x480' }),
      discard: candidate => {
        candidate.stopped = true;
        video.srcObject = null;
        calls.push('discard');
      },
    });

    expect(result.attempts[0].result).toBe('stream_inutilizavel');
    expect(first.stopped).toBe(true);
    expect(video.srcObject).toBe(second);
    expect(calls).toEqual(['acquire:environment exact', 'discard', 'acquire:environment ideal']);
  });

  it('alcança video:true após falhas e interrompe as demais chamadas no primeiro stream válido', async () => {
    const acquire = vi.fn(async (_strategy, index) => ({ usable: index === 2 }));
    const result = await runSerialCameraStrategies(strategies, {
      acquire,
      validate: async candidate => ({ usable: candidate.usable, detail: candidate.usable ? '640x480' : 'inválido' }),
      discard: vi.fn(),
    });
    expect(result.selectedStrategy?.label).toBe('video:true');
    expect(acquire).toHaveBeenCalledTimes(3);
  });

  it('não inicia a segunda chamada enquanto a primeira permanece pendente', async () => {
    let resolveFirst!: (value: { usable: boolean }) => void;
    const first = new Promise<{ usable: boolean }>(resolve => { resolveFirst = resolve; });
    const acquire = vi.fn((_strategy, index) => index === 0 ? first : Promise.resolve({ usable: true }));
    const running = runSerialCameraStrategies(strategies, {
      acquire,
      validate: async candidate => ({ usable: candidate.usable, detail: candidate.usable ? 'ok' : 'ended' }),
      discard: vi.fn(),
    });
    await Promise.resolve();
    expect(acquire).toHaveBeenCalledTimes(1);
    resolveFirst({ usable: false });
    await running;
    expect(acquire).toHaveBeenCalledTimes(2);
  });

  it('captura o snapshot imediato e valida antes de executar afterResolved', async () => {
    const order: string[] = [];
    await runSerialCameraStrategies([strategies[0]], {
      acquire: () => acquireWithImmediateSnapshot(
        async () => { order.push('resolve'); return { usable: true }; },
        () => order.push('immediate_snapshot'),
      ),
      validate: async () => { order.push('initial_validation'); return { usable: true, detail: 'ok' }; },
      afterResolved: () => { order.push('afterResolved:enumerateDevices'); },
      discard: vi.fn(),
    });
    expect(order).toEqual(['resolve', 'immediate_snapshot', 'initial_validation', 'afterResolved:enumerateDevices']);
  });
});

describe('janela de primeiro quadro', () => {
  it('mantém 2x2 em espera e aceita dimensões reais dentro da janela', async () => {
    let polls = 0;
    const state = { streamActive: true, trackState: 'live' as const, videoConnected: true, width: 2, height: 2 };
    const usable = await waitForUsableCameraState(
      () => state,
      async () => { polls += 1; if (polls === 2) Object.assign(state, { width: 640, height: 480 }); },
      500,
      100,
    );
    expect(polls).toBe(2);
    expect(usable).toBe(true);
  });
});

describe('diagnóstico auxiliar', () => {
  it.each([
    ['camera 2, facing back', 'traseira'],
    ['Cámara trasera', 'traseira'],
    ['front camera', 'frontal'],
    ['', 'não classificada'],
    ['Lens 3', 'não classificada'],
  ] as const)('classifica %s como %s', (label, expected) => {
    expect(classifyCameraDevice(label)).toBe(expected);
  });

  it('não inicia scanner no teste mínimo', () => {
    expect(shouldStartScanner(true, true)).toBe(false);
    expect(shouldStartScanner(false, true)).toBe(true);
    expect(shouldStartScanner(false, true, true)).toBe(false);
  });
});

describe('modo bruto', () => {
  it.each([
    ['generic', { video: true, audio: false }],
    ['ideal', { video: { facingMode: { ideal: 'environment' } }, audio: false }],
    ['exact', { video: { facingMode: { exact: 'environment' } }, audio: false }],
  ] as const)('%s executa exatamente uma chamada com sua única constraint', async (mode, expected) => {
    const getUserMedia = vi.fn(async () => ({ id: mode }));
    await runRawCameraAcquisition(mode, getUserMedia, vi.fn());
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith(expected);
  });

  it('uma rejeição encerra sem fallback ou segunda chamada', async () => {
    const getUserMedia = vi.fn(async () => { throw new DOMException('negado', 'NotAllowedError'); });
    await expect(runRawCameraAcquisition('generic', getUserMedia, vi.fn())).rejects.toMatchObject({ name: 'NotAllowedError' });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('libera todas as tracks do stream ao sair', () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    stopAllMediaStreamTracks({ getTracks: () => tracks as unknown as MediaStreamTrack[] });
    tracks.forEach(track => expect(track.stop).toHaveBeenCalledOnce());
  });
});
