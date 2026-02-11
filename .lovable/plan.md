

# Correcao: Layout de assentos por tipo de veiculo

## Problema

Na funcao `generateSeatLayout` (linha 69 de `Checkout.tsx`), micro-onibus esta agrupado com van como veiculo "pequeno" (3 colunas = 2+1). O correto e:

- **Onibus e Micro-onibus**: 4 colunas (2 + corredor + 2)
- **Van**: 3 colunas (2 + corredor + 1)

## Alteracao

### Arquivo: `src/pages/public/Checkout.tsx`

Linha 69, mudar a logica de `isSmall`:

```typescript
// Antes:
const isSmall = vehicleType === 'van' || vehicleType === 'micro_onibus' || capacity <= 20;

// Depois:
const isSmall = vehicleType === 'van';
```

Isso faz com que apenas vans usem layout 2+1. Onibus e micro-onibus usarao 2+2.

### Arquivo: `src/components/public/SeatMap.tsx`

A variavel `corridorAfterCol` ja esta fixa em 2, o que funciona corretamente para o layout 2+2 (corredor entre colunas 2 e 3). Nenhuma alteracao necessaria neste arquivo — o grid ja renderiza corretamente com 4 colunas.

## Resultado esperado

- **Onibus / Micro-onibus**: fileiras de 4 assentos (2 a esquerda, corredor, 2 a direita)
- **Van**: fileiras de 3 assentos (2 a esquerda, corredor, 1 a direita)

