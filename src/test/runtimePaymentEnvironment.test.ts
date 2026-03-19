import { describe, expect, it } from 'vitest';
import {
  resolveEnvironmentFromHostname,
  resolvePaymentEnvironmentFromAppOrigin,
} from '@/hooks/use-runtime-payment-environment';

describe('use-runtime-payment-environment helpers', () => {
  it('prioriza o ambiente explícito quando ele é informado', () => {
    expect(
      resolvePaymentEnvironmentFromAppOrigin(
        'https://preview.smartbusbr.com.br',
        'production',
      ),
    ).toBe('production');

    expect(
      resolvePaymentEnvironmentFromAppOrigin(
        'https://smartbusbr.com.br',
        'sandbox',
      ),
    ).toBe('sandbox');
  });

  it('resolve produção apenas para os hosts oficiais', () => {
    expect(resolveEnvironmentFromHostname('smartbusbr.com.br')).toBe('production');
    expect(resolveEnvironmentFromHostname('WWW.SMARTBUSBR.COM.BR')).toBe('production');
    // Comentário de suporte: previews e domínios do Lovable continuam no fluxo sandbox.
    expect(resolveEnvironmentFromHostname('lovable.dev')).toBe('sandbox');
    expect(resolveEnvironmentFromHostname('preview.smartbusbr.com.br')).toBe('sandbox');
    expect(resolveEnvironmentFromHostname('localhost')).toBe('sandbox');
  });

  it('faz fallback seguro para sandbox quando a origem é inválida', () => {
    expect(resolvePaymentEnvironmentFromAppOrigin('origem-invalida', null)).toBe('sandbox');
  });
});
