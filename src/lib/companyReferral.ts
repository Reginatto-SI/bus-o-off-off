export const COMPANY_REFERRAL_STORAGE_KEY = 'smartbus.company_referral_tracking';

export type CompanyReferralTracking = {
  code: string;
  capturedAt: string;
};

export const normalizeCompanyReferralCode = (value: string | null | undefined) =>
  (value ?? '').trim().toUpperCase();

// Comentário de manutenção: o resolvedor de origem prioriza uma URL pública explícita quando existir
// e cai para a origem atual do browser no admin. O fallback final evita link vazio em renderizações sem `window`.
export const resolveCompanyReferralOrigin = () => {
  const envOrigin = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim();
  if (envOrigin) return envOrigin.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location.origin) return window.location.origin.replace(/\/$/, '');
  return 'https://www.smartbusbr.com.br';
};

export const buildCompanyReferralLink = (origin: string, code: string) => {
  const normalizedCode = normalizeCompanyReferralCode(code);
  if (!normalizedCode) return '';
  return `${origin.replace(/\/$/, '')}/i/${normalizedCode}`;
};

export const readCompanyReferralTracking = (): CompanyReferralTracking | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(COMPANY_REFERRAL_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<CompanyReferralTracking>;
    const code = normalizeCompanyReferralCode(parsed.code);
    const capturedAt = typeof parsed.capturedAt === 'string' ? parsed.capturedAt : '';

    if (!code || !capturedAt) return null;
    return { code, capturedAt };
  } catch {
    return null;
  }
};

// Comentário de manutenção: o tracking do referral é intencionalmente temporário em sessionStorage.
// Isso evita carregar um vínculo antigo para sessões futuras e mantém o MVP rastreável sem heurística escondida.
export const persistCompanyReferralTracking = (code: string, capturedAt = new Date().toISOString()) => {
  if (typeof window === 'undefined') return;

  const normalizedCode = normalizeCompanyReferralCode(code);
  if (!normalizedCode) return;

  const payload: CompanyReferralTracking = { code: normalizedCode, capturedAt };
  window.sessionStorage.setItem(COMPANY_REFERRAL_STORAGE_KEY, JSON.stringify(payload));
};

export const clearCompanyReferralTracking = () => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(COMPANY_REFERRAL_STORAGE_KEY);
};
