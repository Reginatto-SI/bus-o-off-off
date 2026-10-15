import { describe, expect, it, vi } from 'vitest';
vi.mock('../../supabase/functions/_shared/payment-observability.ts', () => ({
  logPaymentTrace: vi.fn(), logSaleOperationalEvent: vi.fn(), logCriticalPaymentIssue: vi.fn(),
}));
import { createTicketsFromPassengersShared, finalizeConfirmedPayment, inspectSaleConsistency } from '../../supabase/functions/_shared/payment-finalization.ts';

function db({ tickets = 1, staged = 2, rpcError = false } = {}) {
  const state = { tickets, staged, expected: null as number | null };
  const rpc = vi.fn(async (name: string) => {
    if (name !== 'issue_sale_tickets_from_staging') return { data: [], error: null };
    if (rpcError) return { data: null, error: { message: 'conflict' } };
    if (!state.staged) return { data: 'skipped_existing', error: null };
    state.expected = state.staged; state.tickets = state.staged; state.staged = 0;
    return { data: 'created', error: null };
  });
  const from = vi.fn((table: string) => {
    let head = false;
    const result = () => ({
      data: table === 'sales' ? { id: 's', company_id: 'c', status: 'pago', expected_ticket_count: state.expected } :
        table === 'sale_passengers' ? Array.from({length: state.staged}, (_,i) => ({ id: `p${i}`, trip_id: 't', final_price: 100 })) : [],
      count: head ? table === 'tickets' ? state.tickets : state.staged : null, error: null,
    });
    const q: Record<string, unknown> = {};
    q.select = (_: unknown, opts?: {head?: boolean}) => {head=!!opts?.head;return q;};
    for (const method of ['eq', 'in', 'order', 'update', 'delete', 'insert']) q[method] = () => q;
    q.maybeSingle = async () => result();
    q.then = (resolve: (r: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return q;
  });
  return { from, rpc, state };
}
describe('partial ticket finalization', () => {
  it('one ticket with two staged items is incomplete', async () => {
    expect((await inspectSaleConsistency(db(), 's')).state).toBe('inconsistent_paid_without_ticket');
  });
  it('persisted expected count detects missing ticket after staging cleanup', async () => {
    const admin = db({tickets: 1, staged: 0}); admin.state.expected = 2;
    expect((await inspectSaleConsistency(admin, 's')).state).toBe('inconsistent_paid_without_ticket');
  });
  it('does not skip RPC because a ticket already exists', async () => {
    const admin = db();
    expect((await createTicketsFromPassengersShared(admin,'s','c')).status).toBe('created');
    expect(admin.state).toEqual({tickets:2,staged:0,expected:2});
  });
  it.each(['pagbank', 'asaas'] as const)('finalizes partial %s sale and repeated confirmation without duplicates', async gateway => {
    const admin=db();
    const params={supabaseAdmin:admin,sale:{id:'s',company_id:'c',status:'pago'},confirmedAt:'2026-10-11T00:00:00Z',asaasStatus:'PAID',source:'verify-payment-status' as const,gateway};
    expect((await finalizeConfirmedPayment(params)).ok).toBe(true);
    expect((await finalizeConfirmedPayment(params)).ok).toBe(true);
    expect(admin.state.tickets).toBe(2);
  });
  it.each(['pagbank', 'asaas'] as const)('concurrent %s confirmations reuse atomic issuance and converge to two tickets', async gateway => {
    const admin = db();
    const params = {supabaseAdmin:admin,sale:{id:'s',company_id:'c',status:'pago'},confirmedAt:'2026-10-11T00:00:00Z',asaasStatus:'PAID',source:'verify-payment-status' as const,gateway};
    const results = await Promise.all([finalizeConfirmedPayment(params), finalizeConfirmedPayment(params)]);
    expect(results.every(result => result.ok)).toBe(true);
    expect(admin.state).toEqual({tickets:2,staged:0,expected:2});
    expect(admin.rpc.mock.calls.filter(([name]) => name === 'issue_sale_tickets_from_staging')).toHaveLength(2);
  });
  it('partial conflict never reports successful finalization or cleans locks', async () => {
    const admin=db({rpcError:true});
    const result=await finalizeConfirmedPayment({supabaseAdmin:admin,sale:{id:'s',company_id:'c',status:'pago'},confirmedAt:'now',asaasStatus:'PAID',source:'verify-payment-status',gateway:'pagbank'});
    expect(result.ok).toBe(false);
    expect(admin.state.staged).toBe(2);
    expect(admin.from).not.toHaveBeenCalledWith('seat_locks');
  });
});
