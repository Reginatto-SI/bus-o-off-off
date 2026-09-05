import { describe, expect, it } from 'vitest';

import {
  PagbankError,
  assertPagbankEnvironmentAllowed,
  buildPagbankIdempotencyKey,
  buildPagbankWebhookEventKey,
  extractPagbankPixArtifacts,
  normalizePagbankStatus,
  sha256Hex,
  verifyPagbankWebhookSignature,
} from '../../supabase/functions/_shared/pagbank/core';
import { buildPagbankFixedSplitPlan } from '../../supabase/functions/_shared/pagbank/split-plan';
import {
  computeProgressiveFeeForPassengers,
  distributePlatformFee,
} from '../../supabase/functions/_shared/platform-fee-engine';

describe('PagBank — ambiente e idempotência', () => {
  it('permite apenas Sandbox nesta fase e bloqueia Produção explicitamente', () => {
    expect(assertPagbankEnvironmentAllowed('sandbox')).toBe('sandbox');
    expect(() => assertPagbankEnvironmentAllowed('production')).toThrowError(PagbankError);
    expect(() => assertPagbankEnvironmentAllowed(null)).toThrowError(PagbankError);
  });

  it('gera chave idempotente estável (sem tempo/aleatoriedade) por empresa+venda+ambiente+operação', () => {
    const a = buildPagbankIdempotencyKey({ companyId: 'c1', saleId: 's1', environment: 'sandbox', operation: 'create_pix' });
    const b = buildPagbankIdempotencyKey({ companyId: 'c1', saleId: 's1', environment: 'sandbox', operation: 'create_pix' });
    const other = buildPagbankIdempotencyKey({ companyId: 'c2', saleId: 's1', environment: 'sandbox', operation: 'create_pix' });
    expect(a).toBe(b);
    expect(a).not.toBe(other);
  });
});

describe('PagBank — status', () => {
  it('somente PAID finaliza; WAITING/AUTHORIZED/IN_ANALYSIS ficam pendentes', () => {
    expect(normalizePagbankStatus('PAID')).toBe('paid');
    expect(normalizePagbankStatus('paid')).toBe('paid');
    expect(normalizePagbankStatus('WAITING')).toBe('pending');
    expect(normalizePagbankStatus('AUTHORIZED')).toBe('pending');
    expect(normalizePagbankStatus('IN_ANALYSIS')).toBe('pending');
    expect(normalizePagbankStatus('DECLINED')).toBe('failed');
    expect(normalizePagbankStatus('CANCELED')).toBe('canceled');
    expect(normalizePagbankStatus('WHATEVER')).toBe('unknown');
  });

  it('extrai artefatos PIX de um Order com qr_codes e charges', () => {
    const art = extractPagbankPixArtifacts({
      id: 'ORDE_1',
      qr_codes: [{ id: 'QRCO_1', text: '000201...', expiration_date: '2026-09-05T12:00:00-03:00', links: [{ media: 'image/png', href: 'https://x/qr.png' }] }],
      charges: [{ id: 'CHAR_1', status: 'PAID' }],
    });
    expect(art.orderId).toBe('ORDE_1');
    expect(art.chargeId).toBe('CHAR_1');
    expect(art.qrText).toBe('000201...');
    expect(art.qrImageUrl).toBe('https://x/qr.png');
    expect(art.rawStatus).toBe('PAID');
  });
});

describe('PagBank — webhook', () => {
  it('valida assinatura SHA-256 de {token}-{corpo bruto} e rejeita corpo alterado', async () => {
    const rawBody = '{"id":"ORDE_1","charges":[{"id":"CHAR_1","status":"PAID"}]}';
    const token = 'tok_test';
    const signature = await sha256Hex(`${token}-${rawBody}`);
    expect((await verifyPagbankWebhookSignature({ rawBody, token, receivedSignature: signature })).valid).toBe(true);
    expect((await verifyPagbankWebhookSignature({ rawBody: rawBody + ' ', token, receivedSignature: signature })).reason).toBe('mismatch');
    expect((await verifyPagbankWebhookSignature({ rawBody, token: null, receivedSignature: signature })).reason).toBe('missing_token');
    expect((await verifyPagbankWebhookSignature({ rawBody, token, receivedSignature: null })).reason).toBe('missing_signature');
  });

  it('chave de deduplicação é estável por cobrança+status (evento repetido gera a mesma chave)', () => {
    const payload = { id: 'ORDE_1', charges: [{ id: 'CHAR_1', status: 'PAID' }] };
    expect(buildPagbankWebhookEventKey(payload)).toBe('CHAR_1:PAID');
    expect(buildPagbankWebhookEventKey(structuredClone(payload))).toBe('CHAR_1:PAID');
    expect(buildPagbankWebhookEventKey({ id: 'ORDE_1', charges: [{ id: 'CHAR_1', status: 'WAITING' }] })).toBe('CHAR_1:WAITING');
  });
});

describe('PagBank — split FIXED a partir do motor SmartBus', () => {
  const accounts = { company: 'ACC_COMPANY', marketplace: 'ACC_MKT', socio: 'ACC_SOCIO', representative: 'ACC_REP' };

  it('cenário sócio+representante (1/3 cada) fecha exatamente em centavos com a empresa recebendo o líquido', () => {
    const engine = computeProgressiveFeeForPassengers([150]); // 5% => R$ 7,50
    const distribution = distributePlatformFee({ totalFee: engine.totalFee, socioEligible: true, representativeEligible: true });
    const plan = buildPagbankFixedSplitPlan({ grossAmount: 150, distribution, accounts });
    expect(plan.totalCents).toBe(15000);
    expect(plan.feeCents).toBe(750);
    expect(plan.companyNetCents).toBe(14250);
    expect(plan.receivers.reduce((s, r) => s + r.amountCents, 0)).toBe(15000);
    expect(plan.payload?.method).toBe('FIXED');
    expect(plan.payload?.receivers).toHaveLength(4);
  });

  it('cenário sem sócio e sem representante mantém apenas empresa + marketplace', () => {
    const engine = computeProgressiveFeeForPassengers([80]); // 6% => R$ 4,80 -> mínimo R$ 5
    const distribution = distributePlatformFee({ totalFee: engine.totalFee, socioEligible: false, representativeEligible: false });
    const plan = buildPagbankFixedSplitPlan({ grossAmount: 80, distribution, accounts: { ...accounts, socio: null, representative: null } });
    expect(plan.feeCents).toBe(500);
    expect(plan.receivers.map((r) => r.kind)).toEqual(['company', 'marketplace']);
  });

  it('recebedor elegível sem conta PagBank bloqueia a cobrança (sem degradação silenciosa)', () => {
    const distribution = distributePlatformFee({ totalFee: 6, socioEligible: true, representativeEligible: false });
    expect(() => buildPagbankFixedSplitPlan({ grossAmount: 100, distribution, accounts: { ...accounts, socio: null } })).toThrowError(/recebedor sem conta/);
  });

  it('taxa zero gera cobrança sem split (100% da empresa)', () => {
    const distribution = distributePlatformFee({ totalFee: 0, socioEligible: false, representativeEligible: false });
    const plan = buildPagbankFixedSplitPlan({ grossAmount: 50, distribution, accounts });
    expect(plan.payload).toBeNull();
    expect(plan.companyNetCents).toBe(5000);
  });
});
