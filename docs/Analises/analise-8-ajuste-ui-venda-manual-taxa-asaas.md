# Análise 8 — Ajuste UI venda manual taxa Asaas

## 1) Arquivos alterados

- `src/pages/admin/Sales.tsx`
- `docs/Analises/analise-8-ajuste-ui-venda-manual-taxa-asaas.md`

## 2) Regras aplicadas no menu de ações (`/admin/vendas`)

Foi ajustada apenas a lógica do menu `...` da listagem de vendas para tornar as ações de taxa mais seguras em vendas manuais, sem alterar backend e sem alterar fluxo de venda online.

### `platform_fee_status = paid`
- Não exibe mais `Pagar Taxa`.
- Exibe `Ver taxa paga`.
- Com `platform_fee_payment_id`: executa consulta/reuso de cobrança existente (sem incentivar nova criação).
- Sem referência local: mostra orientação para consultar diagnóstico/logs.

### `platform_fee_status = pending` com `platform_fee_payment_id`
- Exibe `Consultar taxa`.
- A ação primeiro chama o fallback oficial (`verify-payment-status`) para convergência.
- Se não convergir para pago, reutiliza o fluxo existente de checkout/link da taxa.

### `platform_fee_status = pending` sem `platform_fee_payment_id`
- Exibe `Gerar taxa (R$ ...)`.
- É o único cenário com incentivo direto de geração de cobrança.

### `platform_fee_status = failed`
- Exibe `Reprocessar taxa`.
- Antes de qualquer tentativa, executa consulta (`verify-payment-status`).
- Se existir cobrança vinculada, prioriza consulta/reuso da cobrança antes de nova geração.

## 3) Como a UI evita duplicidade

- Remove o CTA genérico `Pagar Taxa` para todos os casos pendentes/falhos.
- Introduz ação condicional por estado + existência de cobrança (`platform_fee_payment_id`).
- Força consulta/convergência (`verify-payment-status`) antes de reprocessar, reduzindo risco de pagar novamente quando a taxa já foi quitada no Asaas mas ainda não convergiu localmente.
- Mantém reutilização do fluxo existente (`startPlatformFeeCheckout`) para abertura de link/cobrança, evitando criação de padrão novo.

## 4) Testes manuais recomendados

1. **Taxa paga (`paid`) com `platform_fee_payment_id`**
   - Abrir menu `...` e validar que aparece `Ver taxa paga`.
   - Validar que **não** aparece `Pagar Taxa`.

2. **Taxa paga (`paid`) sem `platform_fee_payment_id`**
   - Abrir `Ver taxa paga` e validar mensagem orientando diagnóstico/logs.

3. **Taxa pendente (`pending`) com `platform_fee_payment_id`**
   - Validar ação `Consultar taxa` no menu.
   - Acionar e confirmar consulta prévia (convergência) antes de eventual abertura/reuso de cobrança.

4. **Taxa pendente (`pending`) sem `platform_fee_payment_id`**
   - Validar que o menu mostra somente `Gerar taxa (R$ ...)` como ação de cobrança.

5. **Taxa com falha (`failed`) com `platform_fee_payment_id`**
   - Validar ação `Reprocessar taxa`.
   - Acionar e confirmar que consulta ocorre antes de reuso/geração.

6. **Fluxo fora de escopo (sanidade)**
   - Validar que vendas online e outras telas não sofreram alteração visual/comportamental.
