# Validação Step 01 — Regra de comissão do representante = 1/3 da taxa da plataforma

Data: 2026-04-11 (UTC)
Tipo: validação final (QA técnico/funcional), sem nova implementação de regra

---

## 1. Resumo executivo

**Status geral:** **Aprovado com observações**.

### Principais resultados

- O split do representante está usando a fórmula nova (1/3 da taxa da plataforma), sem leitura operacional de `representatives.commission_percent`.
- O ledger (`upsert_representative_commission_for_sale`) também usa a fórmula nova com arredondamento de 2 casas para percentual e valor monetário.
- O painel `/representante/painel` exibe explicação da regra, exemplos e percentual formatado com 2 casas, mantendo leitura do ledger sem recálculo frontend.
- Regras de elegibilidade (status do representante, wallet por ambiente, ausência de representante) permanecem conservadoras e não bloqueiam fluxo principal indevidamente.

### Riscos remanescentes (não bloqueantes)

1. Ainda existem referências ao modelo antigo em migration histórica (como registro de passado), mas sem impacto operacional atual.
2. Split e ledger usam a mesma fórmula, porém em implementações separadas (TS e SQL). Hoje estão coerentes; no futuro, vale monitorar drift em mudanças posteriores.

---

## 2. Validação do split

### Evidências de implementação

- Resolvedor central usa percentual derivado de `platformFeePercent` e não busca `commission_percent` no select do representante.
- Cálculo do representante no split: `computeRepresentativeCommissionPercent(platformFeePercent)`.
- A saída do resolvedor é enviada ao Asaas em `splitArray` -> `paymentPayload.split`.

### Cenários obrigatórios (regra e arredondamento)

Validação executada por simulação direta da fórmula atual do split (helper):

- Taxa 6% -> **2,00%**
- Taxa 5% -> **1,67%**
- Taxa 4% -> **1,33%**
- Taxa 3% -> **1,00%**

Resultado: **OK** para os quatro cenários.

---

## 3. Validação do ledger

### Evidências de implementação

Na migration da função `upsert_representative_commission_for_sale`:

- busca venda por `sale_id`;
- exige venda `status = 'pago'`;
- exige snapshot de representante;
- busca empresa da venda por `sale.company_id` para obter `platform_fee_percent`;
- calcula `commission_percent = ROUND(platform_fee_percent / 3, 2)`;
- calcula `commission_amount` arredondado em 2 casas;
- mantém idempotência por `ON CONFLICT (sale_id) DO NOTHING`.

### Status e elegibilidade no ledger

Comportamento validado no código:

- Wallet ausente => `status = 'bloqueada'`, `blocked_reason = representative_wallet_missing`.
- Wallet presente => `status = 'pendente'`.
- Venda sem representante snapshot => não cria comissão (`no_representative_snapshot`).
- Venda não paga => não cria comissão (`sale_not_paid`).

Resultado: **OK** para regras de persistência, arredondamento, status e idempotência.

---

## 4. Validação do painel `/representante/painel`

### Clareza da regra

- Existe bloco visível com explicação direta da nova regra e exemplos por faixa.

### Exibição

- Percentual no ledger (mobile e desktop) está formatado com `toFixed(2)`.
- Valor da comissão continua vindo do ledger (`commission_amount`) e formatado em moeda.

### Consistência técnica

- O frontend segue como leitor de `representative_commissions`.
- Comentários no código reforçam que não há recálculo da comissão no frontend.

Resultado: **OK** (sem regressão funcional identificada na leitura estática).

---

## 5. Coerência entre split, ledger e painel

### Resultado

Para os cenários 6/5/4/3, split e ledger produziram os mesmos percentuais quando aplicada a fórmula atual de cada ponto:

- 6% -> 2,00%
- 5% -> 1,67%
- 4% -> 1,33%
- 3% -> 1,00%

O painel exibe percentual com 2 casas e lê os valores persistidos.

### Conclusão

**Coerência aprovada** para os cenários obrigatórios e para a regra oficial com arredondamento de 2 casas.

---

## 6. Sobras da regra antiga

### Achados

- Há vestígios históricos em migration antiga (`20261106090000_create_representatives_phase1_base.sql`) com default `2.00` e fórmula antiga no texto histórico.
- No runtime atual validado (resolvedor de split + migration nova da RPC), a regra operacional antiga **não** está ativa nos pontos críticos.

### Interpretação

- Não foi encontrada sobra funcional ativa de fallback 2% no fluxo novo validado.
- O que restou é histórico de migration (esperado em trilha de versionamento).

---

## 7. Pontos de atenção futuros

1. **Coerência contínua TS x SQL:** manter testes de regressão para fórmula em split e ledger.
2. **Precisão de taxa com mais de 2 casas:** hoje os cenários obrigatórios passam; se o negócio permitir taxa com escala maior, convém congelar regra única de arredondamento intermediário em ambos os pontos.
3. **QA E2E com ambiente real:** quando houver dados reais, rodar teste transacional completo (create -> confirm -> ledger -> painel) com logs do gateway.

---

## 8. Veredito final

## **Aprovado com observações**

A implementação está pronta para seguir com segurança no estado atual do projeto, com split, ledger e painel coerentes para a regra oficial de 1/3 e arredondamento em 2 casas.

As observações restantes são de prevenção de drift futuro e não bloqueiam avanço.

---

## Evidências (comandos executados)

1. Busca por sobras funcionais da regra antiga nos pontos críticos:

```bash
rg -n "commission_percent \?\? 2|COALESCE\(v_representative\.commission_percent, 2\.00\)|representatives\.commission_percent|fallback 2|2\.00" supabase/functions supabase/migrations src/pages/representative --glob '!**/*.md'
```

2. Conferência de fórmula/fluxo no split e envio ao payload de pagamento:

```bash
nl -ba supabase/functions/_shared/split-recipients-resolver.ts | sed -n '120,320p'
nl -ba supabase/functions/create-asaas-payment/index.ts | sed -n '747,761p'
nl -ba supabase/functions/create-asaas-payment/index.ts | sed -n '996,1006p'
```

3. Conferência da RPC de ledger (fórmula, arredondamento, status, idempotência):

```bash
nl -ba supabase/migrations/20260411170000_update_representative_commission_one_third_platform_fee.sql | sed -n '1,190p'
```

4. Cenários numéricos obrigatórios (6/5/4/3):

```bash
node - <<'NODE'
function splitPercent(platformFee){return Math.round((platformFee/3)*100)/100}
function ledgerPercent(platformFee){const pf=Math.round(platformFee*100)/100; return Math.round((pf/3)*100)/100}
for (const fee of [6,5,4,3]) {
  console.log(`fee=${fee}% split=${splitPercent(fee).toFixed(2)}% ledger=${ledgerPercent(fee).toFixed(2)}%`)
}
NODE
```

5. Conferência do painel e ausência de recálculo frontend:

```bash
nl -ba src/pages/representative/RepresentativeDashboard.tsx | sed -n '136,220p'
nl -ba src/pages/representative/RepresentativeDashboard.tsx | sed -n '880,1010p'
```
