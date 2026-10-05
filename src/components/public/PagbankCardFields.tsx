import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock } from 'lucide-react';
import type { CardFormValues } from '@/lib/pagbankCardEncryption';

function formatNumber(v: string) {
  return v.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
}
function formatExpiry(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

/**
 * Campos do cartão para PagBank. Os valores ficam só em memória e são
 * criptografados no navegador pelo SDK oficial antes do envio.
 */
export function PagbankCardFields({
  value, onChange, disabled,
}: { value: CardFormValues; onChange: (v: CardFormValues) => void; disabled?: boolean }) {
  const set = (patch: Partial<CardFormValues>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="space-y-1.5">
        <Label htmlFor="card-holder">Nome impresso no cartão</Label>
        <Input id="card-holder" autoComplete="cc-name" disabled={disabled} value={value.holderName}
          maxLength={30} onChange={(e) => set({ holderName: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="card-number">Número do cartão</Label>
        <Input id="card-number" inputMode="numeric" autoComplete="cc-number" disabled={disabled}
          value={value.number} onChange={(e) => set({ number: formatNumber(e.target.value) })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="card-expiry">Validade (MM/AA)</Label>
          <Input id="card-expiry" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA" disabled={disabled}
            value={value.expiry} onChange={(e) => set({ expiry: formatExpiry(e.target.value) })} />
        </div>
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="card-cvv">Código de segurança</Label>
          <Input id="card-cvv" inputMode="numeric" autoComplete="cc-csc" type="password" disabled={disabled}
            value={value.cvv} onChange={(e) => set({ cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5" /> Pagamento à vista (1x). Os dados do cartão são protegidos pelo PagBank.
      </p>
    </div>
  );
}
