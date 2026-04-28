# Análise — Correção da venda manual com taxa mínima Asaas

## 1) Diagnóstico

### Sintoma observado
- Na venda manual em `/admin/vendas`, o operador via no card uma taxa de plataforma acima de R$ 5,00, porém o fluxo bloqueava ao confirmar com mensagem de mínimo do Asaas.

### Onde ocorre
- **Pré-validação frontend (antes de inserir a venda):** `src/components/admin/NewSaleModal.tsx`.
- **Defesa backend ao iniciar checkout da taxa:** `supabase/functions/create-platform-fee-checkout/index.ts`.

### Evidências no código
- O bloqueio no frontend acontece quando `platformFeeAmount < 5`, com toast explícito de mínimo Asaas. 
- O backend repete a mesma defesa com `ASAAS_MIN_CHARGE = 5.0` e retorna `platform_fee_below_minimum`.
- O resolvedor de split não bloqueia venda por ausência de representante e faz redistribuição quando representante/sócio estão indisponíveis.

### Causa raiz
- A divergência visual original vinha da apresentação da taxa no card por `% fixo comercial`, enquanto a validação usa o **motor progressivo por passageiro**.
- Após o ajuste visual anterior, o cálculo mostrado passou a ficar mais próximo da validação, mas ainda havia risco de drift por duplicação local da fórmula no modal.

---

## 2) Verificação da regra de negócio solicitada

### 2.1 A venda manual ainda pode ser bloqueada por taxa mínima?
Sim. E o bloqueio acontece por regra explícita de valor mínimo de cobrança no fluxo da taxa manual:
- Frontend: bloqueio preventivo antes de criar `sales`.
- Backend: bloqueio defensivo antes de criar cobrança no Asaas.

### 2.2 Esse bloqueio vem de quê?
- **Não** vem de ausência de sócio/representante.
- Vem de regra de mínimo de cobrança (R$ 5,00) aplicada no fluxo de taxa da plataforma manual.

### 2.3 Ausência de sócio/representante bloqueia?
- **Representante ausente:** não bloqueia (`missing_sale_representative`, elegibilidade falsa e continuidade do fluxo).
- **Sócio inválido/ausente:** percentual é redistribuído para plataforma em vez de bloquear.

Conclusão: o bloqueio de mínimo é independente de split opcional.

---

## 3) Correção mínima aplicada nesta rodada

### Objetivo da correção
Eliminar qualquer chance de divergência futura entre **taxa exibida no modal** e **taxa usada na validação do submit**.

### Alteração objetiva
- Extraída função local única no `NewSaleModal` para cálculo progressivo por passageiro:
  - `calculateManualPlatformFeeFromSnapshots(...)`.
- Essa função agora é reutilizada em:
  1. preview do card (`manualPlatformFeePreview`);
  2. validação no `handleConfirm`.

### Arquivos alterados
- `src/components/admin/NewSaleModal.tsx`
- `docs/Analises/analise-correcao-venda-manual-taxa-minima-asaas.md`

### Riscos
- Baixo: mudança localizada e sem alteração de contrato backend/DB.
- Não altera checkout público.
- Não cria novo motor financeiro.

---

## 4) Testes / checagens realizadas

1. `npm run -s test -- src/lib/feeCalculator.test.ts`
   - Resultado: **passou** (6 testes).
2. `npx eslint src/components/admin/NewSaleModal.tsx src/components/admin/CalculationSimulationCard.tsx`
   - Resultado: **warnings/erros preexistentes** em `NewSaleModal.tsx` (baseline histórico de lint fora do escopo).

---

## 5) Conclusão final

- O bloqueio por taxa mínima (R$ 5,00) continua existindo e está ancorado em regra explícita do fluxo de cobrança da taxa manual.
- A ausência de sócio/representante **não é causa de bloqueio** no fluxo atual de split.
- A correção aplicada mantém coerência UI ↔ validação no modal com alteração mínima e segura.
