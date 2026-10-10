import { describe, expect, it, vi, beforeEach } from 'vitest';
import { validatePagbankOrderIntegrity } from '../../supabase/functions/_shared/pagbank/order-integrity.ts';

const syncMock = vi.fn();
vi.mock('../../supabase/functions/_shared/pagbank/status-sync.ts', () => ({
  syncPagbankSaleStatus: (...a: unknown[]) => syncMock(...a),
}));
import { evaluatePagbankSale, pagbankSalesToPreserve, recoverPendingPagbankSales } from '../../supabase/functions/cleanup-expired-locks/pagbank-guard.ts';

const sale = { id: 'sale-1', company_id: 'c1', status: 'pendente_pagamento', payment_environment: 'sandbox', payment_connection_id: 'conn-1' };
const exp = {
  saleId: 'sale-1', saleEnvironment: 'sandbox', saleConnectionId: 'conn-1', credentialEnvironment: 'sandbox',
  attempt: { external_order_id: 'ORDE_1', amount_cents: 10600, environment: 'sandbox', connection_id: 'conn-1' },
};
const order = { id: 'ORDE_1', reference_id: 'sale-1', charges: [{ status: 'PAID', amount: { value: 10600, currency: 'BRL' } }] };

function fakeDb(rows: Record<string, unknown[]>, failSales = false) {
  const q = (table: string) => {
    const chain: any = {};
    ['select', 'in', 'eq', 'not', 'gte', 'order', 'limit'].forEach((m) => { chain[m] = () => chain; });
    chain.then = (res: any) => res(failSales && table === 'sales' ? { data: null, error: { message: 'x' } } : { data: rows[table] ?? [], error: null });
    return chain;
  };
  return { from: q };
}

describe('integridade da Order PAID', () => {
  it('aceita Order que corresponde à venda', () => expect(validatePagbankOrderIntegrity(order, exp)).toEqual({ ok: true }));
  it.each([
    ['order_id_mismatch', { ...order, id: 'ORDE_X' }, exp],
    ['reference_id_mismatch', { ...order, reference_id: 'outra' }, exp],
    ['amount_mismatch', { ...order, charges: [{ amount: { value: 100, currency: 'BRL' } }] }, exp],
    ['currency_mismatch', { ...order, charges: [{ amount: { value: 10600, currency: 'USD' } }] }, exp],
    ['environment_mismatch', order, { ...exp, credentialEnvironment: 'production' }],
    ['connection_mismatch', order, { ...exp, attempt: { ...exp.attempt, connection_id: 'outra' } }],
  ])('bloqueia %s', (reason, o, e) => expect(validatePagbankOrderIntegrity(o, e as any)).toEqual({ ok: false, reason }));
});

describe('cleanup e recuperação PagBank', () => {
  beforeEach(() => syncMock.mockReset());

  it('PIX pago com navegador fechado: recuperação finaliza', async () => {
    syncMock.mockResolvedValue({ state: 'paid', finalizationOk: true });
    const n = await recoverPendingPagbankSales(fakeDb({ payment_attempts: [{ sale_id: 'sale-1' }], sales: [sale] }), () => {});
    expect(n).toBe(1);
  });
  it('Order WAITING é preservada', async () => {
    syncMock.mockResolvedValue({ state: 'pending', normalized: 'pending' });
    expect((await evaluatePagbankSale({}, sale)).decision).toBe('preserve');
  });
  it('consulta indisponível preserva a venda', async () => {
    syncMock.mockResolvedValue({ state: 'query_failed', code: 'pagbank_transient_error' });
    expect((await evaluatePagbankSale({}, sale)).decision).toBe('preserve');
    syncMock.mockRejectedValue(new Error('timeout'));
    expect((await evaluatePagbankSale({}, sale)).decision).toBe('preserve');
  });
  it('PAID com finalização incompleta não libera cancelamento', async () => {
    syncMock.mockResolvedValue({ state: 'paid', finalizationOk: false });
    expect((await evaluatePagbankSale({}, sale)).decision).toBe('preserve');
  });
  it('recusa/cancelamento oficial libera o cancelamento normal', async () => {
    syncMock.mockResolvedValue({ state: 'pending', normalized: 'failed' });
    expect((await evaluatePagbankSale({}, sale)).decision).toBe('allow_cancel');
  });
  it('cleanup com venda pendente: PagBank preservado, não PagBank inalterado', async () => {
    syncMock.mockResolvedValue({ state: 'pending', normalized: 'pending' });
    const keep = await pagbankSalesToPreserve(fakeDb({ sales: [sale] }), ['sale-1', 'asaas-1'], () => {});
    expect([...keep]).toEqual(['sale-1']);
  });
  it('falha ao identificar gateway preserva todas as candidatas', async () => {
    const keep = await pagbankSalesToPreserve(fakeDb({}, true), ['a', 'b'], () => {});
    expect(keep.size).toBe(2);
  });
  it('recuperação apenas consulta: nunca usa criação de cobrança', async () => {
    syncMock.mockResolvedValue({ state: 'pending', normalized: 'pending' });
    await recoverPendingPagbankSales(fakeDb({ payment_attempts: [{ sale_id: 'sale-1' }], sales: [sale] }), () => {});
    expect(syncMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: 'pagbank_background_recovery' }));
  });
});
