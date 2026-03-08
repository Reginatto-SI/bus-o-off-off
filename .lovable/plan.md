

## Plano: Reorganizar tabela de vendas para eliminar scroll horizontal

### Problema
A tabela possui 10-11 colunas separadas (Data, Evento, Cliente, Veículo, Local Embarque, Qtd, Poltrona, Valor, Vendedor, Status, Ações), causando scroll horizontal em notebooks e telas menores.

### Solução
Reduzir para 7-8 colunas agrupando informações relacionadas, e corrigir a cor dos ícones de ordenação.

### Alterações no arquivo `src/pages/admin/Sales.tsx`

**1. Agrupar colunas "Veículo" + "Local Embarque" → nova coluna "Embarque"**

Renderizar em bloco vertical:
- Linha 1: tipo do veículo + placa (ex: `Ônibus • AJY-7E61`)
- Linha 2: horário + nome do local (ex: `09:00 — Local de Embarque 01`)

Isso elimina 1 coluna.

**2. Agrupar colunas "Qtd" + "Poltrona(s)" → nova coluna "Passagem"**

Renderizar em bloco vertical:
- Linha 1: quantidade (ex: `2 passagens`)
- Linha 2: poltronas (ex: `Poltronas 13, 14`)

Isso elimina mais 1 coluna.

**3. Remover coluna "Vendedor" da tabela principal**

A informação do vendedor já está disponível nos detalhes da venda e no filtro. Para telas com `canViewFinancials`, a coluna será mantida como texto menor dentro da coluna "Cliente" (terceira linha: `Vendedor: Nome`), liberando mais espaço.

Resultado: de ~11 colunas para **7 colunas** (Data, Evento, Cliente, Embarque, Passagem, Valor, Status, Ações) — ou 7 sem Valor para quem não tem permissão financeira.

**4. Corrigir ícones de ordenação — `renderSortHeader`**

Atualmente o ícone inativo usa `text-muted-foreground/70` (cinza). Alterar para herdar a cor do texto do `TableHead` (que é `text-primary-foreground`, branco sobre fundo laranja). O ícone ficará com a mesma cor do label, garantindo consistência visual.

Trecho afetado (linhas 528-548):
```tsx
// Ícone inativo: remover text-muted-foreground/70, usar opacity apenas
<ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
```

E ajustar a classe do botão para herdar a cor do cabeçalho:
```tsx
className="text-primary-foreground hover:text-primary-foreground hover:bg-primary/80"
```

**5. Ajustar largura das colunas com classes utilitárias**

Adicionar `whitespace-nowrap` nas colunas compactas (Data, Status, Ações) e `min-w-` nas colunas de conteúdo (Embarque, Passagem) para distribuir melhor o espaço.

### Colunas de exportação (Excel/PDF)
Manter todas as colunas separadas nos exports (`exportColumns` e `flatData`), pois no Excel/PDF não há problema de largura. A reorganização é apenas visual na tabela.

### Resultado esperado
- Tabela cabe na tela sem scroll horizontal em notebooks (1366px+)
- Informações agrupadas melhoram a legibilidade
- Ícones de ordenação com cor consistente
- Nenhuma funcionalidade perdida
- Exports mantidos inalterados

