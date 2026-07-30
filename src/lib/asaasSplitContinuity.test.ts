import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildAsaasSplitPayload,
  isExplicitAsaasSplitRejection,
  withoutSplit,
} from '../../supabase/functions/_shared/asaas-split-continuity';
import { resolveAsaasSplitRecipients, type ResolveSplitRecipientsResult } from '../../supabase/functions/_shared/split-recipients-resolver';

const eligibility = (socio: boolean, representative: boolean): ResolveSplitRecipientsResult => ({
  socioValidation: null,
  socio: { included: socio, reason: socio ? 'included' : 'wallet_missing', walletId: socio ? 'socio-wallet' : null },
  representative: {
    eligible: representative,
    reason: representative ? 'included' : 'representative_wallet_missing',
    representativeId: representative ? 'rep-id' : null,
    walletId: representative ? 'rep-wallet' : null
  },
});

describe('continuidade da cobrança em degradação de split', () => {
  it('remove todo o split quando a wallet da plataforma está ausente', () => {
    const result = buildAsaasSplitPayload({
      eligibility: eligibility(true, true),
      distribution: { platformAmount: 6, socioAmount: 6, representativeAmount: 6, mode: 'all_present' },
      platformWalletId: null,
      issuerWalletId: 'company-wallet',
      issuerKind: 'company',
      includePlatformRecipient: true,
    });
    expect(result.pendingAmount).toBe(18);
    expect(result.reasons).toContain('platform_wallet_missing');
  });

  it.each([
    [true, true, ['platform', 'socio', 'representative']],
    [true, false, ['platform', 'socio']],
    [false, true, ['platform', 'representative']],
    [false, false, ['platform']],
  ] as const)('monta somente recebedores confirmados', (socio, representative, kinds) => {
    const distribution = socio
      ? representative
        ? { platformAmount: 6, socioAmount: 6, representativeAmount: 6, mode: 'all_present' as const }
        : { platformAmount: 9, socioAmount: 9, representativeAmount: 0, mode: 'socio_only' as const }
      : representative
        ? { platformAmount: 12, socioAmount: 0, representativeAmount: 6, mode: 'representative_only' as const }
        : { platformAmount: 18, socioAmount: 0, representativeAmount: 0, mode: 'platform_only' as const };
    const result = buildAsaasSplitPayload({
      eligibility: eligibility(socio, representative),
      distribution,
      platformWalletId: 'platform-wallet',
      issuerWalletId: 'company-wallet',
      issuerKind: 'company', includePlatformRecipient: true,
    });
    expect(result.recipients.map((item) => item.kind)).toEqual(kinds);
    expect(result.recipients.every((item) => item.fixedValue && !('percentualValue' in item))).toBe(true);
  });

  it('preserva R$ 18,00 em três valores fixos de R$ 6,00', () => {
    const result = buildAsaasSplitPayload({
      eligibility: eligibility(true, true),
      distribution: { platformAmount: 6, socioAmount: 6, representativeAmount: 6, mode: 'all_present' },
      platformWalletId: 'platform-wallet',
      issuerWalletId: 'company-wallet',
      issuerKind: 'company', includePlatformRecipient: true,
    });
    expect(result.recipients).toEqual([
      { kind: 'platform', walletId: 'platform-wallet', fixedValue: 6 },
      { kind: 'socio', walletId: 'socio-wallet', fixedValue: 6 },
      { kind: 'representative', walletId: 'rep-wallet', fixedValue: 6 },
    ]);
  });

  it.each([2, 3])('parcelamento em %s vezes usa totalFixedValue, sem multiplicar a taxa', (installmentCount) => {
    const result = buildAsaasSplitPayload({
      eligibility: eligibility(true, true),
      distribution: { platformAmount: 12, socioAmount: 12, representativeAmount: 12, mode: 'all_present' },
      platformWalletId: 'platform-wallet',
      issuerWalletId: 'company-wallet',
      issuerKind: 'company', includePlatformRecipient: true,
      installmentCount,
    });
    expect(result.recipients.map((item) => item.totalFixedValue)).toEqual([12, 12, 12]);
    expect(result.recipients.reduce((sum, item) => sum + Number(item.totalFixedValue), 0)).toBe(36);
  });

  it('preserva centavos no total parcelado', () => {
    const result = buildAsaasSplitPayload({
      eligibility: eligibility(true, true),
      distribution: { platformAmount: 3.35, socioAmount: 3.33, representativeAmount: 3.33, mode: 'all_present' },
      platformWalletId: 'platform-wallet', issuerWalletId: 'company-wallet', issuerKind: 'company', includePlatformRecipient: true,
      installmentCount: 3,
    });
    expect(result.recipients.reduce((sum, item) => sum + Number(item.totalFixedValue), 0)).toBeCloseTo(10.01, 2);
  });

  it('cobrança manual omite a wallet emissora e envia apenas contas externas', () => {
    const result = buildAsaasSplitPayload({
      eligibility: eligibility(true, true),
      distribution: { platformAmount: 12, socioAmount: 12, representativeAmount: 12, mode: 'all_present' },
      platformWalletId: 'platform-wallet',
      issuerWalletId: 'platform-wallet',
      issuerKind: 'platform',
      includePlatformRecipient: false,
    });
    expect(result.recipients.map((item) => item.kind)).toEqual(['socio', 'representative']);
    expect(result.pendingAmount).toBe(0);
  });

  it('wallet emissora manual ausente degrada sem enviar recebedores', () => {
    const result = buildAsaasSplitPayload({
      eligibility: eligibility(true, true),
      distribution: { platformAmount: 6, socioAmount: 6, representativeAmount: 6, mode: 'all_present' },
      platformWalletId: null,
      issuerWalletId: null,
      issuerKind: 'platform',
      includePlatformRecipient: false,
    });
    expect(result.recipients).toEqual([]);
    expect(result.pendingAmount).toBe(18);
    expect(result.reasons).toContain('issuer_wallet_unavailable');
  });

  it('colisão SmartBus/emissora pública omite o item e mantém sua parcela pendente', () => {
    const result = buildAsaasSplitPayload({
      eligibility: eligibility(true, true),
      distribution: { platformAmount: 6, socioAmount: 6, representativeAmount: 6, mode: 'all_present' },
      platformWalletId: 'company-wallet', issuerWalletId: 'company-wallet',
      issuerKind: 'company', includePlatformRecipient: true,
    });
    expect(result.recipients.map((item) => item.kind)).toEqual(['socio', 'representative']);
    expect(result.pendingAmount).toBe(6);
    expect(result.reasons).toContain('issuer_wallet_omitted');
  });

  it.each(['socio', 'representative'] as const)('wallet de %s igual à emissora não entra no payload', (kind) => {
    const resolved = eligibility(true, true);
    if (kind === 'socio') resolved.socio.walletId = 'company-wallet';
    else resolved.representative.walletId = 'company-wallet';
    const result = buildAsaasSplitPayload({
      eligibility: resolved,
      distribution: { platformAmount: 6, socioAmount: 6, representativeAmount: 6, mode: 'all_present' },
      platformWalletId: 'platform-wallet', issuerWalletId: 'company-wallet',
      issuerKind: 'company', includePlatformRecipient: true,
    });
    expect(result.recipients.some((item) => item.kind === kind)).toBe(false);
    expect(result.pendingAmount).toBe(6);
  });

  it('wallet realmente ausente redistribui sem gerar pendência', () => {
    const result = buildAsaasSplitPayload({
      eligibility: eligibility(false, true),
      distribution: { platformAmount: 12, socioAmount: 0, representativeAmount: 6, mode: 'representative_only' },
      platformWalletId: 'platform-wallet',
      issuerWalletId: 'company-wallet',
      issuerKind: 'company', includePlatformRecipient: true,
    });
    expect(result.pendingAmount).toBe(0);
  });

  it('registra apenas as parcelas potenciais de recebedores incertos', () => {
    const socioUncertain = eligibility(false, true);
    socioUncertain.socio.reason = 'query_failed';
    const socioResult = buildAsaasSplitPayload({
      eligibility: socioUncertain,
      distribution: { platformAmount: 12, socioAmount: 0, representativeAmount: 6, mode: 'representative_only' },
      platformWalletId: 'platform-wallet', issuerWalletId: 'company-wallet', issuerKind: 'company', includePlatformRecipient: true,
    });
    expect(socioResult.pendingAmount).toBe(6);

    const representativeUncertain = eligibility(true, false);
    representativeUncertain.representative.reason = 'representative_lookup_failed';
    const representativeResult = buildAsaasSplitPayload({
      eligibility: representativeUncertain,
      distribution: { platformAmount: 9, socioAmount: 9, representativeAmount: 0, mode: 'socio_only' },
      platformWalletId: 'platform-wallet', issuerWalletId: 'company-wallet', issuerKind: 'company', includePlatformRecipient: true,
    });
    expect(representativeResult.pendingAmount).toBe(6);

    const bothUncertain = eligibility(false, false);
    bothUncertain.socio.reason = 'ambiguous';
    bothUncertain.representative.reason = 'representative_lookup_failed';
    const bothResult = buildAsaasSplitPayload({
      eligibility: bothUncertain,
      distribution: { platformAmount: 18, socioAmount: 0, representativeAmount: 0, mode: 'platform_only' },
      platformWalletId: 'platform-wallet', issuerWalletId: 'company-wallet', issuerKind: 'company', includePlatformRecipient: true,
    });
    expect(bothResult.pendingAmount).toBe(12);
  });

  it('só classifica rejeição HTTP explícita e exclusiva de split', () => {
    expect(isExplicitAsaasSplitRejection(400, { errors: [{ code: 'invalid_split', description: 'Wallet inexistente' }] })).toBe(true);
    expect(isExplicitAsaasSplitRejection(401, { errors: [{ code: 'invalid_split' }] })).toBe(false);
    expect(isExplicitAsaasSplitRejection(400, { errors: [{ code: 'invalid_cpf', description: 'CPF inválido' }] })).toBe(false);
    expect(isExplicitAsaasSplitRejection(400, { errors: [{ code: 'invalid_split' }, { code: 'invalid_cpf' }] })).toBe(false);
    expect(isExplicitAsaasSplitRejection(502, { errors: [{ code: 'invalid_split' }] })).toBe(false);
    expect(isExplicitAsaasSplitRejection(400, { errors: [{ code: 'invalid_fixedValue', description: 'Valor fixo superior ao líquido' }] })).toBe(true);
  });

  it('fallback remove a propriedade split, não envia array vazio', () => {
    expect(withoutSplit({ customer: 'c', split: [{ walletId: 'inválida' }] })).toEqual({ customer: 'c' });
  });
});

