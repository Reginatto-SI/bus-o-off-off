# Análise 2 — Correção de banners de eventos (padronização 16:9)

## 1. O que foi alterado
Foi aplicada padronização visual de banners para **16:9** nos pontos de exibição solicitados, removendo a composição com blur artificial e substituindo o encaixe por `object-cover`.

Também foi ajustada a orientação textual de upload no admin para refletir o novo padrão:
- “Banner do evento”
- “Recomendado: 1280×720 (formato horizontal). A imagem será ajustada automaticamente para melhor visualização.”

A lógica de dados/upload foi preservada (bucket `event-images` e campo `events.image_url` sem mudanças estruturais).

---

## 2. Componentes ajustados

- `src/components/public/EventCard.tsx`
  - Banner do card padronizado para `aspect-video` (16:9 fixo)
  - Imagem principal alterada para `object-cover`
  - Remoção do fundo blur usado como letterbox

- `src/components/public/EventCardFeatured.tsx`
  - Banner destaque padronizado para `aspect-video` (16:9 fixo)
  - Imagem principal alterada para `object-cover`
  - Remoção do fundo blur; overlay de legibilidade mantido

- `src/pages/admin/Events.tsx`
  - Card de evento da listagem admin alterado para `aspect-video` + `object-cover`
  - Remoção do blur no card da listagem
  - Ajuste dos textos de orientação do upload para padrão 16:9

- `src/pages/public/LandingPage.tsx`
  - Bloco de eventos mockados alinhado ao padrão 16:9 (`aspect-video`) com imagem `object-cover`

---

## 3. Antes vs depois

### Antes
- Upload guiado para 1:1 (1080×1080)
- Exibição com múltiplas proporções por componente/breakpoint
- Uso de `object-contain` em banners de evento
- Presença de blur artificial para preencher sobras
- Resultado: variação visual entre telas e percepção de inconsistência

### Depois
- Exibição padronizada em 16:9 nos pontos alterados
- `object-cover` preenchendo 100% do container
- Sem barras/letterbox e sem fundo blur artificial nesses banners
- Upload orientado para 1280×720 (horizontal)
- Resultado: leitura visual mais previsível e consistente entre admin/vitrine/listagens

---

## 4. Riscos

1. **Eventos legados com arte centrada em 1:1**
   - Com `object-cover`, pode haver corte leve lateral/superior-inferior dependendo da composição da imagem.

2. **Percepção de enquadramento**
   - Alguns banners antigos podem parecer “mais aproximados” que antes, por abandonar `contain`.

3. **Landing mock**
   - O bloco fake da landing agora segue 16:9 estrito; isso melhora consistência, mas altera discretamente a altura visual do topo do card.

---

## 5. Observações

- Não houve alteração de backend, RLS, contratos ou estrutura de dados.
- Não foram criados novos componentes.
- A mudança ficou localizada no escopo solicitado (admin eventos + cards públicos + landing de eventos).
- O preview interno do modal de edição no admin não foi refatorado de forma ampla (mantida simplicidade), conforme orientação de prioridade.
