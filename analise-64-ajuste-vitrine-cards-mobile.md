# Análise 64 — Ajuste da vitrine pública (cards mobile)

## Diagnóstico objetivo
- **Componente do evento em destaque:** `EventCardFeatured` (renderizado dentro de `EventsCarousel`).
- **Componente dos eventos comuns:** `EventCard`.
- **Origem do WhatsApp com potencial de colisão:** coexistência de duas abordagens:
  1. CTA secundário dentro dos cards (link de ajuda);
  2. botão global flutuante em `PublicLayout` (`FloatingWhatsApp`, fixo na viewport).
- **Sintoma no mobile:** o CTA principal do destaque ficava absoluto no canto inferior direito do banner, forçando `padding-right` no conteúdo e gerando disputa visual com nome/preço; além disso, o botão global flutuante podia disputar atenção/área com cards durante scroll.

## Causa raiz
1. **Card destaque:** CTA primário posicionado de forma absoluta dentro da área visual do banner, com espaço horizontal reservado (`pr-32`), o que reduz legibilidade em larguras menores.
2. **Vitrine pública:** botão global de WhatsApp fixo na viewport também presente nas páginas de listagem, concorrendo com CTAs dos próprios cards.

## Componentes alterados
- `src/components/public/EventCardFeatured.tsx`
- `src/components/public/EventCard.tsx`
- `src/components/layout/PublicLayout.tsx`

## Decisão tomada para o WhatsApp
- Mantido como ação secundária contextual nos cards.
- Ocultado como botão flutuante global nas rotas de listagem pública (`/eventos` e `/empresa/:slug`) para reduzir ruído e evitar colisão visual no mobile.
- No card destaque, adicionada versão mobile discreta do link de WhatsApp separada do CTA principal.

## Decisão tomada para o CTA principal
- **Card destaque (mobile):** CTA passou a ocupar linha própria com largura total, mantendo destaque comercial sem sobrepor conteúdo essencial.
- **Cards comuns:** CTA mantido no rodapé do card, com rótulo mais direto para compra (`Comprar passagem`).

## Validação mobile e desktop
- Mobile: melhoria de hierarquia visual no destaque (nome/preço/CTA em ordem clara), menor competição com WhatsApp global.
- Desktop: preservado comportamento geral do layout; CTA do destaque permanece em posição lateral no desktop (`sm+`).

## Riscos residuais
- Ocultar WhatsApp flutuante em listagens públicas pode reduzir uso desse atalho por usuários que preferem contato global; mitigado pela manutenção de ações de WhatsApp contextuais no conteúdo.
