
# Simplificar carregamento de assentos no checkout

## Problema

O sistema de "preview seats" (assentos falsos com IDs como `preview-1-2-4`) foi criado para mostrar o layout enquanto os assentos reais carregam. Porem, a flag `seatsArePreview` que bloqueia interacao **nunca desliga** se o carregamento dos assentos reais falhar silenciosamente ou demorar, travando o mapa de assentos em "Carregando assentos..." infinitamente.

## Solucao: remover o sistema de preview

A abordagem mais simples e confiavel e **eliminar os preview seats**. Em vez de mostrar assentos fantasmas bloqueados, mostrar apenas um spinner limpo ate os assentos reais carregarem.

### Alteracoes em `src/pages/public/Checkout.tsx`

1. **Remover a linha que seta preview seats** (linha 336: `setSeats(buildPreviewSeatsForVehicle(...))`). Os seats comecam como array vazio e sao preenchidos diretamente com dados reais.

2. **Remover a variavel `seatsArePreview`** (linha 252) — nao e mais necessaria.

3. **Remover todas as guards de `preview-`** nos handlers `handleAdvanceToPassengers` e `handleSubmit` — sem preview seats, nao existem IDs invalidos.

4. **Simplificar as props do SeatMap**: voltar a usar apenas `loadingSeatStatus` e `generatingSeats` como indicadores de carregamento, sem `seatsArePreview`.

5. **Manter o `generatingSeats`** como unico bloqueador de interacao (para quando o sistema esta criando/recriando assentos no banco).

6. **O SeatMap ja possui overlay de loading** — ele continuara exibindo "Carregando assentos..." enquanto `loadingStatus` ou `generatingSeats` estiverem ativos. Quando os dados reais chegam, o overlay some automaticamente.

### Resultado

- Sem preview, sem IDs falsos, sem risco de enviar UUIDs invalidos
- Loading limpo e confiavel: spinner enquanto carrega, mapa interativo quando pronto
- Codigo mais simples (menos estados, menos guards)
- Se o carregamento falhar, o `seatStatusError` ja existente mostra mensagem com botao "Tentar novamente"

## Arquivos modificados

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/public/Checkout.tsx` | Remover preview seats, remover seatsArePreview, remover guards de preview-, simplificar props do SeatMap |

## Sem novas dependencias
