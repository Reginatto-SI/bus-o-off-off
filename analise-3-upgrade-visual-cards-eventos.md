# Análise 3 — Upgrade visual dos cards de eventos

## 1. Resumo executivo
Esta etapa elevou o acabamento visual dos cards de eventos sem alterar arquitetura, fluxo de dados ou regras de negócio.

A estratégia foi aproveitar o que já estava mais forte no projeto (landing + destaque) e aplicar refinos pontuais de hierarquia visual (banner, tipografia, badges, profundidade e CTA) nos cards de:
- público (`/eventos`)
- vitrine da empresa (`/empresa/:slug`)
- admin (`/admin/eventos`)
- landing (mantida como referência visual já premium)

---

## 2. Diagnóstico atual
Antes dos ajustes, os principais pontos que reduziam percepção premium eram:

1. **Card público padrão com topo “plano”**
   - Banner sem reforço de contraste visual.
   - Menor sensação de profundidade e destaque comercial.

2. **Hierarquia de texto moderada**
   - Título e preço já legíveis, porém sem o mesmo nível de ênfase dos blocos mais comerciais da landing.

3. **Informações secundárias dispersas**
   - Local e empresa com organização funcional, mas com pouco agrupamento visual.

4. **Admin operacional com acabamento simples**
   - Excelente para operação, porém visualmente menos consistente com o nível de acabamento público.

---

## 3. Estratégia escolhida
Foi adotada uma estratégia de **mínima intervenção com maior ganho perceptivo**:

- Reaproveitar base existente dos componentes (`EventCard`, `EventCardFeatured` e cards do admin), sem criar novos componentes.
- Aplicar micro-refinos inspirados na landing:
  - sombra e borda mais sofisticadas
  - hover mais suave e consistente
  - reforço de contraste no banner com gradiente discreto
  - tipografia mais forte para título e preço
  - badges/chips com acabamento mais intencional
- Manter textos, dados, fluxo de compra e estrutura geral dos cards.

---

## 4. Arquivos ajustados

- `src/components/public/EventCard.tsx`
- `src/components/public/EventCardFeatured.tsx`
- `src/pages/admin/Events.tsx`
- `analise-3-upgrade-visual-cards-eventos.md`

> Observação: `PublicEvents` e `PublicCompanyShowcase` já reutilizam `EventCard`/`EventCardFeatured`, então herdaram os refinos sem duplicação.

---

## 5. Antes vs depois

### Antes
- Banner com leitura boa, porém menos “vendedora” no card comum.
- Hierarquia de título/preço funcional, mas menos enfática.
- Menor sensação de profundidade premium em borda/sombra/hover.
- Admin com foco operacional, porém abaixo do padrão visual público.

### Depois
- Banner com contraste melhor (gradiente suave) e presença visual maior.
- Título e preço com reforço tipográfico para leitura rápida e valor comercial.
- Chips e badges com aparência mais intencional e consistente.
- Card público e destaque com linguagem visual mais próxima da landing.
- Admin com acabamento mais premium, mantendo clareza operacional.

---

## 6. Riscos

1. **Percepção de destaque maior no topo**
   - O gradiente no banner foi mantido leve para evitar escurecimento excessivo da imagem.

2. **Aumento discreto de “peso visual”**
   - Sombras e bordas foram refinadas com moderação para preservar simplicidade do sistema.

3. **Eventos com imagens muito escuras**
   - Pode haver percepção de contraste mais forte, embora dentro de nível controlado.

---

## 7. Observações

- Não houve alteração em backend, RLS, contratos ou regras de negócio.
- Não foram criados novos componentes nem arquitetura paralela.
- O foco foi qualidade visual e consistência cross-tela com mudanças locais e seguras.
