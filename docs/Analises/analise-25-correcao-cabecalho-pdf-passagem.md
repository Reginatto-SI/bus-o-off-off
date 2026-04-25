# Análise 25 — correção do cabeçalho do PDF da passagem

## Objetivo
Aplicar a menor correção possível para impedir que o nome da empresa seja cortado no cabeçalho da passagem virtual exportada em PDF, preservando o template único já reutilizado pelo sistema.

## Causa raiz confirmada
A causa raiz principal estava no cabeçalho compartilhado do componente `TicketCard`: o nome da empresa era renderizado com `truncate`, o que força `overflow: hidden`, `text-overflow: ellipsis` e `white-space: nowrap`. Como o PDF é gerado a partir do DOM real desse card via `html2canvas`, o corte visual já nascia no layout base e apenas ficava mais evidente no arquivo exportado.

Também havia um risco residual no renderizador alternativo `ticketVisualRenderer`: ele desenhava o nome da empresa com `fillText` em linha única e reposicionava o restante do cabeçalho com altura fixa. Isso podia voltar a cortar nomes longos caso a exportação precisasse usar o fallback em canvas.

## Arquivos analisados
- `src/components/public/TicketCard.tsx`
- `src/components/public/PassengerTicketList.tsx`
- `src/pages/public/Confirmation.tsx`
- `src/pages/public/TicketLookup.tsx`
- `src/pages/admin/Sales.tsx`
- `src/components/admin/NewSaleModal.tsx`
- `src/lib/ticketPdfGenerator.ts`
- `src/lib/ticketVisualRenderer.ts`

## Arquivos alterados
- `src/components/public/TicketCard.tsx`
- `src/lib/ticketVisualRenderer.ts`

## Estratégia usada
1. Confirmar a fonte de verdade da passagem virtual.
2. Confirmar se o PDF reutiliza o mesmo template visual.
3. Remover apenas o comportamento de truncamento no cabeçalho compartilhado.
4. Reforçar o fallback de exportação em canvas para seguir a mesma regra de quebra de linha.

## Por que a correção foi feita nesse ponto
A passagem virtual do sistema é centralizada no `TicketCard`, reutilizado por `PassengerTicketList` em fluxos públicos e administrativos. O PDF individual também usa esse mesmo card como origem quando chama `generateTicketPdf(...)` com `ticketElement`, capturado por `html2canvas`.

Logo, corrigir o cabeçalho no `TicketCard` é o ponto central e mais seguro para refletir em tela e no PDF sem criar template paralelo. O ajuste em `ticketVisualRenderer` foi mantido mínimo e complementar para não deixar o fallback divergente do padrão oficial.

## Impactos esperados
- O nome da empresa deixa de ser truncado no card da passagem.
- O PDF individual passa a refletir o mesmo comportamento, mostrando quebra de linha em vez de corte.
- CNPJ, local e contatos continuam abaixo do nome sem sobreposição.
- Fluxos público, consulta de passagem, confirmação, venda manual e visualização administrativa passam a herdar o mesmo ajuste porque todos reutilizam o template compartilhado.

## Validações executadas
- Inspeção do encadeamento `TicketCard` -> `PassengerTicketList` -> telas públicas e administrativas.
- Inspeção do pipeline `TicketCard` -> `generateTicketPdf` -> `html2canvas`.
- Inspeção do fallback `generateTicketPdf` -> `renderTicketVisual`.
- `npm run build`
- `npm run lint`

## Riscos residuais
- Nomes empresariais extremamente longos ainda podem aumentar a altura visual do cabeçalho, mas agora sem perda de informação.
- Não foi gerada captura automatizada de tela neste ambiente porque a ferramenta de browser/screenshot solicitada nas instruções não estava disponível nesta sessão.
