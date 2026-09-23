import { describe, expect, it } from 'vitest';

import {
  PagbankError,
  assertPagbankEnvironmentAllowed,
  buildPagbankIdempotencyKey,
  buildPagbankWebhookEventKey,
  extractPagbankPixArtifacts,
  normalizePagbankStatus,
  reconcilePagbankSplit,
  sha256Hex,
  validatePagbankPixOrder,
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

describe('conciliação de split PagBank', () => {
  const expected = [
    { accountId: 'ACC_MKT', amountCents: 500 },
    { accountId: 'ACC_REP', amountCents: 250 },
  ];

  it('confirma quando o PagBank devolve os mesmos recebedores e valores', () => {
    const order = {
      charges: [{
        splits: { method: 'FIXED', receivers: [
          { account: { id: 'ACC_REP' }, amount: { value: 250 } },
          { account: { id: 'ACC_MKT' }, amount: { value: 500 } },
        ] },
      }],
    };
    expect(reconcilePagbankSplit(order, expected, 750)).toEqual({
      ok: true,
      reason: 'confirmed',
      echoed: [
        { accountId: 'ACC_REP', amountCents: 250 },
        { accountId: 'ACC_MKT', amountCents: 500 },
      ],
      echoedTotalCents: 750,
    });
  });

  it('reprova quando o split não volta na resposta', () => {
    const result = reconcilePagbankSplit({ charges: [{ id: 'CHAR_1' }] }, expected);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: 'missing' });
  });

  it('reprova quando o valor divergir', () => {
    const order = {
      charges: [{ splits: { receivers: [
        { account: { id: 'ACC_MKT' }, amount: { value: 400 } },
        { account: { id: 'ACC_REP' }, amount: { value: 250 } },
      ] } }],
    };
    expect(reconcilePagbankSplit(order, expected)).toMatchObject({ ok: false, reason: 'amount_mismatch' });
  });

  it('reprova quando um recebedor divergir', () => {
    const order = {
      charges: [{ splits: { receivers: [
        { account: { id: 'ACC_OUTRO' }, amount: { value: 500 } },
        { account: { id: 'ACC_REP' }, amount: { value: 250 } },
      ] } }],
    };
    expect(reconcilePagbankSplit(order, expected)).toMatchObject({ ok: false, reason: 'unexpected_receiver' });
  });

  it('não exige split quando a venda não tem divisão', () => {
    expect(reconcilePagbankSplit({ charges: [{ id: 'CHAR_1' }] }, [])).toEqual({
      ok: true,
      reason: 'not_expected',
      echoed: [],
      echoedTotalCents: 0,
    });
  });
});

