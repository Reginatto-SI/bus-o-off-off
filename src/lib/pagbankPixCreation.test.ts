import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const serve = vi.fn();
  vi.stubGlobal('Deno', { serve, env: { get: () => 'ACCO_MKT' } });
  return {
    serve, createClient: vi.fn(), request: vi.fn(), split: vi.fn(), order: vi.fn(), find: vi.fn(),
    credential: vi.fn(), recipients: vi.fn(), log: vi.fn(), finalize: vi.fn(), sync: vi.fn(),
  };
});
vi.mock('https://esm.sh/@supabase/supabase-js@2.39.0', () => ({ createClient: mocks.createClient }));
vi.mock('../../supabase/functions/_shared/payment-observability.ts', () => ({
  logPaymentTrace: mocks.log, logCriticalPaymentIssue: mocks.log,
  logSaleIntegrationEvent: mocks.log, logSaleOperationalEvent: mocks.log,
}));
vi.mock('../../supabase/functions/_shared/pagbank/client.ts', () => ({
  pagbankRequest: mocks.request, getPagbankSplit: mocks.split, getPagbankOrder: mocks.order,
  findPagbankOrdersByReference: mocks.find, toPagbankError: vi.fn(),
}));
vi.mock('../../supabase/functions/_shared/pagbank/credentials.ts', () => ({
  resolvePagbankCredentialForSale: mocks.credential,
  pagbankSecretNames: () => ({ marketplaceAccountId: 'TEST_MARKETPLACE_ID' }), resolvePlatformAccessToken: vi.fn(),
}));
vi.mock('../../supabase/functions/_shared/pagbank/split-recipients.ts', () => ({ resolvePagbankSplitRecipients: mocks.recipients }));
vi.mock('../../supabase/functions/_shared/sale-terms-acceptance.ts', () => ({
  getPayloadTermsAcceptance: vi.fn(), ensureSaleTermsAcceptance: async () => ({ ok: true }),
}));
vi.mock('../../supabase/functions/_shared/payment-finalization.ts', () => ({ finalizeConfirmedPayment: mocks.finalize }));
vi.mock('../../supabase/functions/_shared/pagbank/status-sync.ts', () => ({ syncPagbankSaleStatus: mocks.sync }));
// O entrypoint e suas dependências HTTP são verificados por `deno check`.
// Carregar em runtime evita incluí-los no grafo TypeScript do frontend.
const entrypoint = '../../supabase/functions/create-pagbank-payment/index.ts';
await import(/* @vite-ignore */ entrypoint);

const handler = mocks.serve.mock.calls[0][0] as (request: Request) => Promise<Response>;
const order = {
  id: 'ORDE_TEST', reference_id: 'sale-1',
  charges: [{
    id: 'CHAR_TEST', status: 'WAITING', amount: { value: 10000 },
    qr_code: { text: '000201PIX' },
    links: [{ rel: 'SPLIT', href: 'https://sandbox.api.pagseguro.com/splits/SPLI_TEST' }],
  }],
};
const sale = {
  id: 'sale-1', company_id: 'company-1', event_id: 'event-1', trip_id: 'trip-1',
  payment_gateway: 'pagbank', payment_environment: 'sandbox', payment_connection_id: 'connection-1',
  status: 'reservado', customer_email: 'buyer@example.com', gross_amount: 100,
  event: { name: 'Evento', pass_platform_fee_to_customer: false },
};
let existing: Record<string, unknown> | null;
let writes: Array<{ table: string; payload: Record<string, unknown> }>;

