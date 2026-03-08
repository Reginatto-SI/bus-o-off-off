

## Plano: Reorganizar layout da aba Dados Gerais dos Parceiros

### Arquivo: `src/pages/admin/CommercialPartners.tsx`

### Mudança no `renderDadosFields` (linhas 446-503)

Reorganizar de `grid sm:grid-cols-2` para uma estrutura vertical com 3 blocos:

**Linha 1** — Nome (full width, como já está)

**Linha 2** — Status + Ordem de exibição lado a lado (`grid grid-cols-2 gap-4`)

**Linha 3** — Seção "Nível do parceiro" em `sm:col-span-2` (full width), com:
- Label "Nível do parceiro" como título da seção
- Grid `grid-cols-3 gap-3` com os 3 cards ocupando toda a largura
- Adicionar badges visuais nos títulos dos cards:
  - Básico → sem ícone
  - Destaque → ⭐ após o título
  - Premium → 🔥 após o título

### Estrutura resultante

```text
┌─────────────────────────────────────────┐
│ Nome da empresa parceira *              │
├────────────────────┬────────────────────┤
│ Status             │ Ordem de exibição  │
├────────────────────┴────────────────────┤
│ Nível do parceiro                       │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│ │ Básico   │ │⭐Destaque│ │🔥Premium │ │
│ │ desc...  │ │ desc...  │ │ desc...  │ │
│ └──────────┘ └──────────┘ └──────────┘ │
└─────────────────────────────────────────┘
```

Sem alteração de dados ou lógica — apenas reorganização visual e adição dos emojis nos títulos dos cards.

