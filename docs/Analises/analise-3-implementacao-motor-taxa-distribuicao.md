# Análise 3 — Implementação do Motor de Taxa e Distribuição Financeira

Data: 2026-04-25
Escopo: implementação mínima e segura da regra oficial do PRD 07, com foco em cálculo único e coerência entre split/snapshot/ledger.

## 1) Arquivos alterados

### Backend (Edge Functions / Shared)
- `supabase/functions/_shared/platform-fee-engine.ts` (novo)
- `supabase/functions/_shared/split-recipients-resolver.ts`
- `supabase/functions/create-asaas-payment/index.ts`
- `supabase/functions/verify-payment-status/index.ts`
- `supabase/functions/asaas-webhook/index.ts`

### Banco
- `supabase/migrations/20260425120000_align_representative_commission_with_split_snapshot.sql` (nova migration)

### Frontend
- `src/lib/feeCalculator.ts`
- `src/lib/feeCalculator.test.ts` (novo)
- `src/pages/public/Checkout.tsx`
- `src/components/admin/NewSaleModal.tsx`

### Documentação de compatibilidade
- `docs/PRD/Asaas/07-asaas-motor-taxa-distribuicao-financeira.md` (alias para o PRD 07 oficial)

---

## 2) Regra implementada

## 2.1 Taxa progressiva por passageiro
Implementado motor central no backend (`platform-fee-engine.ts`) com:
- até R$ 100 → 6%
- R$ 100 a R$ 300 → 5%
- R$ 300 a R$ 600 → 4%
- acima de R$ 600 → 3%
- teto de R$ 25 por passageiro

A taxa total da venda é a soma das taxas individuais por passageiro.

## 2.2 Distribuição financeira
Implementado no mesmo helper central:
- com representante elegível → 1/3 plataforma, 1/3 sócio, 1/3 representante
- sem representante elegível → 50% plataforma, 50% sócio

## 2.3 Split Asaas
No `create-asaas-payment`, o split passa a ser calculado com base em:
- taxa total progressiva da venda;
- distribuição oficial por elegibilidade real do representante;
- conversão dos valores distribuídos em percentuais sobre `gross_amount` para payload Asaas.

## 2.4 Snapshot financeiro
No `create-asaas-payment`, o snapshot persistido passa a congelar:
- total da taxa progressiva da venda (`split_snapshot_platform_fee_total`);
- valor do sócio (`split_snapshot_socio_fee_amount`);
- valor da plataforma (`split_snapshot_platform_net_amount`);
- percentuais de snapshot coerentes com o novo motor.

## 2.5 Verify/Webhook
Nos caminhos de recálculo dinâmico (quando snapshot antigo ausente), `verify-payment-status` e `asaas-webhook` passaram a usar o motor progressivo por passageiro + distribuição oficial para atualizar consolidados financeiros (`platform_fee_total`, `socio_fee_amount`, `platform_net_amount`).

## 2.6 Ledger de representante
Nova migration altera `upsert_representative_commission_for_sale` para priorizar snapshot da venda (split efetivo) e manter fallback legado para vendas antigas sem snapshot completo.

---

## 3) Evidências do cálculo

- `src/lib/feeCalculator.test.ts` cobre cenários:
  1. R$ 80 → 6%
  2. R$ 200 → 5%
  3. R$ 500 → 4%
  4. R$ 800 → 3%
  5. R$ 1.000 → teto de R$ 25
- O helper de frontend (`feeCalculator.ts`) aplica faixa e teto para repasse ao cliente no checkout.
- O helper backend (`platform-fee-engine.ts`) aplica a mesma lógica por passageiro usando snapshot de passageiros da venda.

---

## 4) Evidências do split

- `create-asaas-payment` agora resolve elegibilidade do representante e recalcula distribuição oficial antes de montar percentuais de split.
- `split-recipients-resolver` recebeu suporte a `distributionPercentages` para consumir percentuais já resolvidos pelo motor e evitar fórmula paralela no resolvedor.
- `verify-payment-status` e `asaas-webhook` convergem para o mesmo motor ao recalcular sem snapshot congelado.

---

## 5) Riscos remanescentes

1. **Semântica histórica de colunas de snapshot:** nomes antigos (`platform_net_amount`, etc.) foram reaproveitados para manter mudança mínima; recomenda-se evolução de schema para campos explicitamente nomeados por participante em futuro hardening.
2. **Vendas legadas sem snapshot completo:** permanecem em fallback legado no ledger do representante.
3. **Percentual no split Asaas baseado em gross_amount:** requer monitoramento em cenários extremos de arredondamento para garantir soma exata em centavos após conversões de percentual.
4. **Alias de PRD 07:** mantido arquivo de compatibilidade de nomenclatura para evitar quebra por referência de caminho divergente.

---

## 6) Testes realizados

### Automatizados
- `npm run -s test -- src/lib/feeCalculator.test.ts`
  - Resultado: 6 testes passando.

### Validação estática
- `npm run -s lint`
  - Resultado: falha por baseline existente do repositório (múltiplos erros/warnings não introduzidos por esta implementação).

---

## 7) Pontos que ainda precisam de validação manual

1. Venda pública com múltiplos passageiros em diferentes faixas para confirmar total de taxa no valor cobrado.
2. Venda manual com taxa da plataforma >= R$ 5 para confirmar abertura e liquidação da cobrança da taxa.
3. Cenário com representante elegível validando split em 1/3 + ledger correspondente.
4. Cenário sem representante elegível validando redistribuição automática 50/50.
5. Convergência webhook/verify em venda sem snapshot congelado (simulação controlada) para confirmar ausência de divergência.
6. Relatórios administrativos/diagnóstico para confirmar leitura consistente dos valores financeiros após pagamento confirmado.

---

## 8) Conclusão objetiva

- A taxa progressiva está centralizada em helper dedicado no backend e aplicada no frontend para repasse ao cliente.
- A divisão 1/3 e 50/50 foi implementada no motor de distribuição conforme elegibilidade.
- O split do Asaas passou a consumir o novo motor no `create-asaas-payment`.
- O ledger do representante foi alinhado para priorizar snapshot efetivo da venda.
- Existem riscos pendentes de hardening (legado/snapshot semântica/rounding) que exigem validação manual operacional.
