import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DriverValidate from './DriverValidate';
import { cameraLog, clearCameraDiagnosticEvents } from '@/lib/cameraDiagnostics';

const authState = vi.hoisted(() => ({
  user: { id: 'developer-1' } as { id: string } | null,
  userRole: 'developer' as string | null,
  loading: false,
  activeCompanyId: 'company-1',
  isMobile: true,
}));
const toast = vi.hoisted(() => vi.fn());

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => authState.isMobile }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(), auth: { signOut: vi.fn() } },
}));

const renderValidator = () => render(
  <MemoryRouter initialEntries={['/validador/validar']}><DriverValidate /></MemoryRouter>,
);

const createIsolatedStream = (facingMode: 'environment' | 'user', order: string[] = []) => {
  const listeners = new Map<string, Set<EventListener>>();
  const track = {
    kind: 'video', readyState: 'live' as MediaStreamTrackState, enabled: true, muted: false,
    stop: vi.fn(() => order.push('stop')),
    getSettings: vi.fn(() => {
      order.push('snapshot');
      return { facingMode, width: 640, height: 480 };
    }),
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      const entries = listeners.get(type) ?? new Set<EventListener>();
      entries.add(listener);
      listeners.set(type, entries);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListener) => listeners.get(type)?.delete(listener)),
  };
  const stream = {
    active: true,
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  const emit = (type: string) => listeners.get(type)?.forEach(listener => listener(new Event(type)));
  return { stream, track, emit };
};

describe('diagnóstico de câmera no validador normal', () => {
  beforeEach(() => {
    authState.user = { id: 'developer-1' };
    authState.userRole = 'developer';
    authState.loading = false;
    authState.isMobile = true;
    toast.mockReset();
    clearCameraDiagnosticEvents();
  });

  it('mostra controles exclusivamente para developer autenticado no mobile', () => {
    const view = renderValidator();
    expect(screen.getByRole('button', { name: 'Copiar logs da câmera' })).toBeInTheDocument();
    expect(screen.getByText('Diagnóstico isolado da câmera')).toBeInTheDocument();

    for (const role of ['motorista', 'gerente']) {
      view.unmount();
      authState.userRole = role;
      const restrictedView = renderValidator();
      expect(screen.queryByRole('button', { name: 'Copiar logs da câmera' })).not.toBeInTheDocument();
      expect(screen.queryByText('Diagnóstico isolado da câmera')).not.toBeInTheDocument();
      restrictedView.unmount();
    }

    authState.userRole = 'developer';
    authState.isMobile = false;
    renderValidator();
    expect(screen.queryByRole('button', { name: 'Copiar logs da câmera' })).not.toBeInTheDocument();
    expect(screen.queryByText('Diagnóstico isolado da câmera')).not.toBeInTheDocument();
  });

  it.each([
    ['traseira', 'environment'],
    ['frontal', 'user'],
  ] as const)('executa uma única aquisição %s, fotografa antes do play e não cria decoder', async (label, facingMode) => {
    const order: string[] = [];
    const isolated = createIsolatedStream(facingMode, order);
    const getUserMedia = vi.fn(async () => isolated.stream);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async () => { order.push('play'); });
    const detector = vi.fn();
    window.BarcodeDetector = detector as unknown as typeof window.BarcodeDetector;
    renderValidator();

    fireEvent.click(screen.getByRole('button', { name: `Testar câmera ${label}` }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    await waitFor(() => expect(order).toContain('play'));

    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { exact: facingMode } }, audio: false,
    });
    expect(order.indexOf('snapshot')).toBeLessThan(order.indexOf('play'));
    expect(detector).not.toHaveBeenCalled();
    expect(screen.getByText(`Facing mode: ${facingMode}`)).toBeInTheDocument();
    delete window.BarcodeDetector;
    vi.restoreAllMocks();
  });

  it('registra eventos naturais, copia uma vez e fecha limpando vídeo e tracks', async () => {
    const first = createIsolatedStream('environment');
    const second = createIsolatedStream('user');
    const getUserMedia = vi.fn()
      .mockResolvedValueOnce(first.stream)
      .mockResolvedValueOnce(second.stream);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const view = renderValidator();
    const videos = view.container.querySelectorAll('video');
    const diagnosticVideo = videos[1];

    fireEvent.click(screen.getByRole('button', { name: 'Testar câmera traseira' }));
    await waitFor(() => expect(diagnosticVideo.srcObject).toBe(first.stream));
    await act(async () => {
      first.track.muted = true;
      first.emit('mute');
      first.track.readyState = 'ended';
      first.emit('ended');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Copiar resultado' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0][0]).toContain('"event":"mute"');
    expect(writeText.mock.calls[0][0]).toContain('"event":"ended"');
    expect(writeText.mock.calls[0][0]).not.toContain('deviceId');

    fireEvent.click(screen.getByRole('button', { name: 'Fechar teste' }));
    expect(first.track.removeEventListener).toHaveBeenCalledTimes(3);
    expect(first.track.stop).toHaveBeenCalledOnce();
    expect(diagnosticVideo.srcObject).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Testar câmera frontal' }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    expect(first.track.stop.mock.invocationCallOrder[0]).toBeLessThan(getUserMedia.mock.invocationCallOrder[1]);
    expect(diagnosticVideo.srcObject).toBe(second.stream);
    vi.restoreAllMocks();
  });

  it('copia todos os eventos em uma única escrita e permite limpar o buffer', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    cameraLog('CAMERA GRANTED', { streamActive: false, trackReadyState: 'ended' });
    cameraLog('CAMERA PREVIEW READY', { videoWidth: 2, videoHeight: 2 });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    renderValidator();

    fireEvent.click(screen.getByRole('button', { name: 'Copiar logs da câmera' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0][0]).toContain('Total de eventos: 2');
    expect(writeText.mock.calls[0][0]).toContain('trackReadyState');
    expect(toast).toHaveBeenCalledWith({ title: 'Logs da câmera copiados.' });

    fireEvent.click(screen.getByRole('button', { name: 'Limpar logs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copiar logs da câmera' }));
    expect(writeText).toHaveBeenCalledOnce();
    expect(toast).toHaveBeenLastCalledWith({ title: 'Nenhum log de câmera registrado ainda.' });
    vi.restoreAllMocks();
  });

  it('informa falha do clipboard sem sair da tela', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    cameraLog('CAMERA REQUEST', { camera: 'back' });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    renderValidator();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar logs da câmera' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({
      title: 'Não foi possível copiar os logs.', variant: 'destructive',
    }));
    vi.restoreAllMocks();
  });
});
