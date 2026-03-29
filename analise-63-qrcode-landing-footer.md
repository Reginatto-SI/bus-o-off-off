# Análise 63 — QR Code oficial no rodapé da landing

## Objetivo da mudança
Adicionar, na coluna **Institucional** do rodapé da landing pública, uma ação para abrir modal e baixar o QR Code oficial da SmartBus BR em **SVG** e **PNG**, apontando sempre para `https://www.smartbusbr.com.br/`.

## Arquivos alterados
- `src/pages/public/LandingPage.tsx`
- `analise-63-qrcode-landing-footer.md`

## Abordagem escolhida
- Reaproveitado o modal já existente no projeto (`Dialog`/`DialogContent` de `@/components/ui/dialog`).
- Reaproveitado o pacote já instalado `qrcode.react` para renderização do QR no modal.
- Reaproveitados os utilitários existentes de exportação de QR (`downloadShowcaseQrSvg` e `downloadShowcaseQrPng`) para evitar nova lógica de download.
- Alteração localizada apenas no footer institucional e no modal correspondente, sem refatorações de arquitetura.

## Como funciona o download SVG
1. O modal renderiza o QR Code oficial em SVG dentro de um `div` com `ref`.
2. Ao clicar em **Baixar em SVG**, o fluxo chama `downloadShowcaseQrSvg(ref, fileBaseName)`.
3. O utilitário serializa o elemento SVG, cria um `Blob` `image/svg+xml` e dispara o download local.

## Como funciona o download PNG
1. O mesmo SVG do QR é serializado.
2. Ao clicar em **Baixar em PNG**, o fluxo chama `downloadShowcaseQrPng(ref, fileBaseName)`.
3. O utilitário converte o SVG em imagem, renderiza em `canvas` com escala 4x e exporta para `image/png`.
4. O arquivo PNG é baixado no navegador.

## Dependência reutilizada ou adicionada
- **Reutilizada:** `qrcode.react` (já presente no projeto).
- **Reutilizado:** `src/lib/showcaseShare.ts` para download SVG/PNG.
- **Adicionada:** nenhuma dependência nova.

## Checklist final de validação
- [x] Link **Baixar QR Code SmartBus BR** adicionado na coluna Institucional do rodapé.
- [x] Clique no link abre modal institucional compacto.
- [x] Modal descreve que é o QR oficial da plataforma.
- [x] Download em SVG implementado e acionável.
- [x] Download em PNG implementado e acionável.
- [x] URL codificada no QR fixa em `https://www.smartbusbr.com.br/`.
- [x] Alteração limitada ao escopo solicitado (footer + modal).
