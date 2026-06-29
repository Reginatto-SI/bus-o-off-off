
## Diagnóstico

O fluxo "Salvar PDF" já passa pelo caminho correto (`TicketCard.handleDownloadPdf` → `generateTicketPdf` com `ticketElement` do `ticketContainerRef`), e já faz clone offscreen com `ticket-export-mode` e exclusão de `data-pdf-exclude`. Portanto o problema **não** é fallback nem botão errado.

A causa real é o motor de captura: **`html2canvas` não suporta bem o layout atual da passagem**. A passagem usa:

- variáveis CSS modernas (`hsl(var(--ticket-bg))`, `--ticket-accent`, etc.)
- grids com `grid-cols-[112px_minmax(0,1fr)]`
- ícones SVG do `lucide-react`
- bordas/divisores com cor via `bg-[hsl(var(--ticket-accent))]/40`
- `QRCodeCanvas` (canvas nativo)
- logos remotos (logo da empresa)

`html2canvas` reimplementa o engine de layout em JS e tropeça em vários desses itens — daí o PDF "parecido mas diferente" (cores deslocadas, alturas erradas, logo distorcida, espaçamento estranho, conteúdo cortado). Uma extensão do Chrome funciona bem porque captura o DOM real renderizado.

A correção definitiva é **trocar o motor de captura** para `html-to-image`, que serializa o DOM dentro de um `<foreignObject>` SVG e deixa o próprio navegador renderizar — produzindo uma imagem fiel da passagem virtual, exatamente como uma extensão de "screenshot do elemento".

## Mudanças

### 1. `package.json`
Adicionar dependência `html-to-image` (mantemos `jspdf`; `html2canvas` pode permanecer instalado e ser removido depois para não ampliar o escopo).

### 2. `src/lib/ticketPdfGenerator.ts` (reescrita do caminho com `ticketElement`)
- Substituir `html2canvas` por `htmlToCanvas` do `html-to-image`.
- Manter a estratégia atual de:
  - `waitForTicketExportAssets` (fonts + imagens + QR canvas via `requestAnimationFrame` duplo).
  - Clonar offscreen o `ticketElement`, copiar pixels do `<canvas>` do QR para o clone (`copyCanvasPixelsToClone`), aplicar `applyTicketExportMode` (esconder `data-pdf-exclude`/`data-export-hidden`, fixar caixa do logo 112×112 com `object-contain`, normalizar tipografia do rodapé).
  - Anexar o clone em host offscreen com largura real do `ticketElement` em tela.
- Capturar o clone com `htmlToImage.toCanvas(clone, { pixelRatio: Math.max(2, devicePixelRatio), cacheBust: true, backgroundColor: '#0b1220', skipFonts: false, filter: (n) => !(n instanceof HTMLElement) || n.dataset?.pdfExclude !== 'true' && n.dataset?.exportHidden !== 'true' })`.
- Gerar `jsPDF` com `format: [canvas.width, canvas.height]` (px), `addImage` em tamanho 1:1 (já é como funciona hoje, sem reescala → não corta nem distorce).
- Manter o nome do arquivo e o log opt-in.
- Manter o fallback `renderTicketVisual` apenas quando `ticketElement` for `null` (não regredir uso fora da UI).

### 3. `src/components/public/TicketCard.tsx` (mínimo)
- Adicionar `data-export-hidden="true"` / confirmar `data-pdf-exclude="true"` nos botões já existentes (Salvar PDF, Salvar só QR Code, Copiar código, Atualizar status). Hoje já estão; só revisar para garantir que **toda** ação interativa fique marcada.
- Sem mudanças visuais na passagem em tela.

### 4. Sem mudanças em
- Pagamento, Asaas, webhook, verify, status da venda, checkout, QR token, consulta por CPF, schema do banco, layout da passagem virtual.

## Como isso atende o critério "fiel à passagem virtual"

`html-to-image` rasteriza o DOM clonado via SVG `<foreignObject>` no próprio navegador, então:

- Cores `hsl(var(--ticket-*))` resolvem normalmente.
- Grids/flex modernos respeitam a engine real.
- Ícones `lucide-react` (SVG inline) saem nítidos.
- O QR Code é copiado pixel-a-pixel do canvas em tela para o clone antes da captura.
- A logo da empresa é capturada com `object-contain` dentro da caixa 112×112 (sem distorção).
- O PDF recebe a imagem em tamanho real do clone (largura do ticket em tela), sem reescala que corte rodapé.

## Verificação

- `bun add html-to-image` (instalação automática re-inicia o dev server).
- Build do projeto (executado pelo harness).
- Playwright contra `localhost`: abrir `/consultar-passagens`, restaurar sessão se necessário, abrir uma passagem paga, clicar "Salvar PDF", interceptar o download e renderizar o PDF para JPEG via `pdftoppm`, comparar visualmente com screenshot da passagem em tela. Repetir o teste em uma passagem aberta dentro do admin.
- Confirmar via inspeção visual: botões ausentes no PDF, QR presente, logo sem distorção, rodapé inteiro, sem corte.

## Arquivos alterados

- `package.json` (+ `bun.lockb` / `package-lock.json` automático)
- `src/lib/ticketPdfGenerator.ts`
- `src/components/public/TicketCard.tsx` (apenas marcação de exclusão, se faltar em algum botão)
