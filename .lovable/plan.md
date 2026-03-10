

# Plan: Evolve Sales Diagnostic Modal to Tabbed Technical Inspector

## Overview
Replace the current single-scroll detail modal with a 5-tab technical inspector using Radix Tabs, keeping all existing data and adding new diagnostic sections.

## Changes — Single file: `src/pages/admin/SalesDiagnostic.tsx`

### Modal Structure
Replace the current `ScrollArea` content (lines 614-763) with a `Tabs` component containing 5 tabs:

**Tab 1 — Resumo**: Move existing "Dados da Venda" block + payment status + gateway + origin. Quick overview of the sale.

**Tab 2 — Fluxo da Venda**: Move existing timeline section here. Keep `buildTimeline` logic as-is.

**Tab 3 — Gateway / Integração**: New tab showing:
- Gateway used (Asaas/Stripe/Manual)
- Company Asaas account info: fetch `asaas_account_email`, `asaas_wallet_id` from `companies` table (add to `openDetail` query)
- Company name linked to the sale
- Asaas payment ID / Stripe session ID
- Raw Asaas status
- Platform fee status and amounts
- Note: endpoint/timing not available in current data — show "Dados não disponíveis" placeholder

**Tab 4 — Webhook**: New tab showing:
- Whether webhook was received: infer from `sale_logs` entries with action `payment_confirmed` or `payment_failed`
- Webhook date: from the log entry `created_at`
- Event type: extract from log description (e.g., "PAYMENT_CONFIRMED")
- Processing status: if sale status matches expected outcome → "Sucesso", else "Falha"

**Tab 5 — Payloads Técnicos**: New tab with collapsible sections using `Collapsible` component:
- "Dados brutos da venda" — show sanitized sale JSON (exclude sensitive fields)
- "Logs da venda" — show sale_logs as formatted JSON
- Note: actual API request/response payloads are not stored in DB — show placeholder explaining this and suggesting future `sale_integration_logs` table

### Data Fetching Enhancement
In `openDetail`, also fetch company integration data:
```typescript
const { data: companyData } = await supabase
  .from('companies')
  .select('name, asaas_account_email, asaas_wallet_id, asaas_account_id')
  .eq('id', sale.company_id)
  .single();
```
Store in new state `detailCompany`.

### Imports
Add: `Tabs, TabsList, TabsTrigger, TabsContent` from `@/components/ui/tabs`
Add: `Collapsible, CollapsibleTrigger, CollapsibleContent` from `@/components/ui/collapsible`
Add: `ChevronDown, Webhook, Code, FileJson` from `lucide-react`

### Modal sizing
Increase `max-w-2xl` to `max-w-3xl` for the tabbed layout.

## Files Modified
- `src/pages/admin/SalesDiagnostic.tsx` — single file change

