import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface EditHeroModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  currentCoverUrl: string | null;
  currentBackgroundStyle: string;
  onSave: (data: { cover_image_url: string | null; background_style: string }) => void;
}

const STYLE_OPTIONS = [
  { value: 'solid', label: 'Cor sólida' },
  { value: 'subtle_gradient', label: 'Gradiente suave' },
  { value: 'cover_overlay', label: 'Imagem com overlay' },
] as const;

export function EditHeroModal({
  open, onOpenChange, companyId, currentCoverUrl, currentBackgroundStyle, onSave,
}: EditHeroModalProps) {
  const [coverUrl, setCoverUrl] = useState(currentCoverUrl ?? '');
  const [bgStyle, setBgStyle] = useState(currentBackgroundStyle);
  const [saving, setSaving] = useState(false);

  // Resetar state ao abrir o modal (sync com props)
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setCoverUrl(currentCoverUrl ?? '');
      setBgStyle(currentBackgroundStyle);
    }
    onOpenChange(isOpen);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      cover_image_url: coverUrl.trim() || null,
      background_style: bgStyle,
    };

    const { error } = await supabase
      .from('companies')
      .update(payload)
      .eq('id', companyId);

    setSaving(false);

    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Aparência atualizada' });
    onSave(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar aparência do hero</DialogTitle>
          <DialogDescription>Altere a imagem de capa e o estilo de fundo da vitrine.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* URL da capa */}
          <div className="space-y-2">
            <Label htmlFor="cover-url">URL da imagem de capa</Label>
            <Input
              id="cover-url"
              placeholder="https://exemplo.com/capa.jpg"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
            />
            {coverUrl.trim() && (
              <img
                src={coverUrl.trim()}
                alt="Preview da capa"
                className="mt-2 h-28 w-full rounded-md object-cover border"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
          </div>

          {/* Estilo de fundo */}
          <div className="space-y-2">
            <Label>Estilo de fundo</Label>
            <Select value={bgStyle} onValueChange={setBgStyle}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STYLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
