import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

    for (const role of ['motorista', 'gerente']) {
      view.unmount();
      authState.userRole = role;
      const restrictedView = renderValidator();
      expect(screen.queryByRole('button', { name: 'Copiar logs da câmera' })).not.toBeInTheDocument();
      restrictedView.unmount();
    }

    authState.userRole = 'developer';
    authState.isMobile = false;
    renderValidator();
    expect(screen.queryByRole('button', { name: 'Copiar logs da câmera' })).not.toBeInTheDocument();
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
