# Análise — checkout VKL TURISMO com tipo/pacote de passagem

## 1. Sintoma

No checkout público do evento **ARRAIAL DO CABO** da empresa **VKL TURISMO**, a tela exibe o resumo financeiro correto para o pacote selecionado:

- tipo/pacote selecionado: `PACOTE 01 PESSOAS - QUARTO SINGLE`;
- subtotal: **R$ 700,00**;
- taxas: **R$ 21,00**;
- total final: **R$ 721,00**.

Mesmo assim, a criação da cobrança podia ser bloqueada pela Edge Function `create-asaas-payment` com a mensagem:

> O total da venda está inconsistente com os valores dos passageiros.

## 2. Por que a primeira correção não resolveu

A primeira correção separou corretamente subtotal, taxas e total final na validação da Edge Function, mas ainda assumia que `sale_passengers.final_price` já era sempre a fonte financeira correta do passageiro.

A nova evidência mostrou outra origem possível da divergência: em eventos com tipos/pacotes, o preço base do evento (`events.unit_price`, R$ 520,00) pode ser diferente do preço do tipo selecionado (`event_ticket_types.price`, R$ 700,00). Se algum snapshot de fallback ou snapshot legado gravasse `final_price` com o preço base, a validação continuaria lendo R$ 520,00 mesmo quando `ticket_type_price` registrava o pacote escolhido de R$ 700,00.

## 3. Como o preço base do evento é usado

O preço exibido nos cards públicos vem de `event.unit_price`. Portanto, no caso analisado, o valor **R$ 520,00** é o preço base/comercial do evento exibido na vitrine pública.

Esse valor continua válido como fallback para eventos sem tipos/pacotes ou quando não há preço específico configurado, mas não deve sobrescrever o preço escolhido no dropdown do checkout quando existir `ticket_type_price`.

## 4. Como o tipo de passagem selecionado é usado

Os tipos/pacotes vêm da tabela `event_ticket_types`, com preço no campo `price`.

No checkout, ao selecionar um tipo, o estado do passageiro recebe:

- `ticket_type_id`;
- `ticket_type_name`;
- `ticket_type_price`.

O fluxo normal de benefício usa `ticket_type_price` como preço original do passageiro, calcula `final_price` a partir dele e grava o snapshot em `sale_passengers`.

## 5. Valores que chegam na Edge Function

A Edge Function agora carrega, além dos campos de benefício, os campos do tipo selecionado:

- `ticket_type_id`;
- `ticket_type_name`;
- `ticket_type_price`;
- `final_price`;
- `original_price`;
- `discount_amount`;
- `benefit_applied`.

Com isso, a validação consegue diagnosticar se a divergência veio do preço base do evento, do preço do tipo selecionado ou das taxas.

## 6. Onde a divergência acontecia

A divergência possível estava em dois pontos:

1. **Fallbacks do checkout**: alguns fallbacks de snapshot ainda recorriam diretamente a `getSeatPrice(seatId)`, que pode voltar ao preço base do evento. Esses fallbacks agora usam primeiro `passengers[index].ticket_type_price`.
2. **Validação da Edge Function**: a validação financeira somava `final_price`. Agora, quando existe `ticket_type_price` e não há benefício aplicado, o preço efetivo do passageiro é o preço do tipo selecionado. Assim, um `final_price` legado/base não substitui o pacote selecionado.

## 7. Correção aplicada

A correção foi mínima e localizada:

- o checkout mantém o tipo/pacote selecionado como fonte de verdade nos snapshots de fallback;
- a Edge Function usa uma função compartilhada de integridade financeira para resolver o preço efetivo do passageiro;
- quando há `ticket_type_price` e não há benefício aplicado, a validação usa `ticket_type_price`;
- quando há benefício aplicado, a validação preserva `final_price`, pois ele representa o preço já ajustado pelo benefício;
- os logs da validação registram campos seguros para auditoria financeira, incluindo preço base do evento, tipo selecionado, preço do tipo, `final_price`, soma dos passageiros, taxas e total esperado.

## 8. Arquivos alterados

- `src/pages/public/Checkout.tsx`
- `supabase/functions/create-asaas-payment/index.ts`
- `supabase/functions/_shared/checkout-financial-integrity.ts`
- `src/lib/checkoutFinancialIntegrity.test.ts`
- `docs/Analises/analise-problema-checkout-vkl-turismo.md`

## 9. Testes executados

- `npm test -- src/lib/feeCalculator.test.ts src/lib/checkoutFinancialIntegrity.test.ts`
- `npx eslint src/pages/public/Checkout.tsx src/lib/feeCalculator.test.ts src/lib/checkoutFinancialIntegrity.test.ts supabase/functions/create-asaas-payment/index.ts supabase/functions/_shared/checkout-financial-integrity.ts`
- `npm run build`

## 10. Resultado final do cenário VKL TURISMO

O cenário positivo automatizado cobre:

