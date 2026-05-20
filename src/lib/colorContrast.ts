const HEX_COLOR_REGEX = /^#?[0-9A-F]{6}$/i;

type RgbColor = { r: number; g: number; b: number };

function normalizeHexColor(color: string): string | null {
  const trimmed = color.trim();
  if (!trimmed) return null;
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  return HEX_COLOR_REGEX.test(withHash) ? withHash.toUpperCase() : null;
}

function hexToRgb(hex: string): RgbColor | null {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;

  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function getRelativeLuminance({ r, g, b }: RgbColor): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Regra central de legibilidade para cores personalizadas da empresa.
 * Retorna texto claro em fundos escuros e texto escuro em fundos claros.
 */
export function getContrastTextColor(backgroundColor: string): '#FFFFFF' | '#111827' {
  const rgb = hexToRgb(backgroundColor);
  if (!rgb) return '#FFFFFF';

  const bgLuminance = getRelativeLuminance(rgb);
  const contrastWithWhite = (1.05) / (bgLuminance + 0.05);
  const contrastWithDark = (bgLuminance + 0.05) / 0.05;

  return contrastWithDark >= contrastWithWhite ? '#111827' : '#FFFFFF';
}

