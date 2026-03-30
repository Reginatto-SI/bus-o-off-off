import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, MapPin, MessageCircle, ShieldCheck, Ticket } from 'lucide-react';

const HERO_BADGE_FALLBACKS = [
  'Passagens para eventos',
  'Embarque organizado',
  'Compra segura',
  'Atendimento rápido',
] as const;
const HERO_BADGE_ICONS = [Ticket, MapPin, ShieldCheck, MessageCircle] as const;
const HERO_BADGE_MAX_CHARS = 60;

const HERO_BADGE_FALLBACKS = [
  'Passagens para eventos',
  'Embarque organizado',
  'Compra segura',
  'Atendimento rápido',
] as const;
const HERO_BADGE_MAX_CHARS = 60;

interface EditHeroModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  currentCoverUrl: string | null;
  useDefaultCover: boolean;
  currentBackgroundStyle: string;
  currentHeroBadgeLabels: string[] | null;
  onSave: (data: {
    cover_image_url: string | null;
    use_default_cover: boolean;
    background_style: string;
    hero_badge_labels: string[] | null;
  }) => void;
}

const STYLE_OPTIONS = [
  { value: 'solid', label: 'Cor sólida' },
  { value: 'subtle_gradient', label: 'Gradiente suave' },
  { value: 'cover_overlay', label: 'Imagem com overlay' },
] as const;

const COVER_BUCKET = 'company-covers';
const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const DEFAULT_SHOWCASE_COVER_URL = '/assets/vitrine/Img_padrao_vitrine.png';

export function EditHeroModal({
  open,
  onOpenChange,
  companyId,
  currentCoverUrl,
  useDefaultCover,
  currentBackgroundStyle,
  currentHeroBadgeLabels,
  onSave,
}: EditHeroModalProps) {
  const [coverUrl, setCoverUrl] = useState(currentCoverUrl ?? '');
  const [useDefault, setUseDefault] = useState(useDefaultCover);
  const [bgStyle, setBgStyle] = useState(currentBackgroundStyle);
  const [heroBadgeLabels, setHeroBadgeLabels] = useState<string[]>(
    HERO_BADGE_FALLBACKS.map((fallback, index) => currentHeroBadgeLabels?.[index]?.trim() || fallback),
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setCoverUrl(currentCoverUrl ?? '');
      setUseDefault(useDefaultCover);
      setBgStyle(currentBackgroundStyle);
      // Reaproveita o modal de aparência para manter o mesmo fluxo já existente de edição da vitrine.
      setHeroBadgeLabels(
        HERO_BADGE_FALLBACKS.map((fallback, index) => currentHeroBadgeLabels?.[index]?.trim() || fallback),
      );
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
    // Quando o usuário sobe imagem própria, ela sempre tem prioridade sobre a padrão.
    setCoverUrl(url);
    setUseDefault(false);
    setUploading(false);
  };

  const handleRemove = () => {
    // Remove qualquer imagem (personalizada/padrão) e força fallback para gradiente.
    setCoverUrl('');
    setUseDefault(false);
  };

  const handleRestoreDefault = () => {
    // Restaura explicitamente a capa padrão do sistema com 1 clique.
    setCoverUrl('');
    setUseDefault(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const sanitizedBadgeLabels = HERO_BADGE_FALLBACKS.map((fallback, index) => {
      const value = heroBadgeLabels[index]?.trim();
      return value || fallback;
    });
    const payload = {
      cover_image_url: coverUrl.trim() || null,
      use_default_cover: useDefault,
      background_style: bgStyle,
      // Persistência por empresa: o update mantém o isolamento multi-tenant já aplicado em companies.
      hero_badge_labels: sanitizedBadgeLabels,
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

  const hasCustomCover = !!coverUrl.trim();
  const hasAnyCover = hasCustomCover || useDefault;
  const previewUrl = hasCustomCover ? coverUrl.trim() : (useDefault ? DEFAULT_SHOWCASE_COVER_URL : '');

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
            {hasAnyCover && (
              <div className="rounded-md border overflow-hidden" style={{ aspectRatio: '2000/900' }}>
                <img
                  src={previewUrl}
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
                {hasCustomCover ? 'Alterar imagem' : 'Enviar imagem'}
              </Button>
              {hasAnyCover && (
                <Button type="button" variant="ghost" size="sm" onClick={handleRemove} className="text-destructive">
                  Remover
                </Button>
              )}
              {!useDefault && (
                <Button type="button" variant="secondary" size="sm" onClick={handleRestoreDefault}>
                  Restaurar imagem padrão
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

          {/* Etiquetas do centro da hero: editáveis no mesmo fluxo visual de aparência já existente */}
          <div className="space-y-2">
            <Label>Etiquetas centrais da hero</Label>
            <div className="space-y-2">
              {HERO_BADGE_FALLBACKS.map((fallback, index) => {
                const Icon = HERO_BADGE_ICONS[index];
                return (
                  <div key={`hero-badge-input-${index}`} className="flex items-center gap-2">
                    {/* Ícones fixos por posição para espelhar exatamente o mapeamento visual já usado na hero pública. */}
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                    <Input
                      value={heroBadgeLabels[index] ?? ''}
                      maxLength={HERO_BADGE_MAX_CHARS}
                      placeholder={fallback}
                      onChange={(event) => {
                        const value = event.target.value;
                        setHeroBadgeLabels((prev) => prev.map((item, itemIndex) => (itemIndex === index ? value : item)));
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Edite cada etiqueta individualmente. Se um campo ficar vazio, usamos o texto padrão sem quebrar o layout.
            </p>
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
