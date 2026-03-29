# Relatório — Ajuste de respiro do card de destaque da vitrine (2026-03-29)

## 1) Diagnóstico objetivo

### Componente responsável
- O card de destaque principal é renderizado pelo componente `EventCardFeatured`, consumido no carrossel `EventsCarousel`, dentro da seção de destaque da página `PublicCompanyShowcase`.

### Evidência do problema
- O destaque usa conteúdo textual **sobreposto ao banner** com posicionamento absoluto no rodapé.
- No mobile, categoria, `DateBadge`, título e preço estavam concentrados no mesmo bloco com pouco espaçamento vertical e com layout em linha (`flex`), reduzindo área útil para o texto.

### Causa raiz
- No mobile, havia **competição de espaço horizontal** entre o `DateBadge` (largura fixa mínima) e o bloco textual (título + preço), dentro de um contêiner sobre imagem com largura limitada.
- O título estava com tipografia grande e o preço também, ambos no mesmo fluxo curto junto ao badge de data, causando sensação de card “apertado”.

## 2) Estratégia de correção

Abordagem escolhida: **mudança mínima e segura**, sem alterar fluxo de dados e sem impactar os cards comuns.

- Reorganização interna somente no `EventCardFeatured`:
  - mobile: troca de layout horizontal para pilha vertical controlada (`flex-col`), mantendo desktop com padrão atual (`sm:flex-row`)
  - aumento leve de respiro (`space-y`) no bloco principal
  - ajuste fino de tipografia no mobile (`title` e `price`) para reduzir colisão visual
  - inclusão de cidade no mobile dentro do bloco principal para manter contexto sem sobrecarregar metadados desktop
- Desktop foi preservado com a mesma composição e CTA sobre o banner.

## 3) Arquivos alterados

- `src/components/public/EventCardFeatured.tsx`
  - ajustes de espaçamento, empilhamento responsivo e hierarquia visual no conteúdo do card de destaque
  - comentários curtos adicionados nas áreas de responsividade/hierarquia para manutenção futura

## 4) Checklist de validação visual

- [x] Card de destaque sem sobreposição de texto no mobile
- [x] Leitura visual mais limpa e profissional
- [x] Categoria, data, título e preço com hierarquia mais clara
- [x] Ajuste mobile sem quebrar desktop
- [x] Demais cards da vitrine não alterados
- [x] Nenhuma lógica de dados/consulta alterada
- [x] Comentários técnicos adicionados no código alterado

## 5) Risco e impacto

- **Risco baixo**: alteração localizada em UI (`EventCardFeatured`) e apenas em classes/utilização de layout responsivo.
- **Sem impacto** em regras de negócio, consultas Supabase, filtros ou renderização dos cards padrão (`EventCard`).

## 6) Validação adicional solicitada (4 cenários)

- [x] **Título muito longo**: mantido `line-clamp-2` com `break-words` no título para impedir colisão com data/preço em mobile.
- [x] **Cidade com nome grande**: cidade no mobile limitada com `line-clamp-1` e `leading-snug` para evitar crescimento vertical descontrolado.
- [x] **Título grande + preço grande**: preço do mobile ajustado para `text-lg` e `leading-tight`, reduzindo disputa com o bloco do título.
- [x] **Desktop elegante e balanceado**: estrutura `sm:flex-row`, metadados desktop e CTA sobre banner foram preservados sem alterações de fluxo.

## 7) Ajuste fino final de respiração (mobile)

- [x] Aumento leve de respiro no bloco principal do destaque (`space-y-3.5` + `pb-4`) apenas no mobile.
- [x] Separação mais clara entre badge de categoria e bloco principal com `mt-1` no conteúdo principal (zerado no desktop com `sm:mt-0`).
- [x] Sem alteração de layout estrutural, tipografia, desktop ou outros cards.
