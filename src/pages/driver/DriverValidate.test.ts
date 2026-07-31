import { describe, expect, it, vi } from 'vitest';
import {
  classifyCameraDevice,
  buildCameraDeviceStrategies,
  createDeviceCameraConstraints,
  acquireWithImmediateSnapshot,
  isUsableCameraState,
  runSerialCameraStrategies,
  runRawCameraAcquisition,
  shouldStartScanner,
  waitForUsableCameraState,
  stopAllMediaStreamTracks,
  persistApprovedBackCamera,
  readCameraPreference,
  removeCameraPreference,
  getImmediateCameraFailure,
  IMMEDIATE_TRACK_ENDED_CODE,
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

describe('validação imediata do retorno de getUserMedia', () => {
  const stream = (active: boolean, readyState?: MediaStreamTrackState, enabled = true, muted = false) => ({
    active,
    getVideoTracks: () => readyState ? [{ readyState, enabled, muted }] as MediaStreamTrack[] : [],
  });

  it.each([
    [stream(true, 'ended'), 'track encerrada'],
    [stream(false, 'live'), 'stream inativo'],
    [stream(true), 'track ausente'],
  ])('descarta %s (%s)', (candidate, _reason) => {
    expect(getImmediateCameraFailure(candidate)).toBe(IMMEDIATE_TRACK_ENDED_CODE);
  });

  it('mantém track live mesmo muted ou disabled', () => {
    expect(getImmediateCameraFailure(stream(true, 'live', false, true))).toBeNull();
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
      afterAttempt: async () => { calls.push('hardware_released'); },
    });

    expect(result.attempts[0].result).toBe('stream_inutilizavel');
    expect(first.stopped).toBe(true);
    expect(video.srcObject).toBe(second);
    expect(calls).toEqual(['acquire:environment exact', 'discard', 'hardware_released', 'acquire:environment ideal']);
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

  it('cada dispositivo gera somente deviceId exact, sem facingMode ou fallback', async () => {
    const selectedDeviceId = 'device-back-secondary';
    const constraints = createDeviceCameraConstraints(selectedDeviceId);
    const getUserMedia = vi.fn(async (_constraints: MediaStreamConstraints) => ({ id: selectedDeviceId }));
    await acquireWithImmediateSnapshot(() => getUserMedia(constraints), vi.fn());
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(getUserMedia).toHaveBeenCalledWith({ video: { deviceId: { exact: selectedDeviceId } }, audio: false });
    expect(JSON.stringify(constraints)).not.toContain('facingMode');
  });
});

describe('plano dinâmico do fluxo normal', () => {
  const devices = [
    { deviceId: 'rear-a', label: 'Rear A', classification: 'traseira' as const },
    { deviceId: 'rear-b', label: 'Rear B', classification: 'traseira' as const },
    { deviceId: 'unknown-c', label: 'Lens C', classification: 'não classificada' as const },
    { deviceId: 'front-d', label: 'Front D', classification: 'frontal' as const },
  ];

  it('prioriza a última traseira funcional e mantém video:true por último', () => {
    const plan = buildCameraDeviceStrategies(devices, 'rear-b');
    expect(plan.preferredValid).toBe(true);
    expect(plan.strategies.map(strategy => strategy.deviceId ?? 'video:true')).toEqual([
      'rear-b', 'rear-a', 'unknown-c', 'video:true',
    ]);
    expect(plan.strategies.at(-1)?.constraints).toEqual({ video: true, audio: false });
  });

  it('descarta preferência ausente sem bloquear as demais câmeras', () => {
    const plan = buildCameraDeviceStrategies(devices, 'device-expirado');
    expect(plan.preferredValid).toBe(false);
    expect(plan.strategies[0].deviceId).toBe('rear-a');
    expect(plan.strategies.some(strategy => strategy.deviceId === 'device-expirado')).toBe(false);
  });

  it('não repete deviceId e encerra a fila na primeira traseira funcional', async () => {
    const plan = buildCameraDeviceStrategies(devices, 'rear-b');
    const acquire = vi.fn(async strategy => ({ deviceId: strategy.deviceId, usable: strategy.deviceId === 'rear-a' }));
    await runSerialCameraStrategies(plan.strategies, {
      acquire,
      validate: async candidate => ({ usable: candidate.usable, detail: candidate.usable ? 'quadro real' : 'track ended' }),
      discard: vi.fn(),
    });
    expect(acquire.mock.calls.map(([strategy]) => strategy.deviceId)).toEqual(['rear-b', 'rear-a']);
    expect(new Set(acquire.mock.calls.map(([strategy]) => strategy.deviceId)).size).toBe(2);
  });
});

describe('preferência local tolerante a falhas', () => {
  const rear = { deviceId: 'rear-approved', label: 'Rear approved', classification: 'traseira' as const };
  const front = { deviceId: 'front-working', label: 'Front working', classification: 'frontal' as const };

  it('teste individual traseiro salva somente após aprovação completa', () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() };
    expect(persistApprovedBackCamera(rear, true, storage)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith('smartbus.validator.lastWorkingBackCameraDeviceId', rear.deviceId);
    storage.setItem.mockClear();
    expect(persistApprovedBackCamera(rear, false, storage)).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('câmera frontal funcional não é salva como preferência traseira', () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() };
    expect(persistApprovedBackCamera(front, true, storage)).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('falha de storage é diagnosticável e não lança nem impede aquisição', async () => {
    const error = new DOMException('bloqueado', 'SecurityError');
    const storage = {
      getItem: vi.fn(() => { throw error; }),
      setItem: vi.fn(() => { throw error; }),
      removeItem: vi.fn(() => { throw error; }),
    };
    const onError = vi.fn();
    expect(readCameraPreference(storage, onError)).toBeNull();
    expect(persistApprovedBackCamera(rear, true, storage, onError)).toBe(false);
    expect(removeCameraPreference(storage, onError)).toBe(false);
    await expect(acquireWithImmediateSnapshot(async () => ({ live: true }), vi.fn())).resolves.toEqual({ live: true });
    expect(onError).toHaveBeenCalledTimes(3);
  });

  it('preferência é removida mesmo quando aquisição rejeita antes de criar stream', async () => {
    const storage = { getItem: vi.fn(() => rear.deviceId), setItem: vi.fn(), removeItem: vi.fn() };
    await runSerialCameraStrategies([
      { label: 'preferida', deviceId: rear.deviceId, constraints: createDeviceCameraConstraints(rear.deviceId) },
      { label: 'fallback', constraints: { video: true } },
    ], {
      acquire: async strategy => {
        if (strategy.deviceId === rear.deviceId) throw new DOMException('não encontrada', 'NotFoundError');
        return { usable: true };
      },
      validate: async candidate => ({ usable: candidate.usable, detail: 'ok' }),
      discard: vi.fn(),
      onFailure: strategy => { if (strategy.deviceId === rear.deviceId) removeCameraPreference(storage); },
    });
    expect(storage.removeItem).toHaveBeenCalledWith('smartbus.validator.lastWorkingBackCameraDeviceId');
  });

  it('preferência também é removida quando o stream retorna com track encerrada', async () => {
    const storage = { getItem: vi.fn(() => rear.deviceId), setItem: vi.fn(), removeItem: vi.fn() };
    await runSerialCameraStrategies([
      { label: 'preferida', deviceId: rear.deviceId, constraints: createDeviceCameraConstraints(rear.deviceId) },
      { label: 'alternativa', constraints: { video: true } },
    ], {
      acquire: async strategy => ({ usable: !strategy.deviceId }),
      validate: async candidate => ({ usable: candidate.usable, detail: candidate.usable ? 'quadro real' : 'track=ended' }),
      discard: vi.fn(),
      onFailure: strategy => { if (strategy.deviceId === rear.deviceId) removeCameraPreference(storage); },
    });
    expect(storage.removeItem).toHaveBeenCalledWith('smartbus.validator.lastWorkingBackCameraDeviceId');
  });
});
