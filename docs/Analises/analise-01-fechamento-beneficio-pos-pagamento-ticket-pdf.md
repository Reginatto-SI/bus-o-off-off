# Análise 01 — Fechamento do Benefício no pós-pagamento, confirmação, ticket e PDF

## O que foi alterado

Implementação cirúrgica para fechar o ciclo do benefício por passageiro **sem reabrir o motor financeiro do checkout**:

1. Snapshot de benefício passou a ser persistido também em `tickets`.
2. Geração de ticket no pós-pagamento passou a copiar explicitamente os campos de benefício vindos de `sale_passengers`.
3. `sale_passengers` permanece sendo limpo **somente após** inserção bem-sucedida em `tickets`.
4. `Confirmation.tsx` foi ajustada para evitar breakdown de taxas potencialmente inconsistente quando há benefício.
5. Ticket virtual passou a exibir benefício aplicado de forma discreta.
6. PDF passou a exibir o mesmo bloco de benefício (consistente com ticket virtual).
7. Mapeamentos públicos/admin/ticket lookup foram atualizados para transportar os campos necessários.

## Arquivos alterados

- `supabase/migrations/20261104090000_add_benefit_snapshot_to_tickets.sql`
- `supabase/functions/_shared/payment-finalization.ts`
- `supabase/functions/ticket-lookup/index.ts`
- `src/pages/public/Confirmation.tsx`
- `src/components/public/TicketCard.tsx`
- `src/lib/ticketVisualRenderer.ts`
- `src/pages/public/TicketLookup.tsx`
- `src/pages/admin/Sales.tsx`
- `src/components/admin/NewSaleModal.tsx`
- `src/types/database.ts`
- `src/integrations/supabase/types.ts`

## Como ficou a cópia do snapshot

- A finalização de pagamento (`createTicketsFromPassengersShared`) agora inclui no insert de `tickets`:
  - `benefit_program_id`
  - `benefit_program_name`
  - `benefit_type`
  - `benefit_value`
  - `original_price`
  - `discount_amount`
  - `final_price`
  - `benefit_applied`
  - `pricing_rule_version`
- Foi adicionada trilha de log explícita para:
  - falha de insert dos tickets com snapshot;
  - snapshot marcado como benefício aplicado, mas incompleto.
- A limpeza de `sale_passengers` permanece após insert bem-sucedido (com comentário de segurança no código).

## Como foi corrigida a confirmação

- Antes: `Confirmation.tsx` sempre recalculava breakdown usando `sale.unit_price`.
- Agora: quando `benefit_total_discount > 0`, o breakdown de taxas é suprimido para evitar composição potencialmente divergente do valor cobrado.
- Resultado: evita mostrar decomposição errada; mantém exibição segura/coerente com a cobrança persistida.

## Como ficou a exibição no ticket/PDF

- Ticket virtual (`TicketCard`) exibe bloco condicional, discreto:
  - `Benefício: {nome}`
  - `Desconto: - R$ {valor}`
- PDF (`ticketVisualRenderer`) replica o mesmo comportamento quando houver benefício aplicado.
- Não há exposição de detalhes administrativos além do necessário operacional.

## Como foi tratado o caso ida/volta

- Sem alterar cálculo da cobrança.
- Fluxo de ida/volta manual mantém trecho complementar com snapshot zerado (`original_price = 0`, `final_price = 0`, `discount_amount = 0`) para evitar duplicidade de valor/desconto.
- Exibição de benefício depende de `benefit_applied` e desconto > 0, evitando informação enganosa no trecho complementar.

## Checklist de testes executados

- [x] `npm run lint` (falhou por baseline pré-existente do repositório, sem relação direta com este escopo)
- [x] `npm run test` (há 1 falha pré-existente em `src/lib/asaasIntegrationStatus.test.ts`)
- [x] Revisão manual dos fluxos alterados (persistência pós-pagamento, mapping de confirmação, ticket virtual e PDF)
