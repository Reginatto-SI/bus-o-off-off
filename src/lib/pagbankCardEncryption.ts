// Criptografia de cartão PagBank no navegador com o SDK oficial.
// PAN/CVV existem somente na memória desta página até a criptografia; o
// SmartBus recebe apenas o cartão criptografado, últimos 4 dígitos e bandeira.
const PAGBANK_SDK_URL = "https://assets.pagseguro.com.br/checkout-sdk-js/rc/dist/browser/pagseguro.min.js";

type PagSeguroSdk = {
  encryptCard: (input: {
    publicKey: string;
    holder: string;
    number: string;
    expMonth: string;
    expYear: string;
    securityCode: string;
  }) => { encryptedCard?: string; hasErrors?: boolean; errors?: Array<{ code?: string }> };
};

let sdkPromise: Promise<PagSeguroSdk> | null = null;

export function loadPagbankSdk(): Promise<PagSeguroSdk> {
  const existing = (window as unknown as { PagSeguro?: PagSeguroSdk }).PagSeguro;
  if (existing) return Promise.resolve(existing);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PAGBANK_SDK_URL;
    script.async = true;
    script.onload = () => {
      const sdk = (window as unknown as { PagSeguro?: PagSeguroSdk }).PagSeguro;
      if (sdk) resolve(sdk);
      else reject(new Error("pagbank_sdk_unavailable"));
    };
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error("pagbank_sdk_load_failed"));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export type CardFormValues = {
  holderName: string;
  number: string;
  expiry: string; // MM/AA
  cvv: string;
};

export function onlyCardDigits(v: string) {
  return v.replace(/\D/g, "");
}

export function luhnValid(num: string): boolean {
  const d = onlyCardDigits(num);
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function detectCardBrand(num: string): string | null {
  const d = onlyCardDigits(num);
  if (/^3[47]/.test(d)) return "amex";
  if (/^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(d)) return "elo";
  if (/^(606282|3841)/.test(d)) return "hipercard";
  if (/^4/.test(d)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(d)) return "mastercard";
  return null;
}

export function parseExpiry(expiry: string): { month: string; year: string } | null {
  const m = expiry.match(/^\s*(\d{2})\s*\/\s*(\d{2}|\d{4})\s*$/);
  if (!m) return null;
  const month = Number(m[1]);
  if (month < 1 || month > 12) return null;
  const year = m[2].length === 2 ? `20${m[2]}` : m[2];
  const now = new Date();
  const endOfMonth = new Date(Number(year), month, 1);
  if (endOfMonth <= now) return null;
  return { month: m[1], year };
}

/** Mensagem de validação amigável ou null quando o formulário está completo. */
export function validateCardForm(v: CardFormValues): string | null {
  const name = v.holderName.trim();
  if (name.length < 3 || /\d/.test(name)) return "Informe o nome do titular como está no cartão.";
  if (!luhnValid(v.number)) return "Número do cartão inválido.";
  if (!parseExpiry(v.expiry)) return "Validade do cartão inválida.";
  const cvvLen = detectCardBrand(v.number) === "amex" ? 4 : 3;
  if (onlyCardDigits(v.cvv).length !== cvvLen) return "Código de segurança inválido.";
  return null;
}

export async function encryptCardWithPagbank(publicKey: string, v: CardFormValues) {
  const exp = parseExpiry(v.expiry);
  if (!exp) throw new Error("card_expiry_invalid");
  const sdk = await loadPagbankSdk();
  const result = sdk.encryptCard({
    publicKey,
    holder: v.holderName.trim(),
    number: onlyCardDigits(v.number),
    expMonth: exp.month,
    expYear: exp.year,
    securityCode: onlyCardDigits(v.cvv),
  });
  if (result.hasErrors || !result.encryptedCard) {
    // Somente códigos de erro do SDK, nunca os dados do cartão.
    throw new Error(`card_encrypt_failed:${(result.errors ?? []).map((e) => e.code).join(",")}`);
  }
  const digits = onlyCardDigits(v.number);
  return {
    encrypted: result.encryptedCard,
    holder_name: v.holderName.trim().replace(/\s+/g, " ").toUpperCase().slice(0, 30),
    last_digits: digits.slice(-4),
    brand: detectCardBrand(digits),
  };
}
