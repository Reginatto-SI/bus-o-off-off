# Correção — bloqueio de venda manual com taxa abaixo do mínimo do Asaas

## 1. Objetivo da correção
Implementar bloqueio preventivo no fluxo de criação manual em `/admin/vendas` para impedir criação de venda quando a taxa da plataforma calculada ficar abaixo de R$ 5,00 (mínimo de cobrança no Asaas), evitando reservas sem monetização válida da plataforma.

## 2. Problema corrigido
Antes desta correção, a venda manual podia ser criada como `reservado` e só depois, na edge function de cobrança da taxa, o caso `< R$ 5,00` era tratado como `waived` (`dispensada`). Isso permitia avanço operacional sem garantia de receita da plataforma para esse cenário.

## 3. Regra aplicada
- No `handleConfirm` de `NewSaleModal`, após calcular `platformFeeAmount` e antes de qualquer insert:
  - se for venda manual;
  - se houver taxa aplicável;
  - e se `platformFeeAmount < 5.00`;
  - então o fluxo é interrompido com toast de erro claro para o usuário.
- Com isso, o sistema não cria:
  - venda em `sales`;
  - tickets;
  - reserva ativa (`reservation_expires_at`);
  - logs da venda.

## 4. Arquivos alterados
- `src/components/admin/NewSaleModal.tsx`
  - adição da constante `ASAAS_MIN_PLATFORM_FEE_AMOUNT = 5`;
  - adição de validação preventiva com mensagem operacional clara;
  - adição de comentários de contexto financeiro/auditável no ponto da validação.

## 5. O que foi mantido sem alteração
- Cálculo da taxa percentual com base em `company.platform_fee_percent`.
- Criação normal da venda manual quando a taxa é válida (>= R$ 5,00).
- Status inicial `reservado` para vendas manuais válidas.
- Fluxo de cobrança separada da taxa para casos válidos.
- Modelagem/status histórico `waived` para compatibilidade com dados antigos.
- Fluxos públicos/checkout público sem alterações.

## 6. Cenários validados
1. **Taxa >= R$ 5,00**
   - Resultado esperado no código: validação não bloqueia e fluxo segue normalmente para inserts.
2. **Taxa < R$ 5,00**
   - Resultado esperado no código: bloqueio antes de inserir qualquer dado, com toast:
   - “Não é possível criar esta venda manual porque a taxa da plataforma calculada ficou abaixo do mínimo permitido para cobrança no Asaas (R$ 5,00). Ajuste o valor da venda antes de continuar.”
3. **Dados históricos com `waived`**
   - Não houve alteração em listagem/detalhe/status renderizado; compatibilidade preservada.

## 7. Riscos residuais
- O bloqueio foi implementado na origem (frontend admin), conforme solicitado. Ainda existe o tratamento `waived` na edge function para compatibilidade/defesa em profundidade de fluxos legados ou chamadas fora do caminho esperado.
- Como não houve refatoração de backend nesta etapa, o controle principal depende do caminho oficial de criação manual no admin (que agora está protegido).

## 8. Observações finais
- Correção mínima, localizada e reversível.
- Sem criação de novo fluxo, sem mudança de arquitetura e sem alterações fora do escopo solicitado.
- A decisão financeira passa a ser determinística e previsível no ponto de origem da venda manual.
