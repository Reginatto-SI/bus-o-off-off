import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DriverValidate, {
  acquireCameraSession,
  cleanupCameraResources,
  getCameraConstraints,
  getCameraErrorMessage,
  isCurrentCameraSession,

  waitForVideoImage,
} from './DriverValidate';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'driver-1' }, userRole: 'motorista', loading: false, activeCompanyId: 'company-1' }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(), auth: { signOut: vi.fn() } },
}));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const createStream = (id: string) => {
  const tracks = [{
    stop: vi.fn(), getCapabilities: vi.fn(() => ({})),
    getSettings: vi.fn(() => ({ facingMode: 'environment', width: 1280, height: 720 })),
    readyState: 'live', enabled: true, muted: false,
  }];
  return {
    id,
    tracks,
    stream: {
      id,
      active: true,
      getTracks: () => tracks,
      getVideoTracks: () => tracks,
    } as unknown as MediaStream,
  };
};

const renderValidator = () => render(React.createElement(MemoryRouter, null, React.createElement(DriverValidate)));

describe('aquisição real da sessão', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, value: 640 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, value: 480 });
  });

  it('usa environment ideal para traseira e user ideal para frontal', () => {
    expect(getCameraConstraints('back')).toEqual({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    expect(getCameraConstraints('front')).toEqual({ video: { facingMode: { ideal: 'user' } }, audio: false });
  });

  it('varre as lentes traseiras e adota a primeira que entrega vídeo vivo', async () => {
    const enumerateDevices = vi.fn(async () => ([
      { kind: 'videoinput', deviceId: 'back-dead', label: 'camera 2, facing back' },
      { kind: 'videoinput', deviceId: 'back-live', label: 'camera 0, facing back' },
      { kind: 'videoinput', deviceId: 'front-1', label: 'camera 1, facing front' },
    ] as unknown as MediaDeviceInfo[]));
    const dead = createStream('dead');
    dead.tracks[0].readyState = 'ended';
    (dead.stream as unknown as { active: boolean }).active = false;
    const live = createStream('live');
    const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
      const deviceId = (constraints.video as MediaTrackConstraints).deviceId as { exact: string } | undefined;
      return deviceId?.exact === 'back-live' ? live.stream : dead.stream;
    });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia, enumerateDevices } });
    renderValidator();

    fireEvent.click(screen.getByRole('button', { name: /câmera traseira/i }));
    expect(await screen.findByRole('button', { name: /fechar câmera/i })).toBeInTheDocument();
    expect(dead.tracks[0].stop).toHaveBeenCalled();
    expect(getUserMedia).toHaveBeenCalledWith({ video: { deviceId: { exact: 'back-live' } }, audio: false });
    expect(localStorage.getItem('smartbus_driver_back_lens')).toBe('back-live');
  });

  it('sem enumeração disponível mantém a abertura padrão por facingMode', async () => {
    const live = createStream('default');
    const getUserMedia = vi.fn(async () => live.stream);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    renderValidator();

    fireEvent.click(screen.getByRole('button', { name: /câmera traseira/i }));
    expect(await screen.findByRole('button', { name: /fechar câmera/i })).toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledWith(getCameraConstraints('back'));
  });

  it('cliques concorrentes produzem somente uma chamada de getUserMedia', async () => {
    const pending = deferred<MediaStream>();
    const getUserMedia = vi.fn(() => pending.promise);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    renderValidator();

    fireEvent.click(screen.getByRole('button', { name: /câmera traseira/i }));
    fireEvent.click(screen.getByRole('button', { name: /^câmera frontal/i }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    expect(getUserMedia).toHaveBeenCalledWith(getCameraConstraints('back'));

    const first = createStream('first');
    await act(async () => pending.resolve(first.stream));
    expect(await screen.findByRole('button', { name: /fechar câmera/i })).toBeInTheDocument();
  });


  it('troca para a frontal somente depois de parar completamente a traseira', async () => {
    const order: string[] = [];
    const back = createStream('back');
    back.tracks[0].stop.mockImplementation(() => { order.push('back:stop'); });
    const front = createStream('front');
    const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
      order.push(`acquire:${JSON.stringify(constraints)}`);
      return getUserMedia.mock.calls.length === 1 ? back.stream : front.stream;
    });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    renderValidator();

    fireEvent.click(screen.getByRole('button', { name: /câmera traseira/i }));
    await screen.findByRole('button', { name: /fechar câmera/i });
    fireEvent.click(screen.getByRole('button', { name: /^câmera frontal/i }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));

    expect(order.indexOf('back:stop')).toBeLessThan(order.findIndex(item => item.includes('"user"')));
    expect(back.tracks[0].stop).toHaveBeenCalledOnce();
  });

  it('unmount encerra stream ativo e limpa o srcObject', async () => {
    const current = createStream('active');
    const getUserMedia = vi.fn(async () => current.stream);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    const view = renderValidator();
    const video = view.container.querySelector('video')!;
    fireEvent.click(screen.getByRole('button', { name: /câmera traseira/i }));
    await screen.findByRole('button', { name: /fechar câmera/i });
    expect(video.srcObject).toBe(current.stream);

    view.unmount();
    expect(current.tracks[0].stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
  });

  it('unmount durante aquisição descarta a resposta posterior sem atualizar a tela antiga', async () => {
    const pending = deferred<MediaStream>();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(() => pending.promise) } });
    const view = renderValidator();
    fireEvent.click(screen.getByRole('button', { name: /câmera traseira/i }));
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());
    view.unmount();

    const late = createStream('late');
    await act(async () => pending.resolve(late.stream));
    expect(late.tracks[0].stop).toHaveBeenCalledOnce();
  });

  it.each([
    'NotAllowedError', 'NotFoundError', 'OverconstrainedError',
    'NotReadableError', 'SecurityError', 'AbortError',
  ])('%s finaliza a aquisição e mantém retry utilizável', async errorName => {
    const getUserMedia = vi.fn(async () => { throw new DOMException('camera failed', errorName); });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    renderValidator();
    fireEvent.click(screen.getByRole('button', { name: /câmera traseira/i }));

    expect(await screen.findByRole('button', { name: /tentar novamente/i })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /fechar câmera/i })).not.toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledOnce();
  });

  it('background encerra stream ativo e o retorno não abre câmera automaticamente', async () => {
    const active = createStream('background');
    const getUserMedia = vi.fn(async () => active.stream);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    renderValidator();
    fireEvent.click(screen.getByRole('button', { name: /câmera traseira/i }));
    await screen.findByRole('button', { name: /fechar câmera/i });

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    fireEvent(document, new Event('visibilitychange'));
    expect(active.tracks[0].stop).toHaveBeenCalledOnce();

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    fireEvent(document, new Event('visibilitychange'));
    expect(getUserMedia).toHaveBeenCalledOnce();
  });

  it('hidden durante aquisição não cancela pelo evento, mas descarta se a Promise resolve ainda hidden', async () => {
    const pending = deferred<MediaStream>();
    const getUserMedia = vi.fn(() => pending.promise);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    renderValidator();
    fireEvent.click(screen.getByRole('button', { name: /câmera traseira/i }));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    fireEvent(document, new Event('visibilitychange'));
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(screen.getByText(/abrindo câmera/i)).toBeInTheDocument();

    const late = createStream('hidden-late');
    await act(async () => pending.resolve(late.stream));
    expect(late.tracks[0].stop).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: /fechar câmera/i })).not.toBeInTheDocument();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('hidden do prompt seguido de visible aceita a aquisição original sem nova chamada', async () => {
    const pending = deferred<MediaStream>();
    const getUserMedia = vi.fn(() => pending.promise);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    renderValidator();
    fireEvent.click(screen.getByRole('button', { name: /câmera traseira/i }));

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    fireEvent(document, new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    fireEvent(document, new Event('visibilitychange'));

    const granted = createStream('prompt-granted');
    await act(async () => pending.resolve(granted.stream));
    expect(await screen.findByRole('button', { name: /fechar câmera/i })).toBeInTheDocument();
    expect(granted.tracks[0].stop).not.toHaveBeenCalled();
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(getUserMedia).toHaveBeenCalledWith(getCameraConstraints('back'));
  });
});