- preço base do evento: **R$ 520,00**;
- tipo selecionado: **R$ 700,00**;
- taxa: **R$ 21,00**;
- total final: **R$ 721,00**.

Resultado esperado da validação: **válido para avançar à criação da cobrança**.

Também foi coberto o cenário negativo em que o total é salvo como se fosse preço base de R$ 520,00 + taxa, apesar do tipo selecionado de R$ 700,00. Nesse caso, a validação bloqueia corretamente.

## 11. Respostas objetivas

1. **O valor R$ 520,00 da página pública é preço base, preço mínimo ou preço real da passagem?**
   Pelo código, ele vem de `events.unit_price` e funciona como preço base/comercial exibido no card público.

2. **Quando o usuário escolhe o tipo de R$ 700,00, esse valor substitui corretamente o preço base?**
   Sim. O fluxo normal já usa `ticket_type_price`; a correção garante também os fallbacks e a validação da Edge Function.

3. **O checkout está salvando R$ 700,00 no passageiro?**
   No fluxo normal, sim: `ticket_type_price` é salvo em `sale_passengers`, e o snapshot de benefício usa esse valor como `original_price`/`final_price` quando não há desconto.

4. **A Edge Function está lendo R$ 700,00 ou R$ 520,00?**
   Agora ela lê ambos quando existirem, mas usa R$ 700,00 como preço efetivo quando `ticket_type_price` está presente e não há benefício aplicado.

5. **A taxa de R$ 21,00 está sendo calculada sobre R$ 700,00 ou sobre outro valor?**
   Após a correção, a validação usa R$ 700,00 para esse pacote, resultando em R$ 21,00 pela regra progressiva atual de 3%.

6. **O `gross_amount` está sendo salvo como R$ 721,00?**
   O checkout calcula `gross_amount` como subtotal pós-benefício + taxas. Para o cenário R$ 700,00 + R$ 21,00, o valor esperado é R$ 721,00.

7. **Existe algum ponto do fluxo que ainda usa o preço base para validar uma compra com tipo diferente?**
   A validação da Edge Function não usa mais o preço base como substituto do tipo selecionado quando `ticket_type_price` existe.

8. **O problema ocorre porque o sistema mistura venda de passagem com serviço/pacote?**
   A modelagem atual trata pacote como tipo de passagem (`event_ticket_types`), não como serviço separado. O problema era a precedência do preço base em fallbacks/validação, não uma regra especial da VKL.

9. **A modelagem atual diferencia corretamente passagem simples, pacote e serviço?**
   Para o checkout público analisado, pacote é modelado como tipo de passagem. Não foi alterada a modelagem de serviços, pois não havia evidência de que o erro estivesse no módulo de serviços.

10. **A correção anterior falhou porque olhou apenas subtotal/taxa e não a origem real do subtotal?**
    Sim. A primeira correção separou subtotal e taxa, mas não blindou a origem do subtotal quando `events.unit_price` divergia de `event_ticket_types.price`.

## 12. Riscos residuais

- Vendas antigas já criadas com snapshot incoerente podem precisar de reprocessamento operacional, pois a correção atua na validação/criação de cobrança daqui para frente.
- Se houver benefício aplicado, a validação continua respeitando `final_price`; nesse caso, `ticket_type_price` é tratado como preço original do tipo, não como preço final obrigatório.
- Não foi alterado webhook, confirmação de pagamento, split ou layout.

## 13. Validação de precedência entre `ticket_type_price`, `final_price` e benefícios

Foi feita uma varredura nos fluxos atuais que preenchem `final_price` no checkout público e venda administrativa. No checkout público, `final_price` nasce de `resolvePassengerBenefitPrice`: sem benefício, ele recebe o mesmo valor original calculado a partir de `ticket_type_price`; com benefício, ele recebe o preço já descontado. Não há evidência no checkout público de cupom, promoção, desconto manual, cortesia parcial ou ajuste administrativo que altere `final_price` sem marcar benefício ou desconto.

A venda manual administrativa também calcula snapshots por benefício, mas não chama a Edge Function `create-asaas-payment`; ela persiste tickets diretamente no fluxo administrativo. Portanto, a regra da Edge Function afeta o checkout público que cria `sale_passengers` e invoca `create-asaas-payment`.

A precedência atual permanece segura porque:

- se existe `ticket_type_price` e não há benefício/desconto, o preço efetivo deve ser o tipo selecionado;
- se existe benefício ou `discount_amount > 0`, a validação preserva `final_price`;
- se não existe `ticket_type_price`, eventos legados continuam usando `final_price`;
- snapshots legados onde `final_price` ficou preso no preço base, mas `ticket_type_price` registra o pacote escolhido, passam a validar pelo pacote selecionado.

Foram adicionados testes explícitos para garantir que `final_price` continue sendo respeitado quando há benefício ou desconto registrado, mesmo com `ticket_type_price` maior.
