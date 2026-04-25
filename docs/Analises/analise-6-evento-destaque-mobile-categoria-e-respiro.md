# Análise 6 — Evento em destaque no mobile: categoria incorreta + respiro visual

## 1) Resumo executivo

Foram encontrados dois problemas distintos no destaque mobile:

1. **Categoria incorreta no badge**: o card de destaque usa `getEventCategoryLabel(event.event_category)`, porém o fetch da vitrine da empresa **não seleciona** `event_category` na query de `events`. Com isso, o valor chega `undefined` e o helper cai no fallback `'Evento'`. Resultado: mesmo evento cadastrado como **Caravana** aparece como **Evento** no destaque.
2. **Visual “apertado” no mobile**: o card de destaque concentra, na mesma área do banner, múltiplos elementos simultâneos (badge de categoria, data, nome, preço, WhatsApp e CTA principal), com CTA absoluto sobre a imagem e conteúdo também absoluto no mesmo plano. Isso reduz respiro e aumenta competição visual.

---

## 2) Diagnóstico da categoria incorreta

### Origem do dado
- O destaque renderiza a categoria por `getEventCategoryLabel(event.event_category)` no `EventCardFeatured`.
- O mapper de categoria está correto e contempla `caravana`.

### Comportamento atual
- Na vitrine da empresa (`PublicCompanyShowcase`), a query de `events` seleciona campos como `id, name, date, city, image_url, unit_price...`, mas **não inclui `event_category`**.
- Como `event_category` não vem no payload, no frontend o valor fica ausente e a função de label aplica fallback `'Evento'`.

### Causa raiz
- **Causa raiz primária**: omissão de `event_category` no `select` da vitrine pública da empresa.
- **Causa raiz secundária (esperada pelo design atual)**: fallback explícito para `'Evento'` quando a categoria está ausente.

### Resposta objetiva (dado vs componente)
- O problema é **combinado**, mas com gatilho principal em dados: o dado está vindo incompleto para esse fluxo específico.
- O componente está exibindo o fallback corretamente, porém isso mascara a ausência de dado real.

---

## 3) Diagnóstico do excesso visual no mobile

### Quais elementos estão pesando
No `EventCardFeatured` mobile, ficam ativos ao mesmo tempo:
- badge de categoria;
- `DateBadge` (bloco visual forte);
- título do evento (até 2 linhas);
- preço com tipografia de destaque;
- link “Ajuda no WhatsApp” (visível no mobile);
- CTA principal “Comprar passagem” com altura fixa alta (`h-12`) e largura total.

### Por que está sem respiro
- O card usa **banner em `aspect-video`** com conteúdo textual e CTA em **posicionamento absoluto** sobre a imagem.
- O conteúdo textual já reserva espaço inferior (`pb-20`) para o botão, mas ainda assim tudo disputa a mesma área visual “sobreposta” ao banner.
- O CTA fica fixado no rodapé do card (`absolute bottom-3 left-3 right-3`), enquanto o restante do conteúdo também fica no rodapé (`absolute bottom-0 ...`), criando sensação de compressão.
- A hierarquia fica densa para mobile porque quase todo o valor semântico está no mesmo bloco de contraste alto (overlay escuro + texto branco + botão chamativo).

### Conflitos de layout observados
- **Conteúdo em excesso para a altura útil do banner** (mesmo com `aspect-video`).
- **Distribuição vertical concorrente** entre área informativa e área de ação (CTA), ambas dentro do mesmo plano absoluto.
- **Carrossel**: cada slide usa `flex-[0_0_100%]` e ainda `pl-4` (exceto o primeiro), reduzindo largura útil em slides subsequentes no mobile e reforçando sensação de aperto lateral/perceptiva.

### Resposta objetiva
- O problema visual é **combinação dos três fatores**: conteúdo em excesso + espaço útil limitado + distribuição concorrente.

---

## 4) Arquivos/componentes envolvidos

