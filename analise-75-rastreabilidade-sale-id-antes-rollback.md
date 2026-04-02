# 1. Resumo do ajuste

Foi aplicado um ajuste mínimo no checkout público para **preservar rastreabilidade do incidente de pagamento antes do rollback**.

O que foi feito:
- adicionado um registro técnico local (sessionStorage + console estruturado) imediatamente antes dos caminhos de rollback/falha de pagamento;
- o registro inclui contexto mínimo: `sale_id`, `company_id`, ambiente, método, timestamp, `error_code`, mensagem e etapa.

Por que foi necessário:
- no fluxo atual, após erro de pagamento, o frontend executa rollback e pode apagar a trilha necessária para correlação posterior;
- com este ajuste, o operador/dev consegue capturar o `sale_id` e o erro no momento da falha real.

---

# 2. Arquivos alterados

1. `src/pages/public/Checkout.tsx`
- inclusão de helper local `preserveCheckoutFailureTrace(...)`;
- chamada desse helper nos dois caminhos de falha do pagamento:
  - erro de resposta da edge (`create-asaas-payment` com retorno de erro);
  - exceção de invocação (rede/edge indisponível).

2. `analise-75-rastreabilidade-sale-id-antes-rollback.md`
- documentação do ajuste, estratégia, validação e riscos residuais.

---

# 3. Estratégia escolhida

## Como o `sale_id` passou a ser preservado
- antes do rollback por falha de pagamento, o frontend grava em `sessionStorage` a chave:
  - `smartbus:last_checkout_payment_failure`
- o payload contém `sale_id` e contexto operacional mínimo.

## Como o contexto do erro passou a ser preservado
- além de `sessionStorage`, o mesmo payload é emitido em `console.error` estruturado (`[checkout] payment_failure_trace_before_rollback`).
- campos preservados:
  - `sale_id`
  - `company_id`
  - `payment_environment`
  - `payment_method`
  - `timestamp`
  - `error_code`
  - `message`
  - `stage`

## Por que essa abordagem foi escolhida
- mínima (sem backend novo, sem tabela nova, sem alterar edge function);
- reversível e local;
- não altera regra de negócio nem sucesso do pagamento;
- entrega rastreabilidade imediata para reprodução controlada.

---

# 4. O que permaneceu igual

- fluxo de criação da venda (`sales` + `sale_passengers`) permanece igual;
- fluxo de pagamento com `create-asaas-payment` permanece igual;
- rollback continua acontecendo nos mesmos cenários;
- UX principal do usuário final não recebeu painel técnico novo.

---

# 5. Como validar

1. Abrir checkout público e preencher dados normalmente.
2. Forçar um cenário de falha de pagamento (ex.: erro retornado pela edge no create payment).
3. Ao ocorrer erro, antes/depois do toast, abrir DevTools e verificar:
   - **Console**: entrada `[checkout] payment_failure_trace_before_rollback` com `sale_id`.
   - **Application > Session Storage**: chave `smartbus:last_checkout_payment_failure`.
4. Copiar o `sale_id` e correlacionar com trilhas operacionais (`sale_logs`, `sale_integration_logs`, edge logs) no período do timestamp gravado.

---

# 6. Riscos residuais

- `sessionStorage` é local à aba/navegador; limpeza da sessão remove o dado.
- se o operador não capturar no momento da reprodução, a trilha local pode se perder.
- não foi alterada a política de persistência em backend nesta etapa (intencionalmente, para manter mudança mínima).
- não foi alterada nenhuma lógica do Asaas/checkout além da observabilidade local pré-rollback.

