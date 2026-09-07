import { describe, expect, it } from 'vitest';
import {
  classifyOrigin,
  resolveEffectivePaymentEnvironment,
} from '@/lib/paymentEnvironmentPolicy';

const effective = (configured: 'production' | 'sandbox' | null, host: string) =>
  resolveEffectivePaymentEnvironment({
    configured,
    originClass: classifyOrigin(host),
  });

describe('política central de ambiente de pagamento', () => {
  it('reconhece os domínios oficiais de Produção', () => {
    expect(classifyOrigin('smartbus.com.br')).toBe('official_production');
    expect(classifyOrigin('https://www.smartbus.com.br/admin')).toBe('official_production');
    expect(classifyOrigin('smartbusbr.com.br')).toBe('official_production');
    expect(classifyOrigin('www.smartbusbr.com.br')).toBe('official_production');
    expect(classifyOrigin('smartbusbr.lovable.app')).toBe('official_production');
  });

  it('classifica preview, editor e localhost como desenvolvimento', () => {
    expect(classifyOrigin('id-preview--a005d492.lovable.app')).toBe('development');
    expect(classifyOrigin('https://lovable.dev/projects/x')).toBe('development');
    expect(classifyOrigin('a005d492.lovableproject.com')).toBe('development');
    expect(classifyOrigin('localhost:8080')).toBe('development');
    expect(classifyOrigin('127.0.0.1')).toBe('development');
  });

  it('trata origem ausente ou desconhecida como desconhecida', () => {
    expect(classifyOrigin('')).toBe('unknown');
    expect(classifyOrigin(null)).toBe('unknown');
    expect(classifyOrigin('site-aleatorio.com')).toBe('unknown');
  });

  it('mantém Produção somente em origem oficial', () => {
    expect(effective('production', 'www.smartbus.com.br').environment).toBe('production');
    expect(effective('production', 'smartbus.com.br').downgradedByOrigin).toBe(false);
  });

  it('rebaixa Produção para Sandbox em preview, editor e localhost', () => {
    for (const host of ['id-preview--x.lovable.app', 'lovable.dev', 'localhost:8080']) {
      const result = effective('production', host);
      expect(result.environment).toBe('sandbox');
      expect(result.downgradedByOrigin).toBe(true);
    }
  });

  it('origem desconhecida nunca libera Produção', () => {
    expect(effective('production', 'site-aleatorio.com').environment).toBe('sandbox');
    expect(effective('production', '').environment).toBe('sandbox');
  });

  it('nunca promove Sandbox configurado para Produção', () => {
    expect(effective('sandbox', 'www.smartbus.com.br').environment).toBe('sandbox');
  });

  it('não inventa ambiente quando a empresa não tem configuração', () => {
    expect(effective(null, 'www.smartbus.com.br').environment).toBeNull();
  });
});