describe('decoder não possui o hardware', () => {
  it('erros repetidos não readquirem nem fecham o stream e um ciclo válido recupera o aviso', async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, value: 640 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, value: 480 });
    const active = createStream('decoder-stream');
    const getUserMedia = vi.fn(async () => active.stream);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    const detect = vi.fn(async (): Promise<Array<{ rawValue?: string }>> => { throw new Error('decode failed'); });
    class DetectorMock { detect = detect; }
    window.BarcodeDetector = DetectorMock as unknown as typeof window.BarcodeDetector;
    renderValidator();
    fireEvent.click(screen.getByRole('button', { name: /câmera traseira/i }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(active.tracks[0].stop).not.toHaveBeenCalled();
    expect(screen.getByText(/a câmera continua ativa/i)).toBeInTheDocument();

    detect.mockResolvedValueOnce([]);
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(screen.queryByText(/a câmera continua ativa/i)).not.toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(active.tracks[0].stop).not.toHaveBeenCalled();
    vi.useRealTimers();
    delete window.BarcodeDetector;
  });
});

describe('ownership de stream obsoleto', () => {
  it.each([
    ['sem video track', true, undefined],
    ['inativo', false, 'live'],
    ['com track encerrada', true, 'ended'],
  ])('rejeita stream %s antes do play e sem segunda aquisição', async (_label, active, readyState) => {
    const allTrack = { stop: vi.fn() };
    const videoTrack = readyState ? { stop: vi.fn(), readyState } : undefined;
    const stream = {
      active,
      getTracks: () => videoTrack ? [videoTrack] : [allTrack],
      getVideoTracks: () => videoTrack ? [videoTrack] : [],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn(async () => stream);
    const video = { srcObject: null as MediaStream | null, play: vi.fn() };
    const onAccepted = vi.fn();

    await expect(acquireCameraSession({
      constraints: getCameraConstraints('back'), video, getUserMedia,
      isCurrent: () => true, onAccepted,
    })).rejects.toMatchObject({ name: 'CameraStreamInvalidError' });

    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(video.play).not.toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
    expect(onAccepted).not.toHaveBeenCalled();
    expect((videoTrack ?? allTrack).stop).toHaveBeenCalledOnce();
  });

  it('stream inválido não ativa câmera nem decoder e uma nova tentativa manual válida funciona', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, value: 640 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, value: 480 });
    const invalid = createStream('invalid');
    Object.defineProperty(invalid.stream, 'active', { value: false });
    invalid.tracks[0].readyState = 'ended';
    const valid = createStream('valid-front');
    const getUserMedia = vi.fn()
      .mockResolvedValueOnce(invalid.stream)
      .mockResolvedValueOnce(valid.stream);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    const detectorConstructed = vi.fn();
    class DetectorMock { constructor() { detectorConstructed(); } detect = vi.fn(async () => []); }
    window.BarcodeDetector = DetectorMock as unknown as typeof window.BarcodeDetector;
    renderValidator();

    fireEvent.click(screen.getByRole('button', { name: /câmera traseira/i }));
    expect(await screen.findByText(/não permaneceu ativa/i)).toBeInTheDocument();
    expect(play).not.toHaveBeenCalled();
    expect(detectorConstructed).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /fechar câmera/i })).not.toBeInTheDocument();
    expect(invalid.tracks[0].stop).toHaveBeenCalledOnce();
    expect(getUserMedia).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: /^câmera frontal/i }));
    expect(await screen.findByRole('button', { name: /fechar câmera/i })).toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia).toHaveBeenLastCalledWith(getCameraConstraints('front'));
    expect(detectorConstructed).toHaveBeenCalledOnce();
    delete window.BarcodeDetector;
  });

  it('descarta resposta anterior ao play sem associar ou aceitar', async () => {
    const stale = createStream('stale');
    const video = { srcObject: null as MediaStream | null, play: vi.fn() };
    const onAccepted = vi.fn();
    const result = await acquireCameraSession({
      constraints: getCameraConstraints('back'), video,
      getUserMedia: vi.fn(async () => stale.stream), isCurrent: () => false, onAccepted,
    });
    expect(result.status).toBe('stale');
    expect(stale.tracks[0].stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(video.play).not.toHaveBeenCalled();
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it('após play, stream antigo para somente a si e não desassocia o stream novo', async () => {
    const old = createStream('old');
    const current = createStream('current');
    const playing = deferred<void>();
    const video = { srcObject: null as MediaStream | null, play: vi.fn(() => playing.promise) };
    let sessionCurrent = true;
    const acquisition = acquireCameraSession({
      constraints: getCameraConstraints('back'), video,
      getUserMedia: vi.fn(async () => old.stream), isCurrent: () => sessionCurrent,
      waitForImage: vi.fn(async () => undefined),
    });
    await Promise.resolve();
    sessionCurrent = false;
    video.srcObject = current.stream;
    playing.resolve();

    expect((await acquisition).status).toBe('stale');
    expect(old.tracks[0].stop).toHaveBeenCalledOnce();
    expect(current.tracks[0].stop).not.toHaveBeenCalled();
    expect(video.srcObject).toBe(current.stream);
  });

  it('rejeição de video.play fecha o stream e permite propagar o erro', async () => {
    const acquired = createStream('play-failed');
    const video = { srcObject: null as MediaStream | null, play: vi.fn(async () => { throw new DOMException('blocked', 'AbortError'); }) };
    await expect(acquireCameraSession({
      constraints: getCameraConstraints('back'), video,
      getUserMedia: vi.fn(async () => acquired.stream), isCurrent: () => true,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(acquired.tracks[0].stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
  });

  it('stream sem imagem é encerrado sem aceitar cameraReady nem adquirir outra câmera', async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, value: 0 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, value: 0 });
    const back = createStream('black-preview');
    const getUserMedia = vi.fn(async () => back.stream);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    renderValidator();

    fireEvent.click(screen.getByRole('button', { name: /câmera traseira/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });

    expect(screen.getByText(/câmera traseira foi acessada, mas não forneceu imagem/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /fechar câmera/i })).not.toBeInTheDocument();
    expect(back.tracks[0].stop).toHaveBeenCalledOnce();
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(getUserMedia).toHaveBeenCalledWith(getCameraConstraints('back'));
    vi.useRealTimers();
  });

  it('decoder é configurado somente depois que a imagem do preview é validada', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, value: 0 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, value: 0 });
    const acquired = createStream('valid-preview');
    const getUserMedia = vi.fn(async () => acquired.stream);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    const detectorConstructed = vi.fn();
    class DetectorMock { constructor() { detectorConstructed(); } detect = vi.fn(async () => []); }
    window.BarcodeDetector = DetectorMock as unknown as typeof window.BarcodeDetector;
    const view = renderValidator();
    const video = view.container.querySelector('video')!;

    fireEvent.click(screen.getByRole('button', { name: /^câmera frontal/i }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(detectorConstructed).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /fechar câmera/i })).not.toBeInTheDocument();

    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1280 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 720 });
    fireEvent(video, new Event('loadeddata'));
    expect(await screen.findByRole('button', { name: /fechar câmera/i })).toBeInTheDocument();
    expect(detectorConstructed).toHaveBeenCalledOnce();
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(getUserMedia).toHaveBeenCalledWith(getCameraConstraints('front'));
    expect(acquired.tracks[0].stop).not.toHaveBeenCalled();
    delete window.BarcodeDetector;
  });
});

