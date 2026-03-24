import { describe, expect, it } from 'vitest';
import { getAsaasIntegrationSnapshot } from '@/lib/asaasIntegrationStatus';
import type { Company } from '@/types/database';

function buildCompany(overrides: Partial<Company>): Company {
  return {
    id: 'company-1',
    name: 'Empresa Teste',
    trade_name: 'Empresa Teste',
    legal_name: 'Empresa Teste LTDA',
    cnpj: '00000000000191',
    legal_type: 'PJ',
    document_number: '00000000000191',
    city: null,
    state: null,
    logo_url: null,
    primary_color: null,
    accent_color: null,
    ticket_color: null,
    public_slug: null,
    referral_code: 'ABC123',
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
    use_default_cover: true,
    intro_text: null,
    background_style: 'solid',
    social_instagram: null,
    social_facebook: null,
    social_tiktok: null,
    social_youtube: null,
    social_telegram: null,
    social_twitter: null,
    social_website: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('getAsaasIntegrationSnapshot', () => {
  it('marca conectado para vínculo via API direta apenas com API Key no ambiente ativo', () => {
    const company = buildCompany({
      asaas_api_key_production: 'key_prod_123',
      asaas_wallet_id_production: null,
      asaas_onboarding_complete_production: false,
      asaas_account_id_production: null,
    });

    const snapshot = getAsaasIntegrationSnapshot(company, 'production');

    expect(snapshot.status).toBe('connected');
    expect(snapshot.currentIsConnected).toBe(true);
  });

  it('mantém inconsistente quando onboarding está true mas faltam credenciais operacionais', () => {
    const company = buildCompany({
      asaas_onboarding_complete_sandbox: true,
      asaas_api_key_sandbox: null,
      asaas_wallet_id_sandbox: null,
    });

    const snapshot = getAsaasIntegrationSnapshot(company, 'sandbox');

    expect(snapshot.status).toBe('inconsistent');
    expect(snapshot.reasons).toContain('onboarding marcado sem API key no ambiente operacional');
    expect(snapshot.reasons).toContain('onboarding marcado sem wallet no ambiente operacional');
  });

  it('respeita isolamento por ambiente (não usa produção para completar sandbox)', () => {
    const company = buildCompany({
      asaas_api_key_production: 'key_prod_123',
      asaas_wallet_id_production: 'wallet_prod_123',
      asaas_onboarding_complete_production: true,
    });

    const snapshot = getAsaasIntegrationSnapshot(company, 'sandbox');

    expect(snapshot.status).toBe('not_configured');
    expect(snapshot.currentIsConnected).toBe(false);
  });
});
