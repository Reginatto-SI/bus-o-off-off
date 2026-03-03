

# Dashboard Administrativo — Plano de Implementação

## Resumo

Criar a rota `/admin/dashboard` com KPIs operacionais (todos os admins) e financeiros (somente Gerente/Developer), gráficos de vendas e rankings, usando componentes existentes (PageHeader, StatsCard, FilterCard, chart.tsx).

## Arquivos a criar/modificar

| Arquivo | Ação |
|---------|------|
| `src/pages/admin/Dashboard.tsx` | **Criar** — página principal |
| `src/App.tsx` | Adicionar rota `/admin/dashboard` |
| `src/components/layout/AdminSidebar.tsx` | Adicionar item "Dashboard" no topo da navegação |

## 1. Sidebar — Adicionar "Dashboard" como primeiro item

No array `navigationGroups`, inserir um novo grupo `dashboard` antes de `eventos`:

```ts
{
  id: 'dashboard',
  label: 'Início',
  items: [{
    name: 'Dashboard',
    href: '/admin/dashboard',
    icon: LayoutDashboard, // lucide
  }]
}
```

## 2. App.tsx — Nova rota

```tsx
import Dashboard from "./pages/admin/Dashboard";
// ...
<Route path="/admin/dashboard" element={<Dashboard />} />
```

## 3. Dashboard.tsx — Estrutura da página

### State e filtros
- `period`: 7 | 30 | 90 (dias)
- Derivar `dateFrom` = `subDays(now(), period).toISOString()`
- `canViewFinancials` do AuthContext controla tanto renderização quanto fetch

### Queries (todas client-side com Supabase SDK, filtrando por `company_id`)

**KPIs Operacionais** (uma query):
- Eventos à venda: `events` where `status = 'a_venda'`, `is_archived = false`
- Próximos eventos (N dias): mesma base + `date between today and today+N`
- Vendas pagas no período: `sales` where `status = 'pago'`, `created_at` no range
- Canceladas no período: idem com `status = 'cancelado'`
- Ocupação média: `sum(quantity) de vendas pagas / sum(capacity) das trips vinculadas`

**KPIs Financeiros** (só se `canViewFinancials`):
- Receita bruta: `sum(coalesce(gross_amount, quantity * unit_price))` de vendas pagas
- Custo plataforma: `sum(platform_fee_total)` de vendas pagas
- Comissão vendedores: join com sellers para calcular `sum(sale_total * commission_percent / 100)`

**Gráfico "Vendas por dia"**: agregar vendas pagas por `created_at::date` no período, agrupar no front.

**Gráfico "Distribuição por status"**: count por status (reservado/pago/cancelado) no período.

**Rankings**:
- Top 5 eventos por quantidade de vendas pagas
- Top 5 vendedores (incluindo "Sem vendedor" quando `seller_id IS NULL`)

### Layout (grid desktop-first)

```text
┌─────────────────────────────────────────────┐
│ PageHeader: "Dashboard" + FilterCard período│
├──────┬──────┬──────┬──────┬─────────────────┤
│ KPI  │ KPI  │ KPI  │ KPI  │ KPI (ocupação) │  ← Operação (todos)
├──────┴──────┼──────┴──────┼─────────────────┤
│ KPI Receita │ KPI Plataf. │ KPI Comissão    │  ← Financeiro (Gerente)
├─────────────┴─────────────┴─────────────────┤
│ Gráfico Vendas/dia  │  Gráfico Status       │  ← 2 colunas
├─────────────────────┼───────────────────────┤
│ Top 5 Eventos       │  Top 5 Vendedores     │  ← 2 colunas
└─────────────────────┴───────────────────────┘
```

### Componentes reutilizados
- `AdminLayout` (wrapper)
- `PageHeader` (título + subtítulo)
- `StatsCard` (cada KPI)
- `ChartContainer` + Recharts (`LineChart`, `PieChart`) do `chart.tsx`
- `Card` para rankings
- `Skeleton` para loading states
- `Select` para filtro de período (dentro de um bloco simples, sem FilterCard completo)

### Segurança (duas camadas)
- **UI**: bloco financeiro só renderiza se `canViewFinancials === true`
- **Dados**: queries financeiras só executam se `canViewFinancials === true` (nenhum fetch, nenhum payload)

### Links de drill-down
- Rankings linkam para `/admin/vendas` e `/admin/relatorios/vendas` (sem filtros via URL no MVP)

