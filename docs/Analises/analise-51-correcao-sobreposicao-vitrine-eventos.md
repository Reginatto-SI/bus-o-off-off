# Tarefa: Correção de sobreposição visual na tela pública de eventos (/eventos)

## Contexto
Foi observado no viewport móvel da página pública de eventos que o bloco superior (título “Passagens disponíveis” + microcopy) aparenta conflito visual com o primeiro card de destaque do carrossel.

## Diagnóstico
### Sintoma
- Sensação de “texto estourando/sobrepondo” na dobra superior da tela.
- No card de destaque, o conteúdo textual e CTA competem por espaço no banner em dispositivos menores.

### Onde ocorre
- Página: `/eventos`
- Componentes envolvidos:
  - `src/pages/public/PublicEvents.tsx`
  - `src/components/public/EventsCarousel.tsx`
  - `src/components/public/EventCardFeatured.tsx`

### Evidência técnica (código)
- O card usa `AspectRatio` fixo de `16/9` em todos os breakpoints.
- O conteúdo do overlay é absoluto (`absolute bottom-0`) e inclui:
  - selo
  - título
  - descrição
  - preço
  - metadados adicionais
  - CTA absoluto no canto
- Em telas pequenas, a altura efetiva do banner com ratio 16:9 pode não acomodar com folga todos esses elementos sem compressão visual.

### Causa provável
- Densidade de conteúdo no overlay acima da capacidade visual do card em mobile (ratio 16:9 + CTA fixo + metadados completos).
- O problema não está no fluxo de dados; é uma questão de layout responsivo do card em destaque.

## Correção mínima proposta
1. Tornar o card de destaque mais “alto” em mobile:
   - ratio `1:1` no mobile;
   - manter `16:9` em `sm+`.
2. Reduzir densidade textual no mobile sem alterar regra de negócio:
   - ocultar descrição auxiliar em telas pequenas;
   - ocultar metadados secundários em telas pequenas;
   - ajustar paddings e tipografia para melhorar respiro.
3. Preservar estrutura existente (sem criar novos componentes/layouts).

## Impacto esperado
- Elimina conflito visual percebido no topo da vitrine em mobile.
- Mantém padrão visual entre desktop e mobile com adaptação responsiva controlada.
- Não altera dados, queries, regras de compra, nem rotas.

## Riscos
- Card de destaque fica mais alto em mobile (mudança intencional de proporção).
- Menor volume de informação visível imediatamente no card móvel (compensado pela melhora de legibilidade e ausência de sobreposição).

## Checklist da tarefa
- [x] Não cria novo componente
- [x] Mantém padrão do projeto
- [x] Mudança mínima e localizada
- [x] Sem impacto em RLS/multi-tenant
- [x] Corrige causa visual (responsividade), não apenas sintoma
