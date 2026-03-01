/**
 * Normaliza telefone para uso em `wa.me` (somente dígitos, com DDI quando aplicável).
 * - Aceita entradas com máscara/pontuação e remove caracteres não numéricos.
 * - Para números BR com 10/11 dígitos (DDD + número), prefixa automaticamente com `55`.
 * - Se já vier com DDI (ex.: 55...), preserva.
 */
export const normalizeWhatsappForWaMe = (value?: string | null) => {
  if (!value) return null;

  const rawDigits = value.replace(/\D/g, '');
  if (!rawDigits) return null;

  // Remove prefixo internacional 00 e zeros à esquerda que podem vir de discagem local.
  let digits = rawDigits.replace(/^00+/, '').replace(/^0+/, '');
  if (!digits) return null;

  // Cenário mais comum no cadastro BR: número sem DDI (DDD + número com 10/11 dígitos).
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }

  // `wa.me` funciona com padrão internacional; validamos faixa razoável para evitar link inválido.
  if (digits.length < 12 || digits.length > 15) return null;

  return digits;
};

export const buildWhatsappWaMeLink = ({
  phone,
  message,
}: {
  phone?: string | null;
  message: string;
}) => {
  const normalizedPhone = normalizeWhatsappForWaMe(phone);
  if (!normalizedPhone) return null;

  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
};
