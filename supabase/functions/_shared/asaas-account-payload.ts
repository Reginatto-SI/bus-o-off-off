export type ResolvedAccountId = {
  value: string | null;
  source: string | null;
};

/**
 * Parser resiliente para payloads do Asaas.
 * Mantém a mesma estratégia já utilizada no fluxo de vínculo/revalidação.
 */
export function extractWalletIdFromAsaasPayload(payload: unknown): string | null {
  const visited = new Set<unknown>();

  const read = (value: unknown): string | null => {
    if (!value || typeof value !== "object") return null;
    if (visited.has(value)) return null;
    visited.add(value);

    const record = value as Record<string, unknown>;
    const directCandidates = [
      record.walletId,
      record.wallet_id,
      record.id,
    ];

    for (const candidate of directCandidates) {
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }

    if (record.wallet && typeof record.wallet === "object") {
      const walletRecord = record.wallet as Record<string, unknown>;
      const nestedWalletId = walletRecord.id ?? walletRecord.walletId ?? walletRecord.wallet_id;
      if (typeof nestedWalletId === "string" && nestedWalletId.trim().length > 0) {
        return nestedWalletId.trim();
      }
    }

    const nestedCandidates = [
      record.data,
      record.account,
      record.owner,
      Array.isArray(record.items) ? record.items[0] : null,
      Array.isArray(record.data) ? record.data[0] : null,
    ];

    for (const candidate of nestedCandidates) {
      const nestedWalletId = read(candidate);
      if (nestedWalletId) return nestedWalletId;
    }

    return null;
  };

  return read(payload);
}

/**
 * Mantém account_id e wallet_id separados para evitar falsos positivos.
 */
export function extractAccountIdFromAsaasPayload(
  payload: unknown,
  options?: { allowGenericNestedId?: boolean },
): ResolvedAccountId {
  const visited = new Set<unknown>();

  const read = (value: unknown, path: string, allowGenericId: boolean): ResolvedAccountId => {
    if (!value || typeof value !== "object") return { value: null, source: null };
    if (visited.has(value)) return { value: null, source: null };
    visited.add(value);

    const record = value as Record<string, unknown>;
    const directCandidates: Array<{ value: unknown; source: string }> = [
      { value: record.accountId, source: `${path}.accountId` },
      { value: record.account_id, source: `${path}.account_id` },
    ];

    if (allowGenericId) {
      directCandidates.unshift({ value: record.id, source: `${path}.id` });
    }

    for (const candidate of directCandidates) {
      if (typeof candidate.value === "string" && candidate.value.trim().length > 0) {
        return { value: candidate.value.trim(), source: candidate.source };
      }
    }

    const nestedCandidates: Array<{ value: unknown; path: string; allowGenericId?: boolean }> = [
      { value: record.account, path: `${path}.account`, allowGenericId: true },
      { value: record.owner, path: `${path}.owner`, allowGenericId: true },
      { value: record.data, path: `${path}.data`, allowGenericId: false },
      { value: Array.isArray(record.items) ? record.items[0] : null, path: `${path}.items[0]`, allowGenericId: false },
      { value: Array.isArray(record.data) ? record.data[0] : null, path: `${path}.data[0]`, allowGenericId: false },
    ];

    for (const candidate of nestedCandidates) {
      const nestedResult = read(
        candidate.value,
        candidate.path,
        candidate.allowGenericId ?? options?.allowGenericNestedId ?? false,
      );
      if (nestedResult.value) return nestedResult;
    }

    return { value: null, source: null };
  };

  return read(payload, "payload", true);
}