const resolveWith = (params: { socios?: unknown[]; socioError?: string; representative?: unknown; representativeError?: string; linked?: boolean }) => {
  const supabaseAdmin = {
    from(table: string) {
      if (table === 'socios_split') {
        return { select: async () => ({ data: params.socios ?? [], error: params.socioError ? { message: params.socioError } : null }) };
      }
      if (table === 'representative_company_links') {
        const terminal = { maybeSingle: async () => ({ data: params.representativeError || params.linked === false ? null : { representative_id: 'rep', company_id: 'company' }, error: params.representativeError ? { message: params.representativeError } : null }) };
        return { select: () => ({ eq: () => ({ eq: () => terminal }) }) };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: params.representative ?? null, error: params.representativeError ? { message: params.representativeError } : null }) }) }) };
    },
  };
  return resolveAsaasSplitRecipients({
    supabaseAdmin,
    source: 'create-asaas-payment',
    saleId: 'sale',
    companyId: 'company',
    paymentEnvironment: 'production',
    splitEnabled: true,
    representativeId: 'rep',
  });
};

describe('falhas de consulta não escapam do resolvedor', () => {
  it('distingue indisponibilidade do sócio de wallet ausente', async () => {
    const result = await resolveWith({ socioError: 'timeout', representativeError: 'offline' });
    expect(result.socio.reason).toBe('query_failed');
    expect(result.representative.reason).toBe('representative_lookup_failed');
  });

  it('cadastro global ambíguo não escolhe wallet arbitrariamente', async () => {
    const result = await resolveWith({
      socios: [
        { id: 'a', status: 'ativo', asaas_wallet_id_production: 'wallet-a' },
        { id: 'b', status: 'inativo', asaas_wallet_id_production: 'wallet-b' },
      ],
      representativeError: 'offline',
    });
    expect(result.socio.reason).toBe('ambiguous');
    expect(result.socio.walletId).toBeNull();
  });

  it('representante sem vínculo com a empresa é excluído sem lançar erro', async () => {
    const result = await resolveWith({
      socios: [{ id: 'a', status: 'inativo', asaas_wallet_id_production: 'socio-wallet' }],
      representative: { id: 'rep', asaas_wallet_id_production: 'rep-wallet' },
      linked: false,
    });
    expect(result.socio.included).toBe(true); // status legado não afeta wallet válida
    expect(result.representative.eligible).toBe(false);
    expect(result.representative.reason).toBe('representative_company_mismatch');
  });
});

