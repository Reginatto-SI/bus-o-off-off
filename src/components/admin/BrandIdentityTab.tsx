import { Company } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Check, RotateCcw, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

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

interface BrandIdentityTabProps {
  company: Company | null;
  colors: {
    primary: string;
    accent: string;
    ticket: string;
  };
  onColorsChange: (colors: { primary: string; accent: string; ticket: string }) => void;
}

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
          ...(selected ? { ringColor: hex } : {}),
        }}
      >
        {selected && <Check className="h-4 w-4 text-white drop-shadow-sm" />}
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

export function BrandIdentityTab({ company, colors, onColorsChange }: BrandIdentityTabProps) {
  // Comentário: a aba é 100% controlada pelo formulário pai para evitar loops visuais de sincronização.
  const primaryColor = colors.primary || company?.primary_color || DEFAULTS.primary;
  const accentColor = colors.accent || company?.accent_color || DEFAULTS.accent;
  const ticketColor = colors.ticket || company?.ticket_color || DEFAULTS.ticket;

  const sameWarning = primaryColor === accentColor;

  useEffect(() => {
    // Comentário: sincroniza a aba com o formulário principal para salvar tudo no botão global do rodapé.
    onColorsChange({
      primary: primaryColor,
      accent: accentColor,
      ticket: ticketColor,
    });
  }, [primaryColor, accentColor, ticketColor, onColorsChange]);

  const handleRestore = () => {
    onColorsChange({
      primary: DEFAULTS.primary,
      accent: DEFAULTS.accent,
      ticket: DEFAULTS.ticket,
    });
  };

  const updateColors = (next: Partial<{ primary: string; accent: string; ticket: string }>) => {
    onColorsChange({
      primary: next.primary ?? primaryColor,
      accent: next.accent ?? accentColor,
      ticket: next.ticket ?? ticketColor,
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
                className="text-white pointer-events-none"
                style={{ backgroundColor: primaryColor }}
              >
                Botão Primário
              </Button>
              <Badge
                className="text-white border-transparent pointer-events-none"
                style={{ backgroundColor: accentColor }}
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
