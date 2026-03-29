# Análise 1 — Padronização de Banner de Eventos (Vitrine e Cards)

## 1. Resumo executivo
Hoje o fluxo de banner está inconsistente entre **cadastro** e **exibição**.

- No admin, o usuário é guiado para padrão **1:1 (1080×1080)**, com miniatura e pré-visualização quadradas.
- Na vitrine pública, os cards usam proporções **retangulares e variáveis por componente/breakpoint**.
- Como a imagem principal é renderizada com `object-contain` dentro desses containers retangulares, a plataforma evita deformação, mas gera **letterbox/pillarbox** (áreas vazias preenchidas por blur de fundo), percepção de corte/encaixe inconsistente e sensação visual imprevisível entre cards.

Conclusão executiva: o padrão real atual é **entrada quadrada + saída mista (16:10, 3:2, 4:5, 16:9)**, o que explica a inconsistência percebida.

---

## 2. Como funciona hoje (upload → renderização)

### 2.1 Upload no admin (tela de eventos)

1. O campo de banner no modal de evento exibe orientação explícita de formato quadrado:
   - “Adicionar banner (1080×1080)”
   - “1:1 com contain, sem cortes”.
2. A miniatura do banner no formulário é quadrada (`h-40 w-40`/`lg:h-44 lg:w-44`) e usa:
   - camada de fundo blur (`object-cover`)
   - imagem principal com `object-contain`.
3. A pré-visualização expandida também é quadrada (`aspect-square`) com o mesmo padrão blur + `contain`.
4. No upload:
   - Se o evento ainda não existe, o arquivo fica pendente em memória (`pendingImageFile`) e a URL local é usada como preview.
   - Ao salvar evento novo, o arquivo é enviado para bucket `event-images`, gera `publicUrl` e persiste em `events.image_url`.
   - Em edição de evento existente, upload e persistência de `image_url` ocorrem imediatamente.

### 2.2 Validação no upload

- Não há validação explícita de proporção (ex.: 1:1, 16:9).
- Também não há validação explícita de resolução mínima/máxima para banner no fluxo de eventos.
- O `input` aceita `image/*`, então qualquer proporção pode entrar.

### 2.3 Renderização pública (vitrine/cards)

- **Card padrão (`EventCard`)**:
  - container `aspect-[16/10]` no mobile e `sm:aspect-[3/2]` em telas maiores.
  - imagem principal com `object-contain`.
- **Card destaque (`EventCardFeatured`)**:
  - container `aspect-[4/5]` no mobile e `sm:aspect-[16/9]` em telas maiores.
  - imagem principal com `object-contain`.
- Ambos usam uma camada de blur de fundo para “preencher” área que sobra quando a proporção da imagem não bate com o container.

---

## 3. Causa raiz (por que está quebrando)

A causa raiz é a combinação de três fatores:

1. **Padrão de entrada fixado como 1:1 (UX/admin)**.
2. **Saída com múltiplas proporções retangulares e responsivas (frontend público)**.
3. **Estratégia de encaixe com `object-contain`** (preserva imagem sem deformar, porém revela sobras visuais quando proporções divergem).

Resultado técnico:
- Não é “deformação” por `stretch` (não há `object-fill`), mas sim inconsistência de composição visual.
- A experiência muda conforme componente e breakpoint (ex.: `EventCard` vs `EventCardFeatured`), reforçando a sensação de falta de padrão.

---

## 4. Pontos exatos no código

## Upload/admin

- `src/pages/admin/Events.tsx`
  - Upload pendente e persistência em `event-images` + `events.image_url`.
  - Texto de orientação “Adicionar banner (1080×1080)” e “1:1 com contain, sem cortes”.
  - Miniatura quadrada no form (`h-40 w-40` etc.) com `object-contain`.
  - Prévia quadrada no modal (`aspect-square`).

## Exibição pública

- `src/components/public/EventCard.tsx`
  - Proporção do banner no card: `aspect-[16/10] sm:aspect-[3/2]`.
  - Imagem principal com `object-contain`.

- `src/components/public/EventCardFeatured.tsx`
  - Proporção do banner no destaque: `aspect-[4/5] sm:aspect-[16/9]`.
  - Imagem principal com `object-contain`.

- `src/components/public/EventsCarousel.tsx`
  - Renderiza `EventCardFeatured` no carrossel de destaque.

- `src/pages/public/PublicEvents.tsx` e `src/pages/public/PublicCompanyShowcase.tsx`
  - Renderizam grids com `EventCard`.
  - `PublicCompanyShowcase` também renderiza o carrossel de destaque (`EventsCarousel`).

---

## 5. Riscos

### Se mantiver como está
- Continuidade de inconsistência visual entre eventos.
- Maior dependência da “sorte” da imagem enviada (cada proporção reage diferente nos cards).
- Percepção de produto menos profissional em mobile (onde há maior variação de proporção entre componentes).

### Se ajustar para padrão único (futuro)
- Risco de alterar percepção visual de eventos já cadastrados (principalmente imagens antigas 1:1).
- Necessidade de revisar apenas pontos de vitrine para evitar regressão em telas administrativas que usam preview quadrado.

---

## 6. Viabilidade de correção mínima (sem implementar agora)

Sim, é viável com mudança mínima e localizada.

A direção proposta (padrão único retangular 16:9, mobile-first, container fixo + `cover`) é tecnicamente compatível com o código atual porque:

- Os containers já usam `aspect-*` em Tailwind.
- Os componentes críticos estão concentrados em poucos arquivos (`EventCard`, `EventCardFeatured`).
- O fluxo de dados (`events.image_url`) já está unificado e não exige mudança de contrato.

Observação importante de viabilidade:
- Para manter consistência real ponta a ponta, o texto/orientação do admin precisará ser alinhado ao padrão final escolhido (hoje está 1:1). Sem isso, o conflito semântico continua mesmo após ajuste visual da vitrine.

---

## 7. Dúvidas objetivas antes de qualquer alteração

1. A decisão de padrão final será **16:9 para todos os cards públicos** (incluindo destaque), ou haverá exceção para algum bloco?
2. O admin deve passar a orientar upload em 16:9 (substituindo “1080×1080”) já na mesma entrega?
3. Existe necessidade de preservar, por regra de negócio, o comportamento atual de `object-contain` em alguma superfície específica?
4. Eventos legados com imagem quadrada devem priorizar:
   - preenchimento total (com possível corte via `cover`), ou
   - preservação total da imagem (com barras/blur via `contain`)?

Sem essa definição, qualquer ajuste pode resolver uma percepção e abrir outra.