beforeEach(() => {
  vi.clearAllMocks();
  existing = null;
  writes = [];
  mocks.credential.mockResolvedValue({ accessToken: 'test-only-placeholder', connection: { id: 'connection-1', external_account_id: 'ACCO_EMP', split_ready: false } });
  mocks.recipients.mockResolvedValue({ socio: { eligible: false, accountId: null }, representative: { eligible: false, accountId: null } });
  mocks.request.mockResolvedValue({ ok: true, status: 201, data: order });
  mocks.split.mockResolvedValue({ ok: false, status: 403 });
  mocks.find.mockResolvedValue({ ok: true, data: { orders: [order] } });
  mocks.order.mockResolvedValue({ ok: true, data: order });
  mocks.createClient.mockReturnValue({ from: (table: string) => {
    let payload: Record<string, unknown> | undefined;
    let otherOperation = false;
    const result = () => {
      if (payload) return { data: { id: 'attempt-1', operation: 'create_pix', amount_cents: 10000, ...payload }, error: null };
      if (table === 'sales') return { data: sale };
      if (table === 'companies') return { data: { id: sale.company_id, platform_fee_percent: 6 } };
      if (table === 'sale_passengers') return { data: [{ trip_id: 'trip-1', final_price: 100, original_price: 100 }] };
      if (table === 'event_fees') return { data: [] };
      if (table === 'payment_attempts') return { data: otherOperation ? null : existing };
      throw new Error(`Unexpected table: ${table}`);
    };
    const query = {
      select: () => query, eq: () => query, order: () => query,
      neq: () => { otherOperation = true; return query; },
      update: (value: Record<string, unknown>) => { payload = value; writes.push({ table, payload: value }); return query; },
      insert: (value: Record<string, unknown>) => { payload = value; writes.push({ table, payload: value }); return query; },
      single: async () => result(), maybeSingle: async () => result(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return query;
  } });
});

const request = () => new Request('https://supabase.example/functions/v1/create-pagbank-payment', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sale_id: 'sale-1' }),
});

describe('criação PIX com Split aceito e conciliação pendente', () => {
  it.each([false, true])('retorna QR e persiste accepted_unverified na recuperação: %s', async (recover) => {
    if (recover) existing = { id: 'attempt-1', state: 'indeterminate', external_order_id: null };
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ state: 'succeeded', normalized_status: 'pending', pix: { qr_text: '000201PIX' } });
    expect(writes).toContainEqual(expect.objectContaining({ table: 'payment_attempts', payload: expect.objectContaining({ split_status: 'accepted_unverified', pix_qr_text: '000201PIX' }) }));
    expect(writes.filter((w) => w.table === 'payment_gateway_connections').every((w) => !('split_ready' in w.payload))).toBe(true);
    expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({ responseJson: expect.objectContaining({ split_status: 'accepted_unverified', split_id: 'SPLI_TEST' }) }));
    if (recover) {
      expect(mocks.request).not.toHaveBeenCalled();
      expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({ responseJson: expect.objectContaining({ split_validated: false }) }));
    } else {
      expect(mocks.request).toHaveBeenCalledTimes(1);
      expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({ environment: 'sandbox', method: 'POST', path: '/orders' }));
    }
    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it('só comprova split_ready quando os recebedores consultados são exatos', async () => {
    mocks.split.mockResolvedValue({ ok: true, status: 200, data: { receivers: [
      { account: { id: 'ACCO_EMP' }, amount: { value: 9400 } },
      { account: { id: 'ACCO_MKT' }, amount: { value: 600 } },
    ] } });
    expect((await handler(request())).status).toBe(200);
    expect(writes).toContainEqual(expect.objectContaining({ table: 'payment_gateway_connections', payload: expect.objectContaining({ split_ready: true }) }));
    expect(writes).toContainEqual(expect.objectContaining({ table: 'payment_attempts', payload: expect.objectContaining({ split_status: 'confirmed' }) }));
  });

  it('reutiliza o mesmo QR e finaliza somente após Order autoritativa PAID', async () => {
    existing = { id: 'attempt-1', state: 'succeeded', external_order_id: order.id, split_status: 'accepted_unverified', pix_qr_text: '000201PIX' };
    mocks.order.mockResolvedValue({ ok: true, data: { ...order, charges: [{ ...order.charges[0], status: 'PAID' }] } });
    const response = await handler(request());
    expect(await response.json()).toMatchObject({ reused: true, normalized_status: 'paid', pix: { qr_text: '000201PIX' } });
    expect(mocks.order).toHaveBeenCalledWith(expect.objectContaining({ environment: 'sandbox', orderId: order.id }));
    expect(mocks.finalize).toHaveBeenCalledTimes(1);
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.split).not.toHaveBeenCalled();
  });
});
