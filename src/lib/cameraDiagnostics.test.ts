import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cameraLog,
  clearCameraDiagnosticEvents,
  formatCameraDiagnosticLogs,
  getCameraDiagnosticEvents,
} from './cameraDiagnostics';

describe('cameraDiagnostics', () => {
  beforeEach(() => clearCameraDiagnosticEvents());

  it('mantém o console.info e registra uma cópia serializável na ordem', () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const data = { streamActive: false, dimensions: { width: 2, height: 2 } };
    cameraLog('CAMERA GRANTED', data);
    cameraLog('CAMERA PREVIEW READY', { videoWidth: 2, videoHeight: 2 });
    data.dimensions.width = 999;

    expect(consoleInfo).toHaveBeenCalledWith('[CAMERA] CAMERA GRANTED', data);
    expect(getCameraDiagnosticEvents().map(entry => entry.event)).toEqual([
      'CAMERA GRANTED', 'CAMERA PREVIEW READY',
    ]);
    expect(getCameraDiagnosticEvents()[0].data).toEqual({
      streamActive: false, dimensions: { width: 2, height: 2 },
    });
    consoleInfo.mockRestore();
  });

  it('preserva somente os 100 eventos mais recentes', () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    for (let index = 0; index < 102; index += 1) cameraLog(`EVENT ${index}`, { index });
    const events = getCameraDiagnosticEvents();
    expect(events).toHaveLength(100);
    expect(events[0].event).toBe('EVENT 2');
    expect(events[99].event).toBe('EVENT 101');
    vi.restoreAllMocks();
  });

  it('gera um texto único com cabeçalho, objetos e todos os eventos', () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    cameraLog('CAMERA REQUEST', { camera: 'back' });
    const output = formatCameraDiagnosticLogs({
      route: '/validador/validar', userAgent: 'Mobile Test', generatedAt: '2026-08-11T12:00:00.000Z',
    });
    expect(output).toContain('=== SMARTBUS CAMERA DEBUG ===');
    expect(output).toContain('Rota atual: /validador/validar');
    expect(output).toContain('Total de eventos: 1');
    expect(output).toContain('CAMERA REQUEST\n{\n  "camera": "back"\n}');
    vi.restoreAllMocks();
  });

  it('não quebra com dados não serializáveis e permite limpar', () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    cameraLog('CAMERA ERROR', circular);
    expect(getCameraDiagnosticEvents()[0].data).toBe('[Dados não serializáveis]');
    clearCameraDiagnosticEvents();
    expect(getCameraDiagnosticEvents()).toEqual([]);
    vi.restoreAllMocks();
  });
});
