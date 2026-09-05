// @ts-nocheck — arquivo Deno (edge function): tipos resolvidos pelo runtime Deno, não pelo tsc do app.
// Cifra AES-256-GCM para tokens PagBank por empresa. A chave vem exclusivamente
// do secret de backend PAGBANK_TOKEN_ENCRYPTION_KEY (nunca do banco nem do frontend).

const ENCRYPTION_SECRET_NAME = "PAGBANK_TOKEN_ENCRYPTION_KEY";

async function importKey(): Promise<CryptoKey> {
  const secret = Deno.env.get(ENCRYPTION_SECRET_NAME);
  if (!secret) {
    throw new Error(`missing_secret:${ENCRYPTION_SECRET_NAME}`);
  }
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Formato: `v1.<iv_b64>.<ciphertext_b64>` */
export async function encryptSecret(plain: string): Promise<string> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  return `v1.${toB64(iv)}.${toB64(new Uint8Array(ct))}`;
}

export async function decryptSecret(payload: string | null | undefined): Promise<string | null> {
  if (!payload) return null;
  const [version, ivB64, ctB64] = payload.split(".");
  if (version !== "v1" || !ivB64 || !ctB64) throw new Error("pagbank_cipher_format_invalid");
  const key = await importKey();
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(ivB64) }, key, fromB64(ctB64));
  return new TextDecoder().decode(plain);
}

export function isEncryptionConfigured(): boolean {
  return Boolean(Deno.env.get(ENCRYPTION_SECRET_NAME));
}
