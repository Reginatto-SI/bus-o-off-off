

# Fix: Sincronização de Categorias Template → Seats → Evento

## Problema Raiz

Dois veículos existentes têm `layout_snapshot = NULL` e 49/50 seats todos com categoria "convencional", apesar do template ter 3 categorias (convencional: 36, executivo: 12, leito: 12). Isso acontece porque:

1. O snapshot só é gerado na **criação** de veículo novo (condição `!editingId` na linha 655 do Fleet.tsx). Veículos editados nunca recebem snapshot.
2. Sem snapshot, `syncSeatsFromSnapshot` nunca roda e as categorias dos seats nunca são atualizadas.
3. Consequência: na aba Passagens do Evento, a query busca categorias da tabela `seats` e encontra apenas "convencional".

## Correções

### 1. Fleet.tsx — Gerar snapshot também ao editar veículo existente

**Mudança:** Remover a condição `!editingId` da linha 655. Se o veículo tem `template_layout_id` e o snapshot está nulo (ou o template mudou), regenerar o snapshot tanto na criação quanto na edição.

Após o save (update ou insert), **sempre** rodar `syncSeatsFromSnapshot` quando houver `template_layout_id`, mesmo que o snapshot já existisse — para re-sincronizar categorias de veículos antigos.

Lógica simplificada:
```
if (form.template_layout_id) {
  // Buscar items do template e montar snapshot
  // Salvar snapshot no veículo
  // Rodar syncSeatsFromSnapshot
}
```

### 2. Fleet.tsx — Botão "Re-sincronizar Layout" para veículos existentes

Adicionar na aba Capacidade, quando veículo tem template vinculado, um botão discreto "Re-sincronizar assentos do template" que força a regeneração do snapshot e re-sync dos seats. Isso resolve veículos existentes sem precisar editar/salvar.

### 3. Garantir que `syncSeatsFromSnapshot` atualiza categoria dos seats existentes

Já está implementado (linha 180-184 do Fleet.tsx faz `toUpdate.push({ id, label, status, category })`), MAS preciso verificar que o batch update realmente escreve `category`. Vou conferir o bloco de update.

## Arquivos Afetados

| Arquivo | Mudança |
|---------|---------|
| `src/pages/admin/Fleet.tsx` | Snapshot na edição + botão re-sync + garantir update de category |

