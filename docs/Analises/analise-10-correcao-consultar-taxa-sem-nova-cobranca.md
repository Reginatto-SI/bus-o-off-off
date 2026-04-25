# Análise 10 — Correção: “Consultar taxa” sem gerar nova cobrança

## 1) Causa do bug

O fluxo de **Consultar taxa** na tela `/admin/vendas` reaproveitava o mesmo handler de pagamento (`handlePayPlatformFee`), que chama `startPlatformFeeCheckout` no modo padrão e aciona `create-platform-fee-checkout` sem restrição de consulta.

Resultado: em cenários com cobrança anterior em status terminal no Asaas, o backend podia permitir nova geração de cobrança ao entrar no fluxo de “consulta”, produzindo links diferentes para a mesma venda.

## 2) Onde a UI estava criando nova cobrança

- `src/pages/admin/Sales.tsx`
  - `handleConsultPlatformFee` chamava `handlePayPlatformFee` quando havia `platform_fee_payment_id`.
  - `handlePayPlatformFee` usa `startPlatformFeeCheckout` para abrir checkout com possibilidade de criação.

Esse acoplamento entre “consultar” e “gerar/reprocessar” era a origem da duplicidade.

## 3) Arquivos alterados

1. `src/pages/admin/Sales.tsx`
2. `src/lib/platformFeeCheckout.ts`
3. `supabase/functions/create-platform-fee-checkout/index.ts`

## 4) Nova regra de segurança

### Frontend

- Foi criada separação explícita de intenção:
  - **Gerar taxa**: chama checkout com `mode: "create_or_reuse"`.
  - **Consultar taxa**: chama checkout com `mode: "consult_only"` e **nunca** cai em criação.
  - **Reprocessar taxa**:
    1. consulta status (`verify-payment-status`);
    2. tenta reutilizar/reabrir cobrança existente em `consult_only`;
    3. só tenta `create_or_reuse` se não houver cobrança reutilizável.

### Backend (`create-platform-fee-checkout`)

- Novo sinalizador: `consult_only`.
- Quando `consult_only = true`:
  - se não existir `platform_fee_payment_id`, retorna bloqueio (`409`) com `error_code: consult_only_without_reusable_payment`;
  - se não houver cobrança reutilizável após validação, retorna bloqueio (`409`) com o mesmo `error_code`;
  - **não cria nova cobrança em hipótese alguma**;
  - registra log operacional de tentativa bloqueada.

## 5) Como validar que “Consultar taxa” não gera link novo

1. Selecionar venda manual com `platform_fee_payment_id` preenchido e `platform_fee_status = pending`.
2. Clicar **Consultar taxa** 3 vezes.
3. Verificar que:
   - o link aberto é o mesmo (mesmo `payment_id` Asaas);
   - não ocorre criação de novo `payment_id` no Asaas;
   - a venda mantém o mesmo `platform_fee_payment_id` no banco.

## 6) Testes manuais recomendados

### Cenário A — cobrança existente pendente

- Pré-condição: venda com `platform_fee_payment_id` ativo/pendente no Asaas.
- Ação: clicar **Consultar taxa** repetidas vezes.
- Esperado: sempre reabrir a mesma cobrança, sem novos pagamentos.

### Cenário B — sem cobrança vinculada

- Pré-condição: `platform_fee_status = pending` e `platform_fee_payment_id = null`.
- Ação: verificar menu de ações.
- Esperado: aparece apenas **Gerar taxa** (não aparece **Consultar taxa**).

### Cenário C — reprocessar com cobrança terminal

- Pré-condição: venda `platform_fee_status = failed` com cobrança anterior em status terminal (cancelada/expirada etc.).
- Ação: clicar **Reprocessar taxa**.
- Esperado:
  1. consulta status primeiro;
  2. tentativa de reutilização segura;
  3. somente então backend permite nova cobrança quando status terminal for confirmado.

### Cenário D — falha de consulta do Asaas

- Pré-condição: indisponibilidade temporária do Asaas ou erro de validação da cobrança existente.
- Ação: consultar/reprocessar.
- Esperado: criação bloqueada por segurança, com retorno de erro e log operacional.
