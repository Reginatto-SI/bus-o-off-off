import { describe, expect, it } from 'vitest';
import type { Company } from '@/types/database';
import { getAsaasIntegrationSnapshot } from '@/lib/asaasIntegrationStatus';

function buildCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: 'company-1',
    name: 'Empresa Teste',
    trade_name: null,
    legal_name: null,
    cnpj: null,
    legal_type: 'PJ',
    document_number: null,
    city: null,
    state: null,
    logo_url: null,
    primary_color: null,
    accent_color: null,
    ticket_color: null,
    public_slug: null,
    slogan: null,
    document: null,
    phone: null,
    email: null,
    whatsapp: null,
    website: null,
    address: null,
    address_number: null,
    province: null,
    postal_code: null,
    notes: null,
    asaas_account_id_production: null,
    asaas_account_email_production: null,
    asaas_wallet_id_production: null,
    asaas_api_key_production: null,
    asaas_onboarding_complete_production: false,
    asaas_account_id_sandbox: null,
    asaas_account_email_sandbox: null,
    asaas_wallet_id_sandbox: null,
    asaas_api_key_sandbox: null,
    asaas_onboarding_complete_sandbox: false,
    platform_fee_percent: 3,
    socio_split_percent: 3,
    cover_image_url: null,
    use_default_cover: false,
    intro_text: null,
    background_style: 'solid',
    hero_badge_labels: null,
    social_instagram: null,
    social_facebook: null,
    social_tiktok: null,
    social_youtube: null,
    social_telegram: null,
    social_twitter: null,
    social_website: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    referral_code: 'TESTE123',
    updated_at: '2026-01-01T00:00:00.000Z',
    allow_manual_reservations: false,
    allow_manual_boarding: false,
    manual_reservation_ttl_minutes: 30,
    ...overrides,
  };
}

describe('getAsaasIntegrationSnapshot', () => {
  it('mantém not_configured quando o ambiente atual está vazio', () => {
    const company = buildCompany();

    const snapshot = getAsaasIntegrationSnapshot(company, 'sandbox');

    expect(snapshot.status).toBe('not_configured');
    expect(snapshot.currentIsConnected).toBe(false);
    expect(snapshot.legacyIsConnected).toBe(false);
  });

  it('mantém not_configured quando só o outro ambiente está pronto, sem misturar ambientes no card', () => {
    const company = buildCompany({
      asaas_api_key_production: 'prod-key',
      asaas_wallet_id_production: 'prod-wallet',
      asaas_onboarding_complete_production: true,
    });

    const snapshot = getAsaasIntegrationSnapshot(company, 'sandbox');

    expect(snapshot.status).toBe('not_configured');
    expect(snapshot.currentIsConnected).toBe(false);
    expect(snapshot.oppositeIsConnected).toBe(false);
  });

  it('marca conectado apenas quando api key, wallet, account_id e onboarding do ambiente atual existem', () => {
    const company = buildCompany({
      asaas_api_key_sandbox: 'sandbox-key',
      asaas_wallet_id_sandbox: 'sandbox-wallet',
      asaas_account_id_sandbox: 'sandbox-account',
      asaas_onboarding_complete_sandbox: true,
      asaas_account_email_sandbox: 'sandbox@example.com',
    });

    const snapshot = getAsaasIntegrationSnapshot(company, 'sandbox');

    expect(snapshot.status).toBe('connected');
    expect(snapshot.current.accountEmail).toBe('sandbox@example.com');
  });

  it('marca parcialmente configurado quando o ambiente atual está operacional, mas sem account_id local', () => {
    const company = buildCompany({
      asaas_api_key_sandbox: 'sandbox-key',
      asaas_wallet_id_sandbox: 'sandbox-wallet',
      asaas_onboarding_complete_sandbox: true,
    });

    const snapshot = getAsaasIntegrationSnapshot(company, 'sandbox');

    expect(snapshot.status).toBe('partially_configured');
    expect(snapshot.reasons).toContain('conta operacional sem account_id salvo no ambiente operacional');
  });
});
