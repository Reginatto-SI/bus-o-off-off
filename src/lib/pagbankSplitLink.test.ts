import { describe, it, expect } from 'vitest';
import {
  extractPagbankPixArtifacts, extractPagbankSplitLinkIds, attachPagbankSplitToOrder, validatePagbankPixOrder, validatePagbankCardOrder,
} from '../../supabase/functions/_shared/pagbank/core';

const order = {
  id: 'ORDE_1', reference_id: 'sale-1',
  charges: [{
    id: 'CHAR_1', status: 'WAITING',
    amount: { value: 10600 },
    qr_code: { id: 'QRCO_1', text: '000201PIX', expiration_date: '2026-10-01T00:00:00Z' },
    links: [{ rel: 'SPLIT', href: 'https://sandbox.api.pagseguro.com/splits/SPLI_ABC-1' }],
  }],
};
const expected = [{ accountId: 'ACCO_EMP', amountCents: 10000 }, { accountId: 'ACCO_MKT', amountCents: 600 }];

describe('PagBank formato observado no Sandbox', () => {
  it('lê o PIX em charges[0].qr_code', () => {
    const a = extractPagbankPixArtifacts(order);
    expect(a.qrText).toBe('000201PIX');
    expect(a.qrCodeId).toBe('QRCO_1');
    expect(a.expiresAt).toBe('2026-10-01T00:00:00Z');
  });
  it('extrai o SPLI_ do link SPLIT', () => {
    expect(extractPagbankSplitLinkIds(order)).toEqual(['SPLI_ABC-1']);
  });
  it('aceita um único Split referenciado sem detalhes, preservando QR e conciliação pendente', () => {
    const v = validatePagbankPixOrder({ order, expectedReferenceId: 'sale-1', expectedReceivers: expected, expectedTotalCents: 10600 });
    expect(v).toMatchObject({ ok: true, splitStatus: 'accepted_unverified', splitId: 'SPLI_ABC-1', artifacts: { qrText: '000201PIX' }, split: { ok: false } });
  });
  it('com split consultado e exato, o gate aprova', () => {
    const split = { method: 'FIXED', receivers: expected.map((r) => ({ account: { id: r.accountId }, amount: { value: r.amountCents } })) };
    const v = validatePagbankPixOrder({ order: attachPagbankSplitToOrder(order, split), expectedReferenceId: 'sale-1', expectedReceivers: expected, expectedTotalCents: 10600 });
    expect(v).toMatchObject({ ok: true, splitStatus: 'confirmed', split: { ok: true } });
  });
  it('split consultado com valor divergente é recusado', () => {
    const split = { receivers: [{ account: { id: 'ACCO_EMP' }, amount: { value: 10100 } }, { account: { id: 'ACCO_MKT' }, amount: { value: 500 } }] };
    const v = validatePagbankPixOrder({ order: attachPagbankSplitToOrder(order, split), expectedReferenceId: 'sale-1', expectedReceivers: expected, expectedTotalCents: 10600 });
    expect(v.ok).toBe(false);
  });

  const validate = (candidate: unknown) => validatePagbankPixOrder({ order: candidate, expectedReferenceId: 'sale-1', expectedReceivers: expected, expectedTotalCents: 10600 });
  it('mantém QR Code obrigatório mesmo com Split aceito', () => {
    expect(validate({ ...order, charges: [{ ...order.charges[0], qr_code: null }] })).toMatchObject({ ok: false, errorCode: 'pagbank_pix_artifact_missing' });
  });
  it('rejeita ausência total de Split', () => {
    expect(validate({ ...order, charges: [{ ...order.charges[0], links: [] }] })).toMatchObject({ ok: false, errorCode: 'pagbank_split_not_confirmed' });
  });
  it.each([false, true])('rejeita múltiplos Splits mesmo com recebedores visíveis: %s', (visible) => {
    const candidate = { ...order, charges: [{ ...order.charges[0], links: [...order.charges[0].links, { rel: 'SPLIT', href: 'https://sandbox.api.pagseguro.com/splits/SPLI_OTHER' }] }] };
    const split = { receivers: expected.map((r) => ({ account: { id: r.accountId }, amount: { value: r.amountCents } })) };
    expect(validate(visible ? attachPagbankSplitToOrder(candidate, split) : candidate)).toMatchObject({ ok: false, reason: 'multiple_split_links' });
  });
  it.each([10599, 10601, null])('bloqueia total da cobrança divergente ou ausente: %s', (value) => {
    expect(validate({ ...order, charges: [{ ...order.charges[0], amount: { value } }] })).toMatchObject({ ok: false, reason: 'charge_amount_mismatch' });
  });
  it('bloqueia referência divergente mesmo com um Split', () => {
    expect(validate({ ...order, reference_id: 'other-sale' })).toMatchObject({ ok: false, reason: 'reference_id_mismatch' });
  });
  it('não usa o link para ignorar recebedores parcialmente visíveis', () => {
    const split = { receivers: [{ account: { id: 'ACCO_EMP' }, amount: { value: 10000 } }] };
    expect(validate(attachPagbankSplitToOrder(order, split))).toMatchObject({ ok: false, reason: 'missing_receiver' });
  });
  it('bloqueia soma divergente do plano esperado sem recebedores visíveis', () => {
    expect(validatePagbankPixOrder({ expectedReferenceId: 'sale-1', expectedReceivers: expected, expectedTotalCents: 10601,
      order: { ...order, charges: [{ ...order.charges[0], amount: { value: 10601 } }] },
    })).toMatchObject({ ok: false, reason: 'sum_mismatch' });
  });
  it('mantém a aceitação pendente no cartão e bloqueia divergências visíveis', () => {
    const params = { order, expectedReferenceId: 'sale-1', expectedReceivers: expected, expectedTotalCents: 10600 };
    expect(validatePagbankCardOrder(params)).toMatchObject({ ok: true, splitStatus: 'accepted_unverified' });
    const split = { receivers: [{ account: { id: 'ACCO_EMP' }, amount: { value: 10100 } }, { account: { id: 'ACCO_MKT' }, amount: { value: 500 } }] };
    expect(validatePagbankCardOrder({ ...params, order: attachPagbankSplitToOrder(order, split) })).toMatchObject({ ok: false, errorCode: 'pagbank_split_not_confirmed' });
  });
  it('mantém cartão conciliado com recebedores exatos', () => {
    const split = { receivers: expected.map((r) => ({ account: { id: r.accountId }, amount: { value: r.amountCents } })) };
    expect(validatePagbankCardOrder({ order: attachPagbankSplitToOrder(order, split), expectedReferenceId: 'sale-1', expectedReceivers: expected, expectedTotalCents: 10600 })).toMatchObject({ ok: true, splitStatus: 'confirmed' });
  });
  it.each(['DECLINED', 'CANCELED'])('mantém cartão %s bloqueado mesmo com Split referenciado', (status) => {
    expect(validatePagbankCardOrder({ order: { ...order, charges: [{ ...order.charges[0], status }] }, expectedReferenceId: 'sale-1', expectedReceivers: expected, expectedTotalCents: 10600 })).toMatchObject({ ok: false, errorCode: 'pagbank_card_declined' });
  });
});
