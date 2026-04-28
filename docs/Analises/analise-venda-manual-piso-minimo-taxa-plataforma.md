# Análise — Venda manual com piso mínimo obrigatório da taxa da plataforma

## Diagnóstico

### Sintoma
- A venda manual em `/admin/vendas` era bloqueada quando o cálculo progressivo da taxa resultava em valor abaixo de R$ 5,00.

### Onde ocorre
- Frontend (modal): `src/components/admin/NewSaleModal.tsx`.
- Backend (edge function de checkout da taxa): `supabase/functions/create-platform-fee-checkout/index.ts`.

### Evidência
- O modal calculava taxa progressiva e, quando ficava abaixo de R$ 5,00, interrompia o submit com erro.
- A edge function também barrava a criação da cobrança quando `platform_fee_amount < 5.0`.

### Causa provável
- A regra anterior tratava o mínimo de R$ 5,00 como condição de bloqueio.
- A regra correta de produto é tratar R$ 5,00 como **piso aplicado automaticamente**, não bloqueio.

---

## Regra aplicada

- Se taxa progressiva calculada < R$ 5,00 → taxa final = R$ 5,00.
- Se taxa progressiva calculada >= R$ 5,00 → taxa final = valor calculado.
- Não bloquear venda manual por taxa abaixo do mínimo; ajustar automaticamente para o piso.

---

## Arquivos alterados

1. `src/components/admin/NewSaleModal.tsx`
   - Função única de cálculo (`calculateManualPlatformFeeFromSnapshots`) agora aplica piso mínimo obrigatório.
   - Preview e submit usam o mesmo valor final.
   - Removido bloqueio por taxa abaixo de R$ 5,00 no submit do modal.

2. `supabase/functions/create-platform-fee-checkout/index.ts`
   - Backend agora aplica piso mínimo por defesa em profundidade.
   - Se encontrar valor abaixo de R$ 5,00, ajusta para R$ 5,00, persiste em `sales.platform_fee_amount` e registra log `platform_fee_minimum_applied`.
   - A cobrança é criada com o valor final ajustado (sem retornar erro de mínimo nesse cenário).

---

## Testes realizados

1. `npm run -s test -- src/lib/feeCalculator.test.ts`
   - Resultado: passou (6 testes).

2. `npx eslint src/components/admin/NewSaleModal.tsx supabase/functions/create-platform-fee-checkout/index.ts`
   - Resultado: `NewSaleModal.tsx` mantém problemas históricos de lint já existentes no repositório (fora do escopo).

---

## Conclusão

- A venda manual deixa de bloquear indevidamente quando a taxa progressiva fica abaixo de R$ 5,00.
- O sistema passa a aplicar automaticamente o piso mínimo obrigatório em frontend e backend.
- O valor exibido no card, validado no modal e cobrado no backend permanece coerente com a regra final.
- Não houve alteração no checkout público, nem nas regras de sócio/representante.
