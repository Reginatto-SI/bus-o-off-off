

# Preço por Categoria de Assento — Plano de Implementação

## Resumo

Adicionar suporte a preços diferenciados por categoria de assento no evento, com persistência via nova tabela `event_category_prices`, switch de ativação no admin, e cálculo correto no checkout público e venda manual.

---

## 1. Banco de Dados — Nova Tabela

```sql
CREATE TABLE public.event_category_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  category text NOT NULL DEFAULT 'convencional',
  price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, category)
);

ALTER TABLE public.event_category_prices ENABLE ROW LEVEL SECURITY;
```

Novo campo no evento:
```sql
ALTER TABLE public.events ADD COLUMN use_category_pricing boolean NOT NULL DEFAULT false;
```

RLS policies:
- Admins can manage (ALL) where `is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id)`
- Public can view (SELECT) where event is `a_venda`

---

## 2. Tipos TypeScript (`src/types/database.ts`)

- Adicionar `use_category_pricing: boolean` à interface `Event`
- Criar interface `EventCategoryPrice { id, event_id, company_id, category: SeatCategory, price: number }`

---

## 3. Admin — Aba Passagens (`src/pages/admin/Events.tsx`)

### Form state
- Adicionar `use_category_pricing: boolean` ao `form`
- Novo state: `categoryPrices: { category: string; price: string; seatCount: number }[]`

### UI (dentro do Card "Configuração da Passagem", após o campo "Preço Base")
- Renomear label para "Preço Base da Passagem"
- Switch: "Usar preços por categoria de assento"
- Quando ativo, bloco expandido:
  - Busca categorias distintas dos `seats` dos veículos vinculados ao evento (via trips → vehicles → seats)
  - Lista cada categoria com: nome formatado, quantidade de assentos (informativo), campo de preço (R$)
  - Layout 2 colunas no desktop
  - Se categoria sem preço definido: mostrar texto "(Usará preço base: R$ X)" discreto
  - Alerta se nenhuma categoria tem preço definido

### Persistência
- Ao salvar evento: se `use_category_pricing`, upsert na tabela `event_category_prices`
- Ao carregar evento: fetch `event_category_prices` e popular state

### Simulação de taxa
- Quando `use_category_pricing` está ativo, a simulação de taxa da plataforma usa o preço base como referência genérica (sem mudança)

---

## 4. Checkout Público (`src/pages/public/Checkout.tsx`)

### Fetch
- Buscar `event_category_prices` quando `event.use_category_pricing === true`

### Função utilitária (inline)
```ts
const getSeatPrice = (seat: Seat): number => {
  if (!event?.use_category_pricing) return event?.unit_price ?? 0;
  const catPrice = categoryPrices.find(cp => cp.category === seat.category);
  return catPrice?.price ?? event?.unit_price ?? 0; // fallback para preço base
};
```

### Cálculo de total
- Ao invés de `unit_price * quantity`, somar `getSeatPrice(seat)` para cada assento selecionado
- Na criação da sale: `unit_price` = preço médio (ou preço base), `gross_amount` = soma real dos preços + taxas
- Fees: aplicar fees sobre cada assento individualmente e somar

### Resumo de compra
- Mostrar preço individual por assento quando preços variam
- Total = soma dos preços individuais + taxas

---

## 5. Venda Manual Admin (`src/components/admin/NewSaleModal.tsx`)

### Mesmo approach
- Buscar `event_category_prices` quando evento usa pricing por categoria
- Usar `getSeatPrice` para cada assento selecionado
- Atualizar cálculo de `gross_amount`

---

## 6. Compatibilidade

- Eventos existentes: `use_category_pricing = false` (DEFAULT), comportamento idêntico ao atual
- Se ativado sem preços configurados: fallback para preço base com alerta
- Nenhuma mudança em relatórios/comissões (usam `gross_amount` que já é o valor final)

---

## Arquivos Afetados

| Arquivo | Mudança |
|---------|---------|
| Migração SQL | Nova tabela + coluna |
| `src/types/database.ts` | Interface + campo em Event |
| `src/pages/admin/Events.tsx` | Switch, UI categorias, persistência |
| `src/pages/public/Checkout.tsx` | Fetch prices, cálculo por assento |
| `src/components/admin/NewSaleModal.tsx` | Cálculo por assento na venda manual |

