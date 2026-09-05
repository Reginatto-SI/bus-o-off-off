import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resolvePaymentContext,
  validateWebhookTokenForContext,
} from '../../supabase/functions/_shared/payment-context-resolver';

const secrets = new Map<string, string>();

beforeEach(() => {
  // O runtime Deno e os secrets ficam inteiramente em memória: estes testes nunca acessam rede ou credenciais reais.
  vi.stubGlobal('Deno', {
    env: {
      get: (name: string) => secrets.get(name),
    },
  });
  secrets.set('ASAAS_WEBHOOK_TOKEN', 'production-webhook-token');
  secrets.set('ASAAS_WEBHOOK_TOKEN_SANDBOX', 'sandbox-webhook-token');
});

afterEach(() => {
  secrets.clear();
  vi.unstubAllGlobals();
});

const companyWithBothEnvironments = {
  payment_environment: 'sandbox',
  asaas_api_key_production: 'production-company-key',
  asaas_wallet_id_production: 'production-company-wallet',
  asaas_account_id_production: 'production-company-account',
  asaas_api_key_sandbox: 'sandbox-company-key',
  asaas_wallet_id_sandbox: 'sandbox-company-wallet',
  asaas_account_id_sandbox: 'sandbox-company-account',
};

describe('contexto financeiro Asaas congelado por venda', () => {
  it('prioriza o ambiente persistido na venda sobre empresa, request e hostname', () => {
    const context = resolvePaymentContext({
      mode: 'create',
      sale: { payment_environment: 'production' },
      company: companyWithBothEnvironments,
      requestedEnvironment: 'sandbox',
      request: new Request('https://localhost/checkout'),
    });

    expect(context.environment).toBe('production');
    expect(context.decisionTrace).toMatchObject({ environmentSource: 'sale', hostDetected: null });
    expect(context.apiKey).toBe('production-company-key');
    expect(context.companyWalletByEnvironment).toBe('production-company-wallet');
    expect(context.companyAccountIdByEnvironment).toBe('production-company-account');
    expect(context.apiKey).not.toBe('sandbox-company-key');
  });

  it('uma mudança posterior da empresa não troca o ambiente nem a credencial da venda antiga', () => {
    const changedCompany = { ...companyWithBothEnvironments, payment_environment: 'production' };
    const context = resolvePaymentContext({
      mode: 'verify',
      sale: { payment_environment: 'sandbox' },
      company: changedCompany,
      requestedEnvironment: 'production',
    });

    expect(context.environment).toBe('sandbox');
    expect(context.decisionTrace.environmentSource).toBe('sale');
    expect(context.apiKey).toBe('sandbox-company-key');
    expect(context.companyWalletByEnvironment).toBe('sandbox-company-wallet');
    expect(context.webhookTokenCandidates).toEqual(['sandbox-webhook-token']);
  });

  it('prioriza o ambiente da empresa sobre o request quando a venda não possui ambiente', () => {
    const context = resolvePaymentContext({
      mode: 'verify',
      requestedEnvironment: 'production',
      company: companyWithBothEnvironments,
    });

    // A empresa ainda precede o request explícito no fluxo financeiro principal.
    expect(context.environment).toBe('sandbox');
    expect(context.decisionTrace.environmentSource).toBe('company');
  });

  it('usa o ambiente explícito quando venda e empresa não fornecem contexto', () => {
    const context = resolvePaymentContext({
      mode: 'verify',
      requestedEnvironment: 'production',
      request: new Request('https://sandbox.example/checkout'),
    });

    // O hostname deliberadamente divergente comprova que somente o request explícito decide o fallback.
    expect(context.environment).toBe('production');
    expect(context.decisionTrace.environmentSource).toBe('request');
    expect(context.decisionTrace.hostDetected).toBeNull();
  });

  it('falha fechado quando nenhum contexto seleciona um ambiente', () => {
    expect(() => resolvePaymentContext({ mode: 'create' })).toThrow('payment_environment_unresolved');
  });

  it('não usa credencial do ambiente oposto quando a credencial correta está ausente', () => {
    const context = resolvePaymentContext({
      mode: 'verify',
      sale: { payment_environment: 'production' },
      company: {
        payment_environment: 'sandbox',
        asaas_api_key_sandbox: 'sandbox-only-key',
      },
    });

    expect(context.environment).toBe('production');
    expect(context.apiKey).toBeNull();
    expect(context.apiKeySource).toBe('missing_company_api_key');
  });
});

describe('autenticação do webhook Asaas por ambiente', () => {
  const productionContext = () => resolvePaymentContext({
    mode: 'webhook',
    sale: { payment_environment: 'production' },
    company: companyWithBothEnvironments,
  });

  it('aceita o token esperado sem devolver seu valor no resultado', () => {
    const result = validateWebhookTokenForContext(
      new Request('https://edge.example/webhook', {
        headers: { 'asaas-access-token': 'production-webhook-token' },
      }),
      productionContext(),
    );

    expect(result).toEqual({
      valid: true,
      reason: null,
      receivedHeaderName: 'asaas-access-token',
    });
    expect(JSON.stringify(result)).not.toContain('production-webhook-token');
  });

  it.each([
    ['ausente', undefined, 'missing_header'],
    ['inválido', 'wrong-token', 'invalid_token'],
    ['do Sandbox', 'sandbox-webhook-token', 'invalid_token'],
  ])('rejeita token %s', (_case, token, reason) => {
    const headers = token ? { 'asaas-access-token': token } : undefined;
    const result = validateWebhookTokenForContext(
      new Request('https://edge.example/webhook', { headers }),
      productionContext(),
    );

    expect(result).toMatchObject({ valid: false, reason });
  });
});
