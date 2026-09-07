import { describe, expect, it } from 'vitest';

import {
  pagbankFailureAllowsSaleRollback,
  resolvePagbankCheckoutAvailability,
} from './pagbankCheckoutAvailability';
import {
  classifyPagbankCreateFailure,
  resolvePagbankRetryDecision,
} from '../../supabase/functions/_shared/pagbank/attempt-policy';

const connected = { status: 'connected', is_current: true, pix_ready: false, split_ready: false };

describe('PagBank — aptidão do checkout (sem bloqueio circular)', () => {
  it('permite a PRIMEIRA cobrança com conexão corrente conectada, mesmo sem pix_ready', () => {
    const r = resolvePagbankCheckoutAvailability({
      environment: 'sandbox',
      connection: connected,
      platformFeePercent: 6,
    });
    expect(r.allowed).toBe(true);
    expect(r.pixProven).toBe(false);
  });

  it('trata pix_ready/split_ready apenas como evidência posterior', () => {
    const r = resolvePagbankCheckoutAvailability({
      environment: 'sandbox',
      connection: { ...connected, pix_ready: true, split_ready: true },
      platformFeePercent: 6,
    });
    expect(r).toMatchObject({ allowed: true, pixProven: true, splitProven: true });
  });

  it('bloqueia sem conexão, conexão não corrente, desconectada, produção ou taxa ausente', () => {
    expect(resolvePagbankCheckoutAvailability({ environment: 'sandbox', connection: null, platformFeePercent: 6 }).reason)
      .toBe('connection_missing');
    expect(resolvePagbankCheckoutAvailability({ environment: 'sandbox', connection: { ...connected, is_current: false }, platformFeePercent: 6 }).reason)
      .toBe('connection_not_current');
    expect(resolvePagbankCheckoutAvailability({ environment: 'sandbox', connection: { ...connected, status: 'revoked' }, platformFeePercent: 6 }).reason)
      .toBe('connection_not_connected');
    expect(resolvePagbankCheckoutAvailability({ environment: 'production', connection: connected, platformFeePercent: 6 }).reason)
      .toBe('environment_not_allowed');
    expect(resolvePagbankCheckoutAvailability({ environment: 'sandbox', connection: connected, platformFeePercent: 0 }).reason)
      .toBe('platform_fee_missing');
  });
});

describe('PagBank — venda local nunca some quando o Order pode existir', () => {
  it('não permite apagar a venda quando há order_id na resposta de erro', () => {
    expect(pagbankFailureAllowsSaleRollback({ errorCode: 'pagbank_validation_rejected', orderId: 'ORDE_1' })).toBe(false);
  });

  it('não permite apagar a venda nos códigos de risco', () => {
    for (const code of [
      'pagbank_indeterminate',
      'pagbank_idempotency_conflict',
      'pagbank_split_not_confirmed',
      'pagbank_pix_artifact_missing',
      'pagbank_order_needs_reconciliation',
    ]) {
      expect(pagbankFailureAllowsSaleRollback({ errorCode: code })).toBe(false);
    }
  });

  it('permite rollback apenas em rejeição comprovada antes da criação', () => {
    expect(pagbankFailureAllowsSaleRollback({ errorCode: 'pagbank_validation_rejected' })).toBe(true);
    expect(pagbankFailureAllowsSaleRollback({ errorCode: 'pagbank_auth_failed' })).toBe(true);
  });

  it('erro sem código é tratado como risco (não apaga)', () => {
    expect(pagbankFailureAllowsSaleRollback({ errorCode: null })).toBe(false);
    expect(classifyPagbankCreateFailure({ errorCode: null })).toBe('order_may_exist');
  });

  it('frontend e backend classificam a falha da mesma forma', () => {
    const cases = ['pagbank_indeterminate', 'pagbank_validation_rejected', 'pagbank_split_not_confirmed'];
    for (const code of cases) {
      expect(pagbankFailureAllowsSaleRollback({ errorCode: code }))
        .toBe(classifyPagbankCreateFailure({ errorCode: code }) === 'rejected_before_creation');
    }
  });
});

describe('PagBank — retry nunca cria segundo Order', () => {
  it('tentativa falha com Order externo exige reconciliação', () => {
    expect(resolvePagbankRetryDecision({ state: 'failed', external_order_id: 'ORDE_1' })).toBe('needs_reconciliation');
  });

  it('reaproveita Order já bem-sucedido e aguarda tentativa em voo', () => {
    expect(resolvePagbankRetryDecision({ state: 'succeeded', external_order_id: 'ORDE_1' })).toBe('reuse_order');
    expect(resolvePagbankRetryDecision({ state: 'pending', external_order_id: null })).toBe('wait_in_flight');
    expect(resolvePagbankRetryDecision({ state: 'indeterminate', external_order_id: null })).toBe('recover_by_reference');
    expect(resolvePagbankRetryDecision(null)).toBe('create');
  });
});
