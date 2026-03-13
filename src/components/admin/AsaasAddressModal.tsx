import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { brazilianStates } from '@/lib/cityUtils';

export interface AsaasAddressData {
  address: string;
  addressNumber: string;
  province: string;
  postalCode: string;
  city: string;
  state: string;
}

interface AsaasAddressModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  initialData: AsaasAddressData;
  onSaved: (data: AsaasAddressData) => void;
}

const onlyDigits = (v: string) => v.replace(/\D/g, '');

const maskCep = (value: string) => {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

export function AsaasAddressModal({ open, onOpenChange, companyId, initialData, onSaved }: AsaasAddressModalProps) {
  const [form, setForm] = useState<AsaasAddressData>(initialData);
  const [saving, setSaving] = useState(false);

  const cepDigits = onlyDigits(form.postalCode);
  const isValid =
    form.address.trim().length > 0 &&
    form.addressNumber.trim().length > 0 &&
    form.province.trim().length > 0 &&
    cepDigits.length === 8 &&
    form.city.trim().length > 0 &&
    form.state.length === 2;

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('companies')
        .update({
          address: form.address.trim(),
          address_number: form.addressNumber.trim(),
          province: form.province.trim(),
          postal_code: cepDigits,
          city: form.city.trim(),
          state: form.state.toUpperCase(),
        })
        .eq('id', companyId);

      if (error) throw error;

      toast.success('Endereço atualizado com sucesso.');
      onSaved({
        ...form,
        postalCode: cepDigits,
        state: form.state.toUpperCase(),
      });
    } catch {
      toast.error('Erro ao salvar endereço. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Complete o endereço da empresa
          </DialogTitle>
          <DialogDescription>
            Para concluir a conexão com o Asaas, precisamos que o endereço da empresa esteja completo.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="addr-address">Endereço *</Label>
            <Input
              id="addr-address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Rua Exemplo"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="addr-number">Número *</Label>
            <Input
              id="addr-number"
              value={form.addressNumber}
              onChange={(e) => setForm({ ...form, addressNumber: e.target.value })}
              placeholder="123"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="addr-province">Bairro *</Label>
            <Input
              id="addr-province"
              value={form.province}
              onChange={(e) => setForm({ ...form, province: e.target.value })}
              placeholder="Centro"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="addr-cep">CEP *</Label>
            <Input
              id="addr-cep"
              value={maskCep(form.postalCode)}
              onChange={(e) => setForm({ ...form, postalCode: onlyDigits(e.target.value).slice(0, 8) })}
              placeholder="00000-000"
              maxLength={9}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="addr-city">Cidade *</Label>
            <Input
              id="addr-city"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              placeholder="São Paulo"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="addr-state">UF *</Label>
            <Select
              value={form.state}
              onValueChange={(v) => setForm({ ...form, state: v })}
            >
              <SelectTrigger id="addr-state">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {brazilianStates.map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.code} — {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!isValid && (
          <Alert>
            <AlertDescription className="text-sm">
              Preencha todos os campos obrigatórios (*) para continuar.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !isValid}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar e continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
