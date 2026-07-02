## Diagnóstico

A rede de segurança iOS já existe em `src/lib/ticketPdfGenerator.ts` (`patchCriticalRegionsForIOS`), mas ela só redesenha uma região quando `isRegionMostlyBlank` detecta >92% de pixels **brancos ou transparentes**. Comparando as duas imagens enviadas:

- **Logo SmartBus (iPhone):** a área ficou totalmente vazia sobre o fundo azul-escuro (`#0b1220`) da passagem. Como esses pixels não são brancos nem transparentes, o detector atual não classifica a região como "em branco" e o overlay nunca dispara. Por isso a logo simplesmente some no iPhone.
- **Logo da empresa (iPhone):** a imagem aparece, mas esticada/deformada. O detector também não dispara (a região não está branca), então o overlay não corrige a distorção causada pelo WebKit renderizando o `<img>` dentro do `<foreignObject>` do html-to-image com dimensões erradas.

QR Code segue funcionando porque a caixa dele é branca — quando falha, ela realmente fica branca e o detector funciona.

## Correção proposta (mínima, só afeta iOS)

Alterar apenas `src/lib/ticketPdfGenerator.ts`. Nenhuma mudança em componentes, layout, WhatsApp, QR, dados ou visual Android/desktop.

### 1. Ampliar `isRegionMostlyBlank` para detectar "região chapada"

Além de branco/transparente (>92%), considerar também região "uniforme" (baixíssima variância de cor) — isso cobre o caso da logo SmartBus sumindo sobre o fundo azul-escuro. Mantém o comportamento atual do QR (caixa branca continua sendo detectada) e não afeta desktop/Android porque a função só roda dentro de `patchCriticalRegionsForIOS`, que já tem guard `if (!isIOSLikeDevice()) return`.

### 2. Forçar overlay incondicional das duas logos no iOS

Para `company-logo` e `smartbus-logo`, remover a dependência da detecção "em branco" no caminho iOS e sempre reaplicar o overlay a partir do elemento fonte via `imageUrlToDataUrl(url, true)` + `drawContain`. Isso:

- Corrige a logo da empresa deformada (redesenha respeitando `object-contain`).
- Corrige a logo SmartBus ausente (redesenha por cima da área vazia).
- Custo: dois `drawImage` extras somente em iPhone/iPad. Zero impacto Android/desktop (função é no-op fora de iOS).
- Preserva padding/borda arredondada da caixa branca da logo da empresa porque `drawContain` só desenha dentro do retângulo do `[data-ticket-company-logo-box]`, sem tocar no fundo já capturado.

QR Code continua sob detecção condicional (só overlay se estiver branco), porque a conversão canvas→img no clone já é confiável e não queremos re-renderizar QR desnecessariamente.

### 3. Não mexer em nada além disso

- Sem alterações em `TicketCard.tsx`.
- Sem novo fluxo de PDF paralelo.
- Fonte de verdade continua sendo a passagem virtual clonada.
- `waitForTicketExportAssets`, `inlineImportantImagesForExport`, `replaceCanvasWithImagesForExport` permanecem como estão.

## Validação

1. Typecheck.
2. Testar geração de PDF em iPhone real (Safari) na página `/consultar-passagens` com uma passagem paga — confirmar que a logo da empresa aparece sem deformação e a logo SmartBus aparece igual ao Android.
3. Confirmar em Android e desktop que o PDF continua idêntico (função de patch é no-op fora de iOS).
4. Confirmar QR Code, botão WhatsApp e demais dados intactos.

## Arquivo alterado

- `src/lib/ticketPdfGenerator.ts` (único arquivo — mudanças isoladas em `patchCriticalRegionsForIOS` e sua estrutura de specs).
