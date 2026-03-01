

# Evolução Estrutural — Categoria de Assento (Double Decker)

## Escopo

Adicionar `category` aos assentos, evoluir cadastro de frota para configuração por pavimento/categoria, diferenciar visualmente no mapa e exibir pavimento+categoria no ticket.

---

## 1. Migração de Banco de Dados

**Nova coluna `seats.category`:**
```sql
ALTER TABLE public.seats
  ADD COLUMN category text NOT NULL DEFAULT 'convencional';
```

Valores possíveis: `convencional`, `executivo`, `leito`, `semi_leito`. Sem enum rígido — campo texto com default `convencional`. Permite extensão futura sem migração.

Veículos e assentos existentes: todos recebem `convencional` automaticamente via DEFAULT. Zero migração manual.

---

## 2. Tipo TypeScript (`src/types/database.ts`)

- Adicionar `SeatCategory` type: `'convencional' | 'executivo' | 'leito' | 'semi_leito'`
- Adicionar `category: SeatCategory` à interface `Seat`

---

## 3. Cadastro de Frota (`src/pages/admin/Fleet.tsx`)

### Aba "Capacidade" — Evolução

Quando `floors === 2`:
- Exibir seção "Configuração por Pavimento"
- Para cada pavimento, permitir definir **setores** (ex: 8 Leito + 40 Convencional no piso superior, 12 Executivo no piso inferior)
- Interface: lista de setores com campos `categoria` (select) + `quantidade` (input number)
- Botão "Adicionar Setor" por pavimento
- Validação: soma total dos setores = capacidade do veículo

Quando `floors === 1`:
- Comportamento atual mantido
- Categoria padrão: Convencional para todos

### Preview do Layout
- Colorir assentos por categoria na prévia (cores diferenciadas por categoria)
- Legenda de cores abaixo da prévia

### Persistência
- `vehicleData` passa a incluir informação de setores como metadado (para regeneração de assentos)
- Ao salvar veículo (novo ou edição), regenerar assentos com `category` correto

---

## 4. Geração de Assentos (`generateSeatLayout`)

**Checkout (`src/pages/public/Checkout.tsx`)** e **Fleet preview:**
- Função `generateSeatLayout` recebe novo parâmetro: `sectors: { category: string; quantity: number; floor: number }[]`
- Gera assentos respeitando ordem dos setores por pavimento
- Numeração sequencial única contínua (1, 2, 3...)
- Cada assento recebe `category` do setor correspondente

---

## 5. Mapa de Assentos — Diferenciação Visual

### `SeatButton` (`src/components/public/SeatButton.tsx`)
- Aceitar prop `category?: string`
- Quando `state === 'available'`, aplicar borda/cor de fundo sutil por categoria:
  - `leito`: borda dourada / fundo amarelo sutil
  - `executivo`: borda verde / fundo verde sutil
  - `convencional`: comportamento atual (cinza)
  - `semi_leito`: borda azul / fundo azul sutil

### `SeatMap` (`src/components/public/SeatMap.tsx`)
- Passar `category` de cada `Seat` para `SeatButton`

### `SeatLegend` (`src/components/public/SeatLegend.tsx`)
- Adicionar seção "Categorias" quando veículo tiver múltiplas categorias
- Exibir badge colorido + nome da categoria

---

## 6. Resumo de Compra (Checkout)

Na etapa de confirmação do Checkout:
- Exibir para cada assento selecionado:
  - `Assento 12 — Piso Superior — Leito`
- Traduzir floor: 1 → "Piso Inferior" (se 2 pisos) ou omitir (se 1 piso), 2 → "Piso Superior"

---

## 7. Ticket — TicketCard + Visual Renderer

### `TicketCardData` (`src/components/public/TicketCard.tsx`)
- Adicionar campos opcionais: `seatCategory?: string`, `seatFloor?: number`, `vehicleFloors?: number`

### `TicketCard` — Exibição
- Abaixo de "Assento X", exibir:
  - Pavimento (se veículo 2 pisos): "Piso Superior" / "Piso Inferior"
  - Categoria: "Leito" / "Executivo" / "Convencional"

### `ticketVisualRenderer.ts`
- Na seção "Dados do Passageiro", após `Assento {label}`:
  - Linha: `Pavimento: Superior` (se 2 pisos)
  - Linha: `Categoria: Leito`

### `ticketPdfGenerator.ts`
- Sem alteração direta (usa renderTicketVisual)

---

## 8. Consulta de Passagens + Confirmação

Nos locais que montam `TicketCardData` (Confirmation.tsx, TicketLookup.tsx, etc.):
- Buscar `category` e `floor` do assento (join com seats) e `floors` do veículo
- Passar para `TicketCardData`

---

## Arquivos Afetados

| Arquivo | Tipo |
|---------|------|
| Migração SQL | Nova coluna `seats.category` |
| `src/types/database.ts` | Tipo `SeatCategory`, campo em `Seat` |
| `src/pages/admin/Fleet.tsx` | Configuração de setores por pavimento |
| `src/pages/public/Checkout.tsx` | `generateSeatLayout` com categorias, resumo |
| `src/components/public/SeatButton.tsx` | Prop `category`, cores |
| `src/components/public/SeatMap.tsx` | Passa `category` |
| `src/components/public/SeatLegend.tsx` | Legenda de categorias |
| `src/components/public/TicketCard.tsx` | Campos e exibição de pavimento/categoria |
| `src/lib/ticketVisualRenderer.ts` | Renderização de pavimento/categoria |
| `src/pages/public/Confirmation.tsx` | Montar dados de categoria no ticket |
| `src/pages/public/TicketLookup.tsx` | Montar dados de categoria no ticket |

---

## Compatibilidade

- Veículos existentes: `category = 'convencional'` automático (DEFAULT)
- Assentos já criados: recebem `convencional` sem migração
- 1 pavimento: comportamento idêntico ao atual
- RLS: sem alteração (coluna na mesma tabela `seats`, políticas existentes cobrem)

