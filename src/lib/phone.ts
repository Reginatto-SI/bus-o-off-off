/**
 * Padrão oficial de telefone/WhatsApp no sistema SmartBus BR
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ EXIBIÇÃO (máscara visual no input)                              │
 * │   Celular:  (65) 99999-8888                                     │
 * │   Fixo:     (65) 3333-4444                                      │
 * ├──────────────────────────────────────────────────────────────────┤
 * │ ARMAZENAMENTO (banco de dados)                                  │
 * │   Somente dígitos, sem DDI: 65999998888                         │
 * ├──────────────────────────────────────────────────────────────────┤
 * │ LINK WHATSAPP                                                   │
 * │   https://wa.me/5565999998888                                   │
 * │   Gerado por buildWhatsappWaMeLink em @/lib/whatsapp.ts         │
 * └──────────────────────────────────────────────────────────────────┘
 */

/**
 * Remove tudo que não é dígito.
 * Trata prefixos comuns colados como +55, 055, 0055.
 * Retorna apenas os dígitos DDD+número (sem DDI).
 */
export function stripPhoneToDigits(value: string): string {
  if (!value) return '';
  // Remove tudo que não é dígito
  let digits = value.replace(/\D/g, '');
  // Remove DDI brasileiro se colado no início (55 + 10/11 dígitos)
  if (digits.length >= 12 && digits.startsWith('55')) {
    const rest = digits.slice(2);
    if (rest.length === 10 || rest.length === 11) {
      digits = rest;
    }
  }
  // Remove zeros iniciais residuais (ex: 055...)
  if (digits.length > 11) {
    digits = digits.replace(/^0+/, '');
  }
  // Garante no máximo 11 dígitos (DDD + celular)
  return digits.slice(0, 11);
}

/**
 * Aplica máscara brasileira durante digitação.
 * Aceita entrada com ou sem formatação e normaliza automaticamente.
 *
 * - 2 dígitos → DDD parcial
 * - 10 dígitos → fixo: (XX) XXXX-XXXX
 * - 11 dígitos → celular: (XX) XXXXX-XXXX
 */
export function formatPhoneBR(value: string): string {
  const digits = stripPhoneToDigits(value);
  if (!digits) return '';

  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;

  // Fixo: 10 dígitos → (XX) XXXX-XXXX
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  // Celular: 11 dígitos → (XX) XXXXX-XXXX
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/**
 * Extrai apenas dígitos DDD+número para persistência no banco.
 * Retorna string com 10 ou 11 dígitos, ou string vazia se inválido.
 *
 * Diferença para stripPhoneToDigits: esta função é semanticamente
 * usada no momento do save, enquanto stripPhoneToDigits é usada
 * internamente pela máscara.
 */
export function normalizePhoneForStorage(value: string): string {
  return stripPhoneToDigits(value);
}

/**
 * Valida se o número possui quantidade válida de dígitos brasileiros.
 * - 10 dígitos → telefone fixo (DDD + 8)
 * - 11 dígitos → celular (DDD + 9)
 */
export function isValidBRPhone(value: string): boolean {
  const digits = stripPhoneToDigits(value);
  return digits.length === 10 || digits.length === 11;
}
