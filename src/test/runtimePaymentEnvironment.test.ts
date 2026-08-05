import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAYMENT_ENVIRONMENT,
  normalizePaymentEnvironment,
} from '@/hooks/use-runtime-payment-environment';

describe('ambiente de pagamento por empresa', () => {
  it('aceita apenas os ambientes oficiais', () => {
    expect(normalizePaymentEnvironment('production')).toBe('production');
    expect(normalizePaymentEnvironment('sandbox')).toBe('sandbox');
  });

  it('não assume ambiente quando o valor é ausente ou inválido', () => {
    // Comentário de suporte: sem ambiente válido, a tela deve exibir erro,
    // nunca cair silenciosamente em sandbox.
    expect(normalizePaymentEnvironment(null)).toBeNull();
    expect(normalizePaymentEnvironment(undefined)).toBeNull();
    expect(normalizePaymentEnvironment('')).toBeNull();
    expect(normalizePaymentEnvironment('PRODUCTION')).toBeNull();
    expect(normalizePaymentEnvironment('homolog')).toBeNull();
  });

  it('mantém produção como padrão oficial de novas empresas', () => {
    expect(DEFAULT_PAYMENT_ENVIRONMENT).toBe('production');
  });
});
