# Análise 04 — Implementação Fase 1 (Benefício por Passageiro via CPF)

## 1) O que foi alterado

Nesta fase foi implementado o recorte executável aprovado no plano:

1. **Migration/modelagem mínima**
   - novos campos de snapshot em `sale_passengers`;
   - novo agregado `benefit_total_discount` em `sales`.

2. **Tipos atualizados**
   - contratos Supabase (`src/integrations/supabase/types.ts`);
   - tipos de domínio (`src/types/database.ts`).

3. **Motor determinístico de benefício**
   - cálculo oficial por passageiro em `src/lib/benefitEligibility.ts`;
   - escolha do benefício vencedor pelo critério “mais vantajoso”.

4. **Integração no checkout público**
   - validação oficial na transição **Passageiros → Pagamento**;
   - invalidação do snapshot ao alterar CPF;
   - resumo financeiro com subtotal original, desconto de benefício, subtotal com benefício, taxas e total;
   - persistência do snapshot em `sale_passengers`;
   - persistência de `benefit_total_discount` em `sales`.

5. **Validação pré-cobrança**
   - `create-asaas-payment` agora valida integridade entre:
     - snapshot dos passageiros,
     - taxas oficiais,
     - `sales.gross_amount`,
     - `sales.benefit_total_discount`.

---

## 2) Arquivos alterados

- `supabase/migrations/20261103090000_add_benefit_snapshot_to_sales_and_passengers.sql`
- `src/integrations/supabase/types.ts`
- `src/types/database.ts`
- `src/lib/benefitEligibility.ts`
- `src/pages/public/Checkout.tsx`
- `supabase/functions/create-asaas-payment/index.ts`

---

## 3) Decisões tomadas na implementação

1. **Escolha de benefício**
   - Implementado critério determinístico:
     1) menor `finalPrice`,
     2) maior `discountAmount`,
     3) desempate por `program.id`.

2. **Ordem de cálculo aplicada**
   - `original_price` → benefício → `final_price` por passageiro → taxas sobre preço final médio (lógica oficial já usada no checkout) → total.

3. **Snapshot por passageiro**
   - Persistido no `sale_passengers` no momento de fechamento da compra.

4. **Agregado na venda**
   - Persistido em `sales.benefit_total_discount`.

5. **Integridade pré-cobrança**
   - cobrança é bloqueada quando:
     - o snapshot de passageiros está ausente,
     - o total da venda não fecha com snapshot + taxas,
     - o desconto agregado em `sales` diverge da soma dos passageiros.

---

## 4) Pontos deixados para Fase 2

Conforme escopo definido, **não implementado nesta fase**:

- exibição do benefício no ticket virtual;
- exibição do benefício no PDF;
- replicação do snapshot de benefício para `tickets` no pós-pagamento;
- aplicação em venda manual administrativa;
- sistema avançado de prioridade configurável;
- limite de uso por CPF.

---

## 5) Pontos de atenção/ambiguidade registrados

1. **Volta (ida/volta)**
   - nesta fase, os registros complementares de volta no `sale_passengers` são persistidos com snapshot financeiro zerado para evitar duplicidade no total da cobrança.

2. **Taxas por preço médio**
   - mantida a lógica oficial existente do checkout (taxas sobre preço médio por passageiro), para evitar mudança estrutural ampla nesta fase.

---

## 6) Checklist de testes executados

- [x] `git diff --check` (sem erros de whitespace/diff)
- [x] `npx tsc --noEmit` (compilação TypeScript OK)
- [x] `npm run -s test` (suite executada; há 1 falha pré-existente fora do escopo desta entrega)
- [x] validação manual de fluxo de cálculo no `Checkout.tsx` e pré-cobrança no `create-asaas-payment`

---

## 7) Resultado da fase

A Fase 1 foi entregue com foco mínimo e auditável:

- benefício por passageiro resolvido de forma determinística;
- cálculo e persistência com trilha explícita;
- total agregado em `sales` com desconto total;
- validação de integridade antes da cobrança para reduzir risco de divergência frontend/backend.
