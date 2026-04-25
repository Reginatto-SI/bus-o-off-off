# Análise 4 — Blindagem Snapshot-Driven do Motor Financeiro Asaas

Data: 2026-04-25  
Escopo: remover recálculo financeiro pós-criação e reforçar snapshot como única fonte de verdade.

## 1) Arquivos alterados

- `supabase/functions/verify-payment-status/index.ts`
- `supabase/functions/asaas-webhook/index.ts`
- `supabase/functions/_shared/split-recipients-resolver.ts`
- `supabase/functions/_shared/platform-fee-engine.ts`
- `src/lib/feeCalculator.ts`
- `src/pages/public/Checkout.tsx`

---

## 2) Onde havia recálculo

### Verify
Havia branch de fallback `dynamic_recalculation` quando `split_snapshot_captured_at` não existia, recalculando taxa/distribuição com base em `company.platform_fee_percent`, `sale_passengers` e elegibilidade de representante.

### Webhook
Havia branch análoga de `dynamic_recalculation` em `upsertFinancialSnapshot`, também recalculando taxa/distribuição após confirmação de pagamento.

### Split resolver
O resolvedor ainda aceitava ausência de distribuição explícita e derivava percentuais por conta própria (ex.: representante por fração da taxa), o que permitia fórmula paralela fora do snapshot.

---

## 3) Como o recálculo foi removido

## Verify
- Mantido fluxo snapshot-driven para vendas com `split_snapshot_captured_at`.
- Removido fallback de recálculo financeiro.
- Quando snapshot não existe, verify:
  - registra incidente `financial_snapshot_missing` em trace/log operacional;
  - responde com erro operacional (409), sem recalcular financeiro.

## Webhook
- Mantido uso de `split_snapshot_*` quando snapshot existe.
- Removido fallback de recálculo dinâmico.
- Quando snapshot não existe, webhook:
  - registra `financial_snapshot_missing` em trace/log operacional/integration log;
  - não recalcula taxa, split ou distribuição.

## Split resolver
- `distributionPercentages` passou a ser obrigatório.
- Removido fallback implícito de cálculo local.
- Resolver fica restrito a validar elegibilidade/wallets e montar recebedores com percentuais já calculados.

---

## 4) Como webhook passou a usar snapshot

`upsertFinancialSnapshot` agora segue política fail-closed:
- com snapshot: aplica diretamente `split_snapshot_platform_fee_total`, `split_snapshot_socio_fee_amount`, `split_snapshot_platform_net_amount`;
- sem snapshot: registra erro e não altera financeiro por recálculo.

---

## 5) Como verify passou a usar snapshot

`verify-payment-status` agora:
- aplica snapshot congelado quando presente;
- sem snapshot, cria warning/erro operacional `financial_snapshot_missing` e encerra sem recomputar valores.

---

## 6) Como o split resolver ficou limitado à validação/montagem

- Percentuais financeiros deixaram de ser calculados implicitamente no resolvedor.
- Entrada obrigatória de percentuais externos (`distributionPercentages`) força consumo de valores do motor/snapshot.
- Responsabilidade atual do resolvedor:
  - validar contexto de split habilitado;
  - validar sócio ativo/wallet;
  - validar representante elegível/wallet;
  - montar array de recebedores para payload Asaas.

---

## 7) Como foi tratada venda sem snapshot

Decisão de blindagem: **sem fallback financeiro silencioso**.

- Verify: retorna 409 com `financial_snapshot_missing` e log estruturado.
- Webhook: registra warning/error e não recalcula.

Isso evita divergência temporal e mantém previsibilidade para auditoria.

---

## 8) Validação de arredondamento

No motor (`platform-fee-engine.ts`), a distribuição passou a operar em centavos inteiros internamente:
- conversão para centavos (`toCents`);
- divisão com ajuste do restante para plataforma;
- garantia de conservação: soma dos participantes = taxa total em centavos.

Com isso, evita-se sobra/perda por arredondamento acumulado.

---

## 9) Riscos remanescentes

1. Vendas legadas antigas sem snapshot financeiro permanecem exigindo tratamento operacional (agora explícito por erro, sem correção automática).
2. Frontend mantém cálculo visual de taxa para UX; foi documentado como estimativa, não como fonte oficial financeira.
3. Diagnóstico/relatórios que assumiam recálculo implícito podem precisar ajuste operacional para interpretar `financial_snapshot_missing`.

---

## 10) Testes realizados

- `npm run -s test -- src/lib/feeCalculator.test.ts` ✅
- `npm run -s lint` ⚠️ (falha por baseline preexistente ampla do repositório)
- Inspeção estática por busca de recálculo removido:
  - `rg -n "dynamic_recalculation|computeProgressiveFeeForPassengers|distributePlatformFee" ...` (verify/webhook sem branches de recálculo ativo)

---

## 11) Conclusão

Critérios de sucesso desta blindagem:
- `create-asaas-payment` permanece como ponto oficial de cálculo financeiro.
- `webhook` não recalcula taxa/distribuição.
- `verify-payment-status` não recalcula taxa/distribuição.
- Snapshot congelado virou fonte obrigatória pós-criação.
- Resolver de split ficou limitado a validação/montagem com percentuais vindos do motor.
