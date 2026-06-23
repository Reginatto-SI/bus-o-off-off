/**
 * Garante o opt-in explícito do auto redirect do Asaas também na URL da fatura.
 * Não altera a confirmação financeira; apenas reforça a navegação de retorno do gateway.
 */
export function withAsaasAutoRedirect(url: string): string {
  try {
    const parsedUrl = new URL(url);
    parsedUrl.searchParams.set('autoRedirect', 'true');
    return parsedUrl.toString();
  } catch {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}autoRedirect=true`;
  }
}

/**
 * Detecta contextos onde a fatura precisa permanecer na mesma janela do app.
 */
export function isInstalledAppPaymentContext(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const mqStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches ?? false;
    const mqMinimalUi = window.matchMedia?.('(display-mode: minimal-ui)')?.matches ?? false;
    const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const ua = window.navigator.userAgent || '';
    const isAndroidWebView = /\bwv\b/.test(ua) || /; wv\)/.test(ua);
    return mqStandalone || mqMinimalUi || iosStandalone || isAndroidWebView;
  } catch {
    return false;
  }
}

/**
 * Log público e sem dados sensíveis para diagnosticar abertura da fatura Asaas.
 */
export function logAsaasInvoiceOpen(params: {
  saleId: string;
  paymentMethod: string | null;
  isAppContext: boolean;
  navigationStrategy: 'same_window_assign' | 'preopened_tab' | 'new_tab' | 'manual_new_tab' | 'app_confirmation_plus_invoice_tab';
  invoiceUrl: string;
}) {
  console.info('[asaas] open_invoice', {
    sale_id: params.saleId,
    payment_method: params.paymentMethod,
    is_app_context: params.isAppContext,
    navigation_strategy: params.navigationStrategy,
    has_auto_redirect: params.invoiceUrl.includes('autoRedirect=true'),
  });
}
