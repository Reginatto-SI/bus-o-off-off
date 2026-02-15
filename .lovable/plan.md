

# Simplificar checkout publico: remover reconciliacao de assentos

## Causa raiz

O checkout publico contem logica complexa de reconciliacao de assentos (verificar layout, deletar assentos antigos, regenerar com novo layout, corrigir labels). Essa logica:

1. Detecta falso positivo de "mismatch" em assentos com labels sequenciais validos
2. Tenta DELETE de assentos que falha silenciosamente (usuario anonimo sem permissao RLS de DELETE)
3. Resultado: o estado `seats` fica vazio ou inconsistente, e o mapa nao renderiza nenhum botao

## Solucao: simplificar drasticamente

O checkout publico NAO deve modificar dados de assentos existentes. Deve apenas:

1. Buscar assentos do banco
2. Se nao existirem, criar (primeira visita)
3. Exibir o que existe

Toda logica de reconciliacao (`hasRightSideNumberingMismatch`, `buildRightSideNumberingFixes`, comparacao de `maxCol vs expectedCols`, delete+regenerate) sera removida do checkout publico.

### Alteracoes em `src/pages/public/Checkout.tsx`

**Remover funcoes auxiliares:**
- `hasRightSideNumberingMismatch` (linhas 123-154)
- `buildRightSideNumberingFixes` (linhas 156-188)

**Simplificar bloco de carregamento de assentos (linhas 323-386):**

Substituir toda a logica de reconciliacao por:

```
if (existingSeats && existingSeats.length > 0) {
  setSeats(existingSeats as Seat[]);
} else {
  // Criar assentos pela primeira vez
  setGeneratingSeats(true);
  const layout = generateSeatLayout(...);
  const { data: created } = await supabase.from('seats').insert(...).select();
  if (created) setSeats(created as Seat[]);
  setGeneratingSeats(false);
}
```

Isso elimina:
- ~100 linhas de codigo de reconciliacao
- O risco de DELETE silencioso falhar
- Falsos positivos de deteccao de layout inconsistente
- Ciclos infinitos de regeneracao

### Resultado

- Mapa de assentos carrega imediatamente com os dados do banco
- Sem tentativas de modificar dados existentes no contexto publico
- Codigo muito mais simples e previsivel
- Se o layout precisar ser corrigido, isso deve ser feito no painel admin (melhoria futura)

## Arquivos modificados

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/public/Checkout.tsx` | Remover hasRightSideNumberingMismatch, buildRightSideNumberingFixes, e toda logica de reconciliacao. Manter apenas fetch + criacao inicial |

## Sem novas dependencias

