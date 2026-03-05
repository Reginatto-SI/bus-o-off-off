import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

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

const COVER_BUCKET = 'company-covers';
const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export function EditHeroModal({
  open, onOpenChange, companyId, currentCoverUrl, currentBackgroundStyle, onSave,
}: EditHeroModalProps) {
  const [coverUrl, setCoverUrl] = useState(currentCoverUrl ?? '');
  const [bgStyle, setBgStyle] = useState(currentBackgroundStyle);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setCoverUrl(currentCoverUrl ?? '');
      setBgStyle(currentBackgroundStyle);
    }
    onOpenChange(isOpen);
  };

  const handleUpload = async (file?: File) => {
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({ title: 'Formato inválido', description: 'Envie JPG, PNG ou WEBP', variant: 'destructive' });
      return;
    }
    if (file.size > MAX_SIZE) {
      toast({ title: 'Arquivo muito grande', description: 'Máximo: 5MB', variant: 'destructive' });
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `cover-${companyId}.${ext}`;
    setUploading(true);

    const { error } = await supabase.storage
      .from(COVER_BUCKET)
      .upload(fileName, file, { upsert: true });

    if (error) {
      toast({ title: 'Erro no upload', description: error.message, variant: 'destructive' });
      setUploading(false);
      return;
    }

    const cacheBust = Date.now();
    const { data } = supabase.storage.from(COVER_BUCKET).getPublicUrl(fileName);
    const url = data?.publicUrl ? `${data.publicUrl}?v=${cacheBust}` : '';
    setCoverUrl(url);
    setUploading(false);
  };

  const handleRemove = () => {
    setCoverUrl('');
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
          {/* Upload da capa */}
          <div className="space-y-2">
            <Label>Imagem de capa</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                void handleUpload(file);
                e.currentTarget.value = '';
              }}
            />
            {coverUrl.trim() && (
              <div className="rounded-md border overflow-hidden" style={{ aspectRatio: '2000/900' }}>
                <img
                  src={coverUrl.trim()}
                  alt="Preview da capa"
                  className="h-full w-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || saving}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {coverUrl.trim() ? 'Alterar imagem' : 'Enviar imagem'}
              </Button>
              {coverUrl.trim() && (
                <Button type="button" variant="ghost" size="sm" onClick={handleRemove} className="text-destructive">
                  Remover
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Recomendado: 2000 × 900px · JPG, PNG ou WEBP · Máx: 5MB
            </p>
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
          <Button onClick={handleSave} disabled={saving || uploading}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