describe('validação integral de Order PIX PagBank', () => {
  const expectedReceivers = [
    { accountId: 'ACC_COMPANY', amountCents: 10_000 },
    { accountId: 'ACC_MKT', amountCents: 600 },
  ];
  const receiver = (accountId: unknown, amountCents: unknown) => ({
    account: { id: accountId },
    amount: { value: amountCents },
  });
  const order = (receivers: unknown = [receiver('ACC_COMPANY', 10_000), receiver('ACC_MKT', 600)], overrides = {}) => ({
    id: 'ORDE_1',
    reference_id: 'sale-1',
    charges: [{
      id: 'CHAR_1',
      status: 'WAITING',
      payment_method: { type: 'PIX', pix: { qr_code: { text: 'pix-copy-paste' } } },
      splits: receivers === undefined ? undefined : { method: 'FIXED', receivers },
    }],
    ...overrides,
  });
  const validate = (candidate: unknown) => validatePagbankPixOrder({
    order: candidate,
    expectedReferenceId: 'sale-1',
    expectedReceivers,
    expectedTotalCents: 10_600,
  });

  it('aceita Order recuperada somente com referência, IDs, split, soma e PIX exatos', () => {
    expect(validate(order())).toMatchObject({ ok: true });
  });

  it.each([
    ['recebedor extra', [receiver('ACC_COMPANY', 10_000), receiver('ACC_MKT', 600), receiver('ACC_EXTRA', 1)], 'unexpected_receiver'],
    ['recebedor esperado ausente', [receiver('ACC_COMPANY', 10_000)], 'missing_receiver'],
    ['conta diferente', [receiver('ACC_COMPANY', 10_000), receiver('ACC_OTHER', 600)], 'unexpected_receiver'],
    ['valor maior', [receiver('ACC_COMPANY', 10_000), receiver('ACC_MKT', 601)], 'amount_mismatch'],
    ['valor menor', [receiver('ACC_COMPANY', 10_000), receiver('ACC_MKT', 599)], 'amount_mismatch'],
    ['recebedor duplicado', [receiver('ACC_COMPANY', 10_000), receiver('ACC_MKT', 300), receiver('ACC_MKT', 300)], 'duplicate_receiver'],
    ['soma maior', [receiver('ACC_COMPANY', 10_001), receiver('ACC_MKT', 600)], 'amount_mismatch'],
    ['soma menor', [receiver('ACC_COMPANY', 9_999), receiver('ACC_MKT', 600)], 'amount_mismatch'],
    ['conta nula', [receiver('ACC_COMPANY', 10_000), receiver(null, 600)], 'invalid_receiver'],
    ['valor nulo', [receiver('ACC_COMPANY', 10_000), receiver('ACC_MKT', null)], 'invalid_amount'],
    ['valor decimal', [receiver('ACC_COMPANY', 10_000), receiver('ACC_MKT', 600.5)], 'invalid_amount'],
  ])('rejeita %s em Order criada ou recuperada', (_label, receivers, reason) => {
    expect(validate(order(receivers))).toMatchObject({
      ok: false,
      errorCode: 'pagbank_split_not_confirmed',
      reason,
    });
  });

  it.each([
    ['maior', [receiver('ACC_COMPANY', 10_001), receiver('ACC_MKT', 600)], 10_601],
    ['menor', [receiver('ACC_COMPANY', 9_999), receiver('ACC_MKT', 600)], 10_599],
  ])('identifica explicitamente soma %s que o total financeiro', (_label, receivers, echoedTotalCents) => {
    const result = validate(order(receivers));
    if (result.ok || !result.split || result.split.ok) throw new Error('split divergence expected');
    expect(result.split.echoedTotalCents).toBe(echoedTotalCents);
    expect(result.split.issues).toContain('sum_mismatch');
  });

  it('registra simultaneamente cardinalidade, recebedor inesperado e soma divergente', () => {
    const result = validate(order([
      receiver('ACC_COMPANY', 10_000),
      receiver('ACC_MKT', 600),
      receiver('ACC_EXTRA', 1),
    ]));
    expect(result).toMatchObject({ ok: false, errorCode: 'pagbank_split_not_confirmed' });
    if (result.ok || !result.split || result.split.ok) throw new Error('split divergence expected');
    expect(result.split.issues).toEqual(expect.arrayContaining(['count_mismatch', 'unexpected_receiver', 'sum_mismatch']));
  });

  it.each([
    ['split ausente', order(null, {
      charges: [{
        id: 'CHAR_1',
        status: 'WAITING',
        payment_method: { type: 'PIX', pix: { qr_code: { text: 'pix-copy-paste' } } },
      }],
    }), 'missing'],
    ['split incompleto', order(null), 'incomplete'],
  ])('rejeita %s', (_label, candidate, reason) => {
    expect(validate(candidate)).toMatchObject({ ok: false, errorCode: 'pagbank_split_not_confirmed', reason });
  });

  it('rejeita Order recuperada sem PIX', () => {
    const candidate = order(undefined, {
      charges: [{
        id: 'CHAR_1', status: 'WAITING',
        splits: { method: 'FIXED', receivers: [receiver('ACC_COMPANY', 10_000), receiver('ACC_MKT', 600)] },
      }],
    });
    expect(validate(candidate)).toMatchObject({
      ok: false,
      errorCode: 'pagbank_pix_artifact_missing',
      reason: 'pix_qr_text_missing',
    });
  });

  it.each([
    ['Order ID', order(undefined, { id: null }), 'order_id_missing'],
    ['reference_id', order(undefined, { reference_id: null }), 'reference_id_missing'],
    ['referência divergente', order(undefined, { reference_id: 'other-sale' }), 'reference_id_mismatch'],
    ['Charge ID', order(undefined, { charges: [{
      status: 'WAITING',
      payment_method: { type: 'PIX', pix: { qr_code: { text: 'pix-copy-paste' } } },
      splits: { method: 'FIXED', receivers: [receiver('ACC_COMPANY', 10_000), receiver('ACC_MKT', 600)] },
    }] }), 'charge_id_missing'],
  ])('rejeita resposta incompleta sem %s', (_label, candidate, reason) => {
    expect(validate(candidate)).toMatchObject({
      ok: false,
      errorCode: 'pagbank_order_response_incomplete',
      reason,
    });
  });
});

describe('artefatos PIX no formato oficial charges[]', () => {
  it('extrai QR e status de charges[].payment_method.pix', () => {
    const art = extractPagbankPixArtifacts({
      id: 'ORDE_1',
      charges: [{
        id: 'CHAR_1',
        status: 'WAITING',
        payment_method: { type: 'PIX', pix: { qr_code: { text: '000201-pix' }, expiration_date: '2026-09-07T12:00:00-03:00' } },
      }],
    });
    expect(art).toMatchObject({ orderId: 'ORDE_1', chargeId: 'CHAR_1', qrText: '000201-pix', rawStatus: 'WAITING' });
  });
});
