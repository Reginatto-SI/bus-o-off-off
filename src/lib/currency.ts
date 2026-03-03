// Helper central de moeda pt-BR.
// Este arquivo concentra toda a regra de exibição/digitação monetária para manter o padrão global: R$ 1.234,56.
const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrencyBRL(value: number | string | null | undefined): string {
  const normalized = typeof value === 'string'
    ? Number(value.replace(',', '.'))
    : Number(value ?? 0);

  if (!Number.isFinite(normalized)) return BRL_FORMATTER.format(0);
  return BRL_FORMATTER.format(normalized);
}

// Parser tolerante para inputs em pt-BR.
// Não salva "R$"; devolve número limpo para manter cálculos e persistência numéricos.
export function parseCurrencyInputBRL(value: string): number {
  if (!value) return 0;

  const cleaned = value
    .replace(/\s/g, '')
    .replace('R$', '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Máscara de digitação: mantém somente dígitos e reaplica formato monetário em tempo real.
export function formatCurrencyInputFromDigits(rawValue: string): string {
  const digitsOnly = rawValue.replace(/\D/g, '');
  const cents = Number(digitsOnly || '0');
  return formatCurrencyBRL(cents / 100);
}


// Formata para campo de input (sem prefixo), preservando 2 casas no padrão pt-BR.
export function formatCurrencyValueBRL(value: number | string | null | undefined): string {
  return formatCurrencyBRL(value).replace(/^R\$\s?/, '').trim();
}

// Máscara para inputs com prefixo visual externo (ex.: <span>R$</span>), retornando apenas o valor numérico formatado.
export function formatCurrencyInputValueFromDigits(rawValue: string): string {
  const digitsOnly = rawValue.replace(/\D/g, '');
  const cents = Number(digitsOnly || '0');
  return formatCurrencyValueBRL(cents / 100);
}
