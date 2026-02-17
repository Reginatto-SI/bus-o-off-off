

# Taxas Adicionais por Evento

## Resumo

Criar sistema de taxas adicionais configuradas por evento (ex: Taxa de Embarque, Taxa Operacional). As taxas impactam o valor final em todos os fluxos: checkout publico (Stripe), venda manual admin, passagem virtual/PDF e relatorios.

---

## 1. Banco de Dados — Nova tabela `event_fees`

Criar tabela `event_fees` com:

| Coluna | Tipo | Obrigatorio | Default |
|--------|------|-------------|---------|
| id | uuid | Sim | gen_random_uuid() |
| event_id | uuid (FK events) | Sim | - |
| company_id | uuid | Sim | - |
| name | text | Sim | - |
| fee_type | text | Sim | 'fixed' | ('fixed' ou 'percent') |
| value | numeric | Sim | 0 |
| is_active | boolean | Sim | true |
| sort_order | integer | Sim | 0 |
| created_at | timestamptz | Sim | now() |
| updated_at | timestamptz | Sim | now() |

RLS:
- Admins da empresa: ALL (usando `is_admin` + `user_belongs_to_company`)
- Publico: SELECT onde evento esta `a_venda`
- Usuarios da empresa: SELECT

Trigger `update_updated_at_column` na tabela.

---

## 2. Aba "Passagens" do Evento (`src/pages/admin/Events.tsx`)

Abaixo da secao "Configuracoes de Venda" (depois do grid com Preco e Limite), adicionar nova secao:

**"Taxas Adicionais"**

- Listagem das taxas do evento em cards compactos (nome, tipo, valor, status ativo/inativo)
- Botao "+ Adicionar Taxa"
- Cada taxa com acoes: editar, remover, toggle ativo/inativo
- Dialog inline para adicionar/editar taxa com campos:
  - Nome da taxa (text, obrigatorio)
  - Tipo: Select com "Valor Fixo (R$)" ou "Percentual (%)"
  - Valor (numerico)
  - Status ativo/inativo (Switch)
- Ao salvar evento, taxas ja sao persistidas diretamente (insert/update/delete em `event_fees`)
- Disponivel apenas para eventos existentes (editingId), similar a embarques e frotas
- Preview do calculo: "Para uma passagem de R$ X, as taxas totais serao R$ Y"

---

## 3. Funcao utilitaria de calculo (`src/lib/feeCalculator.ts` — novo)

```typescript
interface EventFee {
  name: string;
  fee_type: 'fixed' | 'percent';
  value: number;
  is_active: boolean;
}

interface FeeBreakdown {
  fees: { name: string; amount: number }[];
  totalFees: number;
  unitPriceWithFees: number;
}

function calculateFees(unitPrice: number, fees: EventFee[]): FeeBreakdown
```

- Taxa percentual: `unitPrice * (fee.value / 100)`
- Taxa fixa: `fee.value`
- Apenas fees com `is_active === true`
- Arredondamento para 2 casas decimais
- Reutilizada em todos os fluxos (publico, admin, relatorios)

---

## 4. Checkout Publico (`src/pages/public/Checkout.tsx`)

**Buscar taxas:**
- Ao carregar dados do evento, buscar `event_fees` filtrado por `event_id` e `is_active = true`

**Calculo:**
- Usar `calculateFees(event.unit_price, fees)` para obter o preco unitario com taxas
- `unit_price` da sale continua sendo o preco base (passagem)
- Novo campo `gross_amount` = `(unitPriceWithFees * quantity)` — ja existe na tabela `sales`

**Exibicao antes do pagamento:**
- Abaixo do bloco de resumo (local + horario + quantidade), adicionar card de resumo financeiro:
  - Passagem: R$ X × N = R$ total_base
  - Taxa de Embarque: R$ Y × N = R$ total_taxa1
  - Taxa Operacional: Z% = R$ total_taxa2
  - **Total: R$ total_final**

**Envio ao Stripe:**
- No insert da sale: `unit_price` = preco base, `gross_amount` = total com taxas
- Na edge function `create-checkout-session`: usar `gross_amount / quantity` como `unit_amount` na line_item do Stripe (ou calcular o total correto)
- `application_fee_amount` calculado sobre o `gross_amount` (valor total pago)

---

## 5. Edge Function `create-checkout-session`

Ajustar para considerar taxas:

- Buscar `event_fees` ativas do evento
- Calcular valor total incluindo taxas
- Usar esse valor total no `line_items` do Stripe (price_data.unit_amount)
- Comissao da plataforma: calcular sobre valor total final (como ja esta)
- Sem alterar logica de split — apenas o valor base muda

