

## Plano: Substituir dropdown de Nível do Parceiro por cards selecionáveis

### Arquivo a modificar

`src/pages/admin/CommercialPartners.tsx`

### Mudança

Substituir o bloco `<Select>` de "Nível do parceiro" (linhas 468-478) por 3 cards clicáveis lado a lado com título e descrição.

### Implementação

Criar um grid de 3 colunas com cards clicáveis. Cada card:
- Borda destacada (ex: `border-primary ring-2 ring-primary`) quando selecionado
- Título em negrito
- Descrição curta em `text-muted-foreground text-xs`
- `cursor-pointer` e hover state

Dados dos cards:

| Valor | Título | Descrição |
|-------|--------|-----------|
| `basico` | Básico | Exibição padrão na vitrine da empresa. O parceiro aparece na lista de parceiros oficiais. |
| `destaque` | Destaque | Maior visibilidade na vitrine. Pode aparecer antes dos parceiros básicos. |
| `premium` | Premium | Máximo destaque na vitrine. Aparece nas posições prioritárias e possui maior visibilidade no sistema. |

O click no card faz `setForm({ ...form, partner_tier: value })`, mantendo compatibilidade total com o fluxo existente.

### Layout

```text
┌────────────┐ ┌────────────┐ ┌────────────┐
│  Básico    │ │  Destaque  │ │  Premium   │
│  descrição │ │  descrição │ │  descrição │
└────────────┘ └────────────┘ └────────────┘
```

Grid responsivo: `grid grid-cols-3 gap-3` (desktop) ou `grid-cols-1` em telas muito pequenas (mas admin é desktop-first, então priorizar 3 colunas).

### Sem alteração de dados

O valor continua sendo `basico | destaque | premium` — apenas a UI de seleção muda.

