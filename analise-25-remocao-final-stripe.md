# 1. Objetivo

Executar a remoção total e definitiva do legado Stripe restante no Smartbus BR, deixando o projeto alinhado ao fluxo único oficial baseado em Asaas.

# 2. Decisão consolidada do produto

A decisão desta etapa foi objetiva:

- não existe mais necessidade de retenção histórica Stripe;
- não existe mais necessidade de compatibilidade futura com Stripe;
- não deve permanecer nenhum contrato, payload, coluna, fallback, provider, comentário operacional ou tela dependente de Stripe.

# 3. Estruturas Stripe removidas nesta etapa

## Banco / schema

- `sales.stripe_checkout_session_id`
- `sales.stripe_payment_intent_id`
- `sales.stripe_transfer_id`
- aceitação de `provider = 'stripe'` em `sale_integration_logs_provider_check`
- comentários de schema que ainda descreviam comportamento ligado a Stripe

## Backend / payloads

- `stripeCheckoutSessionId` removido do payload de `supabase/functions/ticket-lookup/index.ts`
- remoção dos arquivos de functions Stripe já desativadas:
  - `supabase/functions/stripe-webhook/index.ts`
  - `supabase/functions/create-checkout-session/index.ts`
  - `supabase/functions/create-connect-account/index.ts`

## Frontend / admin / público

- remoção de `stripeCheckoutSessionId` de `TicketLookup`, `TicketCard` e `Confirmation`
- remoção do uso de `sales.stripe_*` em `SalesDiagnostic`
- remoção do fallback Stripe em `SalesReport`
- remoção de labels/comentários que ainda sugeriam Stripe como legado útil

## Tipos / contratos

- remoção dos campos Stripe de `sales` em `src/types/database.ts`
- remoção dos campos Stripe de `sales` em `src/integrations/supabase/types.ts`
- `payment-observability.ts` deixou de aceitar `provider: "stripe"`
- contratos locais/públicos deixaram de expor `stripeCheckoutSessionId`

# 4. Arquivos alterados

1. `supabase/migrations/20261026110000_remove_remaining_stripe_legacy.sql`
2. `supabase/functions/ticket-lookup/index.ts`
3. `src/pages/public/Confirmation.tsx`
4. `src/pages/public/TicketLookup.tsx`
5. `src/components/public/TicketCard.tsx`
6. `src/pages/admin/SalesDiagnostic.tsx`
7. `src/pages/admin/SalesReport.tsx`
8. `src/types/database.ts`
9. `src/integrations/supabase/types.ts`
10. `supabase/functions/_shared/payment-observability.ts`
11. `supabase/functions/_shared/payment-context-resolver.ts`
12. `src/components/ui/StatusBadge.tsx`
13. `src/components/admin/NewSaleModal.tsx`
14. `src/pages/admin/Sellers.tsx`
15. `src/pages/admin/SellersCommissionReport.tsx`
16. `src/pages/seller/SellerDashboard.tsx`
17. `docs/manual-operacional-smartbus-br/07-criar-evento-completo.md`
18. `docs/manual-operacional-smartbus-br/08-publicar-evento-colocar-venda.md`
19. `deno.lock`
20. `analise-25-remocao-final-stripe.md`

# 5. Migration criada

## `supabase/migrations/20261026110000_remove_remaining_stripe_legacy.sql`

A migration final:

- remove as colunas Stripe restantes de `sales`;
- remove logs antigos com `provider = 'stripe'`;
- recria a constraint `sale_integration_logs_provider_check` aceitando apenas `asaas` e `manual`;
- atualiza comentários de schema para linguagem neutra e aderente ao cenário atual.

# 6. Ajustes em tipos e contratos

- `src/types/database.ts` não expõe mais campos Stripe em `Sale`.
- `src/integrations/supabase/types.ts` não expõe mais campos Stripe em `sales`.
- `payment-observability.ts` agora aceita apenas `"asaas" | "manual"`.
- `TicketLookup`, `TicketCard` e `Confirmation` não carregam mais `stripeCheckoutSessionId`.
- `SalesDiagnostic` e `SalesReport` não dependem mais de IDs Stripe.

# 7. Ajustes em telas e payloads

- `ticket-lookup` deixou de devolver identificador Stripe.
- `Confirmation` deixou de depender de campo Stripe.
- `TicketLookup` deixou de depender de campo Stripe para autoatualização.
- `TicketCard` deixou de depender de campo Stripe para status visual.
- `SalesDiagnostic` não mostra mais Stripe como gateway nem usa IDs Stripe em detalhe.
- `SalesReport` exporta `payment_id` apenas com o identificador oficial atual.

# 8. Riscos evitados

- continuidade de contrato ou schema inconsistente com o produto Asaas-only;
- manutenção de payload público obsoleto;
- ambiguidade administrativa em diagnóstico/exportações;
- permanência de logs/constraints aceitando provider inexistente no sistema;
- reintrodução futura de dependência Stripe por campo/tipo residual.

# 9. Checklist de validação

- [x] `sales` não possui mais colunas Stripe.
- [x] `sale_integration_logs` não aceita mais `provider = 'stripe'`.
- [x] `ticket-lookup` não expõe mais `stripeCheckoutSessionId`.
- [x] `Confirmation` não depende mais de Stripe.
- [x] `TicketLookup` não depende mais de Stripe.
- [x] `TicketCard` não depende mais de Stripe.
- [x] `SalesDiagnostic` não mostra mais Stripe.
- [x] `SalesReport` não usa mais Stripe.
- [x] `types.ts` e `database.ts` não expõem mais Stripe em `sales`.
- [x] não existe mais provider `stripe` em contratos compartilhados do app.
- [x] fluxo Asaas continua íntegro no código local.
- [ ] produção e sandbox continuam seguindo o mesmo fluxo único do projeto — pendente de validação remota após deploy.

# 10. Conclusão final

O projeto foi limpo para operar de forma 100% alinhada ao gateway oficial atual, Asaas.

## Resultado final desta etapa

- não resta dependência funcional de Stripe nas telas auditadas;
- não resta payload público com identificador Stripe;
- não restam colunas Stripe em `sales`;
- não resta contrato compartilhado aceitando provider Stripe;
- não resta constraint ativa aceitando Stripe em logs do sistema atual.

## Observação final

Permanecem apenas referências históricas em migrations/documentos de análise antigos, que não participam do runtime nem do contrato atual do aplicativo.
