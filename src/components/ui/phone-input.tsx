/**
 * PhoneInput — componente reutilizável para campos de telefone/WhatsApp.
 *
 * - Aplica máscara brasileira padrão durante digitação: (XX) XXXXX-XXXX
 * - Aceita colagem com +55, espaços, símbolos — limpa automaticamente
 * - Exibe valor mascarado no input
 * - Expõe `onValueChange(rawDigits)` para o formulário salvar apenas dígitos
 *
 * Uso:
 *   <PhoneInput value={form.phone} onValueChange={(v) => setForm({ ...form, phone: v })} />
 *
 * O valor armazenado no state do formulário deve ser a string FORMATADA (com máscara),
 * pois é o que o usuário vê. No momento do save, use `normalizePhoneForStorage(value)`
 * para extrair apenas dígitos antes de enviar ao banco.
 */
import * as React from 'react';
import { Input } from '@/components/ui/input';
import { formatPhoneBR } from '@/lib/phone';

export interface PhoneInputProps
  extends Omit<React.ComponentProps<typeof Input>, 'onChange' | 'value'> {
  /** Valor formatado com máscara (exibido no input). */
  value: string;
  /** Callback com o valor já formatado (com máscara). */
  onValueChange: (formattedValue: string) => void;
}

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onValueChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const formatted = formatPhoneBR(e.target.value);
      onValueChange(formatted);
    };

    return (
      <Input
        ref={ref}
        value={value}
        onChange={handleChange}
        placeholder="(00) 00000-0000"
        maxLength={15}
        inputMode="tel"
        {...props}
      />
    );
  }
);

PhoneInput.displayName = 'PhoneInput';

export { PhoneInput };