describe('contrato do fluxo de criação', () => {
  const source = readFileSync(`${process.cwd()}/supabase/functions/create-asaas-payment/index.ts`, 'utf8');
  const manualSource = readFileSync(`${process.cwd()}/supabase/functions/create-platform-fee-checkout/index.ts`, 'utf8');

  it('resolve elegibilidade uma única vez por fluxo', () => {
    expect(source.match(/await resolveAsaasSplitRecipients\(/g)).toHaveLength(1);
    expect(manualSource.match(/await resolveAsaasSplitRecipients\(/g)).toHaveLength(1);
  });

  it('fluxos público e manual reutilizam valores fixos do helper central', () => {
    expect(source).toContain('buildAsaasSplitPayload({');
    expect(manualSource).toContain('buildAsaasSplitPayload({');
    expect(source).not.toContain('percentualValue: recipient');
    expect(manualSource).not.toContain('percentualValue: recipient');
    expect(source).not.toContain('splitResolution.recipients');
    expect(manualSource).not.toContain('splitResolution.recipients');
  });

  it('resultado ambíguo consulta externalReference e não repete cegamente', () => {
    expect(source).toContain('findCreatedPaymentByExternalReference');
    expect(source).toContain('externalReference=${encodeURIComponent(sale.id)}');
    expect(source).toContain('if (!recovered) throw createNetworkError');
    expect(source).toContain('if (!recovered) throw fallbackNetworkError');
  });

  it('snapshot degradado zera recebedores não enviados e conserva taxa calculada', () => {
    expect(source).toContain('split_snapshot_platform_fee_total: platformFeeEngine.totalFee');
    expect(manualSource).toContain('splitResolutionContext.splitPercentages = { socio: 0, representative: 0 }');
    expect(source).toContain('split_snapshot_socio_fee_amount: splitArray.length > 0');
    expect(source).toContain('recipient.kind === "socio"');
    expect(source).toContain('split_snapshot_platform_net_amount: splitArray.length > 0');
    expect(source).toContain('recipient.kind === "platform"');
  });
});
