import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const serve = vi.fn();
  vi.stubGlobal('Deno', { serve, env: { get: () => 'ACCO_MKT' } });
  return {
    serve, createClient: vi.fn(), request: vi.fn(), split: vi.fn(), order: vi.fn(),
    credential: vi.fn(), recipients: vi.fn(), log: vi.fn(), finalize: vi.fn(),
  };
});
vi.mock('https://esm.sh/@supabase/supabase-js@2.39.0', () => ({ createClient: mocks.createClient }));
vi.mock('../../supabase/functions/_shared/payment-observability.ts', () => ({
  logPaymentTrace: mocks.log, logCriticalPaymentIssue: mocks.log,
  logSaleIntegrationEvent: mocks.log, logSaleOperationalEvent: mocks.log,
}));
vi.mock('../../supabase/functions/_shared/pagbank/client.ts', async importOriginal => {
  const actual = await importOriginal<typeof import('../../supabase/functions/_shared/pagbank/client')>();
  return { ...actual, pagbankRequest: mocks.request, getPagbankSplit: mocks.split, getPagbankOrder: mocks.order };
});
vi.mock('../../supabase/functions/_shared/pagbank/credentials.ts', () => ({
  resolvePagbankCredentialForSale: mocks.credential,
  pagbankSecretNames: () => ({ marketplaceAccountId: 'TEST_MARKETPLACE_ID' }),
}));
vi.mock('../../supabase/functions/_shared/pagbank/split-recipients.ts', () => ({ resolvePagbankSplitRecipients: mocks.recipients }));
vi.mock('../../supabase/functions/_shared/sale-terms-acceptance.ts', () => ({
  getPayloadTermsAcceptance: vi.fn(), ensureSaleTermsAcceptance: async () => ({ ok: true }),
}));
vi.mock('../../supabase/functions/_shared/payment-finalization.ts', () => ({ finalizeConfirmedPayment: mocks.finalize }));
// The real synchronizer, integrity gate and cleanup guard run against simulated I/O.
import { syncPagbankSaleStatus } from '../../supabase/functions/_shared/pagbank/status-sync';
import { evaluatePagbankSale } from '../../supabase/functions/cleanup-expired-locks/pagbank-guard';
import { pagbankFailureAllowsSaleRollback } from './pagbankCheckoutAvailability';
const entrypoint = '../../supabase/functions/create-pagbank-payment/index.ts';
await import(/* @vite-ignore */ entrypoint);
const handler = mocks.serve.mock.calls[0][0] as (request: Request) => Promise<Response>;
const order = {
  id: 'ORDE_TEST', reference_id: 'sale-1',
  charges: [{
    id: 'CHAR_TEST', status: 'WAITING', amount: { value: 10000, currency: 'BRL' },
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
const knownAttempt = {
  id: 'attempt-1', sale_id: sale.id, company_id: sale.company_id, gateway: 'pagbank',
  state: 'succeeded', operation: 'create_pix', external_order_id: order.id,
  connection_id: sale.payment_connection_id, environment: 'sandbox', amount_cents: 10000,
  idempotency_key: 'pagbank_company-1_sale-1_sandbox_create_pix', payload_hash: 'original-hash', normalized_status: 'pending',
  split_status: 'accepted_unverified', pix_qr_text: '000201PIX',
};
type Row = Record<string, unknown>;
let existing: Row | null;
let writes: Array<{ table: string; payload: Row }>;
let attemptReadError: boolean;
let sameOperationReadError: boolean;
let failFinalSave: boolean;
let db: { from: (table: string) => unknown };

beforeEach(() => {
  vi.clearAllMocks();
  existing = null;
  writes = [];
  mocks.log.mockResolvedValue(undefined);
  attemptReadError = false;
  sameOperationReadError = false;
  failFinalSave = false;
  mocks.credential.mockResolvedValue({ environment: 'sandbox', accessToken: 'test-only-placeholder', connection: { id: 'connection-1', external_account_id: 'ACCO_EMP', split_ready: false } });
  mocks.recipients.mockResolvedValue({ socio: { eligible: false, accountId: null }, representative: { eligible: false, accountId: null } });
  mocks.request.mockResolvedValue({ ok: true, status: 201, data: order });
  mocks.split.mockResolvedValue({ ok: false, status: 403 });
  mocks.order.mockResolvedValue({ ok: true, data: order });
  mocks.finalize.mockResolvedValue({ ok: true, httpStatus: 200 });
  db = { from: (table: string) => {
    let payload: Row | undefined;
    let insert = false;
    let otherOperation = false;
    const filters: Array<[string, unknown]> = [];
    const result = () => {
      if (table === 'payment_attempts') {
        if (!payload && (attemptReadError || (!otherOperation && sameOperationReadError))) return { data: null, error: { code: 'TEST_READ_ERROR' } };
        if (insert && existing) return { data: null, error: { code: '23505' } };
        if (payload) {
          writes.push({ table, payload });
          if (failFinalSave && payload.state === 'succeeded') return { data: null, error: { code: 'TEST_SAVE_ERROR' } };
          if (!insert && filters.some(([key, value]) => existing?.[key] !== value)) return { data: null, error: null };
          existing = { ...(insert ? { id: 'attempt-1' } : existing), ...payload };
          return { data: { ...existing }, error: null };
        }
        const row = existing && filters.every(([key, value]) => key === 'requested_operation' ? existing?.operation !== value : existing?.[key] === value);
        return { data: row ? { ...existing } : null, error: null };
      }
      if (payload) { writes.push({ table, payload }); return { data: { id: 'row', ...payload }, error: null }; }
      if (table === 'sales') return { data: sale, error: null };
      if (table === 'companies') return { data: { id: sale.company_id, platform_fee_percent: 6 }, error: null };
      if (table === 'sale_passengers') return { data: [{ trip_id: 'trip-1', final_price: 100, original_price: 100 }], error: null };
      if (table === 'event_fees') return { data: [], error: null };
      throw new Error(`Unexpected table: ${table}`);
    };
    const query = {
      select: () => query, order: () => query, limit: () => query,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
      neq: (_: string, value: unknown) => { otherOperation = true; filters.push(['requested_operation', value]); return query; },
      update: (value: Row) => { payload = value; return query; },
      insert: (value: Row) => { payload = value; insert = true; return query; },
      single: async () => result(), maybeSingle: async () => result(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return query;
  } };
  mocks.createClient.mockReturnValue(db);
});

const request = (method: 'pix' | 'credit_card' = 'pix') => new Request('https://supabase.example/functions/v1/create-pagbank-payment', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sale_id: sale.id, payment_method: method,
    ...(method === 'credit_card' ? { card: { encrypted: 'a'.repeat(150), holder_name: 'Test Buyer', last_digits: '2097', brand: 'visa' } } : {}) }),
});
const paidOrder = () => { const copy = structuredClone(order); copy.charges[0].status = 'PAID'; return copy; };
const sync = () => syncPagbankSaleStatus(db, { sale, source: 'verify-payment-status' });

function expectNoCreation() {
  expect(mocks.request).not.toHaveBeenCalled();
  expect(mocks.split).not.toHaveBeenCalled();
  expect(writes.some(w => w.table === 'sales' || w.table === 'sale_passengers' || w.table === 'seat_locks')).toBe(false);
}

describe('criação pública e preservação da tentativa', () => {
  it('cria um PIX com Split aceito e mantém o contrato do QR', async () => {
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ state: 'succeeded', normalized_status: 'pending', pix: { qr_text: '000201PIX' } });
    expect(existing).toMatchObject({ split_status: 'accepted_unverified', pix_qr_text: '000201PIX' });
    expect(writes.filter(w => w.table === 'payment_gateway_connections').every(w => !('split_ready' in w.payload))).toBe(true);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({ environment: 'sandbox', method: 'POST', path: '/orders' }));
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('só comprova split_ready quando os recebedores consultados são exatos', async () => {
    mocks.split.mockResolvedValue({ ok: true, status: 200, data: { receivers: [
      { account: { id: 'ACCO_EMP' }, amount: { value: 9400 } }, { account: { id: 'ACCO_MKT' }, amount: { value: 600 } },
    ] } });
    expect((await handler(request())).status).toBe(200);
    expect(writes).toContainEqual(expect.objectContaining({ table: 'payment_gateway_connections', payload: expect.objectContaining({ split_ready: true }) }));
    expect(existing?.split_status).toBe('confirmed');
  });

  it.each([0, 409, 429, 500, 503, 201])('resultado incerto HTTP %s preserva a reserva e não envia outro POST', async status => {
    mocks.request.mockResolvedValue({ ok: status === 201, status, data: null, indeterminate: status === 0 });
    const first = await handler(request());
    expect(first.status).toBe(504);
    const error = await first.json();
    expect(pagbankFailureAllowsSaleRollback({ errorCode: error.error_code })).toBe(false);
    const original = structuredClone(existing);
    expect(original).toMatchObject({ state: 'indeterminate', external_reference: sale.id });
    const second = await handler(request());
    expect(second.status).toBe(409);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.order).not.toHaveBeenCalled();
    expect(existing).toEqual(original);
    expect((await evaluatePagbankSale(db, sale)).decision).toBe('preserve');
    expect(writes.some(w => ['sale_passengers', 'seat_locks', 'sales'].includes(w.table))).toBe(false);
  });

  it.each(['pending', 'indeterminate', 'failed', 'succeeded'])('tentativa %s sem ID exige conciliação sem mutar identidade', async state => {
    existing = { ...knownAttempt, state, external_order_id: null };
    const original = structuredClone(existing);
    expect((await handler(request())).status).toBe(409);
    expect(existing).toEqual(original);
    expect((await sync()).state).toBe('query_failed');
    expect((await evaluatePagbankSale(db, sale)).decision).toBe('preserve');
    expectNoCreation();
  });

  it.each([false, true])('falha de leitura de tentativa bloqueia criação e cancelamento (mesma operação: %s)', async sameOnly => {
    attemptReadError = !sameOnly;
    sameOperationReadError = sameOnly;
    expect((await handler(request())).status).toBe(503);
    expect(await sync()).toMatchObject({ state: 'query_failed', code: 'pagbank_attempt_read_failed' });
    expect((await evaluatePagbankSale(db, sale)).decision).toBe('preserve');
    expectNoCreation();
  });

  it('tentativa do outro meio sem ID preserva a venda no frontend', async () => {
    existing = { ...knownAttempt, operation: 'create_credit_card', external_order_id: null };
    const response = await handler(request());
    const error = await response.json();
    expect(response.status).toBe(409);
    expect(pagbankFailureAllowsSaleRollback({ errorCode: error.error_code })).toBe(false);
    expectNoCreation();
  });

  it('duas criações simultâneas elegem um único POST pelo índice existente', async () => {
    const responses = await Promise.all([handler(request()), handler(request())]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(existing).toMatchObject({ id: 'attempt-1', external_order_id: order.id });
  });

  it('falha local após criar Order conserva a tentativa e impede rollback/reenvio', async () => {
    failFinalSave = true;
    const first = await handler(request());
    const error = await first.json();
    expect(first.status).toBe(503);
    expect(error.detail.order_id).toBe(order.id);
    expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({ paymentId: order.id, eventType: 'order_result_persistence_failed' }));
    expect(pagbankFailureAllowsSaleRollback({ errorCode: error.error_code })).toBe(false);
    expect(existing?.state).toBe('pending');
    expect((await handler(request())).status).toBe(409);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect((await evaluatePagbankSale(db, sale)).decision).toBe('preserve');
  });
});

