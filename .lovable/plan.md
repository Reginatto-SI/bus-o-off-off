

# Plan: Sales Diagnostic Page (`/admin/diagnostico-vendas`)

## Overview
Create a developer-only diagnostic page for investigating sales flow, payment status, and gateway integration issues. Follows the Fleet page pattern (AdminLayout, PageHeader, FilterCard, Table, ActionsDropdown, detail modal).

## Files to Create/Modify

### 1. New file: `src/pages/admin/SalesDiagnostic.tsx`
The main page component with:

**Header**: PageHeader with title "Diagnostico de Vendas" and description about analysis tool.

**Filters (FilterCard)**: Date range (from/to), company selector (developer cross-company), event selector, sale status (`reservado`/`pago`/`cancelado`), payment status (Asaas statuses), gateway (`asaas`/`stripe`/`manual`), and text search (name, CPF, sale ID, event name). Clear filters button.

**Table columns**:
- Data da venda
- Empresa (company name from join)
- Evento (event name)
- Comprador (customer_name)
- Valor (gross_amount or quantity * unit_price)
- Gateway (derived from sale_origin + asaas_payment_id / stripe_checkout_session_id)
- Status da venda (StatusBadge)
- Status do pagamento (asaas_payment_status or derived from stripe)
- Etapa atual do fluxo (computed from sale state: sale created -> charge sent -> payment pending -> webhook received -> paid -> ticket generated)
- Mensagem de retorno (summary from available data)
- Actions dropdown with "Ver detalhes da venda"

**Detail modal** with three blocks:
- Block 1 — Sale data: ID, company, event, buyer, CPF, quantity, total, date
- Block 2 — Payment: gateway, payment status, gateway charge ID (asaas_payment_id or stripe_payment_intent_id), payment link
- Block 3 — Integration: summary of API return, communication status, error message (no sensitive data like API keys)
- Timeline: reconstructed from sale_logs + sale fields (created_at, asaas_payment_id presence, asaas_payment_status, status changes, etc.)

**Data source**: Query `sales` table with joins to `events`, `companies`, `sale_logs`. For developer users, no company_id filter (cross-company). For gerente, filter by activeCompanyId.

**Flow stage computation** (pure frontend logic based on sale fields):
- `sale_origin === 'admin_manual'` and no gateway IDs → "Venda manual"
- `asaas_payment_id` exists → gateway = "Asaas"
- `stripe_checkout_session_id` exists → gateway = "Stripe"
- Stage derived from: has payment ID? → "Cobranca enviada". Status = pago? → "Pagamento confirmado". Has tickets? → "Passagem gerada". Cancelled? → "Cancelado".

### 2. Modify: `src/components/layout/AdminSidebar.tsx`
Add a new navigation group `sistema` (after `administracao`, before `conta`) with:
```
{
  id: 'sistema',
  label: 'Sistema',
  icon: Wrench, // or Activity
  items: [{
    name: 'Diagnostico de Vendas',
    href: '/admin/diagnostico-vendas',
    icon: Activity,
    roles: ['developer']
  }]
}
```

### 3. Modify: `src/App.tsx`
Add route: `<Route path="/admin/diagnostico-vendas" element={<SalesDiagnostic />} />`

## Access Control
- Sidebar item restricted to `roles: ['developer']`
- Page component uses AdminLayout (existing auth guard)
- Developer can query cross-company (no company_id filter); gerente filtered by activeCompanyId

## No Database Changes Required
All data already exists in `sales`, `sale_logs`, `events`, `companies` tables. The diagnostic view is read-only, using existing fields (`asaas_payment_id`, `asaas_payment_status`, `stripe_checkout_session_id`, `sale_origin`, `platform_fee_status`, etc.).

## Timeline Reconstruction Logic
The modal timeline is built from:
1. `sale.created_at` → "Venda criada"
2. Presence of `asaas_payment_id` or `stripe_checkout_session_id` → "Cobranca enviada ao gateway"
3. `asaas_payment_status` values → "Pagamento aguardando" / "Pagamento confirmado" / "Pagamento falhou"
4. `sale.status = 'pago'` → "Venda atualizada para pago"
5. `sale_logs` entries → additional timeline events (status changes, cancellations, edits)
6. Ticket count > 0 → "Passagem gerada"

## Estimated Size
~600-800 lines for the page component, following Sales.tsx patterns but simpler (read-only, no edit/cancel actions).

