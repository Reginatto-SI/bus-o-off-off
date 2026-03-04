import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const MAX_CHARS = 400;

interface EditIntroModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  currentIntroText: string | null;
  onSave: (introText: string | null) => void;
}

export function EditIntroModal({
  open, onOpenChange, companyId, currentIntroText, onSave,
}: EditIntroModalProps) {
  const [text, setText] = useState(currentIntroText ?? '');
  const [saving, setSaving] = useState(false);

  // Resetar state ao abrir o modal
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) setText(currentIntroText ?? '');
    onOpenChange(isOpen);
  };

  const handleSave = async () => {
    setSaving(true);
    const value = text.trim() || null;

    const { error } = await supabase
      .from('companies')
      .update({ intro_text: value })
      .eq('id', companyId);

    setSaving(false);

    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Texto de apresentação atualizado' });
    onSave(value);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar texto de apresentação</DialogTitle>
          <DialogDescription>Esse texto aparece abaixo do hero na vitrine da empresa.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="intro-text">Texto de apresentação</Label>
          <Textarea
            id="intro-text"
            placeholder="Descreva brevemente sua empresa ou seus serviços..."
            value={text}
            onChange={(e) => {
              if (e.target.value.length <= MAX_CHARS) setText(e.target.value);
            }}
            rows={4}
          />
          <p className="text-xs text-muted-foreground text-right">
            {text.length}/{MAX_CHARS} caracteres
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