describe('reaproveitamento passa pelo sincronizador e gate reais', () => {
  it.each(['pix', 'credit_card'] as const)('Order %s íntegra PAID finaliza com o contrato compartilhado', async method => {
    const operation = method === 'pix' ? 'create_pix' : 'create_credit_card';
    existing = { ...knownAttempt, operation, idempotency_key: `pagbank_company-1_sale-1_sandbox_${operation}` };
    mocks.order.mockResolvedValue({ ok: true, data: paidOrder() });
    const response = await handler(request(method));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ reused: true, normalized_status: 'paid', payment_status: 'pago' });
    expect(mocks.order).toHaveBeenCalledWith(expect.objectContaining({ environment: 'sandbox', orderId: order.id }));
    expect(mocks.finalize).toHaveBeenCalledTimes(1);
    expect(mocks.finalize).toHaveBeenCalledWith(expect.objectContaining({ gateway: 'pagbank', sale: expect.objectContaining({ id: sale.id, company_id: sale.company_id }) }));
    expectNoCreation();
  });

  it.each(['failed', 'indeterminate', 'pending'])('Order conhecida na tentativa %s é consultada sem recriação', async state => {
    existing = { ...knownAttempt, state };
    mocks.order.mockResolvedValue({ ok: true, data: paidOrder() });
    expect((await handler(request())).status).toBe(200);
    expect(mocks.finalize).toHaveBeenCalledTimes(1);
    expectNoCreation();
  });

  it.each(['order', 'reference', 'amount', 'currency', 'environment', 'connection', 'credential_environment'])('divergência de %s bloqueia confirmação e atualização do status da tentativa', async field => {
    existing = { ...knownAttempt };
    const paid = paidOrder();
    if (field === 'order') paid.id = 'ORDE_OTHER';
    if (field === 'reference') paid.reference_id = 'other-sale';
    if (field === 'amount') paid.charges[0].amount.value = 1;
    if (field === 'currency') paid.charges[0].amount.currency = 'USD';
    if (field === 'environment') existing.environment = 'production';
    if (field === 'connection') existing.connection_id = 'other-connection';
    if (field === 'credential_environment') mocks.credential.mockResolvedValue({ environment: 'production' });
    mocks.order.mockResolvedValue({ ok: true, data: paid });
    expect((await handler(request())).status).toBe(409);
    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(writes.filter(w => w.table === 'payment_attempts')).toHaveLength(0);
    expect((await evaluatePagbankSale(db, sale)).decision).toBe('preserve');
    expectNoCreation();
  });

  it.each([404, 503, 0])('falha GET HTTP %s preserva a reserva e não faz POST', async status => {
    existing = { ...knownAttempt };
    mocks.order.mockResolvedValue({ ok: false, status, indeterminate: status === 0 });
    expect((await handler(request())).status).toBe(409);
    expect((await evaluatePagbankSale(db, sale)).decision).toBe('preserve');
    expect(mocks.finalize).not.toHaveBeenCalled();
    expectNoCreation();
  });

  it('exceção na credencial da Order existente impede rollback e mantém a identidade', async () => {
    existing = { ...knownAttempt };
    const original = structuredClone(existing);
    mocks.credential.mockRejectedValue(new Error('synthetic credential unavailable'));
    const response = await handler(request());
    const error = await response.json();
    expect(response.status).toBe(503);
    expect(pagbankFailureAllowsSaleRollback({ errorCode: error.error_code, orderId: error.detail.order_id })).toBe(false);
    expect(existing).toEqual(original);
    expect((await evaluatePagbankSale(db, sale)).decision).toBe('preserve');
    expect(mocks.finalize).not.toHaveBeenCalled();
    expectNoCreation();
  });

  it('WAITING mantém QR e reserva; finalização incompleta também preserva', async () => {
    existing = { ...knownAttempt };
    expect(await (await handler(request())).json()).toMatchObject({ reused: true, normalized_status: 'pending', pix: { qr_text: '000201PIX' } });
    expect((await evaluatePagbankSale(db, sale)).decision).toBe('preserve');
    mocks.order.mockResolvedValue({ ok: true, data: paidOrder() });
    mocks.finalize.mockResolvedValue({ ok: false, httpStatus: 409 });
    expect((await handler(request())).status).toBe(409);
    expect((await evaluatePagbankSale(db, sale)).decision).toBe('preserve');
    expectNoCreation();
  });

  it('leitura conclusiva sem tentativa mantém cancelamento normal', async () => {
    expect(await sync()).toMatchObject({ state: 'no_attempt' });
    expect((await evaluatePagbankSale(db, sale)).decision).toBe('allow_cancel');
    expect(mocks.order).not.toHaveBeenCalled();
  });

  it.each(['DECLINED', 'CANCELED'])('terminal %s só libera cancelamento se a Order corresponder à venda', async status => {
    existing = { ...knownAttempt };
    const terminal = { ...order, charges: [{ ...order.charges[0], status }] };
    mocks.order.mockResolvedValue({ ok: true, data: terminal });
    expect((await evaluatePagbankSale(db, sale)).decision).toBe('allow_cancel');
    mocks.order.mockResolvedValue({ ok: true, data: { ...terminal, reference_id: 'other-sale' } });
    expect((await evaluatePagbankSale(db, sale)).decision).toBe('preserve');
    expect(mocks.finalize).not.toHaveBeenCalled();
    expectNoCreation();
  });

  it('cartão novo PAID exige GET íntegro; recusa não emite passagens', async () => {
    mocks.request.mockResolvedValue({ ok: true, status: 201, data: paidOrder() });
    mocks.order.mockResolvedValue({ ok: true, data: paidOrder() });
    expect((await handler(request('credit_card'))).status).toBe(200);
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ charges: [expect.objectContaining({ payment_method: expect.objectContaining({ type: 'CREDIT_CARD', installments: 1 }) })] }) }));
    expect(mocks.finalize).toHaveBeenCalledTimes(1);
    existing = null; mocks.finalize.mockClear();
    mocks.request.mockResolvedValue({ ok: true, status: 201, data: { ...order, charges: [{ ...order.charges[0], status: 'DECLINED' }] } });
    const declined = await handler(request('credit_card'));
    expect(declined.status).toBe(402);
    expect(mocks.finalize).not.toHaveBeenCalled();
  });
});