1. `src/pages/public/PublicCompanyShowcase.tsx`
   - Query da vitrine que busca eventos sem `event_category`.
2. `src/components/public/EventCardFeatured.tsx`
   - Componente do card de destaque no carrossel (mobile/desktop), com conteúdo denso sobre imagem e CTA absoluto.
3. `src/components/public/EventsCarousel.tsx`
   - Estrutura do carrossel e largura/padding dos slides.
4. `src/lib/eventCategory.ts`
   - Mapper de categoria e fallback `'Evento'`.
5. `src/components/public/EventCard.tsx`
   - Referência de regra compartilhada de categoria (usa mesmo helper), útil para comparação entre card comum e destaque.

---

## 5) Riscos

Para a futura correção, os principais riscos são:

1. **Ajustar apenas CSS sem corrigir dados** e manter categoria errada em cenários reais.
2. **Remover elementos demais** e perder conversão (ex.: eliminar CTA secundário/primário sem validar funil).
3. **Quebrar consistência entre card comum e destaque** se a regra de categoria divergir novamente.
4. **Gerar regressão em desktop** ao simplificar layout mobile sem isolamento por breakpoint.
5. **Fallback mascarar erro de payload** no futuro (dado ausente continuar invisível em monitoramento manual).

---

## 6) Recomendação de ajuste (sem implementar)

Direção mais segura e profissional:

1. **Correção mínima de categoria (obrigatória primeiro)**
   - Incluir `event_category` no `select` dos eventos da vitrine da empresa.
   - Manter `getEventCategoryLabel` como fonte única de label.

2. **Layout próprio de destaque no mobile (sem criar arquitetura nova)**
   - Manter `EventCardFeatured` como componente especial, mas com **variante visual mobile mais enxuta**.
   - Priorizar no mobile: **categoria + data + título + preço + CTA principal**.
   - Tratar “Ajuda no WhatsApp” como ação secundária menos intrusiva (ex.: fora da área principal do banner, abaixo do CTA ou em nível de seção), reduzindo disputa dentro do overlay.

3. **Redistribuir o card para gerar respiro**
   - Evitar concentração de tudo dentro da área absoluta do banner.
   - Separar claramente: bloco informativo vs bloco de ação.
   - Rever proporção do banner e espaços verticais no mobile para evitar compressão perceptiva.

4. **Preservar estratégia de destaque**
   - O destaque deve continuar diferente do card comum.
   - Objetivo: aparência premium + leitura rápida + CTA claro, com menos ruído simultâneo.

---

## 7) Dúvidas

1. Quando `event_category` vier nulo (eventos legados), a regra desejada continua sendo exibir `'Evento'` ou esconder badge até o dado ser definido?
2. O link “Ajuda no WhatsApp” no destaque mobile é requisito obrigatório de negócio no próprio card, ou pode ser movido para fora do bloco principal sem perda esperada?
3. Há métrica de conversão (CTR no CTA principal vs clique em WhatsApp) para orientar qual elemento secundário deve perder prioridade visual no mobile?

---

## Respostas objetivas solicitadas (síntese)

1. **Por que a categoria está errada?** Porque `event_category` não está sendo selecionado no fetch da vitrine da empresa; o helper cai no fallback `'Evento'`.
2. **Dado errado ou exibição errada?** Dado chega incompleto nesse fluxo; exibição aplica fallback corretamente (mas mascara o problema).
3. **O que pesa visualmente?** Categoria + data + título + preço + WhatsApp + CTA, todos na mesma área do banner.
4. **Qual tipo de problema?** Combinação de conteúdo em excesso, espaço útil curto e distribuição concorrente.
5. **Deve ter layout próprio?** Sim, o destaque mobile deve ter comportamento visual próprio e menos denso.
6. **Correção mínima mais segura?** Primeiro corrigir `select` de `event_category`; depois simplificar hierarquia mobile do `EventCardFeatured` com foco em poucos elementos prioritários.
