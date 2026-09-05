// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
// Movido verbatim de create-asaas-payment para reuso por qualquer gateway.
// Registra/valida o aceite dos termos do evento antes de qualquer chamada externa.

interface TermsAcceptancePayloadTerm {
  term_id?: unknown;
  term_version_id?: unknown;
  content_hash?: unknown;
  content_snapshot?: unknown;
  summary_snapshot?: unknown;
}

export interface TermsAcceptancePayload {
  accepted?: unknown;
  accepted_terms?: unknown;
  accepted_by_name?: unknown;
  accepted_by_cpf?: unknown;
  accepted_by_phone?: unknown;
}

function normalizeOptionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeDigits(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

export function getPayloadTermsAcceptance(value: unknown): TermsAcceptancePayload | null {
  if (!value || typeof value !== "object") return null;
  return value as TermsAcceptancePayload;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getPayloadAcceptedTerms(payload: TermsAcceptancePayload | null): TermsAcceptancePayloadTerm[] {
  if (!payload || !Array.isArray(payload.accepted_terms)) return [];
  return payload.accepted_terms.filter(
    (term): term is TermsAcceptancePayloadTerm => Boolean(term) && typeof term === "object",
  );
}

export async function ensureSaleTermsAcceptance(params: {
  supabaseAdmin: any;
  sale: Record<string, unknown>;
  termsAcceptance: TermsAcceptancePayload | null;
}) {
  const { supabaseAdmin, sale, termsAcceptance } = params;
  const eventId = String(sale.event_id ?? "");
  const companyId = String(sale.company_id ?? "");
  const saleId = String(sale.id ?? "");

  const { data: linkedTerms, error: linksError } = await supabaseAdmin
    .from("event_term_links")
    .select("id, company_id, event_id, term_id, term_version_id, acceptance_required")
    .eq("event_id", eventId)
    .eq("company_id", companyId);

  if (linksError) {
    console.error("[create-asaas-payment] terms_acceptance_links_load_failed", {
      stage: "terms_acceptance_validate",
      sale_id: saleId,
      event_id: eventId,
      company_id: companyId,
      error: linksError,
    });
    return { ok: false as const, status: 500, reason: "terms_acceptance_validate_failed" };
  }

  const links = (linkedTerms ?? []) as Array<{
    company_id: string;
    event_id: string;
    term_id: string;
    term_version_id: string;
    acceptance_required: boolean | null;
  }>;
  const requiredLinks = links.filter((link) => link.acceptance_required === true);

  if (links.length === 0) return { ok: true as const };

  const acceptedTerms = getPayloadAcceptedTerms(termsAcceptance);
  const acceptedVersionIds = new Set(
    acceptedTerms
      .map((term) => typeof term.term_version_id === "string" ? term.term_version_id : null)
      .filter((id): id is string => Boolean(id)),
  );
  const linksByVersionId = new Map(links.map((link) => [link.term_version_id, link]));
  const invalidAcceptedTerms = acceptedTerms.filter((term) => {
    const versionId = typeof term.term_version_id === "string" ? term.term_version_id : null;
    const termId = typeof term.term_id === "string" ? term.term_id : null;
    const linked = versionId ? linksByVersionId.get(versionId) : null;
    return !linked || !termId || linked.term_id !== termId;
  });

  if (invalidAcceptedTerms.length > 0) {
    console.warn("[create-asaas-payment] terms_acceptance_invalid_payload", {
      stage: "terms_acceptance_validate",
      sale_id: saleId,
      event_id: eventId,
      company_id: companyId,
      term_version_ids: acceptedTerms.map((term) => term.term_version_id),
    });
    return { ok: false as const, status: 409, reason: "terms_acceptance_required" };
  }

  const { data: existingRequiredAcceptances, error: existingRequiredError } = requiredLinks.length > 0
    ? await supabaseAdmin
        .from("sale_term_acceptances")
        .select("term_id, term_version_id")
        .eq("sale_id", saleId)
        .eq("event_id", eventId)
        .eq("company_id", companyId)
        .eq("acceptance_origin", "public_checkout")
        .eq("explicit_acceptance", true)
        .in("term_version_id", requiredLinks.map((link) => link.term_version_id))
    : { data: [], error: null };

  if (existingRequiredError) {
    console.error("[create-asaas-payment] terms_acceptance_existing_required_load_failed", {
      stage: "terms_acceptance_validate",
      sale_id: saleId,
      event_id: eventId,
      company_id: companyId,
      error: existingRequiredError,
    });
    return { ok: false as const, status: 500, reason: "terms_acceptance_validate_failed" };
  }

  const existingRequiredKeys = new Set(
    (existingRequiredAcceptances as Array<{ term_id: string; term_version_id: string }>)
      .map((acceptance) => `${acceptance.term_id}:${acceptance.term_version_id}`),
  );
  const requiredAlreadyAccepted = requiredLinks.every((link) =>
    existingRequiredKeys.has(`${link.term_id}:${link.term_version_id}`),
  );
  const missingRequiredPayload = requiredAlreadyAccepted
    ? []
    : requiredLinks.filter(
        (link) => !termsAcceptance || termsAcceptance.accepted !== true || !acceptedVersionIds.has(link.term_version_id),
      );

  if (missingRequiredPayload.length > 0) {
    console.warn("[create-asaas-payment] terms_acceptance_missing_payload", {
      stage: "terms_acceptance_validate",
      sale_id: saleId,
      event_id: eventId,
      company_id: companyId,
      required_term_version_ids: requiredLinks.map((link) => link.term_version_id),
      received_term_version_ids: Array.from(acceptedVersionIds),
    });
    return { ok: false as const, status: 409, reason: "terms_acceptance_required" };
  }

  const targetLinks = acceptedTerms.length > 0
    ? links.filter((link) => acceptedVersionIds.has(link.term_version_id))
    : [];

  if (targetLinks.length === 0) return { ok: true as const };

  const versionIds = targetLinks.map((link) => link.term_version_id);
  const { data: versionsData, error: versionsError } = await supabaseAdmin
    .from("company_term_versions")
    .select("id, company_id, term_id, version_number, title, term_type, content, summary, content_hash, status")
    .eq("company_id", companyId)
    .in("id", versionIds);

  if (versionsError) {
    console.error("[create-asaas-payment] terms_acceptance_versions_load_failed", {
      stage: "terms_acceptance_validate",
      sale_id: saleId,
      event_id: eventId,
      company_id: companyId,
      term_version_ids: versionIds,
      error: versionsError,
    });
    return { ok: false as const, status: 500, reason: "terms_acceptance_validate_failed" };
  }

  const versionsById = new Map(
    ((versionsData ?? []) as Array<Record<string, unknown>>).map((version) => [String(version.id), version]),
  );
  const missingVersions = targetLinks.filter((link) => {
    const version = versionsById.get(link.term_version_id);
    return !version || version.term_id !== link.term_id || version.company_id !== companyId || version.status !== "published";
  });

  if (missingVersions.length > 0) {
    console.warn("[create-asaas-payment] terms_acceptance_version_mismatch", {
      stage: "terms_acceptance_validate",
      sale_id: saleId,
      event_id: eventId,
      company_id: companyId,
      term_version_ids: missingVersions.map((link) => link.term_version_id),
    });
    return { ok: false as const, status: 409, reason: "terms_acceptance_required" };
  }

  const { data: existingAcceptances, error: existingError } = await supabaseAdmin
    .from("sale_term_acceptances")
    .select("term_id, term_version_id")
    .eq("sale_id", saleId)
    .eq("event_id", eventId)
    .eq("company_id", companyId)
    .eq("acceptance_origin", "public_checkout")
    .eq("explicit_acceptance", true)
    .in("term_version_id", versionIds);

  if (existingError) {
    console.error("[create-asaas-payment] terms_acceptance_existing_load_failed", {
      stage: "terms_acceptance_validate",
      sale_id: saleId,
      event_id: eventId,
      company_id: companyId,
      term_version_ids: versionIds,
      error: existingError,
    });
    return { ok: false as const, status: 500, reason: "terms_acceptance_validate_failed" };
  }

  const existingKeys = new Set(
    ((existingAcceptances ?? []) as Array<{ term_id: string; term_version_id: string }>)
      .map((acceptance) => `${acceptance.term_id}:${acceptance.term_version_id}`),
  );
  const missingLinks = targetLinks.filter((link) => !existingKeys.has(`${link.term_id}:${link.term_version_id}`));

  if (missingLinks.length > 0) {
    const acceptedAt = new Date().toISOString();
    const rows = await Promise.all(missingLinks.map(async (link) => {
      const version = versionsById.get(link.term_version_id)!;
      const acceptedTextSnapshot = String(version.content ?? "");
      const persistedContentHash = normalizeOptionalText(version.content_hash);
      // Comentário de suporte: termos legados podem ter sido publicados antes do hash ser preenchido no banco.
      const contentHash = persistedContentHash ?? await sha256Hex(acceptedTextSnapshot);
      return {
        company_id: companyId,
        sale_id: saleId,
        event_id: eventId,
        term_id: link.term_id,
        term_version_id: link.term_version_id,
        term_title_snapshot: String(version.title ?? ""),
        term_type_snapshot: String(version.term_type ?? ""),
        version_number: Number(version.version_number ?? 0),
        content_hash: contentHash,
        accepted_text_snapshot: acceptedTextSnapshot,
        summary_snapshot: version.summary ?? null,
        accepted_at: acceptedAt,
        accepted_by_name: normalizeOptionalText(termsAcceptance?.accepted_by_name),
        accepted_by_cpf: normalizeDigits(termsAcceptance?.accepted_by_cpf),
        accepted_by_phone: normalizeDigits(termsAcceptance?.accepted_by_phone),
        acceptance_origin: "public_checkout",
        explicit_acceptance: true,
      };
    }));

    const { error: insertError } = await supabaseAdmin
      .from("sale_term_acceptances")
      .insert(rows as any);

    if (insertError && insertError.code !== "23505") {
      console.error("[create-asaas-payment] terms_acceptance_insert_failed", {
        stage: "terms_acceptance_insert",
        sale_id: saleId,
        event_id: eventId,
        company_id: companyId,
        term_version_ids: rows.map((row) => row.term_version_id),
        error: insertError,
      });
      return { ok: false as const, status: 500, reason: "terms_acceptance_persist_failed" };
    }
  }

  if (requiredLinks.length === 0) {
    console.info("[create-asaas-payment] terms_acceptance_validated", {
      stage: "terms_acceptance_verify",
      sale_id: saleId,
      event_id: eventId,
      company_id: companyId,
      required_term_version_ids: [],
      accepted_term_version_ids: versionIds,
    });
    return { ok: true as const };
  }

  const { data: persistedAcceptances, error: persistedError } = await supabaseAdmin
    .from("sale_term_acceptances")
    .select("term_id, term_version_id")
    .eq("sale_id", saleId)
    .eq("event_id", eventId)
    .eq("company_id", companyId)
    .eq("acceptance_origin", "public_checkout")
    .eq("explicit_acceptance", true)
    .in("term_version_id", requiredLinks.map((link) => link.term_version_id));

  if (persistedError) {
    console.error("[create-asaas-payment] terms_acceptance_verify_failed", {
      stage: "terms_acceptance_verify",
      sale_id: saleId,
      event_id: eventId,
      company_id: companyId,
      error: persistedError,
    });
    return { ok: false as const, status: 500, reason: "terms_acceptance_validate_failed" };
  }

  const persistedKeys = new Set(
    ((persistedAcceptances ?? []) as Array<{ term_id: string; term_version_id: string }>)
      .map((acceptance) => `${acceptance.term_id}:${acceptance.term_version_id}`),
  );
  const missingRequiredPersisted = requiredLinks.filter(
    (link) => !persistedKeys.has(`${link.term_id}:${link.term_version_id}`),
  );

  if (missingRequiredPersisted.length > 0) {
    console.warn("[create-asaas-payment] terms_acceptance_required_missing", {
      stage: "terms_acceptance_verify",
      sale_id: saleId,
      event_id: eventId,
      company_id: companyId,
      missing_term_version_ids: missingRequiredPersisted.map((link) => link.term_version_id),
    });
    return { ok: false as const, status: 409, reason: "terms_acceptance_required" };
  }

  console.info("[create-asaas-payment] terms_acceptance_validated", {
    stage: "terms_acceptance_verify",
    sale_id: saleId,
    event_id: eventId,
    company_id: companyId,
    required_term_version_ids: requiredLinks.map((link) => link.term_version_id),
    accepted_term_version_ids: versionIds,
  });

  return { ok: true as const };
}
