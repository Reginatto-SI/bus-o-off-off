import { describe, expect, it, vi } from 'vitest';

import { isInstalledAppPaymentContext, logAsaasInvoiceOpen, withAsaasAutoRedirect } from './asaasInvoiceUrl';

describe('withAsaasAutoRedirect', () => {
  it('adiciona autoRedirect=true em URL sem query string', () => {
    expect(withAsaasAutoRedirect('https://www.asaas.com/i/abc')).toBe('https://www.asaas.com/i/abc?autoRedirect=true');
  });

  it('preserva parâmetros existentes e sobrescreve autoRedirect para true', () => {
    expect(withAsaasAutoRedirect('https://www.asaas.com/i/abc?foo=bar&autoRedirect=false')).toBe(
      'https://www.asaas.com/i/abc?foo=bar&autoRedirect=true',
    );
  });

  it('usa fallback seguro para URL inválida', () => {
    expect(withAsaasAutoRedirect('asaas-invoice?x=1')).toBe('asaas-invoice?x=1&autoRedirect=true');
  });
});

describe('isInstalledAppPaymentContext', () => {
  it('detecta PWA standalone para priorizar navegação na mesma janela', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(display-mode: standalone)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    expect(isInstalledAppPaymentContext()).toBe(true);

    window.matchMedia = originalMatchMedia;
  });
});

describe('logAsaasInvoiceOpen', () => {
  it('registra apenas metadados não sensíveis', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    logAsaasInvoiceOpen({
      saleId: 'sale-1',
      paymentMethod: 'pix',
      isAppContext: true,
      navigationStrategy: 'same_window_assign',
      invoiceUrl: 'https://www.asaas.com/i/abc?autoRedirect=true',
    });

    expect(spy).toHaveBeenCalledWith('[asaas] open_invoice', {
      sale_id: 'sale-1',
      payment_method: 'pix',
      is_app_context: true,
      navigation_strategy: 'same_window_assign',
      has_auto_redirect: true,
    });
    spy.mockRestore();
  });
});
