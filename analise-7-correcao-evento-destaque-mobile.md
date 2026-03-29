# Análise 7 — Correção do evento em destaque no mobile

## 1. O que foi corrigido

Foram aplicadas duas correções pontuais no fluxo público da vitrine:

1. **Categoria do destaque corrigida**: o fetch de eventos da vitrine da empresa agora inclui `event_category`, permitindo que o badge do destaque use a categoria real cadastrada no admin.
2. **Respiro visual no mobile melhorado**: o card de destaque foi reorganizado para reduzir competição na área do banner, separando melhor conteúdo informativo e bloco de ação no mobile.

---

## 2. Correção da categoria

### Onde foi ajustado
- Arquivo: `src/pages/public/PublicCompanyShowcase.tsx`
- Ajuste: inclusão de `event_category` no `select` da query de `events`.

### Resultado
- O `EventCardFeatured` já usava `getEventCategoryLabel(event.event_category)`.
- Com `event_category` presente no payload, o badge deixa de cair indevidamente no fallback `'Evento'` e passa a refletir a categoria real (ex.: `caravana`).

---

## 3. Ajustes do layout mobile

### O que foi simplificado/reorganizado
- Arquivo: `src/components/public/EventCardFeatured.tsx`
- Mudanças principais no mobile:
  1. **Proporção do banner ajustada para `aspect-[4/3]`** no mobile, mantendo `aspect-video` no desktop, para ampliar área útil visual.
  2. **Bloco do banner focado no essencial**: categoria, data, título e preço.
  3. **CTA principal movido para fora do banner no mobile** (bloco dedicado abaixo da imagem), evitando disputa com conteúdo absoluto.
  4. **“Ajuda no WhatsApp” rebaixado de prioridade no mobile** e posicionado no bloco de ação secundária fora da área principal.
  5. **Desktop preservado** com CTA sobre o banner e metadados secundários (incluindo WhatsApp) no comportamento já conhecido.

- Arquivo: `src/components/public/EventsCarousel.tsx`
  - Ajuste de recuo lateral dos slides no mobile (`pl-2`, mantendo `sm:pl-4`) para ampliar a área útil do card nas telas pequenas.

---

## 4. Arquivos alterados

1. `src/pages/public/PublicCompanyShowcase.tsx`
2. `src/components/public/EventCardFeatured.tsx`
3. `src/components/public/EventsCarousel.tsx`
4. `analise-7-correcao-evento-destaque-mobile.md`

---

## 5. Antes vs depois

### Categoria do evento
- **Antes**: destaque recebia eventos sem `event_category` nesse fluxo e exibida `Evento` por fallback.
- **Depois**: `event_category` vem no payload da vitrine e o destaque exibe o label correto via helper único (`getEventCategoryLabel`).

### Densidade visual mobile
- **Antes**: categoria, data, título, preço, WhatsApp e CTA competiam sobre o mesmo plano do banner.
- **Depois**: banner fica focado em informação principal; CTA principal e WhatsApp são redistribuídos no mobile em bloco separado, com mais respiro e hierarquia.

---

## 6. Riscos

1. **Mudança de altura percebida do card no mobile** devido ao bloco de ação externo e nova proporção de banner.
2. **Pequena variação de layout no carrossel** por ajuste do padding dos slides.
3. **Necessidade de validação visual em breakpoints próximos a `sm`** para garantir transição fluida entre mobile e desktop.

---

## 7. Observações

- Foi mantida a regra única de categoria (`getEventCategoryLabel`) sem hardcode paralelo.
- Não houve alteração de backend, banco, RLS ou contratos.
- O card comum não foi modificado; a mudança ficou concentrada no destaque e no fetch específico da vitrine da empresa.
