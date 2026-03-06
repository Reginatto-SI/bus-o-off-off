

# Fix: Imagem de capa da vitrine sempre visível quando configurada

## Problema identificado

A imagem de capa **só é exibida** quando `background_style === 'cover_overlay'` (linha 122-128). Se o usuário faz upload da capa mas seleciona "Gradiente suave" ou "Cor sólida", a imagem é **completamente ignorada** — gerando confusão.

Além disso, a altura do hero com capa (280px mobile / 420px desktop) está abaixo do desejado (400-550px desktop).

## Mudanças propostas

### 1. Lógica do hero: capa sempre visível quando existir (`PublicCompanyShowcase.tsx`)

- Alterar `isCoverOverlay` → `hasCover` (boolean baseado apenas em `cover_image_url` existir)
- `renderHeroStyle()`: se `cover_image_url` existe, **sempre** usar como background com overlay, independente de `background_style`
  - `background_style` passa a controlar a **intensidade/estilo do overlay** (solid = overlay escuro forte 0.45, subtle_gradient = overlay gradiente suave 0.3, cover_overlay = overlay padrão 0.35)
- Se **não** há `cover_image_url`, manter comportamento atual (gradiente ou cor sólida)

### 2. Altura do hero

- Com capa: `h-[320px] sm:h-[480px]` (mobile 320px, desktop 480px — dentro do range 400-550)
- Sem capa: manter `py-10 sm:py-14` atual

### 3. Textos brancos quando há capa

- Usar `hasCover` em vez de `isCoverOverlay` para aplicar classes `text-white` nos títulos/subtítulos e estilos dos botões

### 4. Fallback sem capa

Já funciona: `subtle_gradient` ou `solid` renderizam fundo com cor primária. Nenhuma mudança necessária.

### Arquivo
| Arquivo | Mudança |
|---------|---------|
| `src/pages/public/PublicCompanyShowcase.tsx` | Lógica `hasCover`, `renderHeroStyle()`, altura, classes de cor |

Nenhuma query, modal, ou componente externo é alterado.

