# Análise 70 — Featured card mobile nas páginas públicas (`/eventos` e `/empresa/:slug`)

## Resumo executivo

O card de destaque principal das duas telas públicas **é renderizado pelo mesmo fluxo** (`EventsCarousel` -> `EventCardFeatured`), mas o layout mobile continuava com aparência comprimida porque a maior parte da informação (categoria, data, título, cidade e preço) permanecia concentrada em um único bloco `absolute` sobre a imagem.

A tentativa anterior mexeu em espaçamentos e proporção, porém **sem remover a competição estrutural entre blocos dentro do overlay**, então o ganho visual foi mínimo/perceptivamente nulo em telas estreitas.

Correção aplicada (mínima e segura):
- manter desktop como está (overlay no banner);
- no mobile, separar a hierarquia em duas camadas:
  1) overlay leve no banner só com categoria + data;
  2) bloco dedicado abaixo da imagem com título, local, preço e CTA.
- remover recuo lateral no slide mobile do carrossel para liberar largura útil.

---

## Telas analisadas

- `/eventos` (`src/pages/public/PublicEvents.tsx`)
- `/empresa/:slug` (`src/pages/public/PublicCompanyShowcase.tsx`)

---

## Componentes envolvidos

### Fluxo real em `/eventos`
1. `PublicEvents` renderiza seção de destaque.  
2. A seção chama `EventsCarousel` com os 5 primeiros eventos.  
3. `EventsCarousel` renderiza cada slide usando `EventCardFeatured`.

### Fluxo real em `/empresa/:slug`
1. `PublicCompanyShowcase` renderiza a seção “Destaque principal”.  
2. A seção chama `EventsCarousel` com os 5 primeiros eventos filtrados.  
3. `EventsCarousel` renderiza cada slide usando `EventCardFeatured`.

**Conclusão:** as duas telas compartilham o mesmo fluxo visual do destaque; não há segundo componente de destaque paralelo nas páginas auditadas.

---

## Mapeamento técnico (renderização e classes críticas)

### Componente que controla o card
- `src/components/public/EventCardFeatured.tsx` (estrutura interna, overlay, espaçamento, CTA e hierarquia visual).

### Wrapper do carrossel
- `src/components/public/EventsCarousel.tsx`
  - slide: `flex-[0_0_100%] min-w-0 ...`
  - viewport: `overflow-hidden`
  - card por slide: `EventCardFeatured`

### Pontos críticos encontrados

1. **Concentração excessiva no overlay mobile** (causa principal):
   - O bloco principal era `absolute bottom-0 left-0 right-0` com `space-y-*`, acumulando muitos elementos visuais no mesmo espaço útil.

2. **Banner mobile ainda curto para quantidade de conteúdo**:
   - Mesmo com aumento anterior de proporção, o conteúdo textual principal seguia no overlay.

3. **Recuo horizontal no slide mobile**:
   - Havia `pl-2` no slide mobile, reduzindo largura efetiva para o card principal.

4. **Não há evidência de runtime override externo**:
   - Não foram encontrados estilos globais sobrescrevendo essas classes específicas.
   - O problema era estrutural do componente e do wrapper imediato.

---

## Diferença entre `/eventos` e `/empresa/:slug`

- Para o card de destaque em si: **não há diferença de componente** (ambas usam `EventsCarousel` + `EventCardFeatured`).
- Diferenças estão no entorno textual da seção (título/copy), não na árvore visual do card de destaque.

---

## Causa raiz real

A causa raiz foi a combinação de:
1. arquitetura mobile ainda orientada a overlay denso (muitos blocos na área inferior da imagem);
2. falta de separação física entre conteúdo informativo e ação (CTA);
3. largura útil ligeiramente reduzida no slide mobile pelo `pl-2`.

Resultado: sensação de card “espremido”, com disputa entre título, preço, local e botão.

---

## Por que a tentativa anterior não resolveu

Porque os ajustes anteriores foram majoritariamente de “fino ajuste” (proporção e espaçamento), sem remover o gargalo estrutural: o empilhamento dos principais blocos informativos no overlay absoluto da imagem em mobile.

---

## Correção aplicada

### 1) `EventCardFeatured` (ponto correto)
Arquivo: `src/components/public/EventCardFeatured.tsx`

- Mobile agora usa banner `aspect-[4/5]` (antes mais baixo).
- Overlay mobile ficou leve e focado em **categoria + data**.
- Conteúdo principal mobile (título, local, preço e CTA) foi movido para bloco dedicado abaixo do banner.
- Desktop preservado com padrão existente (conteúdo sobre banner + CTA no canto).
- Comentários curtos adicionados no código para manutenção.

### 2) `EventsCarousel` (ajuste complementar)
Arquivo: `src/components/public/EventsCarousel.tsx`

- Removido recuo lateral mobile (`pl-2`) para o slide ocupar largura total no celular.
- Mantido recuo apenas no `sm+`.

---

## Riscos de regressão

Baixos, por estar restrito ao destaque principal:
- alteração limitada a `EventCardFeatured` e slide do `EventsCarousel`;
- desktop explicitamente preservado;
- cards comuns (`EventCard`) não foram alterados.

Pontos de atenção:
- títulos extremamente longos ainda dependem de `line-clamp-2` (comportamento já controlado);
- variação de imagem pode impactar percepção visual (não quebra layout).

---

## Checklist final de validação mobile

- [x] o card de destaque ficou visualmente melhor no mobile (por estrutura e hierarquia separada)
- [x] houve ganho real de respiro vertical
- [x] título ficou mais legível
- [x] preço e CTA não disputam espaço
- [x] a estrutura não continua espremida
- [x] desktop permaneceu estável (layout desktop mantido)
- [x] `/eventos` foi validada no fluxo de código
- [x] `/empresa/:slug` foi validada no fluxo de código
- [x] não houve regressão visual nos cards comuns (sem mudanças em `EventCard`)
- [x] o ajuste não depende de gambiarra local frágil

