## Diagnóstico

A mensagem "O total da venda está inconsistente com os valores dos passageiros." vem de `supabase/functions/create-asaas-payment/index.ts` (linhas 726/756) — validação de integridade financeira que compara `gross_amount` da venda com a soma `final_price + taxas` dos `sale_passengers`.

Pontos confirmados:
- VKL TURISMO tem `platform_fee_percent = 6` → `hasConfiguredPlatformFee = true` no backend.
- Evento ARRAIAL DO CABO tem `pass_platform_fee_to_customer = true` e nenhum `event_fees`.
- Vendas falhas: 540,80 (R$520+4%) e 721,00 (R$700+3%) — coerentes com motor progressivo.
- Toda venda 409 é deletada pelo frontend (linha 1455-1457 em `Checkout.tsx`), o que **apaga `sale_passengers` por cascade** e impede inspeção forense (também limpa `sale_logs` por cascade — por isso não há log).

Como não conseguimos ver o estado real dos `sale_passengers` no momento da falha (cascata apaga tudo), e os edge logs só mostram os 2 primeiros eventos da execução, precisamos primeiro **preservar o diagnóstico** antes de qualquer outro ajuste.

Hipóteses prováveis (a confirmar com diagnóstico preservado):

1. **Mismatch frontend×backend em compra multi-passageiro com tipos diferentes**: o frontend (`Checkout.tsx` linha 964-970) calcula taxa sobre `avgFinalPrice` × quantidade; o backend calcula taxa progressiva **por passageiro**. Para 1 passageiro o resultado é igual, mas para 2 passageiros em faixas diferentes (ex: 700 + 520) o frontend dá 18,30×2=36,60 e o backend dá 21+20,80=41,80 → **gross_amount errado** → 409 garantido.
2. **`sale.trip_id` aponta para `returnTripId`** quando a venda é ida+volta, fazendo o filtro `trip_id === sale.trip_id` capturar só o passageiro de volta (com `final_price=0`).
3. **`ticket_type_price` salvo como 0** quando o passageiro foi inserido antes de o usuário escolher o pacote (snapshot persistido com `original_price = event.unit_price = 520`, mas `gross_amount` calculado depois com 700).

## Mudanças

### 1. Preservar diagnóstico antes de retornar 409 (backend)
`supabase/functions/create-asaas-payment/index.ts`:
- Antes dos `return 409` em ambas as validações de integridade (linhas 703 e 733), gravar um registro em `sale_integration_logs` (provider=`asaas`, direction=`outgoing_request`, processing_status=`rejected`, incident_code=`financial_integrity_failed`, payload_json com `validationLogContext` completo). Essa tabela tem `ON DELETE SET NULL` no `sale_id`, então o registro **sobrevive** ao rollback do frontend.

### 2. Não deletar a venda no rollback do checkout
`src/pages/public/Checkout.tsx` (linhas 1455-1457):
- Em vez de `DELETE` em `sale_passengers`/`sales`, marcar a venda como `cancelado` com motivo `financial_integrity_failed`. Mantém os `sale_passengers` e `sale_logs` para inspeção. (Mantém `seat_locks` deletado para liberar assentos.)

### 3. Alinhar cálculo frontend ao motor progressivo por passageiro
`src/pages/public/Checkout.tsx` `calculateTotalsFromSnapshots`:
- Substituir `calculateFees(avgFinalPrice, ...) × passengerCount` por: somar `calculateFees(snapshot.final_price, ...)` **por passageiro** (taxa progressiva individual + taxas fixas/percentuais por passageiro). Isso garante que `gross_amount` enviado ao backend seja exatamente o que o backend recalcula em `buildCheckoutFinancialIntegritySnapshot`.

### 4. Garantir que `sale.trip_id` seja sempre o trecho de ida
`src/pages/public/Checkout.tsx` (criação da venda, ~linha 1242):
- Confirmar (e ajustar se necessário) que `trip_id` do INSERT em `sales` é sempre `tripId` (ida) — nunca `returnTripId`. Adicionar comentário explicando a regra de que `sale.trip_id = ida` é contrato com a validação do backend.

### 5. Hardening: taxa zero quando empresa isenta também no frontend
`Checkout.tsx`: a flag `passToCustomer: event.pass_platform_fee_to_customer && hasConfiguredPlatformFee` já existe (linha 968). Confirmar que `hasConfiguredPlatformFee` no Checkout segue a mesma regra do backend (`platform_fee_percent > 0`) — sem esta paridade, vendas de empresas piloto também 409.

### 6. Teste
`src/lib/feeCalculator.test.ts`: adicionar caso multi-passageiro confirmando que soma de `calculateFees` por passageiro é igual ao motor backend (700+520 → 41,80; não 36,60).

## Riscos / Não-objetivo
- Não altera split do Asaas, webhook, snapshot financeiro do backend.
- Não muda regra progressiva (PRD 07 mantido como fonte da verdade).
- Mantém isolamento multi-tenant (`company_id` em todos os logs).
- Após deploy, próxima tentativa da VKL deve concluir cobrança em R$721,00 e gerar log estruturado se ainda falhar.

## Detalhes técnicos
- Tabela `sale_integration_logs` já existe e suporta `incident_code`/`warning_code`/`payload_json` — sem migration.
- Frontend não precisa de novas dependências.
- Diagnóstico preservado fica visível no painel "Diagnóstico de Pagamentos" da empresa.