Alternativa mais simples: como o frontend ja grava `gross_amount` na sale, a edge function pode usar `sale.gross_amount` para calcular o total em vez de `unit_price * quantity`. Isso evita duplicar a busca de taxas na edge function.

**Abordagem escolhida:** Usar `gross_amount` da sale (ja calculado com taxas pelo frontend). A edge function so precisa:
- `totalAmountCents = Math.round(sale.gross_amount * 100)` (em vez de `sale.unit_price * sale.quantity * 100`)
- `unit_amount` da line_item = `Math.round((sale.gross_amount / sale.quantity) * 100)`
- Descricao da line_item incluir "(com taxas)" se houver taxas

---

## 6. Webhook (`stripe-webhook/index.ts`)

- Na funcao `processPaymentConfirmed`, o `grossAmount` ja vem da sale: usar `sale.gross_amount` diretamente (ja foi calculado com taxas)
- Ajustar para nao recalcular: `const grossAmount = sale.gross_amount || (sale.unit_price * sale.quantity)`

---

## 7. Venda Manual Admin (`src/components/admin/NewSaleModal.tsx`)

**Buscar taxas:**
- Ao selecionar evento, buscar `event_fees` ativas

**Calculo:**
- Usar `calculateFees()` com o `unitPrice` digitado (pode ser diferente do preco do evento na venda manual)
- Exibir breakdown no Step 3:
  - Valor da passagem: R$ X
  - Taxa de Embarque: R$ Y
  - Total por passageiro: R$ Z
  - Total geral (× N assentos): R$ W

**Gravacao:**
- `unit_price` = preco base da passagem
- `gross_amount` = total com taxas × quantidade

---

## 8. Passagem Virtual e PDF

**TicketCardData** — adicionar campo opcional:
- `fees?: { name: string; amount: number }[]`
- `totalPaid?: number`

**TicketCard (`src/components/public/TicketCard.tsx`):**
- Se `fees` existir e nao estiver vazio, exibir abaixo das infos do evento:
  - Passagem: R$ X
  - Cada taxa listada: R$ Y
  - Total: R$ Z

**ticketVisualRenderer.ts:**
- Adicionar secao de taxas no canvas renderizado (entre info do evento e rodape)
- Mesmo layout: label + valor alinhado a direita

**Telas que montam TicketCardData:**
- `Confirmation.tsx` — buscar fees do evento e incluir no TicketCardData
- `TicketLookup.tsx` — buscar fees do evento e incluir
- `Sales.tsx` (geracao de passagem) — buscar fees e incluir
- `NewSaleModal.tsx` (pos-confirmacao) — ja tem fees carregadas, incluir

---

## 9. Relatorios (`src/pages/admin/SalesReport.tsx`)

- Receita Bruta (`gross_amount`) ja inclui taxas — nao precisa de ajuste no calculo dos KPIs
- Comissao da plataforma calculada sobre `gross_amount` — ja esta correto
- Nenhuma mudanca necessaria se `gross_amount` ja esta sendo usado como base

Verificar: se os KPIs usam `unit_price * quantity` em vez de `gross_amount`, ajustar para usar `gross_amount`.

---

## 10. Type updates (`src/types/database.ts`)

Adicionar:

```typescript
export interface EventFee {
  id: string;
  event_id: string;
  company_id: string;
  name: string;
  fee_type: 'fixed' | 'percent';
  value: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
```

---

## Arquivos

| Arquivo | Tipo |
|---------|------|
| Migracao SQL (event_fees + RLS) | Novo |
| `src/types/database.ts` | Modificado |
| `src/lib/feeCalculator.ts` | Novo |
| `src/pages/admin/Events.tsx` | Modificado |
| `src/pages/public/Checkout.tsx` | Modificado |
| `src/components/admin/NewSaleModal.tsx` | Modificado |
| `src/components/public/TicketCard.tsx` | Modificado |
| `src/lib/ticketVisualRenderer.ts` | Modificado |
| `supabase/functions/create-checkout-session/index.ts` | Modificado |
| `supabase/functions/stripe-webhook/index.ts` | Modificado |
| `src/pages/public/Confirmation.tsx` | Modificado |
| `src/pages/public/TicketLookup.tsx` | Modificado |
| `src/pages/admin/Sales.tsx` | Modificado |
| `src/pages/admin/SalesReport.tsx` | Verificar/Modificar |

## Regras de seguranca

- Taxas nao afetam vendas ja concluidas (retroatividade zero)
- Stripe recebe valor final correto via `gross_amount`
- Split e comissao da plataforma calculados sobre valor final — sem alteracao na logica existente
- Venda manual nao chama Stripe — apenas calculo interno
- RLS garante que apenas admins da empresa gerenciam taxas

