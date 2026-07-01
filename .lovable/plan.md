
# Correção iPhone — QR Code e logos em branco no PDF

## Causa provável

Em alguns iPhones (Safari/WebView/PWA), o `html-to-image` serializa o DOM dentro de um `<foreignObject>` SVG. O WebKit tem limitações conhecidas nesse caminho:

- `<img>` com URL externa (CDN/Storage) às vezes é rasterizada como área branca mesmo já estando `complete`, quando a mesma URL foi servida antes por cache/service-worker com respostas "opaque".
- `<canvas>` (QR Code) dentro de `<foreignObject>` costuma sair vazio no iOS — hoje já substituímos por `<img data:...>`, mas se o `toDataURL` roda antes da pintura estável em algumas versões do iOS, sai branco.
- Cache de imagem cross-origin do PWA pode entregar uma resposta sem CORS válidos, o que faz o WebKit "sujar" o `<foreignObject>` e apagar apenas essas regiões.

Ou seja: o motor atual está correto para desktop/Android, mas o iOS precisa de uma **rede de segurança pós-captura**.

## Estratégia adotada

Combinar **Estratégia A (validação)** + **Estratégia C (overlay pós-captura)** somente no iOS. O motor `html-to-image` continua sendo o único caminho; nada muda em desktop/Android.

Fluxo no iPhone/iPad:

1. Capturar normalmente com `html-to-image` (como hoje).
2. Antes de gerar o PDF, medir as regiões críticas no canvas final.
3. Se alguma região estiver "branca/vazia", redesenhar a imagem correta em cima do canvas.
4. Gerar o PDF a partir do canvas corrigido.

Se a validação passar, entrega o canvas original — comportamento idêntico ao atual.

## Marcação no DOM (apenas atributos, sem CSS/layout novo)

`src/components/public/TicketCard.tsx`:

- QR Code (ambos `QRCodeCanvas` visíveis): adicionar `data-ticket-qr-canvas="true"` no canvas e envolver com o `div` já existente marcado como `data-ticket-qr-box="true"`.
- Bloco SmartBus (linha 396): adicionar `data-smartbus-logo="true"` no `<img>` do logo branco. Container já tem `data-smartbus-platform-card="true"`.
- Logo da empresa: já existe `data-ticket-company-logo-box` e `data-ticket-company-logo`.

Esses atributos existem apenas para o exportador localizar as regiões — sem impacto visual.

## Alterações em `src/lib/ticketPdfGenerator.ts`

### 1. Detecção iOS (já existe `isIOSLikeDevice`)

Usar a mesma helper.

### 2. Nova função `validateAndPatchCriticalRegions(canvas, sourceElement, clone, pixelRatio)`

Somente executada quando `isIOSLikeDevice()`. Recebe o `HTMLCanvasElement` retornado por `htmlToCanvas`.

Para cada região crítica:

- QR Code: seletor `[data-ticket-qr-box="true"]` no clone offscreen (posição relativa ao clone), usando `getBoundingClientRect` do clone e o `pixelRatio` da captura para mapear para coordenadas do canvas final.
- Logo da empresa: `[data-ticket-company-logo-box="true"]`.
- Card SmartBus: `[data-smartbus-platform-card="true"]` (ou apenas `[data-smartbus-logo="true"]` para redesenhar só o logo).

Para cada região:

1. Extrair pixels via `ctx.getImageData(x, y, w, h)`.
2. Calcular métrica de "branco" — porcentagem de pixels com luminância > 245 e alpha > 250. Se > 92%, considerar região corrompida.
3. Obter a imagem fonte:
   - QR Code: já temos o canvas real (`qrRef.current` do TicketCard, acessível via `sourceElement.querySelector('canvas[data-ticket-qr-canvas]')`). Gerar `toDataURL('image/png')` a partir dele.
   - Logo empresa: `sourceElement.querySelector('[data-ticket-company-logo]')` — refazer `fetch` com `cache: 'no-store'` e converter em dataURL (cache-bust apenas nesse retry, evitando o cache PWA que causou o branco).
   - Logo SmartBus: `/logo-branca2.png` local do bundle — carregar com cache-bust `?v=timestamp`.
4. Desenhar a imagem na região do canvas final via `ctx.drawImage(img, x, y, w, h)` mantendo `object-fit: contain` (calcular escala).

### 3. Loop de validação com 1 nova tentativa opcional

Se após overlay ainda houver região crítica em branco (falha total ao carregar), logar warning mas seguir entregando — melhor um QR desenhado localmente do que nada. O QR sempre vem do próprio canvas em memória, então nunca depende de rede.

### 4. Preservar caminho não-iOS

Nenhuma chamada nova acontece fora de `isIOSLikeDevice()`. Desktop/Android seguem exatamente o fluxo atual.

## Cache-bust seguro (apenas iOS, apenas no clone)

Na função `inlineImportantImagesForExport`, quando `isIOSLikeDevice()`, adicionar `?_pdf=${Date.now()}` ao `fetch` da URL externa (mantendo `mode: 'cors'`, mas `cache: 'no-store'`). Isso força o WebKit a buscar uma resposta com headers CORS "frescos", evitando reuso de resposta opaca do PWA.

## O que NÃO muda

- `html-to-image` continua sendo o motor único.
- Desktop e Android: nenhum caminho alterado.
- Fluxo Web Share / preview no iOS: intacto.
- Layout da passagem virtual: intacto (só atributos `data-*` novos).
- QR token, dados de venda, checkout, Asaas, webhook, status: intactos.

## Arquivos alterados

- `src/components/public/TicketCard.tsx` — adicionar `data-ticket-qr-box`, `data-ticket-qr-canvas`, `data-smartbus-logo` (atributos apenas).
- `src/lib/ticketPdfGenerator.ts` — nova função `patchCriticalRegionsForIOS`, chamada logo após `htmlToCanvas`; cache-bust condicional no iOS em `inlineImportantImagesForExport`.

## Testes

- Desktop Chrome/Firefox: PDF idêntico ao atual.
- Android Chrome: PDF idêntico ao atual.
- iPhone Safari: QR/logos aparecem no PDF mesmo quando a captura inicial teria vindo branca.
- iPhone PWA instalado: idem, sem exigir reinstalar.
- `/admin/vendas` e `/consultar-passagens`.
- Passagem com e sem logo de empresa.
- Passagem cancelada (QR com opacidade — a validação ignora `isReservedReceipt` corretamente).

## Limitações conhecidas restantes

- Se a imagem da empresa estiver realmente offline (404), o overlay não consegue redesenhar; o PDF sai com o placeholder capturado — melhor que branco silencioso. Um warning é logado.

## Critério de aceite

PDF no iPhone nunca mais sai com QR Code, logo SmartBus ou logo da empresa em branco, sem regressão em desktop/Android.
