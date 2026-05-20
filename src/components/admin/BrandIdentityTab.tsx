import { useEffect, useState, type CSSProperties } from 'react';
import { Company } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, RotateCcw, AlertTriangle, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getContrastTextColor } from '@/lib/colorContrast';

const COLOR_PALETTE = [
  { name: 'Laranja', hex: '#F97316' },
  { name: 'Azul Royal', hex: '#2563EB' },
  { name: 'Azul Marinho', hex: '#1E3A5F' },
  { name: 'Verde', hex: '#16A34A' },
  { name: 'Verde Escuro', hex: '#15803D' },
  { name: 'Roxo', hex: '#7C3AED' },
  { name: 'Vermelho', hex: '#DC2626' },
  { name: 'Turquesa', hex: '#0891B2' },
  { name: 'Cinza Grafite', hex: '#4B5563' },
  { name: 'Preto', hex: '#18181B' },
] as const;

const DEFAULTS = {
  primary: '#F97316',
  accent: '#2563EB',
  ticket: '#F97316',
};

type BrandColors = {
  primary: string;
  accent: string;
  ticket: string;
};

interface BrandIdentityTabProps {
  company: Company | null;
  colors: BrandColors;
  onColorsChange: (colors: BrandColors) => void;
}

const HEX_COLOR_REGEX = /^#[0-9A-F]{6}$/i;
const PALETTE_HEX_VALUES = COLOR_PALETTE.map((color) => color.hex.toUpperCase());

const normalizeHexColor = (value?: string | null) => {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  return withHash.toUpperCase();
};

const isValidHexColor = (value: string) => HEX_COLOR_REGEX.test(normalizeHexColor(value));
const isPaletteColor = (value: string) => PALETTE_HEX_VALUES.includes(normalizeHexColor(value));

const isLowContrastColor = (value: string) => {
  const normalized = normalizeHexColor(value);
  if (!HEX_COLOR_REGEX.test(normalized)) return false;

  const red = parseInt(normalized.slice(1, 3), 16);
  const green = parseInt(normalized.slice(3, 5), 16);
  const blue = parseInt(normalized.slice(5, 7), 16);
  // Comentário: luminância simples é suficiente para aviso não bloqueante de cores muito claras.
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.78;
};

function ColorSwatch({
  hex,
  name,
  selected,
  onClick,
}: {
  hex: string;
  name: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 group"
    >
      <div
        className={cn(
          'h-8 w-8 rounded-full border-2 transition-all flex items-center justify-center',
          selected
            ? 'ring-2 ring-offset-2 ring-offset-background border-transparent'
            : 'border-border hover:scale-110'
        )}
        style={{
          backgroundColor: hex,
          ...(selected ? { '--tw-ring-color': hex } : {}),
        } as CSSProperties}
      >
        {selected && <Check className="h-4 w-4 drop-shadow-sm" style={{ color: getContrastTextColor(hex) }} />}
      </div>
      <span className={cn(
        'text-[10px] leading-tight text-center max-w-[56px]',
        selected ? 'font-semibold text-foreground' : 'text-muted-foreground'
      )}>
        {name}
      </span>
    </button>
  );
}

