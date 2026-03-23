# Análise 26 — Execução da remoção do legado Stripe

## 1. Resumo da execução

Foi executada a remoção controlada do legado Stripe em quatro frentes, sem alterar a arquitetura oficial do pagamento com Asaas:

1. **superfície morta removida do repositório**;
2. **compatibilidade Stripe removida dos payloads públicos e das telas afetadas**;
3. **schema/tipos de `sales` limpos do legado Stripe**;
4. **contrato de observabilidade do runtime alinhado ao modelo atual**.

### O que deixou de existir no repositório
- edge functions legadas `create-checkout-session`, `create-connect-account` e `stripe-webhook`;
- campo público `stripeCheckoutSessionId` no fluxo de consulta/renderização de passagens;
- fallback Stripe nas telas públicas de passagem/confirmacão;
- classificação administrativa de gateway Stripe/Legado Stripe;
- fallback de exportação por `stripe_payment_intent_id` / `stripe_checkout_session_id`;
- colunas `sales.stripe_checkout_session_id`, `sales.stripe_payment_intent_id` e `sales.stripe_transfer_id` no schema alvo via nova migration;
- tipos TypeScript principais expondo `sales.stripe_*`.

---

## 2. Arquivos alterados/removidos

### Removidos
- `supabase/functions/create-checkout-session/index.ts`
- `supabase/functions/create-connect-account/index.ts`
- `supabase/functions/stripe-webhook/index.ts`
- `docs/manual-operacional-smartbus-br/03-conectar-conta-stripe.md`

### Alterados
- `deno.lock`
- `supabase/functions/ticket-lookup/index.ts`
- `supabase/functions/_shared/payment-observability.ts`
- `src/components/public/TicketCard.tsx`
- `src/pages/public/TicketLookup.tsx`
- `src/pages/public/Confirmation.tsx`
- `src/pages/admin/SalesDiagnostic.tsx`
- `src/pages/admin/SalesReport.tsx`
- `src/types/database.ts`
- `src/integrations/supabase/types.ts`
- `src/components/admin/NewSaleModal.tsx`
- `src/components/ui/StatusBadge.tsx`
- `src/pages/admin/Sellers.tsx`
- `src/pages/admin/Company.tsx`
- `supabase/migrations/20260323150000_remove_sales_stripe_legacy_columns.sql`

---

## 3. O que foi limpo no frontend

### Payloads públicos
- `ticket-lookup` deixou de retornar `stripeCheckoutSessionId`.

### Telas públicas
- `TicketCard` deixou de aceitar/usar `stripeCheckoutSessionId`.
- `TicketLookup` deixou de tipar, transportar e usar `stripeCheckoutSessionId` para auto-verificação.
- `Confirmation` deixou de injetar o campo legado Stripe nos dados do ticket virtual.

### Telas administrativas
- `SalesDiagnostic` deixou de classificar Stripe como gateway.
- `SalesDiagnostic` deixou de usar `sales.stripe_*` para leitura de pagamento/linha do tempo/filtros/detalhes.
- `SalesReport` deixou de exportar fallback com IDs Stripe.

### Exportações e diagnósticos
- a exportação agora usa apenas o identificador oficial atual `asaas_payment_id`;
- o diagnóstico administrativo agora opera apenas com `Asaas` e `Manual`.

---

## 4. O que foi limpo no backend

### Edge functions
Foram removidas do repositório:
- `create-checkout-session`
- `create-connect-account`
- `stripe-webhook`

### Observabilidade
- `payment-observability.ts` deixou de aceitar `provider = 'stripe'` no contrato do runtime atual.

### Contratos compartilhados
- o lockfile `deno.lock` foi limpo da dependência Stripe residual.
- `ticket-lookup` foi alinhado ao payload oficial atual, sem campo Stripe.

---

## 5. O que foi limpo no banco/tipos

### Migration criada
- `supabase/migrations/20260323150000_remove_sales_stripe_legacy_columns.sql`

### Colunas removidas do schema alvo
- `sales.stripe_checkout_session_id`
- `sales.stripe_payment_intent_id`
- `sales.stripe_transfer_id`

### Tipos atualizados
- `src/types/database.ts`
- `src/integrations/supabase/types.ts`

Esses contratos deixaram de expor as colunas Stripe de `sales`.

---

## 6. O que não foi removido e por quê

### Constraint histórica em `sale_integration_logs`
O valor `provider = 'stripe'` **não foi removido da migration histórica/constraint do banco nesta etapa**.

#### Motivo
Sem inspeção direta do banco real, não seria seguro assumir que não existem linhas históricas persistidas com `provider = 'stripe'`.

#### Decisão aplicada
- o runtime atual já não aceita `stripe` no contrato de observabilidade;
- a constraint histórica foi preservada para evitar migration destrutiva ou incompatível com dados antigos ainda não auditados no banco real.

### Migrations e documentos históricos antigos
Algumas migrations e documentos históricos ainda mencionam Stripe como parte do passado do projeto.
Eles foram preservados por servirem como trilha histórica/auditável, não como fluxo funcional ativo.

---

## 7. Riscos residuais

1. **Banco real pode ainda conter logs históricos com `provider = 'stripe'`**.
2. **Migrations históricas continuam documentando a origem Stripe do schema**, o que é esperado e não representa runtime ativo.
3. **Documentos técnicos antigos ainda podem citar Stripe como contexto histórico**, mas o manual operacional que tratava Stripe como opção válida foi removido.

No código funcional atual auditado nesta etapa, o Stripe foi erradicado do fluxo ativo/payloads principais/schema alvo.

---

## 8. Checklist de validação executado

### Build
- [x] `npm run build`

### Testes
- [x] `npm test`

### Lint
- [x] `npm run lint` executado
- [ ] sem pendências globais do projeto

> Observação: o lint continua falhando por um volume grande de problemas preexistentes e não relacionados à remoção do Stripe (`no-explicit-any`, `react-hooks/exhaustive-deps`, `prefer-const`, etc.).

### Smoke checks realizados
- [x] busca final em `src` e `supabase/functions` sem referências funcionais a `stripe`, `stripe_`, `stripeCheckoutSessionId`, `create-checkout-session`, `create-connect-account` e `stripe-webhook`;
- [x] build da aplicação concluído com sucesso após a remoção;
- [x] testes automatizados existentes passaram;
- [x] telas públicas afetadas permaneceram compilando (`TicketLookup`, `Confirmation`, `TicketCard`);
- [x] telas administrativas afetadas permaneceram compilando (`SalesDiagnostic`, `SalesReport`).

### Pontos não validados nesta etapa
- [ ] aplicação da migration em banco remoto real;
- [ ] inspeção de dados históricos reais em `sale_integration_logs`;
- [ ] validação visual via screenshot, porque a alteração foi principalmente estrutural e o ambiente desta sessão não forneceu ferramenta dedicada de browser/screenshot.
