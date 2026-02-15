
# Correcao: Erro ao reservar assentos + Build error em Sales.tsx

## Problema 1: "Erro ao reservar assentos" no checkout publico

### Causa raiz

Os logs do banco mostram: `invalid input syntax for type uuid: "preview-1-2-4"`.

O fluxo de checkout exibe um **layout de preview** imediato (com IDs falsos como `preview-1-1-3`) enquanto os assentos reais carregam do banco. Se o usuario seleciona assentos antes dos dados reais chegarem, os IDs de preview sao enviados na criacao dos tickets, causando erro no PostgreSQL porque `preview-1-2-4` nao e um UUID valido.

### Correcao

Duas medidas complementares:

1. **Bloquear selecao de assentos preview**: No `SeatMap` ou no `Checkout.tsx`, impedir que o usuario selecione assentos que tenham IDs comecando com `preview-`. Isso ja e parcialmente feito pelo overlay de loading, mas ha uma janela onde o preview esta visivel sem o overlay.

2. **Validacao no submit**: Antes de criar a venda, verificar se algum `selectedSeat` contem ID com prefixo `preview-` e bloquear o envio, mostrando toast pedindo para aguardar o carregamento.

3. **Limpar selecao ao trocar de preview para real**: Quando os assentos reais carregam e substituem os de preview, limpar o `selectedSeats` para evitar IDs orfaos.

### Arquivos modificados

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/public/Checkout.tsx` | Limpar selectedSeats ao carregar assentos reais; validar IDs antes do submit; bloquear interacao enquanto seats sao preview |

---

## Problema 2: Build error em Sales.tsx

### Causa raiz

O componente `Label` e usado nas linhas 891, 895 e 919 mas nao esta importado no arquivo.

### Correcao

Adicionar `import { Label } from '@/components/ui/label';` nos imports do arquivo.

### Arquivo modificado

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/admin/Sales.tsx` | Adicionar import de Label |

---

## Sem novas dependencias
