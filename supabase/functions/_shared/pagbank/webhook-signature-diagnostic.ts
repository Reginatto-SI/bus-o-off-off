// Diagnóstico somente-leitura (Sandbox): descobre QUAL credencial já existente
// gera o x-authenticity-token recebido. Comparação apenas em memória.
// NUNCA altera o resultado de autenticação do webhook e nunca devolve segredos,
// hashes, assinatura ou payload — somente o nome do candidato coincidente.
import { verifyPagbankWebhookSignature } from "./core.ts";

export type SignatureDiagnosticCandidateName =
  | "connect_access_token"
  | "connection_webhook_token"
  | "platform_account_token"
  | "application_client_secret"
  | "environment_webhook_token";

export type SignatureDiagnosticCandidate = {
  name: SignatureDiagnosticCandidateName;
  token: string | null | undefined;
};

export type SignatureDiagnosticResult = {
  matched_candidate: SignatureDiagnosticCandidateName | "none";
  compared_candidates: SignatureDiagnosticCandidateName[];
};

export async function diagnosePagbankWebhookSignature(params: {
  rawBody: string;
  receivedSignature: string | null | undefined;
  candidates: SignatureDiagnosticCandidate[];
}): Promise<SignatureDiagnosticResult> {
  const available = params.candidates.filter((c) => typeof c.token === "string" && c.token.trim().length > 0);
  const compared = available.map((c) => c.name);
  if (!params.receivedSignature) return { matched_candidate: "none", compared_candidates: compared };
  for (const c of available) {
    const r = await verifyPagbankWebhookSignature({ rawBody: params.rawBody, token: c.token, receivedSignature: params.receivedSignature });
    if (r.valid) return { matched_candidate: c.name, compared_candidates: compared };
  }
  return { matched_candidate: "none", compared_candidates: compared };
}
