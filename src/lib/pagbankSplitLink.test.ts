import { describe, it, expect } from 'vitest';
import {
  extractPagbankPixArtifacts, extractPagbankSplitLinkIds, attachPagbankSplitToOrder, validatePagbankPixOrder,
} from '../../supabase/functions/_shared/pagbank/core';

const order = {
  id: 'ORDE_1', reference_id: 'sale-1',
  charges: [{
    id: 'CHAR_1', status: 'WAITING',
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
  it('sem consulta do split, o gate continua bloqueando', () => {
    const v = validatePagbankPixOrder({ order, expectedReferenceId: 'sale-1', expectedReceivers: expected, expectedTotalCents: 10600 });
    expect(v.ok).toBe(false);
  });
  it('com split consultado e exato, o gate aprova', () => {
    const split = { method: 'FIXED', receivers: expected.map((r) => ({ account: { id: r.accountId }, amount: { value: r.amountCents } })) };
    const v = validatePagbankPixOrder({ order: attachPagbankSplitToOrder(order, split), expectedReferenceId: 'sale-1', expectedReceivers: expected, expectedTotalCents: 10600 });
    expect(v.ok).toBe(true);
  });
  it('split consultado com valor divergente é recusado', () => {
    const split = { receivers: [{ account: { id: 'ACCO_EMP' }, amount: { value: 10100 } }, { account: { id: 'ACCO_MKT' }, amount: { value: 500 } }] };
    const v = validatePagbankPixOrder({ order: attachPagbankSplitToOrder(order, split), expectedReferenceId: 'sale-1', expectedReceivers: expected, expectedTotalCents: 10600 });
    expect(v.ok).toBe(false);
  });
});
