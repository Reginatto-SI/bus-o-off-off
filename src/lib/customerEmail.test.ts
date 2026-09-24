import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  isValidCustomerEmail,
  normalizeCustomerEmail,
} from "../../supabase/functions/_shared/customer-email";

describe("e-mail do comprador no checkout público", () => {
  it.each(["", "   "])("não aceita e-mail vazio: %j", (email) => {
    expect(isValidCustomerEmail(email)).toBe(false);
  });

  it.each(["comprador", "comprador@", "@example.com", "a b@example.com"])(
    "não aceita formato inválido: %s",
    (email) => expect(isValidCustomerEmail(email)).toBe(false),
  );

  it("normaliza um e-mail válido sem inventar fallback", () => {
    expect(normalizeCustomerEmail(" Comprador@Example.COM ")).toBe("comprador@example.com");
    expect(isValidCustomerEmail(" Comprador@Example.COM ")).toBe(true);
  });
});

describe("contrato persistido entre checkout e PagBank", () => {
  const checkoutSource = readFileSync(`${process.cwd()}/src/pages/public/Checkout.tsx`, "utf8");
  const pagbankSource = readFileSync(
    `${process.cwd()}/supabase/functions/create-pagbank-payment/index.ts`,
    "utf8",
  );
  const migrationSource = readFileSync(
    `${process.cwd()}/supabase/migrations/20260924120000_add_sales_customer_email.sql`,
    "utf8",
  );

  it("persiste o e-mail válido na venda e mantém a coluna nullable para o histórico", () => {
    expect(checkoutSource).toContain("customer_email: normalizeCustomerEmail(customerEmail)");
    expect(migrationSource).toContain("add column if not exists customer_email text");
    expect(migrationSource).not.toMatch(/customer_email text\s+not null/i);
  });

  it("PagBank lê e valida o e-mail da venda antes de resolver credenciais", () => {
    const validation = pagbankSource.indexOf("isValidCustomerEmail(sale.customer_email)");
    const credential = pagbankSource.indexOf("const credential = await resolvePagbankCredentialForSale");
    expect(validation).toBeGreaterThan(-1);
    expect(credential).toBeGreaterThan(validation);
    expect(pagbankSource).toContain("customer.email = customerEmail");
    expect(pagbankSource).not.toMatch(/customer\.email\s*=.*(example|fake|smartbus)/i);
  });
});