describe('erros operacionais', () => {
  it.each([
    ['NotAllowedError', /acesso à câmera foi negado/i],
    ['NotFoundError', /câmera selecionada não está disponível/i],
    ['OverconstrainedError', /câmera selecionada não está disponível/i],
    ['NotReadableError', /sendo utilizada por outro aplicativo/i],
    ['SecurityError', /não permitiu acessar a câmera neste contexto/i],
    ['AbortError', /abertura da câmera foi interrompida/i],
  ])('mapeia %s para mensagem curta e operacional', (name, message) => {
    expect(getCameraErrorMessage(name, 'back')).toMatch(message);
  });

  it('cleanup de recursos pode repetir sem lançar', () => {
    const video = { srcObject: null };
    expect(() => cleanupCameraResources(video, null)).not.toThrow();
    expect(() => cleanupCameraResources(video, null)).not.toThrow();
    expect(isCurrentCameraSession(2, 2)).toBe(true);
  });

  it('preview 2x2 aguarda dimensões mínimas plausíveis', async () => {
    const listeners = new Map<string, EventListener>();
    const video = {
      videoWidth: 2,
      videoHeight: 2,
      addEventListener: vi.fn((name: string, listener: EventListener) => listeners.set(name, listener)),
      removeEventListener: vi.fn(),
    };
    let resolved = false;
    const waiting = waitForVideoImage(video, 1_000).then(() => { resolved = true; });

    listeners.get('loadeddata')?.(new Event('loadeddata'));
    await Promise.resolve();
    expect(resolved).toBe(false);

    video.videoWidth = 16;
    video.videoHeight = 16;
    listeners.get('resize')?.(new Event('resize'));
    await waiting;
    expect(resolved).toBe(true);
  });
});
