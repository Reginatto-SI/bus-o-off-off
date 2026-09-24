// Validação compartilhada para que checkout e cobrança aceitem o mesmo e-mail real do comprador.
const CUSTOMER_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeCustomerEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidCustomerEmail(value: unknown): boolean {
  const email = normalizeCustomerEmail(value);
  return email.length <= 254 && CUSTOMER_EMAIL_PATTERN.test(email);
}