function CustomColorPicker({
  label,
  color,
  selected,
  onApply,
}: {
  label: string;
  color: string;
  selected: boolean;
  onApply: (hex: string) => void;
}) {
  const normalizedColor = normalizeHexColor(color) || DEFAULTS.primary;
  const [open, setOpen] = useState(false);
  const [draftColor, setDraftColor] = useState(normalizedColor);
  const normalizedDraft = normalizeHexColor(draftColor);
  const isDraftValid = isValidHexColor(draftColor);
  const previewColor = isDraftValid ? normalizedDraft : normalizedColor;
  const contrastWarning = isDraftValid && isLowContrastColor(normalizedDraft);

  useEffect(() => {
    if (!open) {
      setDraftColor(normalizedColor);
    }
  }, [normalizedColor, open]);

  const handleApply = () => {
    if (!isDraftValid) return;
    onApply(normalizedDraft);
    setOpen(false);
  };

  const handleCancel = () => {
    setDraftColor(normalizedColor);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex flex-col items-center gap-1.5 group"
          aria-label={`Selecionar cor personalizada para ${label}`}
        >
          <div
            className={cn(
              'h-8 w-8 rounded-full border-2 transition-all flex items-center justify-center',
              selected
                ? 'ring-2 ring-offset-2 ring-offset-background border-transparent'
                : 'border-dashed border-border hover:scale-110'
            )}
            style={{
              backgroundColor: selected ? previewColor : 'hsl(var(--muted))',
              ...(selected ? { '--tw-ring-color': previewColor } : {}),
            } as CSSProperties}
          >
            {selected ? (
              <Check className="h-4 w-4 drop-shadow-sm" style={{ color: getContrastTextColor(previewColor) }} />
            ) : (
              <Palette className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <span className={cn(
            'text-[10px] leading-tight text-center max-w-[72px]',
            selected ? 'font-semibold text-foreground' : 'text-muted-foreground'
          )}>
            Personalizada
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="space-y-4">
          <div className="space-y-1">
            <h4 className="text-sm font-medium">Cor personalizada</h4>
            <p className="text-xs text-muted-foreground">
              Escolha uma cor visualmente ou informe o código hexadecimal.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
            <div
              className="h-12 w-12 rounded-md border shadow-sm"
              style={{ backgroundColor: previewColor }}
            />
            <div className="min-w-0 space-y-1">
              <p className="text-xs text-muted-foreground">Prévia</p>
              <p className="font-mono text-sm font-medium">{previewColor}</p>
            </div>
          </div>

          <div className="grid grid-cols-[3rem_1fr] gap-3 items-end">
            <div className="space-y-2">
              <Label htmlFor={`${label}-custom-color-input`} className="text-xs">Cor</Label>
              <Input
                id={`${label}-custom-color-input`}
                type="color"
                value={previewColor}
                onChange={(event) => setDraftColor(normalizeHexColor(event.target.value))}
                className="h-10 w-12 cursor-pointer p-1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${label}-custom-hex-input`} className="text-xs">Hexadecimal</Label>
              <Input
                id={`${label}-custom-hex-input`}
                value={draftColor}
                onChange={(event) => setDraftColor(event.target.value)}
                onBlur={() => setDraftColor((current) => normalizeHexColor(current))}
                placeholder="#F97316"
                className="font-mono"
                maxLength={7}
              />
            </div>
          </div>

          {!isDraftValid && (
            <p className="text-xs text-destructive">Informe uma cor hexadecimal válida no formato #RRGGBB.</p>
          )}

          {contrastWarning && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Essa cor pode ter pouco contraste em botões e textos. Recomendamos escolher uma cor mais forte.</span>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={handleApply} disabled={!isDraftValid}>
              Aplicar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function BrandIdentityTab({ company, colors, onColorsChange }: BrandIdentityTabProps) {
  // Comentário: a aba é 100% controlada pelo formulário pai para evitar loops visuais de sincronização.
  const primaryColor = normalizeHexColor(colors.primary || company?.primary_color || DEFAULTS.primary);
  const accentColor = normalizeHexColor(colors.accent || company?.accent_color || DEFAULTS.accent);
  const ticketColor = normalizeHexColor(colors.ticket || company?.ticket_color || DEFAULTS.ticket);

  const sameWarning = primaryColor === accentColor;

  const handleRestore = () => {
    onColorsChange({
      primary: DEFAULTS.primary,
      accent: DEFAULTS.accent,
      ticket: DEFAULTS.ticket,
    });
  };

  const updateColors = (next: Partial<BrandColors>) => {
    // Comentário: os campos existentes já persistem HEX por empresa; normalizamos só o formato salvo na UI.
    onColorsChange({
      primary: normalizeHexColor(next.primary ?? primaryColor),
      accent: normalizeHexColor(next.accent ?? accentColor),
      ticket: normalizeHexColor(next.ticket ?? ticketColor),
    });
  };

  return (
    <div className="space-y-6 lg:space-y-0 lg:grid lg:grid-cols-[minmax(0,40%)_minmax(0,60%)] lg:gap-6 lg:items-start">
      {/* Coluna esquerda (desktop): configurações com rolagem interna para evitar scroll global */}
      <div className="space-y-6 rounded-xl border bg-card p-4 lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto lg:pr-3">
        {/* Seção: Cores do Sistema */}
        <div className="space-y-4 rounded-lg border bg-background p-4">
          <div>
            <h3 className="font-medium text-base">Cores do Sistema</h3>
            <p className="text-sm text-muted-foreground">
              Defina as cores que serão aplicadas nos botões, destaques e elementos do painel administrativo.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Cor Primária</Label>
              <p className="text-xs text-muted-foreground">
                Aplicada em botões principais e destaques do sistema
              </p>
              <div className="flex flex-wrap gap-3">
                {COLOR_PALETTE.map((color) => (
                  <ColorSwatch
                    key={`primary-${color.hex}`}
                    hex={color.hex}
                    name={color.name}
                    selected={primaryColor === color.hex}
                    onClick={() => updateColors({ primary: color.hex })}
                  />
                ))}
                <CustomColorPicker
                  label="primary"
                  color={primaryColor}
                  selected={!isPaletteColor(primaryColor)}
                  onApply={(hex) => updateColors({ primary: hex })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Cor de Destaque</Label>
              <p className="text-xs text-muted-foreground">
                Usada em detalhes e elementos secundários de destaque
              </p>
              <div className="flex flex-wrap gap-3">
                {COLOR_PALETTE.map((color) => (
                  <ColorSwatch
                    key={`accent-${color.hex}`}
                    hex={color.hex}
                    name={color.name}
                    selected={accentColor === color.hex}
                    onClick={() => updateColors({ accent: color.hex })}
                  />
                ))}
                <CustomColorPicker
                  label="accent"
                  color={accentColor}
                  selected={!isPaletteColor(accentColor)}
                  onApply={(hex) => updateColors({ accent: hex })}
                />
              </div>
            </div>

            {sameWarning && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>A cor primária e a cor de destaque são iguais. Recomendamos usar cores diferentes para melhor contraste.</span>
              </div>
            )}
          </div>
        </div>

        {/* Seção: Cores da Passagem */}
        <div className="space-y-4 rounded-lg border bg-background p-4">
          <div className="space-y-2">
            <h3 className="font-medium text-base">Cores da Passagem</h3>
            <p className="text-sm text-muted-foreground">
              Personalize a cor principal exibida nas passagens e tickets gerados.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Cor principal da passagem</Label>
            <p className="text-xs text-muted-foreground">
              Define a cor principal exibida no cabeçalho e detalhes da passagem.
            </p>
            <div className="flex flex-wrap gap-3">
              {COLOR_PALETTE.map((color) => (
                <ColorSwatch
                  key={`ticket-${color.hex}`}
                  hex={color.hex}
                  name={color.name}
                  selected={ticketColor === color.hex}
                  onClick={() => updateColors({ ticket: color.hex })}
                />
              ))}
              <CustomColorPicker
                label="ticket"
                color={ticketColor}
                selected={!isPaletteColor(ticketColor)}
                onApply={(hex) => updateColors({ ticket: hex })}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex items-center justify-start gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRestore}
            className="text-muted-foreground"
          >
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Restaurar padrão
          </Button>
        </div>
      </div>

      {/* Coluna direita (desktop): preview fixo para feedback visual imediato */}
      <div className="rounded-xl border bg-card p-4 lg:sticky lg:top-24 lg:pl-6 lg:border-l lg:border-border/80 lg:shadow-sm">
        <div className="space-y-3">
          <h3 className="font-medium text-base">Preview</h3>
          <p className="text-xs text-muted-foreground">
            Visualize como as cores selecionadas ficam aplicadas
          </p>

          <div className="rounded-lg border p-6 space-y-6 bg-muted/30 min-h-[340px] flex flex-col justify-center">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                className="pointer-events-none"
                style={{
                  backgroundColor: primaryColor,
                  color: getContrastTextColor(primaryColor),
                }}
              >
                Botão Primário
              </Button>
              <Badge
                className="border-transparent pointer-events-none"
                style={{
                  backgroundColor: accentColor,
                  color: getContrastTextColor(accentColor),
                }}
              >
                Destaque
              </Badge>
            </div>

            {/* Mini ticket preview */}
            <div className="max-w-sm rounded-lg border overflow-hidden bg-background shadow-sm">
              <div className="h-2" style={{ backgroundColor: ticketColor }} />
              <div className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: ticketColor }} />
                  <span className="text-xs font-semibold">Passagem de Exemplo</span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Passageiro: João Silva · Poltrona 12
                </p>
                <div className="h-1.5 rounded-full mt-2" style={{ backgroundColor: ticketColor, opacity: 0.3 }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
